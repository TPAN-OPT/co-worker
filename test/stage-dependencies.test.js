import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { compileWorkflow, validateWorkflow } from '../src/compiler.js'

const role = { skills: ['verification-loop'], permissions: ['read_repo'] }

function workflowWithStages(stages) {
  return {
    name: 'dependency-workflow',
    version: '1.0.0',
    roles: { planner: role, engineer: role },
    stages
  }
}

describe('stage dependencies', () => {
  it('defaults a stage to depend on the immediately preceding stage', () => {
    const workflow = validateWorkflow(
      workflowWithStages([
        { id: 'plan', owner: 'planner', gates: ['scoped'] },
        { id: 'build', owner: 'engineer', gates: ['done'] }
      ])
    )

    assert.deepEqual(workflow.stages[0].dependsOn, [])
    assert.deepEqual(workflow.stages[1].dependsOn, ['plan'])
  })

  it('honors explicit dependencies and an independent empty branch', () => {
    const workflow = validateWorkflow(
      workflowWithStages([
        { id: 'plan', owner: 'planner', gates: ['scoped'] },
        { id: 'backend', owner: 'engineer', dependsOn: ['plan'], gates: ['done'] },
        { id: 'frontend', owner: 'engineer', dependsOn: [], gates: ['done'] }
      ])
    )

    assert.deepEqual(workflow.stages[1].dependsOn, ['plan'])
    assert.deepEqual(workflow.stages[2].dependsOn, [])
  })

  it('rejects invalid dependency references', () => {
    const cases = [
      [
        [
          { id: 'plan', owner: 'planner', gates: ['scoped'] },
          { id: 'build', owner: 'engineer', dependsOn: ['build'], gates: ['done'] }
        ],
        /Stage "build" cannot depend on itself/
      ],
      [
        [
          { id: 'plan', owner: 'planner', dependsOn: ['build'], gates: ['scoped'] },
          { id: 'build', owner: 'engineer', gates: ['done'] }
        ],
        /Stage "plan" dependsOn references unknown or later stage "build"/
      ],
      [
        [
          { id: 'plan', owner: 'planner', gates: ['scoped'] },
          { id: 'build', owner: 'engineer', dependsOn: ['plan', 'plan'], gates: ['done'] }
        ],
        /Stage "build" dependsOn lists "plan" more than once/
      ],
      [
        [{ id: 'plan', owner: 'planner', dependsOn: 'plan', gates: ['scoped'] }],
        /Stage "plan" dependsOn must be an array/
      ]
    ]

    for (const [stages, message] of cases) {
      assert.throws(() => validateWorkflow(workflowWithStages(stages)), message)
    }
  })

  it('persists dependencies into the manifest stages', () => {
    const outputs = compileWorkflow(
      workflowWithStages([
        { id: 'plan', owner: 'planner', gates: ['scoped'] },
        { id: 'backend', owner: 'engineer', dependsOn: ['plan'], gates: ['done'] }
      ])
    )

    const manifest = outputs.find(
      (output) => output.path === '.tpan-opt-co-worker/workflow.manifest.json'
    )
    const stages = JSON.parse(manifest.content).stages
    assert.deepEqual(stages[0].dependsOn, [])
    assert.deepEqual(stages[1].dependsOn, ['plan'])
  })
})
