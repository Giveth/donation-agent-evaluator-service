import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Scraper, Tweet } from '@the-convocation/twitter-scraper';
import { SocialPostDto, SocialMediaPlatform } from '../dto/social-post.dto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface for batch result containing handle and its results
 */
export interface HandleResult {
  handle: string;
  posts: SocialPostDto[];
  success: boolean;
  error?: string;
}

/**
 * Service for fetching Twitter posts using the @the-convocation/twitter-scraper package.
 * This service implements a dual authentication strategy: cookies first, then password fallback.
 *
 * ## Features:
 * - Single handle tweet fetching with `getRecentTweets()`
 * - Batch processing of multiple handles with `getRecentTweetsForHandles()`
 * - Automatic rate limiting to avoid detection/blocking
 * - Retry logic with exponential backoff
 * - Database-backed persistent storage
 * - Authentication state management
 *
 * ## Batch Processing Usage:
 * ```typescript
 * // Fetch tweets for multiple handles
 * const handles = ['username1', 'username2', 'https://twitter.com/username3'];
 * const results = await twitterService.getRecentTweetsForHandles(handles);
 *
 * // Get only successful results
 * const successful = twitterService.getSuccessfulResults(results);
 *
 * // Get operation summary
 * const summary = twitterService.getBatchSummary(results);
 * console.log(`Success rate: ${summary.successRate}%`);
 * ```
 *
 * ## Rate Limiting Configuration:
 * Set these environment variables to customize rate limiting:
 * - `TWITTER_MIN_DELAY_MS`: Minimum delay between requests (default: 3000ms)
 * - `TWITTER_MAX_DELAY_MS`: Maximum delay between requests (default: 8000ms)
 * - `TWITTER_MAX_RETRIES`: Maximum retry attempts (default: 3)
 * - `TWITTER_BASE_RETRY_DELAY_MS`: Base delay for retries (default: 5000ms)
 */
@Injectable()
export class TwitterService {
  private readonly logger = new Logger(TwitterService.name);
  private readonly scraper: Scraper;
  private readonly cookiesFilePath: string;
  private isAuthenticated = false;
  private authenticationPromise: Promise<void> | null = null;

  // Rate limiting properties
  private readonly minDelayBetweenRequests: number;
  private readonly maxDelayBetweenRequests: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelay: number;
  private lastRequestTime: number = 0;

  // Posts configuration
  private readonly postsLookbackDays: number;
  private readonly maxTweetsToCollect: number;

  // Twitter account credentials
  private readonly account1: {
    username: string | undefined;
    password: string | undefined;
    email: string | undefined;
  };
  private readonly account2: {
    username: string | undefined;
    password: string | undefined;
    email: string | undefined;
  };
  private currentAccountNumber: 1 | 2 = 1;

  constructor(private readonly configService: ConfigService) {
    // Initialize the scraper
    this.scraper = new Scraper();

    // Set up cookies file path
    this.cookiesFilePath = path.join(
      process.cwd(),
      'cookies',
      'twitter_cookies.json',
    );

    // Rate limiting configuration - conservative values to avoid detection
    this.minDelayBetweenRequests =
      this.configService.get<number>('TWITTER_MIN_DELAY_MS') ?? 3000; // 3 seconds
    this.maxDelayBetweenRequests =
      this.configService.get<number>('TWITTER_MAX_DELAY_MS') ?? 8000; // 8 seconds
    this.maxRetries =
      this.configService.get<number>('TWITTER_MAX_RETRIES') ?? 3;
    this.baseRetryDelay =
      this.configService.get<number>('TWITTER_BASE_RETRY_DELAY_MS') ?? 5000; // 5 seconds

    // Posts configuration
    this.postsLookbackDays =
      this.configService.get<number>('TWITTER_POSTS_LOOKBACK_DAYS') ?? 60; // 60 days
    this.maxTweetsToCollect =
      this.configService.get<number>('TWITTER_MAX_TWEETS_TO_COLLECT') ?? 50; // Collect and fetch up to 50 tweets

    // Initialize Twitter account credentials
    this.account1 = {
      username: this.configService.get<string>('TWITTER_USERNAME'),
      password: this.configService.get<string>('TWITTER_PASSWORD'),
      email: this.configService.get<string>('TWITTER_EMAIL'),
    };
    this.account2 = {
      username: this.configService.get<string>('TWITTER_USERNAME_2'),
      password: this.configService.get<string>('TWITTER_PASSWORD_2'),
      email: this.configService.get<string>('TWITTER_EMAIL_2'),
    };

    this.logger.log(
      `TwitterService initialized with rate limiting: ${this.minDelayBetweenRequests}-${this.maxDelayBetweenRequests}ms delays, ${this.maxRetries} retries`,
    );
    this.logger.log(
      `Twitter posts configuration: ${this.postsLookbackDays} days lookback, ` +
        `max ${this.maxTweetsToCollect} tweets per fetch, ` +
        `collect up to ${this.maxTweetsToCollect} tweets`,
    );
    this.logger.log(
      `Available Twitter accounts: Account1=${this.hasValidCredentials(this.account1) ? '✓' : '❌'}, Account2=${this.hasValidCredentials(this.account2) ? '✓' : '❌'}`,
    );

    // Initialize authentication
    this.initializeAuthentication();
  }

