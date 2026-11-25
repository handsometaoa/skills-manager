import type {
  Candidate,
  DeployPlan,
  DeployResult,
  Compatibility,
  CreateSkillInput,
  ProjectInstallInput,
  ProjectScan,
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
  /** Previews linked copies and same-name copies that have no library association. */
  prepareDeploy(id: string): Promise<DeployPlan>
  /** Copies library content to linked copies and explicitly selected conflicts. */
  deployUpdate(id: string, overwritePaths?: string[], onlyPaths?: string[]): Promise<DeployResult>
  collectSkill(id: string, compatibility: Compatibility): Promise<void>
  /** Overwrites an associated library entry with the current Agent copy. */
  syncToLibrary(id: string): Promise<void>
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
  /** Scans the Agent skill directories inside a temporarily selected project. */
  scanProject(projectPath: string): Promise<ProjectScan>
  /** Copies library skills into one of the project's Agent directories. */
  installToProject(input: ProjectInstallInput): Promise<void>
  /** Collects a scanned project skill and associates its original directory. */
  collectProjectSkill(absPath: string, compatibility: Compatibility): Promise<void>
  /** Overwrites the associated library entry with a scanned project skill. */
  projectSyncToLibrary(absPath: string): Promise<void>
  /** Reads/writes/deletes a skill that lives inside the scanned project. */
  projectBrowse(absPath: string): Promise<SkillDetail>
  projectReadFile(absPath: string, relativePath: string): Promise<string>
  projectWriteFile(absPath: string, relativePath: string, content: string): Promise<void>
  /** Moves a project skill into the app recycle bin; restorable afterwards. */
  projectDelete(absPath: string): Promise<void>
}
