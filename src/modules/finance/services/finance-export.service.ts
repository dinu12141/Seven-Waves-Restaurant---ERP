// ═══════════════════════════════════════════════════════════════════════════════
// Finance Export Service — Professional Excel, PDF & Word Statement Generators
// Seven Waves Restaurant (Pvt) Ltd
// Conforming to International Accounting Standards (IAS 1 & IAS 7 / LKAS / IFRS)
// P&L and Balance Sheet exports walk the same report.layout as the viewer.
// ═══════════════════════════════════════════════════════════════════════════════

import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  PageOrientation,
} from 'docx'
import { showStatementGroupHeading, visibleStatementItems } from './finance-statements.builder'
import { getLogoData } from 'src/services/exportService'

export function formatMoney(num: number | undefined | null, zeroAsDash = false): string {
  if (num === null || num === undefined || isNaN(num)) return zeroAsDash ? '-' : '0.00'
  const val = Number(num)
  if (Math.abs(val) < 0.005) return zeroAsDash ? '-' : '0.00'
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
// The Excel, PDF, and Word writers walk report.layout — the same structure the
// on-screen FinancialStatementViewer renders — so exports always match the
// screen: one heading per section, a sub-heading + subtotal per account_group
// where the viewer shows one, indented ledger lines, then the LKAS 1 subtotals.

export interface StatementExportOptions {
  hideZero?: boolean
}

export type StatementLine =
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

// ── Word Document Helper Functions ───────────────────────────────────────────

function createWordHeader(companyName: string, title: string, subtitle: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({
          text: companyName || 'SEVEN WAVES RESTAURANT (PVT) LTD',
          font: 'Calibri',
          size: 28, // 14pt
          bold: true,
          color: '1A237E',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({
          text: title,
          font: 'Calibri',
          size: 22, // 11pt
          bold: true,
          color: '212121',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 220 },
      children: [
        new TextRun({
          text: `${subtitle ? subtitle + ' · ' : ''}Amounts in Sri Lankan Rupees (LKR)`,
          font: 'Calibri',
          size: 18, // 9pt
          italics: true,
          color: '555555',
        }),
      ],
    }),
  ]
}

function wordHeaderCell(text: string, widthPercent: number, align: any = AlignmentType.LEFT): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text, font: 'Calibri', size: 18, bold: true, color: 'FFFFFF' })],
      }),
    ],
    shading: { fill: '1A237E' },
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
  })
}

function wordDataCell(
  text: string,
  widthPercent: number,
  opts: {
    bold?: boolean
    italic?: boolean
    align?: any
    color?: string
    fill?: string
    borders?: any
    size?: number
  } = {},
): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            font: 'Calibri',
            size: opts.size || 18,
            bold: !!opts.bold,
            italics: !!opts.italic,
            color: opts.color || '212121',
          }),
        ],
      }),
    ],
    shading: opts.fill ? { fill: opts.fill } : undefined,
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    borders: opts.borders || {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
    },
  })
}

function wordEmptyCell(widthPercent: number): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [] })],
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STATEMENTS — EXCEL EXPORT (IAS 1 COMPLIANT)
// ═══════════════════════════════════════════════════════════════════════════════

async function exportStatementToExcel(
  report: any,
  sheetName: string,
  defaultTitle: string,
  subtitle: string,
  fileBase: string,
  opts: StatementExportOptions,
) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Seven Waves Restaurant ERP'
  const ws = wb.addWorksheet(sheetName)

  ws.columns = [
    { width: 14 }, // Code
    { width: 50 }, // Account Name
    { width: 20 }, // Detail Amount
    { width: 22 }, // Total Amount
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
  const r3 = ws.addRow(['', `${subtitle ? subtitle + ' · ' : ''}Amounts in Sri Lankan Rupees (LKR)`])
  r3.getCell(2).font = italicNote
  ws.addRow([])

  const headRow = ws.addRow(['Code', 'Account Description', 'Amount (LKR)', 'Total (LKR)'])
  headRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  headRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } }
  })
  headRow.getCell(3).alignment = { horizontal: 'right' }
  headRow.getCell(4).alignment = { horizontal: 'right' }

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
      const font = isGrand ? { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1A237E' } } : boldFont
      row.getCell(2).font = font
      const cell = row.getCell(isGroup ? 3 : 4)
      cell.font = font
      cell.numFmt = numFmt
      cell.alignment = { horizontal: 'right' }
      if (isGrand) cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } }
      else if (line.level === 'major' || line.level === 'section') cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } }
      else if (isGroup) cell.border = { top: { style: 'hair' } }
    }
  }

  if (report.type === 'bs' || report.is_balanced !== undefined) {
    ws.addRow([])
    const check = ws.addRow([
      '',
      report.is_balanced
        ? '✓ Statement of Financial Position is balanced (Total Assets = Total Equity and Liabilities)'
        : `⚠ NOT BALANCED — difference LKR ${formatMoney(report.difference)}`,
    ])
    check.getCell(2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: report.is_balanced ? 'FF2E7D32' : 'FFC62828' } }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `${fileBase}_${dateStr}.xlsx`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. STATEMENTS — PDF EXPORT (IAS 1 COMPLIANT)
// ═══════════════════════════════════════════════════════════════════════════════

