import { renderOrganizationMarkdown } from './organization-renderer.js'

export function renderCursorRule(workflow) {
  const roleLines = Object.entries(workflow.roles)
    .map(
      ([roleId, role]) =>
        `- \`${roleId}\`: ${role.description} Skills: ${formatInlineList(role.skills)}.`
    )
    .join('\n')

  const stageLines = workflow.stages
    .map(
      (stage, index) =>
        `${index + 1}. \`${stage.id}\` is owned by \`${stage.owner}\`; gates: ${formatGateList(
          stage.gates
        )}.`
    )
    .join('\n')

  const organizationSection = renderOrganizationMarkdown(workflow.organization)

  return `---
description: TPAN-OPT/CO-WORKER workflow rules for ${workflow.name}
globs:
alwaysApply: true
---

# TPAN-OPT/CO-WORKER Workflow

Use this rule whenever planning, implementing, reviewing, or shipping work in this repository.

## Operating Rules

- Follow workflow stages in order unless a human lead explicitly approves a deviation.
- Stop at every gate until command output, review evidence, or human approval is attached.
- Keep work inside the active role's permissions and escalation boundaries.
- Before handoff or release, run \`node scripts/run-workflow.mjs --run-id <run-id>\`.

${organizationSection}
## Roles

${roleLines}

## Stages

${stageLines}
`
}

function formatInlineList(items) {
  return items.length === 0 ? 'none' : items.map((item) => `\`${item}\``).join(', ')
}

function formatGateList(gates) {
  if (gates.length === 0) {
    return 'none'
  }

  return gates.map((gate) => `\`${gate.id}\` (${gate.type})`).join(', ')
}
