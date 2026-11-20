// Real Electron renderer + preload; mocked IPC data. Never accesses real Skill directories.
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
app
  .whenReady()
  .then(async () => {
    const tools = [
      { id: 'claude', name: 'Claude Code', root: 'C:/Users/demo/.claude/skills' },
      { id: 'codex', name: 'Codex', root: 'C:/Users/demo/.agents/skills' },
      { id: 'zcode', name: 'ZCode', root: 'C:/Users/demo/.zcode/skills' },
      { id: 'cursor', name: 'Cursor', root: 'C:/Users/demo/.cursor/skills' },
      { id: 'qoder', name: 'Qoder', root: 'C:/Users/demo/.qoder/skills' },
      { id: 'opencode', name: 'OpenCode', root: 'C:/Users/demo/.config/opencode/skills' },
      { id: 'gemini', name: 'Gemini CLI', root: 'C:/Users/demo/.gemini/skills' },
      { id: 'copilot', name: 'GitHub Copilot', root: 'C:/Users/demo/.copilot/skills' },
    ]
    for (const tool of tools) {
      tool.discoveryRoots = [tool.root]
      tool.instructions = '请刷新技能列表或开启新会话。'
      if (['cursor', 'opencode', 'gemini', 'copilot'].includes(tool.id))
        tool.discoveryRoots.push(tools[1].root)
      if (['cursor', 'opencode'].includes(tool.id)) tool.discoveryRoots.push(tools[0].root)
    }
    const definitions = [
      ['code-review', '检查代码变更中的正确性、回归风险与测试遗漏，输出有依据的审查结果。', 'all'],
      ['release-notes', '从提交记录整理版本变更，生成面向用户的发布说明。', 'all'],
      ['api-design', '设计清晰的接口契约，检查请求参数、错误响应与版本兼容。', 'all'],
      ['zcode-workflow', '为 ZCode 整理项目上下文、常用命令和工作流程。', ['zcode']],
      ['test-planning', '从需求和边界条件出发，制定可执行的测试方案。', 'all'],
      ['claude-commands', '维护 Claude Code 的专用命令与项目协作约定。', ['claude']],
    ]
    let library = definitions.map(([name, description, compatibility], i) => ({
      id: `library-${i}`,
      name,
      metadataName: name,
      description,
      compatibility,
      toolId: 'library',
      path: `C:/Users/demo/AppData/Roaming/skill-manage/library/${i}/${name}`,
      managed: true,
      linked: false,
      warnings: [],
    }))
    let skills = [
      {
        ...library[0],
        id: 'installed-review',
        toolId: 'claude',
        libraryId: 'library-0',
        path: tools[0].root + '/code-review',
      },
      {
        ...library[1],
        id: 'installed-release',
        toolId: 'codex',
        libraryId: 'library-1',
        path: tools[1].root + '/release-notes',
      },
      {
        id: 'external-zcode',
        name: 'project-context',
        description: '整理当前工作区的目录结构、关键文件与团队约定。',
        toolId: 'zcode',
        managed: false,
        linked: false,
        path: tools[2].root + '/project-context',
        warnings: [],
      },
    ]
    let trash = []
    let settings = { theme: 'system', tools: {} }
    const written = {}
    const invocations = []
    const enabledTools = () => tools.filter((tool) => settings.tools[tool.id]?.enabled !== false)
    const snapshotSkills = () =>
      skills
        .map((skill) => ({
          ...skill,
          installedBy: skill.managed ? skill.toolId : undefined,
          discoveredBy: enabledTools()
            .filter((tool) => tool.discoveryRoots.some((root) => skill.path.startsWith(root + '/')))
            .map((tool) => tool.id),
        }))
        .filter((skill) => skill.discoveredBy.length > 0)
    const handler = (name, action) =>
      ipcMain.handle(name, async (_event, ...args) => {
        invocations.push({ name, args })
        return action(...args)
      })
    handler('scan', () => ({
      tools: enabledTools(),
      skills: snapshotSkills(),
      library,
      trash,
      libraryRoot: 'C:/Users/demo/AppData/Roaming/skill-manage/library',
      diagnostics: [],
    }))
    const recycle = (id, central = false) => {
      const item = (central ? library : skills).find((skill) => skill.id === id)
      trash.push({
        id: 'trash-' + id,
        skill: item,
        originalPath: item.path,
        deletedAt: new Date().toISOString(),
      })
      if (central) library = library.filter((skill) => skill.id !== id)
      else skills = skills.filter((skill) => skill.id !== id)
    }
    handler('uninstall', (id) => recycle(id))
    handler('delete-external', (id) => recycle(id))
    handler('library-delete', (id) => recycle(id, true))
    handler('trash-restore', (id) => {
      const entry = trash.find((item) => item.id === id)
      if (entry.skill.toolId === 'library') library.push(entry.skill)
      else skills.push(entry.skill)
      trash = trash.filter((item) => item.id !== id)
    })
    handler('trash-delete', (id) => {
      trash = trash.filter((item) => item.id !== id)
    })
    handler('library-install', (ids, targets) => {
      for (const id of ids)
        for (const target of targets) {
          const item = library.find((s) => s.id === id)
          if (item.compatibility !== 'all' && !item.compatibility.includes(target))
            throw new Error('工具专用')
          skills.push({
            ...item,
            id: `${target}-${id}`,
            toolId: target,
            libraryId: id,
            path: tools.find((t) => t.id === target).root + '/' + item.name,
          })
        }
    })
    handler('library-collect', (id, compatibility) => {
      const item = skills.find((s) => s.id === id)
      library.push({
        ...item,
        id: 'collected',
        toolId: 'library',
        compatibility,
        source: item.path,
      })
    })
    handler('pick-local', () => [
      {
        path: '/fixture/local-skill',
        name: 'local-skill',
        description: '本地导入示例',
        warnings: [],
      },
    ])
    handler('library-deploy', () => ({ updated: ['claude'], skipped: [] }))
    handler('library-add', (_paths, compatibility) =>
      library.push({ ...library[0], id: 'imported', name: 'local-skill', compatibility }),
    )
    handler('library-compatibility', (id, compatibility) => {
      library.find((skill) => skill.id === id).compatibility = compatibility
    })
    handler('skill-detail', (id) => ({
      skill: [...library, ...skills].find((s) => s.id === id),
      files: [
        { path: 'SKILL.md', size: 400 },
        { path: 'references/checklist.md', size: 50 },
      ],
      truncated: false,
    }))
    handler('skill-read-file', (_id, file) =>
      file === 'SKILL.md'
        ? '---\nname: code-review\ndescription: 检查代码变更\n---\n# 代码审查\n\n检查正确性、回归风险与测试覆盖。\n\n## 检查步骤\n\n1. 阅读变更。\n2. 检查边界。\n\n| 检查项 | 要求 |\n| --- | --- |\n| 正确性 | 明确触发条件 |\n\n<script>window.pwned=true</script>\n\n![remote](https://example.com/tracking.png)'
        : '# 附属检查清单\n\n- 保留用户改动',
    )
    handler('skill-create', (input) => {
      if (input.target === 'library') {
        library.push({
          id: 'created-' + input.name,
          name: input.name,
          metadataName: input.name,
          description: input.description,
          compatibility: input.compatibility,
          toolId: 'library',
          path: 'C:/Users/demo/AppData/Roaming/skill-manage/library/created/' + input.name,
          managed: true,
          linked: false,
          warnings: [],
        })
      } else {
        skills.push({
          id: 'created-' + input.name,
          name: input.name,
          metadataName: input.name,
          description: input.description,
          toolId: input.target,
          managed: false,
          linked: false,
          path: tools.find((t) => t.id === input.target).root + '/' + input.name,
          warnings: [],
        })
      }
      return { path: input.name, name: input.name, description: input.description, warnings: [] }
    })
    handler('skill-write-file', (id, relativePath, content) => {
      const skill = [...library, ...skills].find((s) => s.id === id)
      if (skill) written[relativePath] = content
      return skill
    })
    handler('window-minimize', () => {})
    handler('window-maximize-toggle', () => false)
    handler('window-close', () => {})
    handler('window-is-maximized', () => false)
    const updateStatus = {
      currentVersion: '2.0.0',
      updateSupported: true,
      state: 'not-available',
    }
    handler('updater-get-status', () => updateStatus)
    handler('updater-check', () => updateStatus)
    handler('updater-download', () => updateStatus)
    handler('updater-quit-install', () => {})
    handler('settings-get', () => settings)
    handler('settings-save', (next) => {
      settings = next
      nativeTheme.themeSource = next.theme
      return settings
    })
    handler('settings-theme', (theme) => {
      settings = { ...settings, theme }
      nativeTheme.themeSource = theme
    })
    handler('pick-directory', () => 'C:/demo-project')
    const projectScan = {
      projectPath: 'C:/demo-project',
      tools: [
        ['claude', 'Claude Code', '.claude/skills'],
        ['codex', 'Codex', '.agents/skills'],
        ['cursor', 'Cursor', '.cursor/skills'],
        ['qoder', 'Qoder', '.qoder/skills'],
        ['opencode', 'OpenCode', '.opencode/skills'],
        ['gemini', 'Gemini CLI', '.gemini/skills'],
        ['copilot', 'GitHub Copilot', '.github/skills'],
      ].map(([id, name, relative]) => ({
        toolId: id,
        name,
        directory: 'C:/demo-project/' + relative,
        skills:
          id === 'claude'
            ? [
                {
                  id: 'project:qa-proj',
                  name: 'qa-project-skill',
                  description: '项目级示例 Skill',
                  path: 'C:/demo-project/' + relative + '/qa-project-skill',
                  toolId: id,
                  managed: false,
                  linked: false,
                  warnings: [],
                },
              ]
            : [],
      })),
      diagnostics: [],
    }
    handler('project-scan', () => JSON.parse(JSON.stringify(projectScan)))
    handler('project-browse', (p) => ({
      skill: projectScan.tools.flatMap((t) => t.skills).find((s) => s.path === p),
      files: [{ path: 'SKILL.md', size: 30 }],
      truncated: false,
    }))
    handler('project-read-file', () => '# QA 项目 Skill\n\n项目内容')
    handler('project-write-file', () => {})
    handler('project-delete', (p) => {
      for (const tool of projectScan.tools) tool.skills = tool.skills.filter((s) => s.path !== p)
      return projectScan
    })
    handler('project-install', (input) => {
      for (const toolId of input.toolId === undefined ? [] : [input.toolId]) {
        const tool = projectScan.tools.find((t) => t.toolId === toolId)
        for (const source of input.sources) {
          const item = library.find((s) => s.path === source)
          if (item)
            tool.skills.push({ ...item, path: tool.directory + '/' + item.name, warnings: [] })
        }
      }
      return projectScan.tools.flatMap((t) => t.skills).map((s) => s.path)
    })
    const window = new BrowserWindow({
      show: false,
      width: 1440,
      height: 960,
      webPreferences: {
        preload: path.resolve('out/preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    const errors = []
    window.webContents.on('console-message', (event) => {
      if (event.level === 'error') {
        errors.push(event.message)
        console.error(event.message)
      }
    })
    const evaluate = (code) =>
      window.webContents.executeJavaScript(code).catch((e) => {
        console.error('EVAL FAIL >>>', code.slice(0, 300), '<<<', e.message)
        throw e
      })
    const wait = async (code) => {
      const deadline = Date.now() + 6000
      while (!(await evaluate(code))) {
        if (Date.now() > deadline) throw new Error('Timeout: ' + code)
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
    }
    // Radix DropdownMenu opens on pointerdown, not on click alone.
    const openRowMenu = async () => {
      await evaluate(
        `(() => { const b = document.querySelector('.skill-row [aria-label$="更多操作"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0 })); b.click() })()`,
      )
    }
    // React controlled inputs need the native value setter + input event.
    const fill = async (selector, value) => {
      await evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`,
      )
    }
    const click = async (text) => {
      await evaluate(
        `(() => { const b = [...document.querySelectorAll('button, [role="menuitem"]')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('Missing button: '+${JSON.stringify(text)}); b.click() })()`,
      )
    }
    // Radix Tabs activate on mousedown with pointer detail, not on click alone.
    const activate = async (text) => {
      await evaluate(
        `(() => { const b = [...document.querySelectorAll('[role="tab"]')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('Missing tab: '+${JSON.stringify(text)}); b.dispatchEvent(new MouseEvent('mousedown', { button: 0, detail: 1, bubbles: true })); b.click() })()`,
      )
    }
    const screenshot = async (name) => {
      await evaluate(
        'document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))',
      )
      await evaluate(
        'Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))',
      )
      await fs.writeFile(`out/qa/${name}.png`, (await window.webContents.capturePage()).toPNG())
    }
    await fs.mkdir('out/qa', { recursive: true })
    await window.loadFile(path.resolve('out/renderer/index.html'))
    await wait("document.querySelectorAll('.skill-row').length === 6")
    await wait(
      "[...document.querySelectorAll('.tool-icon img')].every(i => i.complete && i.naturalWidth > 0)",
    )
    // Undeployed tools recede to a muted grayscale tile; deployed ones stay coloured.
    if (
      !(await evaluate(
        "!!document.querySelector('.skill-row .tool-icon.grayscale') && !!document.querySelector('.skill-row .tool-icon:not(.grayscale)')",
      ))
    )
      throw new Error('Deployment states are not visually distinguished')
    // Navigation must never sit inside a window-drag region: synthetic .click()
    // bypasses app-region hit-testing, so real mouse clicks would break silently.
    if (
      await evaluate(
        "[...document.querySelectorAll('.nav-item')].some(b => getComputedStyle(b.closest('aside') ?? b).webkitAppRegion === 'drag')",
      )
    )
      throw new Error('Sidebar is a drag region and would swallow real clicks')
    await screenshot('library-redesign')
    // 一键创建 Skill 模板（库目标，兼容范围默认全部 → 不影响后续工具筛选计数）
    await click('新建 Skill')
    await wait('!!document.querySelector(\'[role="dialog"]\')')
    await fill('#skill-name', 'qa-created')
    await fill('#skill-description', 'QA 创建的模板，用于验证一键创建。')
    await evaluate('document.querySelector(\'[aria-label="适用 Claude Code"]\').click()')
    await click('创建模板')
    await wait('!document.querySelector(\'[role="dialog"]\')')
    if (!library.some((s) => s.name === 'qa-created')) throw new Error('Create template failed')
    await wait("document.querySelectorAll('.skill-row').length === 7")
    await activate('工具专用')
    // 2 mock-specific skills + the freshly created Claude-only template.
    if ((await evaluate("document.querySelectorAll('.skill-row').length")) !== 3)
      throw new Error('Specific filter failed')
    await activate('全部技能')
    await evaluate('document.querySelector(\'[aria-label="选择 code-review"]\').click()')
    await click('选择安装目标')
    await wait("!!document.querySelector('.install-targets')")
    if (!(await evaluate('document.querySelector(\'[aria-label="安装到 Claude Code"]\').disabled')))
      throw new Error('Existing target should be disabled')
    if (!(await evaluate('document.querySelector(\'[aria-label="安装到 Cursor"]\').disabled')))
      throw new Error('Shared discovery should block duplicate target')
    await evaluate('document.querySelector(\'[aria-label="安装到 Codex"]\').click()')
    await screenshot('install-redesign')
    await click('复制安装')
    await wait('!document.querySelector(\'[data-slot="sheet-content"]\')')
    if (
      !invocations.some(
        (i) =>
          i.name === 'library-install' && i.args[0][0] === 'library-0' && i.args[1][0] === 'codex',
      )
    )
      throw new Error('Central install IPC failed')
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Codex')).click()",
    )
    await click('从仓库安装')
    if ((await evaluate("document.querySelectorAll('.skill-row').length")) !== 4)
      throw new Error('Tool compatibility filter failed')
    await evaluate('document.querySelector(\'[aria-label="选择 api-design"]\').click()')
    await screenshot('tool-redesign')
    await click('安装到 Codex')
    await wait(
      'document.querySelector(\'[data-slot="tabs-trigger"][data-state="active"]\').textContent.includes(\'已发现\')',
    )
    if (!skills.some((s) => s.toolId === 'codex' && s.name === 'api-design'))
      throw new Error('Tool batch install failed')
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('ZCode')).click()",
    )
    await click('收录')
    await wait("!!document.querySelector('.collect-preview')")
    if (
      !(await evaluate(
        'document.querySelector(\'[data-slot="sheet-content"] [aria-label="适用 ZCode"]\')?.dataset.state === \'checked\'',
      ))
    )
      throw new Error('Collection default scope failed')
    await click('收入仓库')
    await wait('!document.querySelector(\'[data-slot="sheet-content"]\')')
    if (!library.some((s) => s.name === 'project-context' && s.compatibility.includes('zcode')))
      throw new Error('Collection failed')
    await evaluate("document.querySelector('.nav-item').click()")
    await click('添加 Skill')
    await screenshot('import-redesign')
    await evaluate("document.querySelector('.drop-zone').click()")
    await wait("!!document.querySelector('.candidate-option')")
    await evaluate(
      'document.querySelector(\'[data-slot="sheet-content"] [aria-label="适用 Cursor"]\').click()',
    )
    await wait(
      'document.querySelector(\'[data-slot="sheet-content"] [aria-label="适用 Cursor"]\')?.dataset.state === \'checked\'',
    )
    await evaluate(
      'document.querySelector(\'[data-slot="sheet-content"] [aria-label="适用 Qoder"]\').click()',
    )
    await wait(
      'document.querySelector(\'[data-slot="sheet-content"] [aria-label="适用 Qoder"]\')?.dataset.state === \'checked\'',
    )
    await evaluate(
      "document.querySelector('[data-slot=\"sheet-content\"] .compatibility-picker').scrollIntoView({block: 'center'})",
    )
    await screenshot('multi-compatibility')
    await click('收入仓库')
    await wait('!document.querySelector(\'[data-slot="sheet-content"]\')')
    if (
      !library.some(
        (s) =>
          s.name === 'local-skill' &&
          s.compatibility.includes('cursor') &&
          s.compatibility.includes('qoder'),
      )
    )
      throw new Error('Local library import failed')
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Cursor')).click()",
    )
    await wait("document.querySelectorAll('.skill-row').length >= 3")
    if (
      !(await evaluate("document.querySelector('.skill-table').textContent.includes('共享 Skill')"))
    )
      throw new Error('Shared discovery label missing')
    await evaluate(
      "[...document.querySelectorAll('.ownership-filters button')].find(b => b.textContent.includes('自己的 Skill')).click()",
    )
    await wait(
      "document.querySelector('.ownership-filters [aria-pressed=\"true\"]').textContent.includes('自己的 Skill')",
    )
    if ((await evaluate("document.querySelectorAll('.skill-row').length")) !== 0)
      throw new Error('Own filter should exclude shared directories')
    await evaluate(
      "[...document.querySelectorAll('.ownership-filters button')].find(b => b.textContent.includes('共享 Skill')).click()",
    )
    await wait(
      "document.querySelector('.ownership-filters [aria-pressed=\"true\"]').textContent.includes('共享 Skill')",
    )
    if ((await evaluate("document.querySelectorAll('.skill-row').length")) < 3)
      throw new Error('Shared filter missing readable skills')
    await screenshot('shared-skills')
    await openRowMenu()
    await click('移入回收站')
    await wait(
      "document.querySelectorAll('.skill-row').length >= 2 && !!document.querySelector('[data-sonner-toast][data-type=\"success\"]')",
    )
    if (trash.length !== 1) throw new Error('Target deletion did not recycle Skill')
    await evaluate("document.querySelector('.trash-nav').click()")
    await wait("document.querySelectorAll('.trash-row').length === 1")
    await screenshot('trash-populated')
    window.setSize(1020, 760)
    await screenshot('trash-compact')
    if (await evaluate('document.documentElement.scrollWidth > window.innerWidth'))
      throw new Error('Trash overflows at minimum window size')
    window.setSize(1440, 960)
    await click('还原')
    await wait("document.querySelectorAll('.trash-row').length === 0")
    if (trash.length !== 0) throw new Error('Trash restoration failed')
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Cursor')).click()",
    )
    await click('从仓库安装')
    await evaluate('document.querySelector(\'[aria-label="选择 local-skill"]\').click()')
    await click('安装到 Cursor')
    await wait(
      'document.querySelector(\'[data-slot="tabs-trigger"][data-state="active"]\').textContent.includes(\'已发现\')',
    )
    if (!skills.some((skill) => skill.toolId === 'cursor' && skill.name === 'local-skill'))
      throw new Error('New tool installation failed')
    await evaluate(
      "[...document.querySelectorAll('.ownership-filters button')].find(b => b.textContent.includes('自己的 Skill')).click()",
    )
    await wait(
      "document.querySelector('.ownership-filters [aria-pressed=\"true\"]').textContent.includes('自己的 Skill')",
    )
    if ((await evaluate("document.querySelectorAll('.skill-row').length")) !== 1)
      throw new Error('Own filter should show the current target installation')
    await screenshot('own-skills')
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('ZCode')).click()",
    )
    await openRowMenu()
    await click('移入回收站')
    await wait('!!document.querySelector(\'[data-sonner-toast][data-type="success"]\')')
    await evaluate("document.querySelector('.trash-nav').click()")
    await wait("document.querySelectorAll('.trash-row').length === 1")
    await click('永久删除')
    await wait("document.querySelectorAll('.trash-row').length === 0")
    if (
      !invocations.some((i) => i.name === 'delete-external') ||
      !invocations.some((i) => i.name === 'trash-delete')
    )
      throw new Error('External / permanent deletion IPC failed')
    await screenshot('trash-empty')
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Qoder')).click()",
    )
    await click('从仓库安装')
    if (
      !(await evaluate(
        "document.querySelector('.skill-table').textContent.includes('local-skill')",
      ))
    )
      throw new Error('Multi-tool scope lost second tool')
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('Gemini CLI')).click()",
    )
    await click('从仓库安装')
    if (
      await evaluate("document.querySelector('.skill-table').textContent.includes('local-skill')")
    )
      throw new Error('Restricted skill leaked into unrelated install list')
    await evaluate("document.querySelector('.nav-item').click()")
    await openRowMenu()
    await click('移出仓库')
    await wait('!!document.querySelector(\'[data-sonner-toast][data-type="success"]\')')
    await evaluate("document.querySelector('.trash-nav').click()")
    await wait("document.querySelectorAll('.trash-row').length === 1")
    await click('还原')
    await wait("document.querySelectorAll('.trash-row').length === 0")
    if (!invocations.some((i) => i.name === 'library-delete'))
      throw new Error('Library deletion IPC failed')
    await evaluate("document.querySelector('.nav-item').click()")
    await click('code-review')
    await wait("!!document.querySelector('.markdown-body table')")
    if (
      await evaluate(
        "!!window.pwned || !!document.querySelector('.markdown-body script,.markdown-body img')",
      )
    )
      throw new Error('Unsafe preview')
    await screenshot('viewer-redesign')
    await activate('源码')
    if (
      !(await evaluate(
        "document.querySelector('.source-code').textContent.includes('name: code-review')",
      ))
    )
      throw new Error('Source view failed')
    // IDEA-style file tree: a collapsible folder node with its child nested.
    if ((await evaluate("document.querySelectorAll('.file-item').length")) !== 3)
      throw new Error('File tree structure missing')
    await click('references')
    await wait("document.querySelectorAll('.file-item').length === 2")
    await click('references')
    await wait("document.querySelectorAll('.file-item').length === 3")
    // Edit mode: modify, save via the button, verify the write IPC fired.
    await activate('编辑')
    await wait('!!document.querySelector(\'[aria-label="编辑文件内容"]\')')
    await fill('[aria-label="编辑文件内容"]', '---\nname: code-review\n---\n# QA 编辑后的内容')
    await click('保存')
    await wait(
      "[...document.querySelectorAll('[data-sonner-toast]')].some(t => t.textContent.includes('已保存'))",
    )
    if (!invocations.some((i) => i.name === 'skill-write-file'))
      throw new Error('Skill file write IPC failed')
    await activate('源码')
    await evaluate(
      "[...document.querySelectorAll('.file-item')].find(b => b.textContent.includes('checklist')).click()",
    )
    await wait("!!document.querySelector('.source-code')?.textContent.includes('附属检查清单')")
    await evaluate(
      "document.querySelector('.skill-viewer').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))",
    )
    await wait("!document.querySelector('.skill-viewer')")
    if (!written['SKILL.md'] || !written['SKILL.md'].includes('QA 编辑后的内容'))
      throw new Error('Written content missing')
    // 项目级管理：临时选择项目 → 扫描分组 → 查看 → 收录 → 从仓库安装
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('添加项目')).click()",
    )
    await click('添加项目')
    await wait("document.querySelector('main').textContent.includes('qa-project-skill')")
    await click('查看')
    await wait("!!document.querySelector('.skill-viewer')")
    await evaluate(
      "document.querySelector('.skill-viewer').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))",
    )
    await wait("!document.querySelector('.skill-viewer')")
    await click('收录')
    await click('收入仓库')
    await wait(
      "[...document.querySelectorAll('[data-sonner-toast]')].some(t => t.textContent.includes('已收入中央仓库'))",
    )
    if (!invocations.some((i) => i.name === 'library-add'))
      throw new Error('Project collect IPC failed')
    await click('从仓库安装')
    await wait('!!document.querySelector(\'[aria-label="安装到 Claude Code"]\')')
    await evaluate('document.querySelector(\'[aria-label="选择 code-review"]\').click()')
    await evaluate('document.querySelector(\'[aria-label="安装到 Claude Code"]\').click()')
    await click('安装到 1 个目录')
    await wait(
      "[...document.querySelectorAll('[data-sonner-toast]')].some(t => t.textContent.includes('已安装到项目内'))",
    )
    if (!invocations.some((i) => i.name === 'project-install'))
      throw new Error('Project install IPC failed')
    // 项目持久化：侧边栏保留项目入口；移除后消失
    if (
      !(await evaluate(
        "[...document.querySelectorAll('.nav-item')].some(b => b.textContent.includes('demo-project'))",
      ))
    )
      throw new Error('Registered project missing from sidebar')
    await click('移除项目')
    await wait("document.querySelector('main').textContent.includes('管理项目级 Skill')")
    await wait(
      "[...document.querySelectorAll('.nav-item')].every(b => !b.textContent.includes('demo-project'))",
    )
    // 一键下发更新：仓库当前版本覆盖已安装副本
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('中央仓库')).click()",
    )
    await wait("document.querySelectorAll('.skill-row').length >= 1")
    await openRowMenu()
    await click('下发更新到工具')
    await wait(
      "[...document.querySelectorAll('[data-sonner-toast]')].some(t => t.textContent.includes('已下发更新'))",
    )
    if (!invocations.some((i) => i.name === 'library-deploy')) throw new Error('Deploy IPC failed')
    // Settings page: theme radio, library location, agent scan directories
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('设置')).click()",
    )
    await wait('!!document.querySelector(\'.settings-view [role="radiogroup"]\')')
    if (
      !(await evaluate(
        "document.querySelector('.settings-view').textContent.includes('中央仓库位置') && document.querySelector('.settings-view').textContent.includes('Agent 扫描目录') && document.querySelector('.settings-view').textContent.includes('默认位置') && document.querySelector('.settings-view').textContent.includes('关于与更新') && document.querySelector('.settings-view').textContent.includes('v2.0.0')",
      ))
    )
      throw new Error('Settings sections missing')
    // Anchor on the exact token values so the check works regardless of the
    // host OS scheme. Light = --background oklch(1 0 0); dark = oklch(0.141 …).
    const BG_LIGHT = 'oklch(1 0 0)'
    const BG_DARK = 'oklch(0.141 0.005 285.823)'
    await evaluate(
      "[...document.querySelectorAll('.settings-view label')].find(l => l.textContent.includes('明亮')).click()",
    )
    await wait(`getComputedStyle(document.body).backgroundColor === '${BG_LIGHT}'`)
    await screenshot('settings-light')
    // Light-mode shot of the main workspace for the README.
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('中央仓库')).click()",
    )
    await wait("document.querySelectorAll('.skill-row').length >= 1")
    await screenshot('library-light')
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('设置')).click()",
    )
    await wait('!!document.querySelector(\'.settings-view [role="radiogroup"]\')')
    await evaluate(
      "[...document.querySelectorAll('.settings-view label')].find(l => l.textContent.includes('黑暗')).click()",
    )
    await wait(`getComputedStyle(document.body).backgroundColor === '${BG_DARK}'`)
    await screenshot('settings-dark')
    // Agent 启用/停用：停用后导航与安装目标同步消失，重新启用即恢复。
    await evaluate('document.querySelector(\'[aria-label="启用 Codex"]\').click()')
    await wait(
      "[...document.querySelectorAll('.nav-item')].every(b => !b.textContent.includes('Codex'))",
    )
    await evaluate('document.querySelector(\'[aria-label="启用 Codex"]\').click()')
    await wait(
      "[...document.querySelectorAll('.nav-item')].some(b => b.textContent.includes('Codex'))",
    )
    await evaluate(
      "[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes('中央仓库')).click()",
    )
    await wait("document.querySelectorAll('.skill-row').length >= 1")
    await screenshot('library-dark')
    await evaluate("window.skills.setTheme('system')")
    window.setSize(1020, 760)
    await screenshot('library-compact')
    if (await evaluate('document.documentElement.scrollWidth > window.innerWidth'))
      throw new Error('Horizontal overflow at minimum window size')
    for (const tool of tools) {
      await evaluate(
        `[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes(${JSON.stringify(tool.name)})).click()`,
      )
      if (await evaluate('document.documentElement.scrollWidth > window.innerWidth'))
        throw new Error('Overflow for ' + tool.name)
    }
    await evaluate("document.querySelector('.nav-item').click()")
    library = []
    skills = []
    await evaluate('document.querySelector(\'[aria-label="刷新列表"]\').click()')
    await wait("!!document.querySelector('.empty-state')")
    await screenshot('empty-redesign')
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(
      'UI passed: library, scope and ownership filters, icons, installs, collection, import, trash deletion/restore/permanent deletion, Markdown/source/files, compact layout, empty state',
    )
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
