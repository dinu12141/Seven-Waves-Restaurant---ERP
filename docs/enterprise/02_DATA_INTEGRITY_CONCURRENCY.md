# Pillar 2 — Data Integrity & Concurrency Audit

**Scope:** Enterprise-readiness (read-only) audit of `supabase/*.sql` RPCs/triggers and the
client-side service/store layers that drive multi-step business operations.
**Stack:** Quasar (Vue 3) SPA + Supabase (PostgreSQL 17, PostgREST, RLS).
**Rule:** No DDL run against prod — every fix below is a *proposal only*.
**Auditor:** DBA · Task #79 · 2026-07-24

---

## Verdict

**NOT yet enterprise-grade.** The server-side KOT/stock orchestration is genuinely well
built (row locks, idempotency, single-transaction plpgsql). The weakness is at the
**boundaries**: the two highest-value money paths — **POS payment** and **finance voucher
posting** — are assembled from *multiple independent Supabase round-trips on the client*,
so a failure or a crash mid-sequence leaves the database **partially committed**. There are
also three genuine **race conditions** (double-post, stock oversell, table double-seat) where
no optimistic/pessimistic locking exists.

| # | Severity | Area | Partial-commit | Race/lost-update |
|---|----------|------|:--:|:--:|
| F1 | **High** | POS Quick-Pay (`processPayment`) | ✅ | — |
| F2 | **High** | POS Send-to-Kitchen (`sendToKitchen`) | ✅ | — |
| F3 | **High** | Finance voucher post/cancel | ✅ | ✅ double-post |
| F4 | **High** | Ledger balance update | — | ✅ lost update |
| F5 | Medium | Voucher number generation | — | ✅ duplicate key |
| F6 | Medium | Inventory stock deduction | — | ✅ oversell (TOCTOU) |
| F7 | Medium | QR table session creation | — | ✅ double-seat |

### What is already correct (keep as reference patterns)
- `process_waiter_accept` (`critical_fix_07_kds_concurrency.sql`) — `SELECT … FOR UPDATE` on
  the order + idempotent status check. **Textbook. Use this as the template for F1–F3.**
- `issue_stock_for_order` (`stock_queue_orchestration.sql`) — `FOR UPDATE SKIP LOCKED` on
  `stock_queue` + double idempotency guard. Correct.
- Journal immutability + double-entry validation triggers (`critical_fix_02_finance_safety.sql`).
- `close_accounting_period` — locks the period row `FOR UPDATE`.
- `post_accounting_from_order` — guards against duplicate journal per order.

---

## (1) Transactions & Rollbacks — atomicity of multi-step operations

### F1 — HIGH — POS Quick-Pay runs 5 separate transactions from the client
**File:** `src/stores/orderStore.js:303-359` (`processPayment`)

The "atomic" flow is actually **five independent server calls**, each auto-committing:

```
1. INSERT orders          (own txn, commits)
2. INSERT order_items     (own txn) — on fail: best-effort DELETE orders (may also fail)
3. rpc process_waiter_accept   (own txn — generates KOTs, cashier/stock/finance queues)
4. rpc process_cashier_invoice (own txn)
5. rpc process_cashier_payment (own txn — posts finance journal + triggers stock deduct)
```

If step 4 or 5 fails (network drop, timeout, RLS error) the order is **already accepted with
KOTs printing in the kitchen and stock queues created**, but never paid — an unbilled, cooked
order. There is no compensating rollback for steps 3–5. The `catch` only re-throws.

**Fix — collapse into one server-side transaction.** Add an RPC that performs the whole
Quick-Pay atomically so any failure rolls the entire thing back:

```sql
CREATE OR REPLACE FUNCTION public.pos_quick_pay(
    p_order   jsonb,   -- header fields
    p_items   jsonb,   -- array of line items
    p_payment_method text,
    p_amount_paid numeric        -- ignored for charge; server derives total (see Pillar-1 #38)
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order_id uuid;
BEGIN
    -- all inside ONE txn: exception => full rollback
    INSERT INTO orders (...) SELECT ... FROM jsonb_..(p_order) RETURNING id INTO v_order_id;
    INSERT INTO order_items (...) SELECT ... FROM jsonb_array_elements(p_items);
    PERFORM process_waiter_accept(v_order_id);
    PERFORM process_cashier_invoice(v_order_id);
    PERFORM process_cashier_payment(v_order_id, p_payment_method, p_amount_paid);
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM); -- nothing committed
END $$;
```

