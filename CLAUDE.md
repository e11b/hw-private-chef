# HW Private Chef - Google Reviews Widget

## Overview
Embeddable Google Reviews widget for [haleywexler.com](https://haleywexler.com) (Wix site). Displays 5-star reviews from Google Places for "Haley Wexler Private Chef" as a vertical scrolling list, hosted on GitHub Pages and embedded via Wix HTML iframe.

## Architecture
- **Static site** - single `index.html` with inline CSS/JS, no build step
- **Zero runtime API cost** - reviews fetched monthly via GitHub Action, served as static `reviews.json`
- **GitHub Pages** for hosting

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | Widget UI - review cards with lazy loading |
| `reviews.json` | Static review data (23 five-star reviews) |
| `fetch-reviews.js` | Node.js script to fetch reviews from SearchAPI.io |
| `.github/workflows/fetch-reviews.yml` | Monthly cron to refresh reviews |

## Google Places
- **Business:** Haley Wexler Private Chef
- **Place ID:** `ChIJMVlUlSP2xksR4KIdsNGjCZg`
- **API:** SearchAPI.io `google_maps_reviews` engine (`num=20` per page to minimize calls)
- **API Key:** Shared with Flights First (stored as `SEARCHAPI_KEY` GitHub secret)

## Widget Design

### Layout
- Vertical scrolling list, one card per row, max-width 700px
- 3 pinned reviews (Laura O., Anna N., Anneka K.) shown first
- Remaining reviews sorted by most recent
- Shows 5 initially, auto-loads 5 more on scroll (IntersectionObserver)

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
- **Repo:** hw-private-chef (to be created)
- **Hosting:** GitHub Pages from main branch

## Refresh Cycle
- GitHub Action runs 1st of each month at 8:00 AM UTC
- Also supports manual trigger via `workflow_dispatch`
- Auto-commits updated `reviews.json` if content changed
