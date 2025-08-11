import { gql } from 'graphql-request';

/**
 * Query to fetch detailed project information by slug
 */
export const PROJECT_BY_SLUG_QUERY = gql`
  query GetProjectBySlug($slug: String!, $connectedWalletUserId: Int) {
    projectBySlug(slug: $slug, connectedWalletUserId: $connectedWalletUserId) {
      id
      title
      slug
      description
      descriptionSummary
      website
      youtube
      creationDate
      updatedAt
      latestUpdateCreationDate
      image
      impactLocation
      verificationStatus
      isImported
      giveBacks
      qualityScore
      totalDonations
      totalTraceDonations
      totalProjectUpdates
      countUniqueDonors
      listed
      isGivbackEligible
      reviewStatus

      # Project type (project or cause)
      projectType

      # Project status information (optional due to nullable status)
      # status {
      #   id
      #   symbol
      #   name
      #   description
      # }

      # Project categories
      categories {
        id
        name
        value
        mainCategory {
          id
          title
          slug
        }
      }

      # Social media links
      socialMedia {
        id
        type
        link
      }

      # Project updates for content quality assessment
      projectUpdates {
        id
        title
        content
        contentSummary
        createdAt
        isMain
      }

      # Latest project update
      projectUpdate {
        id
        title
        content
        contentSummary
        createdAt
        isMain
      }

      # Power ranking information
      projectPower {
        projectId
        totalPower
        powerRank
        round
      }

      # Instant power ranking
      projectInstantPower {
        projectId
        totalPower
        powerRank
      }

      # Future power ranking
      projectFuturePower {
        projectId
        totalPower
        powerRank
        round
      }

      # Organization information
      organization {
        id
        name
        label
        website
      }

      # Verification form for additional social profiles
      projectVerificationForm {
        socialProfiles {
          socialNetwork
          socialNetworkId
          name
          link
          isVerified
        }
      }

      # Social profiles from verification
      socialProfiles {
        id
        socialNetwork
        name
        link
        isVerified
      }

      # Project addresses (wallet addresses)
      addresses {
        id
        title
        address
        networkId
        chainType
        isRecipient
      }

      # Estimated matching for QF rounds
      estimatedMatching {
        projectDonationsSqrtRootSum
        allProjectsSum
        matchingPool
        matching
      }

      # Givback factor
      givbackFactor
    }
  }
`;

/**
 * Query to fetch multiple projects by their slugs
 */
export const PROJECTS_BY_SLUGS_QUERY = gql`
  query GetProjectsBySlugs(
    $slugs: [String!]!
    $connectedWalletUserId: Int
    $take: Float
    $skip: Float
    $orderBy: OrderBy
  ) {
    projectsBySlugs(
      slugs: $slugs
      connectedWalletUserId: $connectedWalletUserId
      take: $take
      skip: $skip
      orderBy: $orderBy
    ) {
      projects {
        id
        title
        slug
        description
        descriptionSummary
        projectType
        status {
          id
          name
          symbol
        }
        qualityScore
        totalDonations
        totalProjectUpdates
        updatedAt
        latestUpdateCreationDate
        projectPower {
          powerRank
          totalPower
        }
        socialMedia {
          type
          link
        }
        projectUpdate {
          id
          title
          content
          createdAt
        }
      }
      totalCount
    }
  }
`;

/**
 * Query to fetch project updates for a specific project
 */
export const PROJECT_UPDATES_QUERY = gql`
  query GetProjectUpdates(
    $projectId: Int!
    $take: Int
    $skip: Int
    $orderBy: OrderBy
  ) {
    getProjectUpdates(
      projectId: $projectId
      take: $take
      skip: $skip
      orderBy: $orderBy
    ) {
      id
      title
      content
      contentSummary
      createdAt
      isMain
      projectId
      userId
    }
  }
`;

/**
 * Query to fetch all causes with their associated projects
 * This is optimized to get all project data in a single query rather than fetching projects separately
 */
