import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertCompatibility, assertToolIds } from '../../src/main/ipc/validation'
import { IPC_CHANNELS } from '../../src/shared/ipc'

test('IPC compatibility accepts all or a nonempty unique list of supported tools', () => {
  for (const value of ['all', ['claude'], ['cursor', 'qoder'], ['opencode', 'gemini', 'copilot']])
    assert.doesNotThrow(() => assertCompatibility(value))
  for (const value of [
    undefined,
    null,
    {},
    ['all'],
    [],
    ['cursor', 'cursor'],
    ['unknown'],
    ['qoder', 5],
    { toString: () => 'all' },
    'unknown',
    'codex',
  ])
    assert.throws(() => assertCompatibility(value), /无效/)
})

test('IPC tool lists reject malformed values before filesystem operations', () => {
  assert.doesNotThrow(() => assertToolIds(['codex', 'zcode']))
  for (const value of [null, 'codex', [], ['cursor', 'cursor'], ['unknown'], [5], [{}]])
    assert.throws(() => assertToolIds(value), /有效的目标工具/)
})

test('each IPC API method has a unique channel', () => {
  const channels = Object.values(IPC_CHANNELS)
  assert.equal(new Set(channels).size, channels.length)
})