function exportStatementToPdf(
  report: any,
  defaultTitle: string,
  subtitle: string,
  fileBase: string,
  opts: StatementExportOptions,
) {
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
  doc.text(`${subtitle ? subtitle + ' · ' : ''}Amounts in Sri Lankan Rupees (LKR)`, 105, 29, { align: 'center' })

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

  if (report.type === 'bs' || report.is_balanced !== undefined) {
    tableBody.push([
      {
        content: report.is_balanced
          ? '✓ Statement of Financial Position is balanced (Total Assets = Total Equity and Liabilities)'
          : `⚠ NOT BALANCED — difference LKR ${formatMoney(report.difference)}`,
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

// ═══════════════════════════════════════════════════════════════════════════════
// 3. STATEMENTS — WORD EXPORT (IAS 1 COMPLIANT)
// ═══════════════════════════════════════════════════════════════════════════════

async function exportStatementToWord(
  report: any,
  defaultTitle: string,
  subtitle: string,
  fileBase: string,
  opts: StatementExportOptions,
) {
  const tableRows: TableRow[] = []

  // Header row
  tableRows.push(
    new TableRow({
      children: [
        wordHeaderCell('Code', 14),
        wordHeaderCell('Account Description', 50),
        wordHeaderCell('Amount (LKR)', 18, AlignmentType.RIGHT),
        wordHeaderCell('Total (LKR)', 18, AlignmentType.RIGHT),
      ],
    }),
  )

  for (const line of statementLines(report, opts)) {
    if (line.kind === 'spacer') {
      continue
    } else if (line.kind === 'title') {
      if (line.level === 'group') {
        tableRows.push(
          new TableRow({
            children: [
              wordEmptyCell(14),
              new TableCell({
                columnSpan: 3,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: '  ' + line.label, font: 'Calibri', size: 18, bold: true, color: '37474F' })],
                  }),
                ],
                width: { size: 86, type: WidthType.PERCENTAGE },
                margins: { top: 80, bottom: 80, left: 140, right: 140 },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                },
              }),
            ],
          }),
        )
      } else {
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 4,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: line.label,
                        font: 'Calibri',
                        size: line.level === 'category' ? 20 : 19,
                        bold: true,
                        color: '1A237E',
                      }),
                    ],
                  }),
                ],
                shading: { fill: line.level === 'category' ? 'E0E6F0' : 'F0F4F8' },
                width: { size: 100, type: WidthType.PERCENTAGE },
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                },
              }),
            ],
          }),
        )
      }
    } else if (line.kind === 'item') {
      tableRows.push(
        new TableRow({
          children: [
            wordDataCell(line.code, 14, { italic: true, color: '757575', size: 17 }),
            wordDataCell('  '.repeat(line.depth + 1) + line.name, 50, { bold: line.bold }),
            wordDataCell(
              line.amount === null ? '' : line.amount !== 0 ? formatMoney(line.amount) : '-',
              18,
              { align: AlignmentType.RIGHT, bold: line.bold },
            ),
            wordEmptyCell(18),
          ],
        }),
      )
    } else {
      const isGroup = line.level === 'group'
      const isGrand = line.level === 'grand'
      const isMajor = line.level === 'major' || line.level === 'section'

      const borders = isGrand
        ? {
            top: { style: BorderStyle.SINGLE, size: 6, color: '1A237E' },
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: '1A237E' },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          }
        : isMajor
        ? {
            top: { style: BorderStyle.SINGLE, size: 4, color: '424242' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '424242' },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          }
        : {
            top: { style: BorderStyle.DOTTED, size: 4, color: '9E9E9E' },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          }

      tableRows.push(
        new TableRow({
          children: [
            wordEmptyCell(14),
            wordDataCell((isGroup ? '  ' : '') + line.label, 50, {
              bold: true,
              color: isGrand ? '1A237E' : '212121',
              size: isGrand ? 20 : 18,
            }),
            isGroup
              ? wordDataCell(formatMoney(line.amount), 18, { align: AlignmentType.RIGHT, bold: true, borders })
              : wordEmptyCell(18),
            isGroup
              ? wordEmptyCell(18)
              : wordDataCell(
                  (isGrand ? 'LKR ' : '') + formatMoney(line.amount),
                  18,
                  { align: AlignmentType.RIGHT, bold: true, color: isGrand ? '1A237E' : '212121', size: isGrand ? 20 : 18, borders },
                ),
          ],
        }),
      )
    }
  }

  if (report.type === 'bs' || report.is_balanced !== undefined) {
    const isBal = !!report.is_balanced
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: isBal
                      ? '✓ Statement of Financial Position is balanced (Total Assets = Total Equity and Liabilities)'
                      : `⚠ NOT BALANCED — difference LKR ${formatMoney(report.difference)}`,
                    font: 'Calibri',
                    size: 18,
                    bold: true,
                    color: isBal ? '2E7D32' : 'C62828',
                  }),
                ],
              }),
            ],
            shading: { fill: isBal ? 'E8F5E9' : 'FFEBEE' },
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
          }),
        ],
      }),
    )
  }

  const table = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
  })

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
        children: [
          ...createWordHeader(report.company_name || 'SEVEN WAVES RESTAURANT (PVT) LTD', report.title || defaultTitle, subtitle),
          table,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `${fileBase}_${dateStr}.docx`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CASH FLOW STATEMENT (IAS 7 COMPLIANT) — EXCEL, PDF & WORD
// ═══════════════════════════════════════════════════════════════════════════════

async function exportCashFlowToExcel(cf: any, opts: { dateFrom?: string; dateTo?: string } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Seven Waves Restaurant ERP'
  const ws = wb.addWorksheet('Cash Flow Statement')

  ws.columns = [
    { width: 5 },  // indent
    { width: 55 }, // Category / Description
    { width: 22 }, // Detail Amount
    { width: 22 }, // Net Amount
  ]

  const navyHeader = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1A237E' } }
  const subTitle = { name: 'Calibri', size: 11, bold: true }
  const italicNote = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF555555' } }
  const boldFont = { name: 'Calibri', size: 10, bold: true }
  const normalFont = { name: 'Calibri', size: 10 }
  const numFmt = '#,##0.00;(#,##0.00);"-"'

  const r1 = ws.addRow(['', 'SEVEN WAVES RESTAURANT (PVT) LTD'])
  r1.getCell(2).font = navyHeader
  const r2 = ws.addRow(['', 'STATEMENT OF CASH FLOWS (IAS 7 / LKAS 7)'])
  r2.getCell(2).font = subTitle
  const r3 = ws.addRow(['', `For the period from ${opts.dateFrom || ''} to ${opts.dateTo || ''} · Amounts in Sri Lankan Rupees (LKR)`])
  r3.getCell(2).font = italicNote
  ws.addRow([])

  const headRow = ws.addRow(['', 'Cash Flow Activity', 'Amount (LKR)', 'Net Amount (LKR)'])
  headRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  headRow.eachCell((cell, colNum) => {
    if (colNum > 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } }
    }
  })
  headRow.getCell(3).alignment = { horizontal: 'right' }
  headRow.getCell(4).alignment = { horizontal: 'right' }

  // Opening Cash Balance
  const rOpen = ws.addRow(['', 'Cash and cash equivalents at beginning of period', '', cf.opening_balance || 0])
  rOpen.getCell(2).font = boldFont
  rOpen.getCell(4).font = boldFont
  rOpen.getCell(4).numFmt = numFmt
  rOpen.getCell(4).alignment = { horizontal: 'right' }
  ws.addRow([])

  // 1. Operating Activities
  const rOpHead = ws.addRow(['', '1. CASH FLOWS FROM OPERATING ACTIVITIES'])
  rOpHead.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1A237E' } }
  rOpHead.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }

  for (const item of cf.operating_activities || []) {
    const row = ws.addRow(['', '    ' + item.category, item.amount, ''])
    row.getCell(2).font = normalFont
    row.getCell(3).font = normalFont
    row.getCell(3).numFmt = numFmt
    row.getCell(3).alignment = { horizontal: 'right' }
  }
  const rOpTot = ws.addRow(['', 'Net cash generated from / (used in) operating activities', '', cf.net_operating || 0])
  rOpTot.getCell(2).font = boldFont
  rOpTot.getCell(4).font = boldFont
  rOpTot.getCell(4).numFmt = numFmt
  rOpTot.getCell(4).alignment = { horizontal: 'right' }
  rOpTot.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } }
  ws.addRow([])

  // 2. Investing Activities
  const rInvHead = ws.addRow(['', '2. CASH FLOWS FROM INVESTING ACTIVITIES'])
  rInvHead.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1A237E' } }
  rInvHead.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }

  for (const item of cf.investing_activities || []) {
    const row = ws.addRow(['', '    ' + item.category, item.amount, ''])
    row.getCell(2).font = normalFont
    row.getCell(3).font = normalFont
    row.getCell(3).numFmt = numFmt
    row.getCell(3).alignment = { horizontal: 'right' }
  }
  const rInvTot = ws.addRow(['', 'Net cash generated from / (used in) investing activities', '', cf.net_investing || 0])
  rInvTot.getCell(2).font = boldFont
  rInvTot.getCell(4).font = boldFont
  rInvTot.getCell(4).numFmt = numFmt
  rInvTot.getCell(4).alignment = { horizontal: 'right' }
  rInvTot.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } }
  ws.addRow([])

  // 3. Financing Activities
  const rFinHead = ws.addRow(['', '3. CASH FLOWS FROM FINANCING ACTIVITIES'])
  rFinHead.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1A237E' } }
  rFinHead.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }

  for (const item of cf.financing_activities || []) {
    const row = ws.addRow(['', '    ' + item.category, item.amount, ''])
    row.getCell(2).font = normalFont
    row.getCell(3).font = normalFont
    row.getCell(3).numFmt = numFmt
    row.getCell(3).alignment = { horizontal: 'right' }
  }
  const rFinTot = ws.addRow(['', 'Net cash generated from / (used in) financing activities', '', cf.net_financing || 0])
  rFinTot.getCell(2).font = boldFont
  rFinTot.getCell(4).font = boldFont
  rFinTot.getCell(4).numFmt = numFmt
  rFinTot.getCell(4).alignment = { horizontal: 'right' }
  rFinTot.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } }
  ws.addRow([])

  // Net Change in Cash
  const rNetChange = ws.addRow(['', 'NET INCREASE / (DECREASE) IN CASH AND CASH EQUIVALENTS', '', cf.net_cash_flow || 0])
  rNetChange.getCell(2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1A237E' } }
  rNetChange.getCell(4).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1A237E' } }
  rNetChange.getCell(4).numFmt = numFmt
  rNetChange.getCell(4).alignment = { horizontal: 'right' }
  rNetChange.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } }
  ws.addRow([])

  // Closing Cash Balance (Double underline)
  const rClose = ws.addRow(['', 'CASH AND CASH EQUIVALENTS AT END OF PERIOD', '', cf.closing_balance || 0])
  rClose.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1A237E' } }
  rClose.getCell(4).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1A237E' } }
  rClose.getCell(4).numFmt = numFmt
  rClose.getCell(4).alignment = { horizontal: 'right' }
  rClose.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'double' } }

  if (cf.cash_ledgers && cf.cash_ledgers.length) {
    ws.addRow([])
    const rNote = ws.addRow(['', `Cash and cash equivalents comprise: ${cf.cash_ledgers.join(', ')}`])
    rNote.getCell(2).font = italicNote
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `Statement_of_Cash_Flows_${dateStr}.xlsx`)
}

