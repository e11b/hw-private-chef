---
title: Set up Claude Project + global instructions for Haley
priority: P1
status: pending
created: 2026-04-11
---

## Problem
Haley doesn't have the Menu Generation Claude Project set up yet. No global instructions configured. The workflow instructions from the handoff doc haven't been pasted anywhere.

## Impact
She can't use Claude for menu generation until this is done.

## Core Ask
Configure global instructions (Settings) and create the Menu Generation project with workflow instructions.

## Components
- [ ] Paste global instructions (handoff §7a) into Settings > Custom Instructions
- [ ] Create "Menu Generation" project in Claude
- [ ] Paste project instructions (handoff §7b) into project custom instructions
- [ ] Verify with test conversation
- [ ] Switch model to Sonnet for the project

## Acceptance Criteria
- Global instructions active across all conversations
- Menu Generation project exists with workflow instructions
- Test conversation correctly fetches base menus + client data from Notion
