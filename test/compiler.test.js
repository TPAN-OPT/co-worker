import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { compileWorkflow, validateWorkflow } from '../src/compiler.js'

const validWorkflow = {
  name: 'production-feature-workflow',
  version: '1.0.0',
  roles: {
    planner: {
      description: 'Clarifies product capability and implementation constraints.',
      skills: ['product-capability', 'api-design'],
      permissions: ['read_repo', 'write_docs']
    },
    engineer: {
      description: 'Implements code with tests.',
      skills: ['tdd-workflow', 'coding-standards'],
      permissions: ['read_repo', 'write_code', 'run_tests']
    }
  },
  stages: [
    {
      id: 'clarify',
      owner: 'planner',
      output: 'capability_spec',
      gates: ['open_questions_resolved']
    },
    {
      id: 'implement',
      owner: 'engineer',
      required: ['tests_first', 'code_changes'],
      gates: ['unit_tests_pass', 'coverage_above_80']
    }
  ]
}

describe('validateWorkflow', () => {
  it('rejects malformed workflow boundaries with clear messages', () => {
    const cases = [
      [null, /Workflow must be a JSON object/],
      [{ ...validWorkflow, organization: [] }, /Workflow organization must be an object/],
      [
        { ...validWorkflow, organization: {} },
        /Workflow organization must include a team or policies/
      ],
      [{ ...validWorkflow, artifacts: [] }, /Workflow contains unknown field "artifacts"/],
      [
        { ...validWorkflow, organization: { team: 'core', approvals: [] } },
        /Workflow organization contains unknown field "approvals"/
      ],
      [{ ...validWorkflow, roles: [] }, /Workflow roles must be a non-empty object/],
      [{ ...validWorkflow, roles: {} }, /Workflow roles must be a non-empty object/],
      [{ ...validWorkflow, stages: {} }, /Workflow stages must be a non-empty array/],
      [{ ...validWorkflow, stages: [] }, /Workflow stages must be a non-empty array/]
    ]

    for (const [workflow, message] of cases) {
      assert.throws(() => validateWorkflow(workflow), message)
    }
  })

  it('rejects malformed roles, stages, arrays, and gates', () => {
    const cases = [
      [
        { ...validWorkflow, roles: { '1planner': {} } },
        /Role id "1planner" must use letters/
      ],
      [
        { ...validWorkflow, roles: { planner: null } },
        /Role "planner" must be an object/
      ],
      [
        { ...validWorkflow, roles: { planner: { skills: [], permissions: [], tools: [] } } },
        /Role "planner" contains unknown field "tools"/
      ],
      [
        { ...validWorkflow, roles: { planner: { skills: 'tdd', permissions: [] } } },
        /Role "planner" skills must be an array/
      ],
      [
        { ...validWorkflow, roles: { planner: { skills: [''], permissions: [] } } },
        /Role "planner" skills\[0\] must be a non-empty string/
      ],
      [
        { ...validWorkflow, stages: [null] },
        /Each workflow stage must be an object/
      ],
      [
        { ...validWorkflow, stages: [{ id: '1bad', owner: 'planner' }] },
        /Stage id "1bad" must use letters/
      ],
      [
        { ...validWorkflow, stages: [{ id: 'review', owner: '' }] },
        /Stage "review" owner must be a non-empty string/
      ],
      [
        { ...validWorkflow, stages: [{ id: 'review', owner: 'planner', required: [''] }] },
        /Stage "review" required\[0\] must be a non-empty string/
      ],
      [
        {
          ...validWorkflow,
          stages: [{ id: 'review', owner: 'planner', artifacts: [] }]
        },
        /Stage "review" contains unknown field "artifacts"/
      ],
      [
        { ...validWorkflow, stages: [{ id: 'review', owner: 'planner', gates: {} }] },
        /Stage "review" gates must be an array/
      ],
      [
        { ...validWorkflow, stages: [{ id: 'review', owner: 'planner', gates: [null] }] },
        /Stage "review" gates\[0\] must be a string or gate object/
      ],
      [
        { ...validWorkflow, stages: [{ id: 'review', owner: 'planner', gates: [''] }] },
        /Stage "review" gates\[0\] must be a non-empty string/
      ],
      [
        { ...validWorkflow, stages: [{ id: 'review', owner: 'planner', gates: ['bad id'] }] },
        /Gate "bad id" must use letters/
      ],
      [
        {
          ...validWorkflow,
          stages: [{ id: 'review', owner: 'planner', gates: ['done', 'done'] }]
        },
        /Duplicate gate id "done"/
      ],
      [
        {
          ...validWorkflow,
          stages: [
            {
              id: 'review',
              owner: 'planner',
              gates: [{ id: 'done', type: 'manual', approver: 'lead' }]
            }
          ]
        },
        /Stage "review" gates\[0\] contains unknown field "approver"/
      ],
      [
        {
          ...validWorkflow,
          stages: [
            {
              id: 'review',
              owner: 'planner',
              gates: [{ id: 'done', type: 'invalid' }]
            }
          ]
        },
        /Gate "done" type must be "manual" or "command"/
      ],
      [
        {
          ...validWorkflow,
          stages: [
            {
              id: 'review',
              owner: 'planner',
              gates: [{ id: 'done', preset: 'node:test', type: 'manual' }]
            }
          ]
        },
        /Gate "done" type must match preset "node:test" type "command"/
      ]
    ]

    for (const [workflow, message] of cases) {
      assert.throws(() => validateWorkflow(workflow), message)
    }
  })

  it('returns an immutable normalized workflow for valid input', () => {
    const workflow = validateWorkflow(validWorkflow)

    assert.equal(workflow.name, 'production-feature-workflow')
    assert.deepEqual(Object.keys(workflow.roles), ['planner', 'engineer'])
    assert.deepEqual(workflow.stages[0].gates, [
      {
        id: 'open_questions_resolved',
        type: 'manual',
        description: '',
        command: ''
      }
    ])
    assert.equal(Object.isFrozen(workflow.stages[0]), true)
    assert.equal(Object.isFrozen(workflow), true)
  })

  it('accepts command gates with explicit verification commands', () => {
    const workflow = validateWorkflow({
      ...validWorkflow,
      stages: [
        {
          id: 'implement',
          owner: 'engineer',
          gates: [
            {
              id: 'unit_tests_pass',
              type: 'command',
              description: 'Run the unit test suite.',
              command: 'npm test'
            }
          ]
        }
      ]
    })

    assert.deepEqual(workflow.stages[0].gates, [
      {
        id: 'unit_tests_pass',
        type: 'command',
        description: 'Run the unit test suite.',
        command: 'npm test'
      }
    ])
  })

  it('expands built-in gate presets into command gates', () => {
    const workflow = validateWorkflow({
      ...validWorkflow,
      stages: [
        {
          id: 'implement',
          owner: 'engineer',
          gates: [
            {
              id: 'unit_tests_pass',
              preset: 'node:test'
            },
            {
              id: 'coverage_above_80',
              preset: 'node:coverage',
              description: 'Project coverage threshold passed.'
            }
          ]
        }
      ]
    })

    assert.deepEqual(workflow.stages[0].gates, [
      {
        id: 'unit_tests_pass',
        type: 'command',
        preset: 'node:test',
        description: 'Run the Node.js test suite.',
        command: 'npm test'
      },
      {
        id: 'coverage_above_80',
        type: 'command',
        preset: 'node:coverage',
        description: 'Project coverage threshold passed.',
        command: 'npm run test:coverage'
      }
    ])
  })

  it('expands workflow-defined gate presets', () => {
    const workflow = validateWorkflow({
      ...validWorkflow,
      gatePresets: {
        'team:docs-check': {
          type: 'command',
          description: 'Verify documentation quality.',
          command: 'npm run docs:check'
        },
        'team:review-signoff': {
          type: 'manual',
          description: 'Engineering owner reviewed the change.'
        }
      },
      stages: [
        {
          id: 'review',
          owner: 'engineer',
          gates: [
            {
              id: 'docs_checked',
              preset: 'team:docs-check'
            },
            {
              id: 'owner_signoff',
              preset: 'team:review-signoff'
            }
          ]
        }
      ]
    })

    assert.deepEqual(workflow.gatePresets, {
      'team:docs-check': {
        type: 'command',
        description: 'Verify documentation quality.',
        command: 'npm run docs:check'
      },
      'team:review-signoff': {
        type: 'manual',
        description: 'Engineering owner reviewed the change.',
        command: ''
      }
    })
    assert.deepEqual(workflow.stages[0].gates, [
      {
        id: 'docs_checked',
        type: 'command',
        preset: 'team:docs-check',
        description: 'Verify documentation quality.',
        command: 'npm run docs:check'
      },
      {
        id: 'owner_signoff',
        type: 'manual',
        preset: 'team:review-signoff',
        description: 'Engineering owner reviewed the change.',
        command: ''
      }
    ])
  })

  it('normalizes organization team and policy metadata', () => {
    const workflow = validateWorkflow({
      ...validWorkflow,
      organization: {
        team: 'product-delivery',
        policies: ['quality-standard', 'human-control']
      }
    })

    assert.deepEqual(workflow.organization, {
      team: 'product-delivery',
      policies: ['quality-standard', 'human-control']
    })
    assert.equal(Object.isFrozen(workflow.organization), true)
    assert.equal(Object.isFrozen(workflow.organization.policies), true)
  })

  it('accepts organization policy metadata without a team', () => {
    const workflow = validateWorkflow({
      ...validWorkflow,
      organization: {
        policies: ['security-baseline']
      }
    })

    assert.deepEqual(workflow.organization, {
      policies: ['security-baseline']
    })
  })

  it('rejects stages that reference an unknown owner', () => {
    const invalidWorkflow = {
      ...validWorkflow,
      stages: [
        {
          id: 'review',
          owner: 'reviewer',
          gates: ['no_high_findings']
        }
      ]
    }

    assert.throws(
      () => validateWorkflow(invalidWorkflow),
      /Stage "review" references unknown owner "reviewer"/
    )
  })

  it('rejects duplicate stage ids', () => {
    const invalidWorkflow = {
      ...validWorkflow,
      stages: [
        validWorkflow.stages[0],
        {
          ...validWorkflow.stages[0]
        }
      ]
    }

    assert.throws(
      () => validateWorkflow(invalidWorkflow),
      /Duplicate stage id "clarify"/
    )
  })

  it('rejects command gates without a command', () => {
    const invalidWorkflow = {
      ...validWorkflow,
      stages: [
        {
          id: 'implement',
          owner: 'engineer',
          gates: [
            {
              id: 'unit_tests_pass',
              type: 'command'
            }
          ]
        }
      ]
    }

    assert.throws(
      () => validateWorkflow(invalidWorkflow),
      /Gate "unit_tests_pass" command must be a non-empty string/
    )
  })

  it('rejects unknown gate presets', () => {
    const invalidWorkflow = {
      ...validWorkflow,
      stages: [
        {
          id: 'implement',
          owner: 'engineer',
          gates: [
            {
              id: 'security_scan',
              preset: 'unknown:security'
            }
          ]
        }
      ]
    }

    assert.throws(
      () => validateWorkflow(invalidWorkflow),
      /Unknown gate preset "unknown:security"/
    )
  })

  it('rejects workflow-defined presets that override built-in presets', () => {
    const invalidWorkflow = {
      ...validWorkflow,
      gatePresets: {
        'node:test': {
          type: 'command',
          command: 'echo unsafe override'
        }
      }
    }

    assert.throws(
      () => validateWorkflow(invalidWorkflow),
      /Custom gate preset "node:test" conflicts with a built-in preset/
    )
  })
})

