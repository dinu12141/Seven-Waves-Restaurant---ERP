// ═══════════════════════════════════════════════════════════════════════════════
// Finance Export Service — Professional Excel & PDF Statement Generators
// Seven Waves Restaurant (Pvt) Ltd
// P&L and Balance Sheet exports walk the same report.layout as the viewer.
// ═══════════════════════════════════════════════════════════════════════════════

import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { showStatementGroupHeading, visibleStatementItems } from './finance-statements.builder'

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

// ── Generic statement walker ─────────────────────────────────────────────────
// The Excel and PDF writers both walk report.layout — the same structure the
// on-screen FinancialStatementViewer renders — so exports always match the
// screen: one heading per section, a sub-heading + subtotal per account_group
// where the viewer shows one, indented ledger lines, then the LKAS 1 subtotals.

export interface StatementExportOptions {
  hideZero?: boolean
}

type StatementLine =
  | { kind: 'title'; label: string; level: 'category' | 'section' | 'group' }
  | { kind: 'item'; code: string; name: string; amount: number | null; depth: number; bold?: boolean }
  | { kind: 'total'; label: string; amount: number; level: 'group' | 'section' | 'major' | 'grand' }
  | { kind: 'spacer' }

export function statementLines(report: any, opts: StatementExportOptions = {}): StatementLine[] {
  const lines: StatementLine[] = []
  for (const block of report?.layout || []) {
    if (block.kind === 'heading') {
      lines.push({ kind: 'title', label: block.label, level: 'category' })
    } else if (block.kind === 'section') {
      const section = block.section
      lines.push({ kind: 'title', label: section.label, level: 'section' })
      for (const group of section.groups || []) {
        const withHeading = showStatementGroupHeading(section, group)
        const base = withHeading ? 1 : 0
        if (withHeading) lines.push({ kind: 'title', label: group.label, level: 'group' })
        for (const item of visibleStatementItems(group, !!opts.hideZero)) {
          const contra = item.is_contra && item.kind === 'ledger' ? 'Less: ' : ''
          lines.push({
            kind: 'item',
            code: item.code || '',
            name: contra + item.name,
            amount: item.kind === 'header' ? null : Number(item.amount || 0),
            depth: base + (item.depth || 0),
            bold: item.kind !== 'ledger',
          })
        }
        if (withHeading) lines.push({ kind: 'total', label: `Total ${group.label}`, amount: group.total || 0, level: 'group' })
      }
      lines.push({ kind: 'total', label: section.total_label || `TOTAL ${section.label}`, amount: section.total || 0, level: 'section' })
    } else if (block.kind === 'subtotal') {
      lines.push({ kind: 'total', label: block.label, amount: block.amount || 0, level: block.level === 'grand' ? 'grand' : 'major' })
      if (block.level === 'grand') lines.push({ kind: 'spacer' })
    }
  }
  return lines
}

async function exportStatementToExcel(report: any, sheetName: string, defaultTitle: string, subtitle: string, fileBase: string, opts: StatementExportOptions) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Seven Waves Restaurant ERP'
  const ws = wb.addWorksheet(sheetName)

  ws.columns = [
    { width: 14 }, // Code
    { width: 50 }, // Account Name
    { width: 18 }, // Detail Amount
    { width: 20 }, // Total Amount
  ]

  const navyHeader = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1A237E' } }
  const subTitle = { name: 'Calibri', size: 11, bold: true }
  const italicNote = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF555555' } }
  const normalFont = { name: 'Calibri', size: 10 }
  const boldFont = { name: 'Calibri', size: 10, bold: true }
  const numFmt = '#,##0.00;(#,##0.00);"-"'

  const r1 = ws.addRow(['', report.company_name || 'SEVEN WAVES RESTAURANT (PVT) LTD'])
  r1.getCell(2).font = navyHeader
  const r2 = ws.addRow(['', report.title || defaultTitle])
  r2.getCell(2).font = subTitle
  const r3 = ws.addRow(['', subtitle])
  r3.getCell(2).font = italicNote
  ws.addRow([])

  for (const line of statementLines(report, opts)) {
    if (line.kind === 'spacer') {
      ws.addRow([])
    } else if (line.kind === 'title') {
      const indent = line.level === 'group' ? '    ' : line.level === 'section' ? '  ' : ''
      const row = ws.addRow(['', indent + line.label])
      row.getCell(2).font = { name: 'Calibri', size: line.level === 'category' ? 12 : 11, bold: true }
      if (line.level !== 'group') {
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }
      }
    } else if (line.kind === 'item') {
      const row = ws.addRow([line.code, '    '.repeat(line.depth + 1) + line.name, line.amount ?? '', ''])
      row.getCell(1).font = italicNote
      row.getCell(2).font = line.bold ? boldFont : normalFont
      row.getCell(3).font = line.bold ? boldFont : normalFont
      row.getCell(3).numFmt = numFmt
      row.getCell(3).alignment = { horizontal: 'right' }
    } else {
      const isGroup = line.level === 'group'
      const isGrand = line.level === 'grand'
      const row = ws.addRow(['', (isGroup ? '    ' : '') + line.label, isGroup ? line.amount : '', isGroup ? '' : line.amount])
      const font = isGrand ? { name: 'Calibri', size: 11, bold: true } : boldFont
      row.getCell(2).font = font
      const cell = row.getCell(isGroup ? 3 : 4)
      cell.font = font
      cell.numFmt = numFmt
      cell.alignment = { horizontal: 'right' }
      if (isGrand) cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } }
      else if (line.level === 'major') cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } }
      else if (isGroup) cell.border = { top: { style: 'hair' } }
    }
  }

  if (report.type === 'bs' || report.is_balanced !== undefined) {
    ws.addRow([])
    const check = ws.addRow([
      '',
      report.is_balanced
        ? 'Balanced: Total Assets = Total Equity and Liabilities'
        : `NOT BALANCED — difference ${formatMoney(report.difference)}`,
    ])
    check.getCell(2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: report.is_balanced ? 'FF2E7D32' : 'FFC62828' } }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `${fileBase}_${dateStr}.xlsx`)
}

