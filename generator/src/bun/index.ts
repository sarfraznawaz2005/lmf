// LMF Generator - Main Bun Process

import { BrowserWindow, BrowserView } from "electrobun/bun";
import { dlopen, FFIType, ptr } from "bun:ffi";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

import { ConfigManager } from "./config-manager";
import { AIProvider } from "./ai-provider";
import { Renderer } from "./renderer";
import type { AppConfig } from "../shared/types";

// @ts-ignore - AppConfig is used in type annotations below
type _AppConfigRef = AppConfig;

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

// Initialize managers
const configManager = new ConfigManager();
const renderer = new Renderer();
const aiProvider = new AIProvider(configManager.getConfig());

// Define RPC handlers
export const rpc = BrowserView.defineRPC({
	// Agent operations can take several minutes — disable the 1 s default timeout.
	maxRequestTime: Infinity,
	handlers: {
		messages: {
			// Messages sent from bun to webview are handled via rpc.send.* at runtime
		},
		requests: {
			getSettings: async () => {
				const config = configManager.getConfig();
				const systemPrompt = configManager.getSystemPrompt();
				return {
					success: true,
					data: {
						...config,
						systemPrompt,
					},
				};
			},

			saveSettings: async (request: any) => {
				const { settings } = request;

				// Update config
				if (settings.provider !== undefined) {
					configManager.updateConfig({
						provider: settings.provider,
						apiKeys: settings.apiKeys,
						customProvider: settings.customProvider,
						selectedModel: settings.selectedModel,
						export: settings.export,
					});
				}

				// Update system prompt if provided
				if (settings.systemPrompt !== undefined) {
					configManager.saveSystemPrompt(settings.systemPrompt);
				}

				// Update AI provider config
				aiProvider.updateConfig(configManager.getConfig());

				return {
					success: true,
					data: configManager.getConfig(),
				};
			},

			generateLmf: async (request: any) => {
				console.log('[RPC] generateLmf called with prompt:', request.prompt.substring(0, 50) + '...');
				try {
					const config = configManager.getConfig();
					const systemPrompt = configManager.getSystemPrompt();

					// Check if API key is configured
					const apiKey = config.apiKeys[config.provider];
					if (!apiKey) {
						console.log('[RPC] Error: API key missing');
						return {
							success: false,
							error: `API key missing. Please configure your ${config.provider} API key in settings.`,
						};
					}

					console.log('[RPC] Calling AI provider...');
					const result = await aiProvider.generateLMF({
						prompt: request.prompt,
						model: config.selectedModel,
						systemPrompt,
					currentLmf: request.currentLmf,
					});
					console.log('[RPC] AI provider returned, result text length:', result.text.length);

					// Check if response contains LMF
					const trimmedText = result.text.trim();
					let lmfContent = '';
					let foundLmf = false;

					// Try to extract LMF from <lmf> tags first (preferred)
					const lmfTagMatch = trimmedText.match(/<lmf>([\s\S]*?)<\/lmf>/);
					if (lmfTagMatch) {
						lmfContent = lmfTagMatch[1].trim();
						// Remove any markdown code block wrappers inside
						lmfContent = lmfContent.replace(/```(?:lmf)?\s*\n?([\s\S]*?)\n?\s*```/, '$1').trim();
						foundLmf = lmfContent.startsWith('#LMF1');
						console.log('[RPC] Found LMF in <lmf> tags:', foundLmf);
					}

					// Fallback: Try markdown code blocks containing #LMF1
					if (!foundLmf) {
						const codeBlockMatch = trimmedText.match(/```(?:lmf)?\s*\n?(#LMF1[\s\S]*?)\n?\s*```/);
						if (codeBlockMatch) {
							lmfContent = codeBlockMatch[1].trim();
							foundLmf = true;
							console.log('[RPC] Found LMF in markdown code block');
						}
					}

					// Fallback: Check if text starts with #LMF1 directly
					if (!foundLmf && trimmedText.startsWith('#LMF1')) {
						lmfContent = trimmedText;
						foundLmf = true;
						console.log('[RPC] Found LMF at start of response');
					}

					if (foundLmf && lmfContent) {
						console.log('[RPC] LMF content length:', lmfContent.length);

						// Render to SVG for preview
						let svg = '';
						try {
							console.log('[RPC] Rendering SVG...');
							svg = await renderer.renderToSvg(lmfContent);
							console.log('[RPC] SVG rendered, length:', svg.length);
						} catch (renderError) {
							console.error('[RPC] SVG rendering failed:', renderError);
						}

						const response = {
							success: true,
							data: {
								lmf: String(lmfContent),
								svg: String(svg),
								tokens: Number(result.usage.totalTokens),
								isConversational: false,
								fullResponse: String(trimmedText),
							},
						};
						console.log('[RPC] Returning design response with LMF and SVG');
						return JSON.parse(JSON.stringify(response));
					}

					// No LMF found - return conversational response
					console.log('[RPC] No LMF found, returning conversational response');
					const response = {
						success: true,
						data: {
							lmf: "",
							svg: "",
							tokens: Number(result.usage.totalTokens),
							isConversational: true,
							response: String(result.text),
						},
					};
					return JSON.parse(JSON.stringify(response));
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : "Failed to generate LMF";
					console.error('[RPC] Error in generateLmf:', errorMessage);

					// Check if this was an abort/cancellation
					if (error instanceof Error && (error.name === 'AbortError' || errorMessage.includes('cancelled') || errorMessage.includes('abort'))) {
						return JSON.parse(JSON.stringify({
							success: false,
							error: "Generation was cancelled",
							cancelled: true,
						}));
					}

					// Handle specific error types
					if (errorMessage.includes("API key")) {
						return JSON.parse(JSON.stringify({
							success: false,
							error: String(errorMessage),
						}));
					}

					if (errorMessage.includes("rate limit")) {
						return JSON.parse(JSON.stringify({
							success: false,
							error: "Rate limit exceeded. Please wait a moment and try again.",
						}));
					}

					return JSON.parse(JSON.stringify({
						success: false,
						error: String(errorMessage),
					}));
				}
			},

			renderSvg: async (request: any) => {
				try {
					const svg = await renderer.renderToSvg(request.lmf);
					return {
						success: true,
						data: { svg },
					};
				} catch (error) {
					return {
						success: false,
						error: error instanceof Error ? error.message : "Failed to render SVG",
					};
				}
			},

			exportFile: async (request: any) => {
				try {
					const { lmf, format, scale } = request;

					// Create exports directory
					const exportsDir = join(rootDir, "exports");
					if (!existsSync(exportsDir)) {
						await mkdir(exportsDir, { recursive: true });
					}

					// Generate filename with timestamp
					const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
					let outputPath: string;
					let content: string | undefined;

					if (format === "svg") {
						outputPath = join(exportsDir, `lmf-${timestamp}.svg`);
						content = await renderer.renderToSvg(lmf);
						await writeFile(outputPath, content, "utf-8");
					} else if (format === "html") {
						outputPath = join(exportsDir, `lmf-${timestamp}.html`);
						content = await renderer.renderToHtml(lmf);
						await writeFile(outputPath, content, "utf-8");
					} else if (format === "png") {
						outputPath = await renderer.renderToPng(lmf, scale);
					} else {
						throw new Error(`Unsupported export format: ${format}`);
					}

					return {
						success: true,
						data: { path: outputPath },
					};
				} catch (error) {
					return {
						success: false,
						error: error instanceof Error ? error.message : "Failed to export file",
					};
				}
			},

			openFile: async (request: any) => {
				const { Utils } = await import("electrobun/bun");
				Utils.openPath(request.path);
				return { success: true };
			},

			checkPython: async () => {
				const status = await renderer.checkStatus();
				return {
					success: true,
					data: status,
				};
			},

			fetchModels: async () => {
				const models = await aiProvider.fetchModels();
				return {
					success: true,
					data: { models },
				};
			},

			getSystemPrompt: async () => {
				const content = configManager.getSystemPrompt();
				return {
					success: true,
					data: { content },
				};
			},

			saveSystemPrompt: async (request: any) => {
				configManager.saveSystemPrompt(request.content);
				return {
					success: true,
				};
			},

			cancelGeneration: async () => {
				const cancelled = aiProvider.cancelGeneration();
				return {
					success: true,
					data: { cancelled },
				};
			},

			testProvider: (request: any) => {
				// Fire-and-forget: run the test async (can exceed RPC timeout)
				// and push the result back via a webview message.
				(async () => {
					try {
						const { provider, apiKey, baseURL, model } = request;

						// Validate required fields
						if (!apiKey || apiKey.trim().length === 0) {
							sendTestProviderResult({
								success: false,
								error: "API key is required",
							});
							return;
						}

						if (provider === "custom" && (!baseURL || baseURL.trim().length === 0)) {
							sendTestProviderResult({
								success: false,
								error: "Base URL is required for custom provider",
							});
							return;
						}

						// For custom providers, use createOpenAI directly with the provided baseURL
						if (provider === "custom") {
							const { createOpenAI } = await import("@ai-sdk/openai");
							const { generateText } = await import("ai");

							const normalizedBaseURL = baseURL?.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
							const testModel = model || "gpt-4-turbo";

							const openai = createOpenAI({
								apiKey: apiKey,
								baseURL: normalizedBaseURL,
							});

							const result = await generateText({
								model: openai(testModel),
								messages: [
									{ role: "system", content: "You are a test endpoint. Respond briefly." },
									{ role: "user", content: "Respond with just the word 'OK' to confirm connection." },
								],
								
								abortSignal: AbortSignal.timeout(30000), // 30 second timeout
							});

							if (!result.text || result.text.trim().length === 0) {
								throw new Error("No completion response received");
							}

							sendTestProviderResult({
								success: true,
								response: result.text.trim().substring(0, 100),
								tokens: result.usage?.totalTokens || 0,
							});
							return;
						}

						// For Anthropic, use the SDK directly
						if (provider === "anthropic") {
							const { createAnthropic } = await import("@ai-sdk/anthropic");
							const { generateText } = await import("ai");

							const anthropic = createAnthropic({
								apiKey: apiKey,
							});

							const result = await generateText({
								model: anthropic(model || "claude-3-5-sonnet-20241022"),
								messages: [
									{ role: "system", content: "You are a test endpoint. Respond briefly." },
									{ role: "user", content: "Respond with just the word 'OK' to confirm connection." },
								],
								
								abortSignal: AbortSignal.timeout(30000),
							});

							if (!result.text || result.text.trim().length === 0) {
								throw new Error("No completion response received");
							}

							sendTestProviderResult({
								success: true,
								response: result.text.trim().substring(0, 100),
								tokens: result.usage?.totalTokens || 0,
							});
							return;
						}

						// For OpenAI, use the SDK directly
						if (provider === "openai") {
							const { createOpenAI } = await import("@ai-sdk/openai");
							const { generateText } = await import("ai");

							const openai = createOpenAI({
								apiKey: apiKey,
							});

							const result = await generateText({
								model: openai(model || "gpt-4-turbo"),
								messages: [
									{ role: "system", content: "You are a test endpoint. Respond briefly." },
									{ role: "user", content: "Respond with just the word 'OK' to confirm connection." },
								],
								
								abortSignal: AbortSignal.timeout(30000),
							});

							if (!result.text || result.text.trim().length === 0) {
								throw new Error("No completion response received");
							}

							sendTestProviderResult({
								success: true,
								response: result.text.trim().substring(0, 100),
								tokens: result.usage?.totalTokens || 0,
							});
							return;
						}

						sendTestProviderResult({
							success: false,
							error: "Unknown provider",
						});
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "Unknown error";

						// Handle specific error types
						if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
							sendTestProviderResult({
								success: false,
								error: "Invalid API key. Please check your credentials.",
							});
							return;
						}
						if (errorMessage.includes("403")) {
							sendTestProviderResult({
								success: false,
								error: "Access denied. Check API key permissions.",
							});
							return;
						}
						if (errorMessage.includes("404")) {
							sendTestProviderResult({
								success: false,
								error: "Endpoint not found. Check Base URL.",
							});
							return;
						}
						if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
							sendTestProviderResult({
								success: false,
								error: "Rate limit exceeded. Try again later.",
							});
							return;
						}
						if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
							sendTestProviderResult({
								success: false,
								error: "Network error. Check your internet connection.",
							});
							return;
						}

						sendTestProviderResult({
							success: false,
							error: errorMessage,
						});
					}
				})();

				// Return success immediately - the actual result will be sent via testProviderResult message
				return {
					success: true,
					data: { message: "Testing provider connection. Check results below." },
				};
			},
		},
	},
});

