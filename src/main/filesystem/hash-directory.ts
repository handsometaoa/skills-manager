import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

export async function hashDirectory(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const walk = async (current: string) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      const stat = await fs.lstat(full)
      if (stat.isSymbolicLink()) throw new Error('Skill 内含符号链接，请改用完整的普通文件目录')
      if (stat.isDirectory()) await walk(full)
      else if (stat.isFile())
        result[path.relative(dir, full)] = createHash('sha256')
          .update(await fs.readFile(full))
          .digest('hex')
      else throw new Error('Skill 中存在不支持的文件类型')
    }
  }
  await walk(dir)
  return result
}
