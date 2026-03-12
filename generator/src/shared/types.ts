// Shared TypeScript types for LMF Generator

export interface AppConfig {
  provider: 'anthropic' | 'openai' | 'custom';
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
    defaultFormat: 'svg' | 'png' | 'html';
    pngScale: number;
  };
  window: {
    width: number;
    height: number;
    x: number;
    y: number;
    maximized?: boolean;
  };
}

export interface LMFGenerationRequest {
  prompt: string;
  model: string;
  systemPrompt: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface LMFGenerationResponse {
  lmf: string;
  svg: string;
  tokens: number;
}

export interface RenderRequest {
  lmf: string;
  format: 'svg' | 'png' | 'html';
  scale?: number;
}

export interface RenderResponse {
  content: string;
  path?: string;
}

export interface ExportRequest {
  lmf: string;
  format: string;
  scale: number;
}

export interface ExportResponse {
  path: string;
}

export interface SettingsRequest {
  settings: Partial<AppConfig> & {
    systemPrompt?: string;
  };
}

export interface SystemPromptResponse {
  content: string;
}

export interface PythonStatus {
  available: boolean;
  version?: string;
  cairosvgAvailable: boolean;
}

// RPC Message types
export interface RPCMessage {
  type: string;
  payload?: any;
}

export interface RPCResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// RPC Request/Response types for type safety
export interface LMFGeneratorRPC {
  requests: {
    getSettings: () => RPCResponse;
    saveSettings: (params: { settings: Partial<AppConfig> & { systemPrompt?: string } }) => RPCResponse;
    generateLmf: (params: { prompt: string; conversationHistory?: Array<{ role: "user" | "assistant"; content: string }> }) => RPCResponse;
    renderSvg: (params: { lmf: string }) => RPCResponse;
    exportFile: (params: { lmf: string; format: string; scale: number }) => RPCResponse;
    checkPython: () => RPCResponse;
    fetchModels: () => RPCResponse;
    getSystemPrompt: () => RPCResponse;
    saveSystemPrompt: (params: { content: string }) => RPCResponse;
    testProvider: (params: { provider: string; apiKey: string; baseURL?: string; model?: string }) => RPCResponse;
  };
  messages: {
    connectionStatus: (data: { connected: boolean; provider: string }) => void;
    testProviderResult: (data: { success: boolean; response?: string; tokens?: number; error?: string }) => void;
  };
}