function exportCashFlowToPdf(cf: any, opts: { dateFrom?: string; dateTo?: string } = {}) {
  const doc = new jsPDF('p', 'mm', 'a4')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(26, 35, 126)
  doc.text('SEVEN WAVES RESTAURANT (PVT) LTD', 105, 16, { align: 'center' })

  doc.setFontSize(11)
  doc.setTextColor(33, 33, 33)
  doc.text('STATEMENT OF CASH FLOWS (IAS 7 / LKAS 7)', 105, 23, { align: 'center' })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(
    `For the period from ${opts.dateFrom || ''} to ${opts.dateTo || ''} · Amounts in Sri Lankan Rupees (LKR)`,
    105,
    29,
    { align: 'center' },
  )

  const navy: [number, number, number] = [26, 35, 126]
  const tableBody: any[] = []

  // Opening Cash Balance
  tableBody.push([
    { content: 'Cash and cash equivalents at beginning of period', styles: { fontStyle: 'bold' } },
    '',
    { content: 'LKR ' + formatMoney(cf.opening_balance), styles: { fontStyle: 'bold', halign: 'right' } },
  ])

  // Helper for activity section
  const addSection = (title: string, items: any[], subtotalLabel: string, subtotalAmount: number) => {
    tableBody.push([
      {
        content: title,
        colSpan: 3,
        styles: { fontStyle: 'bold', fillColor: [240, 244, 248], textColor: navy },
      },
    ])
    if (!items || !items.length) {
      tableBody.push([{ content: '  None reported', styles: { fontStyle: 'italic', textColor: [150, 150, 150] } }, '', ''])
    } else {
      for (const item of items) {
        tableBody.push(['  ' + item.category, formatMoney(item.amount), ''])
      }
    }
    tableBody.push([
      { content: subtotalLabel, styles: { fontStyle: 'bold' } },
      '',
      { content: 'LKR ' + formatMoney(subtotalAmount), styles: { fontStyle: 'bold', halign: 'right' } },
    ])
  }

  addSection('1. CASH FLOWS FROM OPERATING ACTIVITIES', cf.operating_activities, 'Net cash generated from / (used in) operating activities', cf.net_operating)
  addSection('2. CASH FLOWS FROM INVESTING ACTIVITIES', cf.investing_activities, 'Net cash generated from / (used in) investing activities', cf.net_investing)
  addSection('3. CASH FLOWS FROM FINANCING ACTIVITIES', cf.financing_activities, 'Net cash generated from / (used in) financing activities', cf.net_financing)

  // Net Change in Cash
  tableBody.push([
    { content: 'NET INCREASE / (DECREASE) IN CASH AND CASH EQUIVALENTS', styles: { fontStyle: 'bold', textColor: navy } },
    '',
    { content: 'LKR ' + formatMoney(cf.net_cash_flow), styles: { fontStyle: 'bold', halign: 'right', textColor: navy } },
  ])

  // Closing Cash Balance
  tableBody.push([
    { content: 'CASH AND CASH EQUIVALENTS AT END OF PERIOD', styles: { fontStyle: 'bold', textColor: navy } },
    '',
    { content: 'LKR ' + formatMoney(cf.closing_balance), styles: { fontStyle: 'bold', halign: 'right', textColor: navy } },
  ])

  autoTable(doc, {
    startY: 34,
    head: [['Cash Flow Activity', 'Amount (LKR)', 'Net Amount (LKR)']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 38, halign: 'right' },
      2: { cellWidth: 38, halign: 'right' },
    },
    styles: { fontSize: 8.5, cellPadding: 2 },
    margin: { left: 12, right: 12 },
    didDrawPage: () => {
      const str = 'Page ' + (doc as any).internal.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(str, 105, 290, { align: 'center' })
      doc.text('Seven Waves Restaurant ERP — Confidential', 12, 290)
    },
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  doc.save(`Statement_of_Cash_Flows_${dateStr}.pdf`)
}

async function exportCashFlowToWord(cf: any, opts: { dateFrom?: string; dateTo?: string } = {}) {
  const tableRows: TableRow[] = []

  // Header row
  tableRows.push(
    new TableRow({
      children: [
        wordHeaderCell('Cash Flow Activity', 60),
        wordHeaderCell('Amount (LKR)', 20, AlignmentType.RIGHT),
        wordHeaderCell('Net Amount (LKR)', 20, AlignmentType.RIGHT),
      ],
    }),
  )

  // Opening Cash Balance
  tableRows.push(
    new TableRow({
      children: [
        wordDataCell('Cash and cash equivalents at beginning of period', 60, { bold: true }),
        wordEmptyCell(20),
        wordDataCell('LKR ' + formatMoney(cf.opening_balance), 20, { align: AlignmentType.RIGHT, bold: true }),
      ],
    }),
  )

  const addWordSection = (title: string, items: any[], subtotalLabel: string, subtotalAmount: number) => {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 3,
            children: [
              new Paragraph({
                children: [new TextRun({ text: title, font: 'Calibri', size: 19, bold: true, color: '1A237E' })],
              }),
            ],
            shading: { fill: 'F0F4F8' },
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
          }),
        ],
      }),
    )

    if (!items || !items.length) {
      tableRows.push(
        new TableRow({
          children: [
            wordDataCell('  None reported', 60, { italic: true, color: '757575' }),
            wordEmptyCell(20),
            wordEmptyCell(20),
          ],
        }),
      )
    } else {
      for (const item of items) {
        tableRows.push(
          new TableRow({
            children: [
              wordDataCell('  ' + item.category, 60),
              wordDataCell(formatMoney(item.amount), 20, { align: AlignmentType.RIGHT }),
              wordEmptyCell(20),
            ],
          }),
        )
      }
    }

    tableRows.push(
      new TableRow({
        children: [
          wordDataCell(subtotalLabel, 60, { bold: true }),
          wordEmptyCell(20),
          wordDataCell('LKR ' + formatMoney(subtotalAmount), 20, {
            align: AlignmentType.RIGHT,
            bold: true,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: '424242' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: '424242' },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
          }),
        ],
      }),
    )
  }

  addWordSection('1. CASH FLOWS FROM OPERATING ACTIVITIES', cf.operating_activities, 'Net cash generated from / (used in) operating activities', cf.net_operating)
  addWordSection('2. CASH FLOWS FROM INVESTING ACTIVITIES', cf.investing_activities, 'Net cash generated from / (used in) investing activities', cf.net_investing)
  addWordSection('3. CASH FLOWS FROM FINANCING ACTIVITIES', cf.financing_activities, 'Net cash generated from / (used in) financing activities', cf.net_financing)

  // Net Change in Cash
  tableRows.push(
    new TableRow({
      children: [
        wordDataCell('NET INCREASE / (DECREASE) IN CASH AND CASH EQUIVALENTS', 60, { bold: true, color: '1A237E' }),
        wordEmptyCell(20),
        wordDataCell('LKR ' + formatMoney(cf.net_cash_flow), 20, {
          align: AlignmentType.RIGHT,
          bold: true,
          color: '1A237E',
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: '1A237E' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '1A237E' },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
        }),
      ],
    }),
  )

  // Closing Cash Balance (Double underline)
  tableRows.push(
    new TableRow({
      children: [
        wordDataCell('CASH AND CASH EQUIVALENTS AT END OF PERIOD', 60, { bold: true, color: '1A237E', size: 20 }),
        wordEmptyCell(20),
        wordDataCell('LKR ' + formatMoney(cf.closing_balance), 20, {
          align: AlignmentType.RIGHT,
          bold: true,
          color: '1A237E',
          size: 20,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 6, color: '1A237E' },
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: '1A237E' },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
        }),
      ],
    }),
  )

  const table = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
  })

  const children: any[] = [
    ...createWordHeader(
      'SEVEN WAVES RESTAURANT (PVT) LTD',
      'STATEMENT OF CASH FLOWS (IAS 7 / LKAS 7)',
      `For the period from ${opts.dateFrom || ''} to ${opts.dateTo || ''}`,
    ),
    table,
  ]

  if (cf.cash_ledgers && cf.cash_ledgers.length) {
    children.push(
      new Paragraph({
        spacing: { before: 200 },
        children: [
          new TextRun({
            text: `Cash and cash equivalents comprise: ${cf.cash_ledgers.join(', ')}`,
            font: 'Calibri',
            size: 16,
            italics: true,
            color: '555555',
          }),
        ],
      }),
    )
  }

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
        children,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `Statement_of_Cash_Flows_${dateStr}.docx`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. TRIAL BALANCE — EXCEL, PDF & WORD EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

