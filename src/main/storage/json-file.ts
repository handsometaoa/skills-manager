import fs from 'node:fs/promises'
import path from 'node:path'

/** Replace a complete JSON document with an atomic rename in the same directory. */
export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  const temporary = path.join(path.dirname(file), `${path.basename(file, '.json')}.tmp`)
  await fs.writeFile(temporary, JSON.stringify(value, null, 2))
  await fs.rename(temporary, file)
}
