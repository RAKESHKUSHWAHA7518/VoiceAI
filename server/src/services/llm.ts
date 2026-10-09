import axios from 'axios';
import { LLMStreamChunk } from '../types';
import { guardrailsEngine } from './guardrails';

export class OpenAILLM {
  private client: any;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private systemPrompt: string;

  constructor(
    apiKey: string,
    model: string = 'gpt-4o-mini',
    temperature: number = 0.3,
    maxTokens: number = 512,
    baseUrl?: string
  ) {
    this.client = axios.create({
      baseURL: baseUrl || 'https://api.openai.com/v1',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.systemPrompt = 'You are a helpful voice assistant. Speak naturally in short, conversational sentences.';
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  setModel(model: string): void {
    this.model = model;
  }

  setTemperature(temp: number): void {
    this.temperature = temp;
  }

  private buildMessages(history: any[], userText: string): any[] {
    const inspection = guardrailsEngine.inspect(userText);
    const sanitizedUserText = inspection.sanitizedText;

    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...history.map(t => ({
        role: t.role === 'user' ? 'user' : 'assistant',
        content: t.user_transcript || t.content,
      })),
      { role: 'user', content: sanitizedUserText },
    ];
    return messages;
  }

  async *streamChat(
    history: any[],
    userText: string,
    tools?: any[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): AsyncGenerator<{
    content?: string;
    isToolCall: boolean;
    toolCallId?: string;
    toolName?: string;
    toolArgs?: string;
    toolArgsComplete: boolean;
    finishReason?: string;
  }> {
    const messages = this.buildMessages(history, userText);
    
    const requestBody: any = {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      requestBody.tool_choice = toolChoice || 'auto';
    }

    const response = await this.client.post('/chat/completions', requestBody, {
      responseType: 'stream',
    });

    let toolCallBuffer: Record<number, any> = {};
    let emittedToolCalls = new Set<number>();

    for await (const chunk of response.data) {
      const lines = chunk.toString().split('\n').filter((line: string) => line.startsWith('data: '));
      
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          
          // Handle tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index;
              if (!toolCallBuffer[index]) {
                toolCallBuffer[index] = {
                  id: tc.id,
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              if (tc.function?.name) {
                toolCallBuffer[index].function.name += tc.function.name;
              }
              if (tc.function?.arguments) {
                toolCallBuffer[index].function.arguments += tc.function.arguments;
              }

              // Check if we can emit this tool call
              const tcData = toolCallBuffer[index];
              if (!emittedToolCalls.has(index) && 
                  tcData.function.name && 
                  this.isValidJSON(tcData.function.arguments)) {
                emittedToolCalls.add(index);
                yield {
                  content: '',
                  isToolCall: true,
                  toolCallId: tcData.id,
                  toolName: tcData.function.name,
                  toolArgs: tcData.function.arguments,
                  toolArgsComplete: true,
                };
              }
            }
          }

          // Handle content tokens
          if (delta.content) {
            yield {
              content: delta.content,
              isToolCall: false,
              toolArgsComplete: false,
            };
          }

          // Check for finish
          if (choice.finish_reason) {
            // Emit any remaining tool calls
            for (const [index, tcData] of Object.entries(toolCallBuffer)) {
              const idx = parseInt(index);
              if (!emittedToolCalls.has(idx) && tcData.function.name) {
                let args = tcData.function.arguments;
                if (!this.isValidJSON(args)) {
                  args = this.fixJSON(args);
                }
                yield {
                  content: '',
                  isToolCall: true,
                  toolCallId: tcData.id,
                  toolName: tcData.function.name,
                  toolArgs: args,
                  toolArgsComplete: true,
                };
              }
            }
            return;
          }
        } catch {
          // Ignore parse errors on incomplete stream chunks
        }
      }
    }
  }

  private isValidJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  private fixJSON(str: string): string {
    if (!str) return '{}';
    let openBraces = 0;
    let openBrackets = 0;
    for (const char of str) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
    let fixed = str;
    for (let i = 0; i < openBrackets; i++) fixed += ']';
    for (let i = 0; i < openBraces; i++) fixed += '}';
    try {
      JSON.parse(fixed);
      return fixed;
    } catch {
      return '{}';
    }
  }

  async *streamChatWithTools(
    history: any[],
    userText: string,
    tools: any[],
    toolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } } = 'auto'
  ): AsyncGenerator<{
    content?: string;
    isToolCall: boolean;
    toolCallId?: string;
    toolName?: string;
    toolArgs?: string;
    toolArgsComplete: boolean;
  }> {
    yield* this.streamChat(history, userText, tools, toolChoice);
  }

  async complete(prompt: string): Promise<string> {
    let fullResponse = '';
    for await (const chunk of this.streamChat([], prompt)) {
      if (chunk.content) fullResponse += chunk.content;
    }
    return fullResponse;
  }
}

