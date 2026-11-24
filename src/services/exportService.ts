import { supabase } from 'src/boot/supabase'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
// @ts-ignore
import logoUrl from 'src/assets/seven-waves-logo-transparent.png'

export interface LogoData {
  data: string
  width: number
  height: number
}

let cachedLogoData: LogoData | null = null
export async function getLogoData(): Promise<LogoData | null> {
  if (cachedLogoData) return cachedLogoData
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          if (ctx) ctx.drawImage(img, 0, 0)
          cachedLogoData = { data: canvas.toDataURL('image/png'), width: img.width, height: img.height }
          resolve(cachedLogoData)
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = logoUrl
    } catch {
      resolve(null)
    }
  })
}

/**
 * Reusable SAP B1 compliant generic header renderer for PDFs
 */
async function drawSAPHeader(doc: jsPDF, title: string, subtitle: string) {
  try {
    const logoObj = await getLogoData()
    const pageWidth = doc.internal.pageSize.getWidth()
    // Calculate aspect ratio dynamically so the logo is completely undistorted
    const logoHeight = 16 // fixed height in mm for header
    const logoWidth = (logoObj.width / logoObj.height) * logoHeight
    const logoX = pageWidth - logoWidth - 14 // 14mm right margin
    doc.addImage(logoObj.data, 'PNG', logoX, 10, logoWidth, logoHeight)
  } catch (e) {
    console.warn('Failed to load logo for PDF header', e)
  }

  // Company Name
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(27, 58, 107) // #1b3a6b Navy
  doc.text('SEVEN WAVES RESTAURANT (PVT) LTD', 14, 16)
  
  // TRN
  doc.setFontSize(10)
  doc.setTextColor(112, 128, 144) // Gray
  doc.setFont('helvetica', 'normal')
  doc.text('TRN :', 14, 21)

  // Title
  const cleanTitle = title.replace(/_/g, ' ')
  doc.setFontSize(12)
  doc.setTextColor(27, 58, 107) // #1b3a6b
  doc.setFont('helvetica', 'bold')
  doc.text(cleanTitle, 14, 27)
  
  // Underline for title
  const titleWidth = doc.getTextWidth(cleanTitle)
  doc.setDrawColor(27, 58, 107)
  doc.setLineWidth(0.4)
  doc.line(14, 28, 14 + titleWidth, 28)

  // Subtitle / Meta (Location and Date)
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'normal')
  const subText = subtitle || `Generated: ${new Date().toLocaleString()}`
  doc.text(subText, 14, 33)
}

/**
 * Export Document to Excel (.xlsx)
 */
