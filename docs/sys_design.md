# HW Private Chef - System Design

Technical architecture. For business context, read [overview.md](overview.md) first. For damage prevention rules, see `CLAUDE.md`.

## Index

| Doc | Covers |
|-----|--------|
| [overview.md](overview.md) | Business context, terminology, Notion workspace, rate limits |
| [handoff.md](handoff.md) | Full setup handoff (Claude Project instructions, memory files, decisions log) |

## Architecture

Three systems serve Haley's business:

| System | Location | Hosting | Purpose |
|--------|----------|---------|---------|
| Notion MCP server | `notion-mcp/` | Cloudflare Workers (planned, currently local stdio) | Claude reads/writes Notion |
| Wix form webhooks | `wix-integration/api/` | Vercel serverless | New client + onboarding forms write to Notion |
| Reviews widget | repo root + `wix-integration/fetch-reviews.js` | GitHub Pages | Google reviews display on haleywexler.com |

## Notion MCP Server (`notion-mcp/`)

Custom MCP server providing Claude with full Notion workspace access. Uses `@modelcontextprotocol/sdk` + `@notionhq/client` v5.

### Current State: Local Stdio
- Runs on Haley's Mac as a subprocess spawned by Claude Desktop
- Configured in `claude_desktop_config.json`
- Auth: `NOTION_TOKEN` env var (static integration token)
- Works in Claude Desktop Chat tab only (not browser, not iOS)

### Planned: Remote Cloudflare Worker
- Cloudflare Workers + Access for SaaS (OAuth)
- Works on all Claude surfaces (desktop, browser, iOS)
- Auth: Cloudflare Access (Google login or email OTP)
- Deploy: `wrangler deploy` from `notion-mcp/`

### 13 Tools

| Category | Tool | Notion SDK Method |
|----------|------|-------------------|
| Database | `query_database` | `dataSources.query()` |
| Database | `get_database` | `dataSources.retrieve()` |
| Page | `get_page` | `pages.retrieve()` |
| Page | `get_page_content` | `pages.retrieveMarkdown()` |
| Page | `create_page` | `pages.create()` |
| Page | `update_page` | `pages.update()` |
| Block | `get_block_children` | `blocks.children.list()` |
| Block | `append_blocks` | `blocks.children.append()` |
| Block | `update_block` | `blocks.update()` |
| Block | `delete_block` | `blocks.delete()` |
| Search | `search` | `search()` |
| Comment | `get_comments` | `comments.list()` |
| Comment | `add_comment` | `comments.create()` |

All tools return paginated results with `has_more`/`next_cursor` where applicable. Default page_size: 25 for queries, 100 for block children/comments.

Error handling: catches Notion API errors by code (`unauthorized`, `object_not_found`, `validation_error`, `rate_limited`) and returns human-readable guidance.

### SDK v5 Migration Notes
- `databases.query()` replaced by `dataSources.query()` (data_source_id, not database_id)
- `pages.create()` parent uses `{ type: "data_source_id" }`
- `search()` filter value is `"data_source"` not `"database"`
- `pages.retrieveMarkdown()` added in v5.11 (returns page body as markdown)

## Wix Form Integration (`wix-integration/`)

Two Vercel serverless endpoints receiving Wix form webhooks.

### Flow
1. Client submits form on haleywexler.com
2. Wix Automation POSTs to Vercel endpoint
3. Endpoint writes to Notion "Client Files" database

### Endpoints

| Endpoint | Trigger | Action |
|----------|---------|--------|
| `/api/new-client` | "Become a client" form | Creates new row with "New*" prefix |
| `/api/client-onboarding` | Onboarding form (hidden page) | Matches by email, updates entry, creates Preferences + Pantry sub-pages |

### Deployment
- Vercel project: `hw-private-chef`, account: `eric-jungs-projects`
- URL: https://hw-private-chef.vercel.app
- Root directory: `wix-integration` (must be set in Vercel project settings)
- Env vars: `NOTION_TOKEN`, `NOTION_DATABASE_ID`
- Uses `@notionhq/client` v2.x (separate from MCP server's v5)

### Maintenance Arrays
Three hardcoded arrays in `api/client-onboarding.js` must match the Wix form exactly:
- `MENU_OPTIONS` (7 meal descriptions, needed because Wix comma-joins multi-select)
- `PANTRY_ITEMS` (19 items)
- `KITCHEN_TOOLS` (8 items)

When Haley updates the Wix form, update these arrays.

## Reviews Widget (repo root + `wix-integration/`)

Google reviews display embedded on haleywexler.com via Wix Custom Element.

| File | Purpose |
|------|---------|
| `reviews-widget.js` (root) | Web Component for Wix embed |
| `reviews.json` (root) | Cached review data (Google + manual) |
| `index.html` (root) | Local preview |
| `wix-integration/fetch-reviews.js` | Fetches from SearchAPI.io |
| `.github/workflows/fetch-reviews.yml` | Monthly refresh cron |

Widget files live at repo root because GitHub Pages only serves from `/` or `/docs`.
- Hosted on GitHub Pages: https://e11b.github.io/hw-private-chef/
- 3 pinned reviews shown first, rest sorted by recency
- Manual reviews: add to `reviews.json` with `"manual": true`
- Place ID: `ChIJMVlUlSP2xksR4KIdsNGjCZg`

## Infrastructure

| Service | What | Cost |
|---------|------|------|
| Vercel | Wix form endpoints | Free tier |
| GitHub Pages | Reviews widget hosting | Free |
| Cloudflare Workers | Notion MCP server (planned) | Free tier |
| Cloudflare Access | OAuth for MCP (planned) | Free tier (50 users) |
| Notion | Client database | Plus plan |
| SearchAPI.io | Google reviews fetch | Shared with Flights First |

## GitHub

| Repo | Visibility | Purpose |
|------|-----------|---------|
| `e11b/hw-private-chef` | Public | This monorepo (wix + reviews + mcp + docs) |
| `e11b/haley-notion-mcp` | Private | Original MCP server (to be archived after migration) |
