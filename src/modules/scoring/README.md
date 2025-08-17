# Scoring Module

The Scoring Module is responsible for calculating comprehensive cause scores for charitable projects within the Giveth platform. It implements a weighted scoring rubric that evaluates projects across multiple dimensions.

## Overview

The scoring system evaluates projects using the following weighted components (total: 100%):

- **Project Information & Update Quality**: 20% (LLM-assessed)
- **Update Recency**: 10% (calculated)
- **Social Media Content Quality**: 20% (LLM-assessed)
- **Social Media Posting Recency**: 5% (calculated)
- **Social Media Posting Frequency**: 5% (calculated)
- **Relevance to Cause**: 20% (LLM-assessed)
- **Existing Quality Score**: 10% (from Giveth DB)
- **GIVpower Rank**: 10% (from Giveth DB)

## Components

### DTOs

#### ScoringInputDto

Contains all input parameters needed to score a project:

- Project information (ID, title, description)
- Update information (last update date, content, title)
- Social media posts
- Existing scores (quality score, GIVpower rank)
- Cause context (title, description, categories)

#### ScoringWeightsDto

Configurable weights for each scoring component. Validates that all weights sum to 1.0 (100%).

#### LLMAssessmentDto

Results from LLM assessment including:

- Project information quality score
- Social media content quality score
- Relevance to cause score
- Optional reasoning for each score

### Services

#### ScoringService

Main service that calculates cause scores. Key features:

1. **LLM Integration**: Uses the LLM service to assess qualitative aspects
2. **Recency Calculations**: Exponential decay functions for update and social media recency
3. **Frequency Analysis**: Counts recent social media posts within a time window
4. **Rank Normalization**: Converts GIVpower ranks to 0-100 scores
5. **Weighted Aggregation**: Combines all components using configurable weights

## Configuration

Set these environment variables to customize scoring behavior:

```bash
# Decay rates and thresholds
SCORING_UPDATE_RECENCY_DECAY_DAYS=30        # Days for 50% score on update recency
SCORING_SOCIAL_RECENCY_DECAY_DAYS=14        # Days for 50% score on social recency
SCORING_SOCIAL_FREQUENCY_DAYS=60            # Days to consider for frequency calculation
SCORING_MIN_POSTS_FOR_FULL_FREQUENCY=45     # Min posts for full frequency score

# Optional: Custom scoring weights (must sum to 1.0)
SCORING_WEIGHTS='{"projectInfoQuality":0.20,"updateRecency":0.10,"socialMediaQuality":0.20,"socialMediaRecency":0.05,"socialMediaFrequency":0.05,"relevanceToCause":0.20,"existingQualityScore":0.10,"givPowerRank":0.10}'
```

## Scoring Algorithm Details

### Update Recency Score

Uses exponential decay based on days since the last project update:

```
score = 100 * e^(-k * days)
where k = ln(2) / decay_days
```

### Social Media Recency Score

Similar exponential decay based on the most recent post across all platforms.

### Social Media Frequency Score

Linear scoring based on post count within the frequency period:

```
score = (post_count / min_posts_for_full_score) * 100
```

Capped at 100.

### GIVpower Rank Score

Percentile-based scoring where lower ranks get higher scores:

```
percentile = (total_projects - rank) / total_projects
score = percentile * 100
```

### LLM Assessment

Sends structured prompts to the LLM service requesting scores for:

- Project information quality (0-100)
- Social media content quality (0-100)
- Relevance to cause (0-100)

## Error Handling

- **LLM Failures**: Returns zero scores for LLM-assessed components
- **Missing Data**: Gracefully handles missing updates, social posts, or project metadata
- **Invalid Weights**: Validates that custom weights sum to 1.0
- **Calculation Errors**: Ensures scores stay within 0-100 bounds

## Usage

```typescript
import { ScoringService, ScoringInputDto } from './scoring';

// Inject the scoring service
constructor(private readonly scoringService: ScoringService) {}

// Prepare input data
const input = new ScoringInputDto({
  projectId: '123',
  projectTitle: 'My Project',
  projectDescription: 'Project description...',
  // ... other fields
});

// Calculate scores
const { causeScore, breakdown } = await this.scoringService.calculateCauseScore(input);

console.log(`Project scored: ${causeScore}/100`);
console.log('Breakdown:', breakdown);
```

## Testing

The module includes comprehensive unit tests covering:

- Score calculations for all components
- Error handling scenarios
- Edge cases (missing data, extreme values)
- Weight validation
- LLM integration mocking

Run tests with:

```bash
npm test -- src/modules/scoring/scoring.service.spec.ts
```

## Integration

The scoring module integrates with:

- **EvaluationModule**: Primary consumer for project evaluation
- **LLMIntegrationModule**: For qualitative assessments
- **ConfigModule**: For configuration management
