import { TOOL_IDS, type Compatibility, type Skill, type ToolId } from './types'

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && (TOOL_IDS as readonly string[]).includes(value)
}

export function isCompatibility(value: unknown): value is Compatibility {
  return (
    value === 'all' ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every(isToolId) &&
      new Set(value).size === value.length)
  )
}

export function normalizeCompatibility(value: unknown): Compatibility {
  // Older releases stored one tool ID instead of a list.
  if (isToolId(value)) return [value]
  if (!isCompatibility(value)) throw new Error('无效的适用工具')
  return value === 'all' ? value : TOOL_IDS.filter((id) => value.includes(id))
}

export function supportsTool(value: Compatibility | undefined, id: ToolId): boolean {
  return value === 'all' || !!value?.includes(id)
}

export function compatibilityKey(value: Compatibility): string {
  return JSON.stringify(normalizeCompatibility(value))
}

export function discoveredBy(skill: Skill, id: ToolId): boolean {
  return skill.discoveredBy?.includes(id) ?? skill.toolId === id
}
