import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { validateWorkflow } from '../src/compiler.js'
import { stageGates } from '../src/stage-gates.js'

const role = { skills: ['verification-loop'], permissions: ['read_repo'] }

function workflow(stages, extra = {}) {
  return {
    name: 'nested-node-workflow',
    version: '1.0.0',
    roles: { engineer: role, tester: role },
    stages,
    ...extra
  }
}

describe('stage tooling and nested nodes', () => {
  it('keeps a flat stage unchanged (no new keys added)', () => {
    const normalized = validateWorkflow(
      workflow([{ id: 'build', owner: 'engineer', gates: ['done'] }])
    )

    assert.deepEqual(Object.keys(normalized.stages[0]), [
      'id',
      'owner',
      'output',
      'required',
      'dependsOn',
      'gates'
    ])
  })

  it('carries stage-scoped skills, mcpServers, and hooks', () => {
    const normalized = validateWorkflow(
      workflow(
        [
          {
            id: 'build',
            owner: 'engineer',
            skills: ['tdd-workflow'],
            mcpServers: ['playwright'],
            hooks: ['log-stop'],
            gates: ['done']
          }
        ],
        {
          mcpServers: { playwright: { command: 'npx', args: ['playwright'] } },
          hooks: [{ id: 'log-stop', event: 'stop', command: 'echo done' }]
        }
      )
    )

    const stage = normalized.stages[0]
    assert.deepEqual(stage.skills, ['tdd-workflow'])
    assert.deepEqual(stage.mcpServers, ['playwright'])
    assert.deepEqual(stage.hooks, ['log-stop'])
  })

  it('decomposes a stage into sub-nodes that inherit the stage owner', () => {
    const normalized = validateWorkflow(
      workflow([
        {
          id: 'ai_test',
          owner: 'tester',
          nodes: [
            { id: 'unit', gates: ['unit_pass'] },
            { id: 'integration', owner: 'engineer' },
            { id: 'uat', skills: ['verification-loop'] }
          ]
        }
      ])
    )

    const nodes = normalized.stages[0].nodes
    assert.equal(nodes.length, 3)
    assert.equal(nodes[0].owner, 'tester') // inherited from stage
    assert.deepEqual(nodes[0].gates, [
      { id: 'unit_pass', type: 'manual', description: '', command: '' }
    ])
    assert.equal(nodes[1].owner, 'engineer') // explicit override
    assert.deepEqual(nodes[2].skills, ['verification-loop'])
  })

  it('binds node-scoped mcpServers and hooks by id', () => {
    const normalized = validateWorkflow(
      workflow(
        [
          {
            id: 'ai_test',
            owner: 'tester',
            nodes: [
              {
                id: 'integration',
                mcpServers: ['playwright'],
                hooks: ['log-stop']
              }
            ]
          }
        ],
        {
          mcpServers: { playwright: { command: 'npx', args: ['playwright'] } },
          hooks: [{ id: 'log-stop', event: 'stop', command: 'echo done' }]
        }
      )
    )

    const node = normalized.stages[0].nodes[0]
    assert.deepEqual(node.mcpServers, ['playwright'])
    assert.deepEqual(node.hooks, ['log-stop'])
  })

  it('rejects references to unknown servers, hooks, owners, and duplicate node ids', () => {
    const cases = [
      [
        workflow([{ id: 'build', owner: 'engineer', mcpServers: ['ghost'] }]),
        /Stage "build" mcpServers references unknown MCP server "ghost"/
      ],
      [
        workflow([{ id: 'build', owner: 'engineer', hooks: ['ghost'] }]),
        /Stage "build" hooks references unknown hook "ghost"/
      ],
      [
        workflow([
          { id: 'ai_test', owner: 'tester', nodes: [{ id: 'unit', owner: 'ghost' }] }
        ]),
        /Node "unit" references unknown owner "ghost"/
      ],
      [
        workflow([
          {
            id: 'ai_test',
            owner: 'tester',
            nodes: [{ id: 'unit' }, { id: 'unit' }]
          }
        ]),
        /Stage "ai_test" has duplicate node id "unit"/
      ],
      [
        workflow([{ id: 'ai_test', owner: 'tester', nodes: {} }]),
        /Stage "ai_test" nodes must be an array/
      ],
      [
        workflow([
          {
            id: 'ai_test',
            owner: 'tester',
            gates: ['done'],
            nodes: [{ id: 'unit', gates: ['done'] }]
          }
        ]),
        /Stage "ai_test" has duplicate gate id "done" across its gates and nodes/
      ]
    ]

    for (const [input, pattern] of cases) {
      assert.throws(() => validateWorkflow(input), pattern)
    }
  })

  it('flattens node gates into the stage effective gate set with nodeId tags', () => {
    const normalized = validateWorkflow(
      workflow([
        {
          id: 'ai_test',
          owner: 'tester',
          gates: ['stage_signoff'],
          nodes: [
            { id: 'unit', gates: ['unit_pass'] },
            { id: 'integration', gates: ['integration_pass'] }
          ]
        }
      ])
    )

    const gates = stageGates(normalized.stages[0])
    assert.deepEqual(
      gates.map((gate) => [gate.id, gate.nodeId]),
      [
        ['stage_signoff', undefined],
        ['unit_pass', 'unit'],
        ['integration_pass', 'integration']
      ]
    )
  })
})
