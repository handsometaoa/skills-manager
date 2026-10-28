import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api'
import { IPC_CHANNELS } from '../shared/ipc'
const api: Api = {
  addToLibrary: (paths, compatibility) =>
    ipcRenderer.invoke(IPC_CHANNELS.addToLibrary, paths, compatibility),
  collectSkill: (id, compatibility) =>
    ipcRenderer.invoke(IPC_CHANNELS.collectSkill, id, compatibility),
  setCompatibility: (id, compatibility) =>
    ipcRenderer.invoke(IPC_CHANNELS.setCompatibility, id, compatibility),
  installLibrary: (ids, toolIds) => ipcRenderer.invoke(IPC_CHANNELS.installLibrary, ids, toolIds),
  deleteLibrary: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteLibrary, id),
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
}
contextBridge.exposeInMainWorld('skills', api)
