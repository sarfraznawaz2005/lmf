// LMF Generator - Main View UI Logic

import { Electroview } from "electrobun/view";

interface RPCResponse {
	success: boolean;
	data?: any;
	error?: string;
}

interface Settings {
	provider: string;
	apiKeys: {
		anthropic: string;
		openai: string;
		custom: string;
	};
	customProvider: {
		baseURL: string;
		models: string[];
	};
	selectedModel: string;
	export: {
		defaultFormat: string;
		pngScale: number;
	};
}

// DOM Elements
const elements = {
	// Main view
	settingsBtn: document.getElementById("settings-btn")! as HTMLButtonElement,
	exportBtn: document.getElementById("export-btn")! as HTMLButtonElement,
	promptInput: document.getElementById("prompt-input")! as HTMLTextAreaElement,
	sendBtn: document.getElementById("send-btn")! as HTMLButtonElement,
	svgPreview: document.getElementById("svg-preview")!,
	lmfCodeView: document.getElementById("lmf-code-view")!,
	emptyState: document.getElementById("empty-state")!,
	svgContainer: document.getElementById("svg-container")!,
	lmfCode: document.getElementById("lmf-code")!,
	previewModeBadge: document.getElementById("preview-mode-badge")!,
	statusText: document.getElementById("status-text")!,
	tokenCount: document.getElementById("token-count")!,
	providerStatus: document.getElementById("provider-status")!,
	connectionBadge: document.getElementById("connection-badge")!,
	chatInputWrapper: document.querySelector(".chat-input-wrapper") as HTMLElement,
	conversationView: document.getElementById("conversation-view")!,
	conversationContent: document.getElementById("conversation-content")!,

	// Error modal
	errorModal: document.getElementById("error-modal")!,
	errorMessageText: document.getElementById("error-message-text")!,
	closeErrorBtn: document.getElementById("close-error")!,
	errorOkBtn: document.getElementById("error-ok-btn")!,

	// Settings modal
	settingsModal: document.getElementById("settings-modal")!,
	closeModalBtn: document.getElementById("close-settings")!,
	modalBody: document.querySelector("#settings-modal .modal-body")!,
	app: document.getElementById("app")!,
};

// State
let state = {
	isSvgView: true,
	currentLmf: "",
	currentSvg: "",
	currentConversation: "",
	settings: null as Settings | null,
	isGenerating: false,
	lastPrompt: "",
};

// Initialize Electroview with RPC
const rpc = Electroview.defineRPC({
	// Agent operations can take several minutes — disable the 1 s default timeout.
	maxRequestTime: Infinity,
	handlers: {
		requests: {},
		messages: {
			connectionStatus: (data: { connected: boolean; provider: string }) => {
				updateConnectionStatus(data);
			},
			testProviderResult: (data: { success: boolean; response?: string; tokens?: number; error?: string }) => {
				handleTestProviderResult(data);
			},
			focusInput: () => {
				console.log('[WebView] Received focusInput message');
				const attemptFocus = () => {
					const input = elements.promptInput as HTMLTextAreaElement;
					if (input) {
						input.focus();
						input.selectionStart = input.selectionEnd = input.value.length;
					}
				};
				
				attemptFocus();
			},
		} as any,
	},
});

const electroview = new Electroview({ rpc }) as any;

// Initialize
async function init() {
	await loadSettings();
	setupEventListeners();
	updateConnectionStatus();
	updateButtonsState(false);

	// Focus chat input on startup - delay to ensure all init is complete
	setTimeout(() => {
		elements.promptInput.focus();
	}, 500);
}

// Load settings from backend
async function loadSettings() {
	try {
		const response = await electroview.rpc.request.getSettings() as RPCResponse;
		if (response?.success) {
			state.settings = response.data;
			updateProviderStatus();
		}
	} catch (error) {
		// Silent fail
	}
}

// Setup event listeners
function setupEventListeners() {
	// Toolbar buttons
	elements.settingsBtn?.addEventListener("click", () => {
		openSettings();
	});
	elements.exportBtn.addEventListener("click", handleExport);

	// Chat input
	elements.sendBtn.addEventListener("click", () => {
		if (state.isGenerating) {
			cancelGeneration();
		} else {
			sendPrompt();
		}
	});
	elements.promptInput.addEventListener("keydown", handleKeydown);
	elements.promptInput.addEventListener("input", autoResize);

	// Settings modal
	elements.closeModalBtn.addEventListener("click", closeSettings);
	elements.settingsModal.querySelector(".modal-overlay")?.addEventListener("click", closeSettings);

	// Error modal
	elements.closeErrorBtn.addEventListener("click", closeErrorModal);
	elements.errorOkBtn.addEventListener("click", closeErrorModal);
	elements.errorModal.querySelector(".modal-overlay")?.addEventListener("click", closeErrorModal);

	// Global keyboard shortcuts
	document.addEventListener("keydown", handleGlobalKeydown);
}

