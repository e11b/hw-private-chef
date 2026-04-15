---
title: Run first test conversation and measure Pro usage
priority: P2
status: pending
created: 2026-04-11
---

## Problem
No empirical data on how much of Haley's Pro 5h budget a single client conversation consumes. Cost model estimates ~15-20K tokens but needs validation.

## Impact
Without measurement, can't confirm the workflow fits in Pro's budget.

## Core Ask
Run one test conversation (Wenbo Shan recommended, well-populated page) and check claude.ai/settings/usage after.

## Components
- [ ] Haley fills in 4/19 Menus base dishes in Notion (her task, prerequisite)
- [ ] Run test conversation in Menu Generation project
- [ ] Measure Pro usage bar before and after
- [ ] Verify write-back positioning (after prefs/pantry, before older entries)
- [ ] Document actual token consumption

## Acceptance Criteria
- One complete menu generation cycle works end-to-end
- Usage measurement recorded
- Write-back lands in correct position in client page body
