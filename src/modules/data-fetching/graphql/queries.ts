import { gql } from 'graphql-request';

/**
 * Query to fetch all causes with basic information and associated projects
 */
export const CAUSES_QUERY = gql`
  query GetCauses($limit: Float, $offset: Float) {
    causes(limit: $limit, offset: $offset) {
      id
      title
      description
      mainCategory
      subCategories
      status
      projects {
        id
        slug
        title
      }
      activeProjectsCount
      totalRaised
      totalDistributed
      totalDonated
      createdAt
      updatedAt
    }
  }
`;

/**
 * Query to fetch a specific cause by ID with detailed project information
 */
export const CAUSE_BY_ID_QUERY = gql`
  query GetCauseById($id: Float!) {
    cause(id: $id) {
      id
      title
      description
      mainCategory
      subCategories
      status
      projects {
        id
        slug
        title
        description
        descriptionSummary
        verified
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
        isGivbackEligible
        listed
        giveBacks
      }
      activeProjectsCount
      totalRaised
      totalDistributed
      totalDonated
      createdAt
      updatedAt
    }
  }
`;

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

      # Causes this project belongs to
      causes {
        id
        title
        description
        mainCategory
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
        causes {
          id
          title
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