// Global keyboard shortcuts
function handleGlobalKeydown(e: KeyboardEvent) {
	// Ctrl+T - Toggle preview (SVG/LMF code)
	if (e.ctrlKey && e.key === "t") {
		e.preventDefault();
		toggleView();
	}

	// Ctrl+Shift+S - Open settings
	if (e.ctrlKey && e.shiftKey && (e.key === "s" || e.key === "S")) {
		e.preventDefault();
		openSettings();
	}

	// Ctrl+E - Export current
	if (e.ctrlKey && e.key === "e") {
		e.preventDefault();
		handleExport();
	}

	// Escape - Cancel generation / Close modal
	if (e.key === "Escape") {
		if (state.isGenerating) {
			e.preventDefault();
			cancelGeneration();
			return;
		}
		if (!elements.settingsModal.classList.contains("hidden")) {
			closeSettings();
		}
	}
}

// Event handlers
async function sendPrompt() {
	const prompt = elements.promptInput.value.trim();
	if (!prompt || state.isGenerating) return;

	// Save the last prompt
	state.lastPrompt = prompt;

	// Clear input after sending
	elements.promptInput.value = "";
	autoResize();

	// Clear any previous errors
	hideError();

	setLoading(true);
	updateStatus("Generating...");
	console.log('[WebView] Sending prompt:', prompt.substring(0, 50) + '...');

	try {
		console.log('[WebView] Calling RPC generateLmf...');
		// Send current LMF if we have one (for iterative changes)
		const currentLmf = state.currentLmf || "";
		const response = await electroview.rpc.request.generateLmf({
			prompt,
			currentLmf: currentLmf || undefined,
		});
		console.log('[WebView] RPC response received:', response);
		if (response?.success) {
			// Check if this is a conversational response (not a design)
			if (response.data.isConversational) {
				console.log('[WebView] Received conversational response');
				// It's a conversational response - show it in conversation view
				state.currentConversation = response.data.response || "";
				// Keep currentLmf and currentSvg so user can still reference them for changes

				showConversation(state.currentConversation);
				updateStatus("Ready");
				// Disable export/toggle for conversational responses
				updateButtonsState(false);
				updateTokenCount(0);
			} else {
				console.log('[WebView] Received design response, LMF length:', response.data.lmf?.length, 'SVG length:', response.data.svg?.length);
				// It's a design response - render it
				state.currentLmf = response.data.lmf;
				state.currentSvg = response.data.svg;
				state.currentConversation = "";

				// Show SVG preview by default
				state.isSvgView = true;
				renderSvg(state.currentSvg);
				showPreview();

				// Update token count based on LMF code length (~4 chars per token)
				const lmfTokens = state.currentLmf ? Math.ceil(state.currentLmf.length / 4) : 0;
				updateTokenCount(lmfTokens);

				// Enable buttons now that we have content
				updateButtonsState(true);
			}
		} else {
			console.log('[WebView] RPC returned error:', response?.error);
			showError(response?.error || "Generation failed");
		}
	} catch (error) {
		console.error('[WebView] Error in sendPrompt:', error);
		// Check if this was a cancellation
		if (error instanceof Error && error.message?.includes("cancelled")) {
			updateStatus("Generation cancelled");
		} else {
			showError(error instanceof Error ? error.message : "Generation failed");
		}
	} finally {
		setLoading(false);
		updateStatus(state.isGenerating ? "Generating..." : "Ready");
		// Refocus chat input after response
		elements.promptInput.focus();
	}
}

function handleKeydown(e: KeyboardEvent) {
	// Enter - Send prompt (Shift+Enter for new line)
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		if (!state.isGenerating) {
			sendPrompt();
		}
		return;
	}

	// Shift+Enter - New line (default textarea behavior, but explicitly allowed)
	if (e.key === "Enter" && e.shiftKey) {
		// Allow default behavior - new line
		return;
	}

	// Escape - Cancel generation if running
	if (e.key === "Escape" && state.isGenerating) {
		e.preventDefault();
		cancelGeneration();
		return;
	}

	// Up Arrow - Recall last prompt (only when input is empty and cursor is at the end)
	if (e.key === "ArrowUp" && state.lastPrompt && !e.shiftKey && !e.ctrlKey && !e.altKey) {
		const textarea = elements.promptInput;
		// Only recall if input is empty or cursor is at the end
		if (textarea.value.trim() === "" || textarea.selectionStart === textarea.value.length) {
			e.preventDefault();
			textarea.value = state.lastPrompt;
			textarea.setSelectionRange(textarea.value.length, textarea.value.length);
			autoResize();
		}
	}
}

function autoResize() {
	const textarea = elements.promptInput;
	textarea.style.height = "auto";
	textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
}

function toggleView() {
	// If showing conversation, switch to SVG/LMF if we have content
	if (state.currentConversation && !state.currentLmf) {
		// No LMF content to toggle to, stay in conversation view
		return;
	}

	state.isSvgView = !state.isSvgView;

	// Hide conversation view when toggling
	elements.conversationView.classList.remove("active");
	elements.conversationView.classList.add("hidden");

	if (state.isSvgView) {
		elements.svgPreview.classList.remove("hidden");
		elements.svgPreview.classList.add("active");
		elements.lmfCodeView.classList.add("hidden");
		elements.lmfCodeView.classList.remove("active");
		elements.previewModeBadge.textContent = "SVG";

		if (state.currentSvg) {
			elements.svgContainer.innerHTML = state.currentSvg;
		}
	} else {
		elements.svgPreview.classList.add("hidden");
		elements.svgPreview.classList.remove("active");
		elements.lmfCodeView.classList.remove("hidden");
		elements.lmfCodeView.classList.add("active");
		elements.previewModeBadge.textContent = "LMF";

		if (state.currentLmf) {
			elements.lmfCode.textContent = state.currentLmf;
		}
	}
}

