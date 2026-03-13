// Configuration management for LMF Generator

import { join, dirname } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { PATHS } from "electrobun/bun";
import { fileURLToPath } from "url";

import type { AppConfig } from "../shared/types";

const DEFAULT_CONFIG: AppConfig = {
	provider: "anthropic",
	apiKeys: {
		anthropic: "",
		openai: "",
		custom: "",
	},
	customProvider: {
		baseURL: "",
		models: [],
	},
	selectedModel: "",
	export: {
		defaultFormat: "svg",
		pngScale: 2,
	},
	window: {
		width: 1280,
		height: 800,
		x: 100,
		y: 100,
		maximized: true,
	},
};

// Get path to bundled system-prompt.md (in Resources/app/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_SYSTEM_PROMPT_PATH = join(__dirname, "..", "system-prompt.md");

// Fallback system prompt if bundled file cannot be loaded (edge case)
const FALLBACK_SYSTEM_PROMPT = `You are an expert LMF (LLM Markup Format) designer.

## Response Behavior

When the user requests a visual design, output LMF code wrapped in <lmf> tags.
For conversational messages, respond naturally without LMF tags.

LMF Format Quick Reference:
- Header: #LMF1 <width>x<height> bg:<color>
- Container: C [options] - vertical flex container
- Row: R [options] - horizontal flex container
- Text: T [options] "content"
- Button: Bt [options] "label"
- Input: In [options] "placeholder"
- Common options: w:f (fill), h:f (fill), p:<number> (padding), g:<number> (gap), bg:<color>, c:<color>, s:<number> (font size), b (bold), r:<number> (radius)
- Dark theme colors: bg:#0f172a, surface:#1e293b, accent:#6366f1, text:#f1f5f9, muted:#94a3b8, border:#334155`;

export class ConfigManager {
	private configPath: string;
	private systemPromptPath: string;
	private config: AppConfig;
	private cachedSystemPrompt: string | null = null;

	constructor() {
		// Use OS-specific app data directory for persistent config
		const appDataDir = (PATHS as any).appData || join(process.env.APPDATA || process.env.HOME || "", "lmf-generator");
		const configDir = join(appDataDir, "config");

		this.configPath = join(configDir, "config.json");
		this.systemPromptPath = join(appDataDir, "system-prompt.md");

		// Ensure config directory exists
		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true });
		}

		this.config = this.loadConfig();
		// Load system prompt once at startup
		this.cachedSystemPrompt = this.loadSystemPrompt();
	}

	private loadConfig(): AppConfig {
		if (existsSync(this.configPath)) {
			try {
				const content = readFileSync(this.configPath, "utf-8");
				const loaded = JSON.parse(content);
				const merged = { ...DEFAULT_CONFIG, ...loaded };
				// Clamp removed formats to svg
				if (!["svg", "png"].includes(merged.export?.defaultFormat)) {
					merged.export = { ...merged.export, defaultFormat: "svg" };
				}
				return merged;
			} catch (error) {
				return { ...DEFAULT_CONFIG };
			}
		}

		// Save default config
		this.saveConfig(DEFAULT_CONFIG);
		return { ...DEFAULT_CONFIG };
	}

	private saveConfig(config: AppConfig) {
		try {
			writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8");
		} catch (error) {
			throw error;
		}
	}

	getConfig(): AppConfig {
		return { ...this.config };
	}

	updateConfig(updates: Partial<AppConfig>): AppConfig {
		this.config = { ...this.config, ...updates };
		this.saveConfig(this.config);
		return { ...this.config };
	}

	private loadSystemPrompt(): string {
		// If system-prompt.md already exists in OS config path, use it
		if (existsSync(this.systemPromptPath)) {
			try {
				return readFileSync(this.systemPromptPath, "utf-8");
			} catch (error) {
				// Fall through to try bundled file
			}
		}

		// Try to load from bundled file and copy to OS config path
		if (existsSync(BUNDLED_SYSTEM_PROMPT_PATH)) {
			try {
				const bundledPrompt = readFileSync(BUNDLED_SYSTEM_PROMPT_PATH, "utf-8");
				// Save bundled prompt to OS config path for future use
				this.saveSystemPrompt(bundledPrompt);
				console.log('[ConfigManager] Copied bundled system-prompt.md to config directory');
				return bundledPrompt;
			} catch (error) {
				console.error('[ConfigManager] Failed to read bundled system-prompt.md:', error);
			}
		}

		// Fallback: use minimal default and save it
		console.warn('[ConfigManager] Using fallback system prompt');
		this.saveSystemPrompt(FALLBACK_SYSTEM_PROMPT);
		return FALLBACK_SYSTEM_PROMPT;
	}

	getSystemPrompt(): string {
		return this.cachedSystemPrompt!;
	}

	saveSystemPrompt(content: string) {
		writeFileSync(this.systemPromptPath, content, "utf-8");
		this.cachedSystemPrompt = content;
	}

	getWindowState(): { width: number; height: number; x: number; y: number; maximized?: boolean } {
		return { ...this.config.window };
	}

	updateWindowState(state: { width?: number; height?: number; x?: number; y?: number; maximized?: boolean }) {
		this.config.window = { ...this.config.window, ...state };
		this.saveConfig(this.config);
	}
}
