# HW Private Chef - Google Reviews Widget

## Overview
Embeddable Google Reviews widget for [haleywexler.com](https://haleywexler.com) (Wix Premium site). Displays 5-star reviews from Google Places for "Haley Wexler Private Chef" as a vertical scrolling list. Hosted on GitHub Pages, embedded on Wix via Custom Element (no iframe).

## Architecture
- **Static site** - `index.html` for standalone preview, `reviews-widget.js` Web Component for Wix embed
- **Zero runtime API cost** - reviews fetched monthly via GitHub Action, served as static `reviews.json`
- **GitHub Pages** for hosting
- **Shadow DOM** - Web Component encapsulates styles, no conflicts with Wix site CSS

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | Standalone widget UI (local dev/preview) |
| `reviews-widget.js` | Web Component for Wix Custom Element embed |
| `reviews.json` | Static review data (23 five-star reviews) |
| `fetch-reviews.js` | Node.js script to fetch reviews from SearchAPI.io |
| `.github/workflows/fetch-reviews.yml` | Monthly cron to refresh reviews |
| `.env` | Local API key (gitignored) |
| `.gitignore` | Excludes .env and node_modules |

## Google Places
- **Business:** Haley Wexler Private Chef
- **Place ID:** `ChIJMVlUlSP2xksR4KIdsNGjCZg`
- **API:** SearchAPI.io `google_maps_reviews` engine (`num=20` per page to minimize calls)
- **API Key:** Shared with Flights First (stored as `SEARCHAPI_KEY` GitHub secret, and in local `.env`)

## Widget Design

### Layout
- Vertical scrolling list, one card per row, max-width 931px (responsive - shrinks on smaller screens)
- 3 pinned reviews (Laura O., Anna N., Anneka K.) shown first
- Remaining reviews sorted by most recent
- `index.html`: shows 5 initially, auto-loads 5 more on scroll (IntersectionObserver)
- `reviews-widget.js`: renders all reviews (no lazy loading in Custom Element version)

### Typography
- **Font:** Poppins (Google Fonts)
- **Names:** 16px, Bold (700)
- **Review text:** 14px, Extra Light (200)
- **Line height:** 1.55 for review text, 1.2 for names

### Card Structure
- Card: white bg, 1px #e0e0e0 border, 16px border-radius, 13px/16px padding
- Card gap: 8px
- Avatar: 36px circle (photo or initial placeholder)
- Name + stars nested vertically (2px gap), left-aligned with 3px margin offset
- Google G logo (30px, 2025 gradient design) right-aligned, vertically centered
- Stars: Material Design filled star, 16px, #FBBC04

### Assets (inline SVG)
- **Stars:** Material Design filled star path
- **Google G:** 2025 gradient logo with `linearGradient` fills

## GitHub
- **Account:** e11b
- **Repo:** hw-private-chef (public)
- **URL:** https://github.com/e11b/hw-private-chef
- **Hosting:** GitHub Pages from main branch
- **Live URL:** https://e11b.github.io/hw-private-chef/

## Wix Embed (Custom Element)
1. Add Elements > Embed Code > Custom Element
2. Source: Server URL > `https://e11b.github.io/hw-private-chef/reviews-widget.js`
3. Tag Name: `google-reviews-widget`
4. Height auto-adjusts to content (no fixed height needed)

## Local Development
- Serve locally: `python3 -m http.server 8888` from project root
- Fetch reviews locally: `node --env-file=.env fetch-reviews.js`

## Refresh Cycle
- GitHub Action runs 1st of each month at 8:00 AM UTC
- Also supports manual trigger via `workflow_dispatch`
- Auto-commits updated `reviews.json` if content changed
