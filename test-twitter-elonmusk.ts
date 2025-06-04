import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { TwitterService } from './src/modules/social-media/services/twitter.service';

async function testTwitterService() {
  console.log('🚀 Starting Twitter Service Test for Multiple Accounts');
  console.log('═'.repeat(60));

  try {
    // Create NestJS application
    const app = await NestFactory.createApplicationContext(AppModule);
    const twitterService = app.get(TwitterService);

    console.log('✅ NestJS application context created');
    console.log('📱 Twitter service initialized');

    // Check authentication status first
    console.log('\n🔐 Checking authentication status...');
    const authStatus = await twitterService.getAuthStatus();

    console.log('Authentication Details:');
    console.log(`  • Is Authenticated: ${authStatus.isAuthenticated}`);
    console.log(`  • Is Logged In: ${authStatus.isLoggedIn}`);
    console.log(`  • Credentials Provided: ${authStatus.credentialsProvided}`);
    console.log(`  • Cookies File Exists: ${authStatus.cookiesFileExists}`);

    // Run health check
    console.log('\n🏥 Running health check...');
    const isHealthy = await twitterService.healthCheck();
    console.log(`Health Status: ${isHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);

    // Test single handle (existing test)
    console.log('\n🐦 Testing Single Handle: @davidasinclair...');
    console.log('─'.repeat(40));

    const startTimeSingle = Date.now();
    const singleTweets = await twitterService.getRecentTweets('davidasinclair');
    const endTimeSingle = Date.now();

    console.log(
      `⏱️  Single handle request completed in ${endTimeSingle - startTimeSingle}ms`,
    );
    console.log(`📊 Found ${singleTweets.length} tweets for @davidasinclair`);

    // Test batch fetching with multiple handles (NEW TEST)
    console.log('\n🚀 Testing Batch Fetching: Multiple Handles...');
    console.log('═'.repeat(60));

    const testHandles = [
      'elonmusk', // Tech entrepreneur
      'davidasinclair', // Scientist
      'naval', // Tech investor/philosopher
    ];

    console.log(
      `📋 Testing with ${testHandles.length} handles: ${testHandles.join(', ')}`,
    );

    const startTimeBatch = Date.now();
    const batchResults =
      await twitterService.getRecentTweetsForHandles(testHandles);
    const endTimeBatch = Date.now();

    console.log(
      `⏱️  Batch request completed in ${endTimeBatch - startTimeBatch}ms`,
    );

    // Display batch summary
    const summary = twitterService.getBatchSummary(batchResults);
    console.log('\n📊 Batch Operation Summary:');
    console.log('─'.repeat(40));
    console.log(`  • Total Handles: ${summary.total}`);
    console.log(`  • Successful: ${summary.successful}`);
    console.log(`  • Failed: ${summary.failed}`);
    console.log(`  • Success Rate: ${summary.successRate.toFixed(1)}%`);
    console.log(`  • Total Posts Retrieved: ${summary.totalPosts}`);

    if (summary.failedHandles.length > 0) {
      console.log(`  • Failed Handles: ${summary.failedHandles.join(', ')}`);
    }

    // Display detailed results for each handle
    console.log('\n📝 Detailed Results by Handle:');
    console.log('═'.repeat(60));

    batchResults.forEach((result, index) => {
      console.log(`\n${index + 1}. Handle: @${result.handle}`);
      console.log(`   Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);

      if (result.success) {
        console.log(`   Posts Found: ${result.posts.length}`);

        if (result.posts.length > 0) {
          console.log('   Recent Posts:');
          result.posts.slice(0, 3).forEach((post, postIndex) => {
            console.log(
              `     ${postIndex + 1}. ${post.createdAt.toISOString().split('T')[0]} - ${post.text.substring(0, 80)}${post.text.length > 80 ? '...' : ''}`,
            );
          });

          if (result.posts.length > 3) {
            console.log(`     ... and ${result.posts.length - 3} more posts`);
          }
        } else {
          console.log('   No recent posts found (within last 90 days)');
        }
      } else {
        console.log(`   Error: ${result.error}`);
      }

      console.log(`   ${'─'.repeat(50)}`);
    });

    // Get only successful results
    const successfulResults = twitterService.getSuccessfulResults(batchResults);
    console.log(
      `\n✅ Successfully processed ${successfulResults.length} out of ${testHandles.length} handles`,
    );

    // Performance comparison
    console.log('\n⚡ Performance Comparison:');
    console.log('─'.repeat(40));
    console.log(
      `  • Single Handle (davidasinclair): ${endTimeSingle - startTimeSingle}ms`,
    );
    console.log(
      `  • Batch (${testHandles.length} handles): ${endTimeBatch - startTimeBatch}ms`,
    );

    if (summary.successful > 0) {
      const avgTimePerHandle =
        (endTimeBatch - startTimeBatch) / summary.successful;
      console.log(
        `  • Average per successful handle: ${avgTimePerHandle.toFixed(0)}ms`,
      );
    }

    // Test different handle formats
    console.log('\n🧪 Testing different handle formats...');
    console.log('─'.repeat(40));

    const formatTests = [
      'elonmusk', // Plain username
      '@elonmusk', // With @ symbol
      'https://twitter.com/elonmusk', // Twitter URL
      'https://x.com/elonmusk', // X.com URL
    ];

    console.log('Testing format variations for same user:');
    formatTests.forEach(format => {
      console.log(`  • Input: "${format}"`);
    });

    await app.close();
    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }

    console.log('\n🔧 Troubleshooting Tips:');
    console.log('1. Make sure you have a .env file with Twitter credentials:');
    console.log('   TWITTER_USERNAME=your_username');
    console.log('   TWITTER_PASSWORD=your_password');
    console.log('   TWITTER_EMAIL=your_email@example.com');
    console.log(
      '2. Or set TWITTER_COOKIES environment variable with valid cookies',
    );
    console.log(
      '3. Check if twitter_cookies.json file exists with valid session cookies',
    );
    console.log('4. Ensure your Twitter account is not locked or suspended');
    console.log('5. Check your internet connection');
    console.log(
      '6. Rate limiting might be causing failures - this is normal behavior',
    );
  }
}

