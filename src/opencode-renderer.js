import { renderOrganizationMarkdown } from './organization-renderer.js'

export function renderOpenCodeConfig() {
  const config = {
    $schema: 'https://opencode.ai/config.json',
    instructions: [
      'AGENTS.md',
      '.cursor/rules/tpan-opt-co-worker.mdc',
      '.tpan-opt-co-worker/workflow.manifest.json'
    ],
    command: {
      'verify-workflow': {
        description: 'Run TPAN-OPT/CO-WORKER workflow verification.',
        template:
          'Run `node scripts/run-workflow.mjs --run-id $ARGUMENTS` and summarize the generated evidence.'
      }
    }
  }

  return `${JSON.stringify(config, null, 2)}\n`
}

export function renderOpenCodeAgentMarkdown(roleId, role, workflow) {
  const ownedStages = workflow.stages.filter((stage) => stage.owner === roleId)
  const organizationSection = renderOrganizationMarkdown(workflow.organization)
  const stageSections = ownedStages
    .map(
      (stage) => `## Stage: ${stage.id}

- Output: ${stage.output ? `\`${stage.output}\`` : 'none'}
- Required work: ${formatInlineList(stage.required)}
- Gates: ${formatGateList(stage.gates)}`
    )
    .join('\n\n')

  return `---
description: ${formatYamlString(role.description)}
mode: subagent
permission:
  edit: ask
  bash: ask
---

# ${roleId}

Act as \`${roleId}\` for the \`${workflow.name}\` workflow.

## Skills

${formatBulletList(role.skills)}

## MCP Servers

${formatBulletList(role.mcpServers || [])}

## Permissions

${formatBulletList(role.permissions)}

## Operating Rules

- Produce required artifacts for owned stages.
- Stop when gates need command output, review evidence, or human approval.
- Use \`node scripts/run-workflow.mjs --run-id <run-id>\` for local verification evidence.

${organizationSection}
${stageSections || '## Owned Stages\n\nThis role does not own any workflow stages.'}
`
}

function formatBulletList(items) {
  if (items.length === 0) {
    return '- none'
  }

  return items.map((item) => `- \`${item}\``).join('\n')
}

function formatInlineList(items) {
  return items.length === 0 ? 'none' : items.map((item) => `\`${item}\``).join(', ')
}

function formatGateList(gates) {
  if (gates.length === 0) {
    return 'none'
  }

  return gates
    .map((gate) => {
      const command = gate.command ? `: \`${gate.command}\`` : ''
      return `\`${gate.id}\` (${gate.type})${command}`
    })
    .join(', ')
}

function formatYamlString(value) {
  return JSON.stringify(value)
}
