import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { validateWorkflow } from '../src/compiler.js'
import { IDENTIFIER_PATTERN, IDENTIFIER_PATTERN_SOURCE } from '../src/identifier-pattern.js'
import { renderWorkflowSchema } from '../src/schema-renderer.js'

describe('identifier pattern single source', () => {
  it('keeps the JSON Schema patterns in sync with the shared source', () => {
    const schema = JSON.parse(renderWorkflowSchema())

    assert.equal(
      schema.properties.organization.properties.team.pattern,
      IDENTIFIER_PATTERN_SOURCE
    )
    assert.equal(schema.$defs.stage.properties.id.pattern, IDENTIFIER_PATTERN_SOURCE)
    assert.equal(schema.$defs.stage.properties.owner.pattern, IDENTIFIER_PATTERN_SOURCE)
    assert.equal(IDENTIFIER_PATTERN.source, new RegExp(IDENTIFIER_PATTERN_SOURCE).source)
  })

  it('validates identifiers with the same rule the schema advertises', () => {
    const schemaPattern = new RegExp(IDENTIFIER_PATTERN_SOURCE)
    const baseWorkflow = {
      name: 'identifier-workflow',
      version: '1.0.0',
      roles: {
        lead: { skills: ['verification-loop'], permissions: ['approve'] }
      },
      stages: [
        {
          id: 'approve',
          owner: 'lead',
          gates: [{ id: 'human_approval', type: 'manual' }]
        }
      ]
    }

    assert.equal(schemaPattern.test('approve'), true)
    assert.doesNotThrow(() => validateWorkflow(baseWorkflow))

    assert.equal(schemaPattern.test('1bad'), false)
    assert.throws(
      () =>
        validateWorkflow({
          ...baseWorkflow,
          stages: [
            {
              id: '1bad',
              owner: 'lead',
              gates: [{ id: 'human_approval', type: 'manual' }]
            }
          ]
        }),
      /Stage id "1bad"/
    )
  })
})
