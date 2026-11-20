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
  trash: TrashEntry[]
}
export interface TrashEntry {
  id: string
  skill: Skill
  deletedAt: string
  originalPath: string
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
export type ThemeMode = 'system' | 'light' | 'dark'
/** A tool directory inside a temporarily selected project (project-level skills). */
export interface ProjectToolScan {
  toolId: ToolId
  name: string
  /** Absolute directory scanned, e.g. `<project>/.claude/skills`. */
  directory: string
  skills: Skill[]
}
export interface ProjectScan {
  projectPath: string
  tools: ProjectToolScan[]
  diagnostics: string[]
}
export interface ProjectInstallInput {
  /** Absolute skill directories returned by `project-scan`. */
  sources: string[]
  toolId: ToolId
  projectPath: string
}
/** Auto-update state surfaced to the renderer. */
export interface UpdateStatus {
  currentVersion: string
  /** False in development builds, where the updater cannot run. */
  updateSupported: boolean
  state:
    'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  availableVersion?: string
  /** Download progress in percent (0–100) while state is 'downloading'. */
  progress?: number
  error?: string
}
/** Input for creating a Skill from the built-in template. */
export interface CreateSkillInput {
  name: string
  description: string
  /** Where the template directory is created: the central library or directly in a tool's root. */
  target: 'library' | ToolId
  /** Applies only when target is 'library'. */
  compatibility?: Compatibility
}
/** Per-tool scan configuration. `root` overrides the default scan/install directory; `extraRoots` are read-only discovery additions; `enabled: false` hides the agent entirely. */
export interface ToolScanSettings {
  root?: string
  extraRoots?: string[]
  enabled?: boolean
}
export interface Settings {
  theme: ThemeMode
  /** Custom central library location. Undefined means the default `<userData>/library`. */
  libraryRoot?: string
  tools: Partial<Record<ToolId, ToolScanSettings>>
}
