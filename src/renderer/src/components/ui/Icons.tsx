import type { ToolId } from '../../../../shared/types'

export function ToolIcon({ id, small = false }: { id: ToolId | 'library'; small?: boolean }) {
  if (id === 'library')
    return (
      <span className={`tool-icon library-icon ${small ? 'small' : ''}`}>
        <Icon name="library" />
      </span>
    )
  const assets = {
    claude: new URL('../../assets/claude.svg', import.meta.url).href,
    codex: new URL('../../assets/codex.svg', import.meta.url).href,
    zcode: new URL('../../assets/zcode.png', import.meta.url).href,
    cursor: new URL('../../assets/cursor.svg', import.meta.url).href,
    qoder: new URL('../../assets/qoder.svg', import.meta.url).href,
    opencode: new URL('../../assets/opencode.svg', import.meta.url).href,
    gemini: new URL('../../assets/gemini.svg', import.meta.url).href,
    copilot: new URL('../../assets/copilot.svg', import.meta.url).href,
  }
  return (
    <span className={`tool-icon ${id} ${small ? 'small' : ''}`}>
      <img
        src={assets[id]}
        alt={`${{ claude: 'Claude Code', codex: 'Codex', zcode: 'ZCode', cursor: 'Cursor', qoder: 'Qoder', opencode: 'OpenCode', gemini: 'Gemini CLI', copilot: 'GitHub Copilot' }[id]} 图标`}
      />
    </span>
  )
}

export type IconName =
  | 'library'
  | 'plus'
  | 'arrow'
  | 'search'
  | 'refresh'
  | 'folder'
  | 'check'
  | 'close'
  | 'download'
  | 'more'
  | 'file'
  | 'git'
  | 'collect'
  | 'warning'
  | 'trash'
  | 'copy'
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    library: (
      <>
        <path d="M4 5h5v14H4zM12 5h4v14h-4zM18 5l3 13" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 10a8 8 0 0 0-14-4L3 9m0-5v5h5M4 14a8 8 0 0 0 14 4l3-3m0 5v-5h-5" />
      </>
    ),
    folder: <path d="M3 7V5h7l2 3h9v11H3V7Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    file: (
      <>
        <path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h5" />
      </>
    ),
    git: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M6 7v10M18 8c0 6-12 2-12 8" />
      </>
    ),
    collect: (
      <>
        <path d="M4 5h16v4H4zM6 9v11h12V9M9 13h6" />
      </>
    ),
    warning: (
      <>
        <path d="m12 3 10 18H2zM12 9v5M12 17h.01" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    copy: (
      <>
        <path d="M9 9h11v12H9zM15 9V3H3v12h6" />
      </>
    ),
  }
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
