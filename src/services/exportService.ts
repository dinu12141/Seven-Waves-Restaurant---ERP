import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
// @ts-ignore
import logoUrl from 'src/assets/seven-waves-logo-transparent.png'

interface LogoData {
  data: string
  width: number
  height: number
}

let cachedLogoData: LogoData | null = null
async function getLogoData(): Promise<LogoData> {
  if (cachedLogoData) return cachedLogoData
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(img, 0, 0)
      cachedLogoData = { data: canvas.toDataURL('image/png'), width: img.width, height: img.height }
      resolve(cachedLogoData)
    }
    img.onerror = reject
    img.src = logoUrl
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
          // Escape commas and wrap in quotes
          const escaped = ('' + (val || '')).replace(/"/g, '""')
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
 * Generic Excel Export
 */
export function exportTableToExcel(columns: any[], rows: any[], filename: string) {
  const exportCols = columns.filter(c => 
    c.name !== 'image' && 
    c.field !== 'image_url' && 
    c.name !== 'image_url' &&
    c.name !== 'actions'
  )

  const data = rows.map((r) => {
    const obj: any = {}
    exportCols.forEach((col) => {
      let val = typeof col.field === 'function' ? col.field(r) : r[col.field]
      // Double-check: if it's still somehow an image link, clear it
      if (typeof val === 'string' && val.startsWith('http') && val.includes('supabase')) {
        val = ''
      }
      obj[col.label] = val
    })
    return obj
  })

  const dateStr = new Date().toISOString().slice(0, 10)
  const baseName = filename.replace(/\.xlsx$/i, '')
  const finalName = `${baseName}_${dateStr}.xlsx`

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, finalName)
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

async function generatePDFTableDoc(columns: any[], rows: any[], title: string, subtitle: string = ''): Promise<jsPDF> {
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

    autoTable(doc, {
      startY: 38,
      head: [heads],
      body,
      theme: 'grid',
      headStyles: { fillColor: [27, 58, 107], halign: 'center', fontSize: 8 }, // #1b3a6b matching Navy Blue
      styles: tableStyles,
    columnStyles: Object.fromEntries(columns.map((c: any, i: number) => [i, { halign: c.align || 'left' }])),
    didParseCell: (data) => {
      if (data.section === 'body') {
        const colDef = columns[data.column.index]
        if (imageCols.includes(colDef)) {
          data.cell.text = [] // clear text
        }
      }
    },
    didDrawCell: (data) => {
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
  })
  
  return doc
}

/**
 * Generic PDF Export with jsPDF-AutoTable
 */
export async function exportTableToPDF(columns: any[], rows: any[], title: string, subtitle: string = '') {
  const doc = await generatePDFTableDoc(columns, rows, title, subtitle)
  doc.save(`${title}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

/**
 * Print report as PDF — generates the same PDF as exportTableToPDF
 * but opens it in a new tab for printing instead of downloading.
 */
export async function printTableAsPDF(columns: any[], rows: any[], title: string, subtitle: string = '') {
  const doc = await generatePDFTableDoc(columns, rows, title, subtitle)
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
    ap_invoices?: { doc_number: string; total_amount: number; balance_due: number }
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
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(v)
  const fmtDate = (d: string) => {
    const dt = new Date(d)
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const pm = (payment.payment_method || 'cash').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

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

  // ── Allocation Table ──────────────────────────────────────────────────
  const allocs = payment.supplier_payment_allocations || []
  const tableBody = allocs.map((a, i) => [
    i + 1,
    a.ap_invoices?.doc_number || '-',
    fmt(a.ap_invoices?.total_amount || 0),
    fmt(a.amount),
  ])

  autoTable(doc, {
    startY: divY + 4,
    head: [['#', 'Invoice #', 'Invoice Amount', 'Amount Paid']],
    body: tableBody.length ? tableBody : [['—', 'No allocations', '', '']],
    foot: [['', 'TOTAL PAID', '', fmt(payment.total_amount)]],
    theme: 'grid',
    headStyles: { fillColor: [27, 58, 107], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    footStyles: { fillColor: [240, 240, 240], textColor: [27, 58, 107], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9 },
    columnStyles: { 0: { halign: 'center', cellWidth: 12 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
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
export async function exportSupplierPaymentReportToPDF(rows: any[], filters: { startDate: string; endDate: string; supplierName?: string }) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const subtitle = `Period: ${filters.startDate} to ${filters.endDate}${filters.supplierName ? ' | Supplier: ' + filters.supplierName : ''}`

  await drawSAPHeader(doc, 'SUPPLIER PAYMENT REPORT', subtitle)

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(v || 0)

  const body = rows.map((r, i) => [
    i + 1,
    r.doc_date,
    r.suppliers?.name || '-',
    r.doc_number,
    r.cheque_no || r.reference_no || '-',
    (r.payment_method || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    fmt(r.total_amount),
    (r.status || '').toUpperCase(),
  ])

  const total = rows.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0)

  autoTable(doc, {
    startY: 40,
    head: [['#', 'Date', 'Supplier', 'Document #', 'Ref/Cheque', 'Method', 'Amount', 'Status']],
    body,
    foot: [['', '', '', '', '', 'TOTAL', fmt(total), '']],
    theme: 'grid',
    headStyles: { fillColor: [27, 58, 107], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [240, 240, 240], textColor: [27, 58, 107], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8 },
    columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 6: { halign: 'right' }, 7: { halign: 'center' } },
  })

  doc.save(`Supplier_Payment_Report_${filters.startDate}_${filters.endDate}.pdf`)
}

