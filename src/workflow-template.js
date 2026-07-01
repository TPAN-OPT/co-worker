const PRODUCTION_FEATURE_TEMPLATE_ID = 'production-feature'
const MINIMAL_TEMPLATE_ID = 'minimal'
const OPT_DEMO_TEMPLATE_ID = 'opt-demo'

// The bundled demo agent the opt-demo template drives at every stage. The
// orchestrator substitutes {stage}/{role}/{brief}; quickstart writes the script
// referenced here into scripts/demo-agent.mjs so --invoke works with zero setup.
const DEMO_AGENT_COMMAND =
  'node scripts/demo-agent.mjs --stage {stage} --role {role} --brief {brief}'

const WORKFLOW_TEMPLATE_CATALOG = [
  {
    id: PRODUCTION_FEATURE_TEMPLATE_ID,
    name: 'Production Feature Workflow',
    description:
      'Planner, engineer, reviewer, and release manager workflow for verified product delivery.',
    defaultWorkflowName: 'production-feature-workflow'
  },
  {
    id: OPT_DEMO_TEMPLATE_ID,
    name: 'OPT Demo Team Workflow',
    description:
      'Runnable four-role agent team (planner, engineer, reviewer, lead) driven end to end by the bundled demo agent; ends at one human approval.',
    defaultWorkflowName: 'opt-demo-workflow'
  },
  {
    id: MINIMAL_TEMPLATE_ID,
    name: 'Minimal Evidence Workflow',
    description:
      'Language-neutral starter workflow with manual planning, verification, and approval gates.',
    defaultWorkflowName: 'minimal-evidence-workflow'
  }
]

export function listWorkflowTemplates() {
  return WORKFLOW_TEMPLATE_CATALOG.map((template) => ({ ...template }))
}

export function createWorkflowFromTemplate(templateId, options = {}) {
  if (templateId === PRODUCTION_FEATURE_TEMPLATE_ID) {
    return createOptWorkflowTemplate(options)
  }

  if (templateId === OPT_DEMO_TEMPLATE_ID) {
    return createOptDemoWorkflowTemplate(options)
  }

  if (templateId === MINIMAL_TEMPLATE_ID) {
    return createMinimalWorkflowTemplate(options)
  }

  throw new Error(`Unknown workflow template "${templateId}"`)
}

export function createOptWorkflowTemplate(options = {}) {
  const workflowName = options.name || 'production-feature-workflow'
  const organization = normalizeOrganizationOption(options.organization)

  return {
    name: workflowName,
    version: '1.0.0',
    ...(organization ? { organization } : {}),
    gatePresets: {
      'team:review-signoff': {
        type: 'manual',
        description: 'Engineering owner reviewed the change and signed off.'
      }
    },
    roles: {
      planner: {
        description:
          'Clarifies product capability, constraints, non-goals, and implementation handoff.',
        skills: ['product-capability', 'api-design'],
        permissions: ['read_repo', 'write_docs']
      },
      engineer: {
        description:
          'Implements the approved capability with tests and focused code changes.',
        skills: ['tdd-workflow', 'coding-standards'],
        permissions: ['read_repo', 'write_code', 'run_tests']
      },
      reviewer: {
        description:
          'Reviews code quality, correctness, maintainability, and security-sensitive changes.',
        skills: ['code-review', 'security-review'],
        permissions: ['read_diff', 'comment']
      },
      'release-manager': {
        description:
          'Prepares release notes, verifies evidence, and asks for final human approval.',
        skills: ['verification-loop'],
        permissions: ['read_repo', 'write_docs']
      }
    },
    stages: [
      {
        id: 'clarify',
        owner: 'planner',
        output: 'capability_spec',
        gates: [
          {
            id: 'open_questions_resolved',
            type: 'manual',
            description: 'All blocking product questions have an owner or answer.'
          },
          {
            id: 'non_goals_confirmed',
            type: 'manual',
            description: 'Scope boundaries are documented before implementation starts.'
          }
        ]
      },
      {
        id: 'implement',
        owner: 'engineer',
        output: 'code_patch',
        required: ['tests_first', 'implementation', 'local_verification'],
        gates: [
          {
            id: 'unit_tests_pass',
            preset: 'node:test'
          },
          {
            id: 'coverage_above_80',
            preset: 'node:coverage',
            description: 'Run coverage checks and verify the configured threshold.'
          }
        ]
      },
      {
        id: 'review',
        owner: 'reviewer',
        output: 'review_report',
        gates: [
          {
            id: 'no_critical_security_issues',
            type: 'manual',
            description: 'Security review found no unresolved critical issues.'
          },
          {
            id: 'no_high_correctness_issues',
            preset: 'team:review-signoff',
            description:
              'Code review found no unresolved high-severity correctness issues.'
          }
        ]
      },
      {
        id: 'ship',
        owner: 'release-manager',
        output: 'release_packet',
        gates: [
          {
            id: 'verification_evidence_attached',
            type: 'manual',
            description:
              'Test, review, and approval evidence is attached to the release packet.'
          },
          {
            id: 'human_approval',
            type: 'manual',
            description: 'A human lead approved release or external publication.'
          }
        ]
      }
    ]
  }
}