async function exportTrialBalanceToExcel(tb: any) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Seven Waves Restaurant ERP'
  const ws = wb.addWorksheet('Trial Balance')

  ws.columns = [
    { width: 14 },
    { width: 38 },
    { width: 16 },
    { width: 28 },
    { width: 20 },
    { width: 20 },
  ]

  const navyHeader = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1A237E' } }
  const numFmt = '#,##0.00;(#,##0.00);"-"'

  const r1 = ws.addRow(['', 'SEVEN WAVES RESTAURANT (PVT) LTD'])
  r1.getCell(2).font = navyHeader
  const r2 = ws.addRow(['', 'TRIAL BALANCE REPORT'])
  r2.getCell(2).font = { name: 'Calibri', size: 12, bold: true }
  const r3 = ws.addRow(['', `As at ${tb.as_of_date || new Date().toISOString().slice(0, 10)} · Amounts in Sri Lankan Rupees (LKR)`])
  r3.getCell(2).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF555555' } }
  ws.addRow([])

  const headRow = ws.addRow(['Code', 'Account Name', 'Type', 'Account Group', 'Closing Debit (LKR)', 'Closing Credit (LKR)'])
  headRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  headRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } }
  })
  headRow.getCell(5).alignment = { horizontal: 'right' }
  headRow.getCell(6).alignment = { horizontal: 'right' }

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
}

function exportTrialBalanceToPdf(tb: any) {
  const doc = new jsPDF('l', 'mm', 'a4')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(26, 35, 126)
  doc.text('SEVEN WAVES RESTAURANT (PVT) LTD', 148, 16, { align: 'center' })

  doc.setFontSize(11)
  doc.setTextColor(33, 33, 33)
  doc.text('TRIAL BALANCE REPORT', 148, 23, { align: 'center' })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(`As at ${tb.as_of_date || new Date().toISOString().slice(0, 10)} · Amounts in Sri Lankan Rupees (LKR)`, 148, 28, { align: 'center' })

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
    startY: 32,
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
}