function renderSvg(svg: string) {
	elements.svgContainer.innerHTML = svg;
}

function showConversation(text: string) {
	// Hide other views
	elements.emptyState.classList.add("hidden");
	elements.svgPreview.classList.remove("active");
	elements.svgPreview.classList.add("hidden");
	elements.lmfCodeView.classList.add("hidden");

	// Show conversation view
	elements.conversationView.classList.remove("hidden");
	elements.conversationView.classList.add("active");

	// Convert markdown-like text to HTML
	elements.conversationContent.innerHTML = formatConversationText(text);

	// Update badge
	elements.previewModeBadge.textContent = "Message";
}

function formatConversationText(text: string): string {
	// Simple markdown to HTML conversion
	let html = text
		// Escape HTML
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		// Bold
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		// Code blocks
		.replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
		// Inline code
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		// Lists
		.replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>')
		// Paragraphs (simple)
		.replace(/\n\n/g, '</p><p>')
		// Line breaks
		.replace(/\n/g, '<br>');

	// Wrap in paragraph if not already wrapped
	if (!html.startsWith('<')) {
		html = '<p>' + html + '</p>';
	}

	return html;
}

function showPreview() {
	console.log('[WebView] showPreview called, isSvgView:', state.isSvgView);
	elements.emptyState.classList.add("hidden");
	elements.conversationView.classList.remove("active");
	elements.conversationView.classList.add("hidden");

	if (state.isSvgView) {
		console.log('[WebView] Showing SVG preview');
		elements.svgPreview.classList.remove("hidden");
		elements.svgPreview.classList.add("active");
		elements.lmfCodeView.classList.add("hidden");
		elements.lmfCodeView.classList.remove("active");
		elements.previewModeBadge.textContent = "SVG";
	} else {
		console.log('[WebView] Showing LMF code view');
		elements.svgPreview.classList.add("hidden");
		elements.svgPreview.classList.remove("active");
		elements.lmfCodeView.classList.remove("hidden");
		elements.lmfCodeView.classList.add("active");
		elements.previewModeBadge.textContent = "LMF";
	}
}

async function handleExport() {
	if (!state.currentLmf) {
		showError("No content to export");
		return;
	}

	try {
		const response = await electroview.rpc.request.exportFile({
			lmf: state.currentLmf,
			format: state.settings?.export.defaultFormat || "svg",
			scale: state.settings?.export.pngScale || 2,
		});

		if (response?.success) {
			updateStatus(`Exported to ${response.data.path}`);
		} else {
			showError(response?.error || "Export failed");
		}
	} catch (error) {
		showError(error instanceof Error ? error.message : "Export failed");
	}
}

async function openSettings() {
	try {
		const response = await electroview.rpc.request.getSettings();
		if (response?.success) {
			state.settings = response.data;
			renderSettingsModal(response.data);
			elements.settingsModal.classList.remove("hidden");
		}
	} catch (error) {
		showError(error instanceof Error ? error.message : "Failed to load settings");
	}
}

function closeSettings() {
	elements.settingsModal.classList.add("hidden");
}

