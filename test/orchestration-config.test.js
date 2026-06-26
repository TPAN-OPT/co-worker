import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { compileWorkflow, validateWorkflow } from '../src/compiler.js'

const validWorkflow = {
  name: 'production-feature-workflow',
  version: '1.0.0',
  roles: {
    planner: {
      description: 'Clarifies product capability and implementation constraints.',
      skills: ['product-capability'],
      permissions: ['read_repo']
    },
    engineer: {
      description: 'Implements code with tests.',
      skills: ['tdd-workflow'],
      permissions: ['write_code']
    }
  },
  stages: [
    { id: 'clarify', owner: 'planner', gates: ['open_questions_resolved'] },
    { id: 'implement', owner: 'engineer', gates: ['unit_tests_pass'] }
  ]
}

function manifestOrchestrator(workflow) {
  const outputs = compileWorkflow(workflow)
  const manifest = outputs.find(
    (output) => output.path === '.tpan-opt-co-worker/workflow.manifest.json'
  )
  return JSON.parse(manifest.content).harnesses.orchestrator
}

describe('workflow orchestration config', () => {
  it('rejects malformed orchestration blocks with clear messages', () => {
    const cases = [
      [{ ...validWorkflow, orchestration: [] }, /Workflow orchestration must be an object/],
      [
        { ...validWorkflow, orchestration: {} },
        /Workflow orchestration must include agentCommand or agents/
      ],
      [
        { ...validWorkflow, orchestration: { agentCommand: '   ' } },
        /Workflow orchestration agentCommand must be a non-empty string/
      ],
      [
        { ...validWorkflow, orchestration: { schedule: 'parallel' } },
        /Workflow orchestration contains unknown field "schedule"/
      ],
      [
        { ...validWorkflow, orchestration: { agents: { ghost: 'run' } } },
        /Workflow orchestration agents references unknown role "ghost"/
      ],
      [
        { ...validWorkflow, orchestration: { agents: { engineer: '' } } },
        /Workflow orchestration agent command for "engineer" must be a non-empty string/
      ]
    ]

    for (const [workflow, message] of cases) {
      assert.throws(() => validateWorkflow(workflow), message)
    }
  })

  it('normalizes orchestration and persists it into the manifest', () => {
    const orchestrator = manifestOrchestrator({
      ...validWorkflow,
      orchestration: {
        agentCommand: 'claude -p "stage {role} brief {brief}"',
        agents: {
          engineer: 'codex exec --brief {brief}'
        }
      }
    })

    assert.equal(orchestrator.agentCommand, 'claude -p "stage {role} brief {brief}"')
    assert.deepEqual(orchestrator.agents, { engineer: 'codex exec --brief {brief}' })
  })

  it('omits orchestration keys from the manifest when unset', () => {
    const orchestrator = manifestOrchestrator(validWorkflow)
    assert.equal(Object.hasOwn(orchestrator, 'agentCommand'), false)
    assert.equal(Object.hasOwn(orchestrator, 'agents'), false)
  })
})