async function exportTrialBalanceToWord(tb: any) {
  const tableRows: TableRow[] = []

  // Header row
  tableRows.push(
    new TableRow({
      children: [
        wordHeaderCell('Code', 12),
        wordHeaderCell('Account Name', 32),
        wordHeaderCell('Type', 12),
        wordHeaderCell('Account Group', 18),
        wordHeaderCell('Debit (LKR)', 13, AlignmentType.RIGHT),
        wordHeaderCell('Credit (LKR)', 13, AlignmentType.RIGHT),
      ],
    }),
  )

  let rowIndex = 0
  for (const r of tb.rows || []) {
    const isEven = rowIndex % 2 === 0
    const fill = isEven ? undefined : 'FAFAFA'
    tableRows.push(
      new TableRow({
        children: [
          wordDataCell(r.ledger_code, 12, { italic: true, color: '616161', fill }),
          wordDataCell(r.ledger_name, 32, { fill }),
          wordDataCell(r.ledger_type, 12, { fill }),
          wordDataCell(r.account_group, 18, { fill }),
          wordDataCell(r.closing_debit > 0 ? formatMoney(r.closing_debit) : '-', 13, { align: AlignmentType.RIGHT, fill }),
          wordDataCell(r.closing_credit > 0 ? formatMoney(r.closing_credit) : '-', 13, { align: AlignmentType.RIGHT, fill }),
        ],
      }),
    )
    rowIndex++
  }

  // Totals row (with double bottom border)
  tableRows.push(
    new TableRow({
      children: [
        wordEmptyCell(12),
        wordDataCell('TOTAL', 32, { bold: true, color: '1A237E' }),
        wordEmptyCell(12),
        wordEmptyCell(18),
        wordDataCell(formatMoney(tb.totalDebit || 0), 13, {
          align: AlignmentType.RIGHT,
          bold: true,
          color: '1A237E',
          borders: {
            top: { style: BorderStyle.SINGLE, size: 6, color: '1A237E' },
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: '1A237E' },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
        }),
        wordDataCell(formatMoney(tb.totalCredit || 0), 13, {
          align: AlignmentType.RIGHT,
          bold: true,
          color: '1A237E',
          borders: {
            top: { style: BorderStyle.SINGLE, size: 6, color: '1A237E' },
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: '1A237E' },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
        }),
      ],
    }),
  )

  const isBal = !!tb.isBalanced
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 6,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: isBal ? '✓ Trial Balance is balanced' : '⚠ Trial Balance is NOT balanced',
                  font: 'Calibri',
                  size: 18,
                  bold: true,
                  color: isBal ? '2E7D32' : 'C62828',
                }),
              ],
            }),
          ],
          shading: { fill: isBal ? 'E8F5E9' : 'FFEBEE' },
          width: { size: 100, type: WidthType.PERCENTAGE },
          margins: { top: 120, bottom: 120, left: 140, right: 140 },
        }),
      ],
    }),
  )

  const table = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
  })

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          ...createWordHeader(
            'SEVEN WAVES RESTAURANT (PVT) LTD',
            'TRIAL BALANCE REPORT',
            `As at ${tb.as_of_date || new Date().toISOString().slice(0, 10)}`,
          ),
          table,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `Trial_Balance_${dateStr}.docx`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. GENERIC TABLE WORD EXPORT (MONTHLY SUMMARY, COGS, ETC.)
// ═══════════════════════════════════════════════════════════════════════════════

