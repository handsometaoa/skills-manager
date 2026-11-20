import { FolderGit2, Library, Settings, Trash2 } from 'lucide-react'
import { ToolIcon } from '../ui/Icons'
import type { WorkspaceController } from '../../features/workspace/useWorkspace'
import { cn } from '@/lib/utils'
import { isMac } from '../../lib/platform'
import { discoveredBy } from '../../../../shared/compatibility'

function NavItem({
  active,
  onClick,
  icon,
  label,
  count,
  className,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
  className?: string
}) {
  return (
    <button
      className={cn(
        'nav-item flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        className,
      )}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
            active ? 'bg-background text-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function Sidebar({
  data,
  page,
  isLibrary,
  navigate,
}: Pick<WorkspaceController, 'data' | 'page' | 'isLibrary' | 'navigate'>) {
  return (
    <aside
      className={cn(
        'relative flex w-(--sidebar-width) shrink-0 flex-col gap-4 border-r bg-sidebar p-3 text-sidebar-foreground',
        // Keep clear of the macOS traffic lights inset into the title bar.
        isMac && 'pt-10',
      )}
    >
      {/* macOS only: the strip above the brand stays a window-drag zone
          around the traffic lights; the rest of the sidebar must stay clickable. */}
      {isMac && <div className="app-region-drag absolute inset-x-0 top-0 h-10" />}
      <div className="flex items-center gap-2.5 px-1.5 py-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Library className="size-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold">Skills Manager</div>
          <div className="text-muted-foreground truncate text-xs">个人技能工作台</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1" aria-label="工作空间">
        <NavItem
          active={isLibrary}
          onClick={() => navigate('library')}
          icon={<ToolIcon id="library" small />}
          label="中央仓库"
          count={data.library.length}
        />
      </nav>

      <div className="flex flex-col gap-1">
        <div className="text-muted-foreground flex items-center justify-between px-2.5 pb-1 text-xs font-medium">
          安装目标
          <span>{data.tools.length}</span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="AI 工具">
          {data.tools.map((t) => (
            <NavItem
              key={t.id}
              active={page === t.id}
              onClick={() => navigate(t.id)}
              icon={<ToolIcon id={t.id} small />}
              label={t.name}
              count={data.skills.filter((s) => discoveredBy(s, t.id)).length}
            />
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-muted-foreground px-2.5 pb-1 text-xs font-medium">项目</div>
        <NavItem
          active={page === 'project'}
          onClick={() => navigate('project')}
          icon={<FolderGit2 className="text-muted-foreground size-4" />}
          label="项目 Skill"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-muted-foreground px-2.5 pb-1 text-xs font-medium">系统</div>
        <NavItem
          active={page === 'trash'}
          onClick={() => navigate('trash')}
          icon={<Trash2 className="text-muted-foreground size-4" />}
          label="回收站"
          count={data.trash.length}
          className="trash-nav"
        />
        <NavItem
          active={page === 'settings'}
          onClick={() => navigate('settings')}
          icon={<Settings className="text-muted-foreground size-4" />}
          label="设置"
        />
      </div>

      <div className="mt-auto">
        <div className="text-muted-foreground flex items-center gap-1.5 px-1.5 text-xs">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          本地存储 <span>v2.0</span>
        </div>
      </div>
    </aside>
  )
}
