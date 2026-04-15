# HW Private Chef - Business Overview

Read this first. Covers who Haley is, what her business does, and how she uses this system.

## The Business

Haley Wexler runs a high-touch personal chef / meal planning service for ~20-25 wealthy clients in the NYC area. This is a premium, personalized service where accuracy and client-specific customization matter more than efficiency. Clients are paying for meals tailored to their exact dietary restrictions, preferences, pantry contents, and recent history.

## Terminology (strict, Haley will correct you)

| Term | Meaning |
|------|---------|
| Menu | ONE dish/meal item (e.g. "Korean Beef Bulgogi Bowls with white rice and cucumber salad") |
| Order | ONE delivery containing 3-5 menus |
| Base set | The 3-5 dishes Haley prepped for the week, starting point for per-client customization |
| Portion Size | Client property that encodes menu count per order (e.g. "1 lb - 4 meals" = 4 menus) |

Never use "menu" to refer to a collection of dishes. Use "order" or "set of menus."

## People

- **Haley Wexler** - the chef. Uses Claude (Pro plan) for menu generation. macOS, username `haleywexler`. Not a developer. Needs click-by-click instructions for anything technical.
- **Eric** - technical contact. Manages infrastructure via Claude Code (Max plan, separate account). Builds and maintains all systems in this repo.

## Haley's Weekly Workflow

Haley uses a persistent Claude Project called **"Menu Generation"** with cached instructions (see `docs/handoff.md` §7a/§7b for the exact instruction text). This keeps per-conversation cost low.

**Claude instructions are split across two layers:**
- **Global instructions** (Settings > Custom Instructions): terminology, Notion IDs, rate-limit rules. Apply to all conversations.
- **Project instructions** (Menu Generation project): the 9-step workflow, output format, hard rules. Apply only inside the project.

Each week, Haley:

1. Fills in 3-5 base dishes in Notion's Weekly Menus page for that week
2. Opens a new conversation in the Menu Generation project for each client order
3. Tells Claude the client name, delivery day (S/M/T/W/TR = Sun/Mon/Tue/Wed/Thu), and target week
4. Claude fetches base menus from Weekly Menus
5. Claude fetches client data from Client Files (Portion Size, Allergies, Preferences sub-page, Pantry sub-page, last 2 dated menu entries for overlap check)
6. Claude selects and adapts menus matching the client's Portion Size count
7. Haley iterates 2-3 rounds (first-pass is never correct for wealthy clients)
8. On explicit approval ("save it"), Claude writes menus to the client's page body (new dated heading + bullet list, positioned after Preferences/Pantry sub-pages, before older entries). Uses `append_blocks` with the `after` parameter for positional insertion.
9. Repeat for ~20 clients/week. One client per conversation, always.

Every week every menu is different. There are no "stable" clients where drafts land on first pass. Budget the full iteration cycle for every client, every week.

## Notion Workspace

All client data lives in Notion, accessed via the custom MCP server ("HW Claude" integration).

### Client Files Database
- **ID:** `229f9bcd-7056-809e-bb0f-d35b804efac5`
- **Data source ID:** `229f9bcd-7056-8017-a65b-000bb42f1fe8`
- ~27 rows: mix of active clients, "New*" prospects, and placeholders
- Properties: Name, Phone, Address, Email, Portion Size, Allergies, Delivery Day, Family Size, Card

Each client's page body contains:
1. Contact info blocks at top
2. Sub-page: `<Name>'s Preferences` (dietary restrictions, favorites, dislikes, hard rules)
3. Sub-page: `<Name>'s Pantry` (current staples as checkbox lists by category)
4. Sometimes: "Spice Cabinet", "Notes for the Cook" sub-pages
5. Menu history: dated headings (e.g. `4/15`, `3/30`) each followed by bullet lists of that order's menus. Newest at top.

### Weekly Client Orders
- **Page ID:** `287f9bcd-7056-80fc-9ea5-ed5e2db726a9`
- Source of truth for who's active each week
- Contains inline databases per week (titled `4/19`, `4/12`, etc.)
- Each row = one order. Title format: `M Amy Pack` (M = Monday delivery)
- A client can have multiple orders per week (e.g. Monday + Thursday)
- Top of page: `clients out` and `cooks out` notes with exceptions

### Weekly Menus
- **Page ID:** `326f9bcd-7056-80e1-88f6-dca6ea06f19b`
- Where base menus for each week live (Haley fills these in)
- Inline database "Weekly Menus" (DB ID: `33ff9bcd-7056-80b9-a59a-d02a3407eb79`, data source: `33ff9bcd-7056-80dd-9d4f-000b357ca938`)
- Each row = one week, titled `M/DD Menus` (e.g. `4/19 Menus`)
- Base dishes are content blocks inside each row-page

### Pages NOT used by the workflow
Do not confuse these with active workflow pages:
- **Clients** (`224f9bcd-7056-802b-b5dd-c27c3cfbf0f3`): parent page for client management, not the database
- **Ordered Week Of (haley)** (`225f9bcd-7056-805d-9d7b-d260b8c703b7`): legacy personal tracker, NOT the active-clients source
- **Menu Ideas**, **Menu Planning Guide**, **Client Archives**: reference/scratch pages

### Integration Tokens

| Integration | Purpose | Used by |
|---|---|---|
| HW Claude | Full read/write, MCP server | Claude Desktop, Claude Code |
| Wix Forms | Write-only, form webhooks | Vercel endpoints |

## Rate Limits

Haley is on Claude Pro. Key constraints:
- 5-hour rolling session limit + weekly limit
- Prefer Sonnet over Opus (~5x cheaper per token)
- Per-client conversation: ~15-20K tokens including iteration
- Weekly total: ~360-410K tokens across ~20 clients
- Navigate Notion directly via IDs, never search broadly
- One client per conversation (batching kills the budget)

## Token Footprint (measured 04/11/26)

- Full pull of all 27 clients + body + sub-pages: ~148K tokens
- Average: ~5,500 tokens/client
- Heaviest: Meg & Jack (22K), Laura O'Donnell (~15K)
- Active-only subset (~20 clients): ~135-140K tokens
