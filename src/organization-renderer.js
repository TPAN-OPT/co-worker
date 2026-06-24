import { findOrganizationPolicyPack } from './policy-catalog.js'

export function renderOrganizationMarkdown(organization) {
  if (!organization) {
    return ''
  }

  const policies = organization.policies || []
  const policyRuleSection = renderPolicyRuleSection(policies)

  return `## Organization Standards

- Team: ${organization.team ? `\`${organization.team}\`` : 'none'}
- Policies: ${formatBacktickList(policies)}
${policyRuleSection}
`
}

export function renderOrganizationInline(organization) {
  if (!organization) {
    return ''
  }

  const team = organization.team || 'none'
  const policies = organization.policies || []
  const policyText = policies.length > 0
    ? policies.join(', ')
    : 'none'
  const knownRules = getKnownPolicyRules(policies)
  const ruleText = knownRules.length > 0
    ? ` Known policy rules: ${knownRules.join(', ')}.`
    : ''

  return ` Organization standards: Team: ${team}. Policies: ${policyText}.${ruleText}`
}

function formatBacktickList(items) {
  return items.length === 0 ? 'none' : items.map((item) => `\`${item}\``).join(', ')
}

function renderPolicyRuleSection(policyIds) {
  const knownPolicies = policyIds
    .map((policyId) => findOrganizationPolicyPack(policyId))
    .filter((policy) => policy !== null)

  if (knownPolicies.length === 0) {
    return ''
  }

  const policyBlocks = knownPolicies
    .map(
      (policy) => `- \`${policy.id}\` (${policy.name}): ${policy.description}
  - Rules: ${formatBacktickList(policy.rules)}`
    )
    .join('\n')

  return `

### Policy Pack Rules

${policyBlocks}`
}

function getKnownPolicyRules(policyIds) {
  return [
    ...new Set(
      policyIds.flatMap((policyId) => {
        const policy = findOrganizationPolicyPack(policyId)
        return policy ? policy.rules : []
      })
    )
  ]
}
