# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS-based Donation Agent Evaluator Service for the Giveth platform. The service evaluates charitable projects within "Causes" and assigns CauseScores (0-100) to determine fund distribution proportions. The evaluation uses multiple criteria including project information quality, social media activity, and relevance to the cause theme.

## Common Development Commands

```bash
# Development
npm run start:dev          # Start in watch mode
npm run start:debug        # Start with debugger

# Building
npm run build              # Build the application
npm run start:prod         # Run production build

# Code Quality (ALWAYS run before commits)
npm run code:check         # Check linting and formatting
npm run code:fix           # Fix linting and formatting issues
npm run lint:check         # Lint checking only
npm run format:check       # Format checking only

# Testing
npm run test               # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage
npm run test:e2e           # Run end-to-end tests
npm run test:debug         # Debug tests
```

## Architecture Overview

### Core Modules

- **EvaluationModule**: Orchestrates the evaluation flow and handles API requests
- **DataFetchingModule**: Interfaces with Giveth backend for Cause/Project data
- **SocialMediaModule**: Manages Twitter/Farcaster data fetching with rate limiting
- **LLMIntegrationModule**: Handles LLM interactions via OpenRouter API (Gemini 2.5 Flash)
- **ScoringModule**: Calculates individual score components and final CauseScore

### Social Media Integration

The TwitterService uses `@the-convocation/twitter-scraper` with dual authentication:

1. **Cookie-based authentication** (primary) - uses saved cookies from `twitter_cookies.json`
2. **Password authentication** (fallback) - supports dual accounts with random selection and automatic fallback:
   - Account 1: `TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_EMAIL`
   - Account 2: `TWITTER_USERNAME_2`, `TWITTER_PASSWORD_2`, `TWITTER_EMAIL_2`
   - Randomly selects between accounts, with automatic fallback to the other account if the first fails

### Scoring Rubric (Total: 100%)

- Project Information & Update Quality: 10% (LLM-assessed)
- Update Recency: 5% (calculated)
- Social Media Content Quality: 10% (LLM-assessed, split: Twitter 50%, Farcaster 50%)
- Social Media Posting Recency: 5% (calculated)
- Social Media Posting Frequency: 5% (calculated)
- Relevance to Cause: 25% (LLM-assessed, split: Twitter 33%, Farcaster 33%, Project 33%)
- Evidence of Social/Environmental Impact: 25% (LLM-assessed)
- GIVpower Rank: 15% (from Giveth DB)

## Environment Variables

```bash
# Core Configuration
NODE_ENV=development
PORT=3000

# Cache Settings
CACHE_TTL_SOCIAL_MEDIA=21600  # 6 hours in seconds

# Twitter Authentication (Method 1: Cookies)
TWITTER_COOKIES='[{"name":"auth_token","value":"..."}]'

# Twitter Authentication (Method 2: Credentials - Account 1)
TWITTER_USERNAME=your_username
TWITTER_PASSWORD=your_password
TWITTER_EMAIL=your_email

# Twitter Authentication (Method 2: Credentials - Account 2)
TWITTER_USERNAME_2=your_username_2
TWITTER_PASSWORD_2=your_password_2
TWITTER_EMAIL_2=your_email_2

# Twitter Rate Limiting
TWITTER_MIN_DELAY_MS=3000
TWITTER_MAX_DELAY_MS=8000
TWITTER_MAX_RETRIES=3
TWITTER_BASE_RETRY_DELAY_MS=5000

# Twitter Fetch Limits
TWITTER_POSTS_LOOKBACK_DAYS=60         # Days to look back for posts
TWITTER_MAX_TWEETS_TO_COLLECT=50       # Maximum tweets to collect and store

# Farcaster Integration (FREE - No API Keys Required)
# Uses FName Registry and Warpcast APIs - completely free

# LLM Integration (OpenRouter)
OPENROUTER_API_KEY=your_openrouter_key
LLM_MODEL=google/gemini-2.5-flash

# Giveth Backend Integration
GIVETH_API_BASE_URL=https://api.giveth.io
GIVETH_API_KEY=your_giveth_key

# Social Media Storage Configuration
SOCIAL_POST_MAX_COUNT=50       # Max social posts to keep per project (also used as default limit for admin API viewing)
SOCIAL_POST_MAX_AGE_DAYS=90    # Days to retain social posts

# Social media frequency scoring configuration
SCORING_SOCIAL_FREQUENCY_DAYS=60           # Days to consider for frequency calculation
SCORING_MIN_POSTS_FOR_FULL_FREQUENCY=45   # Min posts for full frequency score

# Scoring Weight Configuration (Optional - defaults are used if not specified)
SCORING_WEIGHT_PROJECT_INFO_QUALITY=10
SCORING_WEIGHT_UPDATE_RECENCY=5
SCORING_WEIGHT_SOCIAL_MEDIA_QUALITY=10
SCORING_WEIGHT_SOCIAL_MEDIA_RECENCY=5
SCORING_WEIGHT_SOCIAL_MEDIA_FREQUENCY=5
SCORING_WEIGHT_RELEVANCE_TO_CAUSE=25
SCORING_WEIGHT_EVIDENCE_OF_IMPACT=25
SCORING_WEIGHT_GIVPOWER_RANK=15

```

