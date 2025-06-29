/* eslint-disable no-console */
/**
 * Test script for LLMService determineRelevance method
 * This script tests the relevance assessment functionality with various project/cause combinations
 *
 * Usage: npx ts-node test-relevance.ts
 */

import 'dotenv/config';
import { LLMService } from './src/modules/llm-integration/llm.service';

// Test cases for relevance assessment
const testCases = [
  {
    name: 'Environmental Conservation Project vs Environmental Cause',
    projectTexts: {
      description:
        'Our project focuses on reforestation efforts in the Amazon rainforest. We work with local communities to plant native trees and restore degraded land. Our mission is to combat climate change by increasing forest cover and protecting biodiversity.',
      updates:
        'This month we planted 5,000 trees and trained 20 community members in sustainable forestry practices. We also established a new nursery that will produce 10,000 seedlings per month.',
      socialPosts: [
        'Exciting news! We just reached our goal of planting 100,000 trees this year! 🌳 #Reforestation #ClimateAction',
        'Join us in protecting the Amazon rainforest. Every tree counts in the fight against climate change!',
        'Community workshop today on sustainable agriculture. Together we can protect our forests while improving livelihoods.',
      ],
    },
    causeDescription:
      'Environmental Conservation: Supporting projects that protect and restore natural ecosystems, combat climate change, and promote sustainable practices for a healthier planet.',
    expectedRange: { min: 85, max: 100 }, // Should be highly relevant
  },
  {
    name: 'Education Project vs Environmental Cause',
    projectTexts: {
      description:
        'We provide free online education to underprivileged children in developing countries. Our platform offers courses in mathematics, science, and language arts. We believe education is the key to breaking the cycle of poverty.',
      updates:
        'This quarter we enrolled 1,000 new students and launched our mobile app for offline learning. We also partnered with 5 new schools to expand our reach.',
      socialPosts: [
        'Education changes lives! We just graduated our 10,000th student! 🎓 #EducationForAll',
        'New partnership announcement: Working with local schools to bring digital education to rural areas.',
        'Success story: Maria from Guatemala just got accepted to university thanks to our program!',
      ],
    },
    causeDescription:
      'Environmental Conservation: Supporting projects that protect and restore natural ecosystems, combat climate change, and promote sustainable practices for a healthier planet.',
    expectedRange: { min: 10, max: 30 }, // Should be low relevance
  },
  {
    name: 'Clean Water Project vs Environmental Cause',
    projectTexts: {
      description:
        'Our organization builds water purification systems in communities lacking access to clean drinking water. We use solar-powered filtration technology to provide sustainable solutions that protect both human health and the environment.',
      updates:
        'Installed 3 new solar-powered water purification systems serving 500 families. Each system prevents the use of 1,000 plastic bottles per day.',
      socialPosts: [
        'Clean water is a human right! Our solar-powered systems are protecting both people and the planet 💧☀️',
        'By reducing plastic bottle use, our water systems have prevented 1 million bottles from entering landfills!',
        'Sustainable technology for sustainable communities. Water + Solar = Future',
      ],
    },
    causeDescription:
      'Environmental Conservation: Supporting projects that protect and restore natural ecosystems, combat climate change, and promote sustainable practices for a healthier planet.',
    expectedRange: { min: 60, max: 80 }, // Should be moderately high relevance
  },
  {
    name: 'Art Therapy Project vs Mental Health Cause',
    projectTexts: {
      description:
        'We provide art therapy programs for individuals dealing with trauma, anxiety, and depression. Our certified therapists use creative expression to help people process emotions and develop coping strategies.',
      updates:
        'Launched new group therapy sessions combining art and mindfulness. 95% of participants reported improved mental well-being after 8 weeks.',
      socialPosts: [
        'Art heals! Our participants created beautiful pieces while working through their mental health journey 🎨',
        'Mental health matters. Join our free art therapy workshop this weekend.',
        'Study shows: 85% reduction in anxiety symptoms through our art therapy program!',
      ],
    },
    causeDescription:
      'Mental Health Support: Advancing mental health awareness, providing therapeutic services, and supporting individuals on their journey to emotional well-being and resilience.',
    expectedRange: { min: 85, max: 100 }, // Should be highly relevant
  },
];

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Helper function to print colored output
function printColored(text: string, color: string) {
  console.log(`${color}${text}${colors.reset}`);
}

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

