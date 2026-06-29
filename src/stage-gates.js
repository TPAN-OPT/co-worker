// A stage's effective gate set is its own gates plus the gates of every sub-node,
// each node gate tagged with the nodeId it came from. Consumers (the verifier,
// orchestrator, counts, and agent docs) treat node gates as gates of the parent
// stage so a stage is not "done" until its node-level checks pass too, while the
// nodeId preserves traceability back to the step that declared the gate.
export function stageGates(stage) {
  const ownGates = Array.isArray(stage.gates) ? stage.gates : []
  const nodeGates = Array.isArray(stage.nodes)
    ? stage.nodes.flatMap((node) =>
        (Array.isArray(node.gates) ? node.gates : []).map((gate) => ({
          ...gate,
          nodeId: node.id
        }))
      )
    : []
  return [...ownGates, ...nodeGates]
}
