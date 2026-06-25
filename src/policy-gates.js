import { getOrganizationPolicyPack } from './policy-catalog.js'

// Maps organization policy rules that have an automatable verification to gate
// definitions. Only rules listed here become enforced gates; every other rule
// stays advisory prompt text rendered by organization-renderer. Extend this map
// as new automatable checks become available (for example a secret scanner for
// no_hardcoded_secrets).
const ENFORCEABLE_RULE_GATES = Object.freeze({
  dependency_audit: Object.freeze({
    preset: 'npm:audit-high',
    description: 'Run a dependency audit and fail on high severity vulnerabilities.'
  })
})

// Returns the deduplicated, order-preserving list of command gates that enforce
// the automatable rules across the selected policies. Returns an empty array
// when none of the selected policies contribute an enforceable rule.
export function policyComplianceGates(policyIds = []) {
  const gates = []
  const seenRules = new Set()

  for (const policyId of policyIds) {
    const policy = getOrganizationPolicyPack(policyId)

    for (const rule of policy.rules) {
      const mapping = ENFORCEABLE_RULE_GATES[rule]
      if (!mapping || seenRules.has(rule)) {
        continue
      }

      seenRules.add(rule)
      gates.push({
        id: rule,
        preset: mapping.preset,
        description: mapping.description
      })
    }
  }

  return gates
}