function renderSettingsModal(settings: Settings) {
	elements.modalBody.innerHTML = `
		<div class="settings-content">
			<section class="settings-section">
				<h3>AI Provider</h3>
				<p class="section-desc">Select AI Provider</p>

				<div class="provider-cards">
					<div class="provider-card ${settings.provider === "anthropic" ? "selected" : ""}" data-provider="anthropic">
						<div class="provider-header">
							<div class="provider-info">
								<div class="provider-avatar anthropic">A</div>
								<span class="provider-name">Anthropic</span>
							</div>
						</div>
						<p class="provider-models">Claude 3.5 Sonnet, Claude 3 Opus</p>
					</div>

					<div class="provider-card ${settings.provider === "openai" ? "selected" : ""}" data-provider="openai">
						<div class="provider-header">
							<div class="provider-info">
								<div class="provider-avatar openai">O</div>
								<span class="provider-name">OpenAI</span>
							</div>
						</div>
						<p class="provider-models">GPT-4, GPT-3.5 Turbo</p>
					</div>

					<div class="provider-card ${settings.provider === "custom" ? "selected" : ""}" data-provider="custom">
						<div class="provider-header">
							<div class="provider-info">
								<div class="provider-avatar custom">C</div>
								<span class="provider-name">Custom</span>
							</div>
						</div>
						<p class="provider-models">OpenAI Compatible</p>
					</div>
				</div>

				<div class="form-group">
					<label>API Key</label>
					<div class="input-with-icon">
						<input type="password" id="api-key-input" value="${settings.apiKeys[settings.provider as keyof typeof settings.apiKeys] || ""}" placeholder="sk-..." />
						<button type="button" id="toggle-api-key" class="icon-btn-sm">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
								<circle cx="12" cy="12" r="3"/>
							</svg>
						</button>
					</div>
				</div>

				<div class="form-group" id="base-url-group" style="display: ${settings.provider === "custom" ? "block" : "none"};">
					<div class="form-label-row">
						<label>Base URL</label>
						<span class="badge-custom">Custom only</span>
					</div>
					<div class="input-with-icon">
						<input type="text" id="base-url-input" value="${settings.customProvider?.baseURL || ""}" placeholder="https://api.custom-provider.com/v1" />
						<svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10"/>
							<line x1="2" y1="12" x2="22" y2="12"/>
							<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
						</svg>
					</div>
				</div>

				<div class="form-group">
					<div class="form-label-row">
						<label>Model</label>
						<button type="button" id="fetch-models-btn" class="btn btn-secondary" style="padding: 4px 12px; font-size: 11px; height: 28px;">Fetch Models</button>
					</div>
					<input type="text" id="model-input-settings" list="models-datalist"
						value="${settings.selectedModel || ""}"
						placeholder="Select or type a model name..."
						style="width: 100%; padding: 8px 12px; background-color: var(--canvas-bg); border: 1px solid var(--border-color); border-radius: var(--radius-lg); color: var(--primary-text); font-size: var(--font-md);" />
					<datalist id="models-datalist">
						${settings.customProvider?.models?.map(m => `<option value="${m}">`).join("") || ""}
					</datalist>
					<p class="form-hint">Type a model name or click "Fetch Models" to get available models</p>
				</div>

				<div class="form-group">
					<button type="button" id="test-provider-btn" class="btn btn-secondary" disabled>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
						</svg>
						Test Provider Connection
					</button>
					<p class="form-hint" id="test-provider-status"></p>
				</div>
			</section>

			<section class="settings-section">
				<h3>System Prompt</h3>
				<p class="section-desc">Customize the AI's behavior for LMF generation</p>

				<div class="textarea-container">
					<textarea id="system-prompt-input" rows="8"></textarea>
				</div>

				<div class="form-actions">
					<button type="button" id="reset-prompt-btn" class="btn btn-secondary">Reset to Default</button>
					<button type="button" id="apply-prompt-btn" class="btn btn-primary">Apply</button>
				</div>
			</section>

			<section class="settings-section">
				<div class="section-header-row">
					<h3>Export Settings</h3>
					<span class="badge badge-success" id="python-status">Python Detected</span>
				</div>

				<div class="form-group">
					<label>Default Export Format</label>
					<div class="select-wrapper">
						<select id="default-format-select">
							<option value="svg" ${settings.export.defaultFormat === "svg" ? "selected" : ""}>SVG</option>
							<option value="html" ${settings.export.defaultFormat === "html" ? "selected" : ""}>HTML</option>
							<option value="png" ${settings.export.defaultFormat === "png" ? "selected" : ""}>PNG</option>
						</select>
					</div>
				</div>

				<div class="form-group">
					<label>PNG Export Scale</label>
					<div class="select-wrapper">
						<select id="png-scale-select">
							<option value="1" ${settings.export.pngScale === 1 ? "selected" : ""}>1x (Standard)</option>
							<option value="2" ${settings.export.pngScale === 2 ? "selected" : ""}>2x (High Quality)</option>
							<option value="3" ${settings.export.pngScale === 3 ? "selected" : ""}>3x (Retina)</option>
						</select>
					</div>
				</div>
			</section>

			<div class="settings-footer">
				<button type="button" id="save-settings-btn" class="btn btn-primary btn-large">Save Changes</button>
			</div>
		</div>
	`;

	setupSettingsEventListeners();

	// Load system prompt
	loadSystemPromptInModal();
}

async function loadSystemPromptInModal() {
	try {
		const response = await electroview.rpc.request.getSystemPrompt();
		const textarea = document.getElementById("system-prompt-input") as HTMLTextAreaElement;
		if (response?.success && textarea) {
			textarea.value = response.data.content;
		}
	} catch (error) {
		// Silent fail
	}
}

function setupSettingsEventListeners() {
	// Provider selection
	document.querySelectorAll(".provider-card").forEach((card) => {
		card.addEventListener("click", () => selectProvider(card as HTMLElement));
	});

	// API key toggle
	const toggleBtn = document.getElementById("toggle-api-key");
	const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
	if (toggleBtn && apiKeyInput) {
		toggleBtn.addEventListener("click", () => {
			const type = apiKeyInput.type === "password" ? "text" : "password";
			apiKeyInput.type = type;
		});
	}

	// Fetch models button
	const fetchModelsBtn = document.getElementById("fetch-models-btn");
	if (fetchModelsBtn) {
		fetchModelsBtn.addEventListener("click", fetchModels);
	}

	// Test provider button
	const testProviderBtn = document.getElementById("test-provider-btn");
	if (testProviderBtn) {
		testProviderBtn.addEventListener("click", testProvider);
	}

	// Base URL visibility
	const selectedProvider = document.querySelector(".provider-card.selected")?.getAttribute("data-provider");
	const baseUrlGroup = document.getElementById("base-url-group");
	if (baseUrlGroup) {
		baseUrlGroup.style.display = selectedProvider === "custom" ? "block" : "none";
	}

	// Save settings
	const saveBtn = document.getElementById("save-settings-btn");
	if (saveBtn) {
		saveBtn.addEventListener("click", saveSettings);
	}

	// Reset prompt
	const resetBtn = document.getElementById("reset-prompt-btn");
	if (resetBtn) {
		resetBtn.addEventListener("click", resetSystemPrompt);
	}

	// Apply prompt
	const applyBtn = document.getElementById("apply-prompt-btn");
	if (applyBtn) {
		applyBtn.addEventListener("click", applySystemPrompt);
	}

	// Input validation for test button
	setupTestButtonValidation();
}

