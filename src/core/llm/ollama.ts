/**
 * This provider is nearly identical to OpenAICompatibleProvider, but uses a custom OpenAI client
 * (NoStainlessOpenAI) to work around CORS issues specific to Ollama.
 */

import { ChatModel } from '../../types/chat-model.types'
import {
  LLMOptions,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'

import { BaseLLMProvider } from './base'
import { NoStainlessOpenAI } from './NoStainlessOpenAI'
import { isRemoteHost, obsidianFetch } from './obsidianFetch'
import { OpenAIMessageAdapter } from './openaiMessageAdapter'

export class OllamaProvider extends BaseLLMProvider<
  Extract<LLMProvider, { type: 'ollama' }>
> {
  private adapter: OpenAIMessageAdapter
  private client: NoStainlessOpenAI

  constructor(provider: Extract<LLMProvider, { type: 'ollama' }>) {
    super(provider)
    this.adapter = new OpenAIMessageAdapter()
    const baseURL = `${provider.baseUrl ? provider.baseUrl.replace(/\/+$/, '') : 'http://127.0.0.1:11434'}/v1`
    this.client = new NoStainlessOpenAI({
      baseURL,
      apiKey: provider.apiKey ?? '',
      dangerouslyAllowBrowser: true,
      // Remote hosts (e.g. https://ollama.com) don't send CORS headers for the
      // Obsidian origin, so route them through requestUrl. Local connections
      // keep the native fetch to preserve incremental streaming.
      ...(isRemoteHost(baseURL) ? { fetch: obsidianFetch } : {}),
    })
  }

  async generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    if (model.providerType !== 'ollama') {
      throw new Error('Model is not an Ollama model')
    }

    return this.adapter.generateResponse(this.client, request, options)
  }

  async streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    if (model.providerType !== 'ollama') {
      throw new Error('Model is not an Ollama model')
    }

    return this.adapter.streamResponse(this.client, request, options)
  }

  async getEmbedding(
    model: string,
    text: string,
    options?: { dimensions?: number },
  ): Promise<number[]> {
    const embedding = await this.client.embeddings.create({
      model: model,
      input: text,
      encoding_format: 'float',
      ...(options?.dimensions && { dimensions: options.dimensions }),
    })
    return embedding.data[0].embedding
  }
}