  /**
   * Initializes Twitter authentication using environment variables.
   * This method is called during service construction.
   */
  private initializeAuthentication(): void {
    // Start authentication process asynchronously
    this.authenticationPromise = this.performAuthentication();
  }

  /**
   * Performs the actual authentication with Twitter.
   * Uses a dual strategy: cookies first, then password fallback for expired cookies.
   */
  private async performAuthentication(): Promise<void> {
    try {
      // Check if cookies are available first
      const cookiesFileExists = fs.existsSync(this.cookiesFilePath);

      if (cookiesFileExists) {
        this.logger.log(
          '🍪 Cookies available, attempting cookie authentication...',
        );
        const cookieSuccess = await this.authenticateWithCookies();
        if (cookieSuccess) {
          this.isAuthenticated = true;
          this.logger.log('✅ Twitter authentication successful (cookies)');
          return;
        } else {
          this.logger.warn(
            '⚠️ Cookie authentication failed (expired/invalid). Falling back to password authentication...',
          );
          // Continue to password authentication below
        }
      } else {
        this.logger.log(
          '🔐 No cookies available, attempting password authentication...',
        );
      }

      // Try password authentication (either no cookies available or cookies failed)
      const passwordSuccess = await this.authenticateWithPassword();
      if (passwordSuccess) {
        this.isAuthenticated = true;
        this.logger.log('✅ Twitter authentication successful (password)');

        // Save new cookies after successful password authentication
        const cookies = await this.scraper.getCookies();
        this.saveCookiesToFile(cookies);
        this.logger.log('💾 Saved fresh authentication cookies for future use');
        return;
      }

      this.logger.warn(
        '⚠️ All Twitter authentication methods failed. Service will return empty arrays for tweet requests.',
      );
    } catch (error) {
      this.logger.error(
        `❌ Twitter authentication failed: ${error.message}`,
        error.stack,
      );
      this.isAuthenticated = false;
    }
  }

