import type { Candidate, Compatibility, SkillDetail, Snapshot, ToolId } from './types'

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
