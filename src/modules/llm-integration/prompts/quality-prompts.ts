/**
 * Prompt templates for text quality assessment using LLM
 * Used to evaluate project descriptions, updates, and other textual content
 */

/**
 * System prompt for text quality assessment
 * Establishes the role and guidelines for the LLM
 */
export const TEXT_QUALITY_SYSTEM_PROMPT = `You are an expert content evaluator specializing in charitable and impact project communications.

Your task is to assess the quality of text content on a scale of 0-100 based on these criteria:

1. CLARITY (25%): Is the text clear, well-structured, and easy to understand?
2. COMPREHENSIVENESS (25%): Does it provide sufficient detail and relevant information?
3. PROFESSIONALISM (25%): Is the tone, grammar, and presentation professional and appropriate?
4. APPEAL (25%): Is the content engaging and compelling for potential supporters?

Scoring Guidelines:
- 90-100: Exceptional quality, professional, comprehensive, highly engaging
- 70-89: Good quality with minor areas for improvement
- 50-69: Average quality, adequate but could be enhanced
- 30-49: Below average, significant issues with clarity or completeness
- 10-29: Poor quality, major problems with communication
- 0-9: Very poor or completely inadequate content

Be objective and consistent. Consider the context of charitable/impact projects where transparency, clarity, and compelling communication are essential for building trust with donors and supporters.`;

/**
 * Create a user prompt for text quality assessment
 * @param text The text content to evaluate
 * @param contextDescription Description of what type of content this is (e.g., "project description", "project update")
 * @returns Formatted user prompt for LLM
 */
export function createTextQualityUserPrompt(
  text: string,
  contextDescription: string,
): string {
  // Truncate very long text to avoid token limits while preserving evaluation ability
  const maxLength = 2000;
  const truncatedText =
    text.length > maxLength
      ? `${text.substring(0, maxLength)}... [Content truncated for evaluation]`
      : text;

  return `Please evaluate the quality of this ${contextDescription}:

CONTENT TO EVALUATE:
"${truncatedText}"

CONTEXT: This is a ${contextDescription} for a charitable/impact project.

Please provide:
1. A numerical score from 0-100 based on the criteria (clarity, comprehensiveness, professionalism, appeal)
2. Brief reasoning explaining your score

Respond in this exact JSON format:
{
  "score": <number>,
  "reasoning": "<brief explanation of the score>"
}`;
}

/**
 * Predefined context descriptions for common use cases
 */
export const QUALITY_CONTEXTS = {
  PROJECT_DESCRIPTION: 'project description',
  PROJECT_UPDATE: 'project update',
  SOCIAL_MEDIA_POST: 'social media post',
  PROJECT_TITLE: 'project title',
  UPDATE_TITLE: 'update title',
} as const;

/**
 * Get appropriate max tokens based on content type
 * Different content types may need different response lengths
 */
export function getMaxTokensForQualityAssessment(
  contextDescription: string,
): number {
  // Shorter responses for simple content, longer for complex evaluations
  if (contextDescription.includes('title')) {
    return 300;
  }
  return 500;
}

/**
 * Get appropriate temperature for quality assessment
 * Lower temperature for more consistent scoring
 */
export function getTemperatureForQualityAssessment(): number {
  return 0.3; // Low temperature for consistent, objective scoring
}
