import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { TwitterService } from './src/modules/social-media/services/twitter.service';

async function testTwitterService() {
  console.log('🚀 Starting Twitter Service Test for @elonmusk');
  console.log('═'.repeat(50));

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

    // Test fetching Elon Musk's tweets
    console.log('\n🐦 Fetching @elonmusk tweets...');
    console.log('─'.repeat(30));

    const startTime = Date.now();
    const tweets = await twitterService.getRecentTweets('davidasinclair');
    const endTime = Date.now();

    console.log(`⏱️  Request completed in ${endTime - startTime}ms`);
    console.log(`📊 Found ${tweets.length} tweets`);

    if (tweets.length > 0) {
      console.log('\n📝 Recent Tweets:');
      console.log('═'.repeat(50));

      tweets.forEach((tweet, index) => {
        console.log(`\n${index + 1}. Tweet ID: ${tweet.id ?? 'N/A'}`);
        console.log(`   Date: ${tweet.createdAt.toISOString()}`);
        console.log(`   Platform: ${tweet.platform}`);
        console.log(`   URL: ${tweet.url ?? 'N/A'}`);
        console.log(
          `   Text: ${tweet.text.substring(0, 100)}${tweet.text.length > 100 ? '...' : ''}`,
        );
        console.log('─'.repeat(50));
      });
    } else {
      console.log('\n⚠️  No tweets found. This could mean:');
      console.log('   • Authentication failed');
      console.log('   • Rate limiting');
      console.log('   • Network issues');
      console.log('   • Missing credentials');
    }

    // Test different handle formats
    console.log('\n🧪 Testing different handle formats...');

    await app.close();
    console.log('\n✅ Test completed successfully!');
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
  console.log('🧪 Twitter Service Test - Elon Musk Tweets');
  console.log('═'.repeat(50));

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