Client then makes **one** `supabase.rpc('pos_quick_pay', …)` call. Because the sub-RPCs are
`PERFORM`ed inside the same transaction, a failure in payment unwinds the order, items, KOTs,
and queues together.

---

### F2 — HIGH — Send-to-Kitchen can orphan an order (non-atomic insert + fragile rollback)
**File:** `src/stores/orderStore.js:192-226` (`sendToKitchen`)

```
INSERT orders  → INSERT order_items → if items fail: DELETE orders  (delete may also fail)
```

The code itself acknowledges the hole at line 223 (`Orphaned order … rollback delete failed`).
Between the two inserts, a browser/network crash leaves an order with **zero line items** that
still shows in the waiter inbox and cashier queue.

**Fix — one RPC that inserts header + lines in a single transaction:**

```sql
CREATE OR REPLACE FUNCTION public.pos_create_order(p_header jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO orders (...) VALUES (...) RETURNING id INTO v_id;
    INSERT INTO order_items (order_id, ...)
    SELECT v_id, ... FROM jsonb_array_elements(p_items) e;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order must contain at least one item'; END IF;
    RETURN jsonb_build_object('success', true, 'order_id', v_id);
END $$;   -- header auto-rolls-back if items insert fails; no orphan possible
```

The same non-atomic pattern exists in the website/kiosk paths
(`create_order_from_session.sql`, `create_kiosk_order.sql`) — those are already single RPCs, so
the POS store is the outlier and should follow suit.

---

### F3 — HIGH — Finance voucher post: double-post race + partial commit
**File:** `src/modules/finance/services/finance-voucher.service.js:106-161`
(`postVoucher`, `cancelVoucher`)

Two problems in `postVoucher`:

1. **No optimistic guard on the state transition.** The status check is a *JS `if`* on a
   value read earlier (`voucher.status !== 'approved'`), but the `UPDATE … set status='posted'`
   at line 122 has **no `.eq('status','approved')`** predicate. Two cashiers (or a double-click)
   posting the same approved voucher both pass the JS check and both run the UPDATE →
   **two cashbook entries and the ledger balance incremented twice.**
   *(Contrast `approveVoucher`/`rejectVoucher` at lines 84/99 which correctly add
   `.eq('status','submitted')` — `postVoucher` and `cancelVoucher` forgot it.)*

2. **Partial commit.** After the status flip, `_createCashbookEntry`, `_createChequeFromVoucher`
   and `_updateLedgerBalance` are **three more independent round-trips** (lines 130-138). If any
   fails, the voucher is marked `posted` but the cashbook/ledger never move — books silently
   out of balance. `_createCashbookEntry` even swallows the error (`console.error`, line 228).

**Fix — move the whole posting into one guarded RPC:**

```sql
CREATE OR REPLACE FUNCTION public.post_finance_voucher(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v RECORD;
BEGIN
    -- pessimistic lock + atomic state guard in one shot
    SELECT * INTO v FROM finance_vouchers WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','not found'); END IF;
    IF v.status <> 'approved' THEN
        RETURN jsonb_build_object('success',false,'error','already '||v.status); -- idempotent
    END IF;

    UPDATE finance_vouchers SET status='posted', posted_at=now(), posted_by=auth.uid()
     WHERE id = p_id;                      -- only one txn wins the FOR UPDATE lock

    INSERT INTO finance_cashbook_entries (...) VALUES (...);      -- same txn
    UPDATE finance_ledgers                                       -- atomic delta, see F4
       SET current_balance = current_balance + (CASE v.voucher_type
             WHEN 'pay' THEN -v.amount ELSE v.amount END)
     WHERE id = v.ledger_id;
    IF v.payment_method='cheque' THEN INSERT INTO finance_cheques (...) VALUES (...); END IF;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);  -- all-or-nothing
END $$;
```

Apply the same `FOR UPDATE` + `status`-guard pattern to `cancelVoucher` (currently can
double-reverse the cashbook/ledger the same way).

---

## (2) Concurrency & Locking — lost updates / races

### F4 — HIGH — Ledger balance lost update (read-modify-write)
**File:** `finance-voucher.service.js:264-281` (`_updateLedgerBalance`, `_reverseLedgerBalance`)

The fallback and the entire reversal path do:

```js
select current_balance ... single()          // read
update finance_ledgers set current_balance = read + delta   // write
```

