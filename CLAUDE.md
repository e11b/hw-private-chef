# HW Private Chef

Monorepo for Haley Wexler's personal chef business infrastructure. For business context read `docs/overview.md`. For architecture read `docs/sys_design.md`.

## Structure

| Directory | What | Hosting |
|-----------|------|---------|
| `notion-mcp/` | Custom Notion MCP server (13 tools) | Local stdio (Cloudflare Workers planned) |
| `wix-integration/` | Wix form webhooks + review fetcher | Vercel |
| root (`reviews-widget.js`, `reviews.json`, `index.html`) | Reviews widget | GitHub Pages (serves from `/`) |
| `docs/` | Business overview, system design, handoff | N/A |
| `backlog/` | Work items | N/A |

## Notion MCP Server (`notion-mcp/`)

- `@notionhq/client` **v5** (uses `dataSources.query`, not `databases.query`)
- `@modelcontextprotocol/sdk` v1.29+ with stdio transport
- Plain JS, ESM, no build step. Run: `node notion-mcp/index.js`
- Requires `NOTION_TOKEN` env var
- **Two copies of tools:** `index.js` (plain JS, local stdio) and `src/tools.ts` (TS, CF Worker). Update BOTH when changing tools.

## Wix Integration (`wix-integration/`)

- `@notionhq/client` **v2** (different from MCP server, do NOT cross-upgrade)
- Vercel serverless, root directory set to `wix-integration` in Vercel project settings
- Deploy: `cd wix-integration && vercel --prod --yes`
- Env vars (Vercel production): `NOTION_TOKEN`, `NOTION_DATABASE_ID`
- Three maintenance arrays in `api/client-onboarding.js` must match Wix form: `MENU_OPTIONS`, `PANTRY_ITEMS`, `KITCHEN_TOOLS`

## Notion Integrations (separate tokens)

| Integration | Scope | Used by |
|---|---|---|
| HW Claude | Full read/write | MCP server |
| Wix Forms | Write-only | Vercel endpoints |

Do NOT use the Wix Forms token for the MCP server or vice versa.

**Credentials:** `docs/handoff.md` and `wix-integration/.env` contain plaintext tokens. Both are gitignored. Never commit either file. This is a public repo.

## Reviews Widget

- Hosted on GitHub Pages from repo root (Pages only serves from `/` or `/docs`)
- `reviews-widget.js`, `reviews.json`, `index.html` live at repo root
- `wix-integration/fetch-reviews.js` fetches from SearchAPI.io, writes to root `reviews.json`
- Monthly refresh via `.github/workflows/fetch-reviews.yml`
- Manual reviews: add to `reviews.json` with `"manual": true`
- After JS code changes: bump `?v=X` in Wix Custom Element Source URL
