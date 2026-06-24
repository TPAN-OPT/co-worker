import { listReusableAgentTeams } from './agent-team-catalog.js'
import { GATE_PRESETS } from './gate-presets.js'
import { listMarketplacePackages } from './marketplace-catalog.js'
import { listOrganizationPolicyPacks } from './policy-catalog.js'
import { listWorkflowTemplates } from './workflow-template.js'

export function createCatalog() {
  return {
    presets: createPresetSummary(),
    templates: listWorkflowTemplates(),
    policies: listOrganizationPolicyPacks(),
    teams: listReusableAgentTeams(),
    marketplace: listMarketplacePackages()
  }
}

export function createPresetSummary() {
  return Object.entries(GATE_PRESETS).map(([id, preset]) => ({
    id,
    type: preset.type,
    description: preset.description,
    command: preset.command
  }))
}

export function renderCatalogJson() {
  return `${JSON.stringify(createCatalog(), null, 2)}\n`
}

export function renderMarketplaceJson() {
  return `${JSON.stringify({ marketplace: listMarketplacePackages() }, null, 2)}\n`
}

export function renderCatalogScript() {
  return `window.TPAN_OPT_CATALOG = ${JSON.stringify(createCatalog(), null, 2)};\n`
}