export class GroqLLM {
  private client: any;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private systemPrompt: string;

  constructor(apiKey: string, model: string = 'llama-3.1-8b-instant') {
    this.client = axios.create({
      baseURL: 'https://api.groq.com/openai/v1',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    this.model = model;
    this.temperature = 0.3;
    this.maxTokens = 512;
    this.systemPrompt = 'You are a helpful voice assistant. Speak naturally in short, conversational sentences.';
  }

  async *streamChat(
    history: any[],
    userText: string,
    tools?: any[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): AsyncGenerator<any> {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...history.map(t => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.user_transcript || t.content })),
      { role: 'user', content: userText },
    ];

    const requestBody: any = {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      requestBody.tool_choice = toolChoice || 'auto';
    }

    const response = await this.client.post('/chat/completions', requestBody, {
      responseType: 'stream',
    });

    let toolCallBuffer: Record<number, any> = {};
    let emittedToolCalls = new Set<number>();

    for await (const chunk of response.data) {
      const lines = chunk.toString().split('\n').filter((line: string) => line.startsWith('data: '));
      
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index;
              if (!toolCallBuffer[index]) {
                toolCallBuffer[index] = {
                  id: tc.id,
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              if (tc.function?.name) {
                toolCallBuffer[index].function.name += tc.function.name;
              }
              if (tc.function?.arguments) {
                toolCallBuffer[index].function.arguments += tc.function.arguments;
              }

              const tcData = toolCallBuffer[index];
              if (!emittedToolCalls.has(index) && tcData.function.name && this.isValidJSON(tcData.function.arguments)) {
                emittedToolCalls.add(index);
                yield {
                  content: '',
                  isToolCall: true,
                  toolCallId: tcData.id,
                  toolName: tcData.function.name,
                  toolArgs: tcData.function.arguments,
                  toolArgsComplete: true,
                };
              }
            }
          }

          if (delta.content) {
            yield { content: delta.content, isToolCall: false, toolArgsComplete: false };
          }

          if (choice.finish_reason) {
            for (const [index, tcData] of Object.entries(toolCallBuffer)) {
              const idx = parseInt(index);
              if (!emittedToolCalls.has(idx) && tcData.function.name) {
                let args = tcData.function.arguments;
                if (!this.isValidJSON(args)) args = this.fixJSON(args);
                yield {
                  content: '',
                  isToolCall: true,
                  toolCallId: tcData.id,
                  toolName: tcData.function.name,
                  toolArgs: args,
                  toolArgsComplete: true,
                };
              }
            }
            return;
          }
        } catch {
          // Ignore parse errors on stream chunks
        }
      }
    }
  }

  private isValidJSON(str: string): boolean {
    try { JSON.parse(str); return true; } catch { return false; }
  }
  private fixJSON(str: string): string {
    if (!str) return '{}';
    let openBraces = 0, openBrackets = 0;
    for (const char of str) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
    let fixed = str;
    for (let i = 0; i < openBrackets; i++) fixed += ']';
    for (let i = 0; i < openBraces; i++) fixed += '}';
    try { JSON.parse(fixed); return fixed; } catch { return '{}'; }
  }
}

export class GeminiLLM {
  private client: any;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private systemPrompt: string;

