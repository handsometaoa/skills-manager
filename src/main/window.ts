import { BrowserWindow, nativeTheme } from 'electron'
import path from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc'

// Matches the zinc `--background` token in globals.css for both schemes.
export const backgroundColor = () => (nativeTheme.shouldUseDarkColors ? '#09090b' : '#ffffff')

export function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 680,
    // The frame stays for native edge resizing and window snapping; only the
    // title bar is hidden so the renderer can draw ZCode-style controls.
    // macOS keeps the native traffic lights and just insets them instead.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: backgroundColor(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const notifyMaximized = () => {
    if (!window.isDestroyed())
      window.webContents.send(IPC_CHANNELS.onWindowMaximizeChange, window.isMaximized())
  }
  window.on('maximize', notifyMaximized)
  window.on('unmaximize', notifyMaximized)
  nativeTheme.on('updated', () => {
    if (!window.isDestroyed()) window.setBackgroundColor(backgroundColor())
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  return window
}