async function runTests() {
  printColored(
    '\n=== LLM Relevance Assessment Test ===\n',
    colors.bright + colors.cyan,
  );

  // Check for API key
  if (!process.env.OPENROUTER_API_KEY) {
    printColored(
      'ERROR: OPENROUTER_API_KEY not found in environment variables!',
      colors.red,
    );
    printColored(
      'Please set OPENROUTER_API_KEY in your .env file',
      colors.yellow,
    );
    process.exit(1);
  }

  try {
    // Initialize service
    const configService = new MockConfigService();
    const llmService = new LLMService(configService as never);

    printColored('Testing LLM connection...', colors.blue);
    const connectionOk = await llmService.testConnection();
    if (!connectionOk) {
      throw new Error('Failed to connect to LLM service');
    }
    printColored('✓ LLM connection successful\n', colors.green);

    // Run test cases
    for (const testCase of testCases) {
      printColored(
        `\nTest Case: ${testCase.name}`,
        colors.bright + colors.blue,
      );
      printColored('─'.repeat(50), colors.blue);

      console.log('\nProject Description:');
      console.log(`${testCase.projectTexts.description.substring(0, 150)}...`);

      console.log('\nCause Description:');
      console.log(testCase.causeDescription);

      console.log('\nAnalyzing relevance...');
      const startTime = Date.now();

      try {
        const result = await llmService.determineRelevance(
          testCase.projectTexts,
          testCase.causeDescription,
        );

        const duration = Date.now() - startTime;

        printColored(`\nRelevance Score: ${result.score}/100`, colors.bright);
        console.log(`Analysis Duration: ${duration}ms`);

        // Check if score is within expected range
        const inRange =
          result.score >= testCase.expectedRange.min &&
          result.score <= testCase.expectedRange.max;

        if (inRange) {
          printColored(
            `✓ Score is within expected range (${testCase.expectedRange.min}-${testCase.expectedRange.max})`,
            colors.green,
          );
        } else {
          printColored(
            `✗ Score is outside expected range (${testCase.expectedRange.min}-${testCase.expectedRange.max})`,
            colors.yellow,
          );
        }

        // Add interpretation
        console.log('\nInterpretation:');
        if (result.score >= 90) {
          console.log('Perfect alignment - ideal fit for the cause');
        } else if (result.score >= 70) {
          console.log('Strong alignment - closely matches cause goals');
        } else if (result.score >= 50) {
          console.log('Moderate alignment - some overlap but not perfect');
        } else if (result.score >= 30) {
          console.log('Weak alignment - minimal connection');
        } else {
          console.log('Very weak or no alignment');
        }
      } catch (error) {
        printColored(
          `✗ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          colors.red,
        );
      }
    }

    // Test edge cases
    printColored('\n\nTesting Edge Cases...', colors.bright + colors.yellow);
    printColored('─'.repeat(50), colors.yellow);

    // Test with empty project content
    console.log('\n1. Testing with empty project content:');
    const emptyResult = await llmService.determineRelevance(
      {
        description: '',
        updates: '',
        socialPosts: [],
      },
      'Environmental Conservation',
    );
    console.log(`Score for empty project: ${emptyResult.score}/100`);
    printColored(
      emptyResult.score === 30
        ? '✓ Correctly returned low score for empty content'
        : '✗ Unexpected score for empty content',
      emptyResult.score === 30 ? colors.green : colors.yellow,
    );

    // Test with very long content
    console.log('\n2. Testing with very long content (truncation):');
    const longDescription = 'This is a test project. '.repeat(200); // Very long description
    const longResult = await llmService.determineRelevance(
      {
        description: longDescription,
        updates: 'Regular updates',
        socialPosts: Array(20).fill('Social media post'), // Many posts
      },
      'Test Cause',
    );
    console.log(`Score for long content: ${longResult.score}/100`);
    printColored('✓ Successfully handled long content', colors.green);

    printColored(
      '\n\n=== All Tests Completed ===\n',
      colors.bright + colors.green,
    );
  } catch (error) {
    printColored(
      `\nTest suite failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      colors.red,
    );
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  printColored(
    `Unhandled error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    colors.red,
  );
  process.exit(1);
});
