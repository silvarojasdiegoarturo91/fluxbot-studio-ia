/**
 * OpenSpec Configuration for Fluxbot Studio IA
 * Defines how requirements are tracked, reported, and validated
 */

export default {
  // Project metadata
  project: {
    name: 'Fluxbot Studio IA',
    version: '0.1.0',
    description: 'Shopify AI Chatbot App - Conversational Commerce Platform',
  },

  // Specification file(s)
  specs: {
    format: 'json',
    source: ['.openspec.json'],
    watch: true, // Watch for changes
  },

  // Reporting configuration
  reporting: {
    // Generate HTML report
    html: {
      enabled: true,
      output: './reports/openspec-report.html',
      template: 'default',
    },
    // Generate markdown report
    markdown: {
      enabled: true,
      output: './reports/openspec-report.md',
      includeMetrics: true,
    },
    // Console output
    console: {
      enabled: true,
      verbosity: 'normal', // 'quiet', 'normal', 'verbose'
    },
  },

  // Validation rules
  validation: {
    // Check for completeness
    completeness: {
      requireAcceptanceCriteria: true,
      requireDependencies: true,
      requireMetrics: true,
    },
    // Check for consistency
    consistency: {
      checkDependencies: true,
      checkStatusTransitions: true,
      requireEstimates: false,
    },
  },

  // Status tracking
  statuses: {
    initial: 'planned',
    valid: ['planned', 'in-progress', 'completed', 'blocked', 'deprecated'],
    colors: {
      planned: '#gray',
      'in-progress': '#blue',
      completed: '#green',
      blocked: '#red',
      deprecated: '#yellow',
    },
  },

  // Priority levels
  priorities: {
    valid: ['low', 'medium', 'high', 'critical'],
    enforcement: 'strict',
  },

  // Traceability
  traceability: {
    enabled: true,
    bidirectional: true,
    checkCycles: true,
  },

  // Testing integration
  testing: {
    framework: 'vitest',
    matchPattern: '**/*.test.ts',
    autoLink: true,
  },

  // Metrics and KPIs
  metrics: {
    track: ['completion_rate', 'quality_score', 'velocity'],
    targets: {
      completion: 100,
      quality: 95,
      velocity: 15, // requirements per sprint
    },
  },

  // CI/CD integration
  cicd: {
    enabled: true,
    failOnUnmapped: false,
    failOnHighRisk: true,
    generateArtifacts: true,
  },

  // Export options
  export: {
    formats: ['json', 'csv', 'html', 'markdown'],
    includeHistory: true,
  },

  // Change tracking
  changelog: {
    enabled: true,
    file: 'REQUIREMENTS_CHANGELOG.md',
    trackStatus: true,
    trackDescription: true,
  },

  // Notifications
  notifications: {
    slackEnabled: false,
    email: false,
    onStatusChange: ['critical'],
  },
};
