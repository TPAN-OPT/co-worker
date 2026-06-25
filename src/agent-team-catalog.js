import { createWorkflowFromTemplate } from './workflow-template.js'

const REUSABLE_AGENT_TEAMS = [
  {
    id: 'product-delivery',
    name: 'Product Delivery Team',
    description:
      'Planner, engineer, reviewer, and release manager roles for verified feature delivery.',
    recommendedTemplate: 'production-feature',
    recommendedPolicies: ['quality-standard', 'human-control']
  },
  {
    id: 'opt-core',
    name: 'OPT Core Team',
    description:
      'Compact one-person-team role set for planning, implementation, review, and evidence tracking.',
    recommendedTemplate: 'production-feature',
    recommendedPolicies: ['quality-standard', 'human-control', 'security-baseline']
  },
  {
    id: 'security-release',
    name: 'Security Release Team',
    description:
      'Reviewer-heavy role set for security-sensitive release preparation and approval.',
    recommendedTemplate: 'production-feature',
    recommendedPolicies: ['security-baseline', 'human-control']
  }
]

// The roles a team produces are exactly the roles of its recommended template,
// because `init --team` generates from that template. Deriving the list here
// keeps the advertised roles truthful instead of drifting from what is
// actually generated.
function rolesForTeam(team) {
  const workflow = createWorkflowFromTemplate(team.recommendedTemplate)
  return Object.keys(workflow.roles)
}

function presentTeam(team) {
  return {
    ...team,
    roles: rolesForTeam(team),
    recommendedPolicies: [...team.recommendedPolicies]
  }
}

export function listReusableAgentTeams() {
  return REUSABLE_AGENT_TEAMS.map((team) => presentTeam(team))
}

export function getReusableAgentTeam(teamId) {
  const team = REUSABLE_AGENT_TEAMS.find((candidate) => candidate.id === teamId)

  if (!team) {
    throw new Error(`Unknown reusable agent team "${teamId}"`)
  }

  return presentTeam(team)
}
