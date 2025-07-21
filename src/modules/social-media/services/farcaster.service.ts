import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SocialPostDto, SocialMediaPlatform } from '../dto/social-post.dto';
import {
  FNameRegistryResponse,
  WarpcastCastResponse,
  FarcasterCast,
  FidLookupResult,
  CastsFetchResult,
  FarcasterConfig,
  isFNameRegistryResponse,
  isWarpcastCastResponse,
  isFarcasterCast,
} from '../dto/farcaster-types.dto';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

/**
 * Service for fetching Farcaster casts using FName Registry and Warpcast APIs.
 * This service implements a dual API strategy: FName Registry for FID resolution,
 * then Warpcast for cast fetching.
 *
 * ## Features:
 * - Username to FID resolution via FName Registry API (FREE)
 * - Cast fetching via Warpcast client API
 * - Intelligent caching (24h for FIDs, 1h for casts)
 * - Rate limiting with randomized delays (2-3 seconds)
 * - Incremental fetching to avoid re-processing old casts
 * - Comprehensive error handling and logging
 * - Batch processing with client-side filtering
 * - No API keys required - completely free
 *
 * ## Usage:
 * ```typescript
 * // Fetch recent casts for a user
 * const casts = await farcasterService.getRecentCasts('dwr.eth');
 *
 * // Incremental fetching for scheduled jobs
 * const newCasts = await farcasterService.getRecentCastsIncremental(
 *   'vitalik.eth',
 *   lastKnownTimestamp
 * );
 * ```
 *
 * ## API Endpoints Used:
 * - FName Registry: https://fnames.farcaster.xyz/transfers?name={username}
 * - Warpcast: https://client.warpcast.com/v2/profile-casts?fid={fid}&limit={limit}
 */
@Injectable()
export class FarcasterService {
  private readonly logger = new Logger(FarcasterService.name);
  private readonly config: FarcasterConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    // Load configuration with defaults
    this.config = {
      minDelayMs: this.configService.get<number>(
        'FARCASTER_MIN_DELAY_MS',
        2000,
      ),
      maxDelayMs: this.configService.get<number>(
        'FARCASTER_MAX_DELAY_MS',
        3000,
      ),
      maxRetries: this.configService.get<number>('FARCASTER_MAX_RETRIES', 3),
      lookbackDays: this.configService.get<number>(
        'FARCASTER_POSTS_LOOKBACK_DAYS',
        90,
      ),
      maxPostsPerProject: this.configService.get<number>(
        'FARCASTER_MAX_POSTS_PER_PROJECT',
        10,
      ),
      fidCacheTtl: this.configService.get<number>(
        'FARCASTER_FID_CACHE_TTL',
        86400,
      ), // 24 hours
      castsCacheTtl: this.configService.get<number>(
        'FARCASTER_CASTS_CACHE_TTL',
        3600,
      ), // 1 hour
      batchSize: this.configService.get<number>('FARCASTER_BATCH_SIZE', 30),
    };

