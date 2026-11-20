import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ConfirmOptions = {
  title: string
  /** Rendered as pre-wrapped text; may include <code> elements for paths. */
  description?: ReactNode
  confirmText?: string
  destructive?: boolean
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(
  async () => true,
)

/** In-app replacement for native dialog.showMessageBox confirmations. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<
    (ConfirmOptions & { resolve: (value: boolean) => void }) | null
  >(null)

  const settle = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => setPending({ ...options, resolve }))

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) settle(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            {pending?.description && (
              <AlertDialogDescription asChild>
                <div className="text-left whitespace-pre-wrap [&_code]:bg-muted [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs">
                  {pending.description}
                </div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className={cn(pending?.destructive && buttonVariants({ variant: 'destructive' }))}
              onClick={() => settle(true)}
            >
              {pending?.confirmText ?? '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)
