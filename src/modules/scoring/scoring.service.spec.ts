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
    qualityScore: 80,
    givPowerRank: 50,
    totalProjectCount: 1000,
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
                relevanceToCauseScore: 90,
                projectInfoQualityReasoning: 'Good project description',
                socialMediaQualityReasoning: 'Active social media presence',
                relevanceToCauseReasoning: 'Highly relevant to cause',
              }),
            },
          },
        ],
      };

      llmService.createChatCompletion.mockResolvedValue(mockLLMResponse as any);

      const result = await service.calculateCauseScore(mockInput);

      expect(result).toBeDefined();
      expect(result.causeScore).toBeGreaterThan(0);
      expect(result.causeScore).toBeLessThanOrEqual(100);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.projectInfoQualityScore).toBe(75);
      expect(result.breakdown.socialMediaQualityScore).toBe(80);
      expect(result.breakdown.relevanceToCauseScore).toBe(90);
    });

    it('should return zero scores when LLM assessment fails', async () => {
      llmService.createChatCompletion.mockRejectedValue(new Error('LLM Error'));

      // Use input with no other scoring components to ensure we get 0
      const inputWithoutOtherScores = new ScoringInputDto({
        ...mockInput,
        qualityScore: undefined,
        givPowerRank: undefined,
        lastUpdateDate: undefined,
        socialPosts: [],
      });

      const result = await service.calculateCauseScore(inputWithoutOtherScores);

      expect(result.causeScore).toBe(0);
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
                relevanceToCauseScore: 90,
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
                relevanceToCauseScore: 90,
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
                  relevanceToCauseScore: 0,
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
                  relevanceToCauseScore: 0,
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
      const testCases = [
        { rank: 1, totalProjects: 1000, expectedScore: 100 }, // Top rank
        { rank: 100, totalProjects: 1000, expectedScore: 90 }, // Top 10%
        { rank: 500, totalProjects: 1000, expectedScore: 50 }, // Middle
        { rank: 1000, totalProjects: 1000, expectedScore: 0 }, // Last
      ];

      for (const { rank, totalProjects, expectedScore } of testCases) {
        const input = new ScoringInputDto({
          ...mockInput,
          givPowerRank: rank,
          totalProjectCount: totalProjects,
        });

        const mockLLMResponse = {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  projectInfoQualityScore: 0,
                  socialMediaQualityScore: 0,
                  relevanceToCauseScore: 0,
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
                relevanceToCauseScore: 100,
              }),
            },
          },
        ],
      };

      llmService.createChatCompletion.mockResolvedValue(mockLLMResponse as any);

      const input = new ScoringInputDto({
        ...mockInput,
        givPowerRank: 1,
        totalProjectCount: 1000,
        lastUpdateDate: new Date(),
        socialPosts: Array.from({ length: 10 }, (_, i) => ({
          id: `${i}`,
          text: `Post ${i}`,
          createdAt: new Date(),
          platform: SocialMediaPlatform.TWITTER,
        })),
      });

      const result = await service.calculateCauseScore(input);

      // With all components at 100, the final score should be 100
      expect(result.causeScore).toBe(100);
    });
  });
});