// A fully runnable four-role team workflow used by `quickstart`. Every non-final
// stage gates on a command that the bundled demo agent satisfies by writing its
// artifact, so the orchestrator invokes each owner agent in turn and the run
// cascades planner -> engineer -> reviewer -> lead, stopping at a single human
// approval. The persisted orchestration.agentCommand means `--invoke` drives the
// demo agent with no flags, and the whole run is reproducible by re-running it.
export function createOptDemoWorkflowTemplate(options = {}) {
  const workflowName = options.name || 'opt-demo-workflow'
  const organization = normalizeOrganizationOption(options.organization)
  const checkGate = (id, stageId, description) => ({
    id,
    type: 'command',
    command: `node scripts/demo-agent.mjs --check ${stageId}`,
    description
  })

  return {
    name: workflowName,
    version: '1.0.0',
    ...(organization ? { organization } : {}),
    orchestration: { agentCommand: DEMO_AGENT_COMMAND },
    roles: {
      planner: {
        description: 'Clarifies scope, non-goals, and the definition of done before work starts.',
        skills: ['product-capability'],
        permissions: ['read_repo', 'write_docs']
      },
      engineer: {
        description: 'Implements the clarified capability with a covering check.',
        skills: ['tdd-workflow', 'coding-standards'],
        permissions: ['read_repo', 'write_code', 'run_tests']
      },
      reviewer: {
        description: 'Reviews correctness, security, and maintainability of the change.',
        skills: ['code-review', 'security-review'],
        permissions: ['read_diff', 'comment']
      },
      lead: {
        description: 'Assembles the release packet and asks for the final human approval.',
        skills: ['verification-loop'],
        permissions: ['read_repo', 'write_docs']
      }
    },
    stages: [
      {
        id: 'clarify',
        owner: 'planner',
        output: 'capability_spec',
        gates: [checkGate('scope_documented', 'clarify', 'Planner agent documented scope and non-goals.')]
      },
      {
        id: 'implement',
        owner: 'engineer',
        output: 'code_patch',
        gates: [checkGate('change_implemented', 'implement', 'Engineer agent implemented the capability with a check.')]
      },
      {
        id: 'review',
        owner: 'reviewer',
        output: 'review_report',
        gates: [checkGate('review_passed', 'review', 'Reviewer agent recorded an approve verdict.')]
      },
      {
        id: 'ship',
        owner: 'lead',
        output: 'release_packet',
        gates: [
          checkGate('release_packet_ready', 'ship', 'Lead agent assembled the release packet.'),
          {
            id: 'human_approval',
            type: 'manual',
            description: 'A human lead approved the result before release.'
          }
        ]
      }
    ]
  }
}

export function createMinimalWorkflowTemplate(options = {}) {
  const workflowName = options.name || 'minimal-evidence-workflow'
  const organization = normalizeOrganizationOption(options.organization)

  return {
    name: workflowName,
    version: '1.0.0',
    ...(organization ? { organization } : {}),
    roles: {
      lead: {
        description:
          'Owns planning, local verification evidence, and final human approval for a lightweight workflow.',
        skills: ['verification-loop'],
        permissions: ['read_repo', 'write_docs']
      }
    },
    stages: [
      {
        id: 'plan',
        owner: 'lead',
        output: 'implementation_plan',
        gates: [
          {
            id: 'scope_confirmed',
            type: 'manual',
            description: 'Scope, constraints, and expected evidence are confirmed.'
          }
        ]
      },
      {
        id: 'verify',
        owner: 'lead',
        output: 'verification_evidence',
        gates: [
          {
            id: 'local_checks_recorded',
            type: 'manual',
            description: 'Project-appropriate local checks are recorded as evidence.'
          }
        ]
      },
      {
        id: 'approve',
        owner: 'lead',
        output: 'approval_record',
        gates: [
          {
            id: 'human_approval',
            type: 'manual',
            description: 'A human lead approved the result before release or publication.'
          }
        ]
      }
    ]
  }
}

function normalizeOrganizationOption(organization) {
  if (!organization) {
    return null
  }

  return {
    ...(organization.team ? { team: organization.team } : {}),
    policies: [...organization.policies]
  }
}