async function exportGenericTableToWord(
  columns: any[],
  rows: any[],
  title: string,
  subtitle = '',
) {
  const exportCols = (columns || []).filter(
    (c) => c.name !== 'image' && c.field !== 'image_url' && c.name !== 'image_url' && c.name !== 'actions',
  )
  const isLandscape = exportCols.length > 5
  const colWidthPercent = Math.floor(100 / (exportCols.length || 1))

  const tableRows: TableRow[] = []

  // Header row
  tableRows.push(
    new TableRow({
      children: exportCols.map((c) =>
        wordHeaderCell(c.label, colWidthPercent, c.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT),
      ),
    }),
  )

  // Data rows
  let rowIndex = 0
  for (const r of rows || []) {
    const isEven = rowIndex % 2 === 0
    const fill = isEven ? undefined : 'FAFAFA'
    const cells = exportCols.map((col) => {
      let val = typeof col.field === 'function' ? col.field(r) : r[col.field]
      const formatted = col.format ? col.format(val) : val ?? '-'
      const isNum = col.align === 'right'
      return wordDataCell(String(formatted), colWidthPercent, {
        align: isNum ? AlignmentType.RIGHT : AlignmentType.LEFT,
        fill,
      })
    })
    tableRows.push(new TableRow({ children: cells }))
    rowIndex++
  }

  const table = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
  })

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT } } },
        children: [
          ...createWordHeader('SEVEN WAVES RESTAURANT (PVT) LTD', title.replace(/_/g, ' '), subtitle),
          table,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const dateStr = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `${title.replace(/\s+/g, '_')}_${dateStr}.docx`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. CASHBOOK & PETTY CASH REGISTER — EXCEL, PDF & WORD (IAS 7 / LKAS 7)
// ═══════════════════════════════════════════════════════════════════════════════

export interface CashbookExportOptions {
  title?: string
  subtitle?: string
  petty?: boolean
  companyName?: string
  branchName?: string
}

async function exportCashbookToExcel(report: any, opts: CashbookExportOptions = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Seven Waves Restaurant ERP'
  const sheetTitle = opts.petty ? 'Petty Cash Book' : 'Cashbook'
  const ws = wb.addWorksheet(sheetTitle)
  ws.views = [{ showGridLines: true }]

  ws.columns = [
    { width: 14 }, // A: Date
    { width: 14 }, // B: Ledger Code
    { width: 34 }, // C: Ledger / Account Name
    { width: 22 }, // D: Transaction Source
    { width: 20 }, // E: Doc Reference
    { width: 44 }, // F: Narration / Description
    { width: 20 }, // G: Receipts (Dr) (LKR)
    { width: 20 }, // H: Payments (Cr) (LKR)
    { width: 22 }, // I: Running Balance (LKR)
    { width: 10 }, // J: Type (Dr/Cr)
  ]

  const navyColor = 'FF1A237E'
  const numFmt = '#,##0.00;(#,##0.00);"-";@'

  // Embed Logo
  try {
    const logoObj = await getLogoData()
    if (logoObj?.data) {
      const base64Data = logoObj.data.replace(/^data:image\/\w+;base64,/, '')
      const imgId = wb.addImage({
        base64: base64Data,
        extension: 'png',
      })
      ws.addImage(imgId, {
        tl: { col: 0.15, row: 0.15 },
        ext: { width: 55, height: 55 },
      })
    }
  } catch (e) {
    console.warn('Could not add logo to cashbook excel', e)
  }

  // Header Title Block
  const r1 = ws.addRow(['', '', opts.companyName || 'SEVEN WAVES RESTAURANT (PVT) LTD'])
  r1.getCell(3).font = { name: 'Calibri', size: 16, bold: true, color: { argb: navyColor } }

  const r2 = ws.addRow(['', '', `${opts.branchName || 'Kottawa Branch'} · Hospitality & Dining Division`])
  r2.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF455A64' } }

  const mainTitle = opts.title || (opts.petty ? 'PETTY CASH REGISTER & JOURNAL' : 'CASHBOOK & BANK REGISTER')
  const r3 = ws.addRow(['', '', mainTitle.toUpperCase()])
  r3.getCell(3).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0D47A1' } }

  const sub = opts.subtitle ? `${opts.subtitle} · ` : ''
  const r4 = ws.addRow(['', '', `${sub}Amounts in Sri Lankan Rupees (LKR)`])
  r4.getCell(3).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } }

  const r5 = ws.addRow(['', '', 'Compliance: International Accounting Standards (IAS 7 / LKAS 7 Statement of Cash Flows & Cash Records)'])
  r5.getCell(3).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF78909C' } }
  ws.addRow([]) // Spacer

  // SECTION I: SUMMARY OF CASH & BANK BALANCES
  const summaryList = report?.ledgers || []
  if (summaryList.length > 0) {
    const sBanner = ws.addRow(['I. SUMMARY OF CASH & BANK LEDGER BALANCES'])
    sBanner.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: navyColor } }
    sBanner.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } }
    ws.mergeCells(`A${sBanner.number}:G${sBanner.number}`)

    const sTableHead = ws.addRow([
      'Ledger Code',
      'Account / Ledger Description',
      'Opening Balance (b/f)',
      'Total Receipts (Dr)',
      'Total Payments (Cr)',
      'Closing Balance (c/f)',
      'Dr/Cr',
    ])
    sTableHead.height = 24
    sTableHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    sTableHead.eachCell((cell, colNum) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navyColor } }
      cell.alignment = { vertical: 'middle', horizontal: colNum >= 3 && colNum <= 6 ? 'right' : (colNum === 1 || colNum === 7 ? 'center' : 'left') }
    })

    summaryList.forEach((l: any) => {
      const row = ws.addRow([
        l.ledger_code,
        l.ledger_name,
        Number(l.opening || 0),
        Number(l.debit || 0),
        Number(l.credit || 0),
        Number(l.closing || 0),
        Number(l.closing || 0) >= 0 ? 'Dr' : 'Cr',
      ])
      row.getCell(1).alignment = { horizontal: 'center' }
      row.getCell(3).numFmt = numFmt
      row.getCell(4).numFmt = numFmt
      row.getCell(5).numFmt = numFmt
      row.getCell(6).numFmt = numFmt
      row.getCell(7).alignment = { horizontal: 'center' }
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        }
      })
    })

    const tot = report?.totals || {}
    const sTotRow = ws.addRow([
      'TOTAL',
      'TOTAL ACROSS ALL LEDGERS',
      Number(tot.opening || 0),
      Number(tot.debit || 0),
      Number(tot.credit || 0),
      Number(tot.closing || 0),
      Number(tot.closing || 0) >= 0 ? 'Dr' : 'Cr',
    ])
    sTotRow.height = 22
    sTotRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: navyColor } }
    sTotRow.getCell(3).numFmt = numFmt
    sTotRow.getCell(4).numFmt = numFmt
    sTotRow.getCell(5).numFmt = numFmt
    sTotRow.getCell(6).numFmt = numFmt
    sTotRow.getCell(7).alignment = { horizontal: 'center' }
    sTotRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }
      cell.border = {
        top: { style: 'thin', color: { argb: navyColor } },
        bottom: { style: 'double', color: { argb: navyColor } },
      }
    })
    ws.addRow([]) // Spacer
  }

  // SECTION II: GRANULAR TRANSACTION REGISTER
  const regHead = ws.addRow(['II. GRANULAR CASHBOOK TRANSACTION REGISTER (RECEIPTS & PAYMENTS JOURNAL)'])
  regHead.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: navyColor } }
  regHead.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } }
  ws.mergeCells(`A${regHead.number}:J${regHead.number}`)

  const mainTableHead = ws.addRow([
    'Date',
    'Ledger Code',
    'Account / Drawer',
    'Source Type',
    'Reference / Doc #',
    'Particulars / Narration',
    'Receipts (Dr) (LKR)',
    'Payments (Cr) (LKR)',
    'Running Balance (LKR)',
    'Dr/Cr',
  ])
  mainTableHead.height = 26
  mainTableHead.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  mainTableHead.eachCell((cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navyColor } }
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNum >= 7 && colNum <= 9 ? 'right' : (colNum === 1 || colNum === 2 || colNum === 4 || colNum === 5 || colNum === 10 ? 'center' : 'left'),
    }
  })

  const rows = report?.rows || []
  let rowIndex = 0
  for (const r of rows) {
    rowIndex++
    const isOpening = r.kind === 'opening'
    const balVal = Number(r.running_balance || 0)
    const drVal = Number(r.debit) > 0 ? Number(r.debit) : null
    const crVal = Number(r.credit) > 0 ? Number(r.credit) : null

    const row = ws.addRow([
      r.date || '',
      r.ledger_code || '',
      r.ledger_name || '',
      isOpening ? '—' : (r.source_label || r.source_type || 'Manual Entry'),
      isOpening ? '—' : (r.doc_ref || '—'),
      r.description || (isOpening ? 'Balance b/f' : ''),
      drVal,
      crVal,
      balVal,
      balVal >= 0 ? 'Dr' : 'Cr',
    ])

    row.getCell(1).alignment = { horizontal: 'center' }
    row.getCell(2).alignment = { horizontal: 'center' }
    row.getCell(4).alignment = { horizontal: 'center' }
    row.getCell(5).alignment = { horizontal: 'center' }
    row.getCell(7).numFmt = numFmt
    row.getCell(8).numFmt = numFmt
    row.getCell(9).numFmt = numFmt
    row.getCell(10).alignment = { horizontal: 'center' }

    if (isOpening) {
      row.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF37474F' } }
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECEFF1' } }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFB0BEC5' } },
          bottom: { style: 'thin', color: { argb: 'FFB0BEC5' } },
        }
      })
    } else {
      row.font = { name: 'Calibri', size: 10 }
      const zebraFill = rowIndex % 2 === 0 ? 'FFFBFDFF' : 'FFFFFFFF'
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraFill } }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFEAEAEA' } },
          bottom: { style: 'thin', color: { argb: 'FFEAEAEA' } },
          left: { style: 'thin', color: { argb: 'FFEAEAEA' } },
          right: { style: 'thin', color: { argb: 'FFEAEAEA' } },
        }
      })
    }
  }

  // Grand Total Row
  const tot = report?.totals || {}
  const gTotRow = ws.addRow([
    'TOTAL',
    '',
    'TOTAL CASH & BANK MOVEMENTS',
    '',
    '',
    '',
    Number(tot.shown_debit || tot.debit || 0),
    Number(tot.shown_credit || tot.credit || 0),
    Number(tot.closing || 0),
    Number(tot.closing || 0) >= 0 ? 'Dr' : 'Cr',
  ])
  gTotRow.height = 24
  gTotRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: navyColor } }
  gTotRow.getCell(7).numFmt = numFmt
  gTotRow.getCell(8).numFmt = numFmt
  gTotRow.getCell(9).numFmt = numFmt
  gTotRow.getCell(10).alignment = { horizontal: 'center' }
  gTotRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }
    cell.border = {
      top: { style: 'thin', color: { argb: navyColor } },
      bottom: { style: 'double', color: { argb: navyColor } },
    }
  })

  // Sign-off section
  ws.addRow([])
  ws.addRow([])
  const certRow1 = ws.addRow(['', 'PREPARED BY (Accounts):', '', '', 'CHECKED & VERIFIED BY:', '', '', 'APPROVED BY (Management):', ''])
  certRow1.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF455A64' } }

  const certRow2 = ws.addRow(['', '_______________________________', '', '', '_______________________________', '', '', '_______________________________', ''])
  certRow2.font = { name: 'Calibri', size: 10, color: { argb: 'FF90A4AE' } }

  const certRow3 = ws.addRow(['', 'Date: _____ / _____ / 2026', '', '', 'Date: _____ / _____ / 2026', '', '', 'Date: _____ / _____ / 2026', ''])
  certRow3.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF78909C' } }

  ws.addRow([])
  const foot = ws.addRow(['Seven Waves ERP · International Accounting Standard Certified Financial Record · Generated: ' + new Date().toLocaleString()])
  foot.getCell(1).font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF9E9E9E' } }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const dateStr = new Date().toISOString().slice(0, 10)
  const fileBase = (opts.title || sheetTitle).replace(/[^\w-]+/g, '_')
  triggerDownload(blob, `${fileBase}_${dateStr}.xlsx`)
}