// Setup validation for test provider button
function setupTestButtonValidation() {
	const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
	const baseUrlInput = document.getElementById("base-url-input") as HTMLInputElement;
	const modelInput = document.getElementById("model-input-settings") as HTMLInputElement;
	const testProviderBtn = document.getElementById("test-provider-btn") as HTMLButtonElement;

	function validateTestButton() {
		const selectedProvider = document.querySelector(".provider-card.selected")?.getAttribute("data-provider");
		const apiKey = apiKeyInput?.value || "";
		const baseUrl = baseUrlInput?.value || "";

		let isValid = apiKey.trim().length > 0;

		if (selectedProvider === "custom") {
			isValid = isValid && baseUrl.trim().length > 0;
		}

		testProviderBtn.disabled = !isValid;

		if (isValid) {
			testProviderBtn.title = "Click to test the provider connection";
		} else {
			if (selectedProvider === "custom") {
				testProviderBtn.title = "Enter API key and Base URL to test";
			} else {
				testProviderBtn.title = "Enter API key to test";
			}
		}
	}

	// Listen for input changes
	apiKeyInput?.addEventListener("input", validateTestButton);
	baseUrlInput?.addEventListener("input", validateTestButton);
	modelInput?.addEventListener("input", validateTestButton);

	// Initial validation
	validateTestButton();
}

function selectProvider(card: HTMLElement) {
	document.querySelectorAll(".provider-card").forEach((c) => {
		c.classList.remove("selected");
	});

	card.classList.add("selected");

	// Show/hide Base URL for custom provider
	const provider = card.getAttribute("data-provider");
	const baseUrlGroup = document.getElementById("base-url-group");
	if (baseUrlGroup) {
		baseUrlGroup.style.display = provider === "custom" ? "block" : "none";
	}
}

async function saveSettings() {
	const selectedProvider = document.querySelector(".provider-card.selected")?.getAttribute("data-provider");
	const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
	const baseUrlInput = document.getElementById("base-url-input") as HTMLInputElement;
	const modelInput = document.getElementById("model-input-settings") as HTMLInputElement;
	const systemPromptInput = document.getElementById("system-prompt-input") as HTMLTextAreaElement;
	const formatSelect = document.getElementById("default-format-select") as HTMLSelectElement;
	const scaleSelect = document.getElementById("png-scale-select") as HTMLSelectElement;

	// Normalize base URL - remove trailing slash
	let baseUrl = baseUrlInput?.value || "";
	if (baseUrl.endsWith("/")) {
		baseUrl = baseUrl.slice(0, -1);
	}

	// Preserve existing API keys for other providers
	const existingKeys = state.settings?.apiKeys || { anthropic: "", openai: "", custom: "" };

	const settings = {
		provider: selectedProvider,
		apiKeys: {
			anthropic: selectedProvider === "anthropic" ? (apiKeyInput?.value || existingKeys.anthropic) : existingKeys.anthropic,
			openai: selectedProvider === "openai" ? (apiKeyInput?.value || existingKeys.openai) : existingKeys.openai,
			custom: selectedProvider === "custom" ? (apiKeyInput?.value || existingKeys.custom) : existingKeys.custom,
		},
		customProvider: {
			baseURL: baseUrl,
			models: state.settings?.customProvider?.models || [],
		},
		selectedModel: modelInput?.value || "",
		systemPrompt: systemPromptInput?.value || "",
		export: {
			defaultFormat: formatSelect?.value || "svg",
			pngScale: parseInt(scaleSelect?.value || "2"),
		},
	};

	try {
		const response = await electroview.rpc.request.saveSettings({ settings });
		if (response?.success) {
			state.settings = settings as any;
			updateProviderStatus();


			closeSettings();
			updateStatus("Settings saved");
		} else {
			showError(response?.error || "Failed to save settings");
		}
	} catch (error) {
		showError(error instanceof Error ? error.message : "Failed to save settings");
	}
}

async function resetSystemPrompt() {
	const defaultPrompt = `You are an expert LMF (LLM Markup Format) designer.
Generate clean, semantic LMF layouts based on user requests.
Use the dark theme palette by default:
- Canvas: #0f172a or #1a1a1a
- Surfaces: #1e293b or #2a2a2a
- Primary text: #f1f5f9 or #e8e8e8
- Muted text: #64748b or #888888
- Accent: #6366f1

Always output valid LMF format starting with #LMF1.
Use semantic node types (R, C, T, B, Ch, etc.).
Keep layouts clean and well-structured.`;

	const textarea = document.getElementById("system-prompt-input") as HTMLTextAreaElement;
	if (textarea) {
		textarea.value = defaultPrompt;
	}
}