export function exportToExcel(document: any, lines: any[]) {
  const data = (lines || []).map((l, index) => ({
    '#': index + 1,
    'Item Description': l.item_name,
    'Item Code': l.item_code,
    Quantity: l.quantity,
    UOM: l.uom_code,
    'Unit Cost': l.unit_cost,
    'Total Value': l.quantity * l.unit_cost,
    Warehouse: document.warehouse_name,
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'InventoryData')

  const fileName = `${document.doc_type}_${document.doc_number}.xlsx`
  XLSX.writeFile(wb, fileName)
}

/**
 * Export Document to PDF
 * Note: Uses jsPDF with autotable
 */
export async function exportToPDF(document: any, lines: any[]) {
  try {
    const doc = new jsPDF()

    // Render exact UI SAP B1 header
    await drawSAPHeader(doc, `${document.doc_type} Document`, `Ref No: ${document.doc_number}`)

    // Additional inventory metadata rows below the main header
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.setFont('helvetica', 'normal')
    doc.text(`Date: ${document.doc_date || 'N/A'}`, 14, 40)
    doc.text(`Warehouse: ${document.warehouse_name || 'N/A'}`, 14, 45)
    if (document.supplier_name) doc.text(`Supplier: ${document.supplier_name}`, 14, 50)

    const tableRows = (lines || []).map((l, i) => [
      i + 1,
      l.item_name || 'N/A',
      `${l.quantity} ${l.uom_code || ''}`,
      (l.unit_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }),
      ((l.quantity || 0) * (l.unit_cost || 0)).toLocaleString(undefined, {
        minimumFractionDigits: 2,
      }),
    ])

    autoTable(doc, {
      startY: 55,
      head: [['#', 'Item Description', 'Quantity', 'Unit Cost', 'Total']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [27, 58, 107], halign: 'center' }, // #1b3a6b Navy headers
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    })

    const fileName = `${document.doc_type}_${document.doc_number}.pdf`
    doc.save(fileName)
  } catch (err) {
    console.error('Fatal PDF Error:', err)
    throw err
  }
}

/**
 * Generic CSV Export
 */
export function exportTableToCSV(columns: any[], rows: any[], filename: string) {
  const exportCols = columns.filter(c => 
    c.name !== 'image' && 
    c.field !== 'image_url' && 
    c.name !== 'image_url' &&
    c.name !== 'actions'
  )
  
  const headers = exportCols.map((c) => c.label).join(',')
  const csvRows = rows
    .map((r) => {
      return exportCols
        .map((col) => {
          let val = typeof col.field === 'function' ? col.field(r) : r[col.field]
          // Double-check: if it's still somehow an image link, clear it
          if (typeof val === 'string' && val.startsWith('http') && val.includes('supabase')) {
            val = ''
          }
          let strVal = String(val ?? '')
          // Neutralize CSV / Spreadsheet formula injection (CWE-1236)
          if (/^[=\+\-@\t\r]/.test(strVal)) {
            strVal = "'" + strVal
          }
          // Escape quotes and wrap in quotes
          const escaped = strVal.replace(/"/g, '""')
          return `"${escaped}"`
        })
        .join(',')
    })
    .join('\n')

  const dateStr = new Date().toISOString().slice(0, 10)
  const baseName = filename.replace(/\.csv$/i, '')
  const finalName = `${baseName}_${dateStr}.csv`

  const content = headers + '\n' + csvRows
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', finalName)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Generic Excel Export — International Accounting Standard with Corporate Header & Logo
 */
export async function exportTableToExcel(
  columns: any[],
  rows: any[],
  filename: string,
  title?: string,
  subtitle?: string,
) {
  const exportCols = columns.filter(c => 
    c.name !== 'image' && 
    c.field !== 'image_url' && 
    c.name !== 'image_url' && 
    c.name !== 'actions'
  )

  const dateStr = new Date().toISOString().slice(0, 10)
  const baseName = filename.replace(/\.xlsx$/i, '')
  const finalName = `${baseName}_${dateStr}.xlsx`
  const cleanTitle = title || baseName.replace(/_/g, ' ').toUpperCase()

  try {
    const ExcelJS = (await import('exceljs')).default || (await import('exceljs'))
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Seven Waves Restaurant ERP'
    const ws = wb.addWorksheet('Data')
    ws.views = [{ showGridLines: true }]

    // Embed logo
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
      console.warn('Could not add logo to Excel export', e)
    }

    // Company Header
    const navyColor = 'FF1A237E'
    const r1 = ws.addRow(['', '', 'SEVEN WAVES RESTAURANT (PVT) LTD'])
    r1.getCell(3).font = { name: 'Calibri', size: 15, bold: true, color: { argb: navyColor } }

    const r2 = ws.addRow(['', '', 'Kottawa Branch · International Accounting Standard Report'])
    r2.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF455A64' } }

    const r3 = ws.addRow(['', '', cleanTitle])
    r3.getCell(3).font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0D47A1' } }

    const subText = subtitle || `Generated on ${new Date().toLocaleDateString('en-LK')} · Amounts in LKR`
    const r4 = ws.addRow(['', '', subText])
    r4.getCell(3).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF555555' } }
    ws.addRow([]) // Spacer row

    // Table Header
    const headers = exportCols.map((c) => c.label)
    const headRow = ws.addRow(headers)
    headRow.height = 25
    headRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    headRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navyColor } }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
    })

    // Data rows
    const colWidths = headers.map((h) => Math.max(h.length + 4, 12))

    rows.forEach((r, idx) => {
      const rowValues = exportCols.map((col, colIdx) => {
        let val = typeof col.field === 'function' ? col.field(r) : r[col.field]
        if (typeof val === 'string' && val.startsWith('http') && val.includes('supabase')) {
          val = ''
        }
        const len = String(val ?? '').length
        if (len + 4 > colWidths[colIdx]) colWidths[colIdx] = Math.min(len + 4, 50)
        return val ?? ''
      })

      const dataRow = ws.addRow(rowValues)
      dataRow.font = { name: 'Calibri', size: 10 }
      const isZebra = idx % 2 === 0
      dataRow.eachCell((cell) => {
        const val = cell.value
        if (typeof val === 'number') {
          cell.numFmt = '#,##0.00;(#,##0.00);"-";@'
          cell.alignment = { horizontal: 'right' }
        }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isZebra ? 'FFFFFFFF' : 'FFFBFDFF' } }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFEAEAEA' } },
          bottom: { style: 'thin', color: { argb: 'FFEAEAEA' } },
          left: { style: 'thin', color: { argb: 'FFEAEAEA' } },
          right: { style: 'thin', color: { argb: 'FFEAEAEA' } },
        }
      })
    })

    // Set column widths
    ws.columns = colWidths.map((w) => ({ width: w }))

    // Trigger download
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = finalName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.warn('ExcelJS export fallback to XLSX:', err)
    const data = rows.map((r) => {
      const obj: any = {}
      exportCols.forEach((col) => {
        let val = typeof col.field === 'function' ? col.field(r) : r[col.field]
        obj[col.label] = val
      })
      return obj
    })
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data')
    XLSX.writeFile(wb, finalName)
  }
}

