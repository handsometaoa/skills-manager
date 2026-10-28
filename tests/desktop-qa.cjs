// Real Electron renderer + preload; mocked IPC data. Never accesses real Skill directories.
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
app.whenReady().then(async () => {
  const tools = [
    { id: 'claude', name: 'Claude Code', root: 'C:/Users/demo/.claude/skills' },
    { id: 'codex', name: 'Codex', root: 'C:/Users/demo/.agents/skills' },
    { id: 'zcode', name: 'ZCode', root: 'C:/Users/demo/.zcode/skills' }
  ]
  const definitions = [
    ['code-review', '检查代码变更中的正确性、回归风险与测试遗漏，输出有依据的审查结果。', 'all'],
    ['release-notes', '从提交记录整理版本变更，生成面向用户的发布说明。', 'all'],
    ['api-design', '设计清晰的接口契约，检查请求参数、错误响应与版本兼容。', 'all'],
    ['zcode-workflow', '为 ZCode 整理项目上下文、常用命令和工作流程。', 'zcode'],
    ['test-planning', '从需求和边界条件出发，制定可执行的测试方案。', 'all'],
    ['claude-commands', '维护 Claude Code 的专用命令与项目协作约定。', 'claude']
  ]
  let library = definitions.map(([name, description, compatibility], i) => ({ id: `library-${i}`, name, description, compatibility, toolId: 'library', path: `C:/Users/demo/AppData/Roaming/skill-manage/library/${i}/${name}`, managed: true, linked: false, warnings: [] }))
  let skills = [
    { ...library[0], id: 'installed-review', toolId: 'claude', libraryId: 'library-0', path: tools[0].root + '/code-review' },
    { ...library[1], id: 'installed-release', toolId: 'codex', libraryId: 'library-1', path: tools[1].root + '/release-notes' },
    { id: 'external-zcode', name: 'project-context', description: '整理当前工作区的目录结构、关键文件与团队约定。', toolId: 'zcode', managed: false, linked: false, path: tools[2].root + '/project-context', warnings: [] }
  ]
  const invocations = []
  const handler = (name, action) => ipcMain.handle(name, async (_event, ...args) => { invocations.push({ name, args }); return action(...args) })
  handler('scan', () => ({ tools, skills, library, libraryRoot: 'C:/Users/demo/AppData/Roaming/skill-manage/library', diagnostics: [] }))
  handler('library-install', (ids, targets) => {
    for (const id of ids) for (const target of targets) {
      const item = library.find(s => s.id === id)
      if (item.compatibility !== 'all' && item.compatibility !== target) throw new Error('工具专用')
      skills.push({ ...item, id: `${target}-${id}`, toolId: target, libraryId: id, path: tools.find(t => t.id === target).root + '/' + item.name })
    }
  })
  handler('library-collect', (id, compatibility) => {
    const item = skills.find(s => s.id === id)
    library.push({ ...item, id: 'collected', toolId: 'library', compatibility, source: item.path })
  })
  handler('pick-local', () => [{ path: '/fixture/local-skill', name: 'local-skill', description: '本地导入示例', warnings: [] }])
  handler('library-add', (_paths, compatibility) => library.push({ ...library[0], id: 'imported', name: 'local-skill', compatibility }))
  handler('skill-detail', id => ({ skill: [...library, ...skills].find(s => s.id === id), files: [{ path: 'SKILL.md', size: 400 }, { path: 'references/checklist.md', size: 50 }], truncated: false }))
  handler('skill-read-file', (_id, file) => file === 'SKILL.md' ? '---\nname: code-review\ndescription: 检查代码变更\n---\n# 代码审查\n\n检查正确性、回归风险与测试覆盖。\n\n## 检查步骤\n\n1. 阅读变更。\n2. 检查边界。\n\n| 检查项 | 要求 |\n| --- | --- |\n| 正确性 | 明确触发条件 |\n\n<script>window.pwned=true</script>\n\n![remote](https://example.com/tracking.png)' : '# 附属检查清单\n\n- 保留用户改动')
  const window = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: { preload: path.resolve('out/preload/index.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } })
  const errors = []
  window.webContents.on('console-message', (event) => { if (event.level === 'error') { errors.push(event.message); console.error(event.message) } })
  const evaluate = code => window.webContents.executeJavaScript(code)
  const wait = async code => {
    const deadline = Date.now() + 6000
    while (!await evaluate(code)) { if (Date.now() > deadline) throw new Error('Timeout: ' + code); await new Promise(resolve => setTimeout(resolve, 80)) }
  }
  const click = async text => {
    await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('Missing button: '+${JSON.stringify(text)}); b.click() })()`)
  }
  const screenshot = async name => {
    await evaluate('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))')
    await evaluate('Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))')
    await fs.writeFile(`out/qa/${name}.png`, (await window.webContents.capturePage()).toPNG())
  }
  await fs.mkdir('out/qa', { recursive: true })
  await window.loadFile(path.resolve('out/renderer/index.html'))
  await wait("document.querySelectorAll('.skill-row').length === 6")
  await wait("[...document.querySelectorAll('.tool-icon img')].every(i => i.complete && i.naturalWidth > 0)")
  await screenshot('library-redesign')
  await click('工具专用')
  if (await evaluate("document.querySelectorAll('.skill-row').length") !== 2) throw new Error('Specific filter failed')
  await click('全部技能')
  await evaluate("document.querySelector('[aria-label=\"选择 code-review\"]').click()")
  await click('选择安装目标')
  await wait("!!document.querySelector('.install-targets')")
  if (!(await evaluate("document.querySelector('[aria-label=\"安装到 Claude Code\"]').disabled"))) throw new Error('Existing target should be disabled')
  await evaluate("document.querySelector('[aria-label=\"安装到 Codex\"]').click()")
  await screenshot('install-redesign')
  await click('复制安装')
  await wait("!document.querySelector('.drawer')")
  if (!invocations.some(i => i.name === 'library-install' && i.args[0][0] === 'library-0' && i.args[1][0] === 'codex')) throw new Error('Central install IPC failed')
  await evaluate("[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Codex')).click()")
  await click('从仓库安装')
  if (await evaluate("document.querySelectorAll('.skill-row').length") !== 4) throw new Error('Tool compatibility filter failed')
  await evaluate("document.querySelector('[aria-label=\"选择 api-design\"]').click()")
  await screenshot('tool-redesign')
  await click('安装到 Codex')
  await wait("document.querySelector('.filter-tabs button.active').textContent.includes('已安装')")
  if (!skills.some(s => s.toolId === 'codex' && s.name === 'api-design')) throw new Error('Tool batch install failed')
  await evaluate("[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('ZCode')).click()")
  await click('收录')
  await wait("!!document.querySelector('.collect-preview')")
  if (await evaluate("document.querySelector('[aria-label=\"适用工具\"]').value") !== 'zcode') throw new Error('Collection default scope failed')
  await click('收入仓库')
  await wait("!document.querySelector('.drawer')")
  if (!library.some(s => s.name === 'project-context' && s.compatibility === 'zcode')) throw new Error('Collection failed')
  await evaluate("document.querySelector('.nav-item').click()")
  await click('添加 Skill')
  await screenshot('import-redesign')
  await evaluate("document.querySelector('.drop-zone').click()")
  await wait("!!document.querySelector('.candidate-option')")
  await click('收入仓库')
  await wait("!document.querySelector('.drawer')")
  if (!library.some(s => s.name === 'local-skill')) throw new Error('Local library import failed')
  await click('code-review')
  await wait("!!document.querySelector('.markdown-body table')")
  if (await evaluate("!!window.pwned || !!document.querySelector('.markdown-body script,.markdown-body img')")) throw new Error('Unsafe preview')
  await screenshot('viewer-redesign')
  await click('源码')
  if (!(await evaluate("document.querySelector('.source-code').textContent.includes('name: code-review')"))) throw new Error('Source view failed')
  await evaluate("[...document.querySelectorAll('.file-item')].find(b => b.textContent.includes('checklist')).click()")
  await wait("!!document.querySelector('.source-code')?.textContent.includes('附属检查清单')")
  await evaluate("document.querySelector('.skill-viewer').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
  await wait("!document.querySelector('.skill-viewer')")
  window.setSize(1020, 760)
  await screenshot('library-compact')
  if (await evaluate("document.documentElement.scrollWidth > window.innerWidth")) throw new Error('Horizontal overflow at minimum window size')
  library = []; skills = []
  await evaluate("document.querySelector('[aria-label=\"刷新列表\"]').click()")
  await wait("!!document.querySelector('.empty-state')")
  await screenshot('empty-redesign')
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('UI passed: library, scope filter, icons, multi-target install, tool selection, collection, local import, Markdown/source/files, compact layout, empty state')
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
