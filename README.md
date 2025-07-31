# Donation Agent Evaluator Service

<p align="center">
  <img src="https://giveth-brand-assets.s3.us-east-2.amazonaws.com/logos/giveth-logo-blue-text.png" width="200" alt="Giveth Logo" />
</p>

A NestJS-based microservice that evaluates charitable projects within "Causes" and assigns CauseScores (0-100) to determine fund distribution proportions for the Giveth platform.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Scoring System](#scoring-system)
- [Setup & Development](#setup--development)
- [Background Services](#background-services)
- [Integration Details](#integration-details)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Data Flow](#data-flow)
- [Troubleshooting](#troubleshooting)

## Overview

The Donation Agent Evaluator Service is a core component of Giveth's Causes feature. It provides:

- **Objective Project Evaluation**: Uses multiple criteria to assess project quality and relevance
- **Automated Fund Distribution**: Calculates scores that determine how donations are split among projects
- **Social Media Integration**: Tracks project activity on Twitter and Farcaster
- **LLM-Powered Assessment**: Uses Gemini 2.5 Flash for qualitative content evaluation
- **Real-time Data Processing**: Maintains up-to-date project information through scheduled jobs

### Key Features

- 🎯 **Multi-criteria Scoring**: 8 weighted components totaling 100 points
- 🤖 **AI-Powered Quality Assessment**: LLM evaluation of content quality and relevance
- 📊 **Social Media Tracking**: Twitter and Farcaster activity monitoring
- ⚡ **Asynchronous Processing**: Job-based evaluation system for scalability
- 📈 **Comprehensive Monitoring**: Health checks and detailed logging
- 🔄 **Automated Data Sync**: Regular project and social media data updates

## Architecture

### Core Modules

```
📦 Donation Agent Evaluator Service
├── 🎯 EvaluationModule          # API endpoints and job orchestration
├── 📊 DataFetchingModule        # Giveth backend integration
├── 📱 SocialMediaModule         # Twitter/Farcaster data fetching
├── 🤖 LLMIntegrationModule      # OpenRouter/Gemini integration
├── ⚖️  ScoringModule            # Score calculation engine
├── 💾 SocialMediaStorageModule  # Database entities and services
├── ⏰ ScheduledJobsModule       # Background job processing
└── 🏥 HealthModule              # Health checks and monitoring
```

### Technology Stack

- **Framework**: NestJS (Node.js)
- **Database**: PostgreSQL with TypeORM
- **Cache**: NestJS Cache Manager
- **Social Media**: Twitter Scraper, Farcaster APIs
- **LLM**: OpenRouter API (Gemini 2.5 Flash)
- **Queue**: Built-in job processing system
- **Container**: Docker with multi-stage builds

## API Endpoints

### Core Evaluation Endpoints

#### `POST /evaluate/cause`

Queues evaluation of projects within a single cause.

**Headers Required:**
- `Content-Type: application/json`

**Request Body (required):**
```json
{
  "cause": {
    "id": 123,
    "title": "Environmental Conservation", 
    "description": "Projects focused on environmental protection",
    "categories": [
      {
        "category_name": "Climate Action",
        "category_description": "Fighting climate change", 
        "maincategory_title": "Environment",
        "maincategory_description": "Environmental initiatives"
      }
    ]
  },
  "projectIds": [456, 789, 101112]
}
```

**Field Requirements:**
- `cause.id` (number, required): Cause ID
- `cause.title` (string, required): Cause title  
- `cause.description` (string, required): Cause description
- `cause.categories` (array, optional): Array of category objects
  - `category_name` (string, required): Category name
  - `category_description` (string, required): Category description
  - `maincategory_title` (string, required): Main category title
  - `maincategory_description` (string, required): Main category description
- `projectIds` (number[], required): Array of project IDs to evaluate

**Response:**
```json
{
  "jobId": "uuid-job-id",
  "estimatedDuration": "2-3 minutes"
}
```

**Sample cURL Request:**
```bash
curl -X POST https://staging.eval.ads.giveth.io/evaluate/cause \
  -H "Content-Type: application/json" \
  -d '{
    "cause": {
      "id": 123,
      "title": "Environmental Conservation",
      "description": "Projects focused on environmental protection",
      "categories": [
        {
          "category_name": "Climate Action",
          "category_description": "Fighting climate change",
          "maincategory_title": "Environment",
          "maincategory_description": "Environmental initiatives"
        }
      ]
    },
    "projectIds": [456, 789, 101112]
  }'
```

#### `POST /evaluate/causes`

Queues evaluation of multiple causes in batch.

**Headers Required:**
- `Content-Type: application/json`

**Request Body (required):**
```json
{
  "causes": [
    {
      "cause": {
        "id": 123,
        "title": "Environmental Conservation",
        "description": "Projects focused on environmental protection",
        "categories": [
          {
            "category_name": "Climate Action",
            "category_description": "Fighting climate change", 
            "maincategory_title": "Environment",
            "maincategory_description": "Environmental initiatives"
          }
        ]
      },
      "projectIds": [456, 789]
    },
    {
      "cause": {
        "id": 124, 
        "title": "Education Access",
        "description": "Improving access to quality education",
        "categories": [
          {
            "category_name": "Primary Education",
            "category_description": "Elementary education access",
            "maincategory_title": "Education", 
            "maincategory_description": "Educational development"
          }
        ]
      },
      "projectIds": [101112, 131415]
    }
  ]
}
```

**Field Requirements:**
- `causes` (array, required): Array of cause evaluation requests
- Each cause object follows the same structure as single cause evaluation:
  - `cause.id` (number, required): Cause ID
  - `cause.title` (string, required): Cause title  
  - `cause.description` (string, required): Cause description
  - `cause.categories` (array, optional): Array of category objects with required fields
  - `projectIds` (number[], required): Array of project IDs to evaluate

**Sample cURL Request:**
```bash
curl -X POST https://staging.eval.ads.giveth.io/evaluate/causes \
  -H "Content-Type: application/json" \
  -d '{
    "causes": [
      {
        "cause": {
          "id": 123,
          "title": "Environmental Conservation",
          "description": "Projects focused on environmental protection",
          "categories": [
            {
              "category_name": "Climate Action",
              "category_description": "Fighting climate change",
              "maincategory_title": "Environment",
              "maincategory_description": "Environmental initiatives"
            }
          ]
        },
        "projectIds": [456, 789]
      },
      {
        "cause": {
          "id": 124,
          "title": "Education Access",
          "description": "Improving access to quality education"
        },
        "projectIds": [101112, 131415]
      }
    ]
  }'
```

#### `GET /evaluate/jobs/:jobId`

Gets the status and results of an evaluation job.

**Path Parameters:**
- `jobId` (string, required): The UUID of the evaluation job

**Response:**
```json
{
  "status": "completed",
  "progress": 100,
  "result": {
    "cause": {
      "id": 123,
      "title": "Environmental Conservation",
      "totalProjects": 3,
      "averageScore": 67.5
    },
    "projects": [
      {
        "projectId": 456,
        "title": "Ocean Cleanup Initiative", 
        "causeScore": 85.2,
        "scoreBreakdown": {
          "projectInfoQuality": 8.5,
          "updateRecency": 4.2,
          "socialMediaQuality": 7.8,
          "socialMediaRecency": 3.1,
          "socialMediaFrequency": 4.5,
          "relevanceToCause": 22.1,
          "evidenceOfImpact": 20.5,
          "givPowerRank": 14.5
        }
      }
    ]
  }
}
```

**Status Values:**
- `pending`: Job is queued but not started
- `processing`: Job is currently running
- `completed`: Job finished successfully
- `failed`: Job encountered an error

**Sample cURL Request:**
```bash
curl https://staging.eval.ads.giveth.io/evaluate/jobs/550e8400-e29b-41d4-a716-446655440000
```

#### `GET /evaluate/evaluation-detailed`

Returns detailed evaluation reports from CSV data.

**Query Parameters:**
- `causeIds` (optional): Comma-separated cause IDs to filter results (e.g., `?causeIds=123,124,125`)

**Sample cURL Requests:**
```bash
# Get all evaluation data
curl https://staging.eval.ads.giveth.io/evaluate/evaluation-detailed

# Get data for specific causes
curl "https://staging.eval.ads.giveth.io/evaluate/evaluation-detailed?causeIds=123,124,125"
```


### Admin Operations Endpoints

#### `POST /admin/sync-projects`

Manually trigger project synchronization from Giveth backend.

**Headers Required:**
- None (no request body needed)

**Response:**
```json
{
  "success": true,
  "message": "Successfully synchronized 847 projects from 23 causes",
  "data": {
    "projectsProcessed": 847,
    "causesProcessed": 23,
    "processingTimeMs": 45623,
    "errors": 0,
    "correlationId": "uuid-correlation-id"
  },
  "timestamp": "2025-01-31T10:30:00Z"
}
```

**Sample cURL Request:**
```bash
curl -X POST https://staging.eval.ads.giveth.io/admin/sync-projects
```

#### `POST /admin/fetch/:projectId`

Force social media data fetch for a specific project.

**Path Parameters:**
- `projectId` (string, required): The project ID to fetch data for

**Response:**
```json
{
  "success": true,
  "message": "Successfully fetched social media data for project project-123",
  "data": {
    "projectId": "project-123",
    "twitterFetch": {
      "attempted": true,
      "success": true,
      "postsFound": 15
    },
    "farcasterFetch": {
      "attempted": true,
      "success": true,
      "postsFound": 8
    },
    "correlationId": "uuid-correlation-id"
  },
  "timestamp": "2025-01-31T10:30:00Z"
}
```

**Sample cURL Request:**
```bash
curl -X POST https://staging.eval.ads.giveth.io/admin/fetch/project-123
```

#### `GET /admin/stats`

Get comprehensive system statistics.

**Response:** Detailed system statistics including project counts, job statuses, and social media metrics.

**Sample cURL Request:**
```bash
curl https://staging.eval.ads.giveth.io/admin/stats
```

#### `GET /admin/cause-project-validation`

Validate cause-project filtering behavior.

**Response:** Validation results comparing GraphQL data with stored database data.

**Sample cURL Request:**
```bash
curl https://staging.eval.ads.giveth.io/admin/cause-project-validation
```

#### `GET /admin/social-posts`

Retrieve stored social media posts for multiple projects.

**Query Parameters (required):**
- `projectIds` (string, required): Comma-separated project IDs (e.g., `project1,project2`)
- `platform` (string, optional): Filter by platform (`twitter` or `farcaster`)
- `limit` (number, optional): Posts per project (default: 10, max: 50)

**Sample cURL Requests:**
```bash
# Get posts for multiple projects
curl "https://staging.eval.ads.giveth.io/admin/social-posts?projectIds=project1,project2,project3"

# Get only Twitter posts with limit
curl "https://staging.eval.ads.giveth.io/admin/social-posts?projectIds=project1,project2&platform=twitter&limit=5"

# Get Farcaster posts only
curl "https://staging.eval.ads.giveth.io/admin/social-posts?projectIds=project1&platform=farcaster&limit=10"
```

### Utility Endpoints

#### `GET /`

Basic service information.

**Response:** Basic service status and information.

**Sample cURL Request:**
```bash
curl https://staging.eval.ads.giveth.io/
```

#### `GET /download`

Download evaluation results as CSV file.

**Response:** CSV file download containing evaluation results.

**Live URL**: https://staging.eval.ads.giveth.io/download/

**Sample cURL Request:**
```bash
# Download CSV file
curl -O https://staging.eval.ads.giveth.io/download

# Or save with specific filename
curl https://staging.eval.ads.giveth.io/download -o evaluation-results.csv
```

## Database Schema

### Core Entities

#### ProjectSocialAccount

Stores project metadata and social media handles.

```sql
CREATE TABLE project_social_accounts (
  id UUID PRIMARY KEY,
  project_id VARCHAR UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  project_status VARCHAR(100) NOT NULL,
  quality_score DECIMAL(5,2),
  giv_power_rank INTEGER,
  total_donations DECIMAL(15,2) DEFAULT 0,
  last_update_date TIMESTAMP,
  last_update_content TEXT,
  last_update_title VARCHAR(500),
  x_url VARCHAR,
  farcaster_url VARCHAR,
  last_x_fetch TIMESTAMP,
  last_farcaster_fetch TIMESTAMP,
  latest_x_post_timestamp TIMESTAMP,
  latest_farcaster_post_timestamp TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### StoredSocialPost

Stores social media posts from Twitter and Farcaster.

```sql
CREATE TABLE stored_social_posts (
  id UUID PRIMARY KEY,
  post_id VARCHAR NOT NULL,
  content TEXT NOT NULL,
  url VARCHAR,
  post_timestamp TIMESTAMP NOT NULL,
  fetched_at TIMESTAMP NOT NULL,
  metadata JSONB,
  project_account_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (project_account_id) REFERENCES project_social_accounts(id) ON DELETE CASCADE,
  UNIQUE(post_id, project_account_id)
);
```

#### ScheduledJob

Manages background job processing.

```sql
CREATE TABLE scheduled_jobs (
  id UUID PRIMARY KEY,
  project_id VARCHAR NOT NULL,
  job_type job_type_enum NOT NULL,
  scheduled_for TIMESTAMP NOT NULL,
  status job_status_enum DEFAULT 'pending',
  processed_at TIMESTAMP,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Entity Relationships

```mermaid
erDiagram
    ProjectSocialAccount ||--o{ StoredSocialPost : "has many"
    ProjectSocialAccount {
        string id PK
        string projectId UK
        string title
        string slug
        text description
        string projectStatus
        decimal qualityScore
        int givPowerRank
        decimal totalDonations
        timestamp lastUpdateDate
        text lastUpdateContent
        string xUrl
        string farcasterUrl
        timestamp lastXFetch
        timestamp lastFarcasterFetch
        jsonb metadata
    }
    StoredSocialPost {
        string id PK
        string postId
        text content
        string url
        timestamp postTimestamp
        timestamp fetchedAt
        jsonb metadata
        string projectAccountId FK
    }
    ScheduledJob {
        string id PK
        string projectId
        enum jobType
        timestamp scheduledFor
        enum status
        timestamp processedAt
        text error
        int attempts
        jsonb metadata
    }
```

## Scoring System

The CauseScore is calculated using a weighted rubric totaling 100 points:

### Scoring Components

| Component                                   | Weight | Type           | Description                                                |
| ------------------------------------------- | ------ | -------------- | ---------------------------------------------------------- |
| **Project Information Quality**             | 10%    | LLM-assessed   | Quality of project title, description, and updates         |
| **Update Recency**                          | 5%     | Calculated     | How recently the project was updated                       |
| **Social Media Content Quality**            | 10%    | LLM-assessed   | Quality of social media posts (Twitter 50%, Farcaster 50%) |
| **Social Media Posting Recency**            | 5%     | Calculated     | How recently social media was posted                       |
| **Social Media Posting Frequency**          | 5%     | Calculated     | Frequency of social media activity                         |
| **Relevance to Cause**                      | 25%    | LLM-assessed   | How well the project aligns with the cause theme           |
| **Evidence of Social/Environmental Impact** | 25%    | LLM-assessed   | Evidence of real-world impact                              |
| **GIVpower Rank**                           | 15%    | From Giveth DB | Community-driven ranking metric                            |

### Scoring Algorithm

```typescript
// Weighted score calculation
const causeScore =
  projectInfoQuality * 0.1 +
  updateRecency * 0.05 +
  socialMediaQuality * 0.1 +
  socialMediaRecency * 0.05 +
  socialMediaFrequency * 0.05 +
  relevanceToCause * 0.25 +
  evidenceOfImpact * 0.25 +
  givPowerRank * 0.15;
```

### LLM Assessment Criteria

The service uses structured prompts to ensure consistent LLM evaluations:

- **Quality Assessment**: Evaluates content clarity, completeness, and professionalism
- **Relevance Assessment**: Measures alignment with cause theme using keyword analysis and semantic understanding
- **Impact Assessment**: Looks for concrete evidence of social/environmental benefits

## Setup & Development

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Docker (optional)
- npm or yarn

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Core Configuration
NODE_ENV=development
PORT=3000

# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=donation_evaluator
DATABASE_URL=postgresql://user:pass@localhost:5432/donation_evaluator

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

# Farcaster Integration (FREE - No API Keys Required)
# Uses FName Registry and Warpcast APIs

# LLM Integration (OpenRouter)
OPENROUTER_API_KEY=your_openrouter_key
LLM_MODEL=google/gemini-2.5-flash

# Giveth Backend Integration
GIVETH_API_BASE_URL=https://api.giveth.io
GIVETH_API_KEY=your_giveth_key

# Scoring Weight Configuration (Optional)
SCORING_WEIGHT_PROJECT_INFO_QUALITY=10
SCORING_WEIGHT_UPDATE_RECENCY=5
SCORING_WEIGHT_SOCIAL_MEDIA_QUALITY=10
SCORING_WEIGHT_SOCIAL_MEDIA_RECENCY=5
SCORING_WEIGHT_SOCIAL_MEDIA_FREQUENCY=5
SCORING_WEIGHT_RELEVANCE_TO_CAUSE=25
SCORING_WEIGHT_EVIDENCE_OF_IMPACT=25
SCORING_WEIGHT_GIVPOWER_RANK=15
```

### Installation & Running

```bash
# Install dependencies
npm install

# Run database migrations
npm run migration:run

# Development mode (with hot reload)
npm run start:dev

# Debug mode
npm run start:debug

# Production build
npm run build
npm run start:prod
```

### Code Quality Commands

**IMPORTANT: Always run these after making code changes:**

```bash
# Check linting and formatting
npm run code:check

# Fix linting and formatting issues
npm run code:fix

# Individual checks
npm run lint:check
npm run format:check
```

### Testing

```bash
# Unit tests
npm run test

# Tests with coverage
npm run test:cov

# End-to-end tests
npm run test:e2e

# Test specific services
npx ts-node test-twitter-elonmusk.ts
npx ts-node run-farcaster-test.ts
```

### Docker Setup

```bash
# Development
docker-compose up -d

# Staging
docker-compose -f docker-compose-staging.yml up -d

# Production
docker-compose -f docker-compose-production.yml up -d
```

## Background Services

### Scheduled Job Types

The service runs several background jobs to maintain data freshness:

#### Project Sync Jobs

- **Frequency**: Every 6 hours
- **Purpose**: Sync project metadata from Giveth backend
- **Batch Size**: 15 projects per batch
- **Concurrency**: 3 parallel jobs

#### Twitter Fetch Jobs

- **Frequency**: Hourly distribution
- **Rate Limiting**: 3-8 second delays between requests
- **Features**:
  - Dual authentication strategy (cookies + credentials)
  - Automatic account fallback
  - Incremental fetching to avoid duplicates
  - Cookie persistence for session management

#### Farcaster Fetch Jobs

- **Frequency**: Hourly distribution
- **Rate Limiting**: 2-3 second delays between requests
- **Features**:
  - FName Registry integration for username resolution
  - Username transfer handling
  - Intelligent caching (24h for FIDs, 1h for casts)
  - Completely FREE (no API keys required)

### Job Processing Flow

```mermaid
graph TD
    A[Cron Scheduler] --> B[Job Queue]
    B --> C{Job Type}
    C -->|PROJECT_SYNC| D[Project Sync Processor]
    C -->|TWEET_FETCH| E[Twitter Fetch Processor]
    C -->|FARCASTER_FETCH| F[Farcaster Fetch Processor]
    D --> G[Update ProjectSocialAccount]
    E --> H[Store Social Posts]
    F --> H
    H --> I[Update Cache]
    G --> I
```

### Error Handling & Retry Logic

- **Exponential Backoff**: Failed jobs retry with increasing delays
- **Max Attempts**: Up to 3 retry attempts per job
- **Graceful Degradation**: Missing social media data assigns 0 scores rather than failing evaluation
- **Correlation IDs**: All operations include tracking IDs for debugging

## Integration Details

### Giveth GraphQL API Integration

The service integrates with Giveth's Impact Graph API for:

- **Cause Data**: Fetching cause details and project relationships
- **Project Metadata**: Getting project information, updates, and GIVpower rankings
- **Bulk Updates**: Sending evaluation results back to Impact Graph

**Key GraphQL Operations:**

- `getCauseDetails`: Fetch cause information and associated projects
- `getProjectDetails`: Get detailed project information
- `bulkUpdateCauseProjectEvaluation`: Submit evaluation results

### Social Media APIs

#### Twitter Integration

- **Library**: `@the-convocation/twitter-scraper`
- **Authentication**: Dual strategy (cookies + password)
- **Rate Limiting**: 3-8 second delays with exponential backoff
- **Features**: Batch processing, automatic fallback, session persistence

#### Farcaster Integration

- **APIs**: FName Registry (username resolution) + Warpcast (cast fetching)
- **Cost**: Completely FREE - no API keys required
- **Features**: Transfer handling, intelligent caching, incremental updates

### LLM Integration

- **Provider**: OpenRouter API
- **Model**: Gemini 2.5 Flash (fast, cost-effective)
- **Use Cases**:
  - Project information quality assessment
  - Social media content quality evaluation
  - Relevance to cause determination
  - Evidence of impact analysis

**Prompt Engineering**:

- Structured prompts stored in `/src/modules/llm-integration/prompts/`
- Consistent scoring instructions (0-10 scale)
- Clear evaluation criteria for each component

## Monitoring & Logging

### Logging & Correlation

- **Structured Logging**: JSON format with correlation IDs
- **Log Levels**: Error, Warn, Log, Debug, Verbose
- **Correlation IDs**: UUID tracking for request flows
- **Performance Metrics**: Response times and processing duration

### System Statistics

Access via `GET /admin/stats`:

```json
{
  "success": true,
  "data": {
    "sync": {
      "totalProjects": 1247,
      "projectsWithX": 892,
      "projectsWithFarcaster": 456,
      "lastSyncTime": "2025-01-31T08:00:00Z"
    },
    "jobs": {
      "pending": 23,
      "processing": 5,
      "completed": 15678,
      "failed": 12,
      "byJobType": {
        "tweet_fetch": 8921,
        "farcaster_fetch": 6234,
        "project_sync": 523
      }
    },
    "socialMedia": {
      "totalPosts": 45623,
      "twitterPosts": 28934,
      "farcasterPosts": 16689,
      "postsLast24Hours": 1234,
      "postsLast7Days": 8765
    }
  }
}
```

## Data Flow

### High-Level Architecture

```mermaid
graph TD
    %% External Systems
    IG[Impact Graph API<br/>GraphQL]
    SOCIAL[Social Media APIs<br/>Twitter + Farcaster]
    OR[OpenRouter API<br/>Gemini 2.5 Flash]

    %% Our System
    API[Evaluation API<br/>Endpoints]
    CRON[Scheduled Jobs<br/>Background Processing]
    DB[(PostgreSQL Database<br/>Project Data + Social Posts)]
    CACHE[(Cache Layer<br/>6h TTL)]

    %% Processing
    EVAL[Evaluation Engine<br/>Score Calculation]
    LLM[LLM Processing<br/>Quality Assessment]

    %% Data Flows
    CRON -->|Fetch Projects<br/>Every 6h| IG
    CRON -->|Fetch Social Posts<br/>Hourly| SOCIAL
    IG --> DB
    SOCIAL --> DB

    API -->|Evaluation Request| EVAL
    EVAL --> DB
    EVAL --> LLM
    LLM --> OR
    EVAL --> CACHE
    EVAL -->|Results| API
    API -->|Update Scores| IG
```

### Detailed Data Processing Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Queue
    participant Worker
    participant DB
    participant LLM
    participant Cache

    Client->>API: POST /evaluate/cause
    API->>Queue: Add evaluation job
    API->>Client: Return job ID

    Queue->>Worker: Process evaluation job
    Worker->>DB: Fetch project data
    Worker->>DB: Fetch social posts
    Worker->>Cache: Check cached scores

    alt Cache miss
        Worker->>LLM: Assess content quality
        Worker->>LLM: Evaluate relevance
        Worker->>LLM: Check impact evidence
        LLM->>Worker: Return assessments
        Worker->>Cache: Store results
    end

    Worker->>Worker: Calculate final scores
    Worker->>DB: Log evaluation results
    Worker->>Queue: Mark job complete

    Client->>API: GET /evaluate/jobs/:id
    API->>Client: Return results
```

## Troubleshooting

### Common Issues

#### 1. Twitter Authentication Failures

**Symptoms**: `TwitterService` throws authentication errors
**Solutions**:

- Check cookie validity in `twitter_cookies.json`
- Verify username/password credentials
- Ensure both accounts are configured for fallback
- Check rate limiting delays

#### 2. Farcaster Username Resolution Issues

**Symptoms**: Cannot resolve Farcaster usernames to FIDs
**Solutions**:

- Verify username format (no @ prefix)
- Check FName Registry API availability
- Clear username cache if transfers occurred
- Validate username ownership changes

#### 3. LLM Assessment Failures

**Symptoms**: Scoring fails with LLM errors
**Solutions**:

- Verify OpenRouter API key
- Check model availability (`google/gemini-2.5-flash`)
- Review prompt formatting
- Monitor rate limits and quotas

#### 4. Database Connection Issues

**Symptoms**: Health checks fail for database
**Solutions**:

- Verify PostgreSQL connection parameters
- Check SSL configuration for production
- Ensure migrations are up to date
- Monitor connection pool status

#### 5. Job Processing Delays

**Symptoms**: Background jobs not processing timely
**Solutions**:

- Check job queue statistics via `/admin/stats`
- Monitor job failure rates
- Verify cron job scheduling
- Review rate limiting configurations

### Debug Commands

```bash
# Manual project sync
curl -X POST https://staging.eval.ads.giveth.io/admin/sync-projects

# Get system statistics
curl https://staging.eval.ads.giveth.io/admin/stats

# Get social posts for projects
curl "https://staging.eval.ads.giveth.io/admin/social-posts?projectIds=project1,project2&limit=5"

# Force social media fetch for a project
curl -X POST https://staging.eval.ads.giveth.io/admin/fetch/PROJECT_ID

# Get evaluation detailed report
curl https://staging.eval.ads.giveth.io/evaluate/evaluation-detailed

# Check job status
curl https://staging.eval.ads.giveth.io/evaluate/jobs/JOB_ID
```

### Performance Optimization

1. **Database Indexing**: Ensure proper indexes on frequently queried columns
2. **Cache Tuning**: Adjust TTL values based on data freshness requirements
3. **Rate Limiting**: Balance API limits with processing speed
4. **Batch Processing**: Use batch operations for bulk data operations
5. **Connection Pooling**: Monitor and tune database connection pools

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run code quality checks: `npm run code:check`
4. Submit a pull request with comprehensive tests

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions and support:

- Create an issue in the repository
- Contact the Giveth development team
- Review the existing documentation in `/docs/`

---

_Built with ❤️ for the Giveth community_
