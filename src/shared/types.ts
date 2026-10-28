export type ToolId = 'claude' | 'codex' | 'zcode'
export type Compatibility = 'all' | ToolId
export interface Tool { id: ToolId; name: string; root: string }
export interface Skill {
  id: string; name: string; description: string; path: string; toolId: ToolId | 'library'
  managed: boolean; linked: boolean; warnings: string[]; source?: string
  compatibility?: Compatibility; addedAt?: string; libraryId?: string
}
export interface Candidate { path: string; name: string; description: string; warnings: string[] }
export interface Snapshot { tools: Tool[]; skills: Skill[]; diagnostics: string[]; library: Skill[]; libraryRoot: string }
export interface SkillFile { path: string; size: number }
export interface SkillDetail { skill: Skill; files: SkillFile[]; truncated: boolean }
export interface Api {
  addToLibrary(paths: string[], compatibility: Compatibility): Promise<void>
  collectSkill(id: string, compatibility: Compatibility): Promise<void>
  setCompatibility(id: string, compatibility: Compatibility): Promise<void>
  installLibrary(ids: string[], toolIds: ToolId[]): Promise<void>
  deleteLibrary(id: string): Promise<void>
  detail(id: string): Promise<SkillDetail>
  readFile(id: string, relativePath: string): Promise<string>
  scan(): Promise<Snapshot>
  pickLocal(): Promise<Candidate[] | null>
  importGit(url: string): Promise<Candidate[]>
  prepareCopy(id: string): Promise<Candidate>
  deleteExternal(id: string): Promise<void>
  install(path: string, tools: ToolId[]): Promise<void>
  uninstall(id: string): Promise<void>
  openPath(path: string): Promise<void>
}
declare global { interface Window { skills: Api } }