    this.logger.log(
      'FarcasterService initialized with configuration:',
      this.config,
    );
  }

  /**
   * Fetch recent casts for a Farcaster username or URL.
   * This is the main entry point for getting Farcaster posts.
   * Now optimized to work with URL-based storage from Impact Graph.
   *
   * @param farcasterInput - The Farcaster username (e.g., 'dwr.eth', 'vitalik.eth') or full Warpcast URL
   * @returns Promise<SocialPostDto[]> - Array of recent casts converted to SocialPostDto
   */
  async getRecentCasts(farcasterInput: string): Promise<SocialPostDto[]> {
    try {
      this.logger.log(
        `Fetching recent casts for Farcaster input: ${farcasterInput}`,
      );

      // Extract username from URL or validate input
      const username = this.extractUsernameFromFarcasterUrl(farcasterInput);
      if (!username) {
        this.logger.warn(`Invalid Farcaster input: ${farcasterInput}`);
        return [];
      }

      // Step 1: Get FID from username
      const fidResult = await this.getFidByUsername(username);
      if (!fidResult.success || !fidResult.fid) {
        this.logger.warn(
          `Failed to get FID for username ${username}: ${fidResult.error}`,
        );
        return [];
      }

      // Step 2: Fetch casts using FID
      const castsResult = await this.getCastsByFid(
        fidResult.fid,
        this.config.batchSize,
      );
      if (!castsResult.success) {
        this.logger.warn(
          `Failed to fetch casts for FID ${fidResult.fid}: ${castsResult.error}`,
        );
        return [];
      }

      // Step 3: Filter and convert to SocialPostDto
      const filteredCasts = this.filterCastsByDate(
        castsResult.casts,
        this.config.lookbackDays,
      );
      const limitedCasts = filteredCasts.slice(
        0,
        this.config.maxPostsPerProject,
      );
      const socialPosts = limitedCasts.map(cast =>
        this.mapCastToSocialPost(cast),
      );

      this.logger.log(
        `Successfully fetched ${socialPosts.length} casts for ${username} (FID: ${fidResult.fid})`,
      );

      return socialPosts;
    } catch (error) {
      this.handleFarcasterError(error, `getRecentCasts for ${farcasterInput}`);
      return [];
    }
  }

  /**
   * Fetch recent casts incrementally, stopping when hitting old casts.
   * This method is optimized for scheduled jobs to avoid re-processing old data.
   *
   * @param farcasterInput - The Farcaster username or Warpcast URL
   * @param sinceTimestamp - Optional timestamp to stop fetching at
   * @returns Promise<SocialPostDto[]> - Array of new casts since the timestamp
   */
  async getRecentCastsIncremental(
    farcasterInput: string,
    sinceTimestamp?: Date,
  ): Promise<SocialPostDto[]> {
    try {
      // Extract username from URL or validate input
      const username = this.extractUsernameFromFarcasterUrl(farcasterInput);
      if (!username) {
        this.logger.warn(`Invalid Farcaster input: ${farcasterInput}`);
        return [];
      }

      this.logger.log(
        `Fetching incremental casts for ${username}${
          sinceTimestamp ? ` since ${sinceTimestamp.toISOString()}` : ''
        }`,
      );

      // Get FID from username
      const fidResult = await this.getFidByUsername(username);
      if (!fidResult.success || !fidResult.fid) {
        this.logger.warn(
          `Failed to get FID for username ${username}: ${fidResult.error}`,
        );
        return [];
      }

      // Fetch larger batch for filtering
      const castsResult = await this.getCastsByFid(
        fidResult.fid,
        this.config.batchSize,
      );
      if (!castsResult.success) {
        this.logger.warn(
          `Failed to fetch casts for FID ${fidResult.fid}: ${castsResult.error}`,
        );
        return [];
      }

      // Filter by timestamp if provided
      let filteredCasts = castsResult.casts;
      if (sinceTimestamp) {
        const sinceTimestampMs = sinceTimestamp.getTime();
        filteredCasts = filteredCasts.filter(
          cast => cast.timestamp > sinceTimestampMs,
        );

        this.logger.log(
          `Filtered ${castsResult.casts.length} casts down to ${filteredCasts.length} newer than ${sinceTimestamp.toISOString()}`,
        );
      }

      // Apply date range and limit
      const dateFilteredCasts = this.filterCastsByDate(
        filteredCasts,
        this.config.lookbackDays,
      );
      const limitedCasts = dateFilteredCasts.slice(
        0,
        this.config.maxPostsPerProject,
      );
      const socialPosts = limitedCasts.map(cast =>
        this.mapCastToSocialPost(cast),
      );

      this.logger.log(
        `Incremental fetch completed for ${username}: ${socialPosts.length} new casts`,
      );

      return socialPosts;
    } catch (error) {
      this.handleFarcasterError(
        error,
        `getRecentCastsIncremental for ${farcasterInput}`,
      );
      return [];
    }
  }

  /**
   * Resolve a Farcaster username to a Farcaster ID (FID) using FName Registry API.
   * Results are cached for 24 hours to reduce API calls.
   *
   * @param username - The Farcaster username to resolve
   * @returns Promise<FidLookupResult> - Result containing FID and success status
   */
  async getFidByUsername(username: string): Promise<FidLookupResult> {
    const cacheKey = `farcaster:fid:${username.toLowerCase()}`;

    try {
      // Check cache first
      const cachedResult =
        await this.cacheManager.get<FidLookupResult>(cacheKey);
      if (cachedResult) {
        this.logger.debug(`FID lookup cache hit for username: ${username}`);
        return { ...cachedResult, fromCache: true };
      }

      // Make API call to FName Registry (FREE - no API key needed)
      // Strip .eth suffix if present for FName registry
      const cleanUsername = username.endsWith('.eth')
        ? username.slice(0, -4)
        : username;

      const fnameRegistryUrl = this.configService.get<string>(
        'FARCASTER_FNAME_REGISTRY_URL',
        'https://fnames.farcaster.xyz',
      );
      const url = `${fnameRegistryUrl}/transfers?name=${encodeURIComponent(cleanUsername)}`;

      this.logger.debug(`Fetching FID from FName Registry: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get<FNameRegistryResponse>(url, {
          timeout: 10000,
        }),
      );

      if (!isFNameRegistryResponse(response.data)) {
        throw new Error('Invalid response format from FName Registry API');
      }

      // FName Registry response format: { transfers: [{ to: number, ... }] }
      if (response.data.transfers.length === 0) {
        const result: FidLookupResult = {
          fid: null,
          username,
          success: false,
          error: 'Username not found on Farcaster',
        };

        // Cache negative results for shorter time (1 hour)
        await this.cacheManager.set(cacheKey, result, 3600);
        return result;
      }

      // Get the most recent transfer where 'to' is not 0 (username not released)
      const activeTransfers = response.data.transfers.filter(
        transfer => transfer.to !== 0,
      );
      if (activeTransfers.length === 0) {
        const result: FidLookupResult = {
          fid: null,
          username,
          success: false,
          error: 'Username has been released and is not currently assigned',
        };

        // Cache negative results for shorter time (1 hour)
        await this.cacheManager.set(cacheKey, result, 3600);
        return result;
      }

      // Get the latest transfer (highest timestamp)
      const latestTransfer = activeTransfers.reduce((latest, current) =>
        current.timestamp > latest.timestamp ? current : latest,
      );

      const result: FidLookupResult = {
        fid: latestTransfer.to,
        username,
        success: true,
      };

      // Cache successful result
      await this.cacheManager.set(cacheKey, result, this.config.fidCacheTtl);

      this.logger.log(
        `Successfully resolved FID for ${username}: ${latestTransfer.to}`,
      );
      return result;
    } catch (error) {
      const result: FidLookupResult = {
        fid: null,
        username,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during FID lookup',
      };

      this.handleFarcasterError(error, `getFidByUsername for ${username}`);
      return result;
    }
  }

  /**
   * Fetch casts for a given FID using Warpcast client API.
   * Implements rate limiting and caching.
   *
   * @param fid - The Farcaster ID
   * @param limit - Number of casts to fetch
   * @returns Promise<CastsFetchResult> - Result containing casts and success status
   */
  async getCastsByFid(
    fid: number,
    limit: number = 30,
  ): Promise<CastsFetchResult> {
    const cacheKey = `farcaster:casts:${fid}:${limit}`;

    try {
      // Check cache first
      const cachedResult =
        await this.cacheManager.get<CastsFetchResult>(cacheKey);
      if (cachedResult) {
        this.logger.debug(`Casts cache hit for FID: ${fid}`);
        return { ...cachedResult, fromCache: true };
      }

      // Apply rate limiting
      await this.applyRateLimit();

      // Make API call to Warpcast
      const warpcastUrl = this.configService.get<string>(
        'FARCASTER_WARPCAST_API_URL',
        'https://client.warpcast.com/v2',
      );
      const url = `${warpcastUrl}/profile-casts?fid=${fid}&limit=${limit}`;

      this.logger.debug(`Fetching casts from Warpcast: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get<WarpcastCastResponse>(url, {
          timeout: 15000,
        }),
      );

      if (!isWarpcastCastResponse(response.data)) {
        throw new Error('Invalid response format from Warpcast API');
      }

      // Validate cast data
      const validCasts = response.data.result.casts.filter(isFarcasterCast);
      if (validCasts.length !== response.data.result.casts.length) {
        this.logger.warn(
          `Some casts failed validation for FID ${fid}: ${response.data.result.casts.length - validCasts.length} invalid`,
        );
      }

      const result: CastsFetchResult = {
        casts: validCasts,
        success: true,
        fetchedAt: new Date(),
      };

      // Cache successful result
      await this.cacheManager.set(cacheKey, result, this.config.castsCacheTtl);

      this.logger.log(
        `Successfully fetched ${validCasts.length} casts for FID: ${fid}`,
      );
      return result;
    } catch (error) {
      const result: CastsFetchResult = {
        casts: [],
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during casts fetch',
        fetchedAt: new Date(),
      };

      this.handleFarcasterError(error, `getCastsByFid for FID ${fid}`);
      return result;
    }
  }

  /**
   * Convert a Farcaster cast to a standardized SocialPostDto.
   *
   * @param cast - The Farcaster cast to convert
   * @returns SocialPostDto - Standardized social post object
   */
  mapCastToSocialPost(cast: FarcasterCast): SocialPostDto {
    // Generate Warpcast URL for the cast
    const url = `https://warpcast.com/${cast.author.username}/${cast.hash.slice(0, 10)}`;

    return new SocialPostDto({
      id: cast.hash,
      text: cast.text,
      createdAt: new Date(cast.timestamp), // Warpcast timestamp is already in milliseconds
      platform: SocialMediaPlatform.FARCASTER,
      url,
    });
  }

  /**
   * Checks if a string is a Farcaster/Warpcast URL.
   *
   * @param input - The input string to check
   * @returns boolean indicating if it's a Farcaster/Warpcast URL
   */
  isFarcasterUrl(input: string): boolean {
    const trimmed = input.trim().toLowerCase();
    return (
      trimmed.includes('warpcast.com/') || trimmed.includes('farcaster.xyz/')
    );
  }

  /**
   * Extracts username from Farcaster/Warpcast URL or validates a username.
   * Works with both URLs and plain usernames.
   *
   * @param input - Raw Farcaster URL or username
   * @returns Clean username or null if invalid
   */
  extractUsernameFromFarcasterUrl(input: string): string | null {
    if (!input || typeof input !== 'string') {
      return null;
    }

    const trimmed = input.trim();

    // If it's a URL, extract the username
    if (this.isFarcasterUrl(trimmed)) {
      const urlMatch = trimmed.match(
        /(?:warpcast\.com|farcaster\.xyz)\/([^/?#]+)/,
      );
      if (urlMatch?.[1]) {
        const extractedUsername = this.cleanFarcasterUsername(urlMatch[1]);
        // Validate the extracted username
        return this.isValidFarcasterUsername(extractedUsername)
          ? extractedUsername
          : null;
      }
      return null;
    }

    // If it's just a username, validate and clean it
    return this.isValidFarcasterUsername(trimmed)
      ? this.cleanFarcasterUsername(trimmed)
      : null;
  }

  /**
   * Cleans a Farcaster username by removing @ symbol.
   *
   * @param username - Raw username
   * @returns Clean username
   */
  private cleanFarcasterUsername(username: string): string {
    let cleaned = username.trim();

    // Remove @ symbol if present
    if (cleaned.startsWith('@')) {
      cleaned = cleaned.substring(1);
    }

    return cleaned;
  }

  /**
   * Validate a Farcaster username format.
   *
   * @param username - The username to validate
   * @returns boolean - Whether the username is valid
   */
  isValidFarcasterUsername(username: string): boolean {
    if (!username || typeof username !== 'string') {
      return false;
    }

    // Remove leading @ if present
    const cleanUsername = username.startsWith('@')
      ? username.slice(1)
      : username;

    // More strict validation for Farcaster usernames
    // Should not contain URLs, special characters except . and -
    const validUsernameRegex = /^[a-zA-Z0-9._-]+$/;

    return (
      cleanUsername.length > 0 &&
      cleanUsername.length <= 50 &&
      validUsernameRegex.test(cleanUsername) &&
      !cleanUsername.includes('http') &&
      !cleanUsername.includes('://') &&
      !cleanUsername.includes(' ') &&
      !cleanUsername.includes('\n') &&
      !cleanUsername.includes('\t')
    );
  }

  /**
   * Centralized error handling for Farcaster operations.
   *
   * @param error - The error that occurred
   * @param operation - Description of the operation that failed
   */
  private handleFarcasterError(error: unknown, operation: string): void {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const message =
        (error.response?.data as { message?: string } | undefined)?.message ??
        error.message;

      this.logger.error(
        `Farcaster API error during ${operation}: ${status} ${statusText} - ${message}`,
      );

      // Log rate limiting specifically
      if (status === 429) {
        this.logger.warn(
          `Rate limited during ${operation}, consider increasing delays`,
        );
      }
    } else if (error instanceof Error) {
      this.logger.error(`Error during ${operation}: ${error.message}`);
    } else {
      this.logger.error(`Unknown error during ${operation}:`, error);
    }
  }

  /**
   * Filter casts by date to only include those within the lookback period.
   *
   * @param casts - Array of casts to filter
   * @param lookbackDays - Number of days to look back
   * @returns FarcasterCast[] - Filtered array of casts
   */
  private filterCastsByDate(
    casts: FarcasterCast[],
    lookbackDays: number,
  ): FarcasterCast[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
    const cutoffTimestamp = cutoffDate.getTime(); // Keep in milliseconds

    return casts.filter(cast => cast.timestamp >= cutoffTimestamp);
  }

  /**
   * Apply rate limiting delay between API requests.
   * Uses randomized delays to avoid synchronized requests.
   */
  private async applyRateLimit(): Promise<void> {
    const delay = Math.floor(
      Math.random() * (this.config.maxDelayMs - this.config.minDelayMs) +
        this.config.minDelayMs,
    );

    this.logger.debug(`Applying rate limit delay: ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
