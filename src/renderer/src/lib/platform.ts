/** Renderer-safe platform check: sandboxed renderers have no `process.platform`. */
export const isMac = navigator.userAgent.includes('Mac')
