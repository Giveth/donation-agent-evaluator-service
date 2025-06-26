import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { TextQualityAssessmentDto } from './dto/text-quality-assessment.dto';
import {
  TEXT_QUALITY_SYSTEM_PROMPT,
  createTextQualityUserPrompt,
  getMaxTokensForQualityAssessment,
  getTemperatureForQualityAssessment,
} from './prompts/quality-prompts';
import {
  RELEVANCE_SYSTEM_PROMPT,
  createRelevanceUserPrompt,
  getMaxTokensForRelevanceAssessment,
  getTemperatureForRelevanceAssessment,
  prepareProjectTextsForRelevance,
} from './prompts/relevance-prompts';

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

  /**
   * Analyze the quality of text content using the LLM
   * @param text The text content to evaluate
   * @param contextDescription Description of what type of content this is (e.g., "project description", "project update")
   * @returns Assessment with score (0-100) and optional reasoning
   */
  async analyzeTextQuality(
    text: string,
    contextDescription: string,
  ): Promise<{ score: number; reasoning?: string }> {
    try {
      // Input validation
      if (!text || typeof text !== 'string') {
        this.logger.warn('analyzeTextQuality: Invalid text input provided');
        return TextQualityAssessmentDto.createFallback(
          'Invalid text input',
        ).toObject();
      }

      if (!contextDescription || typeof contextDescription !== 'string') {
        this.logger.warn(
          'analyzeTextQuality: Invalid context description provided',
        );
        return TextQualityAssessmentDto.createFallback(
          'Invalid context description',
        ).toObject();
      }

      // Trim and validate text length
      const trimmedText = text.trim();
      if (trimmedText.length === 0) {
        this.logger.warn('analyzeTextQuality: Empty text provided');
        return TextQualityAssessmentDto.createFallback(
          'Empty text provided',
        ).toObject();
      }

      if (trimmedText.length < 10) {
        this.logger.warn(
          'analyzeTextQuality: Text too short for meaningful evaluation',
        );
        return TextQualityAssessmentDto.fromScore(
          20,
          'Text too short for meaningful evaluation',
        ).toObject();
      }

      this.logger.debug(
        `Analyzing text quality for ${contextDescription}, text length: ${trimmedText.length}`,
      );

      const startTime = Date.now();

      // Create prompts
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: TEXT_QUALITY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: createTextQualityUserPrompt(trimmedText, contextDescription),
        },
      ];

      // Call LLM with appropriate parameters
      const response = await this.createChatCompletion(messages, {
        temperature: getTemperatureForQualityAssessment(),
        max_tokens: getMaxTokensForQualityAssessment(contextDescription),
        response_format: { type: 'json_object' },
      });

      const content = this.extractTextContent(response);
      const duration = Date.now() - startTime;

      this.logger.debug(
        `Text quality analysis completed in ${duration}ms for ${contextDescription}`,
      );

      // Parse JSON response
      try {
        const parsed = JSON.parse(content) as {
          score: unknown;
          reasoning?: unknown;
        };

        if (typeof parsed.score !== 'number') {
          throw new Error('Invalid score format in LLM response');
        }

        const assessment = TextQualityAssessmentDto.fromScore(
          parsed.score,
          typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
        );

        this.logger.debug(
          `Text quality assessment: score=${assessment.score}, context=${contextDescription}`,
        );

        return assessment.toObject();
      } catch (parseError) {
        this.logger.warn(
          `Failed to parse LLM JSON response for text quality: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`,
        );
        this.logger.debug(`Raw LLM response: ${content}`);

        // Try to extract score using fallback parsing
        const fallbackScore = this.parseNumericalScore(content, 0, 100, false);
        return TextQualityAssessmentDto.fromScore(
          fallbackScore,
          'Parsed from non-JSON response',
        ).toObject();
      }
    } catch (error) {
      const duration = Date.now() - (Date.now() - 1000); // Approximate
      this.logger.error(
        `Text quality analysis failed after ${duration}ms for ${contextDescription}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        error instanceof Error ? error.stack : undefined,
      );

      // Return fallback assessment
      return TextQualityAssessmentDto.createFallback(
        'LLM service error during analysis',
      ).toObject();
    }
  }

  /**
   * Determine the relevance of project content to a cause
   * @param projectTexts Object containing project description, updates, and social posts
   * @param causeDescription Description of the cause theme
   * @returns Assessment with relevance score (0-100)
   */
  async determineRelevance(
    projectTexts: {
      description: string;
      updates: string;
      socialPosts: string[];
    },
    causeDescription: string,
  ): Promise<{ score: number }> {
    try {
      // Input validation - validate required fields
      if (
        !projectTexts.description ||
        !projectTexts.updates ||
        !Array.isArray(projectTexts.socialPosts)
      ) {
        this.logger.warn('determineRelevance: Invalid projectTexts provided');
        return { score: 50 }; // Neutral score for invalid input
      }

      if (!causeDescription || typeof causeDescription !== 'string') {
        this.logger.warn(
          'determineRelevance: Invalid cause description provided',
        );
        return { score: 50 }; // Neutral score for invalid input
      }

      const trimmedCauseDescription = causeDescription.trim();
      if (trimmedCauseDescription.length === 0) {
        this.logger.warn(
          'determineRelevance: Empty cause description provided',
        );
        return { score: 50 }; // Neutral score for empty cause
      }

      // Prepare and validate project texts
      const preparedTexts = prepareProjectTextsForRelevance(
        projectTexts.description,
        projectTexts.updates,
        projectTexts.socialPosts,
      );

      // Check if we have any meaningful content to analyze
      const hasContent =
        preparedTexts.description !== 'No description available' ||
        preparedTexts.updates !== 'No recent updates' ||
        preparedTexts.socialPosts.length > 0;

      if (!hasContent) {
        this.logger.warn(
          'determineRelevance: No meaningful project content to analyze',
        );
        return { score: 30 }; // Low score for projects with no content
      }

      this.logger.debug(
        `Determining relevance for project with ${preparedTexts.socialPosts.length} social posts against cause: ${trimmedCauseDescription.substring(0, 50)}...`,
      );

      const startTime = Date.now();

      // Create prompts
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: RELEVANCE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: createRelevanceUserPrompt(
            preparedTexts,
            trimmedCauseDescription,
          ),
        },
      ];

      // Call LLM with appropriate parameters
      const response = await this.createChatCompletion(messages, {
        temperature: getTemperatureForRelevanceAssessment(),
        max_tokens: getMaxTokensForRelevanceAssessment(),
        response_format: { type: 'json_object' },
      });

      const content = this.extractTextContent(response);
      const duration = Date.now() - startTime;

      this.logger.debug(`Relevance assessment completed in ${duration}ms`);

      // Parse JSON response
      try {
        const parsed = JSON.parse(content) as {
          score: unknown;
          reasoning?: unknown;
        };

        if (typeof parsed.score !== 'number') {
          throw new Error('Invalid score format in LLM response');
        }

        // Ensure score is within bounds
        const score = Math.max(0, Math.min(100, parsed.score));

        this.logger.debug(
          `Relevance assessment: score=${score}, reasoning=${
            typeof parsed.reasoning === 'string'
              ? `${parsed.reasoning.substring(0, 100)}...`
              : 'N/A'
          }`,
        );

        return { score };
      } catch (parseError) {
        this.logger.warn(
          `Failed to parse LLM JSON response for relevance: ${
            parseError instanceof Error ? parseError.message : 'Unknown error'
          }`,
        );
        this.logger.debug(`Raw LLM response: ${content}`);

        // Try to extract score using fallback parsing
        const fallbackScore = this.parseNumericalScore(content, 0, 100, false);
        return { score: fallbackScore };
      }
    } catch (error) {
      this.logger.error(
        `Relevance assessment failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        error instanceof Error ? error.stack : undefined,
      );

      // Return neutral score on error
      return { score: 50 };
    }
  }
}
