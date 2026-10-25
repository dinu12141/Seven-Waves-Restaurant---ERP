// ═══════════════════════════════════════════════════════════════════════════════
// Finance Export Service — Professional Excel & PDF Statement Generators
// Seven Waves Restaurant (Pvt) Ltd
// Matches exact layout of Chart OF Accounts UPDATED.xlsx
// ═══════════════════════════════════════════════════════════════════════════════

import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function formatMoney(num: number | undefined | null): string {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '0.00'
  const val = Number(num)
  if (val < 0) {
    return `(${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  }
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const financeExportService = {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. PROFIT & LOSS — EXCEL EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  async exportProfitLossToExcel(pl: any) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Seven Waves Restaurant ERP'
    const ws = wb.addWorksheet('Profit and Loss')

    // Column widths
    ws.columns = [
      { width: 14 }, // Code
      { width: 44 }, // Account Name
      { width: 18 }, // Detail Amount
      { width: 20 }, // Total Amount
    ]

    const navyHeader = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1A237E' } }
    const subTitle = { name: 'Calibri', size: 11, bold: true }
    const italicNote = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF555555' } }
    const sectionHeader = { name: 'Calibri', size: 11, bold: true }
    const normalFont = { name: 'Calibri', size: 10 }
    const boldFont = { name: 'Calibri', size: 10, bold: true }
    const numFmt = '#,##0.00;(#,##0.00);"-"'

    // Header rows
    const r1 = ws.addRow(['', pl.company_name || 'SEVEN WAVES RESTAURANT (PVT) LTD'])
    r1.getCell(2).font = navyHeader
    const r2 = ws.addRow(['', pl.title || 'STATEMENT OF PROFIT AND LOSS'])
    r2.getCell(2).font = subTitle
    const r3 = ws.addRow(['', pl.period || ''])
    r3.getCell(2).font = italicNote
    ws.addRow([]) // spacer

    const addSectionHeader = (title: string) => {
      const row = ws.addRow(['', title])
      row.getCell(2).font = sectionHeader
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }
    }

    const addItemRow = (code: string, name: string, amount: number) => {
      const row = ws.addRow([code, '    ' + name, amount, ''])
      row.getCell(1).font = italicNote
      row.getCell(2).font = normalFont
      row.getCell(3).font = normalFont
      row.getCell(3).numFmt = numFmt
      row.getCell(3).alignment = { horizontal: 'right' }
    }

    const addSubtotalRow = (label: string, total: number, isMajor = false) => {
      const row = ws.addRow(['', label, '', total])
      row.getCell(2).font = boldFont
      row.getCell(4).font = boldFont
      row.getCell(4).numFmt = numFmt
      row.getCell(4).alignment = { horizontal: 'right' }
      if (isMajor) {
        row.getCell(4).border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
        }
      }
    }

    // 1. REVENUE
    addSectionHeader('REVENUE')
    pl.revenue?.items?.forEach((item: any) => addItemRow(item.code, item.name, item.amount))
    addSubtotalRow('TOTAL REVENUE', pl.revenue?.total || 0)

    // 2. OTHER INCOME
    addSectionHeader('OTHER INCOME')
    pl.other_income?.items?.forEach((item: any) => addItemRow(item.code, item.name, item.amount))
    addSubtotalRow('TOTAL OTHER INCOME', pl.other_income?.total || 0)
    addSubtotalRow('TOTAL INCOME', pl.total_income || 0, true)

    // 3. COST OF GOODS SOLD (COGS)
    addSectionHeader('COST OF GOODS SOLD (COGS)')
    pl.cost_of_sales?.items?.forEach((item: any) => addItemRow(item.code, item.name, item.amount))
    addSubtotalRow('TOTAL COST OF SALES', pl.cost_of_sales?.total || 0)
    addSubtotalRow('GROSS PROFIT', pl.gross_profit || 0, true)

    // 4. EXPENSES
    addSectionHeader('EXPENSES')

    // 4a. Admin & Operations
    addSectionHeader('  ADMIN AND OPERATION EXPENSES')
    pl.expenses?.admin_and_operation?.items?.forEach((item: any) => addItemRow(item.code, item.name, item.amount))
    addSubtotalRow('  TOTAL ADMIN AND OPERATION EXPENSES', pl.expenses?.admin_and_operation?.total || 0)

    // 4b. Selling & Distribution
    addSectionHeader('  SELLING AND DISTRIBUTION EXPENSES')
    pl.expenses?.selling_and_distribution?.items?.forEach((item: any) => addItemRow(item.code, item.name, item.amount))
    addSubtotalRow('  TOTAL SELLING AND DISTRIBUTION', pl.expenses?.selling_and_distribution?.total || 0)

    // 4c. Finance & Other Expenses
    addSectionHeader('  FINANCE AND OTHER EXPENSES')
    pl.expenses?.finance_and_other?.items?.forEach((item: any) => addItemRow(item.code, item.name, item.amount))
    addSubtotalRow('  TOTAL FINANCE AND OTHER EXPENSES', pl.expenses?.finance_and_other?.total || 0)

    addSubtotalRow('TOTAL EXPENSES', pl.expenses?.total_expenses || 0, true)

    // 5. NET PROFIT BEFORE TAX
    addSubtotalRow('NET PROFIT BEFORE TAX', pl.net_profit_before_tax || 0, true)

    // 6. TAX
    if (pl.tax?.amount) {
      const taxRow = ws.addRow(['7043', 'TAX (Corporate Income Tax)', '', pl.tax.amount])
      taxRow.getCell(2).font = normalFont
      taxRow.getCell(4).font = normalFont
      taxRow.getCell(4).numFmt = numFmt
      taxRow.getCell(4).alignment = { horizontal: 'right' }
    }

    // 7. NET PROFIT / NET LOSS (Double underline)
    const netLabel = (pl.net_profit || 0) >= 0 ? 'NET PROFIT' : 'NET LOSS'
    const netRow = ws.addRow(['', netLabel, '', pl.net_profit || 0])
    netRow.getCell(2).font = { name: 'Calibri', size: 12, bold: true }
    netRow.getCell(4).font = { name: 'Calibri', size: 12, bold: true }
    netRow.getCell(4).numFmt = numFmt
    netRow.getCell(4).alignment = { horizontal: 'right' }
    netRow.getCell(4).border = {
      top: { style: 'thin' },
      bottom: { style: 'double' },
    }

    // Write file
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const dateStr = new Date().toISOString().slice(0, 10)
    triggerDownload(blob, `Profit_and_Loss_Statement_${dateStr}.xlsx`)
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PROFIT & LOSS — PDF EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  exportProfitLossToPdf(pl: any) {
    const doc = new jsPDF('p', 'mm', 'a4')

    // Corporate Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(26, 35, 126)
    doc.text(pl.company_name || 'SEVEN WAVES RESTAURANT (PVT) LTD', 105, 16, { align: 'center' })

    doc.setFontSize(11)
    doc.setTextColor(33, 33, 33)
    doc.text(pl.title || 'STATEMENT OF PROFIT AND LOSS', 105, 23, { align: 'center' })

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(pl.period || '', 105, 29, { align: 'center' })

    const tableBody: any[] = []

    const pushHeader = (title: string) => {
      tableBody.push([{ content: title, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 244, 248], textColor: [26, 35, 126] } }])
    }

    const pushItem = (code: string, name: string, amount: number) => {
      tableBody.push([code, '    ' + name, amount !== 0 ? formatMoney(amount) : '-'])
    }

    const pushTotal = (label: string, total: number, isMajor = false) => {
      tableBody.push([
        '',
        { content: label, styles: { fontStyle: 'bold' } },
        {
          content: 'LKR ' + formatMoney(total),
          styles: {
            fontStyle: 'bold',
            halign: 'right',
            textColor: total >= 0 ? [0, 128, 0] : [200, 0, 0],
          },
        },
      ])
    }

    pushHeader('REVENUE')
    pl.revenue?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL REVENUE', pl.revenue?.total || 0)

    pushHeader('OTHER INCOME')
    pl.other_income?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL OTHER INCOME', pl.other_income?.total || 0)
    pushTotal('TOTAL INCOME', pl.total_income || 0, true)

    pushHeader('COST OF GOODS SOLD (COGS)')
    pl.cost_of_sales?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL COST OF SALES', pl.cost_of_sales?.total || 0)
    pushTotal('GROSS PROFIT', pl.gross_profit || 0, true)

    pushHeader('ADMIN AND OPERATION EXPENSES')
    pl.expenses?.admin_and_operation?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL ADMIN AND OPERATION EXPENSES', pl.expenses?.admin_and_operation?.total || 0)

    pushHeader('SELLING AND DISTRIBUTION EXPENSES')
    pl.expenses?.selling_and_distribution?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL SELLING AND DISTRIBUTION', pl.expenses?.selling_and_distribution?.total || 0)

    pushHeader('FINANCE AND OTHER EXPENSES')
    pl.expenses?.finance_and_other?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL FINANCE AND OTHER EXPENSES', pl.expenses?.finance_and_other?.total || 0)

    pushTotal('TOTAL EXPENSES', pl.expenses?.total_expenses || 0, true)
    pushTotal('NET PROFIT BEFORE TAX', pl.net_profit_before_tax || 0, true)

    if (pl.tax?.amount) {
      tableBody.push(['7043', 'TAX (Corporate Income Tax)', 'LKR ' + formatMoney(pl.tax.amount)])
    }

    pushTotal((pl.net_profit || 0) >= 0 ? 'NET PROFIT' : 'NET LOSS', pl.net_profit || 0, true)

    autoTable(doc, {
      startY: 34,
      head: [['Code', 'Account Description', 'Amount (LKR)']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: 'italic', textColor: [120, 120, 120] },
        1: { cellWidth: 120 },
        2: { cellWidth: 46, halign: 'right' },
      },
      styles: { fontSize: 8.5, cellPadding: 2 },
      margin: { left: 10, right: 10 },
      didDrawPage: (data) => {
        const str = 'Page ' + (doc as any).internal.getNumberOfPages()
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(str, 105, 290, { align: 'center' })
        doc.text('Seven Waves Restaurant ERP — Confidential', 10, 290)
      },
    })

    const dateStr = new Date().toISOString().slice(0, 10)
    doc.save(`Profit_and_Loss_Statement_${dateStr}.pdf`)
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. BALANCE SHEET — EXCEL EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  async exportBalanceSheetToExcel(bs: any) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Seven Waves Restaurant ERP'
    const ws = wb.addWorksheet('Balance Sheet')

    ws.columns = [
      { width: 14 },
      { width: 44 },
      { width: 18 },
      { width: 20 },
    ]

    const navyHeader = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1A237E' } }
    const subTitle = { name: 'Calibri', size: 11, bold: true }
    const italicNote = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF555555' } }
    const sectionHeader = { name: 'Calibri', size: 11, bold: true }
    const normalFont = { name: 'Calibri', size: 10 }
    const boldFont = { name: 'Calibri', size: 10, bold: true }
    const numFmt = '#,##0.00;(#,##0.00);"-"'

    const r1 = ws.addRow(['', bs.company_name || 'SEVEN WAVES RESTAURANT (PVT) LTD'])
    r1.getCell(2).font = navyHeader
    const r2 = ws.addRow(['', bs.title || 'STATEMENT OF FINANCIAL POSITION'])
    r2.getCell(2).font = subTitle
    const r3 = ws.addRow(['', bs.as_of_date || ''])
    r3.getCell(2).font = italicNote
    ws.addRow([])

    const addSectionHeader = (title: string) => {
      const row = ws.addRow(['', title])
      row.getCell(2).font = sectionHeader
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }
    }

    const addItemRow = (code: string, name: string, amount: number) => {
      const row = ws.addRow([code, '    ' + name, amount, ''])
      row.getCell(1).font = italicNote
      row.getCell(2).font = normalFont
      row.getCell(3).font = normalFont
      row.getCell(3).numFmt = numFmt
      row.getCell(3).alignment = { horizontal: 'right' }
    }

    const addSubtotalRow = (label: string, total: number, isMajor = false, isFinal = false) => {
      const row = ws.addRow(['', label, '', total])
      row.getCell(2).font = isFinal ? { name: 'Calibri', size: 11, bold: true } : boldFont
      row.getCell(4).font = isFinal ? { name: 'Calibri', size: 11, bold: true } : boldFont
      row.getCell(4).numFmt = numFmt
      row.getCell(4).alignment = { horizontal: 'right' }
      if (isFinal) {
        row.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'double' } }
      } else if (isMajor) {
        row.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } }
      }
    }

    // ── ASSETS ──
    addSectionHeader('ASSETS')

    // Non-Current Assets
    addSectionHeader('  NON-CURRENT ASSETS')
    bs.assets?.non_current?.items?.forEach((i: any) => addItemRow(i.code, i.name, i.amount))
    addSubtotalRow('  TOTAL NON-CURRENT ASSETS', bs.assets?.non_current?.total || 0)

    // Current Assets
    addSectionHeader('  CURRENT ASSETS')
    bs.assets?.current?.items?.forEach((i: any) => addItemRow(i.code, i.name, i.amount))
    addSubtotalRow('  TOTAL CURRENT ASSETS', bs.assets?.current?.total || 0)

    addSubtotalRow('TOTAL ASSETS', bs.assets?.total_assets || 0, false, true)
    ws.addRow([])

    // ── EQUITY AND LIABILITIES ──
    addSectionHeader('EQUITY AND LIABILITIES')

    // Equity
    addSectionHeader('  EQUITY')
    bs.equity_and_liabilities?.equity?.items?.forEach((i: any) => addItemRow(i.code, i.name, i.amount))
    addSubtotalRow('  TOTAL EQUITY', bs.equity_and_liabilities?.equity?.total || 0)

    // Non-Current Liabilities
    addSectionHeader('  NON CURRENT LIABILITIES')
    bs.equity_and_liabilities?.non_current_liabilities?.items?.forEach((i: any) => addItemRow(i.code, i.name, i.amount))
    addSubtotalRow('  TOTAL NON CURRENT LIABILITIES', bs.equity_and_liabilities?.non_current_liabilities?.total || 0)

    // Current Liabilities
    addSectionHeader('  CURRENT LIABILITIES')
    bs.equity_and_liabilities?.current_liabilities?.items?.forEach((i: any) => addItemRow(i.code, i.name, i.amount))
    addSubtotalRow('  TOTAL CURRENT LIABILITIES', bs.equity_and_liabilities?.current_liabilities?.total || 0)

    addSubtotalRow('TOTAL EQUITY AND LIABILITIES', bs.equity_and_liabilities?.total_liabilities_equity || 0, false, true)

    // Write file
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const dateStr = new Date().toISOString().slice(0, 10)
    triggerDownload(blob, `Statement_of_Financial_Position_${dateStr}.xlsx`)
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. BALANCE SHEET — PDF EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  exportBalanceSheetToPdf(bs: any) {
    const doc = new jsPDF('p', 'mm', 'a4')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(26, 35, 126)
    doc.text(bs.company_name || 'SEVEN WAVES RESTAURANT (PVT) LTD', 105, 16, { align: 'center' })

    doc.setFontSize(11)
    doc.setTextColor(33, 33, 33)
    doc.text(bs.title || 'STATEMENT OF FINANCIAL POSITION', 105, 23, { align: 'center' })

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(bs.as_of_date || '', 105, 29, { align: 'center' })

    const tableBody: any[] = []

    const pushHeader = (title: string) => {
      tableBody.push([{ content: title, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 244, 248], textColor: [26, 35, 126] } }])
    }

    const pushItem = (code: string, name: string, amount: number) => {
      tableBody.push([code, '    ' + name, amount !== 0 ? formatMoney(amount) : '-'])
    }

    const pushTotal = (label: string, total: number, isFinal = false) => {
      tableBody.push([
        '',
        { content: label, styles: { fontStyle: 'bold', textColor: isFinal ? [26, 35, 126] : [33, 33, 33] } },
        {
          content: 'LKR ' + formatMoney(total),
          styles: { fontStyle: 'bold', halign: 'right', textColor: isFinal ? [26, 35, 126] : [33, 33, 33] },
        },
      ])
    }

    pushHeader('NON-CURRENT ASSETS')
    bs.assets?.non_current?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL NON-CURRENT ASSETS', bs.assets?.non_current?.total || 0)

    pushHeader('CURRENT ASSETS')
    bs.assets?.current?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL CURRENT ASSETS', bs.assets?.current?.total || 0)
    pushTotal('TOTAL ASSETS', bs.assets?.total_assets || 0, true)

    pushHeader('EQUITY')
    bs.equity_and_liabilities?.equity?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL EQUITY', bs.equity_and_liabilities?.equity?.total || 0)

    pushHeader('NON CURRENT LIABILITIES')
    bs.equity_and_liabilities?.non_current_liabilities?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL NON CURRENT LIABILITIES', bs.equity_and_liabilities?.non_current_liabilities?.total || 0)

    pushHeader('CURRENT LIABILITIES')
    bs.equity_and_liabilities?.current_liabilities?.items?.forEach((i: any) => pushItem(i.code, i.name, i.amount))
    pushTotal('TOTAL CURRENT LIABILITIES', bs.equity_and_liabilities?.current_liabilities?.total || 0)
    pushTotal('TOTAL EQUITY AND LIABILITIES', bs.equity_and_liabilities?.total_liabilities_equity || 0, true)

    autoTable(doc, {
      startY: 34,
      head: [['Code', 'Account Description', 'Amount (LKR)']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: 'italic', textColor: [120, 120, 120] },
        1: { cellWidth: 120 },
        2: { cellWidth: 46, halign: 'right' },
      },
      styles: { fontSize: 8.5, cellPadding: 2 },
      margin: { left: 10, right: 10 },
      didDrawPage: (data) => {
        const str = 'Page ' + (doc as any).internal.getNumberOfPages()
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(str, 105, 290, { align: 'center' })
        doc.text('Seven Waves Restaurant ERP — Confidential', 10, 290)
      },
    })

    const dateStr = new Date().toISOString().slice(0, 10)
    doc.save(`Statement_of_Financial_Position_${dateStr}.pdf`)
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. TRIAL BALANCE — EXCEL & PDF EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  async exportTrialBalanceToExcel(tb: any) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Seven Waves Restaurant ERP'
    const ws = wb.addWorksheet('Trial Balance')

    ws.columns = [
      { width: 14 },
      { width: 36 },
      { width: 16 },
      { width: 28 },
      { width: 18 },
      { width: 18 },
    ]

    const navyHeader = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1A237E' } }
    const numFmt = '#,##0.00;(#,##0.00);"-"'

    const r1 = ws.addRow(['', 'SEVEN WAVES RESTAURANT (PVT) LTD'])
    r1.getCell(2).font = navyHeader
    const r2 = ws.addRow(['', 'TRIAL BALANCE REPORT'])
    r2.getCell(2).font = { name: 'Calibri', size: 12, bold: true }
    ws.addRow([])

    const headRow = ws.addRow(['Code', 'Account Name', 'Type', 'Account Group', 'Closing Debit (LKR)', 'Closing Credit (LKR)'])
    headRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    headRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } }
    })

    tb.rows?.forEach((r: any) => {
      const row = ws.addRow([
        r.ledger_code,
        r.ledger_name,
        r.ledger_type,
        r.account_group,
        r.closing_debit || '',
        r.closing_credit || '',
      ])
      row.getCell(5).numFmt = numFmt
      row.getCell(6).numFmt = numFmt
    })

    const totRow = ws.addRow(['', 'TOTAL', '', '', tb.totalDebit || 0, tb.totalCredit || 0])
    totRow.font = { name: 'Calibri', size: 11, bold: true }
    totRow.getCell(5).numFmt = numFmt
    totRow.getCell(6).numFmt = numFmt
    totRow.getCell(5).border = { top: { style: 'thin' }, bottom: { style: 'double' } }
    totRow.getCell(6).border = { top: { style: 'thin' }, bottom: { style: 'double' } }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const dateStr = new Date().toISOString().slice(0, 10)
    triggerDownload(blob, `Trial_Balance_${dateStr}.xlsx`)
  },

  exportTrialBalanceToPdf(tb: any) {
    const doc = new jsPDF('l', 'mm', 'a4')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(26, 35, 126)
    doc.text('SEVEN WAVES RESTAURANT (PVT) LTD', 148, 16, { align: 'center' })

    doc.setFontSize(11)
    doc.setTextColor(33, 33, 33)
    doc.text('TRIAL BALANCE REPORT', 148, 23, { align: 'center' })

    const tableBody = (tb.rows || []).map((r: any) => [
      r.ledger_code,
      r.ledger_name,
      r.ledger_type,
      r.account_group,
      r.closing_debit > 0 ? formatMoney(r.closing_debit) : '-',
      r.closing_credit > 0 ? formatMoney(r.closing_credit) : '-',
    ])

    tableBody.push([
      '',
      'TOTAL',
      '',
      '',
      formatMoney(tb.totalDebit || 0),
      formatMoney(tb.totalCredit || 0),
    ])

    autoTable(doc, {
      startY: 30,
      head: [['Code', 'Account Name', 'Type', 'Account Group', 'Closing Debit (LKR)', 'Closing Credit (LKR)']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    })

    const dateStr = new Date().toISOString().slice(0, 10)
    doc.save(`Trial_Balance_${dateStr}.pdf`)
  },
}
