import { describe, it, expect } from 'vitest'
import {
  resolveItemGinAccounts,
  KOTTAWA_SECTIONS,
} from 'src/services/inventory/ginAccountingHelper'
import { INCOME_TAX_CODES } from 'src/modules/finance/services/finance-statements.builder'

describe('Kottawa 4-Digit COA and GIN Accounting Verification', () => {
  it('retains section KOT-01 exactly as Benmar', () => {
    const benmar = KOTTAWA_SECTIONS.find((s) => s.code === 'KOT-01')
    expect(benmar).toBeDefined()
    expect(benmar?.label).toBe('Benmar')
  })

  it('contains all 10 mandatory Kottawa kitchen and operating sections', () => {
    expect(KOTTAWA_SECTIONS.length).toBe(10)
    const expectedCodes = [
      'KOT-01',
      'KOT-02',
      'KOT-03',
      'KOT-04',
      'KOT-05',
      'KOT-06',
      'KOT-07',
      'KOT-08',
      'KOT-09',
      'KOT-10',
    ]
    expect(KOTTAWA_SECTIONS.map((s) => s.code)).toEqual(expectedCodes)
  })

  it('resolves meat and fish to COGS 5010 and Inventory 1081', () => {
    const res = resolveItemGinAccounts({ name: 'Chicken 1kg', category_name: 'Meat and Fish' })
    expect(res.debitLedgerCode).toBe('5010')
    expect(res.creditLedgerCode).toBe('1081')
    expect(res.allocationType).toBe('COGS')
  })

  it('resolves vegetables and fruits to COGS 5020 and Inventory 1082', () => {
    const res = resolveItemGinAccounts({ name: 'Tomatoes 500g', category_name: 'Raw materials' })
    expect(res.debitLedgerCode).toBe('5020')
    expect(res.creditLedgerCode).toBe('1082')
    expect(res.allocationType).toBe('COGS')
  })

  it('resolves rice and dry goods to COGS 5030 and Inventory 1083', () => {
    const res = resolveItemGinAccounts({ name: 'Samba Rice 5kg', category_name: 'Raw materials' })
    expect(res.debitLedgerCode).toBe('5030')
    expect(res.creditLedgerCode).toBe('1083')
    expect(res.allocationType).toBe('COGS')
  })

  it('resolves dairy and eggs to COGS 5050 and Inventory 1085', () => {
    const res = resolveItemGinAccounts({ name: 'Anchor Butter 200g', category_name: 'Dairy Products' })
    expect(res.debitLedgerCode).toBe('5050')
    expect(res.creditLedgerCode).toBe('1085')
    expect(res.allocationType).toBe('COGS')
  })

  it('resolves beverage ingredients to COGS 5060 and Inventory 1090', () => {
    const res = resolveItemGinAccounts({ name: 'Passion Fruit Syrup', category_name: 'Beverage Ingredients' })
    expect(res.debitLedgerCode).toBe('5060')
    expect(res.creditLedgerCode).toBe('1090')
    expect(res.allocationType).toBe('COGS')
  })

  it('resolves packaging to COGS 5080 and Inventory 1110', () => {
    const res = resolveItemGinAccounts({ name: 'Kottu Box 500ml', category_name: 'Packaging' })
    expect(res.debitLedgerCode).toBe('5080')
    expect(res.creditLedgerCode).toBe('1110')
    expect(res.allocationType).toBe('COGS')
  })

  it('resolves cleaning chemicals to Expense 6120 and Inventory 1140', () => {
    const res = resolveItemGinAccounts({ name: 'Chlorine Bleach', category_name: "Cleaning Equipment's and Chemicals" })
    expect(res.debitLedgerCode).toBe('6120')
    expect(res.creditLedgerCode).toBe('1140')
    expect(res.allocationType).toBe('OPERATING_EXPENSE')
  })

  it('resolves cooking fuel to Expense 6170 and Inventory 1150', () => {
    const res = resolveItemGinAccounts({ name: 'Litro Gas Cylinder', category_name: 'Cooking Fuels and Accessories' })
    expect(res.debitLedgerCode).toBe('6170')
    expect(res.creditLedgerCode).toBe('1150')
    expect(res.allocationType).toBe('OPERATING_EXPENSE')
  })

  it('resolves staff meals to Staff Welfare Expense 6020', () => {
    const res = resolveItemGinAccounts({ name: 'Staff Lunch Rice' }, 'Staff Meal issue')
    expect(res.debitLedgerCode).toBe('6020')
    expect(res.creditLedgerCode).toBe('1080')
    expect(res.allocationType).toBe('OPERATING_EXPENSE')
  })

  it('includes 7050 in income tax codes for statements', () => {
    expect(INCOME_TAX_CODES).toContain('7050')
  })

  it('supports configurable section names and COGS labels via sectionConfigService', async () => {
    const { DEFAULT_KOTTAWA_SECTIONS, resolveCogsLabel } = await import(
      'src/services/inventory/sectionConfigService'
    )
    expect(DEFAULT_KOTTAWA_SECTIONS.length).toBe(10)

    // Verify default labels
    expect(resolveCogsLabel('KOT-01', DEFAULT_KOTTAWA_SECTIONS)).toBe('COGS – Benmar')
    expect(resolveCogsLabel('KOT-02', DEFAULT_KOTTAWA_SECTIONS)).toBe(
      'COGS – Cashier (direct production only)',
    )
    expect(resolveCogsLabel('KOT-04', DEFAULT_KOTTAWA_SECTIONS)).toBe('COGS – Chinese')
    expect(resolveCogsLabel('KOT-05', DEFAULT_KOTTAWA_SECTIONS)).toBe('COGS – Rice and Curry')
    expect(resolveCogsLabel('KOT-06', DEFAULT_KOTTAWA_SECTIONS)).toBe('COGS – Italian')
    expect(resolveCogsLabel('KOT-07', DEFAULT_KOTTAWA_SECTIONS)).toBe('COGS – Juice Bar')
    expect(resolveCogsLabel('KOT-10', DEFAULT_KOTTAWA_SECTIONS)).toBe('COGS – Kottu and Roti')

    // Test customization: user renames KOT-01 to "Hot Kitchen"
    const customized = DEFAULT_KOTTAWA_SECTIONS.map((s) =>
      s.code === 'KOT-01' ? { ...s, name: 'Hot Kitchen', cogs_label: 'COGS – Hot Kitchen' } : s,
    )
    expect(resolveCogsLabel('KOT-01', customized)).toBe('COGS – Hot Kitchen')
  })
})
