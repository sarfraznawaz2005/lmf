// AI Provider management using Vercel AI SDK

import { generateText, LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { OpenAI } from 'openai';

import type { AppConfig, LMFGenerationRequest } from '../shared/types';

export class AIProvider {
  private config: AppConfig;
  private anthropic: ReturnType<typeof createAnthropic> | null = null;
  private openai: ReturnType<typeof createOpenAI> | null = null;
  private openaiClient: OpenAI | null = null;

  constructor(config: AppConfig) {
    this.config = config;
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize Anthropic
    if (this.config.apiKeys.anthropic) {
      this.anthropic = createAnthropic({
        apiKey: this.config.apiKeys.anthropic,
      });
    }

    // Initialize OpenAI (also used for custom providers)
    const apiKey = this.config.provider === 'custom'
      ? this.config.apiKeys.custom
      : this.config.apiKeys.openai;

    if (apiKey) {
      const openaiConfig: { apiKey: string; baseURL?: string } = {
        apiKey,
      };

      if (this.config.provider === 'custom' && this.config.customProvider.baseURL) {
        openaiConfig.baseURL = this.config.customProvider.baseURL;
      }

      this.openai = createOpenAI(openaiConfig);

      // Also create a direct OpenAI client for custom providers
      if (this.config.provider === 'custom') {
        this.openaiClient = new OpenAI({
          apiKey,
          baseURL: this.config.customProvider.baseURL,
        });
      }
    }
  }

  updateConfig(config: AppConfig) {
    this.config = config;
    this.initializeProviders();
  }

  // Handle messages - generates LMF or conversational response based on user intent
  async generateLMF(request: LMFGenerationRequest): Promise<{ text: string; usage: { totalTokens: number } }> {
    const { prompt, model: modelName, systemPrompt, conversationHistory } = request;

    console.log('[AI] generateLMF called');
    console.log('[AI] Provider:', this.config.provider);
    console.log('[AI] Model:', modelName || 'default');

    // For custom providers, use direct OpenAI client to avoid API endpoint issues
    if (this.config.provider === 'custom' && this.openaiClient) {
      return this.generateWithOpenAIClient(prompt, modelName, systemPrompt, conversationHistory);
    }

    if (!this.anthropic && !this.openai) {
      throw new Error('No AI provider configured. Please add an API key in settings.');
    }

    let model: LanguageModel;

    if (this.config.provider === 'anthropic') {
      if (!this.anthropic) {
        throw new Error('Anthropic API key not configured');
      }
      model = this.anthropic(modelName || 'claude-3-5-sonnet-20241022');
    } else {
      if (!this.openai) {
        throw new Error('OpenAI API key not configured');
      }
      model = this.openai(modelName || 'gpt-4-turbo');
    }

    // Build messages array with conversation history
    const messages = conversationHistory && conversationHistory.length > 0
      ? conversationHistory.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }))
      : [];

    // Add current prompt as user message
    messages.push({ role: 'user', content: prompt });

    console.log('[AI] Messages count:', messages.length);

    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
    });

    console.log('[AI] generateText succeeded');

    // Return serializable response
    return {
      text: String(result.text),
      usage: {
        totalTokens: Number(result.usage?.totalTokens || 0),
      },
    };
  }

  // Use direct OpenAI client for custom providers
  private async generateWithOpenAIClient(
    prompt: string,
    modelName: string | undefined,
    systemPrompt: string | undefined,
    conversationHistory: Array<{ role: string; content: string }> | undefined
  ): Promise<{ text: string; usage: { totalTokens: number } }> {
    console.log('[AI] Using direct OpenAI client for custom provider');

    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    messages.push({ role: 'user', content: prompt });

    console.log('[AI] Sending chat completion request with', messages.length, 'messages');

    const response = await this.openaiClient.chat.completions.create({
      model: modelName || 'gpt-4-turbo',
      messages,
    });

    console.log('[AI] Chat completion received, response type:', typeof response);
    console.log('[AI] Response has choices:', !!response.choices, 'choices length:', response.choices?.length);

    // Defensive checks for response structure
    if (!response) {
      throw new Error('Empty response from OpenAI API');
    }

    if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
      console.error('[AI] Invalid response structure:', JSON.stringify(response, null, 2));
      throw new Error('Invalid response structure from OpenAI API: no choices');
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('[AI] No content in response:', JSON.stringify(response.choices[0], null, 2));
      throw new Error('No content in response from OpenAI API');
    }

    return {
      text: String(content),
      usage: {
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async fetchModels(): Promise<string[]> {
    if (this.config.provider === 'anthropic') {
      // Anthropic models (fixed list as they don't have a models API)
      return [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ];
    } else {
      // OpenAI compatible - fetch from API
      if (!this.openai) {
        return [];
      }

      try {
        const apiKey = this.config.provider === 'custom'
          ? this.config.apiKeys.custom
          : this.config.apiKeys.openai;

        let baseURL = this.config.provider === 'custom'
          ? this.config.customProvider.baseURL
          : 'https://api.openai.com/v1';

        // Normalize base URL - remove trailing slash
        if (baseURL.endsWith('/')) {
          baseURL = baseURL.slice(0, -1);
        }

        const response = await fetch(`${baseURL}/models`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return data.data
            .filter((m: any) => m.id.includes('gpt') || m.id.includes('chat') || m.id.includes('claude'))
            .map((m: any) => m.id)
            .sort();
        }

        return [];
      } catch (error) {
        console.error('Failed to fetch models:', error);
        return [];
      }
    }
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }
}
