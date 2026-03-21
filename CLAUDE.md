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
| `api/client-onboarding.js` | Vercel serverless: Wix onboarding form -> updates Notion entry |
| `.github/workflows/fetch-reviews.yml` | Monthly cron to refresh reviews |
| `.env` | Local env vars (gitignored) |

## Wix-to-Notion Integration

### How It Works
1. Client submits Form 1 ("become a client") on haleywexler.com
2. Wix Automation POSTs to Vercel endpoint `/api/new-client`
3. Endpoint creates a new row in Notion "Client Files" database (prefixed with "New*")
4. Haley contacts client, sends them the onboarding form link
5. Client submits Form 2 ("client onboarding") - hidden page, URL access only
6. Wix Automation POSTs to Vercel endpoint `/api/client-onboarding`
7. Endpoint searches Notion by email, updates existing entry with onboarding details, creates two sub-pages (Preferences + Pantry)

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

**Key behaviors:**
- `getField(submissions, label)` extracts values by matching the label string (trimmed) exactly as it appears in the Wix form builder
- Individual checkboxes (pantry items, kitchen tools) come as separate entries with `value: "Checked"`
- Multi-select checkboxes (menu picks) come as ONE entry with all values comma-joined into a single string
- Some Wix labels have trailing spaces - always `.trim()` before comparing

### Form 1: "become a client" (new-client-form)
- **Wix form URL:** https://www.haleywexler.com/new-client-form
- **Endpoint:** `POST https://hw-private-chef.vercel.app/api/new-client`
- **Action:** Creates a new row in the Notion "Client Files" database
- **Name prefix:** All new entries are prefixed with "New*" (e.g., "New* Jane Doe") so Haley can identify new clients at a glance

**Field mapping:**

| Wix Form Label | Notion Target | Format |
|---------------|---------------|--------|
| Name | Name column (title) | "New* [full name]" |
| Email | Email column | As-is |
| Phone | Page body | **[FirstName]'s Cell:** (xxx) xxx-xxxx (strips +1) |
| How did you hear about me? | Page body | **How did you hear about me?** [response] |
| Provide a brief overview... | Page body | **Brief overview:** [response] |

### Form 2: "client onboarding" (client-onboarding)
- **Wix form URL:** https://www.haleywexler.com/client-onboarding (hidden page, URL access only)
- **Endpoint:** `POST https://hw-private-chef.vercel.app/api/client-onboarding`
- **Matching:** Searches Notion "Client Files" by email to find existing Form 1 entry
- **Fallback:** If no email match found, creates a new entry (prefixed with "New*")

**What Form 2 does to the client's Notion page:**

1. **Updates DB columns:** Address, Family Size, Allergies
2. **Appends to main page body** (right after Brief Overview from Form 1):
   - **Package:** [selected package]
   - **Grocery delivery:** [delivery preference]
3. **Creates sub-page: ❤️ [FirstName]'s Preferences** containing:
   - **Allergies:** [response]
   - **Dislikes/Avoid:** [swap/avoid response]
   - **Favorite Foods/More of:** [response]
   - **Want consistently each week:** [response]
   - **Eating/Food Preferences:** [response]
4. **Creates sub-page: 🍴 [FirstName]'s Pantry** containing:
   - **Pantry level:** [Bare Bones / Basic Staples / Fully Stocked]
   - **Pantry Items** (H3 header) with **In Stock:** and **Needs:** bullet lists
   - **Kitchen Items** (H3 header) with **In Stock:** and **Needs:** bullet lists
5. **Appends to main page body** (after sub-pages):
   - **First week's menu choices:** with Notion bullet points for each meal

**Sub-page names use the real first name** (not "New*"). The "New*" prefix is only on the database row Name column.

**Resulting page structure after both forms:**
```
New* Jane Doe (Name column)
├── Jane's Cell: (212) 555-1234          (Form 1)
├── How did you hear about me? Instagram  (Form 1)
├── Brief overview: Looking for...        (Form 1)
├── Package: small package (1-2 people)   (Form 2)
├── Grocery delivery: Deliver to front... (Form 2)
├── ❤️ Jane's Preferences                (Form 2 sub-page)
├── 🍴 Jane's Pantry                     (Form 2 sub-page)
└── First week's menu choices:            (Form 2)
    • Lemon Honey Salmon...
    • Miso Shrimp...
    • Beef and Black Bean Chili...
```

**Form 2 field mapping detail:**

