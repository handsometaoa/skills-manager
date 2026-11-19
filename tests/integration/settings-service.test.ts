import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  DEFAULT_SETTINGS,
  SettingsService,
  parseSettings,
} from '../../src/main/services/settings-service'
import { applyToolSettings, createToolRegistry } from '../../src/main/adapters/tool-registry'
import { SkillStore } from '../../src/main/services/skill-service'
import type { Settings } from '../../src/shared/types'

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-manager-settings-'))
  const source = path.join(root, 'source', 'review')
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(
    path.join(source, 'SKILL.md'),
    '---\nname: review\ndescription: Review changes carefully\n---\n# Review\n',
  )
  const store = new SkillStore(path.join(root, 'data'), path.join(root, 'home'))
  await store.init()
  return { root, source, store, cleanup: () => fs.rm(root, { recursive: true, force: true }) }
}

test('settings load defaults, round-trip and reject invalid input', async () => {
  const f = await fixture()
  try {
    const service = new SettingsService(path.join(f.root, 'data', 'settings.json'))
    assert.deepEqual(await service.load(), DEFAULT_SETTINGS)
    const customRoot = path.join(f.root, 'repo')
    const settings: Settings = {
      theme: 'dark',
      libraryRoot: customRoot,
      tools: { claude: { root: path.join(f.root, 'claude-skills'), extraRoots: [customRoot] } },
    }
    await service.save(settings)
    assert.deepEqual(await service.load(), settings)
    assert.throws(() => parseSettings({ ...settings, theme: 'blue' }), /无效的主题模式/)
    assert.throws(() => parseSettings({ ...settings, libraryRoot: 'relative/path' }), /绝对路径/)
    assert.throws(() => parseSettings({ theme: 'light', tools: { claude: { root: 42 } } }), /无效/)
    // Unknown tool ids and empty entries are dropped instead of crashing.
    const filtered = parseSettings({ theme: 'light', tools: { unknown: { root: '/' }, zcode: {} } })
    assert.deepEqual(Object.keys(filtered.tools), [])
  } finally {
    await f.cleanup()
  }
})

test('applySettings updates the live store so enable/disable takes effect at once', async () => {
  const f = await fixture()
  try {
    await f.store.install(f.source, ['zcode', 'codex'])
    assert.equal((await f.store.scan()).skills.length, 2)
    // Disabling a tool with its own directory hides it and its skills
    // immediately; installed files stay untouched on disk.
    const zcodeRoot = f.store.tools.find((t) => t.id === 'zcode')!.root
    f.store.applySettings({ theme: 'system', tools: { zcode: { enabled: false } } })
    const disabled = await f.store.scan()
    assert.ok(!disabled.tools.some((t) => t.id === 'zcode'))
    assert.ok(!disabled.skills.some((s) => s.toolId === 'zcode' && !s.discoveredBy?.length))
    assert.equal(disabled.skills.filter((s) => s.name === 'review').length, 1)
    assert.ok(await fs.readFile(path.join(zcodeRoot, 'review', 'SKILL.md'), 'utf8'))
    // The Codex copy lives in the shared agents directory, so disabling Codex
    // keeps it discoverable by Cursor / OpenCode / Gemini / Copilot — but the
    // disabled owner no longer appears anywhere. (Settings are full
    // replacements, so the ZCode disable must be included again.)
    f.store.applySettings({
      theme: 'system',
      tools: { zcode: { enabled: false }, codex: { enabled: false } },
    })
    const withoutCodex = await f.store.scan()
    assert.ok(!withoutCodex.tools.some((t) => t.id === 'codex'))
    const shared = withoutCodex.skills.find((s) => s.name === 'review')!
    assert.ok(shared)
    assert.ok(!shared.discoveredBy?.includes('codex'))
    assert.ok(shared.discoveredBy?.includes('cursor'))
    // Re-enabling restores both the tool and its managed installation records.
    f.store.applySettings({ theme: 'system', tools: {} })
    const reenabled = await f.store.scan()
    assert.equal(reenabled.skills.filter((s) => s.name === 'review').length, 2)
    assert.ok(reenabled.skills.some((s) => s.toolId === 'zcode' && s.managed))
    // Scan-directory overrides also apply to the live registry.
    const custom = path.join(f.root, 'claude-live')
    f.store.applySettings({ theme: 'system', tools: { claude: { root: custom } } })
    assert.equal(f.store.tools.find((t) => t.id === 'claude')!.root, path.resolve(custom))
  } finally {
    await f.cleanup()
  }
})

