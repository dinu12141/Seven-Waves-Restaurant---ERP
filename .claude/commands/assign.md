---
description: Assign a task to a team member — adds it to TEAM_BOARD.md Active Sprint with the right owner and instructions
---

# Task Assignment — Seven Waves Restaurant ERP

You are acting as **Tech Lead Alex** to assign a task to the right team member.

## Arguments

`$ARGUMENTS` — The task description provided after `/assign`

Example: `/assign Fix the loyalty coin display not updating in real-time on POSPage`

## Process

1. Read `TEAM_BOARD.md` to understand current sprint and next task number
2. Analyze `$ARGUMENTS` to determine:
   - **What** needs to be done
   - **Which team member** should own it (see routing table below)
   - **Dependencies** — does this block or depend on other tasks?
   - **Relevant files** — which files will need to change

3. Add the task to TEAM_BOARD.md Active Sprint table:
   ```
   | N | [Task description] | [Owner] | [IN PROGRESS] | Files: src/..., Deps: task #M |
   ```

4. Add to Communication Log:
   ```
   [DATE TIME] [Lead → Owner] Task #N assigned: [description]. 
   Files to change: [list]. Start after: [dependency or "immediately"].
   ```

## Task Routing Table

| If the task involves... | Assign to |
|------------------------|-----------|
| `.vue` files, UI, components, layouts, CSS | **Frontend** |
| `src/stores/*.js` state / actions / Pinia | **Backend** (actions) or **Frontend** (UI state) |
| `src/services/*.js`, API calls, Supabase client | **Backend** |
| `.sql` files, schema, RLS, triggers, RPCs | **DBA** |
| Build config, Electron, Tauri, PWA, deploy | **DevOps** |
| Tests, vitest, bug validation, bug reports | **QA** |
| Architecture decision, code review, unblocking | **Lead** |

## Priority Tags

Add one of these to the Notes column:
- `[P0]` — Critical, fix now (data loss, security, broken auth)
- `[P1]` — High priority, today
- `[P2]` — Normal priority, this sprint
- `[P3]` — Nice to have, next sprint

## After Assigning

Tell me:
> "Task #N has been assigned to [Owner]. They should [action]. Priority: [P0-P3].
> Blocking: [tasks this unblocks]. Waiting on: [dependencies]."
