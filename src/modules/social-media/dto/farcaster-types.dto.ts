/**
 * TypeScript interfaces for Farcaster API responses.
 * These types define the structure of data returned by FName Registry and Warpcast APIs.
 */

/**
 * Response structure from FName Registry API for username lookup
 * Endpoint: https://fnames.farcaster.xyz/transfers?name={username}
 */
export interface FNameRegistryResponse {
  transfers: FNameTransfer[];
}

/**
 * Individual transfer record from FName Registry API
 * Represents username ownership transfers over time
 */
export interface FNameTransfer {
  /** Transfer ID */
  id: number;
  /** Unix timestamp when transfer occurred */
  timestamp: number;
  /** Username being transferred */
  username: string;
  /** Ethereum address of the owner */
  owner: string;
  /** Previous FID (0 if first assignment) */
  from: number;
  /** New FID (0 if username was released) */
  to: number;
  /** User signature for the transfer */
  user_signature: string;
  /** Server signature for the transfer */
  server_signature: string;
}

/**
 * Response structure from Warpcast API for profile casts
 * Endpoint: https://client.warpcast.com/v2/profile-casts?fid={fid}&limit={limit}
 */
export interface WarpcastCastResponse {
  result: {
    casts: FarcasterCast[];
    next?: {
      cursor?: string;
    };
  };
}

/**
 * Individual cast (post) data from Warpcast API
 */
export interface FarcasterCast {
  /** Unique hash identifier for the cast */
  hash: string;
  /** Thread hash if this is part of a conversation */
  threadHash: string;
  /** Author information */
  author: {
    /** Farcaster ID */
    fid: number;
    /** Username */
    username: string;
    /** Display name */
    displayName: string;
    /** Profile information */
    profile?: {
      bio?: {
        text: string;
        mentions?: FarcasterMention[];
        channelMentions?: string[];
      };
      location?: {
        placeId: string;
        description: string;
      };
      earlyWalletAdopter?: boolean;
      accountLevel?: string;
      bannerImageUrl?: string;
    };
    /** Follower count */
    followerCount?: number;
    /** Following count */
    followingCount?: number;
    /** Profile image information */
    pfp?: {
      url: string;
      verified: boolean;
    };
  };
  /** Cast content text */
  text: string;
  /** Timestamp when the cast was created (Unix timestamp in milliseconds) */
  timestamp: number;
  /** Reply information */
  replies?: {
    count: number;
  };
  /** Reaction information */
  reactions?: {
    count: number;
  };
  /** Recast information */
  recasts?: {
    count: number;
    recasters?: Array<{
      fid: number;
      displayName: string;
      username: string;
      recastHash: string;
    }>;
  };
  /** Watch count */
  watches?: {
    count: number;
  };
  /** Embedded content */
  embeds?: {
    images?: Array<{
      type: 'image';
      url: string;
      sourceUrl: string;
      alt: string;
      media?: {
        version: string;
        width: number;
        height: number;
        staticRaster: string;
        mimeType: string;
      };
    }>;
    urls?: Array<{
      type: 'url';
      openGraph?: {
        url: string;
        sourceUrl: string;
        title?: string;
        description?: string;
        domain?: string;
        image?: string;
        useLargeImage?: boolean;
        frameEmbedNext?: Record<string, unknown>;
        author?: Record<string, unknown>;
        imageAspectRatio?: string;
      };
    }>;
    videos?: Array<{
      type: 'video';
      url: string;
      sourceUrl: string;
      width: number;
      height: number;
      duration: number;
      thumbnailUrl: string;
    }>;
    casts?: FarcasterCast[];
    unknowns?: unknown[];
    processedCastText?: string;
    groupInvites?: unknown[];
  };
  /** Tags */
  tags?: Array<{
    type: 'channel';
    id: string;
    name: string;
    imageUrl: string;
  }>;
  /** View count */
  viewCount?: number;
  /** Quote count */
  quoteCount?: number;
  /** Combined recast count */
  combinedRecastCount?: number;
  /** Channel information */
  channel?: {
    key: string;
    name: string;
    imageUrl: string;
    authorContext?: {
      role: string;
      restricted: boolean;
      banned: boolean;
    };
    authorRole?: string;
  };
  /** Parent source */
  parentSource?: {
    type: string;
    url: string;
  };
  /** Mentions */
  mentions?: Array<{
    fid: number;
    displayName: string;
    profile?: {
      bio?: {
        text: string;
        mentions?: FarcasterMention[];
        channelMentions?: string[];
      };
      location?: {
        placeId: string;
        description: string;
      };
      earlyWalletAdopter?: boolean;
      accountLevel?: string;
      bannerImageUrl?: string;
    };
    followerCount?: number;
    followingCount?: number;
    username: string;
    pfp?: {
      url: string;
      verified: boolean;
    };
  }>;
}

