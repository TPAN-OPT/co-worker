// Single source of truth for workflow identifier syntax. The runtime validator
// (compiler.js) and the generated JSON Schema (schema-renderer.js) both consume
// these exports so the executable check and the published schema cannot drift.
export const IDENTIFIER_PATTERN_SOURCE = '^[A-Za-z][A-Za-z0-9_-]*$'

export const IDENTIFIER_PATTERN = new RegExp(IDENTIFIER_PATTERN_SOURCE)
