-- ═══════════════════════════════════════════════════════════════════════════════
-- SEVEN WAVES ERP — Finance Department Re-Architecture
-- Migration: finance_department_rearchitecture
-- Description: 9 new tables for ERP-level double-entry accounting
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. FINANCE LEDGERS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_ledgers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES public.companies(id),
  branch_id            UUID REFERENCES public.branches(id),
  ledger_code          TEXT NOT NULL,
  ledger_name          TEXT NOT NULL,
  ledger_type          TEXT NOT NULL CHECK (ledger_type IN ('asset','liability','equity','income','expense')),
  ledger_nature        TEXT NOT NULL CHECK (ledger_nature IN ('debit','credit','both')),
  account_group        TEXT,
  opening_balance      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  opening_balance_type TEXT NOT NULL DEFAULT 'debit' CHECK (opening_balance_type IN ('debit','credit')),
  current_balance      NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_cashbook_ledger   BOOLEAN NOT NULL DEFAULT false,
  is_petty_cash_ledger BOOLEAN NOT NULL DEFAULT false,
  is_bank_ledger       BOOLEAN NOT NULL DEFAULT false,
  is_system_ledger     BOOLEAN NOT NULL DEFAULT false,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_by           UUID REFERENCES auth.users(id),
  updated_by           UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ,
  UNIQUE (company_id, ledger_code)
);

ALTER TABLE public.finance_ledgers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fl_company ON public.finance_ledgers(company_id);
CREATE INDEX IF NOT EXISTS idx_fl_branch ON public.finance_ledgers(branch_id);
CREATE INDEX IF NOT EXISTS idx_fl_type ON public.finance_ledgers(ledger_type);
CREATE INDEX IF NOT EXISTS idx_fl_active ON public.finance_ledgers(is_active);

-- ── 2. FINANCE ACCOUNTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES public.companies(id),
  branch_id       UUID REFERENCES public.branches(id),
  ledger_id       UUID NOT NULL REFERENCES public.finance_ledgers(id),
  account_type    TEXT NOT NULL CHECK (account_type IN ('cash','bank','petty_cash','mobile_wallet','card_settlement')),
  bank_name       TEXT,
  bank_branch     TEXT,
  registered_name TEXT NOT NULL,
  account_number  TEXT,
  currency        TEXT NOT NULL DEFAULT 'LKR',
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fa_company ON public.finance_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_fa_ledger ON public.finance_accounts(ledger_id);
CREATE INDEX IF NOT EXISTS idx_fa_type ON public.finance_accounts(account_type);

-- ── 3. FINANCE VOUCHERS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_vouchers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES public.companies(id),
  branch_id         UUID REFERENCES public.branches(id),
  voucher_no        TEXT NOT NULL,
  voucher_type      TEXT NOT NULL CHECK (voucher_type IN ('pay','received')),
  voucher_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  pay_to            TEXT,
  received_from     TEXT,
  requested_by      UUID REFERENCES auth.users(id),
  paid_by           UUID REFERENCES auth.users(id),
  received_by       UUID REFERENCES auth.users(id),
  payment_method    TEXT NOT NULL CHECK (payment_method IN ('cash','bank','cheque','card','online_transfer','petty_cash')),
  account_id        UUID REFERENCES public.finance_accounts(id),
  bank_id           UUID REFERENCES public.finance_accounts(id),
  cheque_id         UUID,
  ledger_id         UUID NOT NULL REFERENCES public.finance_ledgers(id),
  amount            NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  remark            TEXT,
  narration         TEXT,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','posted','cancelled')),
  approval_status   TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  approved_by       UUID REFERENCES auth.users(id),
  approved_at       TIMESTAMPTZ,
  rejected_by       UUID REFERENCES auth.users(id),
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  posted_by         UUID REFERENCES auth.users(id),
  posted_at         TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (company_id, voucher_no)
);

ALTER TABLE public.finance_vouchers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fv_company ON public.finance_vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_fv_branch ON public.finance_vouchers(branch_id);
CREATE INDEX IF NOT EXISTS idx_fv_type ON public.finance_vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS idx_fv_status ON public.finance_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_fv_date ON public.finance_vouchers(voucher_date DESC);
CREATE INDEX IF NOT EXISTS idx_fv_ledger ON public.finance_vouchers(ledger_id);

-- ── 4. FINANCE VOUCHER LINES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_voucher_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id     UUID NOT NULL REFERENCES public.finance_vouchers(id) ON DELETE CASCADE,
  ledger_id      UUID NOT NULL REFERENCES public.finance_ledgers(id),
  description    TEXT,
  debit_amount   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (debit_amount > 0 OR credit_amount > 0)
);

ALTER TABLE public.finance_voucher_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fvl_voucher ON public.finance_voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_fvl_ledger ON public.finance_voucher_lines(ledger_id);

