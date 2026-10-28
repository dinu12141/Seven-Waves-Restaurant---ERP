// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — Finance Department Types
// ═══════════════════════════════════════════════════════════════════════════════

// ── Enumerations ─────────────────────────────────────────────────────────────

export type LedgerType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
export type LedgerNature = 'debit' | 'credit' | 'both'
export type BalanceType = 'debit' | 'credit'

export type AccountType = 'cash' | 'bank' | 'petty_cash' | 'mobile_wallet' | 'card_settlement'

export type VoucherType = 'pay' | 'received'
export type PaymentMethod = 'cash' | 'bank' | 'cheque' | 'card' | 'online_transfer' | 'petty_cash'
export type VoucherStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted' | 'cancelled'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type CashbookSourceType = 'pos_dine_in' | 'pos_takeaway' | 'delivery' | 'pay_voucher' | 'received_voucher' | 'invoice' | 'petty_cash' | 'bank_transfer' | 'manual_adjustment'

export type ChequeStatus = 'planned' | 'issued' | 'cleared' | 'bounced' | 'cancelled' | 'stale'

export type ReconciliationStatus = 'draft' | 'reconciled' | 'approved' | 'locked'
export type ReconciliationSourceType = 'cheque' | 'voucher' | 'deposit' | 'bank_charge' | 'interest' | 'manual_bank_entry'

// ── Ledger ───────────────────────────────────────────────────────────────────

