import { app, BrowserWindow, dialog } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { SkillStore } from './services/skill-service'
import { SourceService } from './services/source-service'
import { registerHandlers } from './ipc/register-handlers'
import { createMainWindow } from './window'

export function bootstrap(): void {
  // Keep existing installations and the library accessible after the product rename.
  app.setPath(
    'userData',
    path.join(app.getPath('appData'), app.isPackaged ? 'Skill Manage' : 'skill-manage'),
  )
  app.setName('Skills Manager')
  let mainWindow: BrowserWindow | null = null
  let sources: SourceService | undefined
  let cleanupComplete = false
  app
    .whenReady()
    .then(async () => {
      const store = new SkillStore(app.getPath('userData'), os.homedir())
      await store.init()
      sources = new SourceService((root) => store.discover(root))
      registerHandlers(store, sources, () => {
        if (!mainWindow || mainWindow.isDestroyed()) throw new Error('应用窗口已关闭')
        return mainWindow
      })
      const openWindow = () => {
        mainWindow = createMainWindow()
        mainWindow.on('closed', () => {
          mainWindow = null
        })
      }
      openWindow()
      app.on('activate', () => {
        if (!BrowserWindow.getAllWindows().length) openWindow()
      })
    })
    .catch((error) => {
      dialog.showErrorBox('启动失败', String(error))
      app.quit()
    })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (cleanupComplete || !sources) return
    event.preventDefault()
    cleanupComplete = true
    void sources.cleanup().finally(() => app.quit())
  })
}