-- ── 5. FINANCE CASHBOOK ENTRIES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_cashbook_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES public.companies(id),
  branch_id       UUID REFERENCES public.branches(id),
  source_type     TEXT NOT NULL CHECK (source_type IN ('pos_dine_in','pos_takeaway','delivery','pay_voucher','received_voucher','invoice','petty_cash','bank_transfer','manual_adjustment')),
  source_id       UUID,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  ledger_id       UUID NOT NULL REFERENCES public.finance_ledgers(id),
  account_id      UUID REFERENCES public.finance_accounts(id),
  description     TEXT NOT NULL,
  debit_amount    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  running_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (debit_amount > 0 OR credit_amount > 0)
);

ALTER TABLE public.finance_cashbook_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fce_company ON public.finance_cashbook_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_fce_branch ON public.finance_cashbook_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_fce_date ON public.finance_cashbook_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_fce_source ON public.finance_cashbook_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_fce_ledger ON public.finance_cashbook_entries(ledger_id);

-- ── 6. FINANCE PETTY CASH ENTRIES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_petty_cash_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID REFERENCES public.companies(id),
  branch_id             UUID REFERENCES public.branches(id),
  petty_cash_account_id UUID NOT NULL REFERENCES public.finance_accounts(id),
  source_voucher_id     UUID REFERENCES public.finance_vouchers(id),
  entry_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  description           TEXT NOT NULL,
  debit_amount          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  running_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_by           UUID REFERENCES auth.users(id),
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (debit_amount > 0 OR credit_amount > 0)
);

ALTER TABLE public.finance_petty_cash_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fpce_account ON public.finance_petty_cash_entries(petty_cash_account_id);
CREATE INDEX IF NOT EXISTS idx_fpce_date ON public.finance_petty_cash_entries(entry_date DESC);

-- ── 7. FINANCE CHEQUES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_cheques (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID REFERENCES public.companies(id),
  branch_id        UUID REFERENCES public.branches(id),
  voucher_id       UUID REFERENCES public.finance_vouchers(id),
  bank_account_id  UUID NOT NULL REFERENCES public.finance_accounts(id),
  cheque_no        TEXT NOT NULL,
  cheque_date      DATE NOT NULL,
  issued_to        TEXT,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status           TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','issued','cleared','bounced','cancelled','stale')),
  cleared_date     DATE,
  cancelled_reason TEXT,
  created_by       UUID REFERENCES auth.users(id),
  updated_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.finance_cheques ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fc_bank ON public.finance_cheques(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_fc_status ON public.finance_cheques(status);
CREATE INDEX IF NOT EXISTS idx_fc_date ON public.finance_cheques(cheque_date DESC);
CREATE INDEX IF NOT EXISTS idx_fc_voucher ON public.finance_cheques(voucher_id);

-- ── 8. FINANCE BANK RECONCILIATIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_bank_reconciliations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES public.companies(id),
  branch_id            UUID REFERENCES public.branches(id),
  bank_account_id      UUID NOT NULL REFERENCES public.finance_accounts(id),
  reconciliation_month TEXT NOT NULL,
  statement_start_date DATE NOT NULL,
  statement_end_date   DATE NOT NULL,
  opening_bank_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_bank_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  system_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  difference_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reconciled','approved','locked')),
  prepared_by          UUID REFERENCES auth.users(id),
  approved_by          UUID REFERENCES auth.users(id),
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.finance_bank_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fbr_bank ON public.finance_bank_reconciliations(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_fbr_status ON public.finance_bank_reconciliations(status);

-- ── 9. FINANCE BANK RECONCILIATION LINES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_bank_reconciliation_lines (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id     UUID NOT NULL REFERENCES public.finance_bank_reconciliations(id) ON DELETE CASCADE,
  source_type           TEXT NOT NULL CHECK (source_type IN ('cheque','voucher','deposit','bank_charge','interest','manual_bank_entry')),
  source_id             UUID,
  transaction_date      DATE NOT NULL,
  description           TEXT NOT NULL,
  debit_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  bank_statement_amount NUMERIC(14,2),
  is_matched            BOOLEAN NOT NULL DEFAULT false,
  matched_by            UUID REFERENCES auth.users(id),
  matched_at            TIMESTAMPTZ,
  note                  TEXT
);

ALTER TABLE public.finance_bank_reconciliation_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fbrl_recon ON public.finance_bank_reconciliation_lines(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_fbrl_matched ON public.finance_bank_reconciliation_lines(is_matched);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'finance_ledgers','finance_accounts','finance_vouchers','finance_voucher_lines',
    'finance_cashbook_entries','finance_petty_cash_entries','finance_cheques',
    'finance_bank_reconciliations','finance_bank_reconciliation_lines'
  ])
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''authenticated'');',
        'fin_new_' || tbl || '_auth', tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════════════════════════════
GRANT ALL ON public.finance_ledgers TO service_role;
GRANT ALL ON public.finance_accounts TO service_role;
GRANT ALL ON public.finance_vouchers TO service_role;
GRANT ALL ON public.finance_voucher_lines TO service_role;
GRANT ALL ON public.finance_cashbook_entries TO service_role;
GRANT ALL ON public.finance_petty_cash_entries TO service_role;
GRANT ALL ON public.finance_cheques TO service_role;
GRANT ALL ON public.finance_bank_reconciliations TO service_role;
GRANT ALL ON public.finance_bank_reconciliation_lines TO service_role;
