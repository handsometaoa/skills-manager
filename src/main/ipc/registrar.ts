import { ipcMain, type BrowserWindow } from 'electron'
import type { IpcChannel } from '../../shared/ipc'

/** Serializes filesystem operations and accepts calls only from the app's main frame. */
export function createIpcRegistrar(getWindow: () => BrowserWindow) {
  let busy = false
  return (channel: IpcChannel, action: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      const window = getWindow()
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
        throw new Error('无效调用来源')
      if (busy) throw new Error('其他操作正在执行，请稍后重试')
      busy = true
      try {
        return await action(...args)
      } finally {
        busy = false
      }
    })
  }
}
