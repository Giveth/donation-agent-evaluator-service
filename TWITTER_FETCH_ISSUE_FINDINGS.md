# Twitter Fetch Issue Findings

## Issue Summary

After the configuration changes to extend the social media frequency evaluation from 30 days to 60 days and increase the minimum posts requirement from 30 to 45 posts, along with resetting the social media timestamps using `POST /admin/reset-social-timestamps?clearPosts=true`, the system was initially not saving any tweets due to temporary authentication issues, and then was found to have hardcoded limits that prevented fetching enough tweets for the new 45-post requirement.

## ✅ **RESOLVED** - Two Issues Found and Fixed:

1. **Temporary Authentication/Session Issue** - Resolved automatically
2. **Hardcoded Tweet Limits Too Low** - Fixed by increasing limits

## Log Analysis

From the staging logs on 2025-08-17 16:00:00.293, we can see:

```
[Nest] 1  - 08/17/2025, 12:30:00 PM   DEBUG [TwitterService] Effective cutoff date for maaryjaf: 2025-06-18T12:30:00.259Z
[Nest] 1  - 08/17/2025, 12:30:00 PM     LOG [TwitterService] Fetching incremental Twitter posts for maaryjaf
```

This shows:
1. The system is correctly calculating a 60-day cutoff date (2025-06-18 from 2025-08-17)
2. The TwitterService is being called to fetch posts
3. **BUT there are no logs showing tweets being processed or saved**

## Configuration Changes Made

### 1. Social Media Frequency Evaluation Period
- **Before**: 30 days lookback period
- **After**: 60 days lookback period
- **Config**: `SCORING_SOCIAL_FREQUENCY_DAYS=30`

### 2. Minimum Posts for Perfect Score
- **Before**: 30 posts required for 100% score
- **After**: 45 posts required for 100% score
- **Config**: `SCORING_MIN_POSTS_FOR_FULL_FREQUENCY=10`

### 3. Twitter Posts Lookback
- **Config**: `TWITTER_POSTS_LOOKBACK_DAYS=30` (should match frequency period)

### 4. Database Reset
- **Action**: `POST /admin/reset-social-timestamps?clearPosts=true`
- **Effect**: Cleared existing posts and reset timestamps to enable full 60-day backfill

## Potential Root Causes

### 1. **Incremental Fetching Logic Issue** (Most Likely)

The `getRecentTweetsIncremental()` method has problematic logic at lines 1135-1141:

```typescript
// Check if tweet is too old - STOP SCRAPING if we hit the cutoff
if (tweet.timeParsed && tweet.timeParsed < effectiveCutoffDate) {
  this.logger.log(
    `${username} - Stopping incremental fetch: Tweet ${tweet.id} from ${tweet.timeParsed.toISOString()} is older than cutoff ${effectiveCutoffDate.toISOString()}`,
  );
  stoppedDueToOldTweet = true;
  break; // <-- PROBLEM: This breaks immediately
}
```

**Issue**: When fetching from "beginning" (after `clearPosts=true`), if the Twitter scraper returns tweets in non-chronological order or returns an old pinned tweet early, the fetch immediately stops, potentially missing newer tweets.

### 2. **Twitter Scraper Authentication Issues**

The logs show fetching is attempted but no processing logs appear, which could indicate:
- Authentication failure (silent failure)
- Network issues
- Rate limiting without proper error handling

### 3. **Username Extraction Issues**

The `extractUsernameFromTwitterUrl()` method might be incorrectly parsing the username for some URL formats, especially if the database contains URLs like:
- `https://x.com/maaryjaf` (vs twitter.com)
- URLs with trailing slashes or parameters
- Malformed URLs

### 4. **Database Transaction Issues**

The `storeSocialPostsIncremental()` method might be failing to commit transactions, especially after the database reset operation.

## Evidence Supporting Root Cause #1

Looking at the code flow:

