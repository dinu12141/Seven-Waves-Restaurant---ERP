import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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
  const headers = columns.map((c) => c.label).join(',')
  const csvRows = rows
    .map((r) => {
      return columns
        .map((col) => {
          const val = typeof col.field === 'function' ? col.field(r) : r[col.field]
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
  const data = rows.map((r) => {
    const obj: any = {}
    columns.forEach((col) => {
      obj[col.label] = typeof col.field === 'function' ? col.field(r) : r[col.field]
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

/**
 * Generic PDF Export with jsPDF-AutoTable
 */
export async function exportTableToPDF(columns: any[], rows: any[], title: string, subtitle: string = '') {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })

  await drawSAPHeader(doc, title, subtitle)

  const heads = columns.map((c) => c.label)
  const body = rows.map((r) =>
    columns.map((c) => {
      const val = typeof c.field === 'function' ? c.field(r) : r[c.field]
      return c.format ? c.format(val) : (val ?? '-')
    }),
  )
  
  autoTable(doc, {
    startY: 38,
    head: [heads],
    body,
    theme: 'grid',
    headStyles: { fillColor: [27, 58, 107], halign: 'center', fontSize: 8 }, // #1b3a6b matching Navy Blue
    styles: { fontSize: 7 },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align || 'left' }])),
  })
  doc.save(`${title}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

/**
 * Print report as PDF — generates the same PDF as exportTableToPDF
 * but opens it in a new tab for printing instead of downloading.
 */
export async function printTableAsPDF(columns: any[], rows: any[], title: string, subtitle: string = '') {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })

  await drawSAPHeader(doc, title, subtitle)

  const heads = columns.map((c: any) => c.label)
  const body = rows.map((r: any) =>
    columns.map((c: any) => {
      const val = typeof c.field === 'function' ? c.field(r) : r[c.field]
      return c.format ? c.format(val) : (val ?? '-')
    }),
  )

  autoTable(doc, {
    startY: 38,
    head: [heads],
    body,
    theme: 'grid',
    headStyles: { fillColor: [27, 58, 107], halign: 'center', fontSize: 8 }, // #1b3a6b matching Navy Blue
    styles: { fontSize: 7 },
    columnStyles: Object.fromEntries(columns.map((c: any, i: number) => [i, { halign: c.align || 'left' }])),
  })

  // Open in new tab for printing instead of downloading
  const pdfBlob = doc.output('blob')
  const url = URL.createObjectURL(pdfBlob)
  const printWindow = window.open(url, '_blank')
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.print()
    })
  }
}
