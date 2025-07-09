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
      verified
      verificationStatus
      isImported
      giveBacks
      qualityScore
      totalDonations
      totalTraceDonations
      totalReactions
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

      # Admin user information (contains social media handles)
      adminUser {
        id
        firstName
        lastName
        name
        walletAddress
        avatar
        url
        location
      }

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
        totalReactions
      }

      # Latest project update
      projectUpdate {
        id
        title
        content
        contentSummary
        createdAt
        isMain
        totalReactions
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
        verified
        projectType
        status {
          id
          name
          symbol
        }
        qualityScore
        totalDonations
        totalReactions
        totalProjectUpdates
        updatedAt
        latestUpdateCreationDate
        projectPower {
          powerRank
          totalPower
        }
        adminUser {
          id
          name
          walletAddress
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
      totalReactions
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

      # Admin user information (cause owner)
      adminUser {
        id
        name
        walletAddress
      }

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
        verified
        verificationStatus
        isImported
        giveBacks
        qualityScore
        totalDonations
        totalTraceDonations
        totalReactions
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

        # Admin user (contains social media handles)
        adminUser {
          id
          firstName
          lastName
          name
          walletAddress
          avatar
          url
          location
        }

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
          totalReactions
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

      # Admin user information (cause owner)
      adminUser {
        id
        name
        walletAddress
      }

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
    $sortBy: String
    $sortDirection: String
    $listingStatus: String
  ) {
    causes(
      limit: $limit
      offset: $offset
      searchTerm: $searchTerm
      chainId: $chainId
      sortBy: $sortBy
      sortDirection: $sortDirection
      listingStatus: $listingStatus
    ) {
      id
      title
      description
      projectType
      totalRaised
      totalDistributed
      totalDonated
      activeProjectsCount
      chainId
      creationDate
      updatedAt
      latestUpdateCreationDate

      # Admin user information (cause owner)
      adminUser {
        id
        name
        walletAddress
      }

      # All projects in this cause with complete data for evaluation
      projects {
        id
        title
        slug
        description
        descriptionSummary
        projectType
        verified
        qualityScore
        totalDonations
        totalReactions
        countUniqueDonors
        latestUpdateCreationDate
        updatedAt
        creationDate
        totalProjectUpdates
        image
        impactLocation

        # Latest project update for content analysis
        projectUpdate {
          id
          title
          content
          contentSummary
          createdAt
          isMain
          totalReactions
        }

        # Categories for relevance assessment
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

        # Social media links for handle extraction
        socialMedia {
          id
          type
          link
        }

        # Social profiles from verification
        socialProfiles {
          id
          socialNetwork
          name
          link
          isVerified
        }

        # Admin user (contains social media handles)
        adminUser {
          id
          firstName
          lastName
          name
          walletAddress
          avatar
          url
          location
        }

        # Power ranking information for GIVpower rank scoring
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

        # Project status information
        status {
          id
          symbol
          name
          description
        }

        # Organization information
        organization {
          id
          name
          label
          website
        }

        # Additional context fields
        website
        youtube
        isGivbackEligible
        giveBacks
        listed
        reviewStatus
        verificationStatus

        # Project addresses (wallet addresses)
        addresses {
          id
          title
          address
          networkId
          chainType
          isRecipient
        }
      }
    }
  }
`;