/**
 * Generic Word Export (.docx)
 */
export async function exportTableToWord(columns: any[], rows: any[], filename: string, subtitle = '') {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, PageOrientation } = await import('docx')
  const exportCols = columns.filter(c => 
    c.name !== 'image' && 
    c.field !== 'image_url' && 
    c.name !== 'image_url' &&
    c.name !== 'actions'
  )
  const isLandscape = exportCols.length > 5
  const colWidth = Math.floor(100 / (exportCols.length || 1))

  const tableRows: any[] = [
    new TableRow({
      children: exportCols.map(c => new TableCell({
        children: [new Paragraph({
          alignment: c.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text: c.label, font: 'Calibri', size: 18, bold: true, color: 'FFFFFF' })]
        })],
        shading: { fill: '1A237E' },
        width: { size: colWidth, type: WidthType.PERCENTAGE },
        margins: { top: 120, bottom: 120, left: 140, right: 140 },
      }))
    })
  ]

  let rowIndex = 0
  for (const r of rows || []) {
    const isEven = rowIndex % 2 === 0
    const fill = isEven ? undefined : 'FAFAFA'
    const cells = exportCols.map(col => {
      let val = typeof col.field === 'function' ? col.field(r) : r[col.field]
      if (typeof val === 'string' && val.startsWith('http') && val.includes('supabase')) {
        val = ''
      }
      const formatted = col.format ? col.format(val) : (val ?? '-')
      return new TableCell({
        children: [new Paragraph({
          alignment: col.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text: String(formatted), font: 'Calibri', size: 17, color: '212121' })]
        })],
        shading: fill ? { fill } : undefined,
        width: { size: colWidth, type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 140, right: 140 },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        }
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
    }
  })

  const baseTitle = filename.replace(/\.(docx|xlsx|csv)$/i, '').replace(/_/g, ' ')
  const doc = new Document({
    sections: [{
      properties: { page: { size: { orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: 'SEVEN WAVES RESTAURANT (PVT) LTD', font: 'Calibri', size: 28, bold: true, color: '1A237E' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: baseTitle, font: 'Calibri', size: 22, bold: true, color: '212121' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 220 },
          children: [new TextRun({ text: `${subtitle ? subtitle + ' · ' : ''}Generated: ${new Date().toLocaleDateString()}`, font: 'Calibri', size: 18, italics: true, color: '555555' })]
        }),
        table
      ]
    }]
  })

  const blob = await Packer.toBlob(doc)
  const dateStr = new Date().toISOString().slice(0, 10)
  const finalName = `${filename.replace(/\.docx$/i, '')}_${dateStr}.docx`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = finalName
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function fetchImageAsPNG(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const MAX_DIM = 200
      let w = img.width
      let h = img.height
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) {
          h = Math.round((h * MAX_DIM) / w)
          w = MAX_DIM
        } else {
          w = Math.round((w * MAX_DIM) / h)
          h = MAX_DIM
        }
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      } else {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

async function generatePDFTableDoc(columns: any[], rows: any[], title: string, subtitle: string = '', foot?: any[][]): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })

  await drawSAPHeader(doc, title, subtitle)

  const imageCols = columns.filter((c: any) => c.name === 'image' || c.field === 'image_url')
  const imageCache: Record<string, string> = {}
  
  if (imageCols.length > 0) {
    const urls = new Set<string>()
    for (const r of rows) {
      for (const c of imageCols) {
        const val = typeof c.field === 'function' ? c.field(r) : r[c.field]
        if (val && typeof val === 'string' && val.startsWith('http')) {
          urls.add(val)
        }
      }
    }
    await Promise.all(Array.from(urls).map(async (url) => {
      const b64 = await fetchImageAsPNG(url)
      if (b64) imageCache[url] = b64
    }))
  }

  const heads = columns.map((c: any) => c.label)
  const body = rows.map((r: any) =>
    columns.map((c: any) => {
      const val = typeof c.field === 'function' ? c.field(r) : r[c.field]
      return c.format ? c.format(val) : (val ?? '-')
    }),
  )
  
    const tableStyles: any = { fontSize: 7 }
    if (imageCols.length > 0) {
      tableStyles.minCellHeight = 12
    }

    const tableConfig: any = {
      startY: 38,
      head: [heads],
      body,
      theme: 'grid',
      headStyles: { fillColor: [27, 58, 107], halign: 'center', fontSize: 8 }, // #1b3a6b matching Navy Blue
      styles: tableStyles,
      columnStyles: Object.fromEntries(columns.map((c: any, i: number) => [i, { halign: c.align || 'left' }])),
      didParseCell: (data: any) => {
        if (data.section === 'body') {
          const colDef = columns[data.column.index]
          if (imageCols.includes(colDef)) {
            data.cell.text = [] // clear text
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body') {
          const colDef = columns[data.column.index]
          if (imageCols.includes(colDef)) {
            const rowData = rows[data.row.index]
            if (!rowData) return
            const val = typeof colDef.field === 'function' ? colDef.field(rowData) : rowData[colDef.field]
            if (val && typeof val === 'string' && imageCache[val]) {
              const imgData = imageCache[val]
              const dim = 10 // 10x10 mm
              const x = data.cell.x + (data.cell.width - dim) / 2
              const y = data.cell.y + (data.cell.height - dim) / 2
              doc.addImage(imgData, 'PNG', x, y, dim, dim)
            }
          }
        }
      }
    }

    if (foot && foot.length > 0) {
      tableConfig.foot = foot
      tableConfig.footStyles = {
        fillColor: [238, 238, 238],
        textColor: [20, 20, 20],
        fontStyle: 'bold',
        fontSize: 8,
      }
    }

    autoTable(doc, tableConfig)
  
  return doc
}

