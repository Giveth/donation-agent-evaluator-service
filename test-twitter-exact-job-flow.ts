import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { TwitterService } from './src/modules/social-media/services/twitter.service';
import { SocialPostStorageService } from './src/modules/social-media-storage/services/social-post-storage.service';
import { ProjectSocialAccountService } from './src/modules/social-media-storage/services/project-social-account.service';
import { TwitterFetchProcessor } from './src/modules/scheduled-jobs/processors/twitter-fetch.processor';
import {
  ScheduledJob,
  JobType,
  JobStatus,
} from './src/modules/social-media-storage/entities/scheduled-job.entity';

async function testTwitterExactJobFlow() {
  console.log('🔍 Testing Twitter Fetching - Exact Job Flow');
  console.log('═'.repeat(60));

  let app;
  try {
    // Create NestJS application context
    app = await NestFactory.createApplicationContext(AppModule);

    // Get required services - EXACT same services used by jobs
    const twitterService = app.get(TwitterService);
    const socialPostStorageService = app.get(SocialPostStorageService);
    const projectSocialAccountService = app.get(ProjectSocialAccountService);
    const twitterFetchProcessor = app.get(TwitterFetchProcessor);

    console.log('✅ NestJS application context created');
    console.log('✅ Services initialized (same as job processor)');

    // Step 1: Get Twitter projects from database (same as job scheduler)
    console.log('\n--- Step 1: Get Twitter Projects (Job Scheduler Flow) ---');
    console.log('─'.repeat(60));

    const allProjects =
      await projectSocialAccountService.getProjectsForScheduling();
    const twitterProjects = allProjects.filter(project => project.xUrl);

    console.log(`📊 Total projects: ${allProjects.length}`);
    console.log(`📊 Twitter projects: ${twitterProjects.length}`);

    if (twitterProjects.length === 0) {
      console.log('❌ No Twitter projects found - cannot test job flow');
      return;
    }

    // Display first 3 Twitter projects
    const testProjects = twitterProjects.slice(0, 3);
    console.log('\n📋 Test Projects (same as job would process):');
    testProjects.forEach((project, index) => {
      console.log(`${index + 1}. ${project.title} (ID: ${project.projectId})`);
      console.log(`   X URL: ${project.xUrl}`);
      console.log(
        `   Last fetch: ${project.lastXFetchedAt?.toISOString() || 'Never'}`,
      );
      console.log(
        `   Latest timestamp: ${project.latestXPostTimestamp?.toISOString() || 'None'}`,
      );
    });

    // Step 2: Test TwitterService.getRecentTweetsIncremental() - EXACT method used by jobs
    console.log(
      '\n--- Step 2: Test TwitterService.getRecentTweetsIncremental() ---',
    );
    console.log('─'.repeat(60));

    const testProject = testProjects[0];
    console.log(`🐦 Testing with project: ${testProject.title}`);
    console.log(`🐦 X URL: ${testProject.xUrl}`);
    console.log(
      `🐦 Latest timestamp: ${testProject.latestXPostTimestamp?.toISOString() || 'None'}`,
    );

    const fetchStartTime = Date.now();
    try {
      // EXACT same method call as TwitterFetchProcessor.processTwitterFetch()
      const tweets = await twitterService.getRecentTweetsIncremental(
        testProject.xUrl,
        testProject.latestXPostTimestamp || undefined,
      );
      const fetchEndTime = Date.now();

      console.log(
        `✅ getRecentTweetsIncremental() completed in ${fetchEndTime - fetchStartTime}ms`,
      );
      console.log(`📊 Tweets fetched: ${tweets.length}`);

      if (tweets.length > 0) {
        console.log('\n📱 Sample Tweets:');
        tweets.slice(0, 2).forEach((tweet, index) => {
          console.log(`\n${index + 1}. ${tweet.createdAt.toISOString()}`);
          console.log(
            `   Content: ${tweet.text.substring(0, 100)}${tweet.text.length > 100 ? '...' : ''}`,
          );
          console.log(`   URL: ${tweet.url}`);
          console.log(`   Platform: ${tweet.platform}`);
        });

        // Step 3: Test SocialPostStorageService.storeSocialPostsIncremental() - EXACT method used by jobs
        console.log(
          '\n--- Step 3: Test SocialPostStorageService.storeSocialPostsIncremental() ---',
        );
        console.log('─'.repeat(60));

        const storageStartTime = Date.now();
        try {
          // EXACT same method call as TwitterFetchProcessor.processTwitterFetch()
          const storageResults =
            await socialPostStorageService.storeSocialPostsIncremental(
              testProject.projectId.toString(),
              tweets,
            );
          const storageEndTime = Date.now();

          console.log(
            `✅ storeSocialPostsIncremental() completed in ${storageEndTime - storageStartTime}ms`,
          );
          console.log(`📊 Storage Results:`);
          console.log(`   - Stored: ${storageResults.stored}`);
          console.log(`   - Duplicates: ${storageResults.duplicates}`);
          console.log(`   - Errors: ${storageResults.errors}`);

          // Step 4: Verify database state (same verification as job processor)
          console.log('\n--- Step 4: Verify Database State ---');
          console.log('─'.repeat(60));

          const verificationPosts =
            await socialPostStorageService.getRecentSocialPosts(
              testProject.id,
              { limit: 10, maxAgeDays: 30 },
            );

          const twitterPosts = verificationPosts.filter(
            post => post.metadata?.platform === 'twitter',
          );

          console.log(`📊 Verification Results:`);
          console.log(`   - Total posts in DB: ${verificationPosts.length}`);
          console.log(`   - Twitter posts in DB: ${twitterPosts.length}`);
          console.log(
            `   - Latest Twitter post: ${twitterPosts[0]?.postTimestamp?.toISOString() || 'None'}`,
          );
        } catch (storageError) {
          console.error('❌ Database storage failed:');
          console.error('   Error:', storageError.message);
          if (storageError.stack) {
            console.error(
              '   Stack trace:',
              storageError.stack.split('\n').slice(0, 5).join('\n'),
            );
          }
        }
      } else {
        console.log('ℹ️  No tweets fetched - likely authentication issue');
      }
    } catch (fetchError) {
      const fetchEndTime = Date.now();
      console.error(
        `❌ getRecentTweetsIncremental() failed after ${fetchEndTime - fetchStartTime}ms:`,
      );
      console.error('   Error:', fetchError.message);

      // Detailed error analysis
      if (fetchError.code) {
        console.error('   Error Code:', fetchError.code);
      }
      if (fetchError.status) {
        console.error('   HTTP Status:', fetchError.status);
      }

      // Classify error type
      const errorMessage = fetchError.message.toLowerCase();
      if (
        errorMessage.includes('auth') ||
        errorMessage.includes('login') ||
        errorMessage.includes('credential') ||
        errorMessage.includes('unauthorized')
      ) {
        console.error('🔐 Analysis: AUTHENTICATION ISSUE');
        console.error('   - Twitter cookies may be expired');
        console.error('   - Account may be restricted or suspended');
      }

      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('etimedout') ||
        fetchError.code === 'ETIMEDOUT'
      ) {
        console.error('🕐 Analysis: TIMEOUT ISSUE');
        console.error(
          '   - Request took too long (likely authentication hanging)',
        );
        console.error('   - Network connectivity or rate limiting issue');
      }

      if (
        errorMessage.includes('rate') ||
        errorMessage.includes('limit') ||
        fetchError.status === 429
      ) {
        console.error('⏰ Analysis: RATE LIMITING ISSUE');
        console.error('   - Too many requests detected by Twitter');
        console.error('   - Need to increase delays or refresh credentials');
      }
    }

    // Step 5: Test TwitterFetchProcessor directly (complete job simulation)
    console.log(
      '\n--- Step 5: Test TwitterFetchProcessor.processTwitterFetch() ---',
    );
    console.log('─'.repeat(60));

    try {
      // Create a mock ScheduledJob exactly like the job processor would receive
      const mockJob: ScheduledJob = {
        id: `test-job-${Date.now()}`,
        projectId: testProject.projectId.toString(),
        jobType: JobType.TWEET_FETCH,
        metadata: {
          projectId: testProject.projectId,
          projectSocialAccountId: testProject.id,
          xUrl: testProject.xUrl,
        },
        status: JobStatus.PENDING,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduledFor: new Date(),
      };

      console.log(
        `🔄 Simulating TwitterFetchProcessor.processTwitterFetch() for job:`,
      );
      console.log(`   Job Type: ${mockJob.jobType}`);
      console.log(`   Project ID: ${mockJob.metadata?.projectId}`);
      console.log(`   X URL: ${mockJob.metadata?.xUrl}`);

      const processorStartTime = Date.now();

      // Call the EXACT same method that job processor calls
      await twitterFetchProcessor.processTwitterFetch(mockJob);

      const processorEndTime = Date.now();
      console.log(
        `✅ TwitterFetchProcessor.processTwitterFetch() completed in ${processorEndTime - processorStartTime}ms`,
      );

      // Check final state
      const updatedAccount = await projectSocialAccountService.findById(
        testProject.id,
      );
      console.log(`📊 Final Account State:`);
      console.log(
        `   - Last fetched: ${updatedAccount.lastXFetchedAt?.toISOString() || 'Never'}`,
      );
      console.log(
        `   - Latest timestamp: ${updatedAccount.latestXPostTimestamp?.toISOString() || 'None'}`,
      );
      console.log(`   - X posts count: ${updatedAccount.xPostsCount || 0}`);
    } catch (processorError) {
      console.error('❌ TwitterFetchProcessor failed:');
      console.error('   Error:', processorError.message);
      if (processorError.stack) {
        console.error(
          '   Stack trace:',
          processorError.stack.split('\n').slice(0, 5).join('\n'),
        );
      }
    }

    console.log('\n✅ Twitter Job Flow Testing Completed');
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  } finally {
    if (app) {
      await app.close();
      console.log('\n✅ Application context closed');
    }
  }
}

// Main execution
if (require.main === module) {
  testTwitterExactJobFlow()
    .then(() => {
      console.log('\n🎉 Twitter job flow test completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Unhandled error:', error);
      process.exit(1);
    });
}
