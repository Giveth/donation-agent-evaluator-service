import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ScoringService } from './scoring.service';
import { LLMService } from '../llm-integration/llm.service';
import { ScoringInputDto } from './dto';
import { SocialMediaPlatform } from '../social-media/dto/social-post.dto';

describe('ScoringService', () => {
  let service: ScoringService;
  let llmService: jest.Mocked<LLMService>;
  let _configService: jest.Mocked<ConfigService>;

  const mockLLMService = {
    createChatCompletion: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        SCORING_UPDATE_RECENCY_DECAY_DAYS: 30,
        SCORING_SOCIAL_RECENCY_DECAY_DAYS: 14,
        SCORING_SOCIAL_FREQUENCY_DAYS: 30,
        SCORING_MIN_POSTS_FOR_FULL_FREQUENCY: 8,
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockInput: ScoringInputDto = new ScoringInputDto({
    projectId: '123',
    projectTitle: 'Test Project',
    projectDescription: 'Test Description',
    lastUpdateDate: new Date('2024-01-01'),
    socialPosts: [
      {
        id: '1',
        text: 'Test post',
        createdAt: new Date('2024-01-10'),
        platform: SocialMediaPlatform.TWITTER,
      },
    ],
    givPowerRank: 50,
    topPowerRank: 1000,
    causeTitle: 'Test Cause',
    causeDescription: 'Test Cause Description',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
    llmService = module.get(LLMService);
    _configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateCauseScore', () => {
    it('should calculate cause score successfully', async () => {
      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                projectInfoQualityScore: 75,
                socialMediaQualityScore: 80,
                twitterQualityScore: 85,
                farcasterQualityScore: 75,
                relevanceToCauseScore: 90,
                socialMediaRelevanceScore: 85,
                projectRelevanceScore: 95,
                evidenceOfImpactScore: 85,
                projectInfoQualityReasoning: 'Good project description',
                socialMediaQualityReasoning: 'Active social media presence',
                relevanceToCauseReasoning: 'Highly relevant to cause',
                evidenceOfImpactReasoning: 'Clear evidence of positive impact',
              }),
            },
          },
        ],
      };

      llmService.createChatCompletion.mockResolvedValue(mockLLMResponse as any);

      const result = await service.calculateCauseScore(mockInput);

      expect(result).toBeDefined();
      expect(result.finalScore).toBeGreaterThan(0);
      expect(result.finalScore).toBeLessThanOrEqual(100);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.projectInfoQualityScore).toBe(75);
      expect(result.breakdown.socialMediaQualityScore).toBe(80); // (85 * 0.5) + (75 * 0.5) = 80
      expect(result.breakdown.relevanceToCauseScore).toBe(90); // (85 * 0.5) + (95 * 0.5) = 90
      expect(result.breakdown.evidenceOfImpactScore).toBe(85);
    });

    it('should return zero scores when LLM assessment fails', async () => {
      llmService.createChatCompletion.mockRejectedValue(new Error('LLM Error'));

      // Use input with no other scoring components to ensure we get 0
      const inputWithoutOtherScores = new ScoringInputDto({
        ...mockInput,
        givPowerRank: undefined,
        lastUpdateDate: undefined,
        socialPosts: [],
      });

      const result = await service.calculateCauseScore(inputWithoutOtherScores);

      expect(result.finalScore).toBe(0);
      expect(result.breakdown.projectInfoQualityScore).toBe(0);
      expect(result.breakdown.socialMediaQualityScore).toBe(0);
      expect(result.breakdown.relevanceToCauseScore).toBe(0);
    });

    it('should handle missing social posts', async () => {
      const inputWithoutPosts = new ScoringInputDto({
        ...mockInput,
        socialPosts: [],
      });

      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                projectInfoQualityScore: 75,
                socialMediaQualityScore: 0,
                twitterQualityScore: 0,
                farcasterQualityScore: 0,
                relevanceToCauseScore: 90,
                socialMediaRelevanceScore: 0,
                projectRelevanceScore: 90,
                evidenceOfImpactScore: 75,
              }),
            },
          },
        ],
      };

      llmService.createChatCompletion.mockResolvedValue(mockLLMResponse as any);

      const result = await service.calculateCauseScore(inputWithoutPosts);

      expect(result.breakdown.socialMediaRecencyScore).toBe(0);
      expect(result.breakdown.socialMediaFrequencyScore).toBe(0);
    });

    it('should handle missing update date', async () => {
      const inputWithoutUpdateDate = new ScoringInputDto({
        ...mockInput,
        lastUpdateDate: undefined,
      });

      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                projectInfoQualityScore: 75,
                socialMediaQualityScore: 80,
                twitterQualityScore: 85,
                farcasterQualityScore: 75,
                relevanceToCauseScore: 90,
                socialMediaRelevanceScore: 85,
                projectRelevanceScore: 95,
                evidenceOfImpactScore: 80,
              }),
            },
          },
        ],
      };

      llmService.createChatCompletion.mockResolvedValue(mockLLMResponse as any);

      const result = await service.calculateCauseScore(inputWithoutUpdateDate);

      expect(result.breakdown.updateRecencyScore).toBe(0);
    });
  });

  describe('Score calculations', () => {
    it('should calculate update recency score with exponential decay', async () => {
      const testCases = [
        { daysAgo: 0, expectedScore: 100 },
        { daysAgo: 30, expectedScore: 50 }, // Half-life at 30 days
        { daysAgo: 60, expectedScore: 25 }, // Quarter at 60 days
        { daysAgo: 90, expectedScore: 13 }, // Continues to decay
      ];

      for (const { daysAgo, expectedScore } of testCases) {
        const testDate = new Date();
        testDate.setDate(testDate.getDate() - daysAgo);

        const input = new ScoringInputDto({
          ...mockInput,
          lastUpdateDate: testDate,
        });

        const mockLLMResponse = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  projectInfoQualityScore: 0,
                  socialMediaQualityScore: 0,
                  twitterQualityScore: 0,
                  farcasterQualityScore: 0,
                  relevanceToCauseScore: 0,
                  socialMediaRelevanceScore: 0,
                  projectRelevanceScore: 0,
                  evidenceOfImpactScore: 0,
                }),
              },
            },
          ],
        };

        llmService.createChatCompletion.mockResolvedValue(
          mockLLMResponse as any,
        );

        const result = await service.calculateCauseScore(input);

        // Allow for rounding differences
        expect(result.breakdown.updateRecencyScore).toBeCloseTo(
          expectedScore,
          -1,
        );
      }
    });

    it('should calculate social media frequency score based on post count', async () => {
      const testCases = [
        { postCount: 0, expectedScore: 0 },
        { postCount: 4, expectedScore: 50 }, // 4/8 = 50%
        { postCount: 8, expectedScore: 100 }, // Full score at 8 posts
        { postCount: 12, expectedScore: 100 }, // Capped at 100
      ];

      for (const { postCount, expectedScore } of testCases) {
        // Use recent dates within the frequency period
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 15); // 15 days ago, within 30-day window

        const posts = Array.from({ length: postCount }, (_, i) => ({
          id: `${i}`,
          text: `Post ${i}`,
          createdAt: new Date(recentDate.getTime() + i * 1000), // Spread posts over time
          platform: SocialMediaPlatform.TWITTER,
        }));

        const input = new ScoringInputDto({
          ...mockInput,
          socialPosts: posts,
        });

        const mockLLMResponse = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  projectInfoQualityScore: 0,
                  socialMediaQualityScore: 0,
                  twitterQualityScore: 0,
                  farcasterQualityScore: 0,
                  relevanceToCauseScore: 0,
                  socialMediaRelevanceScore: 0,
                  projectRelevanceScore: 0,
                  evidenceOfImpactScore: 0,
                }),
              },
            },
          ],
        };

        llmService.createChatCompletion.mockResolvedValue(
          mockLLMResponse as any,
        );

        const result = await service.calculateCauseScore(input);

        expect(result.breakdown.socialMediaFrequencyScore).toBe(expectedScore);
      }
    });

    it('should calculate GIVpower rank score correctly', async () => {
      // Test GIVpower scoring with percentile-based calculation
      // Lower rank (better) = higher score
      const testCases = [
        { rank: 1, totalProjects: 1000, expectedScore: 100 }, // Best rank: (1000-1)/1000 = 99.9% -> 100
        { rank: 100, totalProjects: 1000, expectedScore: 90 }, // (1000-100)/1000 = 90%
        { rank: 500, totalProjects: 1000, expectedScore: 50 }, // (1000-500)/1000 = 50%
        { rank: 1000, totalProjects: 1000, expectedScore: 0 }, // Worst rank: (1000-1000)/1000 = 0%
      ];

      for (const { rank, totalProjects, expectedScore } of testCases) {
        const input = new ScoringInputDto({
          ...mockInput,
          givPowerRank: rank,
          topPowerRank: totalProjects,
        });

        const mockLLMResponse = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  projectInfoQualityScore: 0,
                  socialMediaQualityScore: 0,
                  twitterQualityScore: 0,
                  farcasterQualityScore: 0,
                  relevanceToCauseScore: 0,
                  socialMediaRelevanceScore: 0,
                  projectRelevanceScore: 0,
                  evidenceOfImpactScore: 0,
                }),
              },
            },
          ],
        };

        llmService.createChatCompletion.mockResolvedValue(
          mockLLMResponse as any,
        );

        const result = await service.calculateCauseScore(input);

        expect(result.breakdown.givPowerRankScore).toBe(expectedScore);
      }
    });

    it('should handle edge cases and division by zero safely', async () => {
      const edgeCases = [
        {
          rank: 1,
          topRank: 0,
          expectedScore: 0,
          description: 'division by zero',
        },
        {
          rank: 1,
          topRank: -5,
          expectedScore: 0,
          description: 'negative topPowerRank',
        },
        {
          rank: -1,
          topRank: 48,
          expectedScore: 0,
          description: 'negative givPowerRank',
        },
        {
          rank: 50,
          topRank: 48,
          expectedScore: 0,
          description: 'givPowerRank > topPowerRank',
        },
        {
          rank: 0,
          topRank: 48,
          expectedScore: 0,
          description: 'zero givPowerRank',
        },
        {
          rank: 48,
          topRank: 48,
          expectedScore: 0,
          description: 'worst possible rank',
        },
      ];

      for (const { rank, topRank, expectedScore } of edgeCases) {
        const input = new ScoringInputDto({
          ...mockInput,
          givPowerRank: rank,
          topPowerRank: topRank,
        });

        const mockLLMResponse = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  projectInfoQualityScore: 0,
                  socialMediaQualityScore: 0,
                  twitterQualityScore: 0,
                  farcasterQualityScore: 0,
                  relevanceToCauseScore: 0,
                  socialMediaRelevanceScore: 0,
                  projectRelevanceScore: 0,
                  evidenceOfImpactScore: 0,
                }),
              },
            },
          ],
        };

        llmService.createChatCompletion.mockResolvedValue(
          mockLLMResponse as any,
        );

        const result = await service.calculateCauseScore(input);

        expect(result.breakdown.givPowerRankScore).toBe(expectedScore);
        // Test description is just for clarity in case of failures
        expect(result.breakdown.givPowerRankScore).toBe(expectedScore); // ${description}
      }
    });
  });

  describe('Weight validation', () => {
    it('should use default weights that sum to 1.0', async () => {
      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                projectInfoQualityScore: 100,
                socialMediaQualityScore: 100,
                twitterQualityScore: 100,
                farcasterQualityScore: 100,
                relevanceToCauseScore: 100,
                socialMediaRelevanceScore: 100,
                projectRelevanceScore: 100,
                evidenceOfImpactScore: 100,
              }),
            },
          },
        ],
      };

      llmService.createChatCompletion.mockResolvedValue(mockLLMResponse as any);

      const input = new ScoringInputDto({
        ...mockInput,
        givPowerRank: 1,
        topPowerRank: 1000,
        lastUpdateDate: new Date(),
        socialPosts: Array.from({ length: 10 }, (_, i) => ({
          id: `${i}`,
          text: `Post ${i}`,
          createdAt: new Date(),
          platform: SocialMediaPlatform.TWITTER,
        })),
      });

      const result = await service.calculateCauseScore(input);

      // With all components at 100 including GIVpower (15%), the final score should be 100
      // GIVpower scoring is now re-enabled and rank 1/1000 gives perfect score
      expect(result.finalScore).toBe(100);
    });
  });
});