// Set titlebar icon via Win32 API (Electrobun doesn't expose a public API for this)
const iconPath = join(dirname(process.argv0), "..", "Resources", "app.ico");

function setWindowTitlebarIcon(title: string, iconFilePath: string) {
	try {
		const user32 = dlopen("user32.dll", {
			FindWindowW:  { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
			SendMessageW: { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr], returns: FFIType.ptr },
			LoadImageW:   { args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32], returns: FFIType.ptr },
		});

		const toWide = (s: string) => { const b = Buffer.alloc((s.length + 1) * 2); b.write(s, 0, "utf16le"); return b; };
		const WM_SETICON = 0x0080;
		const LR_LOADFROMFILE = 0x0010;
		const LR_DEFAULTSIZE  = 0x0040;
		const IMAGE_ICON = 1;

		const pathBuf  = toWide(iconFilePath);
		const titleBuf = toWide(title);

		const hIcon = user32.symbols.LoadImageW(null, ptr(pathBuf), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE);
		const hwnd  = user32.symbols.FindWindowW(null, ptr(titleBuf));

		if (hwnd && hIcon) {
			user32.symbols.SendMessageW(hwnd, WM_SETICON, 1, hIcon); // ICON_BIG
			user32.symbols.SendMessageW(hwnd, WM_SETICON, 0, hIcon); // ICON_SMALL
		}
	} catch (e) {
		// Ignore icon setting errors
	}
}

