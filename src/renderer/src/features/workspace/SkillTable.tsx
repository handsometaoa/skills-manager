import { useState } from 'react'
import { FileText, FolderOpen, Download, Plus, Library } from 'lucide-react'
import type { DeployPlan, Skill } from '../../../../shared/types'
import { DeployDialog } from '../library/DeployDialog'
import { discoveredBy } from '../../../../shared/compatibility'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Skeleton } from '../../components/ui/skeleton'
import { SkillRow } from '../skills/SkillRow'
import { useConfirm } from '@/lib/confirm'
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
  const confirm = useConfirm()
  const [deploying, setDeploying] = useState<{ skill: Skill; plan: DeployPlan } | null>(null)
  const deploy = (skill: Skill, overwritePaths: string[]) =>
    void run(async () => {
      const result = await window.skills.deployUpdate(skill.id, overwritePaths)
      await refresh()
      setDeploying(null)
      setMessage({
        text: `已下发更新：${result.updated.length} 个副本${
          result.skipped.length ? `（跳过 ${result.skipped.length} 个）` : ''
        }`,
      })
    })
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
                void run(async () => {
                  setDeploying({ skill, plan: await window.skills.prepareDeploy(skill.id) })
                })
              }
              sync={() =>
                void (async () => {
                  const ok = await confirm({
                    title: `同步到主仓库：${skill.name}？`,
                    description: `将用此 Agent 副本的当前内容覆盖主仓库中的旧版本，包括文件新增、修改和删除。其他 Agent 副本不会自动更新。\n\n${skill.path}`,
                    confirmText: '确认同步',
                    destructive: true,
                  })
                  if (!ok) return
                  await run(async () => {
                    await window.skills.syncToLibrary(skill.id)
                    await refresh()
                  }, '已同步到主仓库；可继续下发更新到其他工具。')
                })()
              }
              compatibility={(value) =>
                void run(async () => {
                  await window.skills.setCompatibility(skill.id, value)
                  await refresh()
                }, '适用范围已更新。')
              }
              remove={() =>
                void (async () => {
                  const affected = data.tools
                    .filter((t) => discoveredBy(skill, t.id))
                    .map((t) => t.name)
                    .join('、')
                  const ok = await confirm(
                    skill.toolId === 'library'
                      ? {
                          title: `从仓库移出 ${skill.name}？`,
                          description: `仓库副本将移入应用回收站，各工具中已安装的副本保留。\n${skill.path}`,
                          confirmText: '确认移出仓库',
                          destructive: true,
                        }
                      : {
                          title: `${skill.managed ? '卸载' : '删除'} ${skill.name}？`,
                          description: `整个目录将移入应用回收站，${
                            skill.managed ? '还原后恢复管理关联' : '包括手动新增或修改过的文件'
                          }。\n读取此目录的工具：${affected}\n\n${skill.path}`,
                          confirmText: '确认移入回收站',
                          destructive: true,
                        },
                  )
                  if (!ok) return
                  await run(async () => {
                    if (skill.toolId === 'library') await window.skills.deleteLibrary(skill.id)
                    else if (skill.managed) await window.skills.uninstall(skill.id)
                    else await window.skills.deleteExternal(skill.id)
                    await refresh()
                    setSelected(selected.filter((id) => id !== skill.id))
                  }, '已移入回收站，可在左侧回收站还原。')
                })()
              }
            />
          ))}
        </div>
      ) : null}
      {deploying && (
        <DeployDialog
          skill={deploying.skill}
          plan={deploying.plan}
          tools={data.tools}
          busy={busy}
          onClose={() => setDeploying(null)}
          onConfirm={(paths) => deploy(deploying.skill, paths)}
        />
      )}
      {!initial && !items.length && (
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
