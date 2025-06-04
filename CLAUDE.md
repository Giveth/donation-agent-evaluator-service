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
2. **Password authentication** (fallback) - requires `TWITTER_USERNAME`, `TWITTER_PASSWORD`, `TWITTER_EMAIL`

### Scoring Rubric (Total: 100%)

- Project Information & Update Quality: 20% (LLM-assessed)
- Update Recency: 10% (calculated)
- Social Media Content Quality: 20% (LLM-assessed)
- Social Media Posting Recency: 5% (calculated)
- Social Media Posting Frequency: 5% (calculated)
- Relevance to Cause: 20% (LLM-assessed)
- Existing Quality Score: 10% (from Giveth DB)
- GIVpower Rank: 10% (from Giveth DB)

## Environment Variables

```bash
# Core Configuration
NODE_ENV=development
PORT=3000

# Cache Settings
CACHE_TTL_SOCIAL_MEDIA=21600  # 6 hours in seconds

# Twitter Authentication (Method 1: Cookies)
TWITTER_COOKIES='[{"name":"auth_token","value":"..."}]'

# Twitter Authentication (Method 2: Credentials)
TWITTER_USERNAME=your_username
TWITTER_PASSWORD=your_password
TWITTER_EMAIL=your_email

# Twitter Rate Limiting
TWITTER_MIN_DELAY_MS=3000
TWITTER_MAX_DELAY_MS=8000
TWITTER_MAX_RETRIES=3
TWITTER_BASE_RETRY_DELAY_MS=5000

# LLM Integration (OpenRouter)
OPENROUTER_API_KEY=your_openrouter_key
LLM_MODEL=google/gemini-2.5-flash-preview

# Giveth Backend Integration
GIVETH_API_BASE_URL=https://api.giveth.io
GIVETH_API_KEY=your_giveth_key

```

## Key Implementation Notes

### TwitterService Features

- **Batch Processing**: Use `getRecentTweetsForHandles()` for multiple accounts
- **Rate Limiting**: Automatic delays between requests (3-8 second range)
- **Retry Logic**: Exponential backoff with up to 3 attempts
- **Caching**: 6-hour TTL for social media data
- **Authentication Management**: Automatic fallback and cookie persistence

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

### Running Tests for TwitterService

```bash
# Test TwitterService authentication and functionality
npx ts-node test-twitter-elonmusk.ts
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