  constructor(apiKey: string, model: string = 'gemini-1.5-flash') {
    this.client = axios.create({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    this.model = model;
    this.temperature = 0.3;
    this.maxTokens = 512;
    this.systemPrompt = 'You are a helpful voice assistant. Speak naturally in short, conversational sentences.';
  }

  async *streamChat(
    history: any[],
    userText: string,
    tools?: any[],
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): AsyncGenerator<any> {
    // Use OpenAI-compatible endpoint
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...history.map(t => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.user_transcript || t.content })),
      { role: 'user', content: userText },
    ];

    const requestBody: any = {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      requestBody.tool_choice = toolChoice || 'auto';
    }

    const response = await this.client.post('/chat/completions', requestBody, { responseType: 'stream' });

    let toolCallBuffer: Record<number, any> = {};
    let emittedToolCalls = new Set<number>();

    for await (const chunk of response.data) {
      const lines = chunk.toString().split('\n').filter((line: string) => line.startsWith('data: '));
      
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index;
              if (!toolCallBuffer[index]) {
                toolCallBuffer[index] = { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
              }
              if (tc.function?.name) toolCallBuffer[index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCallBuffer[index].function.arguments += tc.function.arguments;

              const tcData = toolCallBuffer[index];
              if (!emittedToolCalls.has(index) && tcData.function.name && this.isValidJSON(tcData.function.arguments)) {
                emittedToolCalls.add(index);
                yield { content: '', isToolCall: true, toolCallId: tcData.id, toolName: tcData.function.name, toolArgs: tcData.function.arguments, toolArgsComplete: true };
              }
            }
          }

          if (delta.content) {
            yield { content: delta.content, isToolCall: false, toolArgsComplete: false };
          }

          if (choice.finish_reason) {
            for (const [index, tcData] of Object.entries(toolCallBuffer)) {
              const idx = parseInt(index);
              if (!emittedToolCalls.has(idx) && tcData.function.name) {
                let args = tcData.function.arguments;
                if (!this.isValidJSON(args)) args = this.fixJSON(args);
                yield { content: '', isToolCall: true, toolCallId: tcData.id, toolName: tcData.function.name, toolArgs: args, toolArgsComplete: true };
              }
            }
            return;
          }
        } catch {
          // Ignore parse errors on stream chunks
        }
      }
    }
  }

  private isValidJSON(str: string): boolean {
    try { JSON.parse(str); return true; } catch { return false; }
  }
  private fixJSON(str: string): string {
    if (!str) return '{}';
    let openBraces = 0, openBrackets = 0;
    for (const char of str) {
      if (char === '{') openBraces++;
      else if (char === '}') openBraces--;
      else if (char === '[') openBrackets++;
      else if (char === ']') openBrackets--;
    }
    let fixed = str;
    for (let i = 0; i < openBrackets; i++) fixed += ']';
    for (let i = 0; i < openBraces; i++) fixed += '}';
    try { JSON.parse(fixed); return fixed; } catch { return '{}'; }
  }
}

export class MockLLM {
  private responses: string[] = [];
  private index = 0;

  setResponses(responses: string[]): void {
    this.responses = responses;
    this.index = 0;
  }

  async *streamChat(history: any[], userText: string, tools?: any[]): AsyncGenerator<any> {
    const response = this.responses[this.index] || 'I understand. How can I help you?';
    this.index = (this.index + 1) % this.responses.length;
    
    // Simulate streaming
    const words = response.split(' ');
    for (const word of words) {
      yield { content: word + ' ', isToolCall: false, toolArgsComplete: false };
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

export class LLMFactory {
  static create(config: {
    provider: 'openai' | 'groq' | 'gemini' | 'mock';
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    baseUrl?: string;
  }): any {
    switch (config.provider) {
      case 'openai':
        if (!config.apiKey) throw new Error('OpenAI API key required');
        return new OpenAILLM(config.apiKey, config.model, config.temperature, config.maxTokens, config.baseUrl);
      case 'groq':
        if (!config.apiKey) throw new Error('Groq API key required');
        return new GroqLLM(config.apiKey, config.model || 'llama-3.1-8b-instant');
      case 'gemini':
        if (!config.apiKey) throw new Error('Gemini API key required');
        return new GeminiLLM(config.apiKey, config.model || 'gemini-1.5-flash');
      case 'mock':
      default:
        return new MockLLM();
    }
  }
}