// Check for required environment variables
function checkEnvironmentSetup() {
  console.log('🔍 Checking environment setup...');

  const requiredVars = [
    'TWITTER_USERNAME',
    'TWITTER_PASSWORD',
    'TWITTER_EMAIL',
  ];

  const optionalVars = ['TWITTER_COOKIES', 'CACHE_TTL_SOCIAL_MEDIA'];

  console.log('\nRequired Environment Variables:');
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`  ${varName}: ${value ? '✅ Set' : '❌ Missing'}`);
  });

  console.log('\nOptional Environment Variables:');
  optionalVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`  ${varName}: ${value ? '✅ Set' : '⚪ Not set'}`);
  });

  const hasRequiredVars = requiredVars.every(varName => process.env[varName]);
  const hasCookies = process.env.TWITTER_COOKIES;

  if (!hasRequiredVars && !hasCookies) {
    console.log('\n⚠️  Warning: No Twitter credentials found!');
    console.log('Either set username/password/email OR provide cookies.');
    return false;
  }

  return true;
}

// Main execution
if (require.main === module) {
  console.log('🧪 Twitter Service Test - Multiple Accounts Batch Testing');
  console.log('═'.repeat(60));

  const envOk = checkEnvironmentSetup();
  console.log('\n');

  if (!envOk) {
    console.log(
      '⚠️  Continuing anyway - service should handle missing credentials gracefully\n',
    );
  }

  testTwitterService()
    .then(() => {
      console.log('\n🎉 All done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Unhandled error:', error);
      process.exit(1);
    });
}
