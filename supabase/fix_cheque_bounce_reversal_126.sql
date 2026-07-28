-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #126 — Cheque "Mark Bounced" has no accounting effect
-- Seven Waves Restaurant ERP
--
-- BUG: ChequePlanPage "Mark Bounced" only flips finance_cheques.status to
-- 'bounced' (financeChequeService.markBounced → updateStatus). It never
-- reverses the ledger balance, cashbook entry, or account balance that
-- post_finance_voucher applied when the cheque was originally issued. The
-- books stay wrong forever unless someone manually books a correction.
--
-- FIX: a SECURITY DEFINER RPC, mark_cheque_bounced(p_cheque_id, p_reason),
-- that atomically:
--   1. Locks the cheque row, requires current status = 'issued' (matches the
--      UI, which only shows the Bounce button for 'issued' cheques).
--   2. Loads the linked finance_vouchers row (ledger_id, account_id, bank_id,
--      amount, voucher_type, company_id, branch_id).
--   3. Inserts a REVERSING finance_cashbook_entries row (debit/credit swapped
--      vs. the original posting) — the original entry is never touched, so
--      the cashbook stays an append-only audit trail.
--   4. Reverses the finance_ledgers.current_balance delta (opposite sign of
--      what post_finance_voucher applied).
--   5. Reverses the finance_accounts.current_balance delta for both
--      account_id and bank_id (mirrors the client-side delta loop in
--      financeVoucherService.postVoucher()).
--   6. Sets finance_cheques.status = 'bounced', stamps
--      bounced_reversal_cashbook_id (idempotency guard — a cheque can only
--      be reversed once) and bounced_reason/bounced_by/bounced_at.
--   7. Writes an audit_logs row.
--
-- Idempotent to re-run (CREATE OR REPLACE + guarded ALTER TABLE ADD COLUMN).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- STEP 1 — Schema: audit/idempotency columns + cashbook source_type
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.finance_cheques
  ADD COLUMN IF NOT EXISTS bounced_reversal_cashbook_id UUID REFERENCES public.finance_cashbook_entries(id),
  ADD COLUMN IF NOT EXISTS bounced_reason TEXT,
  ADD COLUMN IF NOT EXISTS bounced_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;

-- Widen the cashbook source_type enum so bounce reversals are traceable as
-- their own category, not lumped into generic 'manual_adjustment' rows.
ALTER TABLE public.finance_cashbook_entries DROP CONSTRAINT IF EXISTS finance_cashbook_entries_source_type_check;
ALTER TABLE public.finance_cashbook_entries ADD CONSTRAINT finance_cashbook_entries_source_type_check
  CHECK (source_type IN (
    'pos_dine_in','pos_takeaway','delivery','pay_voucher','received_voucher',
    'invoice','petty_cash','bank_transfer','manual_adjustment','cheque_bounced'
  ));

-- ─────────────────────────────────────────────────────────────────
-- STEP 2 — RPC: mark_cheque_bounced
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_cheque_bounced(p_cheque_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cheque   public.finance_cheques;
    v_voucher  public.finance_vouchers;
    v_user     UUID := auth.uid();
    v_delta    NUMERIC;
    v_cb_id    UUID;
BEGIN
    IF NOT (is_admin() OR is_finance()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only finance or admin can mark a cheque as bounced');
    END IF;

    SELECT * INTO v_cheque FROM public.finance_cheques WHERE id = p_cheque_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cheque not found');
    END IF;

    IF v_cheque.status <> 'issued' THEN
        RETURN jsonb_build_object('success', false, 'error',
            format('Only issued cheques can be marked bounced (current status: %s)', v_cheque.status));
    END IF;

    IF v_cheque.voucher_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cheque has no linked voucher — cannot reverse accounting effect');
    END IF;

    SELECT * INTO v_voucher FROM public.finance_vouchers WHERE id = v_cheque.voucher_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Linked voucher not found');
    END IF;

    -- ── Reversing cashbook entry (debit/credit swapped vs. the original) ──
    INSERT INTO public.finance_cashbook_entries (
        company_id, branch_id, source_type, source_id, entry_date,
        ledger_id, account_id, description, debit_amount, credit_amount, running_balance
    ) VALUES (
        v_voucher.company_id, v_voucher.branch_id, 'cheque_bounced', v_cheque.id, CURRENT_DATE,
        v_voucher.ledger_id, v_voucher.account_id,
        'Cheque ' || v_cheque.cheque_no || ' bounced — reversal of ' || v_voucher.voucher_no
            || COALESCE(' (' || p_reason || ')', ''),
        CASE WHEN v_voucher.voucher_type = 'received' THEN v_voucher.amount ELSE 0 END,
        CASE WHEN v_voucher.voucher_type = 'pay'      THEN v_voucher.amount ELSE 0 END,
        0
    ) RETURNING id INTO v_cb_id;

    -- ── Reverse the ledger balance delta (opposite of post_finance_voucher) ──
    v_delta := CASE WHEN v_voucher.voucher_type = 'pay' THEN v_voucher.amount ELSE -v_voucher.amount END;
    UPDATE public.finance_ledgers
       SET current_balance = COALESCE(current_balance, 0) + v_delta, updated_at = now()
     WHERE id = v_voucher.ledger_id;

    -- ── Reverse the account balance delta on account_id and bank_id ──
    -- (mirrors financeVoucherService.postVoucher()'s client-side delta loop)
    IF v_voucher.account_id IS NOT NULL THEN
        UPDATE public.finance_accounts
           SET current_balance = COALESCE(current_balance, 0) + v_delta, updated_at = now()
         WHERE id = v_voucher.account_id;
    END IF;
    IF v_voucher.bank_id IS NOT NULL AND v_voucher.bank_id IS DISTINCT FROM v_voucher.account_id THEN
        UPDATE public.finance_accounts
           SET current_balance = COALESCE(current_balance, 0) + v_delta, updated_at = now()
         WHERE id = v_voucher.bank_id;
    END IF;

    -- ── Flip cheque status + stamp reversal audit fields ──
    UPDATE public.finance_cheques
       SET status = 'bounced',
           bounced_reversal_cashbook_id = v_cb_id,
           bounced_reason = p_reason,
           bounced_by = v_user,
           bounced_at = now(),
           updated_at = now()
     WHERE id = p_cheque_id;

    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, severity, created_at)
    VALUES (
        v_user, 'cheque_bounced', 'finance_cheques', p_cheque_id,
        jsonb_build_object(
            'cheque_no', v_cheque.cheque_no,
            'amount', v_voucher.amount,
            'voucher_id', v_voucher.id,
            'voucher_no', v_voucher.voucher_no,
            'reversal_cashbook_id', v_cb_id,
            'reason', p_reason
        ),
        'warning', now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'cheque_id', p_cheque_id,
        'status', 'bounced',
        'reversal_cashbook_id', v_cb_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_cheque_bounced(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_cheque_bounced(UUID, TEXT) TO authenticated;
COMMENT ON FUNCTION public.mark_cheque_bounced(UUID, TEXT) IS
  'FIX #126 — marks a cheque bounced and atomically reverses the ledger/cashbook/account effect of its originating voucher.';
