import { FileText, FolderOpen, Download, Plus, Library } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Skeleton } from '../../components/ui/skeleton'
import { SkillRow } from '../skills/SkillRow'
import type { WorkspaceController } from './useWorkspace'

const GRID = 'grid grid-cols-[minmax(0,1fr)_180px_220px_210px] items-center gap-3 px-3 py-2.5'

export function SkillTable({ workspace }: { workspace: WorkspaceController }) {
  const {
    data,
    tab,
    query,
    busy,
    initial,
    setInstalling,
    setDirect,
    selected,
    setSelected,
    setMessage,
    refresh,
    run,
    navigate,
    changeTab,
    isLibrary,
    tool,
    items,
    canSelect,
    selectables,
    toggle,
    view,
    openImport,
    installCurrent,
  } = workspace
  return (
    <section
      className="skill-table overflow-hidden rounded-xl border bg-card"
      aria-label={isLibrary ? '仓库技能' : '工具技能'}
    >
      <div className={`${GRID} border-b text-muted-foreground text-xs font-medium`}>
        <div className="flex min-w-0 items-center gap-2.5">
          {(isLibrary || tab === 'available') && (
            <Checkbox
              aria-label="选择当前列表全部技能"
              disabled={busy || !selectables.length}
              checked={!!selectables.length && selectables.every((s) => selected.includes(s.id))}
              onCheckedChange={(checked) =>
                setSelected(
                  checked
                    ? Array.from(new Set([...selected, ...selectables.map((s) => s.id)]))
                    : selected.filter((id) => !selectables.some((s) => s.id === id)),
                )
              }
            />
          )}
          <span>技能 / 描述</span>
        </div>
        <span>{isLibrary || tab === 'available' ? '适用范围' : '归属 / 管理方式'}</span>
        <span>{isLibrary ? '工具发现状态' : tab === 'available' ? '当前状态' : '仓库状态'}</span>
        <span className="text-right">操作</span>
      </div>
      {initial ? (
        <div className="divide-y">
          {[1, 2, 3].map((n) => (
            <div className={`${GRID} py-4`} key={n}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : items.length ? (
        <div className="divide-y">
          {items.map((skill) => (
            <SkillRow
              key={skill.id}
              grid={GRID}
              skill={skill}
              tools={data.tools}
              installed={data.skills}
              library={data.library}
              selectable={canSelect(skill)}
              selected={selected.includes(skill.id)}
              busy={busy}
              available={!isLibrary && tab === 'available'}
              own={workspace.own.includes(skill)}
              currentTool={tool?.name}
              toggle={() => toggle(skill.id)}
              view={() => view(skill)}
              install={() => {
                if (!isLibrary) installCurrent([skill.id])
                else {
                  setDirect(undefined)
                  setInstalling([skill])
                }
              }}
              collect={() => openImport(skill)}
              open={() =>
                void run(async () => {
                  await window.skills.openPath(skill.path)
                })
              }
              copy={() => {
                setDirect(skill)
                setInstalling([skill])
              }}
              deploy={() =>
              void run(
                async () => {
                  const result = await window.skills.deployUpdate(skill.id)
                  await refresh()
                  setMessage({
                    text: `已下发更新：${result.updated.length} 个工具${
                      result.skipped.length ? `（跳过 ${result.skipped.length} 个）` : ''
                    }`,
                  })
                },
              )
            }
            compatibility={(value) =>
                void run(async () => {
                  await window.skills.setCompatibility(skill.id, value)
                  await refresh()
                }, '适用范围已更新。')
              }
              remove={() =>
                void run(
                  async () => {
                    if (skill.toolId === 'library') await window.skills.deleteLibrary(skill.id)
                    else if (skill.managed) await window.skills.uninstall(skill.id)
                    else await window.skills.deleteExternal(skill.id)
                    await refresh()
                    setSelected(selected.filter((id) => id !== skill.id))
                  },
                  skill.toolId === 'library'
                    ? '已移入回收站，各工具中的副本保留。'
                    : '已移入回收站，可在左侧回收站还原。',
                )
              }
            />
          ))}
        </div>
      ) : (
        <div className="empty-state flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-xl">
            {isLibrary ? (
              <Library className="size-6" />
            ) : tab === 'available' ? (
              <Download className="size-6" />
            ) : (
              <FileText className="size-6" />
            )}
          </span>
          <h2 className="text-base font-semibold">
            {query
              ? '没有找到匹配的 Skill'
              : !isLibrary && tab === 'installed' && workspace.ownership !== 'all'
                ? workspace.ownership === 'own'
                  ? '还没有自己的 Skill'
                  : '还没有共享 Skill'
                : isLibrary
                  ? '把你的第一个 Skill 收进来'
                  : tab === 'available'
                    ? '仓库里还没有适用的 Skill'
                    : '这里还没有安装 Skill'}
          </h2>
          <p className="text-muted-foreground max-w-md text-sm">
            {query
              ? '换个关键词，或清除搜索条件。'
              : !isLibrary && tab === 'installed' && workspace.ownership === 'shared'
                ? '当前没有从其他共享或兼容目录发现的 Skill。'
                : isLibrary
                  ? '从本地、Git 仓库导入，或到工具页面收录已有技能。'
                  : tab === 'available'
                    ? '先添加通用技能，或标记为这个工具专用。'
                    : '从仓库选择需要的工作方法，按需复制安装。'}
          </p>
          {!query && (
            <Button
              disabled={busy}
              onClick={() =>
                isLibrary
                  ? openImport()
                  : tab === 'installed'
                    ? changeTab('available')
                    : navigate('library')
              }
            >
              {isLibrary ? <Plus /> : <FolderOpen />}
              {isLibrary ? '添加 Skill' : tab === 'installed' ? '浏览中央仓库' : '前往中央仓库'}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