async function exportCashbookToPdf(report: any, opts: CashbookExportOptions = {}) {
  const doc = new jsPDF('l', 'mm', 'a4')
  const mainTitle = opts.title || (opts.petty ? 'PETTY CASH REGISTER & JOURNAL' : 'CASHBOOK & BANK REGISTER')
  const fileBase = mainTitle.replace(/[^\w-]+/g, '_')
  const dateStr = new Date().toISOString().slice(0, 10)

  // Draw Header with logo
  try {
    const logoObj = await getLogoData()
    if (logoObj?.data) {
      doc.addImage(logoObj.data, 'PNG', 14, 8, 16, 16)
    }
  } catch (e) {
    console.warn('PDF logo error', e)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(26, 35, 126)
  doc.text(opts.companyName || 'SEVEN WAVES RESTAURANT (PVT) LTD', 34, 14)

  doc.setFontSize(9.5)
  doc.setTextColor(69, 90, 100)
  doc.text(`${opts.branchName || 'Kottawa Branch'} · International Accounting Standards (IAS 7 / LKAS 7)`, 34, 19)

  doc.setFontSize(11)
  doc.setTextColor(13, 71, 161)
  doc.text(mainTitle.toUpperCase(), 34, 24)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  const sub = opts.subtitle ? `${opts.subtitle} · ` : ''
  doc.text(`${sub}Amounts in Sri Lankan Rupees (LKR)`, 34, 28)

  let currentY = 32

  // Table 1: Summary of Balances
  const summaryList = report?.ledgers || []
  if (summaryList.length > 0) {
    const summaryRows = summaryList.map((l: any) => [
      l.ledger_code,
      l.ledger_name,
      formatMoney(l.opening),
      formatMoney(l.debit),
      formatMoney(l.credit),
      formatMoney(l.closing),
      Number(l.closing || 0) >= 0 ? 'Dr' : 'Cr',
    ])

    const tot = report?.totals || {}
    summaryRows.push([
      'TOTAL',
      'TOTAL ACROSS ALL LEDGERS',
      formatMoney(tot.opening),
      formatMoney(tot.debit),
      formatMoney(tot.credit),
      formatMoney(tot.closing),
      Number(tot.closing || 0) >= 0 ? 'Dr' : 'Cr',
    ])

    autoTable(doc, {
      startY: currentY,
      head: [['Code', 'Ledger / Cash Drawer', 'Opening b/f (LKR)', 'Receipts Dr (LKR)', 'Payments Cr (LKR)', 'Closing c/f (LKR)', 'Type']],
      body: summaryRows,
      theme: 'grid',
      headStyles: { fillColor: [26, 35, 126], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'center', fontStyle: 'bold' },
      },
      styles: { fontSize: 8, cellPadding: 1.5 },
      margin: { left: 14, right: 14 },
    })
    currentY = (doc as any).lastAutoTable.finalY + 6
  }

  // Table 2: Granular Transactions Register
  const transRows = (report?.rows || []).map((r: any) => {
    const isOpening = r.kind === 'opening'
    const dr = Number(r.debit) > 0 ? formatMoney(r.debit) : '-'
    const cr = Number(r.credit) > 0 ? formatMoney(r.credit) : '-'
    const bal = formatMoney(r.running_balance)
    const type = Number(r.running_balance || 0) >= 0 ? 'Dr' : 'Cr'
    return [
      r.date || '',
      r.ledger_code || '',
      r.ledger_name || '',
      isOpening ? '—' : (r.source_label || 'Entry'),
      isOpening ? '—' : (r.doc_ref || '—'),
      r.description || (isOpening ? 'Balance b/f' : ''),
      dr,
      cr,
      bal,
      type,
    ]
  })

  const tot = report?.totals || {}
  transRows.push([
    'TOTAL',
    '',
    'TOTAL MOVEMENTS',
    '',
    '',
    '',
    formatMoney(tot.shown_debit || tot.debit),
    formatMoney(tot.shown_credit || tot.credit),
    formatMoney(tot.closing),
    Number(tot.closing || 0) >= 0 ? 'Dr' : 'Cr',
  ])

  autoTable(doc, {
    startY: currentY,
    head: [['Date', 'Code', 'Account', 'Source', 'Doc Ref', 'Particulars', 'Receipts Dr', 'Payments Cr', 'Balance', 'Type']],
    body: transRows,
    theme: 'grid',
    headStyles: { fillColor: [26, 35, 126], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'center', fontStyle: 'bold' },
    },
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const str = 'Page ' + (doc as any).internal.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(str, 148, 200, { align: 'center' })
      doc.text('Seven Waves Restaurant ERP — Official Cashbook Record', 14, 200)
    },
  })

  doc.save(`${fileBase}_${dateStr}.pdf`)
}

