const ORGANIZATION_POLICY_PACKS = [
  {
    id: 'quality-standard',
    name: 'Quality Standard',
    description:
      'Requires test, coverage, review, and release evidence before work is considered complete.',
    rules: ['tests_first', 'coverage_evidence', 'review_signoff', 'release_evidence']
  },
  {
    id: 'human-control',
    name: 'Human Control',
    description:
      'Requires explicit human approval for external writes, credential changes, paid actions, destructive operations, and releases.',
    rules: [
      'external_writes_need_approval',
      'credential_changes_need_approval',
      'paid_actions_need_approval',
      'destructive_actions_need_approval',
      'release_needs_approval'
    ]
  },
  {
    id: 'security-baseline',
    name: 'Security Baseline',
    description:
      'Requires input validation, secret hygiene, dependency audit, and no unresolved critical or high security findings.',
    rules: [
      'validate_system_boundaries',
      'no_hardcoded_secrets',
      'dependency_audit',
      'no_critical_or_high_security_findings'
    ]
  }
]

export function listOrganizationPolicyPacks() {
  return ORGANIZATION_POLICY_PACKS.map((policy) => ({
    ...policy,
    rules: [...policy.rules]
  }))
}

export function getOrganizationPolicyPack(policyId) {
  const policy = findOrganizationPolicyPack(policyId)

  if (!policy) {
    throw new Error(`Unknown organization policy pack "${policyId}"`)
  }

  return policy
}

export function findOrganizationPolicyPack(policyId) {
  const policy = ORGANIZATION_POLICY_PACKS.find((candidate) => candidate.id === policyId)

  if (!policy) {
    return null
  }

  return {
    ...policy,
    rules: [...policy.rules]
  }
}
