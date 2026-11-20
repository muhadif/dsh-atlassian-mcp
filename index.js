/**
 * Host half: owns the Atlassian remote MCP server instead of leaving it in the profile patch.
 *
 * The server is registered through `ctx.mcpManager` at activation from this plugin's own config
 * file, so the endpoint can be switched from the settings card — no profile edit, no restart. The
 * bundle patch carries one row, this package; nothing here hard-codes Atlassian's URL.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The server name is also the tool namespace: tools arrive as `mcp__atlassian__*`. */
const SERVER = 'atlassian'

/** Endpoint presets, each with what it actually changes for the user. */
const ENDPOINTS = {
  v2: {
    url: 'https://mcp.atlassian.com/v2/mcp?tools=all',
    label: 'v2 — all product tools',
  },
  v1: {
    url: 'https://mcp.atlassian.com/v1/mcp/authv2',
    label: 'v1 — legacy auth endpoint',
  },
}

const DEFAULT = { preset: 'v2', url: ENDPOINTS.v2.url }

export const name = 'dsh-atlassian-mcp'
export const inject = ['mcpManager', 'webServer']

const storeDir = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-atlassian-mcp')
const configPath = () => join(storeDir(), 'config.json')

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

/** Only Atlassian's own hosts, or an explicit custom URL the user typed themselves. */
function resolveUrl(preset, url) {
  if (preset === 'custom') {
    const text = String(url ?? '').trim()
    if (!/^https:\/\//i.test(text)) throw new Error('a custom endpoint must be an https URL')
    return text
  }
  const known = ENDPOINTS[preset]
  if (!known) throw new Error(`unknown endpoint preset ${preset}`)
  return known.url
}

export function apply(ctx) {
  let current = { ...DEFAULT }
  let dispose = null

  async function load() {
    try {
      const parsed = JSON.parse(await readFile(configPath(), 'utf8'))
      if (parsed?.preset) {
        return { preset: parsed.preset, url: resolveUrl(parsed.preset, parsed.url) }
      }
    } catch {
      // No config yet, or one this version cannot read: fall back to the default endpoint.
    }
    return { ...DEFAULT }
  }

  async function save(next) {
    await mkdir(storeDir(), { recursive: true })
    const tmp = `${configPath()}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await rename(tmp, configPath())
  }

  /**
   * Mount the server for one endpoint. Re-registering is the only way to change the endpoint:
   * `restart` rebuilds an instance from its current entry, which still carries the old URL.
   */
  function mount(config) {
    if (dispose) {
      dispose()
      dispose = null
    }
    dispose = ctx.mcpManager.register(SERVER, {
      transport: 'stdio',
      // mcp-remote performs the OAuth dance once and caches the grant under ~/.mcp-auth, so the
      // package ships no credentials and needs no loopback redirect of its own.
      command: 'npx',
      args: ['-y', 'mcp-remote@0.16.6', config.url],
    })
  }

  /** The manager's live view of our server, for the settings card. */
  function statusOf() {
    const entry = ctx.mcpManager.list().find(candidate => candidate.name === SERVER)
    return {
      preset: current.preset,
      url: current.url,
      registered: Boolean(entry),
      status: entry?.status ?? null,
    }
  }

  ctx.effect(() => {
    let alive = true
    void load().then(config => {
      if (!alive) return
      current = config
      mount(config)
    })
    return () => {
      alive = false
      if (dispose) dispose()
      dispose = null
    }
  }, 'atlassian-mcp: register server')

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-atlassian-mcp/config',
        async handler(req, res) {
          const reply = (body, status = 200) => {
            res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify(body))
          }
          if (req.method === 'GET') return reply({ ...statusOf(), presets: ENDPOINTS })
          if (req.method !== 'POST') return reply({ error: 'method-not-allowed' }, 405)
          // Same-origin only: another page in the browser must not repoint the MCP server.
          const origin = req.headers.origin
          if (origin) {
            let fromPage = false
            try {
              fromPage = new URL(origin).host === (req.headers.host ?? '')
            } catch {
              fromPage = false
            }
            if (!fromPage) return reply({ error: 'forbidden' }, 403)
          }
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          let payload
          try {
            payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          } catch {
            return reply({ error: 'invalid-json' }, 400)
          }
          try {
            const next = {
              preset: String(payload?.preset ?? ''),
              url: resolveUrl(payload?.preset, payload?.url),
            }
            await save(next)
            current = next
            mount(next)
            return reply(statusOf())
          } catch (error) {
            return reply({ error: String(error?.message ?? error) }, 400)
          }
        },
      }),
    'atlassian-mcp: config route',
  )
}