  /**
   * Attempts authentication using saved cookies.
   */
  private async authenticateWithCookies(): Promise<boolean> {
    try {
      this.logger.log('🍪 Attempting authentication with cookies...');

      let cookiesData: any[] | null = null;

      // Load from file
      if (fs.existsSync(this.cookiesFilePath)) {
        try {
          const fileContent = fs.readFileSync(this.cookiesFilePath, 'utf8');
          cookiesData = JSON.parse(fileContent);
          this.logger.log(
            `✓ Loaded ${cookiesData?.length ?? 0} cookies from file`,
          );
        } catch {
          this.logger.warn('⚠️ Failed to load cookies from file');
        }
      }

      if (
        !cookiesData ||
        !Array.isArray(cookiesData) ||
        cookiesData.length === 0
      ) {
        this.logger.log(
          'ℹ️ No cookies found, will try password authentication',
        );
        return false;
      }

      // Check for essential cookies - handle both 'name' and 'key' fields
      const hasAuthToken = cookiesData.some(
        c => (c.name ?? c.key) === 'auth_token',
      );
      const hasCt0 = cookiesData.some(c => (c.name ?? c.key) === 'ct0');

      this.logger.log(
        `📋 Cookie check: auth_token=${hasAuthToken ? '✓' : '❌'}, ct0=${hasCt0 ? '✓' : '❌'}`,
      );

      if (!hasAuthToken) {
        this.logger.warn(
          '⚠️ Missing auth_token cookie - authentication will likely fail',
        );
      }

      // Normalize cookies to expected format
      const normalizedCookies = cookiesData.map(cookie => {
        // Handle both 'name'/'key' and 'value' fields
        const normalized = {
          ...cookie,
          name: cookie.name ?? cookie.key,
          value: cookie.value,
        };

        // Remove the 'key' field if it exists to avoid confusion
        if (normalized.key && normalized.name) {
          delete normalized.key;
        }

        // Fix domain compatibility - convert all domains to x.com since that's what the scraper uses
        if (normalized.domain) {
          // Convert all twitter.com domains to x.com domains
          if (
            normalized.domain === '.twitter.com' ||
            normalized.domain === 'twitter.com'
          ) {
            normalized.domain = normalized.domain.replace(
              'twitter.com',
              'x.com',
            );
          }
          // Ensure x.com domains are properly formatted
          else if (normalized.domain === 'x.com') {
            normalized.domain = '.x.com';
          }
        }

        return normalized;
      });

      this.logger.log(
        `📋 Normalized ${normalizedCookies.length} cookies for authentication`,
      );

      // Convert cookies to string format (required by the twitter-scraper library)
      const cookieStrings = normalizedCookies.map(cookie => {
        const parts = [`${cookie.name}=${cookie.value}`];
        if (cookie.domain) parts.push(`Domain=${cookie.domain}`);
        if (cookie.path) parts.push(`Path=${cookie.path}`);
        if (cookie.expires) parts.push(`Expires=${cookie.expires}`);
        if (cookie.httpOnly) parts.push('HttpOnly');
        if (cookie.secure) parts.push('Secure');
        return parts.join('; ');
      });

      this.logger.log(
        `📋 Setting ${cookieStrings.length} cookies for authentication`,
      );

      try {
        await this.scraper.setCookies(cookieStrings);
      } catch (error) {
        // Fallback: try with original cookie data format
        this.logger.warn(
          `⚠️ Cookie strings failed: ${error.message}. Trying fallback format...`,
        );
        await this.scraper.setCookies(cookiesData);
      }

      // Verify authentication
      const isLoggedIn = await this.scraper.isLoggedIn();
      if (isLoggedIn) {
        // Save current cookies for future use (they might be updated)
        const currentCookies = await this.scraper.getCookies();
        // Removed verbose cookie logging for production
        this.saveCookiesToFile(currentCookies);
        return true;
      } else {
        this.logger.warn('⚠️ Cookies loaded but not authenticated');
        return false;
      }
    } catch (error) {
      this.logger.error(`❌ Cookie authentication failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Checks if an account has valid credentials.
   */
  private hasValidCredentials(account: {
    username: string | undefined;
    password: string | undefined;
    email: string | undefined;
  }): boolean {
    return !!(account.username && account.password && account.email);
  }

  /**
   * Randomly selects a Twitter account for authentication.
   * Returns 1 or 2 based on random selection.
   */
  private selectRandomAccount(): 1 | 2 {
    const availableAccounts: Array<1 | 2> = [];

    if (this.hasValidCredentials(this.account1)) {
      availableAccounts.push(1);
    }
    if (this.hasValidCredentials(this.account2)) {
      availableAccounts.push(2);
    }

    if (availableAccounts.length === 0) {
      this.logger.warn('⚠️ No valid Twitter accounts available');
      return 1; // Default to account 1
    }

    // Random selection from available accounts
    const selectedAccount =
      availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
    this.logger.log(
      `🎲 Randomly selected Twitter account ${selectedAccount} for authentication`,
    );
    return selectedAccount;
  }

  /**
   * Gets the alternative account number for fallback.
   */
  private getAlternativeAccount(currentAccount: 1 | 2): 1 | 2 {
    return currentAccount === 1 ? 2 : 1;
  }

  /**
   * Gets account credentials by account number.
   */
  private getAccountCredentials(accountNumber: 1 | 2): {
    username: string | undefined;
    password: string | undefined;
    email: string | undefined;
  } {
    return accountNumber === 1 ? this.account1 : this.account2;
  }

  /**
   * Attempts authentication using username/password credentials.
   * Uses random account selection with automatic fallback.
   */
  private async authenticateWithPassword(): Promise<boolean> {
    // Check if we have any valid accounts before attempting authentication
    const hasAccount1 = this.hasValidCredentials(this.account1);
    const hasAccount2 = this.hasValidCredentials(this.account2);

    if (!hasAccount1 && !hasAccount2) {
      this.logger.warn(
        '⚠️ No valid Twitter account credentials available for password authentication',
      );
      return false;
    }

    // First, randomly select an account to try
    this.currentAccountNumber = this.selectRandomAccount();

    // Try the randomly selected account first
    let success = await this.tryAuthenticateWithAccount(
      this.currentAccountNumber,
    );

    if (!success) {
      // If first account failed, try the alternative account
      const alternativeAccount = this.getAlternativeAccount(
        this.currentAccountNumber,
      );
      if (
        this.hasValidCredentials(this.getAccountCredentials(alternativeAccount))
      ) {
        this.logger.log(
          `⚡ Falling back to Twitter account ${alternativeAccount}...`,
        );
        this.currentAccountNumber = alternativeAccount;
        success = await this.tryAuthenticateWithAccount(alternativeAccount);
      } else {
        this.logger.warn(
          `⚠️ Alternative Twitter account ${alternativeAccount} has invalid credentials, cannot fallback`,
        );
      }
    }

    if (success) {
      // Save cookies after successful login
      const cookies = await this.scraper.getCookies();
      this.saveCookiesToFile(cookies);
      this.logger.log(
        `💾 Saved authentication cookies for future use (Account ${this.currentAccountNumber})`,
      );
    }

    return success;
  }

  /**
   * Attempts authentication with a specific account number.
   */
  private async tryAuthenticateWithAccount(
    accountNumber: 1 | 2,
  ): Promise<boolean> {
    try {
      const account = this.getAccountCredentials(accountNumber);

      if (!this.hasValidCredentials(account)) {
        this.logger.warn(
          `⚠️ Twitter account ${accountNumber} credentials not provided or incomplete.`,
        );
        return false;
      }

      this.logger.log(
        `🔐 Attempting password authentication with account ${accountNumber}...`,
      );

      await this.scraper.login(
        account.username!,
        account.password!,
        account.email,
      );

      this.logger.log(
        `✅ Password authentication successful with account ${accountNumber}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `❌ Password authentication failed with account ${accountNumber}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Saves cookies to file for future authentication.
   */
  private saveCookiesToFile(cookies: any[]): void {
    try {
      fs.writeFileSync(this.cookiesFilePath, JSON.stringify(cookies, null, 2));
      this.logger.log(`💾 Cookies saved to ${this.cookiesFilePath}`);
    } catch (error) {
      this.logger.warn(`⚠️ Failed to save cookies: ${error.message}`);
    }
  }

  /**
   * Ensures the scraper is authenticated before making requests.
   * Waits for authentication to complete if it's still in progress.
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.authenticationPromise) {
      await this.authenticationPromise;
      this.authenticationPromise = null;
    }
  }

  /**
   * Checks if the scraper is currently authenticated.
   *
   * @returns Promise<boolean> - True if authenticated
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.ensureAuthenticated();
      return await this.scraper.isLoggedIn();
    } catch (error) {
      this.logger.error('Error checking login status:', error.message);
      return false;
    }
  }

  /**
   * Fetches recent tweets for a given Twitter username or profile URL.
   * Returns up to 10 most recent tweets from the last 90 days.
   * Now optimized to work with URL-based storage from Impact Graph.
   *
   * @param twitterUrl - The Twitter username (without @) or full profile URL
   * @returns Promise<SocialPostDto[]> - Array of recent tweets mapped to SocialPostDto
   */
  async getRecentTweets(twitterUrl: string): Promise<SocialPostDto[]> {
    if (!this.isValidTwitterInput(twitterUrl)) {
      this.logger.warn('Empty or invalid Twitter URL/handle provided');
      return [];
    }

    // Extract username from URL or clean the handle
    const username = this.extractUsernameFromTwitterUrl(twitterUrl);

    try {
      // Ensure we're authenticated before making requests
      await this.ensureAuthenticated();

      if (!this.isAuthenticated) {
        this.logger.warn(
          `Cannot fetch tweets for ${username}: Not authenticated. Returning empty array.`,
        );
        return [];
      }

      return await this.getRecentTweetsInternal(username);
    } catch (error) {
      this.logger.error(
        `Error fetching tweets for ${username}: ${error.message}`,
        error.stack,
      );

      // Return empty array on error but don't throw - this allows the evaluation to continue
      // with a score of 0 for social media components
      return [];
    }
  }

  /**
   * Internal method that fetches recent tweets for a clean handle.
   * Used by both getRecentTweets and fetchTweetsWithRetry to avoid code duplication.
   *
   * @param cleanHandle - Already cleaned Twitter handle
   * @returns Promise<SocialPostDto[]> - Array of recent tweets mapped to SocialPostDto
   */
  private async getRecentTweetsInternal(
    cleanHandle: string,
  ): Promise<SocialPostDto[]> {
    this.logger.log(`Fetching fresh Twitter posts for ${cleanHandle}`);

    // Fetch tweets using the scraper
    const tweets: Tweet[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.postsLookbackDays);

    // Get tweets from the user's timeline
    let count = 0;
    for await (const tweet of this.scraper.getTweets(
      cleanHandle,
      this.maxTweetsToCollect,
    )) {
      // Fetch configurable number of tweets to have buffer for filtering (need 45+ for full score)
      // Stop if we have enough tweets or if tweet is too old
      if (tweets.length >= this.maxTweetsToCollect) {
        break;
      }

      // Skip pinned tweets unless they meet our date criteria
      // Pinned tweets can be old and break chronological order
      if (tweet.isPin) {
        // Only include pinned tweets if they're within our date range
        if (tweet.timeParsed && tweet.timeParsed >= cutoffDate) {
          this.logger.debug(
            `${cleanHandle} - Including pinned tweet ${tweet.id} from ${tweet.timeParsed.toISOString()} (within date range)`,
          );
          tweets.push(tweet);
        } else {
          this.logger.debug(
            `${cleanHandle} - Skipping pinned tweet ${tweet.id} (outside date range or no timestamp)`,
          );
        }
        continue;
      }

      // Filter tweets from last N days (configurable)
      if (tweet.timeParsed && tweet.timeParsed >= cutoffDate) {
        tweets.push(tweet);
      } else if (tweet.timeParsed && tweet.timeParsed < cutoffDate) {
        // Skip old tweets but don't break immediately as there might be more recent tweets
        this.logger.debug(
          `${cleanHandle} - Tweet ${tweet.id} is older than ${this.postsLookbackDays} days, skipping`,
        );
      } else {
        this.logger.debug(
          `${cleanHandle} - Tweet ${tweet.id} has no timeParsed or invalid date`,
        );
      }

      count++;
      if (count >= this.maxTweetsToCollect) break; // Safety limit
    }

    // Filter out pure retweets but keep quote tweets and originals
    const filteredTweets = tweets.filter(tweet => {
      // Keep original tweets (not retweets)
      if (!tweet.isRetweet) return true;

      // Keep quote tweets (retweets with user commentary)
      if (tweet.isQuoted) return true;

      // Filter out pure retweets (RT without commentary)
      return false;
    });

    const retweetsFiltered = tweets.length - filteredTweets.length;
    if (retweetsFiltered > 0) {
      this.logger.log(
        `${cleanHandle} - Filtered out ${retweetsFiltered} pure retweets, keeping ${filteredTweets.length} original/quote tweets`,
      );
    }

    // Map to SocialPostDto
    const socialPosts = filteredTweets.map(tweet =>
      this.mapTweetToSocialPost(tweet),
    );

    this.logger.log(
      `Successfully fetched ${socialPosts.length} tweets for ${cleanHandle}`,
    );
    return socialPosts;
  }

  /**
   * Validates if a Twitter input (URL or handle) is properly formatted and not empty.
   *
   * @param input - The Twitter URL or handle to validate
   * @returns boolean indicating if the input is valid
   */
  isValidTwitterInput(input: string | null | undefined): boolean {
    if (!input) return false;

    const trimmed = input.trim();
    if (trimmed.length === 0) return false;

    // Check if it's a URL
    if (this.isTwitterUrl(trimmed)) {
      return true;
    }

    // Basic validation for username - handle should not contain spaces or special chars
    // (except @ which will be cleaned by extractUsernameFromTwitterUrl)
    const validHandleRegex = /^@?[A-Za-z0-9_]+$/;
    return validHandleRegex.test(trimmed);
  }

  /**
   * Validates if a Twitter handle is properly formatted and not empty.
   * Kept for backward compatibility.
   *
   * @param handle - The Twitter handle to validate
   * @returns boolean indicating if the handle is valid
   */
  isValidTwitterHandle(handle: string | null | undefined): boolean {
    return this.isValidTwitterInput(handle);
  }

  /**
   * Checks if a string is a Twitter/X URL.
   *
   * @param input - The input string to check
   * @returns boolean indicating if it's a Twitter/X URL
   */
  isTwitterUrl(input: string): boolean {
    const trimmed = input.trim().toLowerCase();
    return trimmed.includes('twitter.com/') || trimmed.includes('x.com/');
  }

  /**
   * Extracts username from Twitter/X URL or cleans a handle.
   * Works with both URLs and plain usernames.
   *
   * @param input - Raw Twitter URL or username
   * @returns Clean username without @ symbol
   */
  extractUsernameFromTwitterUrl(input: string): string {
    const trimmed = input.trim();

    // If it's a URL, extract the username
    if (this.isTwitterUrl(trimmed)) {
      const urlMatch = trimmed.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/);
      if (urlMatch?.[1]) {
        return this.cleanUsername(urlMatch[1]);
      }
    }

    // If it's just a username, clean it
    return this.cleanUsername(trimmed);
  }

  /**
   * Cleans a username by removing @ symbol and parameters.
   *
   * @param username - Raw username
   * @returns Clean username
   */
  private cleanUsername(username: string): string {
    let cleaned = username.trim();

    // Remove @ symbol if present
    if (cleaned.startsWith('@')) {
      cleaned = cleaned.substring(1);
    }

    // Remove any trailing parameters or paths
    const paramIndex = cleaned.indexOf('?');
    if (paramIndex !== -1) {
      cleaned = cleaned.substring(0, paramIndex);
    }

    return cleaned;
  }

  /**
   * Maps a Tweet object from the scraper to a SocialPostDto.
   *
   * @param tweet - Tweet object from @the-convocation/twitter-scraper
   * @returns SocialPostDto
   */
  private mapTweetToSocialPost(tweet: Tweet): SocialPostDto {
    return new SocialPostDto({
      id: tweet.id ?? undefined,
      text: tweet.text ?? '',
      createdAt: tweet.timeParsed ?? new Date(),
      platform: SocialMediaPlatform.TWITTER,
      url: tweet.permanentUrl ?? undefined,
    });
  }

  /**
   * Health check method to verify the service is working.
   * Can be used for testing or monitoring.
   *
   * @returns Promise<boolean> - True if service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Ensure we're authenticated
      await this.ensureAuthenticated();

      if (!this.isAuthenticated) {
        this.logger.warn('Health check failed: Not authenticated');
        return false;
      }

      // Try to get a few tweets from a known public account for health check
      // Using a reliable public account that's likely to have recent tweets
      const testTweets: Tweet[] = [];
      let count = 0;

      for await (const tweet of this.scraper.getTweets('twitter', 3)) {
        testTweets.push(tweet);
        count++;
        if (count >= 3) break;
      }

      const isHealthy = testTweets.length > 0;
      this.logger.log(
        `Health check result: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`,
      );
      return isHealthy;
    } catch (error) {
      this.logger.error('TwitterService health check failed', error.stack);
      return false;
    }
  }

  /**
   * Fetches recent tweets for multiple Twitter URLs/handles with rate limiting.
   * This method ensures authentication happens only once and reuses the session
   * for all handles, with proper delays to avoid getting blocked.
   *
   * @param twitterInputs - Array of Twitter URLs or usernames (without @)
   * @returns Promise<HandleResult[]> - Array of results for each handle
   */
  async getRecentTweetsForHandles(
    twitterInputs: string[],
  ): Promise<HandleResult[]> {
    if (twitterInputs.length === 0) {
      this.logger.warn('Empty Twitter inputs array provided');
      return [];
    }

    // Filter and extract valid usernames
    const validInputs = twitterInputs.filter(input =>
      this.isValidTwitterInput(input),
    );
    if (validInputs.length < twitterInputs.length) {
      this.logger.warn(
        `Filtered out ${twitterInputs.length - validInputs.length} invalid Twitter inputs`,
      );
    }

    const usernames = validInputs.map(input =>
      this.extractUsernameFromTwitterUrl(input),
    );

    this.logger.log(
      `Starting batch fetch for ${usernames.length} handles: ${usernames.join(', ')}`,
    );

    // Ensure we're authenticated before starting
    await this.ensureAuthenticated();

    if (!this.isAuthenticated) {
      this.logger.warn(
        'Cannot fetch tweets: Not authenticated. Returning empty results for all handles.',
      );
      return usernames.map(username => ({
        handle: username,
        posts: [],
        success: false,
        error: 'Not authenticated',
      }));
    }

    const results: HandleResult[] = [];

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      this.logger.log(
        `Processing handle ${i + 1}/${usernames.length}: ${username}`,
      );

      try {
        // Apply rate limiting delay before each request (except the first one)
        if (i > 0) {
          await this.applyRateLimit();
        }

        // Fetch tweets for this handle with retry logic
        const posts = await this.fetchTweetsWithRetry(username);

        results.push({
          handle: username,
          posts,
          success: true,
        });

        this.logger.log(
          `Successfully fetched ${posts.length} tweets for ${username}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to fetch tweets for ${username}: ${error.message}`,
          error.stack,
        );

        results.push({
          handle: username,
          posts: [],
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.log(
      `Batch fetch completed: ${successCount}/${usernames.length} handles successful`,
    );

    return results;
  }

  /**
   * Applies rate limiting delay between requests to avoid detection.
   * Uses randomized delays within the configured range.
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Calculate random delay within the configured range
    const delay = Math.floor(
      Math.random() *
        (this.maxDelayBetweenRequests - this.minDelayBetweenRequests) +
        this.minDelayBetweenRequests,
    );

    // If we need to wait, apply the delay
    if (timeSinceLastRequest < delay) {
      const waitTime = delay - timeSinceLastRequest;
      this.logger.debug(`Applying rate limit: waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Fetches tweets for a single handle with retry logic and exponential backoff.
   *
   * @param handle - Clean Twitter handle
   * @returns Promise<SocialPostDto[]> - Array of tweets
   */
  private async fetchTweetsWithRetry(handle: string): Promise<SocialPostDto[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(
          `Attempt ${attempt}/${this.maxRetries} for handle: ${handle}`,
        );

        // Use the existing getRecentTweets method but skip its authentication check
        // since we've already ensured authentication at the batch level
        const tweets = await this.getRecentTweetsInternal(handle);
        return tweets;
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries) {
          // Calculate exponential backoff delay
          const retryDelay = this.baseRetryDelay * Math.pow(2, attempt - 1);
          const jitteredDelay = retryDelay + Math.random() * 1000; // Add jitter

          this.logger.warn(
            `Attempt ${attempt} failed for ${handle}: ${error.message}. Retrying in ${Math.round(jitteredDelay)}ms...`,
          );

          await this.sleep(jitteredDelay);
        }
      }
    }

    // If all retries failed, throw the last error
    if (lastError) {
      throw lastError;
    }
    throw new Error(
      `Failed to fetch tweets for ${handle} after ${this.maxRetries} attempts`,
    );
  }

