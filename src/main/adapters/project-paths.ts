import type { ToolId } from '../../shared/types'

/**
 * Project-level skill directories confirmed by each tool's documentation.
 * ZCode is intentionally absent: its docs describe importing into "the current
 * project" but never name the directory, so installs there could silently no-op.
 */
export const PROJECT_TOOLS: { toolId: ToolId; name: string; relative: string }[] = [
  { toolId: 'claude', name: 'Claude Code', relative: '.claude/skills' },
  { toolId: 'codex', name: 'Codex', relative: '.agents/skills' },
  { toolId: 'cursor', name: 'Cursor', relative: '.cursor/skills' },
  { toolId: 'qoder', name: 'Qoder', relative: '.qoder/skills' },
  { toolId: 'opencode', name: 'OpenCode', relative: '.opencode/skills' },
  { toolId: 'gemini', name: 'Gemini CLI', relative: '.gemini/skills' },
  { toolId: 'copilot', name: 'GitHub Copilot', relative: '.github/skills' },
]
