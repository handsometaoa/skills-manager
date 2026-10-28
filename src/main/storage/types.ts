import type { Compatibility, ToolId } from '../../shared/types'

export interface RecordEntry {
  id: string
  toolId: ToolId
  path: string
  source: string
  hashes: Record<string, string>
  libraryId?: string
}
export interface LibraryEntry {
  id: string
  name: string
  source: string
  compatibility: Compatibility
  addedAt: string
}
