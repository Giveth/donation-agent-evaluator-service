import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Scraper, Tweet } from '@the-convocation/twitter-scraper';
import { SocialPostDto } from '../dto/social-post.dto';
import * as fs from 'fs';
import * as path from 'path';
import { Cookie } from 'tough-cookie';

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
 * - Comprehensive caching support
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
  private readonly cacheTtl: number;
  private readonly cookiesFilePath: string;
  private isAuthenticated = false;
  private authenticationPromise: Promise<void> | null = null;

  // Rate limiting properties
  private readonly minDelayBetweenRequests: number;
  private readonly maxDelayBetweenRequests: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelay: number;
  private lastRequestTime: number = 0;

  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    // Initialize the scraper
    this.scraper = new Scraper();

    // Get cache TTL from config, default to 6 hours (21600 seconds)
    this.cacheTtl =
      this.configService.get<number>('CACHE_TTL_SOCIAL_MEDIA') ?? 21600;

    // Set up cookies file path
    this.cookiesFilePath = path.join(process.cwd(), 'twitter_cookies.json');

    // Rate limiting configuration - conservative values to avoid detection
    this.minDelayBetweenRequests =
      this.configService.get<number>('TWITTER_MIN_DELAY_MS') ?? 3000; // 3 seconds
    this.maxDelayBetweenRequests =
      this.configService.get<number>('TWITTER_MAX_DELAY_MS') ?? 8000; // 8 seconds
    this.maxRetries =
      this.configService.get<number>('TWITTER_MAX_RETRIES') ?? 3;
    this.baseRetryDelay =
      this.configService.get<number>('TWITTER_BASE_RETRY_DELAY_MS') ?? 5000; // 5 seconds

    this.logger.log(
      `TwitterService initialized with rate limiting: ${this.minDelayBetweenRequests}-${this.maxDelayBetweenRequests}ms delays, ${this.maxRetries} retries`,
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
   * Uses a dual strategy: cookies first, then password fallback.
   */
  private async performAuthentication(): Promise<void> {
    try {
      // Try cookie authentication first
      const cookieSuccess = await this.authenticateWithCookies();
      if (cookieSuccess) {
        this.isAuthenticated = true;
        this.logger.log('✅ Twitter authentication successful (cookies)');
        return;
      }

      // Fallback to password authentication
      const passwordSuccess = await this.authenticateWithPassword();
      if (passwordSuccess) {
        this.isAuthenticated = true;
        this.logger.log('✅ Twitter authentication successful (password)');
        const cookies = await this.scraper.getCookies();
        console.log('cookiespwd', cookies);
        return;
      }

      this.logger.warn(
        '⚠️ Twitter authentication failed. Service will return empty arrays for tweet requests.',
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

      // Method 1: Load from environment variable
      const cookiesEnv = this.configService.get<string>('TWITTER_COOKIES');
      this.logger.log('cookiesEnv', cookiesEnv);

      if (cookiesEnv) {
        try {
          cookiesData = JSON.parse(cookiesEnv);
          this.logger.log(
            '✓ Loaded cookies from TWITTER_COOKIES environment variable',
          );
        } catch {
          this.logger.warn(
            '⚠️ Failed to parse TWITTER_COOKIES environment variable',
          );
        }
      }

      // Method 2: Load from file
      if (!cookiesData && fs.existsSync(this.cookiesFilePath)) {
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

      // Check for essential cookies
      const hasAuthToken = cookiesData.some(c => c.name === 'auth_token');
      const hasCt0 = cookiesData.some(c => c.name === 'ct0');

      this.logger.log(
        `📋 Cookie check: auth_token=${hasAuthToken ? '✓' : '❌'}, ct0=${hasCt0 ? '✓' : '❌'}`,
      );

      if (!hasAuthToken) {
        this.logger.warn(
          '⚠️ Missing auth_token cookie - authentication will likely fail',
        );
      }

      // Convert plain objects to proper Cookie format expected by setCookies
      // The setCookies method expects Cookie objects from the tough-cookie library
      const formattedCookies = cookiesData
        .map(cookie => {
          try {
            // Use tough-cookie's Cookie.fromJSON to create proper Cookie objects
            const cookieObj = Cookie.fromJSON(cookie);

            // Fix domain compatibility between x.com and twitter.com
            if (cookieObj?.domain) {
              if (cookieObj.domain === '.x.com') {
                // Create a copy with twitter.com domain for compatibility
                const twitterCookie = cookieObj.clone();
                twitterCookie.domain = '.twitter.com';
                return twitterCookie;
              }
            }

            return cookieObj;
          } catch (error) {
            this.logger.warn(
              `⚠️ Skipping malformed cookie: ${JSON.stringify(cookie)} - Error: ${error.message}`,
            );
            return null;
          }
        })
        .filter(cookie => cookie !== null);

      if (formattedCookies.length === 0) {
        this.logger.warn('⚠️ No valid cookies found after formatting');
        return false;
      }

      this.logger.log(
        `📋 Formatted ${formattedCookies.length} cookies for authentication`,
      );
      this.logger.log('formattedCookies', formattedCookies);
      // Set cookies using the properly formatted Cookie objects
      await this.scraper.setCookies(formattedCookies);

      // Verify authentication
      const isLoggedIn = await this.scraper.isLoggedIn();
      if (isLoggedIn) {
        // Save current cookies for future use (they might be updated)
        const currentCookies = await this.scraper.getCookies();
        console.log('currentCookies', currentCookies);
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
   * Attempts authentication using username/password credentials.
   */
  private async authenticateWithPassword(): Promise<boolean> {
    try {
      const username = this.configService.get<string>('TWITTER_USERNAME');
      const password = this.configService.get<string>('TWITTER_PASSWORD');
      const email = this.configService.get<string>('TWITTER_EMAIL');
      this.logger.log('username', username);
      if (!username || !password || !email) {
        this.logger.warn(
          '⚠️ Twitter credentials not provided. Please set TWITTER_USERNAME, TWITTER_PASSWORD, and TWITTER_EMAIL environment variables.',
        );
        return false;
      }

      this.logger.log('🔐 Attempting password authentication...');

      await this.scraper.login(username, password, email);

      // Save cookies after successful login
      const cookies = await this.scraper.getCookies();
      console.log('cookies', cookies);
      this.saveCookiesToFile(cookies);
      this.logger.log('💾 Saved authentication cookies for future use');

      return true;
    } catch (error) {
      this.logger.error(`❌ Password authentication failed: ${error.message}`);
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
   *
   * @param twitterHandle - The Twitter username (without @) or full profile URL
   * @returns Promise<SocialPostDto[]> - Array of recent tweets mapped to SocialPostDto
   */
  async getRecentTweets(twitterHandle: string): Promise<SocialPostDto[]> {
    if (!twitterHandle || twitterHandle.trim() === '') {
      this.logger.warn('Empty or invalid Twitter handle provided');
      return [];
    }

    // Clean the handle - remove @ if present and extract username from URL if needed
    const cleanHandle = this.cleanTwitterHandle(twitterHandle);
    const cacheKey = `twitter_posts_${cleanHandle}`;

    try {
      // Check cache first
      // const cachedPosts =
      //   await this.cacheManager.get<SocialPostDto[]>(cacheKey);
      // if (cachedPosts) {
      //   this.logger.debug(`Returning cached Twitter posts for ${cleanHandle}`);
      //   return cachedPosts;
      // }

      // Ensure we're authenticated before making requests
      await this.ensureAuthenticated();

      if (!this.isAuthenticated) {
        this.logger.warn(
          `Cannot fetch tweets for ${cleanHandle}: Not authenticated. Returning empty array.`,
        );
        return [];
      }

      this.logger.log(`Fetching fresh Twitter posts for ${cleanHandle}`);

      // Fetch tweets using the scraper
      const tweets: Tweet[] = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days ago

      // Get tweets from the user's timeline
      let count = 0;
      for await (const tweet of this.scraper.getTweets(cleanHandle, 15)) {
        // Fetch up to 15 to have buffer for filtering
        // Stop if we have enough tweets or if tweet is too old
        if (tweets.length >= 10) {
          break;
        }

        // Filter tweets from last 90 days
        if (tweet.timeParsed && tweet.timeParsed >= cutoffDate) {
          tweets.push(tweet);
        } else if (tweet.timeParsed && tweet.timeParsed < cutoffDate) {
          // Since tweets are generally returned in reverse chronological order,
          // we can break if we encounter an old tweet
          break;
        }

        count++;
        if (count >= 15) break; // Safety limit
      }

      // Map to SocialPostDto
      const socialPosts = tweets.map(tweet => this.mapTweetToSocialPost(tweet));

      // Cache the results
      await this.cacheManager.set(cacheKey, socialPosts, this.cacheTtl * 1000); // Convert to milliseconds

      this.logger.log(
        `Successfully fetched ${socialPosts.length} tweets for ${cleanHandle}`,
      );
      return socialPosts;
    } catch (error) {
      this.logger.error(
        `Error fetching tweets for ${cleanHandle}: ${error.message}`,
        error.stack,
      );

      // Return empty array on error but don't throw - this allows the evaluation to continue
      // with a score of 0 for social media components
      return [];
    }
  }

  /**
   * Cleans and normalizes Twitter handle input.
   * Handles both usernames and full URLs.
   *
   * @param handle - Raw Twitter handle or URL
   * @returns Clean username without @ symbol
   */
  private cleanTwitterHandle(handle: string): string {
    let cleaned = handle.trim();

    // If it's a URL, extract the username
    if (cleaned.includes('twitter.com/') || cleaned.includes('x.com/')) {
      const urlMatch = cleaned.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/);
      if (urlMatch?.[1]) {
        cleaned = urlMatch[1];
      }
    }

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
      platform: 'twitter',
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
   * Fetches recent tweets for multiple Twitter handles with rate limiting.
   * This method ensures authentication happens only once and reuses the session
   * for all handles, with proper delays to avoid getting blocked.
   *
   * @param twitterHandles - Array of Twitter usernames (without @) or full profile URLs
   * @returns Promise<HandleResult[]> - Array of results for each handle
   */
  async getRecentTweetsForHandles(
    twitterHandles: string[],
  ): Promise<HandleResult[]> {
    if (twitterHandles.length === 0) {
      this.logger.warn('Empty Twitter handles array provided');
      return [];
    }

    // Clean all handles first
    const cleanHandles = twitterHandles.map(handle =>
      this.cleanTwitterHandle(handle),
    );

    this.logger.log(
      `Starting batch fetch for ${cleanHandles.length} handles: ${cleanHandles.join(', ')}`,
    );

    // Ensure we're authenticated before starting
    await this.ensureAuthenticated();

    if (!this.isAuthenticated) {
      this.logger.warn(
        'Cannot fetch tweets: Not authenticated. Returning empty results for all handles.',
      );
      return cleanHandles.map(handle => ({
        handle,
        posts: [],
        success: false,
        error: 'Not authenticated',
      }));
    }

    const results: HandleResult[] = [];

    for (let i = 0; i < cleanHandles.length; i++) {
      const handle = cleanHandles[i];
      this.logger.log(
        `Processing handle ${i + 1}/${cleanHandles.length}: ${handle}`,
      );

      try {
        // Apply rate limiting delay before each request (except the first one)
        if (i > 0) {
          await this.applyRateLimit();
        }

        // Fetch tweets for this handle with retry logic
        const posts = await this.fetchTweetsWithRetry(handle);

        results.push({
          handle,
          posts,
          success: true,
        });

        this.logger.log(
          `Successfully fetched ${posts.length} tweets for ${handle}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to fetch tweets for ${handle}: ${error.message}`,
          error.stack,
        );

        results.push({
          handle,
          posts: [],
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.log(
      `Batch fetch completed: ${successCount}/${cleanHandles.length} handles successful`,
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

        // Use the existing getRecentTweets method but bypass its authentication check
        // since we've already ensured authentication at the batch level
        const cacheKey = `twitter_posts_${handle}`;

        // Check cache first
        const cachedPosts =
          await this.cacheManager.get<SocialPostDto[]>(cacheKey);
        if (cachedPosts) {
          this.logger.debug(`Returning cached Twitter posts for ${handle}`);
          return cachedPosts;
        }

        this.logger.debug(`Fetching fresh Twitter posts for ${handle}`);

        // Fetch tweets using the scraper
        const tweets: Tweet[] = [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 90); // 90 days ago

        // Get tweets from the user's timeline
        let count = 0;
        for await (const tweet of this.scraper.getTweets(handle, 15)) {
          // Stop if we have enough tweets or if tweet is too old
          if (tweets.length >= 10) {
            break;
          }

          // Filter tweets from last 90 days
          if (tweet.timeParsed && tweet.timeParsed >= cutoffDate) {
            tweets.push(tweet);
          } else if (tweet.timeParsed && tweet.timeParsed < cutoffDate) {
            // Since tweets are generally returned in reverse chronological order,
            // we can break if we encounter an old tweet
            break;
          }

          count++;
          if (count >= 15) break; // Safety limit
        }

        // Map to SocialPostDto
        const socialPosts = tweets.map(tweet =>
          this.mapTweetToSocialPost(tweet),
        );

        // Cache the results
        await this.cacheManager.set(
          cacheKey,
          socialPosts,
          this.cacheTtl * 1000,
        );

        return socialPosts;
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
    credentialsProvided: boolean;
    cookiesFileExists: boolean;
  }> {
    await this.ensureAuthenticated();

    const username = this.configService.get<string>('TWITTER_USERNAME');
    const password = this.configService.get<string>('TWITTER_PASSWORD');
    const email = this.configService.get<string>('TWITTER_EMAIL');

    return {
      isAuthenticated: this.isAuthenticated,
      isLoggedIn: await this.isLoggedIn(),
      credentialsProvided: !!(username && password && email),
      cookiesFileExists: fs.existsSync(this.cookiesFilePath),
    };
  }
}
