import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { TwitterService } from './src/modules/social-media/services/twitter.service';
import { ProjectSocialAccountService } from './src/modules/social-media-storage/services/project-social-account.service';
import { SocialPostStorageService } from './src/modules/social-media-storage/services/social-post-storage.service';

async function testTwitterWithDatabase() {
  console.log('🚀 Testing Twitter Service with Database Storage');
  console.log('═'.repeat(60));

  try {
    // Create NestJS application
    const app = await NestFactory.createApplicationContext(AppModule);
    const twitterService = app.get(TwitterService);
    const projectAccountService = app.get(ProjectSocialAccountService);
    const socialPostStorageService = app.get(SocialPostStorageService);

    console.log('✅ NestJS application context created');
    console.log('📱 Services initialized');

    // Check authentication status first
    console.log('\n🔐 Checking authentication status...');
    const authStatus = await twitterService.getAuthStatus();

    console.log('Authentication Details:');
    console.log(`  • Is Authenticated: ${authStatus.isAuthenticated}`);
    console.log(`  • Is Logged In: ${authStatus.isLoggedIn}`);
    console.log(`  • Credentials Provided: ${authStatus.credentialsProvided}`);
    console.log(`  • Cookies File Exists: ${authStatus.cookiesFileExists}`);

    if (!authStatus.isAuthenticated) {
      console.log(
        '⚠️ Not authenticated - will continue but expect empty results',
      );
    }

    // Test accounts we want to fetch
    const testAccounts = [
      { projectId: 'test-project-elon', handle: 'elonmusk' },
      { projectId: 'test-project-naval', handle: 'naval' },
    ];

    console.log('\n📋 Setting up test project accounts...');

    // Create or update project accounts
    for (const account of testAccounts) {
      console.log(`Creating/updating project account for ${account.handle}...`);
      await projectAccountService.upsertProjectAccount(account.projectId, {
        twitterHandle: account.handle,
        metadata: { testAccount: true, createdAt: new Date().toISOString() },
      });
      console.log(`✅ Project account set up for ${account.handle}`);
    }

    // Fetch tweets for these accounts
    console.log('\n🐦 Fetching tweets for test accounts...');
    console.log('─'.repeat(40));

    const handles = testAccounts.map(a => a.handle);
    const startTime = Date.now();
    const batchResults =
      await twitterService.getRecentTweetsForHandles(handles);
    const endTime = Date.now();

    console.log(`⏱️ Batch request completed in ${endTime - startTime}ms`);

    // Display results
    const summary = twitterService.getBatchSummary(batchResults);
    console.log('\n📊 Fetch Summary:');
    console.log(`  • Success Rate: ${summary.successRate.toFixed(1)}%`);
    console.log(`  • Total Posts Retrieved: ${summary.totalPosts}`);

    // Store tweets in database
    console.log('\n💾 Storing tweets in database...');
    console.log('─'.repeat(40));

    let totalStoredPosts = 0;

    for (const result of batchResults) {
      if (!result.success) {
        console.log(
          `❌ Skipping ${result.handle} (fetch failed): ${result.error}`,
        );
        continue;
      }

      // Find the corresponding project account
      const testAccount = testAccounts.find(a => a.handle === result.handle);
      if (!testAccount) {
        console.log(`⚠️ No project ID found for handle ${result.handle}`);
        continue;
      }

      console.log(
        `\n📝 Processing ${result.posts.length} posts for @${result.handle}...`,
      );

      if (result.posts.length === 0) {
        console.log(`  ℹ️ No posts to store for @${result.handle}`);
        continue;
      }

      try {
        // Store posts
        await socialPostStorageService.storeSocialPosts(
          testAccount.projectId,
          result.posts,
        );

        // Get the stored posts for verification
        const storedPosts = await socialPostStorageService.getRecentSocialPosts(
          testAccount.projectId,
          10,
        );

        totalStoredPosts += storedPosts.length;
        console.log(
          `  ✅ Stored ${storedPosts.length} posts for @${result.handle}`,
        );

        // Show sample of stored posts
        if (storedPosts.length > 0) {
          console.log('  📋 Sample posts:');
          storedPosts.slice(0, 3).forEach((post, index) => {
            console.log(
              `    ${index + 1}. ${post.createdAt.toISOString().split('T')[0]} - ${post.text.substring(0, 60)}${post.text.length > 60 ? '...' : ''}`,
            );
          });

          if (storedPosts.length > 3) {
            console.log(`    ... and ${storedPosts.length - 3} more`);
          }
        }
      } catch (error) {
        console.log(
          `  ❌ Failed to store posts for @${result.handle}: ${error.message}`,
        );
      }
    }

    console.log(
      `\n💾 Total posts stored across all accounts: ${totalStoredPosts}`,
    );

    // Verify stored data
    console.log('\n🔍 Verifying stored data...');
    console.log('─'.repeat(40));

    for (const account of testAccounts) {
      try {
        const projectAccount = await projectAccountService.getProjectAccount(
          account.projectId,
        );
        if (projectAccount) {
          const recentPosts =
            await socialPostStorageService.getRecentSocialPosts(
              account.projectId,
              10,
            );

          console.log(`📊 @${account.handle} (Project: ${account.projectId}):`);
          console.log(`  • Project account exists: ✅`);
          console.log(`  • Stored posts: ${recentPosts.length}`);
          console.log(
            `  • Last Twitter fetch: ${projectAccount.lastTwitterFetch ? projectAccount.lastTwitterFetch.toISOString() : 'Never'}`,
          );
          console.log(
            `  • Latest post timestamp: ${projectAccount.latestTwitterPostTimestamp ? projectAccount.latestTwitterPostTimestamp.toISOString() : 'None'}`,
          );
        } else {
          console.log(`❌ No project account found for ${account.projectId}`);
        }
      } catch (error) {
        console.log(`❌ Error verifying ${account.handle}: ${error.message}`);
      }
    }

    // Get overall statistics
    console.log('\n📈 Database Statistics:');
    console.log('─'.repeat(40));

    const dbStats =
      await projectAccountService.getProjectCountWithSocialMedia();
    console.log(`  • Total project accounts: ${dbStats.total}`);
    console.log(`  • With Twitter handles: ${dbStats.twitter}`);
    console.log(`  • With Farcaster handles: ${dbStats.farcaster}`);

    await app.close();
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }

    console.log('\n🔧 Troubleshooting Tips:');
    console.log('1. Make sure database is running and properly configured');
    console.log('2. Check Twitter authentication (credentials or cookies)');
    console.log('3. Verify all required modules are properly imported');
    console.log('4. Ensure TypeORM entities are properly registered');
  }
}

// Main execution
if (require.main === module) {
  console.log('🧪 Twitter Service + Database Storage Test');
  console.log('Testing with @elonmusk and @naval accounts');
  console.log('═'.repeat(60));

  testTwitterWithDatabase()
    .then(() => {
      console.log('\n🎉 All done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Unhandled error:', error);
      process.exit(1);
    });
}

// npx ts-node test-twitter-with-db.ts
