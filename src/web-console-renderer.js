import { createCatalog } from './catalog-renderer.js'
import { renderOrchestrationRuntime } from './web-console-orchestration.js'
import { renderDesignerRuntime } from './web-console-designer.js'
import { CONSOLE_STYLES } from './web-console-styles.js'

export function renderWebConsole(workflow) {
  const catalog = createCatalog()
  const workflowData = JSON.stringify(workflow)
  const workflowJson = JSON.stringify(workflow, null, 2)
  const roleRows = Object.entries(workflow.roles)
    .map(([roleId, role]) => renderRoleRow(roleId, role, workflow))
    .join('\n')
  const stageSections = workflow.stages.map(renderStageSection).join('\n')
  const organizationSection = renderOrganizationSection(workflow.organization)
  const catalogSection = renderCatalogSection(catalog)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TPAN-OPT/CO-WORKER Console</title>
  <style>
${CONSOLE_STYLES}
  </style>
</head>
<body>
  <header>
    <svg class="mark" viewBox="0 0 44 44" role="img" aria-label="TPAN-OPT/CO-WORKER">
      <rect x="2" y="2" width="40" height="40" rx="8" fill="#256f5b"></rect>
      <path d="M12 14h20M12 22h20M12 30h12" stroke="#ffffff" stroke-width="3" stroke-linecap="round"></path>
    </svg>
    <div>
      <h1>${escapeHtml(workflow.name)}</h1>
      <p class="muted">TPAN-OPT/CO-WORKER Console · workflow version ${escapeHtml(workflow.version)} · mode ${escapeHtml(workflow.mode || 'opt')}</p>
    </div>
  </header>
  <main>
    <section class="overview" aria-label="Workflow overview">
      <div class="metric"><span class="muted">Roles</span><strong>${Object.keys(workflow.roles).length}</strong></div>
      <div class="metric"><span class="muted">Stages</span><strong>${workflow.stages.length}</strong></div>
      <div class="metric"><span class="muted">Manual Gates</span><strong>${countGatesByType(workflow, 'manual')}</strong></div>
      <div class="metric"><span class="muted">Command Gates</span><strong>${countGatesByType(workflow, 'command')}</strong></div>
    </section>
    ${organizationSection}
    <section class="grid">
      <div class="panel">
        <h2>Agent Roles</h2>
        ${roleRows}
      </div>
      <div>
        <h2>Stage Pipeline</h2>
        ${stageSections}
      </div>
    </section>
    <section class="panel designer-panel" aria-labelledby="workflow-designer-title">
      <div class="section-head">
        <h2 id="workflow-designer-title">Workflow Designer</h2>
        <div class="designer-actions">
          <button type="button" class="action" id="validate-workflow-json">Validate</button>
          <button type="button" class="action" id="copy-workflow-json">Copy JSON</button>
          <button type="button" class="action" id="download-workflow-json">Download Workflow JSON</button>
          <button type="button" class="action" id="reset-workflow-json">Reset</button>
        </div>
      </div>
      <p class="muted schema-line">Edit the workflow below, then apply it with <code>tpan-opt-co-worker compile --workflow opt.workflow.json --out .</code> · Schema: <code>.tpan-opt-co-worker/workflow.schema.json</code></p>
      <textarea id="workflow-json" spellcheck="false" aria-describedby="workflow-validation">${escapeHtml(workflowJson)}</textarea>
      <div id="workflow-validation" class="designer-status muted" role="status" aria-live="polite">Edit the workflow and click Validate. The CLI compile remains the authoritative check.</div>
    </section>
    ${catalogSection}
    <section class="panel summary-panel" aria-labelledby="run-summary-title">
      <h2 id="run-summary-title">Run Summary</h2>
      <div id="run-summary" class="muted">No workflow runs recorded yet.</div>
    </section>
    <section class="panel run-panel" aria-labelledby="run-history-title">
      <div class="section-head">
        <h2 id="run-history-title">Run History</h2>
        <div class="filter-bar" aria-label="Run status filters">
          <button type="button" class="filter-button active-filter" data-status-filter="all">All</button>
          <button type="button" class="filter-button" data-status-filter="passed">Passed</button>
          <button type="button" class="filter-button" data-status-filter="pending">Pending</button>
          <button type="button" class="filter-button" data-status-filter="failed">Failed</button>
        </div>
      </div>
      <div id="run-history" class="muted">No workflow runs recorded yet.</div>
    </section>
    <section class="panel detail-panel" aria-labelledby="gate-details-title">
      <h2 id="gate-details-title">Gate Details</h2>
      <div id="gate-details" class="muted">Run a workflow to inspect command and manual gate results.</div>
    </section>
    <section class="panel orchestration-panel" aria-labelledby="orchestration-title">
      <h2 id="orchestration-title">Orchestration</h2>
      <div id="orchestration" class="muted">Run <code>node scripts/orchestrate-workflow.mjs</code> to drive stages and see live orchestration state.</div>
    </section>
    <p class="console-note">Generated from the repository workflow manifest. Run <code>node scripts/run-workflow.mjs --run-id &lt;id&gt;</code> to collect verification evidence.</p>
  </main>
  <script id="workflow-data" type="application/json">${escapeScriptJson(workflowData)}</script>
  <script src="catalog.js"></script>
  <script src="runs.js"></script>
  <script src="orchestration.js"></script>
  <script>
    let currentRuns = []
    let currentDetails = {}
    let activeRunStatusFilter = 'all'

    initWorkflowDesigner()
    initRunFilters()
    loadRunHistory()
    loadOrchestration()

${renderDesignerRuntime()}

    function initRunFilters() {
      document.querySelectorAll('[data-status-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          setRunStatusFilter(button.getAttribute('data-status-filter') || 'all')
        })
      })
    }

    function setRunStatusFilter(status) {
      activeRunStatusFilter = ['all', 'passed', 'pending', 'failed'].includes(status) ? status : 'all'
      document.querySelectorAll('[data-status-filter]').forEach((button) => {
        const isActive = button.getAttribute('data-status-filter') === activeRunStatusFilter
        button.classList.toggle('active-filter', isActive)
      })
      renderRunHistory(currentRuns)
      renderGateDetails(currentRuns, currentDetails)
    }

    async function loadRunHistory() {
      if (window.TPAN_OPT_RUNS && Array.isArray(window.TPAN_OPT_RUNS.runs)) {
        renderRunData(window.TPAN_OPT_RUNS)
        return
      }

      try {
        const response = await fetch('runs.json', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        renderRunData(data)
      } catch {
        renderRunData({ runs: [], details: {} })
      }
    }

${renderOrchestrationRuntime()}

    function renderRunData(data) {
      const runs = Array.isArray(data.runs) ? data.runs : []
      const details = data.details && typeof data.details === 'object' ? data.details : {}
      currentRuns = runs
      currentDetails = details
      renderRunSummary(runs)
      renderRunHistory(runs)
      renderGateDetails(runs, details)
    }

    function renderRunSummary(runs) {
      const container = document.getElementById('run-summary')
      if (!container) return
      if (runs.length === 0) {
        container.className = 'muted'
        container.textContent = 'No workflow runs recorded yet.'
        return
      }

      const counts = runs.reduce(
        (summary, run) => {
          const status = normalizeStatus(run.status)
          return {
            ...summary,
            total: summary.total + 1,
            [status]: summary[status] + 1
          }
        },
        { total: 0, passed: 0, pending: 0, failed: 0 }
      )
      const latestRun = runs.reduce((latest, run) => {
        if (!latest) return run
        return String(run.finishedAt || '') > String(latest.finishedAt || '') ? run : latest
      }, null)

      container.className = 'run-summary'
      container.innerHTML = [
        renderSummaryItem('Total', counts.total, ''),
        renderSummaryItem('Passed', counts.passed, 'passed'),
        renderSummaryItem('Pending', counts.pending, 'pending'),
        renderSummaryItem('Failed', counts.failed, 'failed'),
        renderSummaryItem('Last Run', latestRun ? latestRun.id || 'unknown-run' : 'none', '')
      ].join('')
    }

    function renderSummaryItem(label, value, status) {
      const className = status ? 'summary-item ' + status : 'summary-item'
      return '<div class="' + className + '">' +
        '<span class="muted">' + escapeHtml(label) + '</span>' +
        '<strong>' + escapeHtml(value) + '</strong>' +
      '</div>'
    }

    function renderRunHistory(runs) {
      const container = document.getElementById('run-history')
      if (!container) return
      const filteredRuns = filterRunsByStatus(runs, activeRunStatusFilter)
      if (filteredRuns.length === 0) {
        container.className = 'muted'
        container.textContent = getEmptyRunHistoryMessage(runs.length)
        return
      }
      container.className = ''
      container.innerHTML = filteredRuns.map(renderRun).join('')
    }

    function filterRunsByStatus(runs, status) {
      if (status === 'all') return runs
      return runs.filter((run) => normalizeStatus(run.status) === status)
    }

    function getEmptyRunHistoryMessage(totalRuns) {
      return totalRuns === 0
        ? 'No workflow runs recorded yet.'
        : 'No runs match the selected status filter.'
    }

    function getEmptyGateDetailsMessage(totalRuns, filteredRunCount) {
      if (totalRuns === 0) return 'Run a workflow to inspect command and manual gate results.'
      if (filteredRunCount === 0) return 'No gate details match the selected status filter.'
      return 'No gate details recorded for the selected runs.'
    }

    function renderGateDetails(runs, details) {
      const container = document.getElementById('gate-details')
      if (!container) return
      const filteredRuns = filterRunsByStatus(runs, activeRunStatusFilter)
      const runDetails = filteredRuns
        .map((run) => ({ run, detail: details[run.id] || { commandGates: [], manualGates: [] } }))
        .filter((entry) => entry.detail.commandGates.length > 0 || entry.detail.manualGates.length > 0)

      if (runDetails.length === 0) {
        container.className = 'muted'
        container.textContent = getEmptyGateDetailsMessage(runs.length, filteredRuns.length)
        return
      }

      container.className = ''
      container.innerHTML = runDetails.map(renderRunDetails).join('')
    }

    function renderRunDetails(entry) {
      const gates = [
        ...entry.detail.commandGates.map((gate) => ({ ...gate, kind: 'command' })),
        ...entry.detail.manualGates.map((gate) => ({ ...gate, kind: 'manual' }))
      ]

      return '<article class="detail">' +
        '<h3>' + escapeHtml(entry.run.id || 'unknown-run') + '</h3>' +
        gates.map(renderGateResult).join('') +
      '</article>'
    }

    function renderGateResult(gate) {
      const status = String(gate.status || 'pending')
      const safeStatus = ['passed', 'pending', 'failed'].includes(status) ? status : 'pending'
      return '<div class="gate-result">' +
        '<span class="badge ' + escapeHtml(gate.kind) + '">' + escapeHtml(gate.kind) + '</span>' +
        '<div><strong>' + escapeHtml(gate.id || 'unknown-gate') + '</strong><p class="muted">' + escapeHtml(gate.stageId || '') + '</p>' + renderGateMetadata(gate) + '</div>' +
        '<span class="status ' + safeStatus + '">' + escapeHtml(status) + '</span>' +
      '</div>'
    }

    function renderGateMetadata(gate) {
      const rows = []
      if (gate.kind === 'command' && gate.command) {
        rows.push('Command: ' + escapeHtml(gate.command))
      }
      if (gate.kind === 'command' && Object.prototype.hasOwnProperty.call(gate, 'exitCode')) {
        rows.push('Exit code: ' + escapeHtml(gate.exitCode))
      }

      const evidence = gate.evidence && typeof gate.evidence === 'object' ? gate.evidence : null
      if (evidence && evidence.approvedBy) {
        rows.push('Approved by: ' + escapeHtml(evidence.approvedBy))
      }
      if (evidence && evidence.note) {
        rows.push('Note: ' + escapeHtml(evidence.note))
      }
      if (evidence && Array.isArray(evidence.links) && evidence.links.length > 0) {
        rows.push(renderEvidenceLinks(evidence.links))
      }

      if (rows.length === 0) return ''
      return '<div class="gate-meta">' + rows.map((row) => '<div>' + row + '</div>').join('') + '</div>'
    }

    function renderEvidenceLinks(links) {
      const renderedLinks = links.map((link, index) => {
        const safeUrl = getSafeEvidenceUrl(link)
        if (!safeUrl) return '<span>' + escapeHtml(link) + '</span>'
        return '<a class="evidence-link" href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noreferrer">Link ' + escapeHtml(index + 1) + '</a>'
      })

      return '<div class="evidence-links">' + renderedLinks.join('') + '</div>'
    }

    function getSafeEvidenceUrl(link) {
      try {
        const url = new URL(String(link))
        return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : ''
      } catch {
        return ''
      }
    }

    function renderRun(run) {
      const rawStatus = String(run.status || 'pending')
      const status = normalizeStatus(rawStatus)
      const moduleLabel = run.module ? '<span class="run-module">' + escapeHtml(run.module) + '</span> ' : ''
      return '<article class="run">' +
        '<div>' + moduleLabel + '<strong>' + escapeHtml(run.id || 'unknown-run') + '</strong><p class="muted">' + escapeHtml(run.runDir || '') + '</p>' + renderRunArtifactLinks(run) + '</div>' +
        '<span class="status ' + status + '">' + escapeHtml(rawStatus) + '</span>' +
        '<time class="muted">' + escapeHtml(run.finishedAt || '') + '</time>' +
      '</article>'
    }

    function renderRunArtifactLinks(run) {
      const artifactBaseHref = getRunArtifactBaseHref(run)
      if (!artifactBaseHref) return ''
      return '<div class="run-artifacts">' +
        '<a class="artifact-link" href="' + artifactBaseHref + '/evidence.json">Evidence JSON</a>' +
        '<a class="artifact-link" href="' + artifactBaseHref + '/summary.md">Summary MD</a>' +
      '</div>'
    }

    function getRunArtifactBaseHref(run) {
      const runId = String(run.id || '')
      if (!isSafeRunId(runId)) return ''
      return '../runs/' + encodeURIComponent(runId)
    }

    function isSafeRunId(runId) {
      return /^[a-zA-Z0-9._-]+$/.test(runId) && runId !== '.' && runId !== '..'
    }

    function normalizeStatus(status) {
      const rawStatus = String(status || 'pending')
      return ['passed', 'pending', 'failed'].includes(rawStatus) ? rawStatus : 'pending'
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
    }
  </script>
</body>
</html>
`
}

function renderCatalogSection(catalog) {
  return `<section class="panel catalog-panel" aria-labelledby="catalog-title">
      <div class="section-head">
        <h2 id="catalog-title">Organization Catalog</h2>
        <p class="muted">Templates, policy packs, reusable teams, and marketplace packages.</p>
      </div>
      <div class="catalog-grid">
        ${renderCatalogColumn('Workflow Templates', catalog.templates)}
        ${renderCatalogColumn('Policy Packs', catalog.policies)}
        ${renderCatalogColumn('Reusable Teams', catalog.teams)}
        ${renderCatalogColumn('Marketplace Packages', catalog.marketplace)}
      </div>
    </section>`
}

function renderCatalogColumn(title, items) {
  const renderedItems = items
    .map(
      (item) => `<article class="catalog-item">
          <h3>${escapeHtml(item.id)}</h3>
          <p class="muted">${escapeHtml(item.description || item.name || '')}</p>
        </article>`
    )
    .join('')

  return `<div class="catalog-column">
      <h3>${escapeHtml(title)}</h3>
      ${renderedItems || '<p class="muted">No catalog entries.</p>'}
    </div>`
}

function renderOrganizationSection(organization) {
  if (!organization) {
    return ''
  }

  const team = organization.team || 'none'
  const policies = organization.policies || []
  const policyChips = policies
    .map((policy) => `<span class="chip">${escapeHtml(policy)}</span>`)
    .join('')

  return `<section class="panel organization-panel" aria-labelledby="organization-title">
      <h2 id="organization-title">Organization</h2>
      <p><span class="muted">Team</span> ${escapeHtml(team)}</p>
      <div class="chips">${policyChips || '<span class="chip">no policies</span>'}</div>
    </section>`
}

function renderRoleRow(roleId, role, workflow) {
  const ownedStages = workflow.stages
    .filter((stage) => stage.owner === roleId)
    .map((stage) => stage.id)

  return `<article class="role">
  <div>
    <h3>${escapeHtml(roleId)}</h3>
    <p class="muted">${ownedStages.length} owned stage${ownedStages.length === 1 ? '' : 's'}</p>
  </div>
  <div>
    <p>${escapeHtml(role.description)}</p>
    <div class="chips">${role.skills.map((skill) => `<span class="chip">${escapeHtml(skill)}</span>`).join('')}</div>
  </div>
</article>`
}

function renderStageSection(stage) {
  const gates = stage.gates.map(renderGate).join('\n')
  return `<article class="stage">
  <div class="stage-head">
    <div>
      <h3>${escapeHtml(stage.id)}</h3>
      <p class="muted">Output: ${stage.output ? escapeHtml(stage.output) : 'none'}</p>
    </div>
    <span class="owner">${escapeHtml(stage.owner)}</span>
  </div>
  ${gates || '<p class="muted">No gates configured.</p>'}
</article>`
}

function renderGate(gate) {
  const description = gate.description || 'No description provided.'
  return `<div class="gate">
  <span class="badge ${escapeHtml(gate.type)}">${escapeHtml(gate.type)}</span>
  <div>
    <strong>${escapeHtml(gate.id)}</strong>
    <p class="muted">${escapeHtml(description)}</p>
  </div>
</div>`
}

function countGatesByType(workflow, type) {
  return workflow.stages.reduce(
    (total, stage) =>
      total + stage.gates.filter((gate) => gate.type === type).length,
    0
  )
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeScriptJson(value) {
  return value.replaceAll('<', '\\u003c')
}
