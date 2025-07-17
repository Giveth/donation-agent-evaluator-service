# Project Evaluation Guide

## Overview

This document explains how the Donation Agent Evaluator Service evaluates charitable projects within "Causes" to determine fund distribution proportions. The evaluation process assigns CauseScores (0-100) to projects based on comprehensive criteria including project information quality, social media activity, and relevance to the cause theme.

## Evaluation Process Flow

### 1. Data Collection (`evaluation.service.ts:41-96`)
- **Input**: Cause details and array of project IDs
- **Project Data**: Fetched from local database first, fallback to Giveth GraphQL API
- **Social Media Data**: Retrieved from stored posts in database (10 posts per platform)
  - Twitter posts (using `@the-convocation/twitter-scraper`)
  - Farcaster posts (using free FName Registry and Warpcast APIs)

### 2. Individual Project Evaluation (`evaluation.service.ts:101-175`)
For each project:
- Fetch Twitter and Farcaster posts from database
- Prepare scoring input with project details and social media data
- Calculate comprehensive score using ScoringService
- Return scored project with breakdown

### 3. Scoring and Ranking (`evaluation.service.ts:79-80`)
- Projects sorted by CauseScore in descending order
- Highest scoring projects receive larger fund distribution proportions

## Scoring Criteria and Weights

The evaluation uses 8 weighted criteria totaling 100% (`scoring.service.ts:394-408`):

### 1. Project Information & Update Quality (15%)
**File**: `scoring.service.ts:196-197`
- **Assessment**: LLM-evaluated (GPT/Gemini via OpenRouter)
- **Criteria**: Quality, completeness, professionalism of project description and updates
- **Factors**: Clarity, detail, transparency, communication quality
- **Score Range**: 0-100

### 2. Update Recency (10%)
**File**: `scoring.service.ts:272-285`
- **Assessment**: Time-decay calculation
- **Formula**: `100 * e^(-k * days)` where k calculated for 50% score at 30 days
- **Factors**: Days since last project update
- **Score Range**: 0-100

### 3. Social Media Content Quality (10%)
**File**: `scoring.service.ts:358-370`
- **Assessment**: LLM-evaluated, platform-weighted
- **Distribution**: Twitter 50%, Farcaster 50%
- **Criteria**: Engagement, professionalism, value provided
- **Score Range**: 0-100

### 4. Social Media Posting Recency (5%)
**File**: `scoring.service.ts:291-308`
- **Assessment**: Time-decay calculation
- **Formula**: `100 * e^(-k * days)` where k calculated for 50% score at 14 days
- **Factors**: Days since most recent post across all platforms
- **Score Range**: 0-100

### 5. Social Media Posting Frequency (5%)
**File**: `scoring.service.ts:314-330`
- **Assessment**: Linear scoring based on post count
- **Period**: Last 30 days
- **Formula**: `(postCount / 8) * 100` (8 posts = 100% score)
- **Score Range**: 0-100

### 6. Relevance to Cause (20%)
**File**: `scoring.service.ts:376-389`
- **Assessment**: LLM-evaluated, multi-source weighted
- **Distribution**: Twitter 33%, Farcaster 33%, Project Info 34%
- **Criteria**: Alignment with cause mission and goals
- **Score Range**: 0-100

### 7. Evidence of Social/Environmental Impact (20%)
**File**: `scoring.service.ts:213`
- **Assessment**: LLM-evaluated
- **Criteria**: Concrete examples of positive impact, beneficiaries helped, meaningful change
- **Sources**: Project updates, Twitter posts, Farcaster posts
- **Score Range**: 0-100

### 8. GIVpower Rank (15%)
**File**: `scoring.service.ts:336-353`
- **Assessment**: Percentile-based calculation
- **Formula**: `((totalProjects - rank) / totalProjects) * 100`
- **Source**: Giveth database ranking
- **Score Range**: 0-100

## LLM Assessment Process

### LLM Integration (`scoring.service.ts:146-266`)
- **Model**: Gemini 2.5 Flash via OpenRouter API
- **Temperature**: 0.3 (for consistent scoring)
- **Format**: JSON response with numerical scores and reasoning

### Assessment Criteria (`scoring.service.ts:172-230`)
The LLM evaluates 9 specific metrics:

