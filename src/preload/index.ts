import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'
const api: Api = {
  addToLibrary: (paths, compatibility) => ipcRenderer.invoke('library-add', paths, compatibility),
  collectSkill: (id, compatibility) => ipcRenderer.invoke('library-collect', id, compatibility),
  setCompatibility: (id, compatibility) => ipcRenderer.invoke('library-compatibility', id, compatibility),
  installLibrary: (ids, toolIds) => ipcRenderer.invoke('library-install', ids, toolIds),
  deleteLibrary: id => ipcRenderer.invoke('library-delete', id),
  detail: id => ipcRenderer.invoke('skill-detail', id),
  readFile: (id, relativePath) => ipcRenderer.invoke('skill-read-file', id, relativePath),
  scan: () => ipcRenderer.invoke('scan'),
  pickLocal: () => ipcRenderer.invoke('pick-local'),
  importGit: url => ipcRenderer.invoke('git-import', url),
  prepareCopy: id => ipcRenderer.invoke('prepare-copy', id),
  deleteExternal: id => ipcRenderer.invoke('delete-external', id),
  install: (path, tools) => ipcRenderer.invoke('install', path, tools),
  uninstall: id => ipcRenderer.invoke('uninstall', id),
  openPath: path => ipcRenderer.invoke('open-path', path)
}
contextBridge.exposeInMainWorld('skills', api)
