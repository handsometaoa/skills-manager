import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Save } from 'lucide-react'
import type { SkillDetail, SkillFile } from '../../../../shared/types'
import { CodeBlock, languageOf } from '../../components/ui/CodeBlock'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Textarea } from '../../components/ui/textarea'
import { ToolIcon } from '../../components/ui/Icons'
import { cleanError } from '../../lib/errors'
import { cn } from '@/lib/utils'

interface FileNode {
  name: string
  path: string
  size?: number
  children?: FileNode[]
}

/** Builds an IDEA-style hierarchy from the flat file list; SKILL.md stays pinned on top. */
function buildFileTree(files: SkillFile[]): FileNode[] {
  const root: FileNode = { name: '', path: '', children: [] }
  for (const file of files) {
    const parts = file.path.split('/')
    let node = root
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/')
      let child = node.children?.find((candidate) => candidate.name === part)
      if (!child) {
        child =
          index === parts.length - 1
            ? { name: part, path, size: file.size }
            : { name: part, path, children: [] }
        node.children!.push(child)
      }
      node = child
    })
  }
  const sort = (nodes: FileNode[]): FileNode[] =>
    nodes
      .map((node) => (node.children ? { ...node, children: sort(node.children) } : node))
      .sort((a, b) => {
        if (a.path === 'SKILL.md') return -1
        if (b.path === 'SKILL.md') return 1
        const directoryGap = Number(!!b.children) - Number(!!a.children)
        return directoryGap !== 0 ? directoryGap : a.name.localeCompare(b.name)
      })
  return sort(root.children ?? [])
}

