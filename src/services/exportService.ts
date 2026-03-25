import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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
export function exportToPDF(document: any, lines: any[]) {
  try {
    const doc = new jsPDF()

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
