import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icons'

export function Drawer({ title, subtitle, busy, onClose, children, footer }: { title: string; subtitle: string; busy: boolean; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const busyRef = useRef(busy)
  busyRef.current = busy
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => previous?.focus()
  }, [])
  return <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="drawer-title" className="drawer" onKeyDown={event => {
    if (event.key === 'Escape' && !busyRef.current) closeRef.current()
    if (event.key === 'Tab') {
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}><div className="drawer-header"><div><span className="section-label">Skills Manager</span><h2 id="drawer-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="关闭面板" disabled={busy} onClick={onClose}><Icon name="close"/></button></div><div className="drawer-content">{children}</div><div className="drawer-footer">{footer}</div></section></div>
}
