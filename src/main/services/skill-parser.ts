import fs from 'node:fs/promises'
import path from 'node:path'
import { parseDocument } from 'yaml'
import type { Candidate } from '../../shared/types'

export async function inspectSkill(dir: string): Promise<Candidate> {
  const text = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8')
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error(`${path.basename(dir)}：缺少 YAML frontmatter`)
  const document = parseDocument(match[1], { uniqueKeys: true })
  if (document.errors.length) throw new Error(`${path.basename(dir)}：YAML 格式错误`)
  const metadata = document.toJS({ maxAliasCount: 50 })
  if (
    typeof metadata?.name !== 'string' ||
    !metadata.name.trim() ||
    typeof metadata?.description !== 'string' ||
    !metadata.description.trim()
  )
    throw new Error(`${path.basename(dir)}：name 和 description 必须是非空字符串`)
  const name = path.basename(dir)
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
    name.endsWith('.')
  )
    throw new Error('Skill 目录名需使用字母、数字、短横线或下划线，且不能是系统保留名称')
  const warnings: string[] = []
  if (metadata.name !== name)
    warnings.push(
      `文件夹名「${name}」与 SKILL.md 中的 name「${metadata.name}」不同。建议统一命名；本应用按文件夹名安装，不会自动改写文件。`,
    )
  if (metadata.description.length > 1024) warnings.push('描述超过 1024 字符，ZCode 将忽略此 Skill')
  if (Buffer.byteLength(text.slice(match[0].length)) > 100 * 1024)
    warnings.push('正文超过 100KB，ZCode 可能截断加载')
  return {
    path: dir,
    name,
    metadataName: metadata.name,
    description: metadata.description,
    warnings,
  }
}
export async function discoverSkills(root: string): Promise<Candidate[]> {
  const found: Candidate[] = []
  const walk = async (dir: string, depth: number) => {
    if (found.length >= 200) throw new Error('一次最多导入 200 个 Skill')
    try {
      await fs.access(path.join(dir, 'SKILL.md'))
      found.push(await inspectSkill(dir))
      return
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    if (depth >= 4) return
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
        await walk(path.join(dir, entry.name), depth + 1)
    }
  }
  await walk(root, 0)
  return found
}
