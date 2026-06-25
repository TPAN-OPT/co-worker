// Inline runtime for the generated console's Orchestration panel. Returned as a
// string and interpolated into the console's main <script>, so it shares scope
// (escapeHtml, document) with the rest of the runtime. Kept here to keep
// web-console-renderer.js under the repository file-size limit.
export function renderOrchestrationRuntime() {
  return `    async function loadOrchestration() {
      const container = document.getElementById('orchestration')
      if (!container) return

      if (window.TPAN_OPT_ORCHESTRATION && typeof window.TPAN_OPT_ORCHESTRATION === 'object') {
        renderOrchestration(window.TPAN_OPT_ORCHESTRATION)
        return
      }

      try {
        const response = await fetch('orchestration.json', { cache: 'no-store' })
        if (!response.ok) return
        renderOrchestration(await response.json())
      } catch {
        renderOrchestration({ current: null })
      }
    }

    function renderOrchestration(data) {
      const container = document.getElementById('orchestration')
      if (!container) return
      const state = data && typeof data === 'object' ? data.current : null
      if (!state || typeof state !== 'object') {
        container.className = 'muted'
        container.textContent = 'No orchestration run recorded yet.'
        return
      }

      const status = String(state.status || 'pending')
      const safeStatus = status === 'completed' ? 'passed' : status === 'blocked' ? 'failed' : 'pending'
      const stages = Array.isArray(state.stages) ? state.stages : []
      const invocations = Array.isArray(state.invocations) ? state.invocations : []

      container.className = ''
      container.innerHTML =
        '<div class="orchestration-head">' +
          '<span class="status ' + safeStatus + '">' + escapeHtml(status) + '</span>' +
          '<p class="muted">Run ' + escapeHtml(state.runId || 'unknown') + ' · current stage: ' + escapeHtml(state.currentStage || 'none') + '</p>' +
        '</div>' +
        stages.map(renderOrchestrationStage).join('') +
        renderWorkOrder(state.workOrder) +
        renderInvocations(invocations)
    }

    function renderOrchestrationStage(stage) {
      const status = String(stage.status || 'pending')
      return '<div class="gate-result">' +
        '<span class="owner">' + escapeHtml(stage.owner || '') + '</span>' +
        '<div><strong>' + escapeHtml(stage.id || 'stage') + '</strong></div>' +
        '<span class="status ' + orchestrationStageClass(status) + '">' + escapeHtml(status) + '</span>' +
      '</div>'
    }

    function orchestrationStageClass(status) {
      if (status === 'done') return 'passed'
      if (status === 'current') return 'failed'
      return 'pending'
    }

    function renderWorkOrder(workOrder) {
      if (!workOrder || typeof workOrder !== 'object') return ''
      const pending = Array.isArray(workOrder.pendingGates) ? workOrder.pendingGates : []
      const pendingList = pending
        .map((gate) => '<li>' + escapeHtml(gate.id || '') + ' (' + escapeHtml(gate.type || '') + ')</li>')
        .join('')
      return '<article class="detail">' +
        '<h3>Work Order · ' + escapeHtml(workOrder.stageId || '') + '</h3>' +
        '<p class="muted">Owner: ' + escapeHtml(workOrder.owner || '') + '</p>' +
        (pendingList ? '<ul>' + pendingList + '</ul>' : '') +
        '<p>' + escapeHtml(workOrder.nextAction || '') + '</p>' +
      '</article>'
    }

    function renderInvocations(invocations) {
      if (invocations.length === 0) return ''
      const rows = invocations
        .map((item) =>
          '<div class="gate-result">' +
            '<span class="badge command">agent</span>' +
            '<div><strong>' + escapeHtml(item.stageId || '') + '</strong><p class="muted">' + escapeHtml(item.role || '') + '</p></div>' +
            '<span class="status ' + (item.status === 'completed' ? 'passed' : 'failed') + '">' + escapeHtml(item.status || '') + '</span>' +
          '</div>'
        )
        .join('')
      return '<article class="detail"><h3>Agent Invocations</h3>' + rows + '</article>'
    }`
}
