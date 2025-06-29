/**
 * Prompt templates for relevance assessment using LLM
 * Used to evaluate how well project content aligns with a cause theme
 */

/**
 * System prompt for relevance assessment
 * Establishes the role and guidelines for evaluating thematic alignment
 */
export const RELEVANCE_SYSTEM_PROMPT = `You are an expert in evaluating charitable projects and their alignment with specific causes or themes.

Your task is to assess the relevance of a project to a given cause on a scale of 0-100 based on these criteria:

1. THEMATIC ALIGNMENT (40%): How well does the project's mission and activities align with the cause's theme?
2. GOAL CONSISTENCY (30%): Are the project's goals consistent with what the cause aims to achieve?
3. TARGET AUDIENCE (15%): Does the project serve a similar or complementary target audience as the cause?
4. APPROACH COMPATIBILITY (15%): Are the project's methods and approaches compatible with the cause's philosophy?

Scoring Guidelines:
- 90-100: Perfect alignment - the project is an ideal fit for the cause
- 70-89: Strong alignment - the project closely matches the cause's goals
- 50-69: Moderate alignment - some overlap but not a perfect fit
- 30-49: Weak alignment - minimal connection to the cause
- 10-29: Very weak alignment - barely related to the cause
- 0-9: No alignment - completely unrelated to the cause

Be objective and analytical. Consider both explicit connections (direct mentions of cause themes) and implicit connections (underlying values and approaches).`;

/**
 * Create a user prompt for relevance assessment
 * @param projectTexts Object containing project description, updates, and social posts
 * @param causeDescription Description of the cause theme
 * @returns Formatted user prompt for LLM
 */
export function createRelevanceUserPrompt(
  projectTexts: {
    description: string;
    updates: string;
    socialPosts: string[];
  },
  causeDescription: string,
): string {
  // Truncate very long texts to avoid token limits
  const maxDescriptionLength = 1500;
  const maxUpdatesLength = 1000;
  const maxSocialPostLength = 200;
  const maxSocialPosts = 5;

  const truncatedDescription =
    projectTexts.description.length > maxDescriptionLength
      ? `${projectTexts.description.substring(0, maxDescriptionLength)}... [Truncated]`
      : projectTexts.description;

  const truncatedUpdates =
    projectTexts.updates.length > maxUpdatesLength
      ? `${projectTexts.updates.substring(0, maxUpdatesLength)}... [Truncated]`
      : projectTexts.updates;

  const truncatedSocialPosts = projectTexts.socialPosts
    .slice(0, maxSocialPosts)
    .map(post =>
      post.length > maxSocialPostLength
        ? `${post.substring(0, maxSocialPostLength)}... [Truncated]`
        : post,
    );

  return `Please evaluate the relevance of the following project to the specified cause:

CAUSE DESCRIPTION:
"${causeDescription}"

PROJECT INFORMATION:

Description:
"${truncatedDescription}"

Recent Updates:
"${truncatedUpdates}"

Recent Social Media Posts:
${truncatedSocialPosts.map((post, index) => `${index + 1}. "${post}"`).join('\n')}

TASK: Analyze how well this project aligns with the cause based on:
1. Thematic alignment between project activities and cause theme
2. Consistency of goals and objectives
3. Target audience compatibility
4. Approach and methodology compatibility

Provide a relevance score from 0-100 and explain your reasoning.

Respond in this exact JSON format:
{
  "score": <number>,
  "reasoning": "<brief explanation of the relevance assessment>"
}`;
}

/**
 * Predefined context descriptions for relevance assessment
 */
export const RELEVANCE_CONTEXTS = {
  PROJECT_TO_CAUSE: 'project to cause relevance',
  TWITTER_TO_CAUSE: 'twitter content to cause relevance',
  FARCASTER_TO_CAUSE: 'farcaster content to cause relevance',
} as const;

/**
 * Get appropriate max tokens for relevance assessment
 * Relevance assessments need moderate response length
 */
export function getMaxTokensForRelevanceAssessment(): number {
  return 600; // Enough for score and detailed reasoning
}

/**
 * Get appropriate temperature for relevance assessment
 * Lower temperature for more consistent scoring
 */
export function getTemperatureForRelevanceAssessment(): number {
  return 0.3; // Low temperature for consistent, analytical assessment
}

/**
 * Helper function to prepare project texts for relevance assessment
 * Combines and formats different text sources
 */
export function prepareProjectTextsForRelevance(
  description: string = '',
  updates: string = '',
  socialPosts: string[] = [],
): { description: string; updates: string; socialPosts: string[] } {
  return {
    description: description.trim() || 'No description available',
    updates: updates.trim() || 'No recent updates',
    socialPosts: socialPosts
      .filter(post => typeof post === 'string' && post.trim() !== '')
      .slice(0, 10), // Limit to 10 most recent
  };
}
