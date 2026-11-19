import { Library, Search, Users, X } from 'lucide-react'
import type { ToolId } from '../../../../shared/types'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'
import type { WorkspaceController } from './useWorkspace'

export function WorkspaceToolbar({ workspace }: { workspace: WorkspaceController }) {
  const {
    data,
    tab,
    query,
    setQuery,
    setScope,
    setSelected,
    changeTab,
    isLibrary,
    installed,
    available,
    scope,
    ownership,
    setOwnership,
    own,
    shared,
  } = workspace
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isLibrary ? (
          <div className="flex items-center gap-2" aria-label="适用范围筛选">
            <Tabs
              value={scope === 'any' || scope === 'all' ? scope : 'specific'}
              onValueChange={(value) => {
                setScope(value as 'any' | 'all' | 'specific')
                setSelected([])
              }}
            >
              <TabsList>
                <TabsTrigger value="any">全部技能</TabsTrigger>
                <TabsTrigger value="all">通用</TabsTrigger>
                <TabsTrigger value="specific">工具专用</TabsTrigger>
              </TabsList>
            </Tabs>
            {scope !== 'any' && scope !== 'all' && (
              <Select
                aria-label="筛选专用工具"
                value={scope}
                onValueChange={(value) => {
                  setScope(value as ToolId | 'specific')
                  setSelected([])
                }}
              >
                <SelectTrigger className="w-40" aria-label="筛选专用工具">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="specific">全部工具</SelectItem>
                  {data.tools.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(value) => changeTab(value as typeof tab)}
            aria-label="工具技能视图"
          >
            <TabsList>
              <TabsTrigger value="installed">
                已发现 <span className="tabular-nums opacity-60">{installed.length}</span>
              </TabsTrigger>
              <TabsTrigger value="available">
                从仓库选择 <span className="tabular-nums opacity-60">{available.length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="relative w-64">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            aria-label="搜索技能"
            placeholder="搜索名称或描述…"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="清除搜索"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={() => setQuery('')}
            >
              <X />
            </Button>
          )}
        </div>
      </div>
      {!isLibrary && tab === 'installed' && (
        <div
          className="ownership-filters flex flex-wrap items-center gap-2"
          aria-label="技能归属筛选"
        >
          {(
            [
              ['all', Library, '全部', installed.length],
              ['own', Library, '自己的 Skill', own.length],
              ['shared', Users, '共享 Skill', shared.length],
            ] as const
          ).map(([value, Icon, label, count]) => (
            <Button
              key={value}
              variant={ownership === value ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={ownership === value}
              className="text-xs"
              onClick={() => setOwnership(value)}
            >
              <Icon className="size-3.5" />
              {label}
              <span className="text-muted-foreground tabular-nums">{count}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