function exportStatementToPdf(report: any, defaultTitle: string, subtitle: string, fileBase: string, opts: StatementExportOptions) {
  const doc = new jsPDF('p', 'mm', 'a4')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(26, 35, 126)
  doc.text(report.company_name || 'SEVEN WAVES RESTAURANT (PVT) LTD', 105, 16, { align: 'center' })

  doc.setFontSize(11)
  doc.setTextColor(33, 33, 33)
  doc.text(report.title || defaultTitle, 105, 23, { align: 'center' })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(subtitle, 105, 29, { align: 'center' })

  const tableBody: any[] = []
  const navy: [number, number, number] = [26, 35, 126]
  const dark: [number, number, number] = [33, 33, 33]

  for (const line of statementLines(report, opts)) {
    if (line.kind === 'spacer') continue
    if (line.kind === 'title') {
      if (line.level === 'group') {
        tableBody.push(['', { content: '  ' + line.label, colSpan: 3, styles: { fontStyle: 'bold', textColor: [55, 71, 79] } }])
      } else {
        tableBody.push([
          {
            content: line.label,
            colSpan: 4,
            styles: { fontStyle: 'bold', fillColor: line.level === 'category' ? [224, 230, 240] : [240, 244, 248], textColor: navy },
          },
        ])
      }
    } else if (line.kind === 'item') {
      tableBody.push([
        line.code,
        { content: '  '.repeat(line.depth + 1) + line.name, styles: line.bold ? { fontStyle: 'bold' } : {} },
        line.amount === null ? '' : line.amount !== 0 ? formatMoney(line.amount) : '-',
        '',
      ])
    } else {
      const isGroup = line.level === 'group'
      const isGrand = line.level === 'grand'
      const color = isGrand ? navy : dark
      const amount = { content: (isGroup ? '' : 'LKR ') + formatMoney(line.amount), styles: { fontStyle: 'bold', halign: 'right', textColor: color } }
      tableBody.push([
        '',
        { content: (isGroup ? '  ' : '') + line.label, styles: { fontStyle: 'bold', textColor: color } },
        isGroup ? amount : '',
        isGroup ? '' : amount,
      ])
    }
  }

  if (report.is_balanced !== undefined) {
    tableBody.push([
      {
        content: report.is_balanced
          ? 'Balanced: Total Assets = Total Equity and Liabilities'
          : `NOT BALANCED — difference LKR ${formatMoney(report.difference)}`,
        colSpan: 4,
        styles: { fontStyle: 'bold', textColor: report.is_balanced ? [46, 125, 50] : [198, 40, 40] },
      },
    ])
  }

  autoTable(doc, {
    startY: 34,
    head: [['Code', 'Account Description', 'Amount (LKR)', 'Total (LKR)']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'italic', textColor: [120, 120, 120] },
      1: { cellWidth: 96 },
      2: { cellWidth: 36, halign: 'right' },
      3: { cellWidth: 36, halign: 'right' },
    },
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    margin: { left: 10, right: 10 },
    didDrawPage: () => {
      const str = 'Page ' + (doc as any).internal.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(str, 105, 290, { align: 'center' })
      doc.text('Seven Waves Restaurant ERP — Confidential', 10, 290)
    },
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  doc.save(`${fileBase}_${dateStr}.pdf`)
}

export const financeExportService = {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. PROFIT & LOSS — EXCEL EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  async exportProfitLossToExcel(pl: any, opts: StatementExportOptions = {}) {
    await exportStatementToExcel(pl, 'Profit and Loss', 'STATEMENT OF PROFIT OR LOSS', pl.period || '', 'Profit_and_Loss_Statement', opts)
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PROFIT & LOSS — PDF EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  exportProfitLossToPdf(pl: any, opts: StatementExportOptions = {}) {
    exportStatementToPdf(pl, 'STATEMENT OF PROFIT OR LOSS', pl.period || '', 'Profit_and_Loss_Statement', opts)
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. BALANCE SHEET — EXCEL EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  async exportBalanceSheetToExcel(bs: any, opts: StatementExportOptions = {}) {
    await exportStatementToExcel(bs, 'Balance Sheet', 'STATEMENT OF FINANCIAL POSITION', bs.as_of_date || '', 'Statement_of_Financial_Position', opts)
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. BALANCE SHEET — PDF EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  exportBalanceSheetToPdf(bs: any, opts: StatementExportOptions = {}) {
    exportStatementToPdf(bs, 'STATEMENT OF FINANCIAL POSITION', bs.as_of_date || '', 'Statement_of_Financial_Position', opts)
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
