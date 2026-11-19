// One-off fix-up: the CI exe draft was deleted by mistake; the published
// release needs the local Windows artifacts (exe + blockmap + latest.yml),
// which are self-consistent for the same commit. Replaces remote copies.
// Usage: GH_TOKEN=xxx node scripts/fix-release-exe.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const token = process.env.GH_TOKEN
if (!token) throw new Error('GH_TOKEN required')
const repo = 'handsometaoa/skills-manager'
const api = 'https://api.github.com'
const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }

const release = (await (await fetch(`${api}/repos/${repo}/releases`, { headers })).json())[0]
if (release.tag_name !== 'v2.0.0') throw new Error(`unexpected release ${release.tag_name}`)
const uploadUrl = release.upload_url.replace('{?name,label}', '')

const files = ['Skills Manager Setup 2.0.0.exe', 'Skills Manager Setup 2.0.0.exe.blockmap', 'latest.yml']
const localDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../release')

// Remove the CI copies first: latest.yml and exe.blockmap disagree with the
// local build (NSIS embeds timestamps), and the exe itself is missing.
for (const asset of release.assets) {
  if (files.includes(asset.name) || asset.name === 'Skills-Manager-Setup-2.0.0.exe.blockmap') {
    console.log('deleting remote', asset.name)
    await fetch(`${api}/repos/${repo}/releases/assets/${asset.id}`, { method: 'DELETE', headers })
  }
}

for (const localName of files) {
  // electron-builder sanitizes asset names the same way (spaces → '-'), and
  // latest.yml references the sanitized name.
  const assetName = localName.replaceAll(' ', '-')
  const data = fs.readFileSync(path.join(localDir, localName))
  console.log('uploading', assetName, Math.round(data.length / 1024 / 1024) + 'MB')
  const response = await fetch(`${uploadUrl}?name=${encodeURIComponent(assetName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': data.length },
    body: data,
  })
  if (!response.ok) throw new Error(`${response.status} uploading ${assetName}: ${await response.text()}`)
  console.log('uploaded', assetName)
}
