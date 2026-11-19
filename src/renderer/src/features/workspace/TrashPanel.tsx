import { FileText, RotateCcw, Search, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import type { WorkspaceController } from './useWorkspace'

export function TrashPanel({ workspace }: { workspace: WorkspaceController }) {
  const { data, busy, query, setQuery, run, refresh } = workspace
  const entries = data.trash.filter((entry) =>
    `${entry.skill.name} ${entry.skill.description} ${entry.originalPath}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  return (
    <>
      <div className="mb-3 flex justify-end">
        <div className="relative w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            aria-label="搜索回收站"
            placeholder="搜索名称、描述或原位置…"
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <section className="overflow-hidden rounded-xl border bg-card" aria-label="回收站技能">
        {entries.length ? (
          <div className="divide-y">
            {entries.map((entry) => (
              <article className="trash-row flex items-center gap-3 px-3 py-3" key={entry.id}>
                <span className="text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md border bg-card">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{entry.skill.name}</strong>
                  <p className="text-muted-foreground truncate-2 text-xs">
                    {entry.skill.description}
                  </p>
                  <code
                    className="text-muted-foreground mt-0.5 block truncate text-xs"
                    title={entry.originalPath}
                  >
                    {entry.originalPath}
                  </code>
                  <small className="text-muted-foreground block text-xs">
                    {entry.skill.toolId === 'library'
                      ? '中央仓库'
                      : data.tools.find((tool) => tool.id === entry.skill.toolId)?.name}{' '}
                    · 删除于 {new Date(entry.deletedAt).toLocaleString('zh-CN')}
                  </small>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await window.skills.restoreTrash(entry.id)
                        await refresh()
                      }, '已还原到原位置。')
                    }
                  >
                    <RotateCcw />
                    还原
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await window.skills.deleteTrash(entry.id)
                        await refresh()
                      }, '已永久删除。')
                    }
                  >
                    <Trash2 />
                    永久删除
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-xl">
              <Trash2 className="size-6" />
            </span>
            <h2 className="text-base font-semibold">
              {query ? '没有找到匹配的 Skill' : '回收站空空的'}
            </h2>
            <p className="text-muted-foreground max-w-md text-sm">
              {query
                ? '换个关键词试试。'
                : '从仓库或目标工具删除的 Skill 会出现在这里，随时可以还原。'}
            </p>
          </div>
        )}
      </section>
      <div className="text-muted-foreground mt-4 text-xs">{entries.length} 个 Skill</div>
    </>
  )
}
