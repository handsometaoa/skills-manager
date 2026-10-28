import path from 'node:path'
import type { Tool } from '../../shared/types'

/** User-level directories only. Add new tool integrations here. */
export function createToolRegistry(home: string): Tool[] {
  const root = (name: string) => path.join(home, name, 'skills')
  const agents = root('.agents')
  const claude = root('.claude')
  const codexLegacy = root('.codex')
  const tool = (
    id: Tool['id'],
    name: string,
    directory: string,
    extra: string[] = [],
    instructions = '安装后请刷新技能列表或开启新会话。',
  ): Tool => ({
    id,
    name,
    root: directory,
    discoveryRoots: [directory, ...extra],
    instructions,
  })
  return [
    tool('claude', 'Claude Code', claude),
    tool(
      'codex',
      'Codex',
      agents,
      [],
      '此目录也会被 Cursor、OpenCode、Gemini CLI 和 Copilot 读取。安装后请刷新或开启新会话。',
    ),
    tool('zcode', 'ZCode', root('.zcode'), [], '请在设置 → Skills 中刷新列表并确认启用开关。'),
    tool(
      'cursor',
      'Cursor',
      root('.cursor'),
      [agents, claude, codexLegacy],
      '安装后请刷新或开启新会话。本机用户技能不会自动同步到云端 Agent。',
    ),
    tool('qoder', 'Qoder', root('.qoder'), [], 'IDE 请重启后输入 / 查看技能；CLI 请开启新会话。'),
    tool('opencode', 'OpenCode', path.join(home, '.config', 'opencode', 'skills'), [
      agents,
      claude,
    ]),
    tool(
      'gemini',
      'Gemini CLI',
      root('.gemini'),
      [agents],
      '请使用 /skills reload 或开启新会话刷新，并确认技能权限。',
    ),
    tool(
      'copilot',
      'GitHub Copilot',
      root('.copilot'),
      [agents],
      '请刷新或开启新会话。可用性取决于 Copilot 入口，本机技能不会自动同步到云端。',
    ),
  ]
}
