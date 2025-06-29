/* eslint-disable no-console */
/**
 * Simple test script for LLMService determineRelevance method
 *
 * Usage: npx ts-node test-relevance-simple.ts
 */

import 'dotenv/config';
import { LLMService } from './src/modules/llm-integration/llm.service';

// Mock ConfigService for testing
class MockConfigService {
  get(key: string, defaultValue?: unknown): unknown {
    const config: Record<string, unknown> = {
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      LLM_MODEL: process.env.LLM_MODEL ?? 'google/gemini-2.5-flash',
      LLM_TEMPERATURE: parseFloat(process.env.LLM_TEMPERATURE ?? '0.3'),
      LLM_MAX_TOKENS: parseInt(process.env.LLM_MAX_TOKENS ?? '600'),
    };
    return config[key] ?? defaultValue;
  }
}

async function main() {
  console.log('Testing LLM Relevance Assessment...\n');

  // Check for API key
  if (!process.env.OPENROUTER_API_KEY) {
    console.error(
      'ERROR: OPENROUTER_API_KEY not found in environment variables!',
    );
    console.error('Please set OPENROUTER_API_KEY in your .env file');
    process.exit(1);
  }

  try {
    // Initialize service
    const configService = new MockConfigService();
    const llmService = new LLMService(configService as never);

    // Test connection
    console.log('Testing LLM connection...');
    const connectionOk = await llmService.testConnection();
    if (!connectionOk) {
      throw new Error('Failed to connect to LLM service');
    }
    console.log('✓ LLM connection successful\n');

    // Simple test case
    const projectTexts = {
      description:
        'We are building clean water wells in rural communities across Africa. Our solar-powered water pumps provide sustainable access to clean drinking water for thousands of families.',
      updates:
        'This month we completed 3 new wells serving 500 families. Each well reduces waterborne diseases by 80% in the communities we serve.',
      socialPosts: [
        'Clean water transforms lives! Our latest well in Kenya is now serving 200 families 💧',
        'Solar power + clean water = sustainable future for rural communities',
        'Thanks to our donors, 5000 people now have access to clean water!',
      ],
    };

    const causeDescription =
      'Clean Water Access: Supporting projects that provide sustainable clean water solutions to communities in need, improving health and quality of life.';

    console.log('Project Description:');
    console.log(projectTexts.description);
    console.log('\nCause Description:');
    console.log(causeDescription);
    console.log('\nAnalyzing relevance...');

    const startTime = Date.now();
    const result = await llmService.determineRelevance(
      projectTexts,
      causeDescription,
    );
    const duration = Date.now() - startTime;

    console.log(`\nRelevance Score: ${result.score}/100`);
    console.log(`Analysis Duration: ${duration}ms`);

    // Interpretation
    if (result.score >= 90) {
      console.log(
        'Interpretation: Perfect alignment - ideal fit for the cause',
      );
    } else if (result.score >= 70) {
      console.log(
        'Interpretation: Strong alignment - closely matches cause goals',
      );
    } else if (result.score >= 50) {
      console.log(
        'Interpretation: Moderate alignment - some overlap but not perfect',
      );
    } else if (result.score >= 30) {
      console.log('Interpretation: Weak alignment - minimal connection');
    } else {
      console.log('Interpretation: Very weak or no alignment');
    }

    console.log('\n✓ Test completed successfully!');
  } catch (error) {
    console.error(
      '\nTest failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
main().catch(error => {
  console.error(
    'Unhandled error:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exit(1);
});
