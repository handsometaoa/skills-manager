// One-off cleanup: merges the two draft releases left by the CI matrix into a
// single published release, then removes the stray duplicate.
// Usage: GH_TOKEN=xxx node scripts/consolidate-release.mjs v2.0.0
import fs from 'node:fs'

const token = process.env.GH_TOKEN
if (!token) throw new Error('GH_TOKEN required')
const repo = 'handsometaoa/skills-manager'
const tag = process.argv[2] ?? 'v2.0.0'
const api = 'https://api.github.com'
const headers = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github+json',
}

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  return response
}

const releases = await (await request(`${api}/repos/${repo}/releases`)).json()
const byAssets = (names) =>
  releases.find((r) => r.assets.some((a) => names.some((n) => a.name.endsWith(n))))
const windowsDraft = byAssets(['Setup-2.0.0.exe'])
const macDraft = byAssets(['latest-mac.yml'])
const stray = releases.find((r) => r.tag_name === '2.0.0')
if (!windowsDraft || !macDraft) throw new Error('drafts not found')

// Move the Windows installer and its update metadata into the mac draft,
// which already holds the DMGs and their blockmaps.
for (const asset of windowsDraft.assets) {
  if (!['Setup-2.0.0.exe', 'latest.yml'].includes(asset.name)) continue
  console.log('moving', asset.name)
  const buffer = Buffer.from(
    await (
      await request(asset.url, { headers: { Accept: 'application/octet-stream' } })
    ).arrayBuffer(),
  )
  const upload = await request(
    `${releases.find((r) => r.id === macDraft.id).upload_url.replace('{?name,label}', '')}?name=${asset.name}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': buffer.length },
      body: buffer,
    },
  )
  console.log('uploaded', asset.name, (await upload.json()).size)
}

await request(`${api}/repos/${repo}/releases/${macDraft.id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    draft: false,
    name: 'Skills Manager v2.0.0',
    body: '首个 v2 发布：shadcn/ui 重构界面、设置中心、主题模式、模板创建、文件编辑与自动更新。',
  }),
})
console.log('published', macDraft.tag_name)

for (const release of [windowsDraft, stray].filter(Boolean)) {
  await request(`${api}/repos/${repo}/releases/${release.id}`, { method: 'DELETE' })
  console.log('deleted draft/stray', release.tag_name, release.id)
}