  /**
   * Sleep utility function for delays.
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets only successful results from a batch operation.
   *
   * @param results - Results from getRecentTweetsForHandles
   * @returns Array of successful results with their posts
   */
  getSuccessfulResults(results: HandleResult[]): HandleResult[] {
    return results.filter(result => result.success);
  }

  /**
   * Gets a summary of batch operation results.
   *
   * @param results - Results from getRecentTweetsForHandles
   * @returns Summary object with counts and details
   */
  getBatchSummary(results: HandleResult[]): {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    failedHandles: string[];
    totalPosts: number;
  } {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalPosts = successful.reduce(
      (sum, result) => sum + result.posts.length,
      0,
    );

    return {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      successRate:
        results.length > 0 ? (successful.length / results.length) * 100 : 0,
      failedHandles: failed.map(r => r.handle),
      totalPosts,
    };
  }

  /**
   * Gets authentication status information for monitoring/debugging.
   *
   * @returns Object with authentication details
   */
  async getAuthStatus(): Promise<{
    isAuthenticated: boolean;
    isLoggedIn: boolean;
    account1CredentialsProvided: boolean;
    account2CredentialsProvided: boolean;
    currentAccountNumber: 1 | 2;
    cookiesFileExists: boolean;
  }> {
    await this.ensureAuthenticated();

    return {
      isAuthenticated: this.isAuthenticated,
      isLoggedIn: await this.isLoggedIn(),
      account1CredentialsProvided: this.hasValidCredentials(this.account1),
      account2CredentialsProvided: this.hasValidCredentials(this.account2),
      currentAccountNumber: this.currentAccountNumber,
      cookiesFileExists: fs.existsSync(this.cookiesFilePath),
    };
  }

