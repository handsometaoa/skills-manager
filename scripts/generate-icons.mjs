// Renders the brand SVG into Windows (.ico) and macOS (.icns) application icons.
// Usage: node scripts/generate-icons.mjs  → outputs to build/
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = path.dirname(fileURLToPath(import.meta.url))
const svg = fs.readFileSync(path.join(root, '../src/renderer/public/icon.svg'))
const out = path.join(root, '../build')
fs.mkdirSync(out, { recursive: true })

// Render once at high resolution, then derive every size from it.
const master = await sharp(svg, { density: 72 * 16 })
  .resize(1024, 1024)
  .png()
  .toBuffer()
const png = (size) => sharp(master).resize(size, size).png().toBuffer()

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
fs.writeFileSync(path.join(out, 'icon.ico'), await pngToIco(await Promise.all(icoSizes.map(png))))

// Minimal ICNS writer: the modern format embeds a PNG payload per size.
const ICNS_TYPES = {
  16: 'icp4',
  32: 'icp5',
  64: 'icp6',
  128: 'ic07',
  256: 'ic08',
  512: 'ic09',
  1024: 'ic10',
}
const chunks = []
for (const [size, type] of Object.entries(ICNS_TYPES)) {
  const data = await png(Number(size))
  const head = Buffer.alloc(8)
  head.write(type, 0, 'ascii')
  head.writeUInt32BE(data.length + 8, 4)
  chunks.push(head, data)
}
const total = 8 + chunks.reduce((n, c) => n + c.length, 0)
const header = Buffer.alloc(8)
header.write('icns', 0, 'ascii')
header.writeUInt32BE(total, 4)
fs.writeFileSync(path.join(out, 'icon.icns'), Buffer.concat([header, ...chunks]))

fs.writeFileSync(path.join(out, 'icon.png'), await png(512))

// NSIS assisted-installer artwork: header strip and sidebar, both drawn from
// the brand gradient with the app icon and name.
const iconAt = async (size) =>
  sharp(await png(size))
    .png()
    .toBuffer()
const text = (content, y, sizePx, fill) =>
  `<text x="82" y="${y}" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="${sizePx}" font-weight="600" fill="${fill}" text-anchor="middle">${content}</text>`
const headerBackdrop = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#eafff1"/><stop offset="1" stop-color="#e0edf9"/></linearGradient></defs><rect width="150" height="57" fill="url(#g)"/></svg>`,
)
await sharp(headerBackdrop)
  .composite([{ input: await iconAt(46), top: 5, left: 6 }])
  .toFile(path.join(out, 'installerHeader.bmp'))
const sidebarBackdrop = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#eafff1"/><stop offset="1" stop-color="#dbe9f9"/></linearGradient></defs><rect width="164" height="314" fill="url(#g)"/>${text('Skills Manager', 232, 13, '#1f2937')}${text('v2.0.0', 252, 10, '#6b7280')}</svg>`,
)
await sharp(sidebarBackdrop)
  .composite([{ input: await iconAt(120), top: 74, left: 22 }])
  .toFile(path.join(out, 'installerSidebar.bmp'))
console.log(
  'icons written to build/: icon.ico, icon.icns, icon.png, installerHeader.bmp, installerSidebar.bmp',
)
