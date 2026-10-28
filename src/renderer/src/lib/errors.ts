export function cleanError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': Error: /,
    '',
  )
}