This is the classic lost-update: two concurrent posts to the same ledger both read balance
`B`, both write `B ± delta`, and one increment is silently lost. The primary path uses an
atomic `increment_field` RPC (good), but any error drops into the racy fallback, and
`_reverseLedgerBalance` never uses the atomic path at all.

**Fix:** never read-then-write a balance. Always `UPDATE … SET current_balance =
current_balance + :delta` server-side (as folded into the F3 RPC), or route every balance
change through the atomic `increment_field` RPC with **no** read-modify-write fallback.

---

### F5 — MEDIUM — Duplicate voucher numbers under concurrency
**File:** `finance-voucher.service.js:198-202` (`_generateVoucherNo`)

`count(*) + 1` computed on the client → two vouchers created in the same second both get
`PV-000042`. No unique constraint is enforced in the visible schema, so duplicates persist and
break reconciliation.

**Fix:** generate the number **inside** the insert transaction from a Postgres sequence (or a
`document_counters` row updated with `UPDATE … RETURNING`), and add
`UNIQUE (company_id, voucher_type, voucher_no)`. Retry once on `unique_violation`. This mirrors
the server-side `generate_inv_doc_number` already used by inventory.

---

### F6 — MEDIUM — Inventory stock oversell (check-then-act TOCTOU)
**File:** `supabase/inventory_module_functions.sql:129-167` (`validate_sufficient_stock`) +
`:97-121` (`update_stock_on_hand`)

`update_stock_on_hand` applies the delta with an atomic `INSERT … ON CONFLICT DO UPDATE SET
qty = qty + excluded.qty` — so the **balance itself never suffers a lost update** (good).
But `validate_sufficient_stock` reads `qty_on_hand` with a **plain SELECT, no row lock**, and
the check and the deduction are separate statements. Two concurrent deductions on the same
`(warehouse, item)` both read `qty=10`, both need `8`, both pass validation, both apply `-8`
→ final `qty = -6` even though `allow_negative_stock = false`. The guard is defeated by the race.

**Fix (pick one):**
- Lock the stock row before validating:
  `PERFORM 1 FROM stock_on_hand WHERE warehouse_id=… AND item_id=… FOR UPDATE;` then validate,
  then deduct — all in the deduction function's transaction. Serializes same-item deductions.
- **Or** enforce the invariant declaratively so no amount of racing can breach it:
  a `BEFORE`-style guard/trigger on `stock_on_hand` that raises when
  `NEW.qty_on_hand < 0 AND` the warehouse disallows negatives (a plain
  `CHECK (qty_on_hand >= 0)` can't read the per-warehouse flag, so use a trigger).
- **Or** `pg_advisory_xact_lock(hashtext(warehouse_id::text||item_id::text))` at deduction start.

---

### F7 — MEDIUM — QR table double-seat race
**File:** `supabase/table_device_login_customer_sessions.sql:191-284`
(`get_or_create_session_by_qr`)

Steps run without any lock on the table: (2) `SELECT` for an existing active session →
(3) `UPDATE` stale sessions to expired → (4) `INSERT` a new session. Two customers scanning
the same table QR within the same instant both find no active session at step 2 and both
`INSERT` at step 4 → **two `active` customer_sessions for one table**, i.e. two independent
carts/orders on the same physical table (split bill, lost items).

**Fix:** serialize per table with a transaction-scoped advisory lock immediately after
resolving the table, before the existence check:

```sql
-- right after the QR → table resolution (line ~217)
PERFORM pg_advisory_xact_lock(hashtext(v_qr.table_id::text));
```

The second concurrent call then blocks until the first commits, sees the freshly-created
`active` session, and re-uses it (the `reused=true` branch) instead of creating a duplicate.

---

## Recommended remediation order
1. **F1 + F2** — wrap POS order creation & Quick-Pay in RPCs (highest money + kitchen impact).
2. **F3 + F4** — one guarded `post_finance_voucher` RPC (books integrity).
3. **F6** — lock/trigger the stock deduction path (prevents negative inventory).
4. **F5, F7** — sequence numbers + table advisory lock.

All fixes reuse patterns already proven in this codebase (`process_waiter_accept`,
`issue_stock_for_order`). No new infrastructure required — just move client-orchestrated
multi-writes into single plpgsql transactions and add `FOR UPDATE` / advisory locks at the
three unguarded race points.

**Note:** these are proposals; no DDL was executed against production during this audit.
