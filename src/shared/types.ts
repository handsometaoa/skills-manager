export const TOOL_IDS = [
  'claude',
  'codex',
  'zcode',
  'cursor',
  'qoder',
  'opencode',
  'gemini',
  'copilot',
] as const
export type ToolId = (typeof TOOL_IDS)[number]
export type Compatibility = 'all' | ToolId[]
export interface Tool {
  id: ToolId
  name: string
  root: string
  discoveryRoots: string[]
  instructions: string
}
export interface Skill {
  id: string
  name: string
  metadataName?: string
  description: string
  path: string
  toolId: ToolId | 'library'
  managed: boolean
  linked: boolean
  warnings: string[]
  source?: string
  compatibility?: Compatibility
  addedAt?: string
  libraryId?: string
  /** Physical files are returned once, even when several tools discover them. */
  discoveredBy?: ToolId[]
  installedBy?: ToolId
}
export interface Candidate {
  path: string
  name: string
  metadataName?: string
  description: string
  warnings: string[]
}
export interface Snapshot {
  tools: Tool[]
  skills: Skill[]
  diagnostics: string[]
  library: Skill[]
  libraryRoot: string
}
export interface SkillFile {
  path: string
  size: number
}
export interface SkillDetail {
  skill: Skill
  files: SkillFile[]
  truncated: boolean
}
