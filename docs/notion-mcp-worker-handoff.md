# Notion MCP — Remote Cloudflare Worker (Parked WIP)

**Status:** Parked in icebox — backlog P6 ([notion-mcp-remote-deploy.md](../backlog/notion-mcp-remote-deploy.md)). ~95% built, sitting **uncommitted** in the working tree as of 06/24/26. **Not deployed.** The local stdio server (`notion-mcp/index.js`) is still the live path and is untouched.

This doc exists so the work is resumable without re-deriving it. It is a context/handoff reference, not an instruction to deploy.

## What it is

Converts the Notion MCP server from a **local stdio process** (works only in Claude Desktop on Haley's Mac) into a **remote, OAuth-protected Cloudflare Worker**, so Haley can query/write Notion from any Claude surface (desktop, browser, iOS). Auth is via Cloudflare Access for SaaS (OAuth 2.1), locked to Haley.

## Why it's parked

Local stdio covers the current desktop-bound menu-generation workflow, so remote access isn't blocking. OAuth/CSRF code is security-sensitive and unreviewed. **Trigger to resume:** Haley needs Notion from phone/browser, or we're ready to retire the local stdio path.

## Target architecture

- **Worker entry `src/index.ts`** — a Durable Object (`NotionMCP`, binding `MCP_OBJECT`, SQLite migration `v1`) implementing the MCP server via the `agents` SDK. Enforces OAuth before registering tools.
- **OAuth** via `@cloudflare/workers-oauth-provider` + Cloudflare Access for SaaS:
  - `src/access-handler.ts` — `/authorize` + `/callback`, PKCE, JWT verify against Access JWKS, approval dialog UI.
  - `src/workers-oauth-utils.ts` — HMAC-signed state tokens, one-time CSRF cookies (RFC 9700), approved-client tracking.
- **13 tools** reused from `src/tools.ts` (unchanged; same set as `index.js`).
- **KV `OAUTH_KV`** (id `e2ecf36513864e70adeff0ac45df7d1e` — already created) stores OAuth grants.

## Config — `notion-mcp/wrangler.jsonc`

- name `hw-notion-mcp`, main `src/index.ts`, `nodejs_compat`, dev port 8788, observability on.
- Durable Object: `NotionMCP` / `MCP_OBJECT` (SQLite `v1` migration).
- KV: `OAUTH_KV`.
- **7 required secrets:** `NOTION_TOKEN`, `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET`, `ACCESS_TOKEN_URL`, `ACCESS_AUTHORIZATION_URL`, `ACCESS_JWKS_URL`, `COOKIE_ENCRYPTION_KEY`.
- Deps: `@cloudflare/workers-oauth-provider` ^0.4.0, `agents` ^0.9.0, `@notionhq/client` ^5.17.0, `zod` ^4.3.6; `wrangler` ^4.79.0. (`package.json` bumped to `2.0.0`.)

## Done vs remaining

**Done (in the uncommitted WIP):** Worker scaffold + Durable Object (`src/index.ts`), OAuth handler + utils, `wrangler.jsonc`, deps, KV namespace created (id present), 13 tools ported. `wrangler.toml` deleted (replaced by `wrangler.jsonc`).

**Remaining (per backlog Components):**
- Create the Access for SaaS app in the CF Zero Trust dashboard.
- Set the 7 Worker secrets (`wrangler secret put ...`).
- `wrangler deploy`.
- Add as a connector in Haley's Claude (desktop, browser, iOS); authenticate once per device.
- Test all 13 tools from each surface.
- Remove local stdio config from Haley's `claude_desktop_config.json`.
- Archive the old `e11b/haley-notion-mcp` repo.

## Known TODO in the code

- `src/access-handler.ts` (~line 211): JWKS public key is fetched from `ACCESS_JWKS_URL` on every token verify — should be cached in KV.

## To resume

1. Review the uncommitted WIP carefully — it's OAuth/CSRF code; run it through architect + auditor before trusting it.
2. Commit it (currently uncommitted in the tree).
3. Work the Remaining checklist above.
4. Acceptance: all 13 tools work from Desktop + browser + iOS; Haley authenticates once per device; Eric can `wrangler deploy` without touching her machine.

## Caveat — two copies of the tools

Per `CLAUDE.md`: tool definitions live in BOTH `index.js` (stdio) and `src/tools.ts` (Worker). Until the Worker fully replaces stdio, any tool change must update both.