  /**
   * Fetches recent tweets for a Twitter URL/handle with incremental fetching support.
   * Stops scraping when it encounters a tweet with a timestamp that already exists in the database.
   * This method is designed for scheduled jobs to avoid re-scraping old tweets.
   *
   * Key features:
   * - Stops when hitting tweets with timestamps that already exist in DB
   * - Skips pinned tweets (isPin=true) unless they meet date criteria
   * - Only returns new tweets not yet in database
   *
   * @param twitterInput - The Twitter URL or username (without @)
   * @param sinceTimestamp - Optional timestamp to stop scraping when older tweets are encountered
   * @returns Promise<SocialPostDto[]> - Array of new tweets not yet in database
   */
  async getRecentTweetsIncremental(
    twitterInput: string,
    sinceTimestamp?: Date,
  ): Promise<SocialPostDto[]> {
    if (!this.isValidTwitterInput(twitterInput)) {
      this.logger.warn('Empty or invalid Twitter input provided');
      return [];
    }

    const username = this.extractUsernameFromTwitterUrl(twitterInput);

    try {
      // Ensure we're authenticated before making requests
      await this.ensureAuthenticated();

      if (!this.isAuthenticated) {
        this.logger.warn(
          `Cannot fetch tweets for ${username}: Not authenticated. Returning empty array.`,
        );
        return [];
      }

      this.logger.log(
        `Fetching incremental Twitter posts for ${username}${sinceTimestamp ? ` since ${sinceTimestamp.toISOString()}` : ''}`,
      );

      // Fetch tweets using the scraper with incremental logic
      const tweets: Tweet[] = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.postsLookbackDays);

      // Use the more restrictive date (either lookback days or sinceTimestamp)
      const effectiveCutoffDate =
        sinceTimestamp && sinceTimestamp > cutoffDate
          ? sinceTimestamp
          : cutoffDate;

      this.logger.debug(
        `Effective cutoff date for ${username}: ${effectiveCutoffDate.toISOString()}`,
      );

      // Get tweets from the user's timeline
      let count = 0;
      let stoppedDueToOldTweet = false;
      let skippedPinnedTweets = 0;

      // TODO: Remove after fixing the social media data not updating issue
      this.logger.log(
        `${username} - Starting incremental tweet scraping with max ${this.maxTweetsToCollect} iterations`,
      );

      const tweetIterator = this.scraper.getTweets(
        username,
        this.maxTweetsToCollect,
      );
      // TODO: Remove after fixing the social media data not updating issue
      this.logger.log(
        `${username} - Created tweet iterator, starting iteration...`,
      );

      for await (const tweet of tweetIterator) {
        count++;

        // TODO: Remove after fixing the social media data not updating issue
        if (count === 1) {
          this.logger.log(`${username} - First tweet received from scraper!`);
        }

        // TODO: Remove after fixing the social media data not updating issue
        this.logger.debug(
          `${username} - Processing tweet #${count}: ID=${tweet.id}, ` +
            `timestamp=${tweet.timeParsed?.toISOString() ?? 'NO_TIMESTAMP'}, ` +
            `isPin=${tweet.isPin}, text="${tweet.text?.substring(0, 50)}..."`,
        );

        // Check if we've hit our limits
        if (tweets.length >= this.maxTweetsToCollect) {
          this.logger.debug(
            `${username} - Reached ${this.maxTweetsToCollect} tweets limit (incremental)`,
          );
          break;
        }

        if (count >= this.maxTweetsToCollect) {
          this.logger.debug(
            `${username} - Reached safety limit of ${this.maxTweetsToCollect} iterations (incremental)`,
          );
          break;
        }

        // Skip pinned tweets unless they meet our date criteria
        // Pinned tweets can be old and break chronological order
        if (tweet.isPin) {
          // Only include pinned tweets if they're within our date range
          if (tweet.timeParsed && tweet.timeParsed >= effectiveCutoffDate) {
            this.logger.debug(
              `${username} - Including pinned tweet ${tweet.id} from ${tweet.timeParsed.toISOString()} (within date range)`,
            );
            tweets.push(tweet);
          } else {
            this.logger.debug(
              `${username} - Skipping pinned tweet ${tweet.id} (outside date range or no timestamp)`,
            );
            skippedPinnedTweets++;
          }
          continue;
        }

        // Check if tweet is too old - STOP SCRAPING if we hit the cutoff
        // This is the key incremental fetching logic
        if (tweet.timeParsed && tweet.timeParsed < effectiveCutoffDate) {
          this.logger.log(
            `${username} - Stopping incremental fetch: Tweet ${tweet.id} from ${tweet.timeParsed.toISOString()} is older than cutoff ${effectiveCutoffDate.toISOString()}`,
          );
          stoppedDueToOldTweet = true;
          break;
        }

        // Include tweets that are within the time range
        if (tweet.timeParsed && tweet.timeParsed >= effectiveCutoffDate) {
          tweets.push(tweet);
          this.logger.debug(
            `${username} - Added tweet ${tweet.id} from ${tweet.timeParsed.toISOString()} (incremental)`,
          );
        } else if (!tweet.timeParsed) {
          this.logger.debug(
            `${username} - Tweet ${tweet.id} has no timeParsed, skipping (incremental)`,
          );
        }
      }

      // TODO: Remove after fixing the social media data not updating issue
      this.logger.log(`${username} - Exited tweet iterator loop`);

      // TODO: Remove after fixing the social media data not updating issue
      this.logger.log(
        `${username} - Finished scraping: processed ${count} tweets, ` +
          `collected ${tweets.length} valid tweets, ` +
          `stopped due to old tweet: ${stoppedDueToOldTweet}, ` +
          `skipped pinned tweets: ${skippedPinnedTweets}`,
      );

      // Filter out pure retweets but keep quote tweets and originals
      const filteredTweets = tweets.filter(tweet => {
        // Keep original tweets (not retweets)
        if (!tweet.isRetweet) return true;

        // Keep quote tweets (retweets with user commentary)
        if (tweet.isQuoted) return true;

        // Filter out pure retweets (RT without commentary)
        return false;
      });

      const retweetsFiltered = tweets.length - filteredTweets.length;
      if (retweetsFiltered > 0) {
        this.logger.log(
          `${username} - Incremental: Filtered out ${retweetsFiltered} pure retweets, keeping ${filteredTweets.length} original/quote tweets`,
        );
      }

      // Map to SocialPostDto
      const socialPosts = filteredTweets.map(tweet =>
        this.mapTweetToSocialPost(tweet),
      );

      this.logger.log(
        `Incremental fetch for ${username} completed: ${socialPosts.length} new tweets found${
          stoppedDueToOldTweet ? ' (stopped due to old tweet detection)' : ''
        }${
          skippedPinnedTweets > 0
            ? ` (skipped ${skippedPinnedTweets} pinned tweets)`
            : ''
        } (processed ${count} tweets total)`,
      );

      return socialPosts;
    } catch (error) {
      this.logger.error(
        `Error in incremental fetch for ${username}: ${error.message}`,
        error.stack,
      );

      // Return empty array on error but don't throw - this allows the evaluation to continue
      // with a score of 0 for social media components
      return [];
    }
  }

  /**
   * Fetches recent tweets for multiple Twitter URLs/handles with incremental fetching support.
   * This method is optimized for scheduled jobs and batch processing.
   *
   * @param accountsData - Array of objects with URL/handle and optional sinceTimestamp for each account
   * @returns Promise<HandleResult[]> - Array of results for each handle
   */
  async getRecentTweetsForHandlesIncremental(
    accountsData: Array<{
      handle: string;
      sinceTimestamp?: Date;
    }>,
  ): Promise<HandleResult[]> {
    if (accountsData.length === 0) {
      this.logger.warn('Empty accounts array provided for incremental fetch');
      return [];
    }

    // Filter out accounts with invalid inputs
    const validAccountsData = accountsData.filter(({ handle }) =>
      this.isValidTwitterInput(handle),
    );
    if (validAccountsData.length < accountsData.length) {
      this.logger.warn(
        `Filtered out ${accountsData.length - validAccountsData.length} accounts with invalid Twitter inputs`,
      );
    }

    this.logger.log(
      `Starting incremental batch fetch for ${validAccountsData.length} handles`,
    );

    // Ensure we're authenticated before starting
    await this.ensureAuthenticated();

    if (!this.isAuthenticated) {
      this.logger.warn(
        'Cannot fetch tweets: Not authenticated. Returning empty results for all handles.',
      );
      return validAccountsData.map(({ handle }) => ({
        handle: this.extractUsernameFromTwitterUrl(handle),
        posts: [],
        success: false,
        error: 'Not authenticated',
      }));
    }

    const results: HandleResult[] = [];

    for (let i = 0; i < validAccountsData.length; i++) {
      const { handle, sinceTimestamp } = validAccountsData[i];
      const username = this.extractUsernameFromTwitterUrl(handle);

      this.logger.log(
        `Processing handle ${i + 1}/${validAccountsData.length}: ${username}${sinceTimestamp ? ` (since ${sinceTimestamp.toISOString()})` : ''}`,
      );

      try {
        // Apply rate limiting delay before each request (except the first one)
        if (i > 0) {
          await this.applyRateLimit();
        }

        // Fetch tweets for this handle with incremental logic
        const posts = await this.getRecentTweetsIncremental(
          handle,
          sinceTimestamp,
        );

        results.push({
          handle: username,
          posts,
          success: true,
        });

        this.logger.log(
          `Successfully fetched ${posts.length} tweets for ${username}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to fetch tweets for ${username}: ${error.message}`,
          error.stack,
        );

        results.push({
          handle: username,
          posts: [],
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.log(
      `Incremental batch fetch completed: ${successCount}/${validAccountsData.length} handles successful`,
    );

    return results;
  }
}
