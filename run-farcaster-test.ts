import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { FarcasterService } from './src/modules/social-media/services/farcaster.service';
import { SocialPostDto } from './src/modules/social-media/dto/social-post.dto';

async function testFarcasterService() {
  console.log('🚀 Testing Farcaster Service');
  console.log('═'.repeat(60));

  let app;
  try {
    // Create NestJS application context
    app = await NestFactory.createApplicationContext(AppModule);
    const farcasterService = app.get(FarcasterService);

    console.log('✅ NestJS application context created');
    console.log('📱 FarcasterService initialized');

    // --- Test Accounts ---
    const testAccounts = [
      { username: 'dwr.eth', description: 'Warpcast founder' },
      { username: 'vitalik.eth', description: 'Vitalik Buterin' },
      { username: 'jessepollak', description: 'Jesse Pollak - Base' },
      { username: 'invalid-user-xyz123', description: 'Invalid user' },
    ];

    console.log('\n📋 Famous Farcaster accounts to test:');
    testAccounts.forEach(acc =>
      console.log(`  • ${acc.username} (${acc.description})`),
    );

    // --- Test 1: getRecentCasts for each account ---
    console.log('\n\n--- Test 1: Fetching Recent Casts ---');
    console.log('─'.repeat(40));

    for (const account of testAccounts) {
      console.log(`\n▶️ Testing getRecentCasts for: ${account.username}`);
      const startTime = Date.now();
      const posts: SocialPostDto[] = await farcasterService.getRecentCasts(
        account.username,
      );
      const endTime = Date.now();
      console.log(`⏱️  Request completed in ${endTime - startTime}ms`);

      if (posts.length > 0) {
        console.log(`✅ Found ${posts.length} posts.`);
        console.log('  Sample posts:');
        posts.slice(0, 3).forEach((post, index) => {
          console.log(
            `    ${index + 1}. [${post.createdAt.toISOString().split('T')[0]}] ${post.text.substring(0, 70).replace(/\n/g, ' ')}...`,
          );
          console.log(`       URL: ${post.url}`);
        });
        if (posts.length > 3) {
          console.log(`    ... and ${posts.length - 3} more.`);
        }
      } else {
        console.log(
          `ℹ️  No posts found for ${account.username}. This is expected for the invalid user.`,
        );
      }
    }

    // --- Test 2: Incremental Fetching ---
    console.log('\n\n--- Test 2: Incremental Fetching ---');
    console.log('─'.repeat(40));
    const incrementalTestUser = 'dwr.eth';
    console.log(`\n▶️ Testing incremental fetch for: ${incrementalTestUser}`);

    // First, fetch all recent posts to get a timestamp
    const initialPosts =
      await farcasterService.getRecentCasts(incrementalTestUser);

    if (initialPosts.length > 2) {
      // Get a timestamp from the 3rd post to use as our "since" marker
      const sinceTimestamp = initialPosts[2].createdAt;
      console.log(
        `  Set 'since' timestamp to: ${sinceTimestamp.toISOString()} (from 3rd post)`,
      );

      console.log(
        `\n  Fetching posts newer than ${sinceTimestamp.toISOString()}...`,
      );
      const startTime = Date.now();
      const incrementalPosts = await farcasterService.getRecentCastsIncremental(
        incrementalTestUser,
        sinceTimestamp,
      );
      const endTime = Date.now();
      console.log(
        `⏱️  Incremental request completed in ${endTime - startTime}ms`,
      );

      console.log(`✅ Found ${incrementalPosts.length} new posts.`);
      console.log(
        `  (Expected to find 2, since we used the 3rd post's timestamp)`,
      );

      if (incrementalPosts.length > 0) {
        console.log('  New posts:');
        incrementalPosts.forEach((post, index) => {
          console.log(
            `    ${index + 1}. [${post.createdAt.toISOString().split('T')[0]}] ${post.text.substring(0, 70).replace(/\n/g, ' ')}...`,
          );
        });
      }
    } else {
      console.log(
        `ℹ️  Not enough posts for ${incrementalTestUser} to run incremental test.`,
      );
    }

    // --- Test 3: FID Lookup Caching ---
    console.log('\n\n--- Test 3: FID Lookup Caching ---');
    console.log('─'.repeat(40));
    const cacheTestUser = 'vitalik.eth';
    console.log(`\n▶️ Testing FID lookup caching for: ${cacheTestUser}`);

    // First call - should be from API
    console.log('\n  First call (should be from API):');
    let startTime = Date.now();
    let fidResult = await farcasterService.getFidByUsername(cacheTestUser);
    let endTime = Date.now();
    console.log(
      `  FID: ${fidResult.fid}, Success: ${fidResult.success}, From Cache: ${fidResult.fromCache}`,
    );
    console.log(`⏱️  Completed in ${endTime - startTime}ms`);

    // Second call - should be from cache
    console.log('\n  Second call (should be from cache):');
    startTime = Date.now();
    fidResult = await farcasterService.getFidByUsername(cacheTestUser);
    endTime = Date.now();
    console.log(
      `  FID: ${fidResult.fid}, Success: ${fidResult.success}, From Cache: ${fidResult.fromCache}`,
    );
    console.log(
      `⏱️  Completed in ${endTime - startTime}ms (should be much faster)`,
    );
  } catch (error) {
    console.error('\n❌ Test failed with an unexpected error:');
    if (error instanceof Error) {
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
    } else {
      console.error('Caught an unknown error object:', error);
    }
  } finally {
    if (app) {
      await app.close();
      console.log('\n✅ Test completed and application context closed.');
    }
  }
}

// Main execution
if (require.main === module) {
  testFarcasterService()
    .then(() => {
      console.log('\n🎉 All done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Unhandled error in test runner:', error);
      process.exit(1);
    });
}
