# dsh-atlassian-mcp

Confluence and Jira tools for [[DSH]](https://github.com/deepseek-ai/dsh), backed by Atlassian's remote MCP server. OAuth and token refresh are handled by [`mcp-remote`](https://www.npmjs.com/package/mcp-remote), so this bundle carries no credentials.

The endpoint lives in a **settings card**, not in the profile patch: the plugin registers the MCP server itself at activation, so switching endpoints reconnects the server without editing YAML or restarting DSH.

## Install

```sh
dsh plugin add dsh-atlassian-mcp
```

Or install it from Settings → Plugins in the Web UI.

## Endpoints

Open the plugin's card on the Plugins page. Two presets, plus your own URL:

| Preset | URL | What it gives you |
|---|---|---|
| **v2 — all product tools** (default) | `https://mcp.atlassian.com/v2/mcp?tools=all` | Every product the site exposes: Jira, Confluence, JSM, Goals, Projects, Loom, Talent, Teams, Assets, Focus, Jira Align, Capacity Planning, Artifacts and code search |
| **v1 — legacy auth endpoint** | `https://mcp.atlassian.com/v1/mcp/authv2` | The older generation, for a site or client that has not moved to v2 |
| **Custom URL** | anything `https://` | A proxy, a gateway, or a regional endpoint |

Saving re-registers the server with the new URL, so the tool list follows. The choice is stored in `$DSH_HOME/dsh-atlassian-mcp/config.json`.

## First run

The first start opens a browser for Atlassian OAuth consent. Approve it once; the grant is cached in `~/.mcp-auth/` and refreshed automatically afterwards. Until consent completes the server exposes no tools — no restart is needed, the tool list updates once connected.

The card shows the live connection status, so "no tools yet" is distinguishable from "waiting for consent".

## Tools

Registered as `mcp__atlassian__*`, covering:

- Confluence: CQL search, read/create/update pages, footer and inline comments, spaces, page descendants, HTML/ADF format guides.
- Jira: issue search (JQL), read/create/edit issues, transitions, comments, worklogs, links, project metadata.
- Shared: current user, accessible Atlassian sites (cloudId lookup), Teamwork Graph context.

Most Confluence and Jira tools take a `cloudId`; pass your site hostname (e.g. `example.atlassian.net`) or the UUID returned by `getAccessibleAtlassianResources`.

Write tools act on your real Atlassian site — scope tokens accordingly and treat them like the web UI.

## Notes

- Requires `npx` on the harness `PATH` on first run.
- Needs the MCP server manager (`ctx.mcpManager`), which the Web and Desktop profiles mount.
- OAuth scopes are fixed by Atlassian's remote server; the bundle requests no extra ones.
- To sign out, delete the matching entry under `~/.mcp-auth/`.

## Self-check

```sh
node check.mjs
```

Drives the runtime registration and the config route against a stubbed manager: default endpoint, preset switch, persistence, the https and same-origin guards, single-registration on re-mount, and disposal.

## License

MIT