export const ALL_CAUSES_WITH_PROJECTS_QUERY = gql`
  query GetAllCausesWithProjects($limit: Float, $offset: Float) {
    causes(limit: $limit, offset: $offset) {
      id
      title
      description
      chainId
      activeProjectsCount
      totalRaised
      totalDistributed
      totalDonated
      creationDate
      updatedAt
      projectType

      # All projects in this cause with complete data for sync
      projects {
        id
        title
        slug
        description
        descriptionSummary
        website
        youtube
        creationDate
        updatedAt
        latestUpdateCreationDate
        image
        impactLocation
        verificationStatus
        isImported
        giveBacks
        qualityScore
        totalDonations
        totalTraceDonations
        totalProjectUpdates
        countUniqueDonors
        listed
        isGivbackEligible
        reviewStatus
        projectType

        # Project status (commented out due to nullable field issues)
        # status {
        #   id
        #   symbol
        #   name
        #   description
        # }

        # Categories
        categories {
          id
          name
          value
          mainCategory {
            id
            title
            slug
          }
        }

        # Social media links
        socialMedia {
          id
          type
          link
        }

        # Latest project update for content analysis
        projectUpdate {
          id
          title
          content
          contentSummary
          createdAt
          isMain
        }

        # Power ranking information
        projectPower {
          projectId
          totalPower
          powerRank
          round
        }

        # Instant power ranking
        projectInstantPower {
          projectId
          totalPower
          powerRank
        }

        # Future power ranking
        projectFuturePower {
          projectId
          totalPower
          powerRank
          round
        }

        # Organization information
        organization {
          id
          name
          label
          website
        }

        # Social profiles from verification
        socialProfiles {
          id
          socialNetwork
          name
          link
          isVerified
        }

        # Project verification form for additional social profiles
        projectVerificationForm {
          socialProfiles {
            socialNetwork
            socialNetworkId
            name
            link
            isVerified
          }
        }
      }
    }
  }
`;

/**
 * Query to fetch a specific cause by ID with its projects
 */
export const CAUSE_BY_ID_QUERY = gql`
  query GetCauseById($id: Float!) {
    cause(id: $id) {
      id
      title
      description
      chainId
      activeProjectsCount
      totalRaised
      totalDistributed
      totalDonated
      creationDate
      updatedAt
      projectType

      # Projects in this cause (minimal data for getting slugs)
      projects {
        id
        slug
        title
        projectType
        # status {
        #   id
        #   symbol
        #   name
        # }
      }
    }
  }
`;

/**
 * Query to fetch causes with their associated projects for evaluation
 * This query is optimized to provide all necessary data for the cause evaluation scoring process
 */
export const ALL_PROJECTS_WITH_FILTERS_QUERY = gql`
  query GetCausesWithProjectsForEvaluation(
    $limit: Float
    $offset: Float
    $searchTerm: String
    $chainId: Float
    $listingStatus: String
  ) {
    causes(
      limit: $limit
      offset: $offset
      searchTerm: $searchTerm
      chainId: $chainId
      listingStatus: $listingStatus
    ) {
      id
      title
      description
      projectType

      # All projects in this cause with essential data for evaluation
      projects {
        id
        title
        slug
        description
        projectType
        qualityScore
        totalDonations
        latestUpdateCreationDate
        updatedAt
        creationDate
        impactLocation

        # Latest project update for content analysis
        projectUpdate {
          id
          title
          content
          contentSummary
          createdAt
          isMain
        }

        # Categories for relevance assessment
        categories {
          name
          value
          mainCategory {
            title
          }
        }

        # Social media links for handle extraction
        socialMedia {
          type
          link
        }
      }
    }
  }
`;

/**
 * Query to get the top power rank value for GIVpower scoring normalization
 */
export const GET_TOP_POWER_RANK_QUERY = gql`
  query GetTopPowerRank {
    getTopPowerRank
  }
`;

/**
 * Mutation to bulk update cause project evaluation scores
 * Used to send evaluation results back to Impact Graph after evaluation completion
 */
export const BULK_UPDATE_CAUSE_PROJECT_EVALUATION_MUTATION = gql`
  mutation BulkUpdateCauseProjectEvaluation(
    $updates: [UpdateCauseProjectEvaluationInput!]!
  ) {
    bulkUpdateCauseProjectEvaluation(updates: $updates) {
      id
      causeId
      projectId
      causeScore
    }
  }
`;
