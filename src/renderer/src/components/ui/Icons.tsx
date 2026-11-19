import type { ToolId } from '../../../../shared/types'
import { FolderOpen, Library } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Static display names — available even when a tool is disabled and absent from snapshots. */
export const TOOL_NAMES: Record<ToolId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  zcode: 'ZCode',
  cursor: 'Cursor',
  qoder: 'Qoder',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
  copilot: 'GitHub Copilot',
}

const ASSETS: Record<ToolId, string> = {
  claude: new URL('../../assets/claude.svg', import.meta.url).href,
  codex: new URL('../../assets/codex.svg', import.meta.url).href,
  zcode: new URL('../../assets/zcode.png', import.meta.url).href,
  cursor: new URL('../../assets/cursor.svg', import.meta.url).href,
  qoder: new URL('../../assets/qoder.svg', import.meta.url).href,
  opencode: new URL('../../assets/opencode.svg', import.meta.url).href,
  gemini: new URL('../../assets/gemini.svg', import.meta.url).href,
  copilot: new URL('../../assets/copilot.svg', import.meta.url).href,
}

export function ToolIcon({
  id,
  small = false,
  className,
}: {
  id: ToolId | 'library'
  small?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        // Brand SVG glyphs are drawn for light surfaces; keep the tile white in
        // both themes so they stay visible in dark mode.
        'tool-icon flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-white text-muted-foreground',
        small ? 'size-6' : 'size-8',
        className,
      )}
      aria-hidden={id !== 'library'}
    >
      {id === 'library' ? (
        <Library className={small ? 'size-3.5' : 'size-4.5'} />
      ) : (
        <img
          src={ASSETS[id]}
          alt=""
          className={small ? 'size-4' : 'size-5'}
          draggable={false}
          title={TOOL_NAMES[id]}
        />
      )}
    </span>
  )
}

export function ToolDirectoryIcon({ className }: { className?: string }) {
  return <FolderOpen className={className} aria-hidden />
}
