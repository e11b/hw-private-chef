---
title: Update Vercel root directory for monorepo
priority: P1
status: pending
created: 2026-04-11
---

## Problem
Wix integration files moved from repo root to `wix-integration/`. Vercel still expects `api/` at root.

## Impact
Next Vercel deploy will fail unless root directory is updated.

## Core Ask
Set Vercel project root directory to `wix-integration`.

## Components
- [ ] Vercel dashboard > hw-private-chef > Settings > General > Root Directory > set to `wix-integration`
- [ ] Test deploy: `cd wix-integration && vercel --prod --yes`
- [ ] Verify both webhook endpoints still respond

## Acceptance Criteria
- `https://hw-private-chef.vercel.app/api/new-client` returns 200 on POST
- `https://hw-private-chef.vercel.app/api/client-onboarding` returns 200 on POST