// Create main window - no icon option, we set it via Win32 API
// Always start with fixed size, then maximize on dom-ready
const mainWindow = new BrowserWindow({
	title: "LMF Generator",
	url: "views://mainview/index.html",
	frame: {
		width: 1280,
		height: 800,
		x: 100,
		y: 100,
	},
	sandbox: false,
	rpc,
});

// Helper function to safely send test provider results
function sendTestProviderResult(result: { success: boolean; response?: string; tokens?: number; error?: string }) {
	try {
		if ((mainWindow.webview.rpc as any).send?.testProviderResult) {
			(mainWindow.webview.rpc as any).send.testProviderResult(result);
		} else {
			// Retry after a short delay
			setTimeout(() => {
				if ((mainWindow.webview.rpc as any).send?.testProviderResult) {
					(mainWindow.webview.rpc as any).send.testProviderResult(result);
				}
			}, 100);
		}
	} catch (sendErr) {
		// Ignore send errors
	}
}

// Always maximize and show window when DOM is ready, then set icon and send connection status
mainWindow.webview.on("dom-ready", () => {
	mainWindow.maximize();
	mainWindow.show();
	setWindowTitlebarIcon("LMF Generator", iconPath);

	// Bring window to foreground and focus it at OS level
	mainWindow.focus();

	// Send initial connection status to webview
	const config = configManager.getConfig();
	const isConnected = !!(config.apiKeys.anthropic || config.apiKeys.openai || config.apiKeys.custom);

	(mainWindow.webview.rpc as any).send.connectionStatus({
		connected: isConnected,
		provider: config.provider,
	});

	// Background check: verify cairosvg is installed and auto-install if needed
	setTimeout(async () => {
		console.log('[Bun] Background check: verifying Python and cairosvg...');
		const status = await renderer.checkStatus();

		if (!status.available) {
			console.log('[Bun] Python not available, skipping cairosvg check');
			return;
		}

		if (status.cairosvgAvailable) {
			console.log('[Bun] cairosvg is already installed');
		} else {
			console.log('[Bun] cairosvg not found, attempting auto-install...');
			const result = await renderer.installCairoSVG();
			if (result.success) {
				console.log('[Bun] cairosvg auto-install succeeded:', result.message);
			} else {
				console.error('[Bun] cairosvg auto-install failed:', result.message);
			}
		}
	}, 2000); // Run 2 seconds after window is ready

});