/**
 * Embedded content in a Farcaster cast
 */
export interface FarcasterEmbed {
  /** Type of embed (url, image, etc.) */
  type: 'url' | 'image' | 'video' | 'cast';
  /** URL of the embedded content */
  url: string;
  /** Metadata for the embed */
  metadata?: {
    title?: string;
    description?: string;
    image?: string;
  };
}

/**
 * Mention in a Farcaster cast
 */
export interface FarcasterMention {
  /** Position in the text where mention starts */
  position: number;
  /** Length of the mention */
  length: number;
  /** Farcaster ID of mentioned user */
  fid: number;
  /** Username of mentioned user */
  username: string;
}

/**
 * Error response structure from Farcaster APIs
 */
export interface FarcasterApiError {
  /** Error message */
  message: string;
  /** HTTP status code */
  statusCode?: number;
  /** Error code from the API */
  code?: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Internal result structure for FID lookup operations
 */
export interface FidLookupResult {
  /** Farcaster ID if found */
  fid: number | null;
  /** Username that was looked up */
  username: string;
  /** Whether the lookup was successful */
  success: boolean;
  /** Error message if lookup failed */
  error?: string;
  /** Whether result came from cache */
  fromCache?: boolean;
}

/**
 * Internal result structure for cast fetching operations
 */
export interface CastsFetchResult {
  /** Array of fetched casts */
  casts: FarcasterCast[];
  /** Whether the fetch was successful */
  success: boolean;
  /** Error message if fetch failed */
  error?: string;
  /** Total number of casts available (if provided by API) */
  totalCount?: number;
  /** Whether result came from cache */
  fromCache?: boolean;
  /** Timestamp when fetch was performed */
  fetchedAt: Date;
}

/**
 * Configuration interface for Farcaster service settings
 */
export interface FarcasterConfig {
  /** Minimum delay between API requests (ms) */
  minDelayMs: number;
  /** Maximum delay between API requests (ms) */
  maxDelayMs: number;
  /** Maximum retry attempts for failed requests */
  maxRetries: number;
  /** Days to look back for posts */
  lookbackDays: number;
  /** Maximum posts per project */
  maxPostsPerProject: number;
  /** Cache TTL for FID lookups (seconds) */
  fidCacheTtl: number;
  /** Cache TTL for casts (seconds) */
  castsCacheTtl: number;
  /** Batch size for fetching casts */
  batchSize: number;
}

/**
 * Type guard to check if an object is a FNameRegistryResponse
 */
export function isFNameRegistryResponse(
  obj: unknown,
): obj is FNameRegistryResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'transfers' in obj &&
    Array.isArray((obj as Record<string, unknown>).transfers)
  );
}

/**
 * Type guard to check if an object is a WarpcastCastResponse
 */
export function isWarpcastCastResponse(
  obj: unknown,
): obj is WarpcastCastResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'result' in obj &&
    typeof (obj as Record<string, unknown>).result === 'object' &&
    (obj as Record<string, unknown>).result !== null &&
    'casts' in
      ((obj as Record<string, unknown>).result as Record<string, unknown>) &&
    Array.isArray(
      ((obj as Record<string, unknown>).result as Record<string, unknown>)
        .casts,
    )
  );
}

/**
 * Type guard to check if an object is a valid FarcasterCast
 */
export function isFarcasterCast(obj: unknown): obj is FarcasterCast {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const typedObj = obj as Record<string, unknown>;
  return (
    'hash' in typedObj &&
    typeof typedObj.hash === 'string' &&
    'text' in typedObj &&
    typeof typedObj.text === 'string' &&
    'timestamp' in typedObj &&
    typeof typedObj.timestamp === 'number' &&
    'author' in typedObj &&
    typeof typedObj.author === 'object' &&
    typedObj.author !== null &&
    'fid' in typedObj.author &&
    typeof (typedObj.author as Record<string, unknown>).fid === 'number' &&
    'username' in typedObj.author &&
    typeof (typedObj.author as Record<string, unknown>).username === 'string'
  );
}
