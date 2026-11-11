# dsh-atlassian-mcp

Confluence and Jira tools for [DeepSeek Harness](https://github.com/deepseek-ai/dsh), backed by Atlassian's remote MCP server (`https://mcp.atlassian.com/v1/mcp/authv2`). OAuth and token refresh are handled by [`mcp-remote`](https://www.npmjs.com/package/mcp-remote), so this bundle carries no credentials.

## Install

```bash
# from a DSH session
plugin_manager(action: "install_bundle", target: "dsh-atlassian-mcp")
```

Or point `install_bundle` at a local checkout of this repository.

## First run

The first start opens a browser for Atlassian OAuth consent. Approve it once; the token is cached in `~/.mcp-auth/` and refreshed automatically afterwards. Until consent completes, the server exposes no tools — no restart is needed, the tool list updates once connected.

## Tools

Registered as `mcp__atlassian__*`, covering:

- Confluence: CQL search, read/create/update pages, footer and inline comments, spaces, page descendants, HTML/ADF format guides.
- Jira: issue search (JQL), read/create/edit issues, transitions, comments, worklogs, links, project metadata.
- Shared: current user, accessible Atlassian sites (cloudId lookup), Teamwork Graph context.

Most Confluence and Jira tools take a `cloudId`; pass your site hostname (e.g. `example.atlassian.net`) or the UUID returned by `getAccessibleAtlassianResources`.

Write tools act on your real Atlassian site — scope tokens accordingly and treat them like the web UI.

## Notes

- Requires `npx` on the harness `PATH` on first run.
- OAuth scopes are fixed by Atlassian's remote server; the bundle requests no extra ones.
- To sign out, delete the matching entry under `~/.mcp-auth/`.

## License

MIT
