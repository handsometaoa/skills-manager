import type { Compatibility, ToolId } from '../../shared/types'
import { isCompatibility, isToolId } from '../../shared/compatibility'

export function assertCompatibility(value: unknown): asserts value is Compatibility {
  if (!isCompatibility(value)) throw new Error('无效的适用工具')
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
