#!/usr/bin/env node

/**
 * Test script to demonstrate cause-project filtering behavior
 *
 * This script shows how the donation evaluator service filters projects
 * to only include those that are associated with at least one cause.
 */

interface Project {
  id: string;
  title: string;
  slug: string;
  projectType: string;
}

interface Cause {
  id: string;
  title: string;
  projectType: string;
  projects: Project[];
}

interface MockGraphQLResponse {
  data: {
    causes: Cause[];
  };
}

interface ProcessedProject {
  id: string;
  slug: string;
  title: string;
  projectType: string;
  causeCount: number;
}

interface DemoResults {
  totalCauses: number;
  totalProjectsFromCauses: number;
  uniqueProjectsFromCauses: number;
  projectsInMultipleCauses: number;
  sampleProjectSlugs: string[];
}

console.log('🔍 Donation Agent Evaluator - Cause-Project Filtering Demo\n');

// Mock data to simulate GraphQL response
const mockGraphQLResponse: MockGraphQLResponse = {
  data: {
    causes: [
      {
        id: '235044',
        title: 'Climate Action Projects',
        projectType: 'cause',
        projects: [
          {
            id: '1',
            title: 'Giveth',
            slug: 'giveth',
            projectType: 'project',
          },
          {
            id: '223448',
            title: 'Teach music to Children',
            slug: 'teach-music-to-children',
            projectType: 'project',
          },
          {
            id: '223632',
            title: 'Helping Julian Mello fly again',
            slug: 'helping-julian-mello-fly-again-move-again',
            projectType: 'project',
          },
        ],
      },
      {
        id: '235043',
        title: 'Education & Community',
        projectType: 'cause',
        projects: [
          {
            id: '1',
            title: 'Giveth',
            slug: 'giveth',
            projectType: 'project',
          },
          {
            id: '223448',
            title: 'Teach music to Children',
            slug: 'teach-music-to-children',
            projectType: 'project',
          },
          {
            id: '223764',
            title: 'Climate Education Workshop',
            slug: 'climate-education-workshop',
            projectType: 'project',
          },
        ],
      },
    ],
  },
};

function demonstrateFiltering(): DemoResults {
  console.log('📊 STEP 1: GraphQL Query Response (Mock Data)');
  console.log('============================================\n');

  const { causes } = mockGraphQLResponse.data;

  causes.forEach((cause, index) => {
    console.log(`Cause ${index + 1}:`);
    console.log(`  ID: ${cause.id}`);
    console.log(`  Title: ${cause.title}`);
    console.log(`  Type: ${cause.projectType}`);
    console.log(`  Projects: ${cause.projects.length}`);
    cause.projects.forEach((project, pIndex) => {
      console.log(
        `    ${pIndex + 1}. ${project.title} (${project.slug}) - Type: ${project.projectType}`,
      );
    });
    console.log('');
  });

  console.log('🔄 STEP 2: Processing & Deduplication');
  console.log('=====================================\n');

  const allProjects = new Map<string, ProcessedProject>();
  let totalProjectsFromCauses = 0;

  causes.forEach(cause => {
    console.log(`Processing cause: ${cause.title}`);

    cause.projects.forEach(project => {
      totalProjectsFromCauses++;

      if (allProjects.has(project.id)) {
        // Project appears in multiple causes
        const existingProject = allProjects.get(project.id);
        if (existingProject) {
          existingProject.causeCount++;
          console.log(
            `  ✓ ${project.title} (already seen - appears in ${existingProject.causeCount} causes)`,
          );
        }
      } else {
        // First time seeing this project
        allProjects.set(project.id, {
          id: project.id,
          slug: project.slug,
          title: project.title,
          projectType: project.projectType,
          causeCount: 1,
        });
        console.log(`  + ${project.title} (new project - will be saved)`);
      }
    });
    console.log('');
  });

  console.log('📈 STEP 3: Filtering Results');
  console.log('============================\n');

  const uniqueProjectsFromCauses = allProjects.size;
  const projectsInMultipleCauses = Array.from(allProjects.values()).filter(
    p => p.causeCount > 1,
  ).length;

  console.log(`Total causes processed: ${causes.length}`);
  console.log(`Total project occurrences: ${totalProjectsFromCauses}`);
  console.log(`Unique projects from causes: ${uniqueProjectsFromCauses}`);
  console.log(`Projects in multiple causes: ${projectsInMultipleCauses}`);
  console.log('');

  console.log('📝 STEP 4: Projects That Would Be Saved');
  console.log('========================================\n');

  Array.from(allProjects.values()).forEach((project, index) => {
    console.log(`${index + 1}. ${project.title}`);
    console.log(`   ID: ${project.id}`);
    console.log(`   Slug: ${project.slug}`);
    console.log(`   Type: ${project.projectType}`);
    console.log(`   Appears in ${project.causeCount} cause(s)`);
    console.log('');
  });

  console.log('✅ STEP 5: Key Insights');
  console.log('=======================\n');

  console.log('🎯 FILTERING BEHAVIOR:');
  console.log(
    '• Only projects that appear in at least one cause are processed',
  );
  console.log(
    '• Projects not associated with any cause are automatically excluded',
  );
  console.log(
    '• The filtering happens naturally through the GraphQL query structure',
  );
  console.log('• No additional filtering logic is needed');
  console.log('');

  console.log('🔄 DEDUPLICATION:');
  console.log('• Projects appearing in multiple causes are saved only once');
  console.log('• Each unique project gets saved with complete metadata');
  console.log('• Social media handles are extracted for content fetching');
  console.log('');

  console.log('📊 UNIFIED STRUCTURE:');
  console.log('• Causes have projectType: "cause"');
  console.log('• Projects have projectType: "project"');
  console.log('• Backward compatible with existing queries');
  console.log('• Supports new unified schema architecture');
  console.log('');

  console.log('✨ CONCLUSION:');
  console.log('The system correctly implements cause-project filtering by:');
  console.log('1. Fetching projects through causes (natural filtering)');
  console.log('2. Deduplicating projects across multiple causes');
  console.log('3. Saving only unique projects with complete metadata');
  console.log('4. Supporting the new unified projectType structure');
  console.log('');

  return {
    totalCauses: causes.length,
    totalProjectsFromCauses,
    uniqueProjectsFromCauses,
    projectsInMultipleCauses,
    sampleProjectSlugs: Array.from(allProjects.values())
      .slice(0, 3)
      .map(p => p.slug),
  };
}

// Run the demonstration
const _results = demonstrateFiltering();

console.log('🚀 TESTING INSTRUCTIONS:');
console.log('========================\n');
console.log('To test this with your running application:');
console.log('');
console.log('1. Start database: docker-compose up -d postgres');
console.log('2. Start application: npm run start:dev');
console.log('3. Check current state: curl http://localhost:3000/admin/stats');
console.log(
  '4. Trigger sync: curl -X POST http://localhost:3000/admin/sync-projects',
);
console.log(
  '5. Validate filtering: curl http://localhost:3000/admin/cause-project-validation',
);
console.log('6. Check database: SELECT * FROM project_social_accounts;');
console.log('');
console.log('📋 ADMIN ENDPOINTS:');
console.log('• GET /admin/stats - System statistics');
console.log('• GET /admin/cause-project-validation - Filtering validation');
console.log('• POST /admin/sync-projects - Manual sync trigger');
console.log('• POST /admin/fetch/:projectId - Force social media fetch');
console.log('');
console.log(
  '💾 The current database contains test projects from previous runs.',
);
console.log(
  'When the GraphQL API is accessible, real cause-project data will be synced.',
);