describe('compileWorkflow', () => {
  it('carries organization metadata into manifest and web console assets', () => {
    const outputs = compileWorkflow({
      ...validWorkflow,
      organization: {
        team: 'product-delivery',
        policies: ['quality-standard', 'security-baseline']
      }
    })

    const manifest = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/workflow.manifest.json'
    )
    const parsedManifest = JSON.parse(manifest.content)
    assert.deepEqual(parsedManifest.organization, {
      team: 'product-delivery',
      policies: ['quality-standard', 'security-baseline']
    })

    const webConsole = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/index.html'
    )
    assert.match(webConsole.content, /Organization/)
    assert.match(webConsole.content, /product-delivery/)
    assert.match(webConsole.content, /quality-standard/)
    assert.match(webConsole.content, /security-baseline/)

    const agents = outputs.find((output) => output.path === 'AGENTS.md')
    assert.match(agents.content, /Organization Standards/)
    assert.match(agents.content, /Team: `product-delivery`/)
    assert.match(agents.content, /Policies: `quality-standard`, `security-baseline`/)
    assert.match(agents.content, /Requires test, coverage, review, and release evidence/)
    assert.match(agents.content, /`tests_first`/)
    assert.match(agents.content, /`no_hardcoded_secrets`/)

    const claudeContext = outputs.find((output) => output.path === 'CLAUDE.md')
    assert.match(claudeContext.content, /Organization Standards/)
    assert.match(claudeContext.content, /Team: `product-delivery`/)
    assert.match(claudeContext.content, /Security Baseline/)
    assert.match(claudeContext.content, /`dependency_audit`/)

    const cursorRule = outputs.find(
      (output) => output.path === '.cursor/rules/tpan-opt-co-worker.mdc'
    )
    assert.match(cursorRule.content, /Organization Standards/)
    assert.match(cursorRule.content, /security-baseline/)
    assert.match(cursorRule.content, /no unresolved critical or high security findings/)

    const codexPlanner = outputs.find((output) => output.path === '.codex/agents/planner.toml')
    assert.match(codexPlanner.content, /product-delivery/)
    assert.match(codexPlanner.content, /quality-standard, security-baseline/)
    assert.match(codexPlanner.content, /tests_first/)
    assert.match(codexPlanner.content, /no_hardcoded_secrets/)

    const openCodePlanner = outputs.find(
      (output) => output.path === '.opencode/agents/planner.md'
    )
    assert.match(openCodePlanner.content, /Organization Standards/)
    assert.match(openCodePlanner.content, /security-baseline/)
    assert.match(openCodePlanner.content, /validate_system_boundaries/)
  })

  it('generates repository-native workflow assets', () => {
    const outputs = compileWorkflow(validWorkflow)
    const outputPaths = outputs.map((output) => output.path).sort()

    assert.deepEqual(outputPaths, [
      '.claude/agents/engineer.md',
      '.claude/agents/planner.md',
      '.codex/agents/engineer.toml',
      '.codex/agents/planner.toml',
      '.codex/config.toml',
      '.cursor/rules/tpan-opt-co-worker.mdc',
      '.github/pull_request_template.md',
      '.github/workflows/tpan-opt-co-worker-verify.yml',
      '.gitlab-ci.yml',
      '.opencode/agents/engineer.md',
      '.opencode/agents/planner.md',
      '.tpan-opt-co-worker/catalog.json',
      '.tpan-opt-co-worker/console/catalog.js',
      '.tpan-opt-co-worker/console/index.html',
      '.tpan-opt-co-worker/console/runs.js',
      '.tpan-opt-co-worker/console/runs.json',
      '.tpan-opt-co-worker/marketplace.json',
      '.tpan-opt-co-worker/workflow.manifest.json',
      '.tpan-opt-co-worker/workflow.schema.json',
      'AGENTS.md',
      'CLAUDE.md',
      'opencode.json',
      'scripts/list-runs.mjs',
      'scripts/run-workflow.mjs',
      'scripts/verify-workflow.mjs'
    ])

    const agents = outputs.find((output) => output.path === 'AGENTS.md')
    assert.match(agents.content, /production-feature-workflow/)
    assert.match(agents.content, /open_questions_resolved/)

    const codexConfig = outputs.find((output) => output.path === '.codex/config.toml')
    assert.match(codexConfig.content, /\[features\]/)
    assert.match(codexConfig.content, /multi_agent = true/)
    assert.match(codexConfig.content, /\[agents\.planner\]/)

    const claudeContext = outputs.find((output) => output.path === 'CLAUDE.md')
    assert.match(claudeContext.content, /Claude Code Harness/)
    assert.match(claudeContext.content, /production-feature-workflow/)
    assert.match(claudeContext.content, /\.claude\/agents\/planner\.md/)
    assert.match(claudeContext.content, /node scripts\/verify-workflow.mjs/)

    const claudePlanner = outputs.find((output) => output.path === '.claude/agents/planner.md')
    assert.match(claudePlanner.content, /name: planner/)
    assert.match(claudePlanner.content, /product-capability/)
    assert.match(claudePlanner.content, /capability_spec/)
    assert.match(claudePlanner.content, /open_questions_resolved/)

    const manifest = outputs.find((output) => output.path === '.tpan-opt-co-worker/workflow.manifest.json')
    const parsedManifest = JSON.parse(manifest.content)
    assert.equal(parsedManifest.schemaVersion, 'tpan-opt-co-worker.workflow.manifest/v1')
    assert.equal(parsedManifest.workflow.name, 'production-feature-workflow')
    assert.equal(parsedManifest.schema, '.tpan-opt-co-worker/workflow.schema.json')
    assert.equal(parsedManifest.harnesses.codex.config, '.codex/config.toml')
    assert.equal(parsedManifest.harnesses.claudeCode.context, 'CLAUDE.md')
    assert.deepEqual(parsedManifest.harnesses.cursor.rules, [
      '.cursor/rules/tpan-opt-co-worker.mdc'
    ])
    assert.equal(parsedManifest.harnesses.openCode.config, 'opencode.json')
    assert.equal(parsedManifest.harnesses.openCode.agents.planner, '.opencode/agents/planner.md')
    assert.equal(
      parsedManifest.harnesses.ci.githubActions,
      '.github/workflows/tpan-opt-co-worker-verify.yml'
    )
    assert.equal(parsedManifest.harnesses.localRunner.script, 'scripts/run-workflow.mjs')
    assert.equal(parsedManifest.harnesses.localRunner.listRunsScript, 'scripts/list-runs.mjs')
    assert.equal(
      parsedManifest.harnesses.localRunner.runIndex,
      '.tpan-opt-co-worker/runs/index.json'
    )
    assert.equal(
      parsedManifest.harnesses.webConsole.index,
      '.tpan-opt-co-worker/console/index.html'
    )
    assert.equal(
      parsedManifest.harnesses.webConsole.runs,
      '.tpan-opt-co-worker/console/runs.json'
    )
    assert.equal(
      parsedManifest.harnesses.webConsole.runsScript,
      '.tpan-opt-co-worker/console/runs.js'
    )
    assert.equal(
      parsedManifest.harnesses.webConsole.catalogScript,
      '.tpan-opt-co-worker/console/catalog.js'
    )
    assert.equal(parsedManifest.catalog, '.tpan-opt-co-worker/catalog.json')
    assert.equal(parsedManifest.marketplace, '.tpan-opt-co-worker/marketplace.json')
    assert.deepEqual(parsedManifest.verification, {
      command: 'node scripts/verify-workflow.mjs',
      localRunDir: '.tpan-opt-co-worker/runs/local'
    })

    const webConsole = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/index.html'
    )
    assert.ok(
      webConsole.content.includes('<title>TPAN-OPT/CO-WORKER Console</title>')
    )
    assert.match(webConsole.content, /production-feature-workflow/)
    assert.match(webConsole.content, /Stage Pipeline/)
    assert.match(webConsole.content, /Run Summary/)
    assert.match(webConsole.content, /run-summary/)
    assert.match(webConsole.content, /renderRunSummary/)
    assert.match(webConsole.content, /Run History/)
    assert.match(webConsole.content, /No runs match the selected status filter/)
    assert.match(webConsole.content, /data-status-filter/)
    assert.match(webConsole.content, /setRunStatusFilter/)
    assert.match(webConsole.content, /active-filter/)
    assert.match(webConsole.content, /currentDetails/)
    assert.match(webConsole.content, /renderGateDetails\(currentRuns, currentDetails\)/)
    assert.match(webConsole.content, /renderRunArtifactLinks/)
    assert.match(webConsole.content, /evidence\.json/)
    assert.match(webConsole.content, /summary\.md/)
    assert.match(webConsole.content, /Gate Details/)
    assert.match(webConsole.content, /renderGateMetadata/)
    assert.match(webConsole.content, /exitCode/)
    assert.match(webConsole.content, /approvedBy/)
    assert.match(webConsole.content, /renderEvidenceLinks/)
    assert.match(webConsole.content, /Workflow Designer/)
    assert.match(webConsole.content, /workflow-json/)
    assert.match(webConsole.content, /copyWorkflowJson/)
    assert.match(webConsole.content, /\.tpan-opt-co-worker\/workflow\.schema\.json/)
    assert.match(webConsole.content, /download="opt\.workflow\.json"/)
    assert.match(webConsole.content, /Organization Catalog/)
    assert.match(webConsole.content, /Reusable Teams/)
    assert.match(webConsole.content, /Policy Packs/)
    assert.match(webConsole.content, /Marketplace Packages/)
    assert.match(webConsole.content, /skill:tdd-workflow/)
    assert.match(webConsole.content, /mcp:context7/)
    assert.match(webConsole.content, /hook:workflow-preflight/)
    assert.match(webConsole.content, /catalog\.js/)
    assert.match(webConsole.content, /renderGateDetails/)
    assert.match(webConsole.content, /runs\.json/)
    assert.match(webConsole.content, /runs\.js/)
    assert.match(webConsole.content, /open_questions_resolved/)
    assert.match(webConsole.content, /workflow-data/)

    const schema = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/workflow.schema.json'
    )
    const parsedSchema = JSON.parse(schema.content)
    assert.equal(parsedSchema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.equal(parsedSchema.title, 'TPAN-OPT/CO-WORKER Workflow')
    assert.deepEqual(parsedSchema.required, ['name', 'version', 'roles', 'stages'])
    assert.equal(parsedSchema.properties.organization.required, undefined)
    assert.deepEqual(parsedSchema.properties.organization.anyOf, [
      {
        required: ['team']
      },
      {
        required: ['policies'],
        properties: {
          policies: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 1,
              description: 'List item.'
            },
            default: [],
            minItems: 1
          }
        }
      }
    ])
    assert.equal(
      parsedSchema.properties.organization.properties.team.pattern,
      '^[A-Za-z][A-Za-z0-9_-]*$'
    )
    assert.deepEqual(parsedSchema.properties.organization.properties.policies.default, [])
    assert.deepEqual(parsedSchema.properties.stages.items.required, ['id', 'owner'])
    assert.deepEqual(parsedSchema.$defs.gate.properties.type.enum, ['manual', 'command'])
    assert.deepEqual(parsedSchema.$defs.gate.oneOf[1].allOf[0].then.anyOf, [
      {
        required: ['command']
      },
      {
        required: ['preset']
      }
    ])
    assert.deepEqual(parsedSchema.$defs.gatePreset.allOf[0].then, {
      required: ['command']
    })

    const prTemplate = outputs.find((output) => output.path === '.github/pull_request_template.md')
    assert.match(prTemplate.content, /coverage_above_80/)

    const verifyScript = outputs.find((output) => output.path === 'scripts/verify-workflow.mjs')
    assert.match(verifyScript.content, /commandGates/)
    assert.match(verifyScript.content, /manualGates/)

    const localRunner = outputs.find((output) => output.path === 'scripts/run-workflow.mjs')
    assert.ok(localRunner.content.includes('TPAN-OPT/CO-WORKER local runner'))
    assert.match(localRunner.content, /workflow\.manifest\.json/)
    assert.match(localRunner.content, /--run-id may only contain/)

    const runList = outputs.find((output) => output.path === 'scripts/list-runs.mjs')
    assert.ok(runList.content.includes('No TPAN-OPT/CO-WORKER runs found'))
    assert.match(runList.content, /index\.json/)

    const catalog = outputs.find((output) => output.path === '.tpan-opt-co-worker/catalog.json')
    const parsedCatalog = JSON.parse(catalog.content)
    assert.equal(parsedCatalog.templates[0].id, 'production-feature')
    assert.equal(parsedCatalog.policies[0].id, 'quality-standard')
    assert.equal(parsedCatalog.teams[0].id, 'product-delivery')
    assert.equal(parsedCatalog.marketplace[0].id, 'skill:tdd-workflow')

    const marketplace = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/marketplace.json'
    )
    const parsedMarketplace = JSON.parse(marketplace.content)
    assert.equal(parsedMarketplace.marketplace[0].id, 'skill:tdd-workflow')

    const catalogScript = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/console/catalog.js'
    )
    assert.match(catalogScript.content, /window\.TPAN_OPT_CATALOG/)
    assert.match(catalogScript.content, /product-delivery/)
    assert.match(catalogScript.content, /hook:workflow-preflight/)

    const cursorRule = outputs.find(
      (output) => output.path === '.cursor/rules/tpan-opt-co-worker.mdc'
    )
    assert.match(cursorRule.content, /alwaysApply: true/)
    assert.ok(cursorRule.content.includes('TPAN-OPT/CO-WORKER Workflow'))
    assert.match(cursorRule.content, /node scripts\/run-workflow\.mjs/)

    const openCodeConfig = outputs.find((output) => output.path === 'opencode.json')
    const parsedOpenCodeConfig = JSON.parse(openCodeConfig.content)
    assert.equal(parsedOpenCodeConfig.$schema, 'https://opencode.ai/config.json')
    assert.ok(parsedOpenCodeConfig.instructions.includes('AGENTS.md'))
    assert.ok(
      parsedOpenCodeConfig.instructions.includes('.cursor/rules/tpan-opt-co-worker.mdc')
    )
    assert.equal(
      parsedOpenCodeConfig.command['verify-workflow'].description,
      'Run TPAN-OPT/CO-WORKER workflow verification.'
    )

    const openCodePlanner = outputs.find((output) => output.path === '.opencode/agents/planner.md')
    assert.match(openCodePlanner.content, /mode: subagent/)
    assert.match(openCodePlanner.content, /product-capability/)
    assert.match(openCodePlanner.content, /open_questions_resolved/)

    const githubAction = outputs.find(
      (output) => output.path === '.github/workflows/tpan-opt-co-worker-verify.yml'
    )
    assert.ok(githubAction.content.includes('name: TPAN-OPT/CO-WORKER Verify'))
    assert.match(githubAction.content, /actions\/setup-node@v4/)
    assert.match(githubAction.content, /npm ci/)
    assert.match(githubAction.content, /npm install/)
    assert.match(githubAction.content, /No package\.json found/)
    assert.match(githubAction.content, /node scripts\/verify-workflow.mjs/)
    assert.match(githubAction.content, /--run-dir \.tpan-opt-co-worker\/runs\/ci/)
    assert.match(githubAction.content, /actions\/upload-artifact@v4/)

    const gitlabCi = outputs.find((output) => output.path === '.gitlab-ci.yml')
    assert.match(gitlabCi.content, /tpan_opt_verify:/)
    assert.match(gitlabCi.content, /image: node:22/)
    assert.match(gitlabCi.content, /npm ci/)
    assert.match(gitlabCi.content, /npm install/)
    assert.match(gitlabCi.content, /node scripts\/verify-workflow.mjs/)
    assert.match(gitlabCi.content, /--run-dir \.tpan-opt-co-worker\/runs\/gitlab/)
    assert.match(gitlabCi.content, /\.tpan-opt-co-worker\/runs/)
  })
})
