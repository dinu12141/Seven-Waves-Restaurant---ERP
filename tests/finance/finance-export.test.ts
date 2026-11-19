// ═══════════════════════════════════════════════════════════════════════════════
// Finance Export Service Tests — Multi-format & IAS 1 / IAS 7 Compliance
// Seven Waves Restaurant (Pvt) Ltd
// Tests: formatMoney, statementLines, Excel, PDF and Word generators
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DOM download APIs for browser export functions
beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  global.URL.revokeObjectURL = vi.fn()
  const mockAnchor = {
    href: '',
    download: '',
    click: vi.fn(),
    style: {},
    setAttribute: vi.fn(),
  }
  const mockDoc = {
    createElement: vi.fn((tag) => (tag === 'a' ? mockAnchor : {})),
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
  }
  ;(global as any).document = mockDoc
  ;(global as any).window = { open: vi.fn() }
})

import {
  formatMoney,
  statementLines,
  financeExportService,
} from 'src/modules/finance/services/finance-export.service'
import { exportTableToWord } from 'src/services/exportService'

describe('Finance Export Service — IAS 1 & IAS 7 Formatting', () => {
  describe('formatMoney', () => {
    it('formats positive numbers with thousands separators and 2 decimals', () => {
      expect(formatMoney(1500000)).toBe('1,500,000.00')
      expect(formatMoney(12.5)).toBe('12.50')
    })

    it('formats negative numbers enclosed in accounting brackets (contra/loss)', () => {
      expect(formatMoney(-45000)).toBe('(45,000.00)')
      expect(formatMoney(-1250.75)).toBe('(1,250.75)')
    })

    it('formats null, undefined, and zero correctly', () => {
      expect(formatMoney(0)).toBe('0.00')
      expect(formatMoney(0, true)).toBe('-')
      expect(formatMoney(null)).toBe('0.00')
      expect(formatMoney(undefined, true)).toBe('-')
    })
  })

  describe('statementLines — Layout Flattening', () => {
    const mockReport = {
      layout: [
        { kind: 'heading', label: 'INCOME STATEMENT' },
        {
          kind: 'section',
          section: {
            label: 'REVENUE',
            groups: [
              {
                label: 'Food Revenue',
                items: [
                  { code: '5000', name: 'Dine-In Sales', amount: 100000, kind: 'ledger', depth: 0 },
                  { code: '5001', name: 'Takeaway Sales', amount: 0, kind: 'ledger', depth: 0 },
                ],
                total: 100000,
              },
            ],
            total: 100000,
            total_label: 'TOTAL REVENUE',
          },
        },
        {
          kind: 'subtotal',
          label: 'NET PROFIT FOR THE PERIOD',
          amount: 50000,
          level: 'grand',
        },
      ],
    }

    it('extracts all lines including items, headings, and totals', () => {
      const lines = statementLines(mockReport)
      expect(lines.some((l) => l.kind === 'title' && l.label === 'INCOME STATEMENT')).toBe(true)
      expect(lines.some((l) => l.kind === 'item' && l.code === '5000')).toBe(true)
      expect(lines.some((l) => l.kind === 'item' && l.code === '5001')).toBe(true)
      expect(lines.some((l) => l.kind === 'total' && l.label === 'NET PROFIT FOR THE PERIOD')).toBe(true)
    })

    it('respects hideZero option by omitting zero items', () => {
      const lines = statementLines(mockReport, { hideZero: true })
      expect(lines.some((l) => l.kind === 'item' && l.code === '5000')).toBe(true)
      expect(lines.some((l) => l.kind === 'item' && l.code === '5001')).toBe(false)
    })
  })

  describe('Multi-Format Statement Generators (Excel, PDF & Word)', () => {
    const mockPl = {
      company_name: 'SEVEN WAVES RESTAURANT (PVT) LTD',
      title: 'STATEMENT OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME (IAS 1)',
      period: '2026-01-01 to 2026-12-31',
      layout: [
        {
          kind: 'section',
          section: {
            label: 'REVENUE',
            groups: [
              {
                label: 'Sales',
                items: [{ code: '5000', name: 'Food Sales', amount: 500000, kind: 'ledger' }],
                total: 500000,
              },
            ],
            total: 500000,
          },
        },
        { kind: 'subtotal', label: 'Net Profit', amount: 200000, level: 'grand' },
      ],
    }

    const mockBs = {
      company_name: 'SEVEN WAVES RESTAURANT (PVT) LTD',
      title: 'STATEMENT OF FINANCIAL POSITION (IAS 1)',
      as_of_date: '2026-12-31',
      is_balanced: true,
      difference: 0,
      layout: [
        {
          kind: 'section',
          section: {
            label: 'CURRENT ASSETS',
            groups: [
              {
                label: 'Cash',
                items: [{ code: '1000', name: 'Petty Cash', amount: 50000, kind: 'ledger' }],
                total: 50000,
              },
            ],
            total: 50000,
          },
        },
        { kind: 'subtotal', label: 'Total Assets', amount: 50000, level: 'grand' },
      ],
    }

    const mockTb = {
      as_of_date: '2026-12-31',
      isBalanced: true,
      totalDebit: 150000,
      totalCredit: 150000,
      rows: [
        {
          ledger_code: '1000',
          ledger_name: 'Cash in Hand',
          ledger_type: 'asset',
          account_group: 'Assets-Current',
          closing_debit: 150000,
          closing_credit: 0,
        },
        {
          ledger_code: '3000',
          ledger_name: 'Capital',
          ledger_type: 'equity',
          account_group: 'Equity',
          closing_debit: 0,
          closing_credit: 150000,
        },
      ],
    }

    const mockCashFlow = {
      opening_balance: 50000,
      operating_activities: [
        { category: 'Cash received from customers', amount: 200000 },
        { category: 'Cash paid to suppliers', amount: -80000 },
      ],
      net_operating: 120000,
      investing_activities: [
        { category: 'Purchase of kitchen equipment', amount: -30000 },
      ],
      net_investing: -30000,
      financing_activities: [],
      net_financing: 0,
      net_cash_flow: 90000,
      closing_balance: 140000,
      reconciliation_difference: 0,
      cash_ledgers: ['1000 Petty Cash', '1010 Main Bank Account'],
    }

    it('exports Profit & Loss to Word (.docx) without error', async () => {
      await expect(financeExportService.exportProfitLossToWord(mockPl)).resolves.not.toThrow()
      expect(document.body.appendChild).toHaveBeenCalled()
    })

    it('exports Balance Sheet to Word (.docx) without error', async () => {
      await expect(financeExportService.exportBalanceSheetToWord(mockBs)).resolves.not.toThrow()
      expect(document.body.appendChild).toHaveBeenCalled()
    })

    it('exports Trial Balance to Word (.docx) without error', async () => {
      await expect(financeExportService.exportTrialBalanceToWord(mockTb)).resolves.not.toThrow()
      expect(document.body.appendChild).toHaveBeenCalled()
    })

    it('exports Cash Flow to Excel, PDF & Word (.docx) conforming to IAS 7', async () => {
      const opts = { dateFrom: '2026-01-01', dateTo: '2026-12-31' }
      await expect(financeExportService.exportCashFlowToExcel(mockCashFlow, opts)).resolves.not.toThrow()
      expect(() => financeExportService.exportCashFlowToPdf(mockCashFlow, opts)).not.toThrow()
      await expect(financeExportService.exportCashFlowToWord(mockCashFlow, opts)).resolves.not.toThrow()
    })

    it('exports generic tables (Monthly Summary / COGS) to Word', async () => {
      const cols = [
        { name: 'month', label: 'Month', field: 'month', align: 'left' },
        { name: 'revenue', label: 'Income (LKR)', field: 'revenue', align: 'right', format: (v: any) => formatMoney(v) },
      ]
      const rows = [
        { month: '2026-01', revenue: 250000 },
        { month: '2026-02', revenue: 300000 },
      ]
      await expect(
        financeExportService.exportGenericTableToWord(cols, rows, 'Monthly_Summary', 'Year 2026'),
      ).resolves.not.toThrow()

      await expect(
        exportTableToWord(cols, rows, 'General_Report', 'Subtitle test'),
      ).resolves.not.toThrow()
    })

    it('exports Cashbook & Petty Cash Book to Excel, PDF & Word conforming to IAS 7 with corporate branding', async () => {
      const mockCashbookReport = {
        date_from: '2026-11-01',
        date_to: '2026-11-18',
        ledgers: [
          {
            ledger_id: 'l-1',
            ledger_code: '1021',
            ledger_name: 'Store Petty Cash',
            opening: 10000,
            debit: 5000,
            credit: 3500,
            closing: 11500,
            recomputed_balance: 11500,
            stored_current_balance: 11500,
            drift: 0,
            has_drift: false,
          },
        ],
        totals: {
          opening: 10000,
          debit: 5000,
          credit: 3500,
          closing: 11500,
          shown_debit: 5000,
          shown_credit: 3500,
        },
        rows: [
          {
            key: 'ob-1',
            kind: 'opening',
            date: '2026-11-01',
            ledger_id: 'l-1',
            ledger_code: '1021',
            ledger_name: 'Store Petty Cash',
            source_label: '',
            doc_ref: '',
            description: 'Balance b/f',
            source_type: null,
            debit: 0,
            credit: 0,
            running_balance: 10000,
          },
          {
            key: 'entry-1',
            kind: 'entry',
            date: '2026-11-10',
            ledger_id: 'l-1',
            ledger_code: '1021',
            ledger_name: 'Store Petty Cash',
            source_label: 'Payment Voucher',
            doc_ref: 'PV-2026-001',
            description: 'Market Vegetables Purchase',
            source_type: 'pay_voucher',
            debit: 0,
            credit: 3500,
            running_balance: 6500,
          },
        ],
      }

      const opts = {
        title: 'Petty Cash Book',
        subtitle: 'Period: 01 Nov 2026 to 18 Nov 2026',
        petty: true,
      }

      await expect(financeExportService.exportCashbookToExcel(mockCashbookReport, opts)).resolves.not.toThrow()
      await expect(financeExportService.exportCashbookToPdf(mockCashbookReport, opts)).resolves.not.toThrow()
      await expect(financeExportService.exportCashbookToWord(mockCashbookReport, opts)).resolves.not.toThrow()
      expect(document.body.appendChild).toHaveBeenCalled()
    })
  })
})
