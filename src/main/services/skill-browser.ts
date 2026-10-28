import fs from 'node:fs/promises'
import path from 'node:path'
import type { Skill, SkillDetail } from '../../shared/types'

export async function getSkillDetail(skill: Skill): Promise<SkillDetail> {
  const root = await fs.realpath(skill.path)
  const files: SkillDetail['files'] = []
  let truncated = false,
    visited = 0
  const walk = async (directory: string, depth: number) => {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (++visited > 1000) {
        truncated = true
        return
      }
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const full = path.join(directory, entry.name)
      const stat = await fs.lstat(full)
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) {
        if (depth < 8) await walk(full, depth + 1)
        else truncated = true
      } else if (stat.isFile())
        files.push({ path: path.relative(root, full).split(path.sep).join('/'), size: stat.size })
      if (visited > 1000) return
    }
  }
  await walk(root, 0)
  files.sort((a, b) =>
    a.path === 'SKILL.md' ? -1 : b.path === 'SKILL.md' ? 1 : a.path.localeCompare(b.path),
  )
  return { skill, files, truncated }
}
export async function readSkillFile(skill: Skill, relativePath: string): Promise<string> {
  if (
    !relativePath ||
    relativePath.length > 2048 ||
    relativePath.includes('\\') ||
    relativePath.includes(':') ||
    relativePath.includes('\0') ||
    path.isAbsolute(relativePath) ||
    relativePath.split('/').some((p) => p === '..' || p === '.' || !p)
  )
    throw new Error('无效文件路径')
  const root = await fs.realpath(skill.path)
  const target = await fs.realpath(path.join(root, relativePath))
  const within = path.relative(root, target)
  if (!within || within.startsWith('..' + path.sep) || within === '..' || path.isAbsolute(within))
    throw new Error('不允许浏览 Skill 目录之外的文件')
  const handle = await fs.open(target, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('只能查看普通文件')
    const limit = 1024 * 1024
    if (stat.size > limit) throw new Error('文件超过 1MB，请使用“打开目录”在外部查看')
    const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const bytes = buffer.subarray(0, bytesRead)
    if (bytesRead > limit) throw new Error('文件超过 1MB，请在外部查看')
    if (bytes.includes(0)) throw new Error('此文件为二进制文件，暂不支持预览')
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new Error('暂不支持此文件编码，请在外部查看')
    }
  } finally {
    await handle.close()
  }
}
