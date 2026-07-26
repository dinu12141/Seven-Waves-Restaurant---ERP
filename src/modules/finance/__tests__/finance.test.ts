// ═══════════════════════════════════════════════════════════════════════════════
// Finance Module Tests
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ── 1. SQL Migration Integrity ──────────────────────────────────────────────
describe('Finance Re-Architecture: SQL Migration', () => {
  const migrationPath = path.resolve(__dirname, '../../../../supabase/migrations/20260518_finance_department_rearchitecture.sql')
  let sql: string

  it('migration file exists', () => {
    expect(fs.existsSync(migrationPath)).toBe(true)
  })

  it('loads migration SQL', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8')
    expect(sql.length).toBeGreaterThan(1000)
  })

  it('creates 9 required tables', () => {
    const tables = [
      'finance_ledgers', 'finance_accounts', 'finance_vouchers',
      'finance_voucher_lines', 'finance_cashbook_entries', 'finance_petty_cash_entries',
      'finance_cheques', 'finance_bank_reconciliations', 'finance_bank_reconciliation_lines',
    ]
    tables.forEach(t => {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`)
    })
  })

  it('enables RLS on all 9 tables', () => {
    const rls = (sql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length
    expect(rls).toBeGreaterThanOrEqual(9)
  })

  it('creates RLS policies for all tables', () => {
    expect(sql).toContain("'finance_ledgers'")
    expect(sql).toContain("'finance_vouchers'")
    expect(sql).toContain("'finance_cheques'")
    expect(sql).toContain("'finance_bank_reconciliations'")
  })

  it('grants service_role access', () => {
    expect(sql).toContain('GRANT ALL ON public.finance_ledgers TO service_role')
    expect(sql).toContain('GRANT ALL ON public.finance_vouchers TO service_role')
  })

  it('has proper CHECK constraints on vouchers', () => {
    expect(sql).toContain("voucher_type IN ('pay','received')")
    expect(sql).toContain("status IN ('draft','submitted','approved','rejected','posted','cancelled')")
    expect(sql).toContain("approval_status IN ('pending','approved','rejected')")
  })

  it('has proper CHECK constraints on cheques', () => {
    expect(sql).toContain("status IN ('planned','issued','cleared','bounced','cancelled','stale')")
  })

  it('enforces double-entry on voucher lines', () => {
    expect(sql).toContain('debit_amount > 0 OR credit_amount > 0')
  })

  it('has NUMERIC(14,2) precision on monetary columns', () => {
    const matches = sql.match(/NUMERIC\(14,2\)/g)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBeGreaterThan(10)
  })

  it('has foreign key to finance_ledgers from vouchers', () => {
    expect(sql).toContain('REFERENCES public.finance_ledgers(id)')
  })

  it('cascades delete from vouchers to voucher lines', () => {
    expect(sql).toContain('ON DELETE CASCADE')
  })
})

// ── 2. Type Definitions ─────────────────────────────────────────────────────
describe('Finance Re-Architecture: Types', () => {
  const typesPath = path.resolve(__dirname, '../types/finance.types.ts')
  let types: string

  it('types file exists', () => {
    expect(fs.existsSync(typesPath)).toBe(true)
    types = fs.readFileSync(typesPath, 'utf-8')
  })

  it('exports all core interfaces', () => {
    const required = [
      'FinanceLedger', 'FinanceAccount', 'FinanceVoucher',
      'FinanceVoucherLine', 'CashbookEntry', 'PettyCashEntry',
      'FinanceCheque', 'BankReconciliation', 'BankReconciliationLine',
    ]
    required.forEach(t => expect(types).toContain(`export interface ${t}`))
  })

  it('exports form data types', () => {
    expect(types).toContain('LedgerFormData')
    expect(types).toContain('AccountFormData')
    expect(types).toContain('VoucherFormData')
    expect(types).toContain('VoucherLineFormData')
  })

  it('exports financial statement types', () => {
    expect(types).toContain('TrialBalanceRow')
    expect(types).toContain('ProfitLossReport')
    expect(types).toContain('BalanceSheetReport')
  })

  it('exports all enum types', () => {
    const enums = [
      'LedgerType', 'LedgerNature', 'AccountType',
      'VoucherType', 'PaymentMethod', 'VoucherStatus',
      'ChequeStatus', 'ReconciliationStatus',
    ]
    enums.forEach(e => expect(types).toContain(`export type ${e}`))
  })
})

// ── 3. Service Layer ────────────────────────────────────────────────────────
describe('Finance Re-Architecture: Service Files', () => {
  const servicesDir = path.resolve(__dirname, '../services')

  const serviceFiles = [
    'finance-ledger.service.js',
    'finance-account.service.js',
    'finance-voucher.service.js',
    'finance-cashbook.service.js',
    'finance-cheque.service.js',
    'finance-bank-reconciliation.service.js',
    'finance-statements.service.js',
  ]

  serviceFiles.forEach(file => {
    it(`${file} exists`, () => {
      expect(fs.existsSync(path.join(servicesDir, file))).toBe(true)
    })
  })

  it('voucher service has approval workflow', () => {
    const src = fs.readFileSync(path.join(servicesDir, 'finance-voucher.service.js'), 'utf-8')
    expect(src).toContain('approveVoucher')
    expect(src).toContain('rejectVoucher')
    expect(src).toContain('postVoucher')
    expect(src).toContain('submitVoucher')
    expect(src).toContain('cancelVoucher')
  })

  it('voucher service prevents self-approval', () => {
    const src = fs.readFileSync(path.join(servicesDir, 'finance-voucher.service.js'), 'utf-8')
    expect(src).toContain('Creator cannot approve their own voucher')
  })

  it('voucher service posts atomically via the guarded RPC (double-entry balance enforced server-side)', () => {
    // P0 #50/#51 — posting now goes through the post_finance_voucher RPC, which
    // guards the double-entry balance, the approved-status check, and the ledger
    // delta inside a single FOR UPDATE-locked transaction. The old client-side
    // 'Double-entry imbalance' string moved into that RPC by design.
    const src = fs.readFileSync(path.join(servicesDir, 'finance-voucher.service.js'), 'utf-8')
    expect(src).toContain("rpc('post_finance_voucher'")
  })

  it('voucher service creates cashbook entries on post', () => {
    const src = fs.readFileSync(path.join(servicesDir, 'finance-voucher.service.js'), 'utf-8')
    expect(src).toContain('_createCashbookEntry')
  })

  it('voucher service creates cheques for cheque payments', () => {
    const src = fs.readFileSync(path.join(servicesDir, 'finance-voucher.service.js'), 'utf-8')
    expect(src).toContain('_createChequeFromVoucher')
  })

  it('voucher service enforces immutability of posted vouchers', () => {
    // Edit guard stays client-side; the approved-status post guard ('Only approved
    // vouchers can be posted') moved into the post_finance_voucher RPC (P0 #50).
    const src = fs.readFileSync(path.join(servicesDir, 'finance-voucher.service.js'), 'utf-8')
    expect(src).toContain('Only draft or rejected vouchers can be edited')
    expect(src).toContain("rpc('post_finance_voucher'")
  })

  it('ledger service has audit logging', () => {
    const src = fs.readFileSync(path.join(servicesDir, 'finance-ledger.service.js'), 'utf-8')
    expect(src).toContain('logFinanceAudit')
  })

  it('statements service generates all 3 reports', () => {
    const src = fs.readFileSync(path.join(servicesDir, 'finance-statements.service.js'), 'utf-8')
    expect(src).toContain('generateTrialBalance')
    expect(src).toContain('generateProfitLoss')
    expect(src).toContain('generateBalanceSheet')
  })

  it('balance sheet includes retained earnings from P&L', () => {
    const src = fs.readFileSync(path.join(servicesDir, 'finance-statements.service.js'), 'utf-8')
    expect(src).toContain('Retained Earnings')
  })
})

// ── 4. Store Layer ──────────────────────────────────────────────────────────
describe('Finance Re-Architecture: Stores', () => {
  const storesDir = path.resolve(__dirname, '../stores')

  const storeFiles = [
    'finance-ledger.store.js',
    'finance-account.store.js',
    'finance-voucher.store.js',
    'finance-cashbook.store.js',
    'finance-cheque.store.js',
    'finance-statements.store.js',
  ]

  storeFiles.forEach(file => {
    it(`${file} exists`, () => {
      expect(fs.existsSync(path.join(storesDir, file))).toBe(true)
    })
  })

  it('ledger store has type-grouped computed properties', () => {
    const src = fs.readFileSync(path.join(storesDir, 'finance-ledger.store.js'), 'utf-8')
    expect(src).toContain('ledgersByType')
    expect(src).toContain('cashbookLedgers')
    expect(src).toContain('bankLedgers')
  })

  it('voucher store has approval queue', () => {
    const src = fs.readFileSync(path.join(storesDir, 'finance-voucher.store.js'), 'utf-8')
    expect(src).toContain('approvalQueue')
    expect(src).toContain('fetchApprovalQueue')
  })
})

// ── 5. Component Layer ──────────────────────────────────────────────────────
describe('Finance Re-Architecture: Components', () => {
  const componentsDir = path.resolve(__dirname, '../components')

  const componentFiles = [
    'LedgerForm.vue',
    'AccountForm.vue',
    'VoucherForm.vue',
    'VoucherApprovalPanel.vue',
    'CashbookTable.vue',
    'FinancialStatementViewer.vue',
  ]

  componentFiles.forEach(file => {
    it(`${file} exists`, () => {
      expect(fs.existsSync(path.join(componentsDir, file))).toBe(true)
    })
  })
})

// ── 6. Page Layer ───────────────────────────────────────────────────────────
describe('Finance Re-Architecture: Pages', () => {
  const pagesDir = path.resolve(__dirname, '../pages')

  const pageFiles = [
    'LedgerRegistrationPage.vue',
    'AccountRegistrationPage.vue',
    'PayVoucherPage.vue',
    'ReceivedVoucherPage.vue',
    'VoucherApprovalPage.vue',
    'CashbookPage.vue',
    'PettyCashBookPage.vue',
    'ChequePlanPage.vue',
    'BankReconciliationPage.vue',
    'FinancialStatementsPage.vue',
  ]

  pageFiles.forEach(file => {
    it(`${file} exists`, () => {
      expect(fs.existsSync(path.join(pagesDir, file))).toBe(true)
    })
  })
})

// ── 7. Route Integration ────────────────────────────────────────────────────
describe('Finance Re-Architecture: Routes', () => {
  const routesPath = path.resolve(__dirname, '../../../../src/router/routes.js')
  let routes: string

  it('routes.js exists', () => {
    expect(fs.existsSync(routesPath)).toBe(true)
    routes = fs.readFileSync(routesPath, 'utf-8')
  })

  it('registers all 10 new finance routes', () => {
    const requiredPaths = [
      'ledgers', 'accounts', 'pay-vouchers', 'received-vouchers',
      'voucher-approvals', 'cashbook', 'petty-cash', 'cheque-plan',
      'bank-reconciliation', 'financial-statements',
    ]
    requiredPaths.forEach(p => {
      expect(routes).toContain(`path: '${p}'`)
    })
  })

  it('imports from modules/finance/pages', () => {
    expect(routes).toContain('src/modules/finance/pages/')
  })
})

// ── 8. Navigation Integration ───────────────────────────────────────────────
describe('Finance Re-Architecture: Sidebar Navigation', () => {
  const rolesPath = path.resolve(__dirname, '../../../../src/config/roles.ts')
  let roles: string

  it('roles.ts exists', () => {
    expect(fs.existsSync(rolesPath)).toBe(true)
    roles = fs.readFileSync(rolesPath, 'utf-8')
  })

  it('has ERP Accounting navigation group', () => {
    expect(roles).toContain('ERP Accounting')
  })

  it('has Voucher Management navigation group', () => {
    expect(roles).toContain('Voucher Management')
  })

  it('has Cash & Banking navigation group', () => {
    expect(roles).toContain('Cash & Banking')
  })

  it('has Statutory Reports navigation group', () => {
    expect(roles).toContain('Statutory Reports')
  })

  it('registers all new finance routes in nav', () => {
    const paths = [
      '/finance/ledgers', '/finance/accounts', '/finance/pay-vouchers',
      '/finance/received-vouchers', '/finance/voucher-approvals',
      '/finance/cashbook', '/finance/petty-cash', '/finance/cheque-plan',
      '/finance/bank-reconciliation', '/finance/financial-statements',
    ]
    paths.forEach(p => expect(roles).toContain(p))
  })
})

// ── 9. Security Assertions ──────────────────────────────────────────────────
describe('Finance Re-Architecture: Security', () => {
  const migrationPath = path.resolve(__dirname, '../../../../supabase/migrations/20260518_finance_department_rearchitecture.sql')
  let sql: string

  it('no API keys in finance module', () => {
    const financeDir = path.resolve(__dirname, '..')
    const files = getAllFiles(financeDir).filter(f => !f.includes('__tests__'))
    files.forEach(f => {
      const content = fs.readFileSync(f, 'utf-8')
      expect(content).not.toMatch(/AIza[A-Za-z0-9_-]{35}/)
      expect(content).not.toMatch(/sk-[a-zA-Z0-9]{32,}/)
    })
  })

  it('all tables have ENABLE ROW LEVEL SECURITY', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8')
    const tables = sql.match(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g) || []
    const rlsCount = (sql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length
    expect(rlsCount).toBeGreaterThanOrEqual(tables.length)
  })

  it('voucher service does not allow editing posted records', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../services/finance-voucher.service.js'), 'utf-8')
    expect(src).toContain('Only draft or rejected vouchers can be edited')
  })
})

// Helper to recursively get all files
function getAllFiles(dir: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir)) return files
  const items = fs.readdirSync(dir)
  for (const item of items) {
    const full = path.join(dir, item)
    if (fs.statSync(full).isDirectory()) {
      files.push(...getAllFiles(full))
    } else {
      files.push(full)
    }
  }
  return files
}