## Key Implementation Notes

### TwitterService Features

- **Batch Processing**: Use `getRecentTweetsForHandles()` for multiple accounts
- **Rate Limiting**: Automatic delays between requests (3-8 second range)
- **Retry Logic**: Exponential backoff with up to 3 attempts
- **Caching**: 6-hour TTL for social media data
- **Authentication Management**: Automatic fallback and cookie persistence

### FarcasterService Features

- **Username to FID Resolution**: Uses FREE FName Registry API to resolve usernames to Farcaster IDs (no API keys required)
- **Username Transfer Handling**: Properly handles username ownership changes by finding latest active transfer
- **Cast Fetching**: Uses Warpcast client API to fetch user casts
- **Intelligent Caching**: 24-hour TTL for FIDs, 1-hour TTL for casts
- **Rate Limiting**: Randomized delays between requests (2-3 second range)
- **Incremental Fetching**: Optimized for scheduled jobs to avoid re-processing old data
- **Batch Processing**: Client-side filtering with configurable limits
- **Completely FREE**: No API keys required for any Farcaster functionality

### Data Flow

1. Receive evaluation request with `causeId`
2. Fetch Cause details and associated Project IDs
3. Fetch detailed project information for each project
4. Gather social media data (Twitter/Farcaster) with rate limiting
5. Process data through LLM for quality/relevance assessments
6. Calculate final CauseScores using weighted rubric
7. Return sorted results with score breakdowns

### Error Handling Strategy

- Graceful degradation: If social media APIs fail, assign 0 for those components
- Retry mechanisms for transient failures
- Comprehensive logging with correlation IDs
- Global exception filters for consistent error responses

## Development Guidelines

### Code Quality Requirements

**IMPORTANT: ALWAYS run code quality checks after making ANY code changes:**

```bash
npm run code:check         # Check linting and formatting
npm run code:fix           # Fix linting and formatting issues
```

Both commands MUST be run after every code modification to ensure code quality standards are maintained.

### Running Tests for Social Media Services

```bash
# Test TwitterService authentication and functionality
npx ts-node test-twitter-elonmusk.ts

# Test FarcasterService with FName Registry API (FREE)
npx ts-node run-farcaster-test.ts
```

### Module Dependencies

- `ConfigModule` and `CacheModule` are global modules
- Social media services require HttpModule for external API calls
- All modules follow the standard NestJS dependency injection pattern

### Adding New Social Media Platforms

1. Create new service in `src/modules/social-media/services/`
2. Implement the same interface as TwitterService
3. Add platform to `SocialPostDto` platform enum
4. Register service in `SocialMediaModule`

### LLM Prompt Engineering

- Store complex prompts in `src/modules/llm-integration/prompts/`
- Use structured prompt templates for consistency
- Include clear instructions for numerical scoring output
- Test prompts thoroughly with various input types

## Current Branch Context

Working on `twitter-service` branch which includes:

- Enhanced TwitterService with batch processing capabilities
- Comprehensive authentication strategies
- Rate limiting and retry mechanisms
- Detailed logging and error handling
