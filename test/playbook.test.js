import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { validateWorkflow, compileWorkflow } from '../src/compiler.js'
import { renderPlaybookMarkdown } from '../src/playbook-renderer.js'

function workflow(extra = {}) {
  return validateWorkflow({
    name: 'delivery',
    version: '2.0.0',
    mode: 'team',
    roles: {
      eng: { description: 'Builds features', skills: ['coding'], permissions: ['read_repo'] },
      qa: { description: 'Verifies', skills: ['testing'], permissions: ['read_repo'] }
    },
    stages: [
      {
        id: 'design',
        owner: 'eng',
        output: 'spec.md',
        required: ['brief'],
        skills: ['coding'],
        gates: ['approved']
      },
      {
        id: 'test',
        owner: 'qa',
        dependsOn: ['design'],
        gates: [{ id: 'cov', type: 'command', command: 'npm test' }],
        nodes: [
          { id: 'unit', owner: 'qa', output: 'unit.xml', skills: ['testing'], gates: ['unit-pass'] },
          { id: 'integration', owner: 'qa' }
        ]
      }
    ],
    ...extra
  })
}

describe('playbook renderer', () => {
  it('renders a teammate-facing checklist with stages and steps', () => {
    const md = renderPlaybookMarkdown(workflow())
    assert.match(md, /# delivery — Team Playbook/)
    assert.match(md, /mode: `team`/)
    assert.match(md, /### Stage 1 — design/)
    assert.match(md, /### Stage 2 — test/)
    // Stage with no nodes gets a single completion step.
    assert.match(md, /- \[ \] Complete the design work/)
    // Stage with nodes renders each node as a checkbox step.
    assert.match(md, /- \[ \] \*\*unit\*\* → produce `unit.xml`/)
    assert.match(md, /- \[ \] \*\*integration\*\*/)
  })

  it('renders gates as evidence checkpoints, including node-scoped gates', () => {
    const md = renderPlaybookMarkdown(workflow())
    assert.match(md, /- \[ \] `approved` \(manual\)/)
    assert.match(md, /- \[ \] `cov` \(command\) — run `npm test`/)
    assert.match(md, /- \[ \] `unit-pass` \[node `unit`\] \(manual\)/)
  })

  it('shows dependencies and tooling', () => {
    const md = renderPlaybookMarkdown(workflow())
    assert.match(md, /\*\*Start after:\*\* `design`/)
    assert.match(md, /Tools: skills `coding`/)
  })

  it('lists roles in the reference section', () => {
    const md = renderPlaybookMarkdown(workflow())
    assert.match(md, /- `eng` — Builds features/)
    assert.match(md, /Skills: `coding` · Permissions: `read_repo`/)
  })

  it('defaults the mode label to opt when unset', () => {
    const md = renderPlaybookMarkdown(workflow({ mode: undefined }))
    assert.match(md, /mode: `opt`/)
  })

  it('emits PLAYBOOK.md from compileWorkflow', () => {
    const files = compileWorkflow({
      name: 'd',
      version: '1.0.0',
      roles: { eng: { skills: ['x'], permissions: ['read_repo'] } },
      stages: [{ id: 'build', owner: 'eng', gates: ['done'] }]
    })
    const playbook = files.find((file) => file.path === 'PLAYBOOK.md')
    assert.ok(playbook, 'PLAYBOOK.md should be a compiled output')
    assert.match(playbook.content, /Team Playbook/)
  })
})
