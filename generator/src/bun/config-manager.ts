// Configuration management for LMF Generator

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { PATHS } from "electrobun/bun";

import type { AppConfig } from "../shared/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

// Fallback system prompt if file cannot be loaded
const FALLBACK_SYSTEM_PROMPT = `You are an expert LMF (LLM Markup Format) designer.

## Response Behavior

You have TWO modes of response:

**Mode 1: Design Generation** (Use LMF format)
- When the user requests a visual design: "create login page", "design a dashboard", "make a card", "generate a button", etc.
- When the user describes UI elements: "I need a form with email and password fields", "show me a profile card", etc.
- Output: Wrap your LMF code in <lmf> tags like this:
  <lmf>
  #LMF1 400x600 bg:#0f172a
  C w:f h:f p:24
    T s:24 b c:#f1f5f9 "Hello"
  </lmf>
  Do NOT wrap the LMF code in markdown code blocks. The <lmf> tags are sufficient.
  After the <lmf> block, you may add a brief explanation of what you created.

**Mode 2: Conversation** (Use natural language)
- When the user greets you: "hi", "hello", "hey"
- When the user asks questions: "how are you?", "what can you do?", "how does LMF work?"
- When the user discusses ideas: "I want to build an app", "what's the best layout for..."
- Output: Respond conversationally with helpful, friendly text. Do NOT use <lmf> tags.

LMF Format Quick Reference:
- Header: #LMF1 <width>x<height> bg:<color>
- Container: C [options] - vertical flex container
- Row: R [options] - horizontal flex container
- Text: T [options] "content"
- Button: Bt [options] "label"
- Input: In [options] "placeholder"
- Avatar: Av [options] "initials"

Common options: w:f (fill), h:f (fill), p:<number> (padding), g:<number> (gap), bg:<color>, c:<color>, s:<number> (font size), b (bold), r:<number> (radius)

Dark theme colors: bg:#0f172a, surface:#1e293b, accent:#6366f1, text:#f1f5f9, muted:#94a3b8, border:#334155`;

export class ConfigManager {
	private configPath: string;
	private systemPromptPath: string;
	private config: AppConfig;

	constructor() {
		// Use OS-specific app data directory for persistent config
		const appDataDir = PATHS.appData || join(process.env.APPDATA || process.env.HOME || "", "lmf-generator");
		const configDir = join(appDataDir, "config");

		this.configPath = join(configDir, "config.json");
		this.systemPromptPath = join(appDataDir, "system-prompt.md");

		// Ensure config directory exists
		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true });
		}

		this.config = this.loadConfig();
	}

	private loadConfig(): AppConfig {
		if (existsSync(this.configPath)) {
			try {
				const content = readFileSync(this.configPath, "utf-8");
				const loaded = JSON.parse(content);
				return { ...DEFAULT_CONFIG, ...loaded };
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

	getSystemPrompt(): string {
		if (existsSync(this.systemPromptPath)) {
			try {
				return readFileSync(this.systemPromptPath, "utf-8");
			} catch (error) {
				return FALLBACK_SYSTEM_PROMPT;
			}
		}

		// Save fallback system prompt
		this.saveSystemPrompt(FALLBACK_SYSTEM_PROMPT);
		return FALLBACK_SYSTEM_PROMPT;
	}

	saveSystemPrompt(content: string) {
		writeFileSync(this.systemPromptPath, content, "utf-8");
	}

	getWindowState(): { width: number; height: number; x: number; y: number; maximized?: boolean } {
		return { ...this.config.window };
	}

	updateWindowState(state: { width?: number; height?: number; x?: number; y?: number; maximized?: boolean }) {
		this.config.window = { ...this.config.window, ...state };
		this.saveConfig(this.config);
	}
}