async function applySystemPrompt() {
	const systemPromptInput = document.getElementById("system-prompt-input") as HTMLTextAreaElement;
	const content = systemPromptInput?.value || "";

	try {
		const response = await electroview.rpc.request.saveSystemPrompt({ content });
		if (response?.success) {
			updateStatus("System prompt applied");
		} else {
			showError(response?.error || "Failed to apply system prompt");
		}
	} catch (error) {
		showError(error instanceof Error ? error.message : "Failed to apply system prompt");
	}
}

function setLoading(loading: boolean) {
	state.isGenerating = loading;
	elements.promptInput.disabled = loading;
	elements.app?.classList.toggle("loading", loading);

	// Change button appearance based on loading state
	if (loading) {
		// Change to stop button
		elements.sendBtn.classList.add("stop-btn");
		elements.sendBtn.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
				<rect x="6" y="6" width="12" height="12" rx="2"/>
			</svg>
		`;
		elements.sendBtn.title = "Stop generation";
	} else {
		// Change back to send button
		elements.sendBtn.classList.remove("stop-btn");
		elements.sendBtn.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="5" y1="12" x2="19" y2="12"/>
				<polyline points="12 5 19 12 12 19"/>
			</svg>
		`;
		elements.sendBtn.title = "Send (Enter)";
	}
}

async function cancelGeneration() {
	console.log('[WebView] Cancelling generation...');
	try {
		await electroview.rpc.request.cancelGeneration();
		updateStatus("Cancelling...");
	} catch (error) {
		console.error('[WebView] Error cancelling generation:', error);
	}
}

function updateStatus(status: string) {
	elements.statusText.textContent = status;
}

function updateTokenCount(tokens: number) {
	elements.tokenCount.textContent = `Tokens: ~${tokens}`;
}

function updateProviderStatus() {
	const apiKey = state.settings?.apiKeys[state.settings?.provider as keyof typeof state.settings.apiKeys];
	const hasApiKey = !!apiKey && apiKey.trim().length > 0;

	if (state.settings?.provider && hasApiKey) {
		elements.providerStatus.textContent = `Provider: ${capitalize(state.settings.provider)}`;
		elements.connectionBadge.textContent = "Connected";
		elements.connectionBadge.classList.add("badge-success");
		enableChatInput(true);
	} else {
		elements.providerStatus.textContent = "Provider: Not configured";
		elements.connectionBadge.textContent = "Disconnected";
		elements.connectionBadge.classList.remove("badge-success");
		enableChatInput(false);
	}
}

function enableChatInput(enabled: boolean) {
	const wrapper = document.querySelector(".chat-input-wrapper") as HTMLElement;
	if (wrapper) {
		wrapper.classList.toggle("disabled", !enabled);
	}
	elements.promptInput.disabled = !enabled;
	elements.sendBtn.disabled = !enabled;

	if (!enabled) {
		elements.promptInput.placeholder = "Configure your API key in Settings to start generating...";
	} else {
		elements.promptInput.placeholder = "Create a modern login page with email and password fields...";
	}
}

function updateButtonsState(_hasGeneratedContent: boolean) {
	const hasLmf = state.currentLmf.length > 0;
	elements.exportBtn.disabled = !hasLmf;
}

function updateConnectionStatus(data?: { connected: boolean; provider: string }) {
	if (data) {
		if (data.connected) {
			elements.providerStatus.textContent = `Provider: ${capitalize(data.provider)}`;
			elements.connectionBadge.textContent = "Connected";
			elements.connectionBadge.classList.add("badge-success");
		} else {
			elements.providerStatus.textContent = "Provider: None";
			elements.connectionBadge.textContent = "Disconnected";
			elements.connectionBadge.classList.remove("badge-success");
		}
	} else {
		updateProviderStatus();
	}
}

function showError(message: string) {
	// Clean up Python traceback messages to extract just the main error
	const cleanMessage = extractMainError(message);
	console.error('Full error:', message); // Log full error to console

	// Show error in modal dialog
	elements.errorMessageText.textContent = cleanMessage;
	elements.errorModal.classList.remove('hidden');
}

function closeErrorModal() {
	elements.errorModal.classList.add('hidden');
	elements.errorMessageText.textContent = '';
}

function extractMainError(errorMessage: string): string {
	// Try to find the last RuntimeError or the last line of the traceback
	const lines = errorMessage.split('\n');

	// Look for RuntimeError or similar error messages
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (line.startsWith('RuntimeError:') || line.startsWith('Error:')) {
			return line.replace('RuntimeError:', '').replace('Error:', '').trim();
		}
	}

	// Look for lines that look like error messages (contain error-related words)
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (line && !line.startsWith('File ') && !line.startsWith('Traceback') && !line.startsWith('  File ') && !line.startsWith('During') && !line.startsWith('^')) {
			// This might be the actual error message
			if (line.includes('not installed') || line.includes('dependency') || line.includes('DLL') || line.includes('failed')) {
				return line;
			}
		}
	}

	// If we can't extract anything meaningful, return the last non-empty line or original
	const lastLine = lines.filter(l => l.trim()).pop();
	return lastLine || errorMessage;
}

