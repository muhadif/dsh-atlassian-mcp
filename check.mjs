/**
 * Runnable self-check for the Host half: drives the runtime registration of the Atlassian MCP
 * server and the config route against a stubbed `ctx.mcpManager` and web server. Run with
 * `node check.mjs`; it writes into a temp directory and removes it afterwards.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = await mkdtemp(join(tmpdir(), 'atlassian-mcp-check-'))
try {
  process.env.DSH_HOME = join(dir, 'home')
  const { apply, inject } = await import('./index.js')

  const routes = new Map()
  const registrations = new Map()
  const effects = []
  let nextId = 1

  /** A stand-in for ctx.mcpManager: records what the plugin registers. */
  const mcpManager = {
    register(name, entry) {
      const id = nextId++
      registrations.set(name, { id, entry })
      return () => {
        // Only remove the registration this disposer owns, like the real manager's idempotent one.
        if (registrations.get(name)?.id === id) registrations.delete(name)
      }
    },
    list: () => [...registrations.keys()].map(name => ({ name, configured: false, status: { state: 'ready' } })),
  }

  const ctx = {
    mcpManager,
    webServer: { register: registered => (routes.set(registered.path, registered), () => {}) },
    effect: (factory) => {
      const cleanup = factory()
      effects.push(cleanup)
      return () => {}
    },
  }

  assert.deepEqual(inject, ['mcpManager', 'webServer'], 'the plugin requires the MCP manager')

  apply(ctx)
  // Registration happens after the config file read resolves.
  await new Promise(resolve => setTimeout(resolve, 20))

  assert.ok(registrations.has('atlassian'), 'the server is registered under its tool namespace')
  const first = registrations.get('atlassian').entry
  assert.equal(first.transport, 'stdio')
  assert.equal(first.command, 'npx')
  assert.equal(first.args[0], '-y')
  assert.equal(first.args[1], 'mcp-remote@0.16.6')
  assert.match(first.args[2], /mcp\.atlassian\.com\/v2\/mcp\?tools=all/, 'the default endpoint exposes every product tool')

  const call = async ({ method = 'GET', headers = {}, body } = {}) => {
    const req = { method, url: '/dsh-atlassian-mcp/config', headers }
    req[Symbol.asyncIterator] = async function* () {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    }
    const res = { statusCode: 0, payload: '' }
    res.writeHead = code => { res.statusCode = code }
    res.end = text => { res.payload = text ?? '' }
    await routes.get('/dsh-atlassian-mcp/config').handler(req, res)
    return { status: res.statusCode, json: res.payload ? JSON.parse(res.payload) : null }
  }

  const before = await call()
  assert.equal(before.status, 200)
  assert.equal(before.json.preset, 'v2')
  assert.equal(before.json.registered, true, 'the card can see the live registration')
  assert.deepEqual(Object.keys(before.json.presets).sort(), ['v1', 'v2'], 'both presets are offered')

  // Switching the preset re-registers with the other URL and persists the choice.
  const sameOrigin = { host: 'local', origin: 'http://local', 'content-type': 'application/json' }
  const switched = await call({ method: 'POST', headers: sameOrigin, body: { preset: 'v1' } })
  assert.equal(switched.status, 200)
  assert.equal(switched.json.preset, 'v1')
  assert.match(registrations.get('atlassian').entry.args[2], /\/v1\/mcp\/authv2/, 'the new endpoint is live')

  const stored = JSON.parse(await readFile(join(dir, 'home/dsh-atlassian-mcp/config.json'), 'utf8'))
  assert.equal(stored.preset, 'v1', 'the choice is persisted')

  // A custom endpoint must be https; anything else is refused and leaves the live one alone.
  const plain = await call({ method: 'POST', headers: sameOrigin, body: { preset: 'custom', url: 'http://evil.example/mcp' } })
  assert.equal(plain.status, 400)
  assert.match(plain.json.error, /https/)
  assert.match(registrations.get('atlassian').entry.args[2], /\/v1\/mcp\/authv2/, 'a refused write does not repoint the server')

  const unknown = await call({ method: 'POST', headers: sameOrigin, body: { preset: 'v9' } })
  assert.equal(unknown.status, 400)
  assert.match(unknown.json.error, /unknown endpoint preset/)

  const custom = await call({ method: 'POST', headers: sameOrigin, body: { preset: 'custom', url: 'https://mcp.atlassian.com/v2/mcp' } })
  assert.equal(custom.status, 200)
  assert.equal(registrations.get('atlassian').entry.args[2], 'https://mcp.atlassian.com/v2/mcp')

  // A foreign page must not repoint the server.
  const foreign = await call({ method: 'POST', headers: { host: 'local', origin: 'https://evil.example', 'content-type': 'application/json' }, body: { preset: 'v1' } })
  assert.equal(foreign.status, 403)
  assert.equal((await call({ method: 'PUT' })).status, 405)

  // A restart keeps exactly one registration, and disposal withdraws it.
  const again = await call({ method: 'POST', headers: sameOrigin, body: { preset: 'v2' } })
  assert.equal(again.status, 200)
  assert.equal(registrations.size, 1, 're-registering leaves one server, not two')
  for (const cleanup of effects) if (typeof cleanup === 'function') cleanup()
  assert.equal(registrations.size, 0, 'disposal withdraws the registration')

  console.log('check ok: runtime registration, endpoint switch + persist, https and origin guards, single registration, disposal')
} finally {
  await rm(dir, { recursive: true, force: true })
}
