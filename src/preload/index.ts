import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'
import { IPC_CHANNELS } from '../shared/ipc'
import type { UpdateStatus } from '../shared/types'
const api: Api = {
  createSkill: (input) => ipcRenderer.invoke(IPC_CHANNELS.createSkill, input),
  addToLibrary: (paths, compatibility) =>
    ipcRenderer.invoke(IPC_CHANNELS.addToLibrary, paths, compatibility),
  prepareDeploy: (id) => ipcRenderer.invoke(IPC_CHANNELS.prepareDeploy, id),
  deployUpdate: (id, overwritePaths, onlyPaths) =>
    ipcRenderer.invoke(IPC_CHANNELS.deployUpdate, id, overwritePaths, onlyPaths),
  collectSkill: (id, compatibility) =>
    ipcRenderer.invoke(IPC_CHANNELS.collectSkill, id, compatibility),
  syncToLibrary: (id) => ipcRenderer.invoke(IPC_CHANNELS.syncToLibrary, id),
  setCompatibility: (id, compatibility) =>
    ipcRenderer.invoke(IPC_CHANNELS.setCompatibility, id, compatibility),
  installLibrary: (ids, toolIds) => ipcRenderer.invoke(IPC_CHANNELS.installLibrary, ids, toolIds),
  deleteLibrary: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteLibrary, id),
  restoreTrash: (id) => ipcRenderer.invoke(IPC_CHANNELS.restoreTrash, id),
  deleteTrash: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteTrash, id),
  detail: (id) => ipcRenderer.invoke(IPC_CHANNELS.detail, id),
  readFile: (id, relativePath) => ipcRenderer.invoke(IPC_CHANNELS.readFile, id, relativePath),
  scan: () => ipcRenderer.invoke(IPC_CHANNELS.scan),
  pickLocal: () => ipcRenderer.invoke(IPC_CHANNELS.pickLocal),
  importGit: (url) => ipcRenderer.invoke(IPC_CHANNELS.importGit, url),
  prepareCopy: (id) => ipcRenderer.invoke(IPC_CHANNELS.prepareCopy, id),
  deleteExternal: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteExternal, id),
  install: (path, tools) => ipcRenderer.invoke(IPC_CHANNELS.install, path, tools),
  uninstall: (id) => ipcRenderer.invoke(IPC_CHANNELS.uninstall, id),
  openPath: (path) => ipcRenderer.invoke(IPC_CHANNELS.openPath, path),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.saveSettings, settings),
  setTheme: (theme) => ipcRenderer.invoke(IPC_CHANNELS.setTheme, theme),
  pickDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.pickDirectory),
  writeFile: (id, relativePath, content) =>
    ipcRenderer.invoke(IPC_CHANNELS.writeFile, id, relativePath, content),
  windowMinimize: () => ipcRenderer.invoke(IPC_CHANNELS.windowMinimize),
  windowMaximizeToggle: () => ipcRenderer.invoke(IPC_CHANNELS.windowMaximizeToggle),
  windowClose: () => ipcRenderer.invoke(IPC_CHANNELS.windowClose),
  windowIsMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.windowIsMaximized),
  onWindowMaximizeChange: (callback) => {
    const listener = (_event: unknown, maximized: boolean) => callback(maximized)
    ipcRenderer.on(IPC_CHANNELS.onWindowMaximizeChange, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.onWindowMaximizeChange, listener)
  },
  getUpdateStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getUpdateStatus),
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.downloadUpdate),
  quitAndInstall: () => ipcRenderer.invoke(IPC_CHANNELS.quitAndInstall),
  onUpdateStatus: (callback) => {
    const listener = (_event: unknown, status: UpdateStatus) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.onUpdateStatus, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.onUpdateStatus, listener)
  },
  scanProject: (projectPath) => ipcRenderer.invoke(IPC_CHANNELS.scanProject, projectPath),
  installToProject: (input) => ipcRenderer.invoke(IPC_CHANNELS.installToProject, input),
  collectProjectSkill: (absPath, compatibility) =>
    ipcRenderer.invoke(IPC_CHANNELS.collectProjectSkill, absPath, compatibility),
  projectSyncToLibrary: (absPath) => ipcRenderer.invoke(IPC_CHANNELS.projectSyncToLibrary, absPath),
  projectBrowse: (absPath) => ipcRenderer.invoke(IPC_CHANNELS.projectBrowse, absPath),
  projectReadFile: (absPath, relativePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.projectReadFile, absPath, relativePath),
  projectWriteFile: (absPath, relativePath, content) =>
    ipcRenderer.invoke(IPC_CHANNELS.projectWriteFile, absPath, relativePath, content),
  projectDelete: (absPath) => ipcRenderer.invoke(IPC_CHANNELS.projectDelete, absPath),
}
contextBridge.exposeInMainWorld('skills', api)
