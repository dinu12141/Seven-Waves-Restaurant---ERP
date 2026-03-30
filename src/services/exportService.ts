import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoUrl from 'src/assets/seven-waves-logo-transparent.png'

let cachedLogoBase64: string | null = null
async function getLogoBase64(): Promise<string> {
  if (cachedLogoBase64) return cachedLogoBase64
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(img, 0, 0)
      cachedLogoBase64 = canvas.toDataURL('image/png')
      resolve(cachedLogoBase64)
    }
    img.onerror = reject
    img.src = logoUrl
  })
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

    // Add Logo Top Right
    try {
      const base64Logo = await getLogoBase64()
      const pageWidth = doc.internal.pageSize.getWidth()
      doc.addImage(base64Logo, 'PNG', pageWidth - 50, 10, 36, 12)
    } catch (e) {
      console.warn('Failed to load logo for PDF', e)
    }

    // Header
    doc.setFontSize(22)
    doc.setTextColor(25, 118, 210) // Quasar Primary Blue
    doc.text('Seven Waves Restaurant', 14, 22)

    doc.setFontSize(14)
    doc.setTextColor(0)
    doc.text(`${document.doc_type} Document: ${document.doc_number}`, 14, 32)

    doc.setFontSize(10)
    doc.setTextColor(100)
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
      startY: 60,
      head: [['#', 'Item Description', 'Quantity', 'Unit Cost', 'Total']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [25, 118, 210], halign: 'center' },
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

  try {
    const base64Logo = await getLogoBase64()
    const pageWidth = doc.internal.pageSize.getWidth()
    doc.addImage(base64Logo, 'PNG', pageWidth - 50, 10, 36, 12)
  } catch (e) {
    console.warn('Failed to load logo for PDF header', e)
  }

  doc.setFontSize(18)
  doc.setTextColor(25, 118, 210)
  doc.text('SEVEN WAVES RESTAURANT (PVT) LTD', 14, 18)
  
  doc.setFontSize(12)
  doc.setTextColor(0)
  doc.text(title.replace(/_/g, ' '), 14, 26)
  
  doc.setFontSize(9)
  doc.setTextColor(100)
  const subText = subtitle ? `${subtitle} | ` : ''
  doc.text(`${subText}Generated: ${new Date().toLocaleString()}`, 14, 33)

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
    headStyles: { fillColor: [25, 118, 210], halign: 'center', fontSize: 8 },
    styles: { fontSize: 7 },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align || 'left' }])),
  })
  doc.save(`${title}_${new Date().toISOString().slice(0, 10)}.pdf`)
}
