-- #139 PART B — READY TO RUN (generated from finance_ap_backfill_139.sql lines 174-541).
-- Run this WHOLE file once in the Supabase SQL editor. All-or-nothing: any error rolls everything back.

-- PART B — GUARDED APPLY.  APPLY ONLY AFTER USER APPROVAL.
-- Run as a separate step:  SET app.approve_ap_backfill_139 = 'yes';  then this.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

SET LOCAL app.approve_ap_backfill_139 = 'yes';   -- user approval

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
    v_src TEXT;
BEGIN
    IF COALESCE(current_setting('app.approve_ap_backfill_139', true), '') <> 'yes' THEN
        RAISE EXCEPTION '#139 PART B is guarded: run  SET app.approve_ap_backfill_139 = ''yes'';  first (user approval required).';
    END IF;
    SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'post_supplier_payment' AND p.pronargs = 0;
    IF v_src IS NULL OR v_src NOT LIKE '%fn_fin_post_leg%' THEN
        RAISE EXCEPTION '#139: apply #128 first (post_supplier_payment is not the #128 version).';
    END IF;
    IF to_regprocedure('public.trg_fn_post_ap_invoice()') IS NULL
       OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_fn_post_ap_invoice' AND prosrc LIKE '%fn_fin_post_leg%') THEN
        RAISE EXCEPTION '#139: apply #128 first (trg_fn_post_ap_invoice is not the #128 version).';
    END IF;
    -- #136 (purchase-return GL, one live invoice per GRN) must be in place
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_fn_post_purchase_return_gl')
       OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_supplier_payment_cheque_date') THEN
        RAISE EXCEPTION '#139: apply #136 first.';
    END IF;
    IF to_regprocedure('public.fn_ap_invoice_resolve_grn(uuid)') IS NULL THEN
        RAISE EXCEPTION '#139: apply #136 first (fn_ap_invoice_resolve_grn missing).';
    END IF;
    -- B3 calls fn_ap_refresh_invoice_paid(id, NULL, false); #128's version
    -- drops every posted payment when p_payment_id is NULL — #134's does not.
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_ap_refresh_invoice_paid' AND prosrc LIKE '%credited_amount%') THEN
        RAISE EXCEPTION '#139: apply #134 first (fn_ap_refresh_invoice_paid is not the #134 version).';
    END IF;
END $$;

