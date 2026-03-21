# HW Private Chef

## Overview
Infrastructure for [haleywexler.com](https://haleywexler.com) (Wix Premium site). Two systems:
1. **Google Reviews Widget** - Embeddable review display, hosted on GitHub Pages
2. **Wix-to-Notion Integration** - Form submissions auto-create/update entries in Notion, hosted on Vercel

## Architecture

| System | Hosting | Purpose |
|--------|---------|---------|
| Reviews widget | GitHub Pages | Static reviews display embedded on Wix |
| Wix form webhooks | Vercel serverless | Receives Wix form submissions, writes to Notion |

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | Standalone widget UI (local dev/preview) |
| `reviews-widget.js` | Web Component for Wix Custom Element embed |
| `reviews.json` | Static review data (23 Google + 2 manual five-star reviews) |
| `fetch-reviews.js` | Node.js script to fetch reviews from SearchAPI.io |
| `api/new-client.js` | Vercel serverless: Wix "become a client" form -> Notion |
| `.github/workflows/fetch-reviews.yml` | Monthly cron to refresh reviews |
| `.env` | Local env vars (gitignored) |

## Wix-to-Notion Integration

### How It Works
1. Client submits a form on haleywexler.com
2. Wix Automation triggers "Send HTTP request" (POST) to Vercel endpoint
3. Vercel function parses the Wix payload and creates/updates a Notion database entry

### Wix Payload Format
Wix sends form data as `data.submissions` array of `{label, value}` objects:
```json
{
  "data": {
    "formName": "Become a client",
    "submissions": [
      { "label": "Name", "value": "Jane Doe" },
      { "label": "Email", "value": "jane@example.com" }
    ]
  }
}
```
The `getField(submissions, label)` helper extracts values by matching the label string exactly as it appears in the Wix form builder.

### Form 1: "become a client" (new-client-form)
- **Wix form URL:** https://www.haleywexler.com/new-client-form
- **Endpoint:** `POST https://hw-private-chef.vercel.app/api/new-client`
- **Action:** Creates a new row in the Notion "Client Files" database

**Field mapping:**

| Wix Form Label | Notion Target | Format |
|---------------|---------------|--------|
| Name | Name column (title) | As-is |
| Email | Email column | As-is |
| Phone | Page body | **[FirstName]'s Cell:** (xxx) xxx-xxxx (strips +1) |
| How did you hear about me? | Page body | **How did you hear about me?** [response] |
| Provide a brief overview... | Page body | **Brief overview:** [response] |

### Form 2: "client onboarding" (client-onboarding) - NOT YET BUILT
- **Wix form URL:** https://www.haleywexler.com/client-onboarding
- **Endpoint:** `POST https://hw-private-chef.vercel.app/api/client-onboarding`
- **Action:** Searches Notion "Client Files" by email, updates existing row
- **Fields:** Package, grocery delivery address, delivery handling, pantry level, pantry items (19 checkboxes), kitchen tools (8 checkboxes), family size, allergies, favorite foods, consistent weekly meal, food preferences, first week menu picks

### Notion Database
- **Database:** Client Files (inline in Clients page)
- **Database ID:** `229f9bcd-7056-809e-bb0f-d35b804efac5`
- **Integration name:** "Wix Forms" (internal integration)
- **Columns:** Name, Email, Phone Number, Address, Family Size, Portion Size, Allergies, Delivery Day, Card

### Vercel Deployment
- **Project:** hw-private-chef
- **URL:** https://hw-private-chef.vercel.app
- **Account:** eric-jungs-projects (GitHub OAuth via e11b)
- **Env vars (production):** `NOTION_TOKEN`, `NOTION_DATABASE_ID`

**Deploy commands:**
```bash
cd "/Users/erjung/Desktop/Apps/HW Private Chef"
vercel --prod --yes          # Deploy to production
vercel env ls                # List env vars
vercel logs hw-private-chef.vercel.app  # Stream runtime logs
```

**Env var gotcha:** When adding env vars via CLI, use `printf '%s'` not `echo` to avoid trailing newlines:
```bash
printf '%s' 'value_here' | vercel env add VAR_NAME production
```

### Wix Automation Setup (per form)
1. Wix Dashboard -> Automations -> + New Automation
2. Trigger: **Wix Forms -> Form is submitted** -> select the form
3. Action: **Send HTTP request**
   - Method: POST
   - Webhook URL: the Vercel endpoint URL
   - Body params: **Entire payload** (sends all fields automatically, no manual mapping needed)
4. Save and activate

### Adding a New Form Endpoint
1. Create `api/<endpoint-name>.js` in the project
2. Use `getField(submissions, 'Exact Label From Wix')` to extract fields - labels must match exactly
3. Deploy: `vercel --prod --yes`
4. Create Wix Automation pointing to `https://hw-private-chef.vercel.app/api/<endpoint-name>`
5. Use "Entire payload" for body params

## Google Reviews Widget

### Google Places
- **Business:** Haley Wexler Private Chef
- **Place ID:** `ChIJMVlUlSP2xksR4KIdsNGjCZg`
- **API:** SearchAPI.io `google_maps_reviews` engine (`num=20` per page to minimize calls)
- **API Key:** Shared with Flights First (stored as `SEARCHAPI_KEY` GitHub secret, and in local `.env`)

### Widget Design

#### Layout
- Vertical scrolling list, one card per row, max-width 931px (responsive)
- 3 pinned reviews (Laura O., Anna N., Anneka K.) shown first
- Remaining reviews sorted by most recent
- `index.html`: shows 5 initially, auto-loads 5 more on scroll (IntersectionObserver)
- `reviews-widget.js`: renders all reviews (no lazy loading in Custom Element version)

#### Typography
- **Font:** Poppins (Google Fonts)
- **Names:** 16px, Bold (700)
- **Review text:** 14px, Extra Light (200)
- **Line height:** 1.55 for review text, 1.2 for names

#### Card Structure
- Card: white bg, 1px #e0e0e0 border, 16px border-radius, 13px/16px padding
- Card gap: 8px
- Avatar: 36px circle (photo or initial placeholder)
- Name + stars nested vertically (2px gap), left-aligned with 3px margin offset
- Google G logo (30px, 2025 gradient design) right-aligned, vertically centered
- Stars: Material Design filled star, 16px, #FBBC04

#### Manual Reviews
- Reviews not from Google can be added directly to `reviews.json` with empty `thumbnail` and `date` fields
- Optional `avatarColor` field overrides the default gray (`#5f6368`) placeholder circle
- Empty dates sort to the end (after all Google reviews)

#### Assets (inline SVG)
- **Stars:** Material Design filled star path
- **Google G:** 2025 gradient logo with `linearGradient` fills

### Wix Embed (Custom Element)
1. Add Elements > Embed Code > Custom Element
2. Source: Server URL > `https://e11b.github.io/hw-private-chef/reviews-widget.js`
3. Tag Name: `google-reviews-widget`
4. Height auto-adjusts to content (no fixed height needed)

### Refresh Cycle
- GitHub Action runs 1st of each month at 8:00 AM UTC
- Also supports manual trigger via `workflow_dispatch`
- Auto-commits updated `reviews.json` if content changed

## GitHub
- **Account:** e11b
- **Repo:** hw-private-chef (public)
- **URL:** https://github.com/e11b/hw-private-chef
- **Hosting:** GitHub Pages from main branch
- **Live URL:** https://e11b.github.io/hw-private-chef/

## Local Development
- Serve locally: `python3 -m http.server 8888` from project root
- Fetch reviews locally: `node --env-file=.env fetch-reviews.js`
- Test webhook locally: `node --env-file=.env -e "require('./api/new-client')({method:'POST',body:{data:{submissions:[{label:'Name',value:'Test'},{label:'Email',value:'test@test.com'},{label:'Phone',value:'+15125550000'},{label:'How did you hear about me?',value:'test'},{label:'Provide a brief overview of what you are looking for',value:'test'}]}}},{status:()=>({json:console.log})})"`
