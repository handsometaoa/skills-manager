import { Highlight, themes } from 'prism-react-renderer'

const LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  css: 'css',
  scss: 'scss',
  html: 'markup',
  svg: 'markup',
  xml: 'markup',
  go: 'go',
  sql: 'sql',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  diff: 'diff',
  patch: 'diff',
  toml: 'toml',
}

/** Maps a file name to a Prism language; unknown types render as plain text. */
export function languageOf(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGES[extension] ?? 'markup'
}

/** Syntax-highlighted code block with IDEA-style line numbers. */
export function CodeBlock({
  code,
  language,
  className = '',
}: {
  code: string
  language: string
  className?: string
}) {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return (
    <Highlight
      code={code.replace(/\n$/, '') || ' '}
      language={language}
      theme={isDark ? themes.oneDark : themes.vsLight}
    >
      {({ className: highlightClass, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={`source-code text-xs leading-relaxed ${highlightClass} ${className}`}
          style={{ ...style, background: 'transparent' }}
        >
          {tokens.map((line, index) => (
            <div key={index} {...getLineProps({ line })} className="flex px-4">
              <span className="text-muted-foreground/60 w-8 shrink-0 select-none pr-3 text-right tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </span>
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}