| Wix Form Label | Destination | Notes |
|---------------|-------------|-------|
| Name | Match key / fallback create | |
| Email | Match key (search by email) | |
| Single choice | Main body | Cleaned label: "Package" |
| Grocery Delivery Address | Address DB column | |
| ...handle grocery delivery? | Main body | Cleaned label: "Grocery delivery" |
| ...describes your pantry... | Pantry sub-page | Cleaned label: "Pantry level" |
| [Each pantry item] | Pantry sub-page | "Checked" = In Stock, missing = Needs |
| [Each kitchen tool] | Pantry sub-page | "Checked" = In Stock, missing = Needs |
| How many people... | Family Size DB column | |
| Allergies or dietary restrictions | Allergies DB column + Preferences sub-page | |
| Favorite foods... | Preferences sub-page | "Favorite Foods/More of" |
| ...consistently each week? | Preferences sub-page | "Want consistently each week" |
| ...eating and food preferences... | Preferences sub-page | "Eating/Food Preferences" |
| ...swap from the above menus? | Preferences sub-page | "Dislikes/Avoid" |
| Please choose 3 meals... | Main body | Bulleted list, split by known meals |

### IMPORTANT: Menu Options Maintenance
The `MENU_OPTIONS` array in `api/client-onboarding.js` contains the 7 hardcoded meal descriptions from the Wix onboarding form. This is required because Wix joins multiple checkbox selections into one comma-separated string, and each meal description itself contains commas, so simple comma-splitting doesn't work.

**When Haley updates the menu options on the Wix form, you MUST update the `MENU_OPTIONS` array to match.** Otherwise menu picks will appear as one long unformatted string instead of individual bullet points.

Current menu options (as of 03/21/26):
1. Lemon Honey Salmon, Mini Roasted Potatoes and Greek Salad...
2. Miso Shrimp with Roasted Broccoli and Sesame Scallion Jasmine Rice
3. Beef and Black Bean Chili (corn, peppers, onions) Homemade Tortilla Strips...
4. Steak Taco Bowls - Lime Cumin Skirt Steak, Roasted Peppers and Onions...
5. Roasted Chicken Breasts (skin-on bone-in) with Brussels Sprout Quinoa Salad...
6. Maple Dijon Salmon, Roasted Delicata Squash and Side of Herby Couscous
7. Italian Turkey Meatballs with Red Sauce and Basil, Roasted Asparagus and Spaghetti...

### Checkbox Lists (Pantry + Kitchen Tools)
The `PANTRY_ITEMS` and `KITCHEN_TOOLS` arrays in `api/client-onboarding.js` define the full list of possible checkbox items. These must match the Wix form exactly. If Haley adds/removes items on the form, update these arrays.

**19 pantry items:** Olive Oil, Avocado Oil, Sesame Oil, Kosher Salt, Eggs, Sesame Seeds, Onion Powder/Garlic Powder/Basic Seasonings, Apple Cider Vinegar, Rice Wine Vinegar, Dijon Mustard, Soy Sauce, Honey, Maple Syrup, Miso, Quinoa, Brown Rice, Jasmine Rice, Breadcrumbs, Nuts

**8 kitchen tools:** Pots and Pans, Large and Medium Tupperware, Sheet Trays, Mixing Bowls and Cutting Boards, Tin Foil, Parchment Paper, Rice Cooker or Instapot, Blender

### Notion Database
- **Database:** Client Files (inline in Clients page)
- **Database ID:** `229f9bcd-7056-809e-bb0f-d35b804efac5`
- **Integration name:** "Wix Forms" (internal integration, must be connected to the Client Files database via Connections)
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

**Current automations:**

| Form | Webhook URL |
|------|-------------|
| become a client | `https://hw-private-chef.vercel.app/api/new-client` |
| client onboarding | `https://hw-private-chef.vercel.app/api/client-onboarding` |

### Adding a New Form Endpoint
1. Create `api/<endpoint-name>.js` in the project
2. Use `getField(submissions, 'Exact Label From Wix')` to extract fields - labels must match exactly (trim whitespace)
3. For checkbox fields: individual items come as separate entries with `value: "Checked"`; multi-select checkboxes come as one comma-joined string
4. Deploy: `vercel --prod --yes`
5. Create Wix Automation pointing to `https://hw-private-chef.vercel.app/api/<endpoint-name>`
6. Use "Entire payload" for body params
7. Test by submitting the form, then check `vercel logs` for the raw payload to verify field labels

### Edge Cases
- **Email mismatch between Form 1 and 2:** If a client uses a different email on the onboarding form, it creates a new entry instead of updating. Haley can manually merge in Notion. Future improvement: match by Notion page ID via personalized onboarding links.
- **Duplicate onboarding submissions:** Each Form 2 submission appends new sub-pages and body content. If a client submits twice, there will be duplicate Preferences/Pantry sub-pages. Clean up manually in Notion.

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
