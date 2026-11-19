import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from './sheet'

/** Right-side form panel built on Radix Sheet; blocks closing while busy. */
export function SheetPanel({
  title,
  subtitle,
  busy,
  onClose,
  children,
  footer,
}: {
  title: string
  subtitle: string
  busy: boolean
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <SheetContent className="flex gap-0 p-0 sm:max-w-lg" showCloseButton={!busy}>
        <SheetHeader className="gap-1 border-b px-5 py-4">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-6">{children}</div>
        </div>
        <SheetFooter className="border-t flex-row items-center justify-between bg-muted/40 px-5 py-3">
          {footer}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