/**
 * Generic PDF Export with jsPDF-AutoTable
 */
export async function exportTableToPDF(columns: any[], rows: any[], title: string, subtitle: string = '', foot?: any[][]) {
  const doc = await generatePDFTableDoc(columns, rows, title, subtitle, foot)
  doc.save(`${title}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

/**
 * Print report as PDF — generates the same PDF as exportTableToPDF
 * but opens it in a new tab for printing instead of downloading.
 */
export async function printTableAsPDF(columns: any[], rows: any[], title: string, subtitle: string = '', foot?: any[][]) {
  const doc = await generatePDFTableDoc(columns, rows, title, subtitle, foot)
  const pdfBlob = doc.output('blob')
  const url = URL.createObjectURL(pdfBlob)
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.print()
    })
  }
}

/**
 * Export a single Supplier Payment as a professional receipt/invoice PDF.
 * Includes logo, company name, supplier details, payment info, and allocation table.
 */
export async function exportPaymentReceiptToPDF(payment: {
  id?: string
  doc_number: string
  doc_date: string
  status: string
  total_amount: number
  payment_method: string
  reference_no?: string
  cheque_no?: string
  remarks?: string
  suppliers?: { name: string; code?: string }
  supplier_payment_allocations?: Array<{
    amount: number
    ap_invoices?: {
      id?: string
      doc_number: string
      total_amount: number
      balance_due: number
      ap_invoice_lines?: Array<{
        id?: string
        item_id?: string
        quantity?: number
        unit_price?: number
        line_total?: number
        description?: string
        items?: { id?: string; name: string; code?: string }
      }>
    }
  }>
}, download = true) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // ── Header (Logo + Company) ─────────────────────────────────────────────
  try {
    const logoObj = await getLogoData()
    const logoHeight = 16
    const logoWidth = (logoObj.width / logoObj.height) * logoHeight
    doc.addImage(logoObj.data, 'PNG', pageWidth - logoWidth - 14, 10, logoWidth, logoHeight)
  } catch (e) { /* logo optional */ }

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(27, 58, 107)
  doc.text('SEVEN WAVES RESTAURANT (PVT) LTD', 14, 16)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(110, 110, 110)
  doc.text('Mirissa, Southern Province, Sri Lanka', 14, 21)

  // ── Document Title ─────────────────────────────────────────────────────
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(27, 58, 107)
  doc.text('PAYMENT VOUCHER', 14, 30)
  const titleW = doc.getTextWidth('PAYMENT VOUCHER')
  doc.setDrawColor(27, 58, 107)
  doc.setLineWidth(0.5)
  doc.line(14, 31.5, 14 + titleW, 31.5)

  // ── Info Block ─────────────────────────────────────────────────────────
  const fmt = (v: number) =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(v || 0)
  const fmtDate = (d: string) => {
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const pm = (payment.payment_method || 'cash').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)

  // Left column
  const leftX = 14, rightX = pageWidth / 2 + 5
  let y = 40
  const row = (label: string, val: string, x = leftX) => {
    doc.setFont('helvetica', 'bold'); doc.text(label, x, y)
    doc.setFont('helvetica', 'normal'); doc.text(val, x + 38, y)
    y += 6
  }
  row('Voucher No :', payment.doc_number)
  row('Date :', fmtDate(payment.doc_date))
  row('Status :', payment.status.toUpperCase())
  y = 40
  const rightRow = (label: string, val: string) => {
    doc.setFont('helvetica', 'bold'); doc.text(label, rightX, y)
    doc.setFont('helvetica', 'normal'); doc.text(val, rightX + 40, y)
    y += 6
  }
  rightRow('Supplier :', payment.suppliers?.name || 'N/A')
  rightRow('Payment Method :', pm)
  if (payment.reference_no) rightRow('Reference No :', payment.reference_no)
  if (payment.cheque_no) rightRow('Cheque No :', payment.cheque_no)

  // Divider
  const divY = Math.max(y, 64) + 2
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(14, divY, pageWidth - 14, divY)

  // ── Ensure Invoice Line Items are Loaded ──────────────────────────────
  const allocs = payment.supplier_payment_allocations || []
  const missingLines = allocs.some((a: any) => a.ap_invoices?.id && (!a.ap_invoices.ap_invoice_lines || a.ap_invoices.ap_invoice_lines.length === 0))

  if (missingLines) {
    try {
      const invIds = allocs.map((a: any) => a.ap_invoices?.id).filter(Boolean)
      if (invIds.length > 0) {
        const { data: invLines } = await supabase
          .from('ap_invoice_lines')
          .select('id, invoice_id, item_id, quantity, unit_price, line_total, description, items(id, name, code)')
          .in('invoice_id', invIds)
          .order('line_number', { ascending: true })

        if (invLines && invLines.length > 0) {
          for (const a of allocs) {
            if (a.ap_invoices) {
              const matched = invLines.filter((l: any) => l.invoice_id === a.ap_invoices?.id)
              if (matched.length > 0) {
                a.ap_invoices.ap_invoice_lines = matched as any
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not load invoice lines for payment voucher', e)
    }
  }

  // ── Allocation & Items Table ──────────────────────────────────────────
  const tableBody: any[] = []
  let rowIdx = 1

  for (const a of allocs) {
    const inv = a.ap_invoices
    const lines = inv?.ap_invoice_lines || []
    const invDocNo = inv?.doc_number || '-'

    if (lines.length > 0) {
      lines.forEach((l: any, lIdx: number) => {
        const itemCode = l.items?.code ? `[${l.items.code}] ` : ''
        const itemName = l.items?.name || l.description || 'Item'
        const fullItem = `${itemCode}${itemName}`.trim()
        const qty = l.quantity != null ? String(l.quantity) : '-'
        const unitPrice = l.unit_price != null ? fmt(l.unit_price) : '-'
        const lineTotal = l.line_total != null ? fmt(l.line_total) : '-'
        const allocPaid = lIdx === 0 ? fmt(a.amount) : ''

        tableBody.push([
          rowIdx++,
          lIdx === 0 ? invDocNo : '',
          fullItem,
          qty,
          unitPrice,
          lineTotal,
          allocPaid,
        ])
      })
    } else {
      tableBody.push([
        rowIdx++,
        invDocNo,
        '—',
        '—',
        '—',
        fmt(inv?.total_amount || 0),
        fmt(a.amount),
      ])
    }
  }

  autoTable(doc, {
    startY: divY + 4,
    head: [['#', 'Invoice #', 'Item / Description', 'Qty', 'Unit Price', 'Line Total', 'Amount Paid']],
    body: tableBody.length ? tableBody : [['—', 'No allocations', '', '', '', '', '']],
    foot: [['', '', '', '', '', 'TOTAL PAID', fmt(payment.total_amount)]],
    theme: 'grid',
    headStyles: { fillColor: [27, 58, 107], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [240, 240, 240], textColor: [27, 58, 107], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 32 },
      2: { halign: 'left' },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 26 },
      6: { halign: 'right', cellWidth: 28 },
    },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10

  // Remarks
  if (payment.remarks) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(100)
    doc.text(`Remarks: ${payment.remarks}`, 14, finalY)
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  const footY = doc.internal.pageSize.getHeight() - 18
  doc.setDrawColor(200, 200, 200)
  doc.line(14, footY, pageWidth - 14, footY)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(150)
  doc.text('This is a computer-generated document. No signature required.', pageWidth / 2, footY + 5, { align: 'center' })
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, footY + 10, { align: 'center' })

  if (download) {
    doc.save(`Payment_${payment.doc_number}.pdf`)
  } else {
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.addEventListener('load', () => win.print())
  }
}

/**
 * Export the full Supplier Payment Report as a PDF with summary totals.
 */
export async function exportSupplierPaymentReportToPDF(rows: any[], filters: { startDate: string; endDate: string; supplierName?: string; itemName?: string }) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const subtitle = `Period: ${filters.startDate} to ${filters.endDate}${filters.supplierName ? ' | Supplier: ' + filters.supplierName : ''}${filters.itemName ? ' | Item: ' + filters.itemName : ''}`

  await drawSAPHeader(doc, 'SUPPLIER PAYMENT REPORT', subtitle)

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(v || 0)

  const body = rows.map((r, i) => {
    const itemNames = (r.supplier_payment_allocations || [])
      .flatMap((a: any) => a.ap_invoices?.ap_invoice_lines || [])
      .map((l: any) => l.items?.name || l.description)
      .filter(Boolean)
    const uniqueItems = Array.from(new Set(itemNames)).join(', ') || '—'

    return [
      i + 1,
      r.doc_date,
      r.suppliers?.name || '-',
      r.doc_number,
      uniqueItems,
      r.cheque_no || r.reference_no || '-',
      (r.payment_method || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      fmt(r.total_amount),
      (r.status || '').toUpperCase(),
    ]
  })

  const total = rows.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0)

  autoTable(doc, {
    startY: 40,
    head: [['#', 'Date', 'Supplier', 'Document #', 'Items', 'Ref/Cheque', 'Method', 'Amount', 'Status']],
    body,
    foot: [['', '', '', '', '', '', 'TOTAL', fmt(total), '']],
    theme: 'grid',
    headStyles: { fillColor: [27, 58, 107], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [240, 240, 240], textColor: [27, 58, 107], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.5 },
    columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 4: { cellWidth: 45 }, 7: { halign: 'right' }, 8: { halign: 'center' } },
  })

  doc.save(`Supplier_Payment_Report_${filters.startDate}_${filters.endDate}.pdf`)
}

/**
 * Export AP Invoices Report as a PDF with dynamic totals based on the filter status.
 */
export async function exportAPInvoicesToPDF(rows: any[], filters: { startDate: string; endDate: string; supplierName?: string; status?: string }) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const subtitleParts = []
  if (filters.startDate && filters.endDate) subtitleParts.push(`Period: ${filters.startDate} to ${filters.endDate}`)
  if (filters.supplierName) subtitleParts.push(`Supplier: ${filters.supplierName}`)
  if (filters.status) subtitleParts.push(`Status: ${filters.status.toUpperCase()}`)
  const subtitle = subtitleParts.join(' | ') || 'All Invoices'

  await drawSAPHeader(doc, 'AP INVOICES REPORT', subtitle)

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(v || 0)

  const body = rows.map((r, i) => [
    i + 1,
    r.doc_date,
    r.doc_number,
    r.suppliers?.name || '-',
    r.grn_id ? r.goods_receipts?.doc_number || r.grn_id : '-',
    fmt(r.total_amount),
    fmt(r.balance_due),
    (r.status || '').toUpperCase(),
  ])

  let totalLabel = 'TOTAL AMOUNT'
  let totalValue = 0

  if (filters.status === 'paid') {
    totalLabel = 'TOTAL PAID AMOUNT'
    totalValue = rows.reduce((sum, r) => sum + (parseFloat(r.paid_amount) || parseFloat(r.total_amount) || 0), 0)
  } else if (filters.status === 'draft' || filters.status === 'UNPAID') {
    totalLabel = 'TOTAL BALANCE DUE'
    totalValue = rows.reduce((sum, r) => sum + (parseFloat(r.balance_due) || 0), 0)
  } else {
    totalLabel = 'TOTAL INVOICE AMOUNT'
    totalValue = rows.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0)
  }

  autoTable(doc, {
    startY: 40,
    head: [['#', 'Date', 'Invoice #', 'Supplier', 'GRN Ref', 'Total Amount', 'Balance Due', 'Status']],
    body,
    foot: [['', '', '', '', totalLabel, fmt(totalValue), '', '']],
    theme: 'grid',
    headStyles: { fillColor: [27, 58, 107], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [240, 240, 240], textColor: [27, 58, 107], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'center' } },
  })

  doc.save(`AP_Invoices_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
}
