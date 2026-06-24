---
description: Run daily team standup — each agent reports progress, blockers, and today's plan from TEAM_BOARD.md
---

# Daily Standup — Seven Waves Restaurant ERP

You are running the **daily standup** for the Seven Waves ERP dev team.

## Process

1. Read `TEAM_BOARD.md` in full
2. Read `git status` and `git log --oneline -10`
3. For each team member, summarize:
   - **Yesterday**: What was completed (tasks marked [DONE])
   - **Today**: What's [IN PROGRESS] or next up
   - **Blockers**: Any [BLOCKED] items

## Output Format

Print a standup report like this:

---
### Daily Standup — 2026-06-22

**Tech Lead (Alex)**
- Yesterday: Reviewed task assignments, set up team board
- Today: Reviewing finance module architecture, unblocking DBA on journal fix
- Blockers: None

**Frontend (Maya)**
- Yesterday: [what was done]
- Today: POSPage loyalty flow (#3), FinanceReportsPage chart data (#5)
- Blockers: Needs Backend to expose coins balance in order store

**Backend (Raj)**
- Yesterday: [what was done]
- Today: orderStore loyalty coin deduction (#6), finance ledger audit (#4)
- Blockers: None

**DBA (Sam)**
- Yesterday: [what was done]
- Today: Apply fix_loyalty_amount_value.sql (#1), fix_journal_immutability.sql (#2)
- Blockers: None — SQL ready, needs Supabase dashboard access to apply

**DevOps (Kim)**
- Yesterday: [what was done]
- Today: Verify build after loyalty changes
- Blockers: None

**QA (Jordan)**
- Yesterday: [what was done]
- Today: Validate loyalty flow after DBA + Backend complete
- Blockers: Waiting on tasks #1, #6

---
## Sprint Health: [Green/Yellow/Red]
- Tasks in progress: N
- Tasks blocked: N
- Tasks done this sprint: N

---

After the report, identify the **top priority** for the team today and which agent should be unblocked first.

Then update the Communication Log in TEAM_BOARD.md:
```
[DATE TIME] [STANDUP] Daily standup complete. Priority today: [description]. 
Blocking chain: [task X must complete before Y can start].
```