test('disabled agents vanish from the registry while their directories stay discoverable', async () => {
  const f = await fixture()
  try {
    const home = path.join(f.root, 'home')
    const registry = createToolRegistry(home)
    const applied = applyToolSettings(registry, { claude: { enabled: false } })
    assert.ok(!applied.some((t) => t.id === 'claude'))
    // Cursor and OpenCode keep reading the disabled tool's default directory.
    const cursor = applied.find((t) => t.id === 'cursor')!
    assert.ok(cursor.discoveryRoots.includes(registry[0].root))
    // Re-enabling without other configuration restores the tool untouched.
    const reenabled = applyToolSettings(registry, { claude: { enabled: true } })
    assert.equal(reenabled.length, registry.length)
    assert.equal(reenabled[0].root, registry[0].root)
  } finally {
    await f.cleanup()
  }
})

test('tool overrides remap shared discovery roots and add extra scan directories', async () => {
  const f = await fixture()
  try {
    const home = path.join(f.root, 'home')
    const registry = createToolRegistry(home)
    const customClaude = path.join(f.root, 'claude-skills')
    const extra = path.join(f.root, 'extra-skills')
    const applied = applyToolSettings(registry, {
      claude: { root: customClaude, extraRoots: [extra, customClaude] },
    })
    const claude = applied.find((t) => t.id === 'claude')!
    assert.equal(claude.root, path.resolve(customClaude))
    assert.deepEqual(claude.discoveryRoots, [path.resolve(customClaude), path.resolve(extra)])
    const cursor = applied.find((t) => t.id === 'cursor')!
    assert.ok(cursor.discoveryRoots.includes(path.resolve(customClaude)))
    assert.ok(!cursor.discoveryRoots.includes(registry[0].root))
    // Tools without overrides keep their defaults untouched.
    assert.equal(applied.find((t) => t.id === 'zcode')!.root, registry[2].root)
    // Undefined settings return the registry as-is.
    assert.equal(applyToolSettings(registry, undefined), registry)
  } finally {
    await f.cleanup()
  }
})

test('overridden tool root becomes the install destination and extra roots stay read-only', async () => {
  const f = await fixture()
  try {
    const customClaude = path.join(f.root, 'claude-skills')
    const extra = path.join(f.root, 'extra-skills')
    await fs.mkdir(path.join(extra, 'external'), { recursive: true })
    await fs.cp(f.source, path.join(extra, 'external'), { recursive: true })
    const store = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'), {
      theme: 'system',
      tools: { claude: { root: customClaude, extraRoots: [extra] } },
    })
    await store.init()
    await store.install(f.source, ['claude'])
    const skills = (await store.scan()).skills
    const installed = skills.find((s) => s.name === 'review' && s.managed)!
    assert.ok(installed.path.startsWith(path.resolve(customClaude)))
    assert.equal(installed.toolId, 'claude')
    // The skill living in the extra root is discovered but never an install target.
    const external = skills.find((s) => s.name === 'external')!
    assert.ok(external.path.startsWith(path.resolve(extra)))
    assert.ok(!external.managed)
  } finally {
    await f.cleanup()
  }
})

test('relocating the central library moves content and persists across restarts', async () => {
  const f = await fixture()
  try {
    const data = path.join(f.root, 'data')
    const store = new SkillStore(data, path.join(f.root, 'home'))
    await store.init()
    await store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const originalLibraryRoot = store.libraryRoot
    const relocated = path.join(f.root, 'skills-repo')
    await store.setLibraryRoot(relocated)
    assert.equal(store.libraryRoot, path.resolve(relocated))
    assert.equal((await store.scan()).library.length, 1)
    assert.ok(await fs.readdir(path.resolve(relocated)))
    const reopened = new SkillStore(data, path.join(f.root, 'home'), {
      theme: 'system',
      libraryRoot: relocated,
      tools: {},
    })
    await reopened.init()
    assert.equal(reopened.libraryRoot, path.resolve(relocated))
    assert.equal((await reopened.scan()).library.length, 1)
    // Moving back to the default location restores the original layout.
    await reopened.setLibraryRoot(undefined)
    assert.equal(reopened.libraryRoot, originalLibraryRoot)
    assert.equal((await reopened.scan()).library.length, 1)
  } finally {
    await f.cleanup()
  }
})

test('relocation refuses non-empty or nested targets and keeps the source intact', async () => {
  const f = await fixture()
  try {
    const store = new SkillStore(path.join(f.root, 'data'), path.join(f.root, 'home'))
    await store.init()
    await store.addToLibrary([{ path: f.source, source: f.source }], 'all')
    const populated = path.join(f.root, 'occupied')
    await fs.mkdir(populated)
    await fs.writeFile(path.join(populated, 'something.txt'), 'occupied')
    await assert.rejects(() => store.setLibraryRoot(populated), /空目录/)
    assert.equal(store.libraryRoot, path.join(f.root, 'data', 'library'))
    assert.equal((await store.scan()).library.length, 1)
    const nested = path.join(store.libraryRoot, 'nested', 'library')
    await assert.rejects(() => store.setLibraryRoot(nested), /内部/)
    assert.equal(store.libraryRoot, path.join(f.root, 'data', 'library'))
  } finally {
    await f.cleanup()
  }
})