-- Resolved GRN of every AP invoice (grn_id, else legacy_grn_id /
-- inventory_grn_id via #136's fn_ap_invoice_resolve_grn) — B1/B2 must treat a
-- live legacy invoice as billing its GRN (A1b: one PAID legacy invoice).
CREATE OR REPLACE TEMP VIEW _bf139_inv AS
SELECT a.id, a.status, a.grn_id,
       COALESCE(a.grn_id,
                public.fn_ap_invoice_resolve_grn(a.legacy_grn_id),
                public.fn_ap_invoice_resolve_grn(a.inventory_grn_id)) AS rgrn
  FROM public.ap_invoices a;

-- Ledgers / accounts touched by this backfill (for B5)
CREATE TEMP TABLE _bf139_ledgers (ledger_id UUID PRIMARY KEY) ON COMMIT DROP;

-- ── B0  re-tag out-of-band supplier-payment legs ───────────────────────────
--     Legs written for a posted supplier payment under another source_type
--     (e.g. 'pay_voucher') are re-tagged 'supplier_payment' so #128's cancel
--     reversal and #134's cheque sync find them. Only when they balance and
--     equal the payment total; otherwise listed for the user. B4 skips every
--     payment that already has legs under ANY source_type.
DO $$
DECLARE
    p RECORD;
    v_dr NUMERIC;
    v_cr NUMERIC;
BEGIN
    FOR p IN
        SELECT sp.id, sp.doc_number, sp.total_amount FROM public.supplier_payments sp
         WHERE sp.status = 'posted'
           AND EXISTS (SELECT 1 FROM public.finance_cashbook_entries c
                        WHERE c.source_id = sp.id AND c.source_type <> 'supplier_payment')
    LOOP
        SELECT COALESCE(SUM(c.debit_amount), 0), COALESCE(SUM(c.credit_amount), 0) INTO v_dr, v_cr
          FROM public.finance_cashbook_entries c WHERE c.source_id = p.id;
        IF ABS(v_dr - v_cr) > 0.01 OR ABS(v_dr - p.total_amount) > 0.01 THEN
            RAISE NOTICE 'B0 not re-tagged: payment % legs Dr % / Cr % vs total % — user decision.',
                p.doc_number, v_dr, v_cr, p.total_amount;
            CONTINUE;
        END IF;
        BEGIN
            UPDATE public.finance_cashbook_entries
               SET source_type = 'supplier_payment'
             WHERE source_id = p.id AND source_type <> 'supplier_payment';
            RAISE NOTICE 'B0 re-tagged legs of payment % as supplier_payment.', p.doc_number;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'B0 could not re-tag payment % (%): legs kept as-is; B4 still skips it.', p.doc_number, SQLERRM;
        END;
    END LOOP;
END $$;

-- ── B0b drop the legacy AP-invoice journal trigger ─────────────────────────
--     Live still has an AFTER UPDATE trigger running trg_fn_journal_on_ap_invoice()
--     (pre-#128). #128's BEFORE trigger writes the ap_ledger INVOICE row, then the
--     legacy one calls validate_invoice_not_posted() and raises DUPLICATE_POST —
--     every invoice post fails (UI too). #128 owns the GL + ap_ledger now.
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT tg.tgname FROM pg_trigger tg
          JOIN pg_proc p ON p.oid = tg.tgfoid
         WHERE tg.tgrelid = 'public.ap_invoices'::regclass AND NOT tg.tgisinternal
           AND (p.proname = 'trg_fn_journal_on_ap_invoice'
                OR (p.proname <> 'trg_fn_post_ap_invoice' AND p.prosrc LIKE '%validate_invoice_not_posted%'))
    LOOP
        EXECUTE format('DROP TRIGGER %I ON public.ap_invoices', t.tgname);
        RAISE NOTICE 'B0b dropped legacy trigger % on ap_invoices.', t.tgname;
    END LOOP;
END $$;

-- ── B0c fix block_posted_procurement_edit() ────────────────────────────────
--     Shared BEFORE UPDATE trigger on purchase_orders / goods_receipts /
--     ap_invoices / supplier_payments / purchase_returns. It read
--     NEW.paid_amount directly, which raises 42703 on every table without that
--     column — so ANY update of a posted GRN / supplier payment failed (incl.
--     #136 set_supplier_payment_cheque_date and the cheque re-sync below).
--     Same rules, field access via jsonb; no-op updates and a posted cheque
--     payment's cheque_date change are allowed.
CREATE OR REPLACE FUNCTION public.block_posted_procurement_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_new JSONB := to_jsonb(NEW) - 'updated_at';
    v_old JSONB := to_jsonb(OLD) - 'updated_at';
BEGIN
    IF v_new = v_old THEN
        RETURN NEW;                                   -- no-op touch
    END IF;

    IF OLD.status = 'posted' THEN
        IF NEW.status = 'cancelled' THEN
            RETURN NEW;
        END IF;
        IF TG_TABLE_NAME = 'ap_invoices' THEN
            IF (v_new -> 'paid_amount') IS DISTINCT FROM (v_old -> 'paid_amount')
               OR NEW.status IS DISTINCT FROM OLD.status THEN
                RETURN NEW;
            END IF;
        END IF;
        IF TG_TABLE_NAME = 'supplier_payments'
           AND (v_new - 'cheque_date') = (v_old - 'cheque_date') THEN
            RETURN NEW;                               -- cheque date only
        END IF;
        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot modify posted document "%" on table %.', OLD.doc_number, TG_TABLE_NAME;
    END IF;

    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'IMMUTABLE_DOC: Cannot modify cancelled document "%" on table %.', OLD.doc_number, TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$fn$;

-- ── B1  draft GRN invoices → posted via #128 ────────────────────────────────
DO $$
DECLARE
    r RECORD;
    n_ok INT := 0;
    n_fail INT := 0;
BEGIN
    FOR r IN
        SELECT DISTINCT ON (ai.grn_id) ai.id, ai.grn_id, ai.doc_number, ai.company_id
          FROM public.ap_invoices ai
          JOIN public.goods_receipts g ON g.id = ai.grn_id
         WHERE ai.status = 'draft' AND g.status = 'posted' AND COALESCE(ai.total_amount, 0) > 0
         ORDER BY ai.grn_id, ai.created_at
    LOOP
        -- any OTHER live invoice for this GRN, incl. legacy-linked ones
        IF EXISTS (SELECT 1 FROM _bf139_inv x
                    WHERE x.rgrn = r.grn_id AND x.id <> r.id AND x.status <> 'cancelled'
                      AND (x.status <> 'draft' OR x.grn_id IS NULL)) THEN
            RAISE NOTICE 'B1 skipped: GRN of AP invoice % is already billed by another live invoice.', r.doc_number;
            CONTINUE;
        END IF;
        BEGIN
            IF public.procurement_setting_bool(r.company_id, 'invoice_approval_required') THEN
                -- #128 refuses draft → posted when approval is on; approve first.
                UPDATE public.ap_invoices SET status = 'approved' WHERE id = r.id AND status = 'draft';
            END IF;
            UPDATE public.ap_invoices SET status = 'posted' WHERE id = r.id;
            n_ok := n_ok + 1;
        EXCEPTION WHEN OTHERS THEN
            n_fail := n_fail + 1;
            RAISE NOTICE 'B1 not posted: AP invoice % — %', r.doc_number, SQLERRM;
        END;
    END LOOP;
    RAISE NOTICE 'B1 posted % draft GRN invoice(s), % failed (see notices).', n_ok, n_fail;
END $$;

-- ── B2  posted GRNs with no live invoice → create + post (#128 §5 logic) ───
DO $$
DECLARE
    g RECORD;
    v_line RECORD;
    v_inv UUID;
    v_doc TEXT;
    v_num INT;
    v_sub NUMERIC;
    v_q NUMERIC;
BEGIN
    FOR g IN
        SELECT gr.* FROM public.goods_receipts gr
         WHERE gr.status = 'posted'
           -- no live invoice under ANY link (grn_id / legacy_grn_id / inventory_grn_id)
           AND NOT EXISTS (SELECT 1 FROM _bf139_inv a WHERE a.rgrn = gr.id AND a.status <> 'cancelled')
         ORDER BY gr.doc_date
    LOOP
        v_num := 0; v_sub := 0;
        v_doc := COALESCE(public.generate_proc_doc_number(g.company_id, g.branch_id, 'AP_INV'),
                          'APINV-BF139-' || left(g.id::text, 8));
        INSERT INTO public.ap_invoices (
            company_id, branch_id, doc_number, doc_date, supplier_id, grn_id, po_id, supplier_inv_no,
            payment_term_id, currency, exchange_rate, status,
            subtotal, discount_amount, tax_amount, total_amount, paid_amount, remarks, created_by
        ) VALUES (
            g.company_id, g.branch_id, v_doc, g.doc_date, g.supplier_id, g.id, g.po_id, g.doc_number,
            (SELECT payment_term_id FROM public.suppliers WHERE id = g.supplier_id),
            'LKR', 1, 'draft', 0, 0, 0, 0, 0,
            'Backfill #139 from GRN ' || g.doc_number, COALESCE(g.posted_by, g.created_by)
        ) RETURNING id INTO v_inv;

        FOR v_line IN
            SELECT l.* FROM public.goods_receipt_lines l WHERE l.grn_id = g.id ORDER BY l.line_number
        LOOP
            v_q := v_line.quantity - COALESCE(v_line.invoiced_qty, 0);
            CONTINUE WHEN v_q <= 0.0001;
            v_num := v_num + 1;
            INSERT INTO public.ap_invoice_lines (
                invoice_id, line_number, grn_line_id, po_line_id, item_id, description, uom_id,
                quantity, unit_price, discount_pct, tax_pct
            ) VALUES (
                v_inv, v_num, v_line.id, v_line.po_line_id, v_line.item_id, v_line.description, v_line.uom_id,
                v_q, COALESCE(v_line.unit_cost, 0), 0, 0
            );
            v_sub := v_sub + v_q * COALESCE(v_line.unit_cost, 0);
        END LOOP;

        IF v_num = 0 OR v_sub <= 0 THEN
            DELETE FROM public.ap_invoices WHERE id = v_inv;
            RAISE NOTICE 'B2 GRN % has nothing invoiceable — left for user decision.', g.doc_number;
            CONTINUE;
        END IF;

        UPDATE public.ap_invoices SET subtotal = v_sub, total_amount = v_sub WHERE id = v_inv;
        IF public.procurement_setting_bool(g.company_id, 'invoice_approval_required') THEN
            UPDATE public.ap_invoices SET status = 'approved' WHERE id = v_inv;
        END IF;
        UPDATE public.ap_invoices SET status = 'posted' WHERE id = v_inv;   -- #128 posts the GL
        RAISE NOTICE 'B2 GRN % → AP invoice % (%).', g.doc_number, v_doc, v_sub;
    END LOOP;
END $$;

-- ── B3  invoices settled but never posted: write what #128's post writes ───
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT doc_number FROM public.ap_invoices i
              WHERE i.status = 'posted'
                AND NOT EXISTS (SELECT 1 FROM public.ap_ledger l WHERE l.doc_id = i.id AND l.entry_type = 'INVOICE')
    LOOP
        RAISE NOTICE 'B3 skipped: AP invoice % is posted (immutable) but has no ledger rows — user decision.', r.doc_number;
    END LOOP;
END $$;

DO $$
DECLARE
    a RECORD;
    v_ap UUID;
    v_inv UUID;
    v_desc TEXT;
BEGIN
    FOR a IN
        SELECT i.* FROM public.ap_invoices i
         WHERE i.status IN ('partial_paid', 'paid')
           AND COALESCE(i.total_amount, 0) > 0
           AND NOT EXISTS (SELECT 1 FROM public.ap_ledger l WHERE l.doc_id = i.id AND l.entry_type = 'INVOICE')
         FOR UPDATE
    LOOP
        v_ap  := public.fn_fin_ledger_by_code(a.company_id, '2000', 'Accounts Payables');
        v_inv := public.fn_fin_ledger_by_code(a.company_id, '1005', 'Inventory - Raw Materials');
        v_desc := 'Supplier Bill ' || a.doc_number || ' (backfill #139)';

        INSERT INTO public.ap_ledger (company_id, branch_id, supplier_id, entry_type, doc_id, doc_number,
                                      doc_date, due_date, debit, credit, currency, exchange_rate, description, posted_by)
        VALUES (a.company_id, a.branch_id, a.supplier_id, 'INVOICE', a.id, a.doc_number,
                a.doc_date, a.due_date, 0, a.total_amount, COALESCE(a.currency, 'LKR'), COALESCE(a.exchange_rate, 1),
                'AP Invoice ' || a.doc_number || ' (backfill #139)', COALESCE(a.posted_by, a.created_by));

        PERFORM public.fn_fin_post_leg(a.company_id, a.branch_id, 'invoice', a.id, a.doc_date, v_inv, NULL, v_desc, a.total_amount, 0);
        PERFORM public.fn_fin_post_leg(a.company_id, a.branch_id, 'invoice', a.id, a.doc_date, v_ap,  NULL, v_desc, 0, a.total_amount);

        IF a.grn_id IS NOT NULL THEN
            UPDATE public.goods_receipt_lines grl
               SET invoiced_qty = COALESCE(grl.invoiced_qty, 0) + ail.quantity
              FROM public.ap_invoice_lines ail
             WHERE ail.invoice_id = a.id AND ail.grn_line_id = grl.id;
        END IF;
        UPDATE public.purchase_order_lines pol
           SET invoiced_qty = COALESCE(pol.invoiced_qty, 0) + ail.quantity
          FROM public.ap_invoice_lines ail
         WHERE ail.invoice_id = a.id AND ail.po_line_id = pol.id;

        UPDATE public.ap_invoices
           SET posted_at = COALESCE(posted_at, now()), posted_by = COALESCE(posted_by, created_by)
         WHERE id = a.id;
        PERFORM public.fn_ap_refresh_invoice_paid(a.id, NULL, false);
        RAISE NOTICE 'B3 posted GL for settled invoice % (%).', a.doc_number, a.total_amount;
    END LOOP;
END $$;

-- ── B4  posted supplier payments without GL legs: Dr 2000 / Cr bank ─────────
DO $$
DECLARE
    p RECORD;
    v_ap UUID;
    v_acc public.finance_accounts;
    v_code TEXT;
    v_desc TEXT;
BEGIN
    FOR p IN
        SELECT sp.* FROM public.supplier_payments sp
         WHERE sp.status = 'posted'
           -- legs under ANY source_type count (see B0) — never post twice
           AND NOT EXISTS (SELECT 1 FROM public.finance_cashbook_entries c
                            WHERE c.source_id = sp.id)
         FOR UPDATE
    LOOP
        v_acc := NULL;
        v_code := NULLIF(TRIM(COALESCE(p.bank_account_code, '')), '');
        IF v_code IS NOT NULL THEN
            SELECT fa.* INTO v_acc FROM public.finance_accounts fa
             WHERE fa.deleted_at IS NULL
               AND (fa.company_id = p.company_id OR fa.company_id IS NULL)
               AND (fa.account_number = v_code OR fa.registered_name = v_code OR fa.registered_name ILIKE '%' || v_code || '%')
             ORDER BY (fa.account_number = v_code) DESC NULLS LAST, (fa.registered_name = v_code) DESC NULLS LAST
             LIMIT 1;
        END IF;
        -- Fallback 1: the bank account the cheque was registered on
        IF v_acc.id IS NULL THEN
            SELECT fa.* INTO v_acc FROM public.finance_cheques c
              JOIN public.finance_accounts fa ON fa.id = c.bank_account_id AND fa.deleted_at IS NULL
             WHERE (c.supplier_payment_id = p.id
                    OR (c.cheque_no = NULLIF(TRIM(COALESCE(p.cheque_no, '')), '') AND c.voucher_id IS NULL
                        AND (c.company_id = p.company_id OR c.company_id IS NULL)))
               AND c.status <> 'cancelled'
             ORDER BY (c.supplier_payment_id = p.id) DESC NULLS LAST, c.created_at
             LIMIT 1;
        END IF;
        -- Fallback 2: the company's only active bank account (never guesses between several)
        IF v_acc.id IS NULL AND (SELECT COUNT(*) FROM public.finance_accounts fa
                                  WHERE fa.deleted_at IS NULL AND fa.is_active AND fa.account_type = 'bank'
                                    AND (fa.company_id = p.company_id OR fa.company_id IS NULL)) = 1 THEN
            SELECT fa.* INTO v_acc FROM public.finance_accounts fa
             WHERE fa.deleted_at IS NULL AND fa.is_active AND fa.account_type = 'bank'
               AND (fa.company_id = p.company_id OR fa.company_id IS NULL);
        END IF;
        IF v_acc.id IS NULL OR v_acc.ledger_id IS NULL THEN
            RAISE EXCEPTION 'B4: cannot resolve the paying bank account (with ledger) for payment % (code %). Fix bank_account_code first.',
                p.doc_number, COALESCE(v_code, 'n/a');
        END IF;

        v_ap := public.fn_fin_ledger_by_code(p.company_id, '2000', 'Accounts Payables');
        v_desc := 'Supplier Payment ' || p.doc_number || ' via ' || p.payment_method || ' (backfill #139)';
        PERFORM public.fn_fin_post_leg(p.company_id, p.branch_id, 'supplier_payment', p.id, p.doc_date,
            v_ap, NULL, 'AP Settlement — ' || v_desc, p.total_amount, 0);
        PERFORM public.fn_fin_post_leg(p.company_id, p.branch_id, 'supplier_payment', p.id, p.doc_date,
            v_acc.ledger_id, v_acc.id, v_desc, 0, p.total_amount);

        INSERT INTO _bf139_ledgers VALUES (v_acc.ledger_id) ON CONFLICT DO NOTHING;
        RAISE NOTICE 'B4 GL legs for payment % (%) on account %.', p.doc_number, p.total_amount, v_acc.registered_name;
    END LOOP;
END $$;

-- Re-sync cheque register for cheque payments (fires #134's trigger; no-op if linked)
UPDATE public.supplier_payments SET cheque_date = cheque_date
 WHERE status = 'posted' AND COALESCE(payment_method, '') ILIKE '%cheque%';

-- ── B5  #122 recompute — only ledgers that got a cashbook leg in THIS txn ──
--     (now() is the transaction start time, identical for every row written
--     above). IOU 100005 and other drifting ledgers are NOT touched.
INSERT INTO _bf139_ledgers
SELECT DISTINCT c.ledger_id
  FROM public.finance_cashbook_entries c
 WHERE c.created_at = now() AND c.ledger_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.finance_ledgers fl
   SET current_balance = CASE WHEN fl.opening_balance_type = 'credit' THEN -1 ELSE 1 END * COALESCE(fl.opening_balance, 0)
                         + COALESCE((SELECT SUM(c.debit_amount - c.credit_amount)
                                       FROM public.finance_cashbook_entries c WHERE c.ledger_id = fl.id), 0),
       updated_at = now()
 WHERE fl.id IN (SELECT ledger_id FROM _bf139_ledgers);

-- Accounts: only bank accounts whose ledger received B4 legs (A6's 1002-1 sign
-- flip and the IOU cash account are user decisions — not touched here).
UPDATE public.finance_accounts fa
   SET current_balance = COALESCE(fa.opening_balance, 0)
                         + COALESCE((SELECT SUM(c.debit_amount - c.credit_amount)
                                       FROM public.finance_cashbook_entries c
                                      WHERE c.account_id = fa.id AND c.ledger_id = fa.ledger_id), 0),
       updated_at = now()
 WHERE fa.deleted_at IS NULL
   AND fa.ledger_id IN (SELECT c.ledger_id FROM public.finance_cashbook_entries c
                         WHERE c.source_type = 'supplier_payment' AND c.description LIKE '%(backfill #139)');

-- ── B6  supplier balance = AP sub-ledger ───────────────────────────────────
UPDATE public.suppliers s
   SET balance = COALESCE((SELECT SUM(l.credit - l.debit) FROM public.ap_ledger l WHERE l.supplier_id = s.id), 0)
 WHERE ABS(COALESCE(s.balance, 0) - COALESCE((SELECT SUM(l.credit - l.debit) FROM public.ap_ledger l WHERE l.supplier_id = s.id), 0)) > 0.01;

-- ── B7  orphan Dr-only journals: left as drafts (default). Option, only on
--        explicit user approval (immutability triggers may need disabling):
-- DELETE FROM public.journal_lines l USING public.journal_entries j
--  WHERE l.journal_id = j.id AND NOT j.is_posted AND j.reference_type = 'supplier_payment'
--    AND NOT EXISTS (SELECT 1 FROM public.journal_lines x WHERE x.journal_id = j.id AND x.cr_amount > 0);
-- DELETE FROM public.journal_entries j WHERE NOT j.is_posted AND j.reference_type = 'supplier_payment'
--    AND NOT EXISTS (SELECT 1 FROM public.journal_lines x WHERE x.journal_id = j.id);

-- ── Post-check: cashbook must balance per posted AP/payment source ─────────
DO $$
DECLARE n INT;
BEGIN
    SELECT COUNT(*) INTO n FROM (
        SELECT source_type, source_id
          FROM public.finance_cashbook_entries
         WHERE source_type IN ('invoice', 'supplier_payment')
         GROUP BY source_type, source_id
        HAVING ABS(SUM(debit_amount - credit_amount)) > 0.01) x;
    IF n > 0 THEN
        RAISE EXCEPTION '#139 post-check: % AP/payment source(s) unbalanced in the cashbook — rolled back.', n;
    END IF;
END $$;

COMMIT;
