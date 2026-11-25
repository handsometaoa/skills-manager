import type { Compatibility, ToolId } from '../../shared/types'
import { isCompatibility, isToolId } from '../../shared/compatibility'

export function assertCompatibility(value: unknown): asserts value is Compatibility {
  if (!isCompatibility(value)) throw new Error('无效的适用工具')
}

export function assertPaths(value: unknown, message: string): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((p) => typeof p !== 'string' || !p.trim()) ||
    new Set(value).size !== value.length
  )
    throw new Error(message)
}

export function assertOverwritePaths(value: unknown): asserts value is string[] {
  assertPaths(value, '无效的覆盖目标')
}

export function assertToolIds(value: unknown): asserts value is ToolId[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((id) => !isToolId(id)) ||
    new Set(value).size !== value.length
  )
    throw new Error('请选择有效的目标工具')
}

/**
 * Project installs copy from previously whitelisted sources (picked folders,
 * Git checkouts, project scans) or straight from the central library, whose
 * paths never pass through `allowedSources`.
 */
export function assertProjectSources(
  value: unknown,
  isKnown: (source: string) => boolean,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((s) => typeof s !== 'string' || !isKnown(s))
  )
    throw new Error('请先选择安装来源')
}
