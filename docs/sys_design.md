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
| Notion MCP server | `notion-mcp/` | Local stdio (remote CF Worker conversion parked — see [handoff](notion-mcp-worker-handoff.md)) | Claude reads/writes Notion |
| Wix form webhooks | `wix-integration/api/` | Vercel serverless | Onboarding form creates Notion entries; become-a-client is a no-op |
| Reviews widget | repo root + `wix-integration/fetch-reviews.js` | GitHub Pages | Google reviews display on haleywexler.com |

## Notion MCP Server (`notion-mcp/`)

Custom MCP server providing Claude with full Notion workspace access. Uses `@modelcontextprotocol/sdk` + `@notionhq/client` v5.

### Current State: Local Stdio
- Runs on Haley's Mac as a subprocess spawned by Claude Desktop
- Configured in `claude_desktop_config.json`
- Auth: `NOTION_TOKEN` env var (static integration token)
- Works in Claude Desktop Chat tab only (not browser, not iOS)

### Parked (icebox): Remote Cloudflare Worker
~95% built but uncommitted + undeployed (backlog P6). Converts to a Cloudflare Worker + Access for SaaS (OAuth) so all Claude surfaces (desktop, browser, iOS) get access. Full state, bindings, secrets, and resume steps: [notion-mcp-worker-handoff.md](notion-mcp-worker-handoff.md).

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
3. Onboarding endpoint creates a Notion "Client Files" row; become-a-client is a no-op (returns 200, no write)

### Endpoints

| Endpoint | Trigger | Action |
|----------|---------|--------|
| `/api/new-client` | "Become a client" form | No-op (returns 200, no Notion write); leads live in Wix responses |
| `/api/client-onboarding` | Onboarding form (hidden page) | Always creates a new "New*" row, `Status`=Meal Prep Client (no email dedup); properties (Email, Phone Numbers, Address, Card, Location, Allergies) + in-body toggles (Preferences, Kitchen, Pantry (copy of the pantry template), Menu Archives), menu choices + First Menu Swaps + "Other form answers" |

### Onboarding row build (`client-onboarding.js`, updated 10/09/26)

| Step | Call | Must succeed | On failure |
|------|------|---|---|
| 1 | In parallel: Census geocoder on the 5 address fields (5s cap); `pages.retrieveMarkdown` of the pantry template (5s cap) | No | No `Location`, 📍 callout on page / pantry placeholder stays |
| 2 | `pages.create` (properties + full body, one call) | Yes | `validation_error` → fallback row (title + ⚠️ callout + raw answers), 200. Timeout/5xx → 500 so Wix retries |
| 3 | `pages.retrieveMarkdown` + `pages.updateMarkdown` replaces the pantry placeholder with the filled template | No | Placeholder (lists the ticked boxes) stays in the Pantry toggle |
| 4 | `blocks.children.list` → `dataSources.retrieve` (archive) → `views.create` after the Menu Archives toggle | No | Placeholder line stays in the toggle |
| 5 | `pages.retrieveMarkdown` + `pages.updateMarkdown` moves the view into the toggle, deletes placeholder | No | View sits below the toggle, placeholder stays |

- **Once the row exists the endpoint always returns 200** (a Wix retry would duplicate the row). Each call in steps 3-5 is skipped once the request is 20s old. A payload with no form answers returns 400 and creates nothing.
- **Pantry:** the template is Haley's "pantry template for wix" row in Client Rolodex (`PANTRY_TEMPLATE_PAGE_ID`), read on every submission, so her edits apply to the next client with no deploy. Every item is unchecked, then each ticked form box checks the template item with the same name (case/spacing ignored), else its `PANTRY_ALIASES` names (exact name wins, so adding an item named like the form box retires its alias). Any ticked box that isn't in `KITCHEN_TOOLS` counts as a pantry box (a renamed kitchen box or a new consent checkbox would land in the pink note). Ticked kitchen boxes also check any template item with the same name (today Parchment Paper and Tin Foil, in Staples) but never go in the note. A ticked box with no template match goes in a pink note line above the list. The 136+ block list exceeds the 100-children cap of `pages.create`, hence the post-create markdown write; it is one call, so the list lands whole or not at all. Template markdown with any tag other than `<br>`, `<span color/underline>`, `<empty-block/>` is refused (a `<database>`/`<page>` tag in a markdown write moves that block out of the template), as are images, a truncated read, unknown blocks, and a template with no to-dos. Notion's markdown export turns the template's pink highlights into pink text (verified 10/09/26); the note text is kept. Client-typed text (Pantry level) is written as JSON blocks, never through markdown.
- **Why the move:** the Notion API rejects a linked view whose parent is a toggle (`cannot contain a linked database`); creating at page level then indenting it via the markdown endpoint keeps the same database/view/filter (tested 10/08/26).
- **Menu Archives view:** live Weekly Schedule Archive (data source `3a7f9bcd-7056-8029-9c24-000b22ab808a`), filter `🧑‍🤝‍🧑 Client Rolodex` contains the new page, sort Cook Date desc, show Client_Date + Menu. Properties referenced by id (`ARCHIVE_PROP`) so renames don't break it. Requires the "Wix Forms (internal)" connection on Weekly Schedule.
- **Location:** Notion's place property requires lat/lon (address-only writes fail validation). Geocode is accepted only for one distinct match in the typed state (without a zip, Census returned Kansas/Montana matches for a 5th Ave, NY address).
- **Card:** stored only when the answer has exactly 4 digits (or no digits, e.g. "paypal"); anything else is left blank with a ⚠️ callout to check the Wix submission (Card rolls up into every archive row). Separately, `richText()` and the payload log replace any 13+ digit number (any separators or digit script) with `[number hidden]`, so a full card typed into any field never reaches Notion or the logs.
- **Callouts at top of page** are the failure channel Haley sees (Hobby runtime logs expire after 1 hour): no email, full card number, no map pin, fallback row.
- **Other form answers:** a per-request reader records which answers were mapped; any other non-empty answer (except "Not checked") lands in a `📝 Other form answers` toggle, so a form edit never silently drops data.
- Long answers are split at Notion's 2000-char rich_text limit. Notion client: `timeoutMs` 10000, `maxRetryDelayMs` 3000.

### Deployment
- Vercel project: `hw-private-chef`, account: `eric-jungs-projects`
- URL: https://hw-private-chef.vercel.app
- Root directory: `wix-integration` (must be set in Vercel project settings)
- Env vars: `NOTION_TOKEN`, `NOTION_DATABASE_ID`
- Uses `@notionhq/client` v5.x (aligned with MCP server)
- Deploy from the MBP (`vercel` CLI is not installed on the Mini); commit/push on the Mini
- Runtime logs (Hobby keeps 1 hour): `vercel logs --no-branch --environment production --since 30m --json --expand` from repo root. Without `--no-branch` the CLI filters to the current git branch and CLI-deployed production logs come back empty (10/08/26)

### Maintenance Arrays
Hardcoded arrays in `api/client-onboarding.js` that must match the Wix form exactly:
- `MENU_OPTIONS` (9 meal descriptions, needed because Wix comma-joins multi-select)
- `KITCHEN_TOOLS` (9 items; "Mixing Bowls" and "Cutting Boards" are separate checkboxes)
- `PANTRY_ALIASES` (form boxes whose name differs from the template item: Rice Wine Vinegar, Dijon Mustard, Flour, Breadcrumbs, Sugar, Tin Foil). The form's 29 pantry boxes (10/09/26) need no list: a new box named like a template item works as is; otherwise add the item to the template or an alias here.

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