function TreeItem({
  node,
  depth,
  selected,
  collapsed,
  onToggle,
  onSelect,
}: {
  node: FileNode
  depth: number
  selected: string
  collapsed: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}) {
  const directory = !!node.children
  const open = !collapsed.has(node.path)
  return (
    <>
      <button
        title={`${node.path} · ${node.size ?? ''} 字节`}
        className={cn(
          'file-item hover:bg-accent flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs transition-colors',
          selected === node.path && 'bg-accent font-medium',
        )}
        style={{ paddingLeft: depth * 14 + 6 }}
        onClick={() => (directory ? onToggle(node.path) : onSelect(node.path))}
      >
        {directory ? (
          open ? (
            <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
          )
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        {directory ? (
          open ? (
            <FolderOpen className="text-muted-foreground size-3.5 shrink-0" />
          ) : (
            <Folder className="text-muted-foreground size-3.5 shrink-0" />
          )
        ) : (
          <FileText className="text-muted-foreground size-3.5 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {directory && open && (
        <div className="border-border/60 ml-[13px] border-l">
          {node.children!.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </>
  )
}

export function SkillViewer({
  detail,
  toolName,
  onClose,
  onSaved,
  access,
}: {
  detail: SkillDetail
  toolName: string
  onClose: () => void
  onSaved?: () => void
  /** Bound file access for skills outside the store (project page). */
  access?: {
    read: (relativePath: string) => Promise<string>
    write: (relativePath: string, content: string) => Promise<void>
  }
}) {
  // Keep the bound access in a ref so reads/writes always use the latest
  // binding without refetching on every render.
  const accessRef = useRef(access)
  accessRef.current = access
  const [file, setFile] = useState('SKILL.md')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'preview' | 'source' | 'edit'>('preview')
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // IDEA-style resizable file tree: drag the divider, double-click to reset.
  const [treeWidth, setTreeWidth] = useState(224)
  const dragStart = useRef<{ x: number; width: number } | null>(null)
  const [resizing, setResizing] = useState(false)
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    dragStart.current = { x: event.clientX, width: treeWidth }
    setResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveResize = (event: React.PointerEvent) => {
    if (!dragStart.current) return
    const width = dragStart.current.width + (event.clientX - dragStart.current.x)
    setTreeWidth(Math.min(420, Math.max(170, width)))
  }
  const endResize = (event: React.PointerEvent) => {
    dragStart.current = null
    setResizing(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
  // Pending guarded action while unsaved edits would be lost.
  const [pending, setPending] = useState<
    { type: 'close' } | { type: 'file'; file: string; toMode?: boolean } | null
  >(null)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setContent('')
    setDraft('')
    setDirty(false)
    const request = accessRef.current
      ? accessRef.current.read(file)
      : window.skills.readFile(detail.skill.id, file)
    request
      .then((text) => {
        if (active) setContent(text)
      })
      .catch((e) => {
        if (active) setError(cleanError(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [detail.skill.id, file])
  useEffect(() => {
    if (!loading) setDraft(content)
  }, [loading, content])
  const markdown = /\.(md|markdown)$/i.test(file)
  const body =
    file === 'SKILL.md'
      ? content.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
      : content
  const openFile = (next: string) => {
    if (next === file) return
    if (dirty) setPending({ type: 'file', file: next })
    else setFile(next)
  }
  const switchMode = (next: 'preview' | 'source' | 'edit') => {
    if (next === mode) return
    if (dirty && next !== 'edit') {
      setPending({ type: 'file', file, toMode: true })
      return
    }
    setMode(next)
  }
  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      const request = accessRef.current
        ? accessRef.current.write(file, draft)
        : window.skills.writeFile(detail.skill.id, file, draft)
      await request
      setContent(draft)
      setDirty(false)
      toast.success(`已保存 ${file}`)
      if (!accessRef.current && file === 'SKILL.md') onSaved?.()
    } catch (e) {
      toast.error(cleanError(e))
    } finally {
      setSaving(false)
    }
  }
  const tree = buildFileTree(detail.files)
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) {
            if (dirty) setPending({ type: 'close' })
            else onClose()
          }
        }}
      >
        <DialogContent className="skill-viewer flex h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              {detail.skill.name}
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
                <ToolIcon
                  id={detail.skill.toolId === 'library' ? 'library' : detail.skill.toolId}
                  small
                />
                {toolName} · {mode === 'edit' ? '编辑模式' : '只读浏览'}
              </span>
            </DialogTitle>
            <DialogDescription className="truncate text-xs">
              {detail.skill.description} · {detail.skill.path}
            </DialogDescription>
          </DialogHeader>
          {(detail.skill.discoveredBy?.length ?? 0) > 1 || detail.skill.warnings.length > 0 ? (
            <div className="text-amber-600 dark:text-amber-400 border-b bg-amber-500/10 px-5 py-2 text-xs">
              {(detail.skill.discoveredBy?.length ?? 0) > 1 && (
                <p>此目录被多个工具读取。卸载或删除会同时影响这些工具中的发现结果。</p>
              )}
              {detail.skill.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          ) : null}
          <div className={cn('flex min-h-0 flex-1', resizing && 'cursor-col-resize select-none')}>
            <nav
              className="shrink-0 overflow-y-auto p-3"
              style={{ width: treeWidth }}
              aria-label="Skill 文件"
            >
              <div className="text-muted-foreground px-1 pb-1 text-xs font-medium">
                文件 <span>{detail.files.length}</span>
              </div>
              <div className="space-y-0.5">
                {tree.map((node) => (
                  <TreeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    selected={file}
                    collapsed={collapsed}
                    onToggle={(path) =>
                      setCollapsed((current) => {
                        const next = new Set(current)
                        if (next.has(path)) next.delete(path)
                        else next.add(path)
                        return next
                      })
                    }
                    onSelect={openFile}
                  />
                ))}
              </div>
              {detail.truncated && (
                <p className="text-muted-foreground px-1 pt-2 text-xs">
                  目录较大，仅显示部分文件。
                </p>
              )}
            </nav>
            <div
              className="hover:bg-primary/20 app-region-no-drag relative w-1 shrink-0 cursor-col-resize bg-transparent transition-colors"
              title="拖动调整宽度，双击恢复默认"
              onPointerDown={startResize}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onDoubleClick={() => setTreeWidth(224)}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
                <strong className="truncate text-sm" title={file}>
                  {file}
                  {dirty && <span className="ml-1 text-amber-500">●</span>}
                </strong>
                <Tabs value={mode} onValueChange={(value) => switchMode(value as typeof mode)}>
                  <TabsList className="h-7">
                    <TabsTrigger className="text-xs" value="preview">
                      预览
                    </TabsTrigger>
                    <TabsTrigger className="text-xs" value="source">
                      源码
                    </TabsTrigger>
                    <TabsTrigger className="text-xs" value="edit">
                      编辑
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
                {loading ? (
                  <div className="text-muted-foreground p-6 text-sm">正在读取文件…</div>
                ) : error ? (
                  <div className="text-destructive bg-destructive/10 m-4 rounded-lg p-3 text-sm">
                    {error}
                  </div>
                ) : mode === 'edit' ? (
                  <Textarea
                    aria-label="编辑文件内容"
                    className="h-full min-h-0 w-full resize-none rounded-none border-0 font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0"
                    value={draft}
                    disabled={saving}
                    onChange={(e) => {
                      setDraft(e.target.value)
                      setDirty(e.target.value !== content)
                    }}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                        e.preventDefault()
                        void save()
                      }
                    }}
                  />
                ) : mode === 'preview' && markdown ? (
                  <div className="markdown-body prose prose-sm dark:prose-invert mx-auto max-w-3xl p-6">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      skipHtml
                      components={{
                        a: ({ children, href }) => (
                          <span title={href} className="cursor-help underline decoration-dotted">
                            {children}
                          </span>
                        ),
                        img: ({ alt }) => (
                          <span className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
                            图片：{alt || '未命名图片'}（请在目录中查看）
                          </span>
                        ),
                        pre: ({ children }) => <>{children}</>,
                        code: ({ className, children }) => {
                          const match = /language-([\w-]+)/.exec(className ?? '')
                          if (!match)
                            return (
                              <code className="bg-muted rounded px-1 py-0.5 text-[0.85em]">
                                {children}
                              </code>
                            )
                          return (
                            <CodeBlock
                              code={String(children)}
                              language={match[1]}
                              className="bg-muted/50 my-2 overflow-x-auto rounded-lg py-2"
                            />
                          )
                        },
                      }}
                    >
                      {body || '此文件暂无正文内容。'}
                    </Markdown>
                  </div>
                ) : (
                  <CodeBlock
                    code={content || '（空文件）'}
                    language={languageOf(file)}
                    className="m-4 overflow-x-auto rounded-lg py-2"
                  />
                )}
              </div>
            </div>
          </div>
          {mode === 'edit' && (
            <div className="text-muted-foreground flex items-center justify-between border-t px-5 py-2.5 text-xs">
              <span>Ctrl+S 保存</span>
              <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
                <Save />
                {saving ? '正在保存…' : dirty ? '保存' : '已保存'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>
              {file} 有未保存的修改，继续将丢失这些内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDirty(false)
                if (pending?.type === 'close') onClose()
                else if (pending?.type === 'file') {
                  if (pending.file !== file) setFile(pending.file)
                  else setMode('preview')
                }
                setPending(null)
              }}
            >
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
