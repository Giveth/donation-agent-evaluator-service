import * as dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { LLMService } from './src/modules/llm-integration/llm.service';

// Load environment variables from .env file
dotenv.config();

/**
 * Simple test script for the analyzeTextQuality method
 * Run with: npx ts-node test-text-quality-simple.ts
 */
async function testTextQuality() {
  console.log('🔬 Testing analyzeTextQuality method (simple)...\n');

  try {
    // Create config service with required env vars
    const configService = new ConfigService({
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      LLM_MODEL: process.env.LLM_MODEL ?? 'google/gemini-2.5-flash',
      LLM_TEMPERATURE: process.env.LLM_TEMPERATURE ?? '0.7',
      LLM_MAX_TOKENS: process.env.LLM_MAX_TOKENS ?? '1000',
    });

    // Create LLM service
    const llmService = new LLMService(configService);

    console.log('✅ LLM Service initialized successfully');
    console.log(`📋 Using model: ${configService.get('LLM_MODEL')}\n`);

    // Test cases
    const testCases = [
      {
        name: 'High Quality Project Description',
        text: `Our nonprofit organization is dedicated to providing clean water access to underserved communities in rural areas. We employ innovative solar-powered water purification systems that are sustainable, cost-effective, and locally maintainable. Our team includes experienced engineers, community organizers, and local partnerships that ensure long-term success. 

In the past year, we have successfully installed 15 water purification systems serving over 3,000 individuals across 5 villages. Each installation includes comprehensive training for local maintenance teams and ongoing support. Our transparent reporting includes regular water quality testing results, financial statements, and impact assessments published quarterly on our website.

We are currently seeking funding to expand to 10 additional villages, with a goal of providing clean water access to 2,000 more people by the end of 2024. The requested funds will cover equipment costs ($45,000), installation and training ($15,000), and first-year maintenance supplies ($10,000).`,
        context: 'project description',
        expectedRange: [75, 95],
      },
      {
        name: 'Poor Quality Project Description',
        text: 'we need money for our project. its really good and will help people. donate now!!!',
        context: 'project description',
        expectedRange: [10, 30],
      },
      {
        name: 'Medium Quality Update',
        text: `Update: We completed the installation of 3 new water systems this month. The community feedback has been positive. We faced some challenges with equipment delivery but resolved them. Next month we plan to install 2 more systems.`,
        context: 'project update',
        expectedRange: [40, 70],
      },
      {
        name: 'Empty Text',
        text: '',
        context: 'project description',
        expectedRange: [45, 55], // Should return fallback score
      },
      {
        name: 'Very Short Text',
        text: 'Help us',
        context: 'project title',
        expectedRange: [15, 25], // Should return low score for short text
      },
    ];

    // Run tests
    for (const testCase of testCases) {
      console.log(`🧪 Testing: ${testCase.name}`);
      console.log(`📝 Context: ${testCase.context}`);
      console.log(
        `📄 Text: ${testCase.text.substring(0, 100)}${testCase.text.length > 100 ? '...' : ''}`,
      );

      const startTime = Date.now();
      const result = await llmService.analyzeTextQuality(
        testCase.text,
        testCase.context,
      );
      const duration = Date.now() - startTime;

      console.log(`⏱️  Analysis completed in ${duration}ms`);
      console.log(`📊 Score: ${result.score}/100`);
      if (result.reasoning) {
        console.log(`💭 Reasoning: ${result.reasoning}`);
      }

      // Validate score is in expected range
      const [minExpected, maxExpected] = testCase.expectedRange;
      const isInRange =
        result.score >= minExpected && result.score <= maxExpected;
      console.log(
        `${isInRange ? '✅' : '❌'} Expected range: ${minExpected}-${maxExpected}, Got: ${result.score}`,
      );

      console.log('─'.repeat(80));
    }

    // Test connection
    console.log('\n🔗 Testing LLM connection...');
    const connectionOk = await llmService.testConnection();
    console.log(
      `${connectionOk ? '✅' : '❌'} Connection test: ${connectionOk ? 'PASSED' : 'FAILED'}`,
    );

    console.log('\n🎉 All tests completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testTextQuality().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