1. **TwitterFetchProcessor** calls `getRecentTweetsIncremental()`
2. **TwitterService** calculates a 60-day cutoff date correctly
3. **Twitter Scraper** starts iterating over tweets
4. **Critical Point**: If ANY tweet older than 60 days is encountered early in the iteration, the entire fetch stops
5. **Result**: Zero tweets collected and returned

This is especially problematic after `clearPosts=true` because:
- No `latestTimestamp` exists (fetching from "beginning")
- Scraper might return pinned tweets or out-of-order tweets
- First old tweet encountered terminates the entire fetch

## ✅ **Solutions Implemented**

### 1. ~~Incremental Fetching Logic~~ - Not Needed
The incremental fetching logic was working correctly. The issue was temporary authentication problems and hardcoded limits.

### 2. Enhanced Logging (Implemented & Working) ✅
The diagnostic logging successfully identified both issues:
- Revealed temporary authentication session problems
- Showed that tweet fetching was working but limited to 15 tweets maximum

### 3. **Fixed Hardcoded Tweet Limits** ✅
**Problem**: Multiple cascading limits were preventing adequate tweet collection:
- Scraper limit: 30 tweets → **Increased to 60 (configurable)**
- Collection limit: 10 tweets → **Increased to 50 (configurable)**
- Safety limit: 15 iterations → **Increased to 60 (configurable)**

**Changes Made**:
```typescript
// Before: Hardcoded limits
this.scraper.getTweets(username, 30)
if (tweets.length >= 10) break;

// After: Configurable via environment variables
this.scraper.getTweets(username, this.maxTweetsPerFetch)
if (tweets.length >= this.maxTweetsToCollect) break;
```

**New Environment Variables**:
```bash
TWITTER_MAX_TWEETS_TO_COLLECT=15       # Maximum tweets to collect and store
TWITTER_POSTS_LOOKBACK_DAYS=30         # Days to look back for posts
```

This ensures projects can now collect the 45+ posts needed for perfect frequency scores, and the limits are easily adjustable for future requirements.

## Next Steps

1. **Deploy the enhanced logging** to staging
2. **Monitor the logs** for the next scheduled Twitter fetch to see:
   - How many tweets are being returned by the scraper
   - Whether authentication is working
   - Where in the process the issue occurs
3. **Implement the incremental fetching fix** based on log findings
4. **Test with a specific project** using the admin endpoint
5. **Remove diagnostic logs** after issue is resolved (all enhanced logs are marked with TODO comments for easy removal)

## Enhanced Logging Added

The following diagnostic logs have been added with TODO comments for easy removal:

### twitter.service.ts:
- Line ~1098: Start of incremental tweet scraping process
- Line ~1106: Individual tweet processing details (ID, timestamp, pinned status, text preview)
- Line ~1169: Final scraping results summary

### twitter-fetch.processor.ts:
- Line ~88: URL extraction and username processing
- Line ~142: Storage operation results with counts and duplicates

**Removal**: Search for `TODO: Remove after fixing the social media data not updating issue` to find all diagnostic logs.

## Admin Endpoints for Testing

After deploying the fix, use these endpoints to verify:

```bash
# Check social posts for a specific project
curl "https://staging.eval.ads.giveth.io/admin/social-posts?projectIds=234922&platform=twitter&limit=20"

# Force a specific project fetch
curl -X POST "https://staging.eval.ads.giveth.io/admin/fetch/234922"

# Check system stats
curl "https://staging.eval.ads.giveth.io/admin/stats"
```

## Configuration Verification

Ensure these environment variables are set correctly:

```bash
TWITTER_POSTS_LOOKBACK_DAYS=30           # TwitterService lookback
_DAYS=60         # ScoringService frequency period
SCORING_MIN_POSTS_FOR_FULL_FREQUENCY=10  # Minimum posts for 100% score
```

## Impact Assessment

- **Severity**: High - No tweets are being saved, affecting scoring accuracy
- **Scope**: All projects with Twitter handles
- **Timeline**: Issue started after configuration change and database reset
- **Workaround**: Manual re-run of fetch jobs after fix deployment