function hideError() {
	closeErrorModal();
}

function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

async function fetchModels() {
	const selectedProvider = document.querySelector(".provider-card.selected")?.getAttribute("data-provider");
	const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
	const baseUrlInput = document.getElementById("base-url-input") as HTMLInputElement;
	const modelInput = document.getElementById("model-input-settings") as HTMLInputElement;
	const fetchBtn = document.getElementById("fetch-models-btn") as HTMLButtonElement;

	if (!selectedProvider) {
		showError("Please select a provider first");
		return;
	}

	const apiKey = apiKeyInput?.value;
	if (!apiKey || apiKey.trim().length === 0) {
		showError("Please enter an API key first");
		return;
	}

	// For custom provider, also require base URL
	if (selectedProvider === "custom" && (!baseUrlInput?.value || baseUrlInput.value.trim().length === 0)) {
		showError("Please enter a Base URL for custom provider");
		return;
	}

	// Normalize base URL - remove trailing slash
	let baseUrl = baseUrlInput?.value || "";
	if (baseUrl.endsWith("/")) {
		baseUrl = baseUrl.slice(0, -1);
	}

	// Save settings first to ensure backend has the latest config
	const settings = {
		provider: selectedProvider,
		apiKeys: {
			anthropic: selectedProvider === "anthropic" ? apiKey : "",
			openai: selectedProvider === "openai" ? apiKey : "",
			custom: selectedProvider === "custom" ? apiKey : "",
		},
		customProvider: {
			baseURL: baseUrl,
			models: [],
		},
		selectedModel: modelInput?.value || "",
		export: {
			defaultFormat: state.settings?.export.defaultFormat || "svg",
			pngScale: state.settings?.export.pngScale || 2,
		},
	};

	try {
		// Update backend config first
		await electroview.rpc.request.saveSettings({ settings });

		// Show loading state
		fetchBtn.disabled = true;
		fetchBtn.textContent = "Fetching...";

		// Fetch models from backend
		const response = await electroview.rpc.request.fetchModels();

		if (response?.success && response.data?.models) {
			const models = response.data.models as string[];

			if (models.length === 0) {
				showError("No models found for this provider/API key");
			} else {
				// Open model selection dialog
				openModelSelectionDialog(models, modelInput);
				updateStatus(`Fetched ${models.length} models`);
			}
		} else {
			showError(response?.error || "Failed to fetch models");
		}
	} catch (error) {
		showError(error instanceof Error ? error.message : "Failed to fetch models");
	} finally {
		fetchBtn.disabled = false;
		fetchBtn.textContent = "Fetch Models";
	}
}

// Open searchable model selection dialog
function openModelSelectionDialog(models: string[], modelInput: HTMLInputElement | null) {
	const dialog = document.createElement("div");
	dialog.id = "model-selection-dialog";
	dialog.className = "modal";
	dialog.innerHTML = `
		<div class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 9998;"></div>
		<div class="modal-content-wrapper" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999;">
			<div class="modal-content" style="max-width: 500px; background-color: var(--surface-bg); border-radius: var(--radius-xl); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); overflow: hidden;">
				<div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-md); border-bottom: 1px solid var(--border-color);">
					<h3 style="margin: 0; font-size: var(--font-lg); color: var(--primary-text);">Select Model</h3>
					<button id="close-model-dialog" class="icon-btn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--muted-text); padding: 4px;">&times;</button>
				</div>
				<div class="modal-body" style="padding: 0;">
					<div style="padding: var(--spacing-md); border-bottom: 1px solid var(--border-color);">
						<input type="text" id="model-search-input"
							placeholder="Search models..."
							style="width: 100%; padding: 10px 12px; background-color: var(--canvas-bg); border: 1px solid var(--border-color); border-radius: var(--radius-lg); color: var(--primary-text); font-size: var(--font-md);" />
					</div>
					<div id="model-list" style="max-height: 400px; overflow-y: auto; padding: var(--spacing-md);">
						${models.map(m => `
							<div class="model-item" data-model="${m}" style="padding: 10px 12px; cursor: pointer; border-radius: var(--radius-md); transition: background-color 0.2s; color: var(--primary-text);">
								${m}
							</div>
						`).join("")}
					</div>
					<div style="padding: var(--spacing-md); border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: var(--spacing-sm);">
						<button id="cancel-model-select" class="btn btn-secondary">Cancel</button>
						<button id="confirm-model-select" class="btn btn-primary" disabled>Select Model</button>
					</div>
				</div>
			</div>
		</div>
	`;

	// Add styles for model items
	const style = document.createElement("style");
	style.textContent = `
		.model-item:hover {
			background-color: var(--surface-bg-hover, rgba(255, 255, 255, 0.05));
		}
		.model-item.selected {
			background-color: var(--accent-color, #6366f1);
			color: white;
		}
		.model-item.hidden {
			display: none;
		}
		#model-selection-dialog .modal-content {
			animation: modalSlideIn 0.2s ease-out;
		}
		@keyframes modalSlideIn {
			from {
				opacity: 0;
				transform: translateY(-20px);
			}
			to {
				opacity: 1;
				transform: translateY(0);
			}
		}
	`;
	dialog.querySelector(".modal-content-wrapper")!.appendChild(style);

	document.body.appendChild(dialog);

	let selectedModel: string | null = null;

	// Close dialog function
	const closeDialog = () => {
		dialog.remove();
	};

	// Event listeners
	const searchInput = dialog.querySelector("#model-search-input") as HTMLInputElement;
	const modelList = dialog.querySelector("#model-list") as HTMLElement;
	const confirmBtn = dialog.querySelector("#confirm-model-select") as HTMLButtonElement;
	const cancelBtn = dialog.querySelector("#cancel-model-select") as HTMLButtonElement;
	const closeBtn = dialog.querySelector("#close-model-dialog") as HTMLButtonElement;
	const overlay = dialog.querySelector(".modal-overlay") as HTMLElement;

	// Search functionality
	searchInput.addEventListener("input", (e) => {
		const target = e.target as HTMLInputElement | null;
		if (!target) return;
		const query = target.value.toLowerCase();
		const modelItems = modelList.querySelectorAll(".model-item");

		modelItems.forEach(item => {
			const model = item.getAttribute("data-model") || "";
			if (model.toLowerCase().includes(query)) {
				item.classList.remove("hidden");
			} else {
				item.classList.add("hidden");
			}
		});
	});

	// Model selection
	modelList.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		if (target.classList.contains("model-item")) {
			// Clear previous selection
			modelList.querySelectorAll(".model-item").forEach(item => {
				item.classList.remove("selected");
			});

			// Select clicked item
			target.classList.add("selected");
			selectedModel = target.getAttribute("data-model");
			confirmBtn.disabled = false;
		}
	});

	// Confirm selection
	confirmBtn.addEventListener("click", () => {
		if (selectedModel && modelInput) {
			modelInput.value = selectedModel;
		}
		closeDialog();
	});

	// Cancel
	cancelBtn.addEventListener("click", closeDialog);

	// Close button
	closeBtn.addEventListener("click", closeDialog);

	// Overlay click
	overlay.addEventListener("click", closeDialog);

	// Escape key
	const handleEscape = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			closeDialog();
			document.removeEventListener("keydown", handleEscape);
		}
	};
	document.addEventListener("keydown", handleEscape);

	// Focus search input
	setTimeout(() => searchInput.focus(), 10);
}

