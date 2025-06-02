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
 * Service for fetching Twitter posts using the @the-convocation/twitter-scraper package.
 * This service implements a dual authentication strategy: cookies first, then password fallback.
 */
@Injectable()
export class TwitterService {
  private readonly logger = new Logger(TwitterService.name);
  private readonly scraper: Scraper;
  private readonly cacheTtl: number;
  private readonly cookiesFilePath: string;
  private isAuthenticated = false;
  private authenticationPromise: Promise<void> | null = null;

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

    this.logger.log(
      'TwitterService initialized with @the-convocation/twitter-scraper',
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
