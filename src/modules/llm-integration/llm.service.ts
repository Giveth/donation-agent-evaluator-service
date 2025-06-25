import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly openai: OpenAI;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });

    this.defaultModel = this.configService.get<string>(
      'LLM_MODEL',
      'google/gemini-2.5-flash',
    );

    this.logger.log(`LLMService initialized with model: ${this.defaultModel}`);
  }

  /**
   * Create a chat completion using the configured LLM
   * @param messages The messages for the chat completion
   * @param options Additional options for the completion (streaming is not supported)
   * @returns The completion response
   */
  async createChatCompletion(
    messages: ChatCompletionMessageParam[],
    options?: Omit<Partial<ChatCompletionCreateParams>, 'stream'>,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
      const startTime = Date.now();

      const response = await this.openai.chat.completions.create({
        model: options?.model ?? this.defaultModel,
        messages,
        temperature:
          options?.temperature ??
          this.configService.get<number>('LLM_TEMPERATURE', 0.7),
        max_tokens:
          options?.max_tokens ??
          this.configService.get<number>('LLM_MAX_TOKENS', 1000),
        stream: false,
        ...options,
      });

      const duration = Date.now() - startTime;
      const chatCompletion = response as OpenAI.Chat.Completions.ChatCompletion;
      this.logger.log(
        `LLM completion created in ${duration}ms using model: ${chatCompletion.model}`,
      );

      return chatCompletion;
    } catch (error) {
      this.logger.error(
        `Failed to create chat completion: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Extract text content from a completion response
   * @param completion The completion response
   * @returns The extracted text content
   */
  extractTextContent(
    completion: OpenAI.Chat.Completions.ChatCompletion,
  ): string {
    if (completion.choices.length === 0) {
      throw new Error('No choices in completion response');
    }

    const { content } = completion.choices[0].message;
    if (!content) {
      throw new Error('No content in completion response');
    }

    return content;
  }

  /**
   * Parse a numerical score from LLM response text
   * @param text The text containing a numerical score
   * @param minScore The minimum expected score
   * @param maxScore The maximum expected score
   * @param throwOnFailure If true, throws error on parsing failure instead of returning fallback
   * @returns The parsed score
   * @throws Error if parsing fails and throwOnFailure is true
   */
  parseNumericalScore(
    text: string,
    minScore: number = 0,
    maxScore: number = 10,
    throwOnFailure: boolean = false,
  ): number {
    // Look for various number patterns in the text
    const patterns = [
      /score[:\s]*(\d+(?:\.\d+)?)/i,
      /rating[:\s]*(\d+(?:\.\d+)?)/i,
      /(\d+(?:\.\d+)?)\s*\/\s*\d+/,
      /^(\d+(?:\.\d+)?)/m,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const score = parseFloat(match[1]);
        if (!isNaN(score)) {
          // Clamp the score to the expected range
          return Math.max(minScore, Math.min(maxScore, score));
        }
      }
    }

    const errorMessage = `Could not parse numerical score from text: ${text.substring(0, 100)}...`;
    this.logger.warn(errorMessage);

    if (throwOnFailure) {
      throw new Error(`Score parsing failed: ${errorMessage}`);
    }

    // Return middle value if parsing fails
    return (minScore + maxScore) / 2;
  }

  /**
   * Create a simple prompt for the LLM
   * @param systemPrompt The system instruction
   * @param userPrompt The user query
   * @returns Formatted messages array
   */
  createPrompt(
    systemPrompt: string,
    userPrompt: string,
  ): ChatCompletionMessageParam[] {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }

  /**
   * Get the current default model
   * @returns The model name
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Test the LLM connection with a simple prompt
   * @returns True if successful
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.createChatCompletion(
        [{ role: 'user', content: 'Say "OK" if you can read this.' }],
        {
          max_tokens: 10,
          temperature: 0,
        },
      );

      const content = this.extractTextContent(response);
      this.logger.log(`LLM connection test successful: ${content}`);
      return true;
    } catch (error) {
      this.logger.error(
        `LLM connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }
}
