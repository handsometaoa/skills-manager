import type { Compatibility, Skill, Tool } from '../../../../shared/types'
import { discoveredBy } from '../../../../shared/compatibility'
import {
  BadgeCheck,
  Check,
  Copy,
  Download,
  Ellipsis,
  FolderOpen,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { Badge } from '../../components/ui/badge'
import { ToolIcon } from '../../components/ui/Icons'
import { CompatibilitySelect } from '../library/CompatibilitySelect'
import { cn } from '@/lib/utils'

interface Props {
  grid: string
  skill: Skill
  tools: Tool[]
  installed: Skill[]
  library: Skill[]
  selectable: boolean
  selected: boolean
  busy: boolean
  available: boolean
  own: boolean
  currentTool?: string
  toggle: () => void
  view: () => void
  install: () => void
  collect: () => void
  open: () => void
  remove: () => void
  copy: () => void
  compatibility: (value: Compatibility) => void
  /** Deploys the current library content to every linked installation. */
  deploy: () => void
}
export function SkillRow({
  grid,
  skill,
  tools,
  installed,
  library,
  selectable,
  selected,
  busy,
  available,
  own,
  currentTool,
  toggle,
  view,
  install,
  collect,
  open,
  remove,
  copy,
  compatibility,
  deploy,
}: Props) {
  const central = skill.toolId === 'library'
  const conflict = available && !selectable
  return (
    <article className={cn('skill-row', grid, selected && 'bg-accent/50')}>
      <div className="flex min-w-0 items-center gap-3">
        {(central || available) && (
          <Checkbox
            aria-label={`选择 ${skill.name}`}
            disabled={busy || !selectable}
            checked={selected}
            onCheckedChange={toggle}
          />
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          title={`查看 ${skill.name}`}
          disabled={busy}
          onClick={view}
        >
          <SkillDocumentIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <button
            className="truncate text-sm font-medium hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={view}
            title={skill.name}
          >
            {skill.name}
          </button>
          <p className="text-muted-foreground truncate-2 text-xs" title={skill.description}>
            {skill.description}
          </p>
          {skill.warnings.length > 0 && (
            <span
              className="text-warning mt-0.5 inline-flex items-center gap-1 text-xs text-amber-500"
              title={skill.warnings.join('\n')}
            >
              <TriangleAlert className="size-3" />
              {skill.warnings.length} 条格式提醒
            </span>
          )}
        </div>
      </div>
      <div className="min-w-0">
        {central ? (
          <Badge variant={skill.compatibility === 'all' ? 'secondary' : 'outline'}>
            {skill.compatibility === 'all' ? (
              '通用'
            ) : (
              <>
                {skill.compatibility?.length === 1 && (
                  <ToolIcon id={skill.compatibility[0]} small />
                )}
                <span
                  title={tools
                    .filter((t) => skill.compatibility?.includes(t.id))
                    .map((t) => t.name)
                    .join('、')}
                >
                  {skill.compatibility?.length === 1
                    ? tools.find((t) => t.id === skill.compatibility?.[0])?.name
                    : `${skill.compatibility?.length} 个工具`}
                </span>
              </>
            )}
          </Badge>
        ) : (
          <div
            className="min-w-0"
            title={`${skill.path}\n读取工具：${tools
              .filter((t) => discoveredBy(skill, t.id))
              .map((t) => t.name)
              .join('、')}`}
          >
            <span className="flex items-center gap-1 text-xs font-medium">
              {own ? (
                <>
                  <FolderOpen className="size-3.5" />
                  自己的 Skill
                </>
              ) : (
                <>
                  <BadgeCheck className="size-3.5" />
                  共享 Skill
                </>
              )}
            </span>
            <small className="text-muted-foreground block truncate text-xs">
              {skill.managed ? '应用管理' : '外部已有'}
              {skill.linked && ' · 链接'}
            </small>
            <small className="text-muted-foreground block truncate text-xs">
              {own
                ? `位于 ${currentTool} 目录`
                : `来自 ${tools.find((t) => t.root.replaceAll('\\', '/') === skill.path.replaceAll('\\', '/').slice(0, -(skill.name.length + 1)))?.name ?? '兼容目录'}`}
            </small>
          </div>
        )}
      </div>
      <div className="min-w-0">
        {central && !available ? (
          <div className="flex items-center gap-1.5">
            {tools.map((t) => {
              const match = installed.find((i) => discoveredBy(i, t.id) && i.libraryId === skill.id)
              const sameName = installed.some(
                (i) => discoveredBy(i, t.id) && i.name.toLowerCase() === skill.name.toLowerCase(),
              )
              return (
                <span
                  key={t.id}
                  className="relative"
                  title={`${t.name}：${match ? ((match.installedBy ?? match.toolId) === t.id ? '从此仓库安装' : '通过共享 / 兼容目录可发现') : sameName ? '存在同名 Skill，未关联' : '未发现'}`}
                >
                  {/* Deployed keeps full colour; everything else recedes to a
                      muted grayscale tile so dark mode stays readable. */}
                  <ToolIcon
                    id={t.id}
                    small
                    className={match ? '' : 'bg-muted grayscale opacity-50'}
                  />
                  {match && (
                    <i className="bg-emerald-500 absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background" />
                  )}
                </span>
              )
            })}
          </div>
        ) : available ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              conflict ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400',
            )}
          >
            {conflict ? (
              <>
                <Check className="size-3.5" />
                已发现 / 同名
              </>
            ) : (
              '可安装'
            )}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            {library.some((s) => s.id === skill.libraryId)
              ? '已关联仓库'
              : library.some((s) => s.source === skill.path)
                ? '已收入仓库'
                : '未收录'}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" disabled={busy} onClick={view}>
          查看
        </Button>
        <Button
          size="sm"
          variant={central ? 'default' : 'outline'}
          disabled={busy || (central ? !!conflict : skill.linked)}
          onClick={central ? install : collect}
        >
          {central ? conflict ? <Check /> : <Download /> : <Copy />}
          {central ? (conflict ? '已存在' : '安装') : '收录'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${skill.name} 更多操作`}
              disabled={busy}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={open}>
              <FolderOpen />
              打开目录
            </DropdownMenuItem>
            {central ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>适用范围</DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <CompatibilitySelect
                    value={skill.compatibility!}
                    tools={tools}
                    disabled={busy}
                    onChange={compatibility}
                  />
                </div>
              </>
            ) : (
              <DropdownMenuItem disabled={busy || skill.linked} onClick={copy}>
                <Copy />
                复制到其他工具
              </DropdownMenuItem>
            )}
            {central && installed.some((i) => i.libraryId === skill.id) && (
              <DropdownMenuItem onClick={deploy}>
                <RefreshCw />
                下发更新到工具
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={busy || skill.linked}
              onClick={remove}
            >
              <Trash2 />
              {central ? '移出仓库' : '移入回收站'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  )
}

function SkillDocumentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3h9l5 5v13H5z" fill="currentColor" fillOpacity=".12" />
      <path d="M14 3v6h5M8 13h8M8 17h5" />
    </svg>
  )
}