async function exportCashbookToWord(report: any, opts: CashbookExportOptions = {}) {
  const mainTitle = opts.title || (opts.petty ? 'PETTY CASH REGISTER & JOURNAL' : 'CASHBOOK & BANK REGISTER')
  const dateStr = new Date().toISOString().slice(0, 10)

  const tableRows: TableRow[] = []

  // Header row
  tableRows.push(
    new TableRow({
      children: [
        wordHeaderCell('Date', 10, AlignmentType.CENTER),
        wordHeaderCell('Code', 10, AlignmentType.CENTER),
        wordHeaderCell('Account', 20),
        wordHeaderCell('Source', 12, AlignmentType.CENTER),
        wordHeaderCell('Reference', 12, AlignmentType.CENTER),
        wordHeaderCell('Particulars', 20),
        wordHeaderCell('Receipts Dr (LKR)', 12, AlignmentType.RIGHT),
        wordHeaderCell('Payments Cr (LKR)', 12, AlignmentType.RIGHT),
        wordHeaderCell('Balance (LKR)', 12, AlignmentType.RIGHT),
      ],
    }),
  )

  for (const r of report?.rows || []) {
    const isOpening = r.kind === 'opening'
    tableRows.push(
      new TableRow({
        children: [
          wordDataCell(r.date || '', 10, { align: AlignmentType.CENTER, bold: isOpening }),
          wordDataCell(r.ledger_code || '', 10, { align: AlignmentType.CENTER, bold: isOpening }),
          wordDataCell(r.ledger_name || '', 20, { bold: isOpening }),
          wordDataCell(isOpening ? '—' : (r.source_label || 'Entry'), 12, { align: AlignmentType.CENTER }),
          wordDataCell(isOpening ? '—' : (r.doc_ref || '—'), 12, { align: AlignmentType.CENTER }),
          wordDataCell(r.description || (isOpening ? 'Balance b/f' : ''), 20, { bold: isOpening }),
          wordDataCell(Number(r.debit) > 0 ? formatMoney(r.debit) : '-', 12, { align: AlignmentType.RIGHT }),
          wordDataCell(Number(r.credit) > 0 ? formatMoney(r.credit) : '-', 12, { align: AlignmentType.RIGHT }),
          wordDataCell(formatMoney(r.running_balance) + ' ' + (Number(r.running_balance || 0) >= 0 ? 'Dr' : 'Cr'), 12, { align: AlignmentType.RIGHT, bold: isOpening }),
        ],
      }),
    )
  }

  const tot = report?.totals || {}
  tableRows.push(
    new TableRow({
      children: [
        wordDataCell('TOTAL', 10, { bold: true, align: AlignmentType.CENTER }),
        wordEmptyCell(10),
        wordDataCell('TOTAL MOVEMENTS', 20, { bold: true }),
        wordEmptyCell(12),
        wordEmptyCell(12),
        wordEmptyCell(20),
        wordDataCell(formatMoney(tot.shown_debit || tot.debit), 12, { align: AlignmentType.RIGHT, bold: true }),
        wordDataCell(formatMoney(tot.shown_credit || tot.credit), 12, { align: AlignmentType.RIGHT, bold: true }),
        wordDataCell(formatMoney(tot.closing) + ' ' + (Number(tot.closing || 0) >= 0 ? 'Dr' : 'Cr'), 12, { align: AlignmentType.RIGHT, bold: true }),
      ],
    }),
  )

  const table = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
  })

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          ...createWordHeader(
            opts.companyName || 'SEVEN WAVES RESTAURANT (PVT) LTD',
            mainTitle.toUpperCase(),
            opts.subtitle || 'International Accounting Standards (IAS 7 / LKAS 7)',
          ),
          table,
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, `${mainTitle.replace(/[^\w-]+/g, '_')}_${dateStr}.docx`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT SERVICE FACADE
// ═══════════════════════════════════════════════════════════════════════════════

export const financeExportService = {
  // ── CASHBOOK & PETTY CASH BOOK (IAS 7) ──
  async exportCashbookToExcel(report: any, opts: CashbookExportOptions = {}) {
    await exportCashbookToExcel(report, opts)
  },

  async exportCashbookToPdf(report: any, opts: CashbookExportOptions = {}) {
    await exportCashbookToPdf(report, opts)
  },

  async exportCashbookToWord(report: any, opts: CashbookExportOptions = {}) {
    await exportCashbookToWord(report, opts)
  },
  // ── PROFIT & LOSS ──
  async exportProfitLossToExcel(pl: any, opts: StatementExportOptions = {}) {
    await exportStatementToExcel(
      pl,
      'Profit and Loss',
      'STATEMENT OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME (IAS 1)',
      pl.period || '',
      'Statement_of_Profit_or_Loss',
      opts,
    )
  },

  exportProfitLossToPdf(pl: any, opts: StatementExportOptions = {}) {
    exportStatementToPdf(
      pl,
      'STATEMENT OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME (IAS 1)',
      pl.period || '',
      'Statement_of_Profit_or_Loss',
      opts,
    )
  },

  async exportProfitLossToWord(pl: any, opts: StatementExportOptions = {}) {
    await exportStatementToWord(
      pl,
      'STATEMENT OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME (IAS 1)',
      pl.period || '',
      'Statement_of_Profit_or_Loss',
      opts,
    )
  },

  // ── BALANCE SHEET / STATEMENT OF FINANCIAL POSITION ──
  async exportBalanceSheetToExcel(bs: any, opts: StatementExportOptions = {}) {
    await exportStatementToExcel(
      bs,
      'Balance Sheet',
      'STATEMENT OF FINANCIAL POSITION (IAS 1)',
      bs.as_of_date ? `As at ${bs.as_of_date}` : '',
      'Statement_of_Financial_Position',
      opts,
    )
  },

  exportBalanceSheetToPdf(bs: any, opts: StatementExportOptions = {}) {
    exportStatementToPdf(
      bs,
      'STATEMENT OF FINANCIAL POSITION (IAS 1)',
      bs.as_of_date ? `As at ${bs.as_of_date}` : '',
      'Statement_of_Financial_Position',
      opts,
    )
  },

  async exportBalanceSheetToWord(bs: any, opts: StatementExportOptions = {}) {
    await exportStatementToWord(
      bs,
      'STATEMENT OF FINANCIAL POSITION (IAS 1)',
      bs.as_of_date ? `As at ${bs.as_of_date}` : '',
      'Statement_of_Financial_Position',
      opts,
    )
  },

  // ── STATEMENT OF CASH FLOWS (IAS 7) ──
  async exportCashFlowToExcel(cf: any, opts: { dateFrom?: string; dateTo?: string } = {}) {
    await exportCashFlowToExcel(cf, opts)
  },

  exportCashFlowToPdf(cf: any, opts: { dateFrom?: string; dateTo?: string } = {}) {
    exportCashFlowToPdf(cf, opts)
  },

  async exportCashFlowToWord(cf: any, opts: { dateFrom?: string; dateTo?: string } = {}) {
    await exportCashFlowToWord(cf, opts)
  },

  // ── TRIAL BALANCE ──
  async exportTrialBalanceToExcel(tb: any) {
    await exportTrialBalanceToExcel(tb)
  },

  exportTrialBalanceToPdf(tb: any) {
    exportTrialBalanceToPdf(tb)
  },

  async exportTrialBalanceToWord(tb: any) {
    await exportTrialBalanceToWord(tb)
  },

  // ── GENERIC TABLE (MONTHLY SUMMARY, COGS) ──
  async exportGenericTableToWord(columns: any[], rows: any[], title: string, subtitle = '') {
    await exportGenericTableToWord(columns, rows, title, subtitle)
  },
}
