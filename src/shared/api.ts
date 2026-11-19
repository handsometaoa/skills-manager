import type {
  Candidate,
  Compatibility,
  CreateSkillInput,
  Settings,
  SkillDetail,
  Snapshot,
  ThemeMode,
  ToolId,
  UpdateStatus,
} from './types'

export interface Api {
  createSkill(input: CreateSkillInput): Promise<Candidate>
  addToLibrary(paths: string[], compatibility: Compatibility): Promise<void>
  collectSkill(id: string, compatibility: Compatibility): Promise<void>
  setCompatibility(id: string, compatibility: Compatibility): Promise<void>
  installLibrary(ids: string[], toolIds: ToolId[]): Promise<void>
  deleteLibrary(id: string): Promise<void>
  restoreTrash(id: string): Promise<void>
  deleteTrash(id: string): Promise<void>
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
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>
  setTheme(theme: ThemeMode): Promise<void>
  pickDirectory(): Promise<string | null>
  writeFile(id: string, relativePath: string, content: string): Promise<void>
  windowMinimize(): Promise<void>
  windowMaximizeToggle(): Promise<boolean>
  windowClose(): Promise<void>
  windowIsMaximized(): Promise<boolean>
  /** Subscribes to maximize-state changes; returns an unsubscribe function. */
  onWindowMaximizeChange(callback: (maximized: boolean) => void): () => void
  getUpdateStatus(): Promise<UpdateStatus>
  checkForUpdates(): Promise<UpdateStatus>
  downloadUpdate(): Promise<UpdateStatus>
  quitAndInstall(): Promise<void>
  /** Subscribes to updater-state changes; returns an unsubscribe function. */
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void
}