1. **Project Info Quality Score** (0-100)
2. **Social Media Quality Score** (0-100) - Overall
3. **Twitter Quality Score** (0-100) - Platform-specific
4. **Farcaster Quality Score** (0-100) - Platform-specific
5. **Relevance to Cause Score** (0-100) - Overall
6. **Twitter Relevance Score** (0-100) - Platform-specific
7. **Farcaster Relevance Score** (0-100) - Platform-specific
8. **Project Relevance Score** (0-100) - Project-specific
9. **Evidence of Impact Score** (0-100)

## Configuration Options

### Scoring Weights (Environment Variables)
```bash
SCORING_WEIGHT_PROJECT_INFO_QUALITY=15      # Default: 15%
SCORING_WEIGHT_UPDATE_RECENCY=10            # Default: 10%
SCORING_WEIGHT_SOCIAL_MEDIA_QUALITY=10     # Default: 10%
SCORING_WEIGHT_SOCIAL_MEDIA_RECENCY=5      # Default: 5%
SCORING_WEIGHT_SOCIAL_MEDIA_FREQUENCY=5    # Default: 5%
SCORING_WEIGHT_RELEVANCE_TO_CAUSE=20       # Default: 20%
SCORING_WEIGHT_EVIDENCE_OF_IMPACT=20       # Default: 20%
SCORING_WEIGHT_GIVPOWER_RANK=15            # Default: 15%
```

### Decay Parameters
```bash
SCORING_UPDATE_RECENCY_DECAY_DAYS=30       # Default: 30 days for 50% score
SCORING_SOCIAL_RECENCY_DECAY_DAYS=14       # Default: 14 days for 50% score
SCORING_SOCIAL_FREQUENCY_DAYS=30           # Default: Consider last 30 days
SCORING_MIN_POSTS_FOR_FULL_FREQUENCY=8    # Default: 8 posts for 100% score
```

## Error Handling Strategy

### Graceful Degradation (`evaluation.service.ts:66-76`)
- If individual project evaluation fails, assign 0 score and continue
- If social media APIs fail, assign 0 for those components
- If LLM assessment fails, return zero scores for all LLM-evaluated criteria

### Retry Mechanisms
- Twitter Service: Exponential backoff with up to 3 attempts
- Rate limiting with 3-8 second delays between requests
- Comprehensive logging with correlation IDs

## Performance Considerations

### Concurrency Control (`evaluation.service.ts:25`)
- Maximum 5 concurrent cause evaluations
- Prevents API rate limiting and resource exhaustion

### Caching Strategy
- Social media data: 6-hour TTL
- Farcaster FIDs: 24-hour TTL
- Farcaster casts: 1-hour TTL

### Database-First Approach (`evaluation.service.ts:110-123`)
- Social posts retrieved from database storage
- Reduces API calls and improves response times
- Fallback to API calls if needed

## Multi-Cause Evaluation

### Parallel Processing (`evaluation.service.ts:213-294`)
- Evaluates multiple causes simultaneously
- Error isolation: failed causes don't affect others
- Aggregated metadata and statistics

### Results Structure
```typescript
{
  data: CauseEvaluationResult[],
  status: 'SUCCESS' | 'PARTIAL_SUCCESS',
  totalCauses: number,
  successfulCauses: number,
  failedCauses: number,
  totalProjects: number,
  totalProjectsWithStoredPosts: number,
  evaluationDuration: number,
  timestamp: Date
}
```

## Key Files and Locations

- **Main Evaluation Logic**: `src/modules/evaluation/evaluation.service.ts`
- **Scoring Implementation**: `src/modules/scoring/scoring.service.ts`
- **LLM Integration**: `src/modules/llm-integration/llm.service.ts`
- **Social Media Storage**: `src/modules/social-media-storage/services/social-post-storage.service.ts`
- **Data Fetching**: `src/modules/data-fetching/services/data-fetching.service.ts`

## Testing and Validation

### Quality Assurance Commands
```bash
npm run code:check         # Check linting and formatting
npm run test               # Run unit tests
npm run test:e2e           # Run end-to-end tests
```

### Social Media Testing
```bash
npx ts-node test-twitter-elonmusk.ts    # Test Twitter functionality
npx ts-node run-farcaster-test.ts       # Test Farcaster functionality
```

This evaluation system ensures fair, consistent, and comprehensive assessment of charitable projects, enabling optimal fund distribution based on project quality, activity, and alignment with cause objectives.