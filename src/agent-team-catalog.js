const REUSABLE_AGENT_TEAMS = [
  {
    id: 'product-delivery',
    name: 'Product Delivery Team',
    description:
      'Planner, engineer, reviewer, and release manager roles for verified feature delivery.',
    roles: ['planner', 'engineer', 'reviewer', 'release-manager'],
    recommendedTemplate: 'production-feature',
    recommendedPolicies: ['quality-standard', 'human-control']
  },
  {
    id: 'opt-core',
    name: 'OPT Core Team',
    description:
      'Compact one-person-team role set for planning, implementation, review, and evidence tracking.',
    roles: ['lead', 'builder', 'reviewer'],
    recommendedTemplate: 'production-feature',
    recommendedPolicies: ['quality-standard', 'human-control', 'security-baseline']
  },
  {
    id: 'security-release',
    name: 'Security Release Team',
    description:
      'Reviewer-heavy role set for security-sensitive release preparation and approval.',
    roles: ['security-reviewer', 'release-manager', 'human-approver'],
    recommendedTemplate: 'production-feature',
    recommendedPolicies: ['security-baseline', 'human-control']
  }
]

export function listReusableAgentTeams() {
  return REUSABLE_AGENT_TEAMS.map((team) => ({
    ...team,
    roles: [...team.roles],
    recommendedPolicies: [...team.recommendedPolicies]
  }))
}

export function getReusableAgentTeam(teamId) {
  const team = REUSABLE_AGENT_TEAMS.find((candidate) => candidate.id === teamId)

  if (!team) {
    throw new Error(`Unknown reusable agent team "${teamId}"`)
  }

  return {
    ...team,
    roles: [...team.roles],
    recommendedPolicies: [...team.recommendedPolicies]
  }
}
