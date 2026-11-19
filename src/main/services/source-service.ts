import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Candidate } from '../../shared/types'
import { inspectSkill } from './skill-parser'

export async function nameGitRootSkill(repository: string): Promise<string> {
  try {
    const rootSkill = await inspectSkill(repository)
    const named = await inspectSkill(repository, rootSkill.metadataName)
    if (named.name === path.basename(repository)) return repository
    const renamed = path.join(path.dirname(repository), 'skill', named.name)
    await fs.mkdir(path.dirname(renamed), { recursive: true })
    await fs.rename(repository, renamed)
    return renamed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return repository
  }
}

/** Tracks explicitly selected sources and owns temporary Git checkouts. */
export class SourceService {
  readonly allowedSources = new Map<string, string>()
  private readonly temporaryDirectories: string[] = []
  constructor(private readonly discover: (root: string) => Promise<Candidate[]>) {}

  async importGit(url: unknown): Promise<Candidate[]> {
    if (typeof url !== 'string' || url.length > 2048)
      throw new Error('请输入有效的 HTTPS Git 仓库地址')
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
      throw new Error('仅支持不含凭据的 HTTPS Git 地址')
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-manager-'))
    this.temporaryDirectories.push(temporary)
    const repositoryName = decodeURIComponent(
      parsed.pathname.split('/').filter(Boolean).at(-1) ?? '',
    ).replace(/\.git$/i, '')
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(repositoryName)) throw new Error('Git 仓库名称无效')
    let repository = path.join(temporary, repositoryName)
    try {
      await promisify(execFile)(
        'git',
        [
          '-c',
          `core.hooksPath=${path.join(temporary, 'no-hooks')}`,
          '-c',
          'protocol.file.allow=never',
          'clone',
          '--depth',
          '1',
          '--',
          parsed.href,
          repository,
        ],
        {
          timeout: 120000,
          windowsHide: true,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
        },
      )
      // A root Skill has no meaningful parent folder in a temporary checkout.
      // Give it its declared name before discovery, so subsequent copies keep it.
      repository = await nameGitRootSkill(repository)
      const candidates = await this.discover(repository)
      for (const candidate of candidates)
        this.allowedSources.set(
          candidate.path,
          `${parsed.href}#${path.relative(repository, candidate.path).split(path.sep).join('/')}`,
        )
      return candidates
    } catch (error) {
      throw new Error(
        `Git 导入失败，请确认已安装 Git 且仓库可公开访问。${(error as Error).message}`,
        { cause: error },
      )
    }
  }
  async cleanup(): Promise<void> {
    await Promise.allSettled(
      this.temporaryDirectories.map((directory) =>
        fs.rm(directory, { recursive: true, force: true }),
      ),
    )
    this.temporaryDirectories.length = 0
    this.allowedSources.clear()
  }
}
