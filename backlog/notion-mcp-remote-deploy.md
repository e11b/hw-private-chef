---
title: Convert Notion MCP to remote Cloudflare Worker
priority: P6
status: pending
created: 2026-04-11
---

## Status — Parked in icebox (06/24/26)
~95% built but **uncommitted** in the working tree; **not deployed**. Local stdio (`notion-mcp/index.js`) remains the live path. Full state, architecture, bindings/secrets, done-vs-remaining, and resume steps live in [docs/notion-mcp-worker-handoff.md](../docs/notion-mcp-worker-handoff.md). **Trigger to resume:** Haley needs Notion from phone/browser, or we retire the local stdio path.

## Problem
MCP server runs locally on Haley's Mac (stdio transport). Only works in Claude Desktop Chat tab. No access from iOS, browser, or Cowork.

## Impact
Haley can't query Notion from her phone or browser. Menu generation workflow locked to desktop.

## Core Ask
Deploy the MCP server as a Cloudflare Worker with OAuth via Access for SaaS. All Claude surfaces get Notion access.

## Components
- [x] Scaffold from CF Access template (`remote-mcp-cf-access`)
- [x] Port 13 tools from `index.js` (`registerTool` -> `server.tool`, `process.env` -> `env`)
- [x] Configure `wrangler.jsonc`, KV namespace (KV created; replaced wrangler.toml)
- [ ] Create Access for SaaS app in CF Zero Trust dashboard
- [ ] Set Worker secrets (6 auth + NOTION_TOKEN)
- [ ] Deploy with `wrangler deploy`
- [ ] Add as connector in Haley's Claude (desktop, browser, iOS)
- [ ] Test all 13 tools from each surface
- [ ] Remove local stdio config from Haley's `claude_desktop_config.json`
- [ ] Archive `e11b/haley-notion-mcp` repo

## Acceptance Criteria
- All 13 tools work from Claude Desktop, claude.ai browser, and iOS app
- Haley authenticates via Google or email OTP (one-time per device)
- Eric can deploy updates via `wrangler deploy` without touching Haley's machine
