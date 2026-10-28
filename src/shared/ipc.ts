import type { Api } from './api'

export const IPC_CHANNELS = {
  addToLibrary: 'library-add',
  collectSkill: 'library-collect',
  setCompatibility: 'library-compatibility',
  installLibrary: 'library-install',
  deleteLibrary: 'library-delete',
  detail: 'skill-detail',
  readFile: 'skill-read-file',
  scan: 'scan',
  pickLocal: 'pick-local',
  importGit: 'git-import',
  prepareCopy: 'prepare-copy',
  deleteExternal: 'delete-external',
  install: 'install',
  uninstall: 'uninstall',
  openPath: 'open-path',
} as const satisfies Record<keyof Api, string>
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