// Test provider connection - sends request and waits for testProviderResult message
async function testProvider() {
	const selectedProvider = document.querySelector(".provider-card.selected")?.getAttribute("data-provider");
	const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
	const baseUrlInput = document.getElementById("base-url-input") as HTMLInputElement;
	const modelInput = document.getElementById("model-input-settings") as HTMLInputElement;
	const testBtn = document.getElementById("test-provider-btn") as HTMLButtonElement;
	const statusEl = document.getElementById("test-provider-status");

	if (!selectedProvider) {
		showError("Please select a provider first");
		return;
	}

	const apiKey = apiKeyInput?.value || "";
	if (!apiKey || apiKey.trim().length === 0) {
		showError("Please enter an API key first");
		return;
	}

	// For custom provider, also require base URL
	if (selectedProvider === "custom" && (!baseUrlInput?.value || baseUrlInput.value.trim().length === 0)) {
		showError("Please enter a Base URL for custom provider");
		return;
	}

	// Show loading state
	testBtn.disabled = true;
	testBtn.innerHTML = `
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
			<path d="M21 12a9 9 0 1 1-6.219-8.56"/>
		</svg>
		Testing...
	`;
	if (statusEl) {
		statusEl.textContent = "";
		statusEl.style.color = "";
	}

	// Send the request - the actual result comes via testProviderResult message
	try {
		await electroview.rpc.request.testProvider({
			provider: selectedProvider,
			apiKey: apiKey,
			baseURL: selectedProvider === "custom" ? baseUrlInput.value : undefined,
			model: modelInput?.value || undefined,
		});
		// The actual test result will arrive via testProviderResult message
	} catch (error) {
		// Restore button on error
		if (testBtn) {
			testBtn.disabled = false;
			testBtn.innerHTML = `
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
				</svg>
				Test Provider Connection
			`;
		}
		if (statusEl) {
			statusEl.textContent = `✗ ${error instanceof Error ? error.message : "Request failed"}`;
			statusEl.style.color = "var(--error-color, #ef4444)";
		}
	}
}

// Handle test provider result (called via RPC message from bun)
function handleTestProviderResult(data: { success: boolean; response?: string; tokens?: number; error?: string }) {
	const testBtn = document.getElementById("test-provider-btn") as HTMLButtonElement;
	const statusEl = document.getElementById("test-provider-status");

	// Restore button
	if (testBtn) {
		testBtn.disabled = false;
		testBtn.innerHTML = `
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
			</svg>
			Test Provider Connection
		`;
	}

	// Show result
	if (statusEl) {
		if (data.success) {
			statusEl.textContent = `✓ Connection successful! Response: "${data.response}" (${data.tokens} tokens)`;
			statusEl.style.color = "var(--success-color, #22c55e)";
		} else {
			statusEl.textContent = `✗ ${data.error || "Test failed"}`;
			statusEl.style.color = "var(--error-color, #ef4444)";
		}
	}
}

// Initialize on load
init().catch(console.error);