export interface FinanceLedger {
  id: string
  company_id?: string
  branch_id?: string
  ledger_code: string
  ledger_name: string
  ledger_type: LedgerType
  ledger_nature: LedgerNature
  account_group?: string
  opening_balance: number
  opening_balance_type: BalanceType
  current_balance: number
  is_cashbook_ledger: boolean
  is_petty_cash_ledger: boolean
  is_bank_ledger: boolean
  is_system_ledger: boolean
  is_active: boolean
  created_by?: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface LedgerFormData {
  ledger_code: string
  ledger_name: string
  ledger_type: LedgerType
  ledger_nature: LedgerNature
  account_group?: string
  opening_balance: number
  opening_balance_type: BalanceType
  is_cashbook_ledger: boolean
  is_petty_cash_ledger: boolean
  is_bank_ledger: boolean
}

// ── Account ──────────────────────────────────────────────────────────────────

export interface FinanceAccount {
  id: string
  company_id?: string
  branch_id?: string
  ledger_id: string
  ledger?: FinanceLedger
  account_type: AccountType
  bank_name?: string
  bank_branch?: string
  registered_name: string
  account_number?: string
  currency: string
  opening_balance: number
  current_balance: number
  is_default: boolean
  is_active: boolean
  created_by?: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface AccountFormData {
  ledger_id: string
  account_type: AccountType
  bank_name?: string
  bank_branch?: string
  registered_name: string
  account_number?: string
  currency: string
  opening_balance: number
  is_default: boolean
}

// ── Voucher ──────────────────────────────────────────────────────────────────

export interface FinanceVoucher {
  id: string
  company_id?: string
  branch_id?: string
  voucher_no: string
  voucher_type: VoucherType
  voucher_date: string
  pay_to?: string
  received_from?: string
  requested_by?: string
  paid_by?: string
  received_by?: string
  payment_method: PaymentMethod
  account_id?: string
  account?: FinanceAccount
  bank_id?: string
  cheque_id?: string
  ledger_id: string
  ledger?: FinanceLedger
  amount: number
  remark?: string
  narration?: string
  status: VoucherStatus
  approval_status: ApprovalStatus
  approved_by?: string
  approved_at?: string
  rejected_by?: string
  rejected_at?: string
  rejection_reason?: string
  posted_by?: string
  posted_at?: string
  lines?: FinanceVoucherLine[]
  created_by?: string
  updated_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface VoucherFormData {
  voucher_type: VoucherType
  voucher_date: string
  pay_to?: string
  received_from?: string
  requested_by?: string
  payment_method: PaymentMethod
  account_id?: string
  bank_id?: string
  ledger_id: string
  amount: number
  remark?: string
  narration?: string
  lines: VoucherLineFormData[]
  // Cheque fields
  cheque_no?: string
  cheque_date?: string
}

export interface FinanceVoucherLine {
  id: string
  voucher_id: string
  ledger_id: string
  ledger?: FinanceLedger
  description?: string
  debit_amount: number
  credit_amount: number
  created_at: string
}

export interface VoucherLineFormData {
  ledger_id: string
  description?: string
  debit_amount: number
  credit_amount: number
}

// ── Cashbook ─────────────────────────────────────────────────────────────────

export interface CashbookEntry {
  id: string
  company_id?: string
  branch_id?: string
  source_type: CashbookSourceType
  source_id?: string
  entry_date: string
  ledger_id: string
  ledger?: FinanceLedger
  account_id?: string
  account?: FinanceAccount
  description: string
  debit_amount: number
  credit_amount: number
  running_balance: number
  created_at: string
}

// ── Petty Cash ───────────────────────────────────────────────────────────────

export interface PettyCashEntry {
  id: string
  company_id?: string
  branch_id?: string
  petty_cash_account_id: string
  source_voucher_id?: string
  entry_date: string
  description: string
  debit_amount: number
  credit_amount: number
  running_balance: number
  approved_by?: string
  created_by?: string
  created_at: string
}

// ── Cheque ────────────────────────────────────────────────────────────────────

export interface FinanceCheque {
  id: string
  company_id?: string
  branch_id?: string
  voucher_id?: string
  voucher?: FinanceVoucher
  bank_account_id: string
  bank_account?: FinanceAccount
  cheque_no: string
  cheque_date: string
  issued_to?: string
  amount: number
  status: ChequeStatus
  cleared_date?: string
  cancelled_reason?: string
  created_by?: string
  updated_by?: string
  created_at: string
  updated_at: string
}

// ── Bank Reconciliation ──────────────────────────────────────────────────────

export interface BankReconciliation {
  id: string
  company_id?: string
  branch_id?: string
  bank_account_id: string
  bank_account?: FinanceAccount
  reconciliation_month: string
  statement_start_date: string
  statement_end_date: string
  opening_bank_balance: number
  closing_bank_balance: number
  system_balance: number
  difference_amount: number
  status: ReconciliationStatus
  prepared_by?: string
  approved_by?: string
  approved_at?: string
  lines?: BankReconciliationLine[]
  created_at: string
  updated_at: string
}

export interface BankReconciliationLine {
  id: string
  reconciliation_id: string
  source_type: ReconciliationSourceType
  source_id?: string
  transaction_date: string
  description: string
  debit_amount: number
  credit_amount: number
  bank_statement_amount?: number
  is_matched: boolean
  matched_by?: string
  matched_at?: string
  note?: string
}

// ── Financial Statements ─────────────────────────────────────────────────────

export interface TrialBalanceRow {
  ledger_code: string
  ledger_name: string
  ledger_type: LedgerType
  opening_debit: number
  opening_credit: number
  period_debit: number
  period_credit: number
  closing_debit: number
  closing_credit: number
}

// Statements are laid out dynamically from finance_ledgers.account_group
// (see services/finance-statements.builder.js).

export interface StatementItem {
  kind: 'ledger' | 'header' | 'header_total'
  id: string
  code: string
  name: string
  /** Natural sign of the section: negative = contra / deduction. null on header rows. */
  amount: number | null
  depth: number
  is_contra?: boolean
  is_inactive?: boolean
  synthetic?: boolean
}

export interface StatementGroup {
  key: string
  /** The account_group value (or 'Unclassified' / 'Retained Earnings'). */
  name: string
  label: string
  status: 'mapped' | 'unknown' | 'unclassified' | 'computed'
  items: StatementItem[]
  total: number
}

export interface StatementSection {
  key: string
  label: string
  side?: 'assets' | 'equity_liabilities'
  normal: 'debit' | 'credit'
  groups: StatementGroup[]
  total: number
  total_label: string
}

export type StatementLayoutBlock =
  | { kind: 'heading'; label: string }
  | { kind: 'section'; section: StatementSection }
  | { kind: 'subtotal'; key: string; label: string; amount: number; level: 'major' | 'grand' }

export interface StatementWarning {
  level: 'error' | 'warning' | 'info'
  code: string
  message: string
}

/** Flat section kept for backward compatibility with pre-sections consumers. */
export interface ProfitLossSection {
  label: string
  items: { code: string; name: string; amount: number }[]
  total: number
}

export interface ProfitLossReport {
  company_name: string
  title: string
  period: string
  sections: StatementSection[]
  layout: StatementLayoutBlock[]
  revenue: ProfitLossSection
  other_income: ProfitLossSection
  total_income: number
  cost_of_sales: ProfitLossSection
  gross_profit: number
  expenses: {
    admin_and_operation: ProfitLossSection
    selling_and_distribution: ProfitLossSection
    finance_and_other: ProfitLossSection
    total_expenses: number
  }
  net_profit_before_tax: number
  tax: { label: string; amount: number; items: ProfitLossSection['items'] }
  net_profit: number
  warnings: StatementWarning[]
  generated_at: string
}

export type BalanceSheetSection = ProfitLossSection

export interface BalanceSheetReport {
  company_name: string
  title: string
  as_of_date: string
  sections: StatementSection[]
  layout: StatementLayoutBlock[]
  assets: {
    non_current: BalanceSheetSection
    current: BalanceSheetSection
    total_assets: number
  }
  equity_and_liabilities: {
    equity: BalanceSheetSection
    non_current_liabilities: BalanceSheetSection
    current_liabilities: BalanceSheetSection
    total_liabilities_equity: number
  }
  retained_earnings_bf: number
  profit_for_period: number
  total_assets: number
  total_liabilities: number
  total_equity: number
  total_equity_liabilities: number
  difference: number
  is_balanced: boolean
  warnings: StatementWarning[]
  generated_at: string
}

// ── Filter / Query Types ─────────────────────────────────────────────────────

export interface FinanceDateFilter {
  date_from?: string
  date_to?: string
  branch_id?: string
  ledger_id?: string
  account_id?: string
  status?: string
}

export interface VoucherApprovalFilter {
  voucher_type?: VoucherType
  status?: VoucherStatus
  branch_id?: string
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface FinanceAuditEntry {
  user_id: string
  company_id?: string
  branch_id?: string
  action: string
  module: string
  entity_type: string
  entity_id: string
  old_data?: Record<string, unknown>
  new_data?: Record<string, unknown>
  reason?: string
  ip_address?: string
  created_at: string
}
