---
description: View the current team board — shows sprint status, assignments, and communication log for Seven Waves Restaurant ERP
---

# Team Board Viewer — Seven Waves Restaurant ERP

Read and display a summary of the current team state.

## Process

1. Read `TEAM_BOARD.md`
2. Read `git status`
3. Display:

---

### Sprint Status

Show the Active Sprint table with color-coded status:
- `[DONE]` ✅
- `[IN PROGRESS]` 🔄
- `[BLOCKED]` ❌
- `[NEEDS REVIEW]` 👀

### Git Changes

Show which files are currently modified and by whom (based on TEAM_BOARD.md ownership):

```
Modified files:
  src/pages/POSPage.vue              → Frontend (Maya)
  src/modules/finance/services/...  → Backend (Raj)
  supabase/fix_loyalty_*.sql        → DBA (Sam)
```

### Blockers

List any [BLOCKED] tasks and what they need.

### Recent Communication

Show the last 5 lines of the Communication Log.

### What Needs Attention

Based on the board state, tell me:
- Which tasks are at risk
- Which team member is idle and could pick up work
- The critical path to sprint completion

---

No changes to files. Read-only operation.
