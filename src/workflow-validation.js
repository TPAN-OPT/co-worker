import { IDENTIFIER_PATTERN } from './identifier-pattern.js'

// Shared primitive validators used across the workflow normalizers. Kept in one
// module so the compiler and the stage normalizer enforce identical rules without
// duplicating logic.

export function normalizeStringArray(value, label, options = {}) {
  if (value === undefined && options.optional) {
    return []
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }

  return value.map((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`${label}[${index}] must be a non-empty string`)
    }

    return item.trim()
  })
}

export function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }

  return value.trim()
}

export function normalizeEnvObject(value, label) {
  if (value === undefined) {
    return {}
  }

  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object`)
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (typeof key !== 'string' || key.trim() === '') {
        throw new Error(`${label} keys must be non-empty strings`)
      }
      if (typeof item !== 'string') {
        throw new Error(`${label} value for "${key}" must be a string`)
      }

      return [key, item]
    })
  )
}

export function normalizeEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`)
  }

  return value
}

export function optionalString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

export function validateIdentifier(value, label) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${label} must use letters, numbers, underscores, or hyphens`)
  }
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function assertKnownFields(value, allowedFields, label) {
  for (const field of Object.keys(value)) {
    if (!allowedFields.includes(field)) {
      throw new Error(`${label} contains unknown field "${field}"`)
    }
  }
}
