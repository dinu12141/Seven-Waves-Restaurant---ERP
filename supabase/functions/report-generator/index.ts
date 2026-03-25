// @ts-nocheck
/// <reference lib="deno.ns" />

// ══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — Report Generator Edge Function
// ══════════════════════════════════════════════════════════════════════════════
// Generates professional PDF reports (Invoices & Sales Summaries) server-side.
// Uploads the PDF to Supabase Storage and returns a 1-hour signed download URL.
//
// Supported reportTypes:
//   • "invoice"         — Single invoice PDF by order_id
//   • "sales_summary"   — Daily/date-range sales statement
//
// Auth: Requires valid JWT in Authorization header.
// Uses SERVICE_ROLE_KEY for DB access and Storage uploads.
// ══════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { jsPDF } from 'https://esm.sh/jspdf@2.5.2'

// ── CORS headers ──────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Seven Waves Branding Constants ────────────────────────────────────────────
const BRAND = {
  name: 'Seven Waves',
  tagline: 'Restaurant & Hospitality',
  email: 'admin@sevenwaves.lk',
  phone: '+94 XX XXX XXXX',
  address: 'Colombo, Sri Lanka',
  primaryColor: [15, 76, 117] as [number, number, number],     // Deep ocean blue
  secondaryColor: [27, 38, 59] as [number, number, number],    // Dark navy
  accentColor: [52, 152, 219] as [number, number, number],     // Bright blue
  lightGray: [245, 245, 245] as [number, number, number],
  mediumGray: [189, 195, 199] as [number, number, number],
  textDark: [44, 62, 80] as [number, number, number],
  textLight: [127, 140, 141] as [number, number, number],
  successGreen: [39, 174, 96] as [number, number, number],
  warningOrange: [243, 156, 18] as [number, number, number],
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  // ── Handle CORS preflight ────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // ── Validate environment ─────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // ── Authenticate the request via JWT ─────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(
        { success: false, error: 'Missing or invalid Authorization header' },
        401,
      )
    }

    const token = authHeader.replace('Bearer ', '')

    // Create an auth client to verify the user's JWT
    const authClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: { user }, error: userError } = await authClient.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse(
        { success: false, error: 'Unauthorized: Invalid token' },
        401,
      )
    }

    console.log(`[report-generator] Authenticated user: ${user.id}`)

    // ── Parse request body ───────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const { reportType, filters } = body

    if (!reportType) {
      return jsonResponse(
        { success: false, error: 'Missing required field: reportType' },
        400,
      )
    }

    // ── Service-role Supabase client for data and storage access ─────────
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // ── Fetch company details for branding ───────────────────────────────
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, address, phone, email, website')
      .limit(1)
      .single()

    // ── Route to the correct report generator ────────────────────────────
    let pdfBytes: Uint8Array
    let filename: string

    switch (reportType) {
      case 'invoice': {
        if (!filters?.order_id) {
          return jsonResponse(
            { success: false, error: 'Missing filters.order_id for invoice report' },
            400,
          )
        }
        const result = await generateInvoicePDF(supabase, filters.order_id, company)
        pdfBytes = result.bytes
        filename = result.filename
        break
      }

      case 'sales_summary': {
        if (!filters?.date_from || !filters?.date_to) {
          return jsonResponse(
            { success: false, error: 'Missing filters.date_from and/or filters.date_to for sales_summary' },
            400,
          )
        }
        const result = await generateSalesSummaryPDF(
          supabase,
          filters.date_from,
          filters.date_to,
          company,
        )
        pdfBytes = result.bytes
        filename = result.filename
        break
      }

      default:
        return jsonResponse(
          { success: false, error: `Unsupported reportType: "${reportType}". Use "invoice" or "sales_summary".` },
          400,
        )
    }

    // ── Upload PDF to Supabase Storage ───────────────────────────────────
    const storagePath = `${reportType}/${filename}`
    console.log(`[report-generator] Uploading to storage: reports/${storagePath}`)

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('[report-generator] Upload error:', uploadError)
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    // ── Generate signed URL (1 hour expiry) ──────────────────────────────
    const { data: signedData, error: signedError } = await supabase.storage
      .from('reports')
      .createSignedUrl(storagePath, 3600) // 3600 seconds = 1 hour

    if (signedError) {
      console.error('[report-generator] Signed URL error:', signedError)
      throw new Error(`Failed to generate signed URL: ${signedError.message}`)
    }

    console.log(`[report-generator] Report generated successfully: ${filename}`)

    return jsonResponse({
      success: true,
      reportType,
      filename,
      signedUrl: signedData.signedUrl,
      expiresIn: '1 hour',
    })
  } catch (error: any) {
    console.error('[report-generator] Fatal error:', error)
    return jsonResponse(
      { success: false, error: error.message ?? 'Unknown error' },
      500,
    )
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY: JSON Response helper
// ══════════════════════════════════════════════════════════════════════════════
function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// PDF HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/** Format a number as currency (LKR) */
function formatCurrency(amount: number | null | undefined): string {
  const val = Number(amount ?? 0)
  return `LKR ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Format a date string into a readable format */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/** Draw the standard Seven Waves header on a jsPDF doc */
function drawHeader(doc: any, company: any, title: string): number {
  const pageWidth = doc.internal.pageSize.getWidth()

  // ── Top accent bar ──────────────────────────────────────────────────────
  doc.setFillColor(...BRAND.primaryColor)
  doc.rect(0, 0, pageWidth, 4, 'F')

  // ── Logo area (text-based logo) ─────────────────────────────────────────
  doc.setFillColor(...BRAND.secondaryColor)
  doc.rect(0, 4, pageWidth, 30, 'F')

  // Logo text
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('SEVEN WAVES', 15, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(180, 200, 220)
  doc.text(BRAND.tagline, 15, 29)

  // Company contact info (right side)
  doc.setFontSize(8)
  doc.setTextColor(160, 180, 200)
  const contactLines = [
    company?.email || BRAND.email,
    company?.phone || BRAND.phone,
    company?.address || BRAND.address,
  ]
  let contactY = 17
  contactLines.forEach((line: string) => {
    doc.text(line, pageWidth - 15, contactY, { align: 'right' })
    contactY += 5
  })

  // ── Document title bar ──────────────────────────────────────────────────
  doc.setFillColor(...BRAND.accentColor)
  doc.rect(0, 34, pageWidth, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(title.toUpperCase(), pageWidth / 2, 41, { align: 'center' })

  return 52 // Y position after header
}

/** Draw a footer with page numbers */
function drawFooter(doc: any, pageNum: number, totalPages: number) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Footer line
  doc.setDrawColor(...BRAND.mediumGray)
  doc.setLineWidth(0.5)
  doc.line(15, pageHeight - 18, pageWidth - 15, pageHeight - 18)

  // Footer text
  doc.setFontSize(7)
  doc.setTextColor(...BRAND.textLight)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Generated by Seven Waves ERP  •  ${new Date().toLocaleString('en-GB')}`,
    15,
    pageHeight - 12,
  )
  doc.text(
    `Page ${pageNum} of ${totalPages}`,
    pageWidth - 15,
    pageHeight - 12,
    { align: 'right' },
  )

  // Bottom accent bar
  doc.setFillColor(...BRAND.primaryColor)
  doc.rect(0, pageHeight - 4, pageWidth, 4, 'F')
}

/** Draw a table with header row and data rows */
function drawTable(
  doc: any,
  startY: number,
  headers: string[],
  rows: string[][],
  colWidths: number[],
  options?: { alignRight?: number[] },
): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const startX = 15
  const rowHeight = 7
  const headerHeight = 8
  const alignRight = options?.alignRight ?? []
  let y = startY

  // ── Header row ──────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND.secondaryColor)
  doc.rect(startX, y, pageWidth - 30, headerHeight, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')

  let x = startX + 3
  headers.forEach((header: string, i: number) => {
    if (alignRight.includes(i)) {
      doc.text(header, x + colWidths[i] - 6, y + 5.5, { align: 'right' })
    } else {
      doc.text(header, x, y + 5.5)
    }
    x += colWidths[i]
  })

  y += headerHeight

  // ── Data rows ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  rows.forEach((row: string[], rowIdx: number) => {
    // Check if we need a new page
    if (y + rowHeight > pageHeight - 30) {
      doc.addPage()
      y = 20 // Reset Y for new page

      // Redraw header on new page
      doc.setFillColor(...BRAND.secondaryColor)
      doc.rect(startX, y, pageWidth - 30, headerHeight, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')

      let hx = startX + 3
      headers.forEach((header: string, i: number) => {
        if (alignRight.includes(i)) {
          doc.text(header, hx + colWidths[i] - 6, y + 5.5, { align: 'right' })
        } else {
          doc.text(header, hx, y + 5.5)
        }
        hx += colWidths[i]
      })

      y += headerHeight
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
    }

    // Alternate row background
    if (rowIdx % 2 === 0) {
      doc.setFillColor(...BRAND.lightGray)
      doc.rect(startX, y, pageWidth - 30, rowHeight, 'F')
    }

    doc.setTextColor(...BRAND.textDark)
    let rx = startX + 3
    row.forEach((cell: string, i: number) => {
      const cellText = String(cell ?? '')
      if (alignRight.includes(i)) {
        doc.text(cellText, rx + colWidths[i] - 6, y + 5, { align: 'right' })
      } else {
        // Truncate long text
        const maxChars = Math.floor(colWidths[i] / 2)
        const truncated = cellText.length > maxChars ? cellText.substring(0, maxChars) + '...' : cellText
        doc.text(truncated, rx, y + 5)
      }
      rx += colWidths[i]
    })

    y += rowHeight
  })

  // Table bottom border
  doc.setDrawColor(...BRAND.mediumGray)
  doc.setLineWidth(0.3)
  doc.line(startX, y, pageWidth - 15, y)

  return y
}

// ══════════════════════════════════════════════════════════════════════════════
// INVOICE PDF GENERATOR
// ══════════════════════════════════════════════════════════════════════════════
async function generateInvoicePDF(
  supabase: any,
  orderId: string,
  company: any,
): Promise<{ bytes: Uint8Array; filename: string }> {
  console.log(`[report-generator] Generating invoice for order: ${orderId}`)

  // ── Fetch invoice data ─────────────────────────────────────────────────
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select(`
      *,
      invoice_items (
        id, description, qty, unit_price, line_total, tax_amount, discount, item_code
      )
    `)
    .eq('order_id', orderId)
    .single()

  if (invError || !invoice) {
    // Try fetching by invoice ID directly
    const { data: invById, error: invByIdError } = await supabase
      .from('invoices')
      .select(`
        *,
        invoice_items (
          id, description, qty, unit_price, line_total, tax_amount, discount, item_code
        )
      `)
      .eq('id', orderId)
      .single()

    if (invByIdError || !invById) {
      throw new Error(`Invoice not found for ID: ${orderId}`)
    }

    return buildInvoicePDF(invById, company)
  }

  return buildInvoicePDF(invoice, company)
}

function buildInvoicePDF(
  invoice: any,
  company: any,
): { bytes: Uint8Array; filename: string } {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // ── Header ─────────────────────────────────────────────────────────────
  let y = drawHeader(doc, company, 'Tax Invoice')

  // ── Invoice details section ────────────────────────────────────────────
  const leftCol = 15
  const rightCol = pageWidth / 2 + 10

  // Invoice info box (left)
  doc.setFillColor(240, 248, 255)
  doc.roundedRect(leftCol, y, pageWidth / 2 - 20, 28, 2, 2, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND.primaryColor)
  doc.text('INVOICE DETAILS', leftCol + 5, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND.textDark)

  const invoiceNo = invoice.invoice_no || `INV-${String(invoice.invoice_number).padStart(5, '0')}`
  doc.text(`Invoice No:    ${invoiceNo}`, leftCol + 5, y + 13)
  doc.text(`Invoice Date:  ${formatDate(invoice.invoice_date || invoice.created_at)}`, leftCol + 5, y + 19)
  doc.text(`Payment:       ${(invoice.payment_type || 'Cash').toUpperCase()}`, leftCol + 5, y + 25)

  // Customer info box (right)
  doc.setFillColor(240, 248, 255)
  doc.roundedRect(rightCol, y, pageWidth / 2 - 20, 28, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...BRAND.primaryColor)
  doc.text('CUSTOMER', rightCol + 5, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND.textDark)
  doc.text(`Name:   ${invoice.customer_name || 'Walk-in Customer'}`, rightCol + 5, y + 13)
  doc.text(`Phone:  ${invoice.customer_phone || 'N/A'}`, rightCol + 5, y + 19)

  // Payment status badge
  const status = (invoice.payment_status || 'unpaid').toUpperCase()
  const statusColor = status === 'PAID' ? BRAND.successGreen : BRAND.warningOrange
  doc.setFillColor(...statusColor)
  doc.roundedRect(rightCol + 5, y + 22, 20, 5, 1, 1, 'F')
  doc.setFontSize(6)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text(status, rightCol + 15, y + 25.5, { align: 'center' })

  y += 36

  // ── Items Table ────────────────────────────────────────────────────────
  const items = invoice.invoice_items || []
  const headers = ['#', 'Item Code', 'Description', 'Qty', 'Unit Price', 'Amount']
  const colWidths = [10, 25, 60, 15, 30, 30]

  const rows = items.map((item: any, idx: number) => [
    String(idx + 1),
    item.item_code || '-',
    item.description || 'Item',
    String(item.qty),
    formatCurrency(item.unit_price),
    formatCurrency(item.line_total),
  ])

  y = drawTable(doc, y, headers, rows, colWidths, { alignRight: [3, 4, 5] })

  // ── Totals Section ─────────────────────────────────────────────────────
  y += 5
  const totalsX = pageWidth - 85

  // Totals box
  doc.setFillColor(248, 249, 250)
  doc.roundedRect(totalsX, y, 70, 48, 2, 2, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...BRAND.textDark)

  const totalsData = [
    ['Subtotal', formatCurrency(invoice.subtotal)],
    ['Discount', `(${formatCurrency(invoice.discount)})`],
    ['Tax / VAT', formatCurrency(invoice.tax || invoice.vat_amount)],
    ['Service Charge', formatCurrency(invoice.service_charge)],
    ['Delivery Charge', formatCurrency(invoice.delivery_charge)],
    ['Tips', formatCurrency(invoice.tips)],
  ]

  let ty = y + 6
  totalsData.forEach(([label, value]) => {
    doc.text(label, totalsX + 5, ty)
    doc.text(value, totalsX + 65, ty, { align: 'right' })
    ty += 6
  })

  // Grand total separator
  doc.setDrawColor(...BRAND.primaryColor)
  doc.setLineWidth(0.5)
  doc.line(totalsX + 3, ty - 2, totalsX + 67, ty - 2)

  // Grand total
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BRAND.primaryColor)
  doc.text('GRAND TOTAL', totalsX + 5, ty + 4)
  doc.text(formatCurrency(invoice.grand_total || invoice.total), totalsX + 65, ty + 4, { align: 'right' })

  y = ty + 12

  // ── Notes section ──────────────────────────────────────────────────────
  if (invoice.notes) {
    y += 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRAND.textDark)
    doc.text('Notes:', 15, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...BRAND.textLight)
    doc.text(invoice.notes, 15, y + 5)
    y += 12
  }

  // ── Thank you message ──────────────────────────────────────────────────
  y += 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...BRAND.accentColor)
  doc.text('Thank you for dining with Seven Waves!', pageWidth / 2, y, { align: 'center' })

  // ── Footer ─────────────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawFooter(doc, i, totalPages)
  }

  const pdfOutput = doc.output('arraybuffer')
  const filename = `INV_${invoiceNo.replace(/\s+/g, '_')}_${Date.now()}.pdf`

  return {
    bytes: new Uint8Array(pdfOutput),
    filename,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SALES SUMMARY PDF GENERATOR
// ══════════════════════════════════════════════════════════════════════════════
async function generateSalesSummaryPDF(
  supabase: any,
  dateFrom: string,
  dateTo: string,
  company: any,
): Promise<{ bytes: Uint8Array; filename: string }> {
  console.log(`[report-generator] Generating sales summary: ${dateFrom} → ${dateTo}`)

  // ── Fetch invoices in date range (with streaming-friendly pagination) ──
  const PAGE_SIZE = 500
  let allInvoices: any[] = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data: batch, error } = await supabase
      .from('invoices')
      .select(`
        id, invoice_no, invoice_number, invoice_date, created_at,
        customer_name, subtotal, discount, tax, vat_amount,
        service_charge, tips, delivery_charge, total, grand_total,
        payment_status, payment_type
      `)
      .gte('invoice_date', dateFrom)
      .lte('invoice_date', dateTo)
      .order('invoice_date', { ascending: true })
      .range(from, to)

    if (error) {
      console.error('[report-generator] Error fetching invoices page:', error)
      throw error
    }

    if (batch && batch.length > 0) {
      allInvoices = allInvoices.concat(batch)
      hasMore = batch.length === PAGE_SIZE
    } else {
      hasMore = false
    }

    page++

    // Safety valve: max 50 pages (25,000 invoices)
    if (page > 50) {
      console.warn('[report-generator] Hit pagination safety limit (25,000 invoices)')
      break
    }
  }

  console.log(`[report-generator] Fetched ${allInvoices.length} invoices for sales summary`)

  // ── Also fetch order-level sales data for category breakdown ───────────
  const { data: orderItems, error: oiError } = await supabase
    .from('invoice_items')
    .select(`
      description, qty, unit_price, line_total,
      invoices!inner ( invoice_date )
    `)
    .gte('invoices.invoice_date', dateFrom)
    .lte('invoices.invoice_date', dateTo)

  // ── Build the PDF ──────────────────────────────────────────────────────
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // ── Header ─────────────────────────────────────────────────────────────
  let y = drawHeader(doc, company, 'Sales Statement')

  // ── Report period info ─────────────────────────────────────────────────
  doc.setFillColor(240, 248, 255)
  doc.roundedRect(15, y, pageWidth - 30, 14, 2, 2, 'F')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND.primaryColor)
  doc.text('REPORT PERIOD', 20, y + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...BRAND.textDark)
  doc.text(`From: ${formatDate(dateFrom)}   •   To: ${formatDate(dateTo)}   •   Total Invoices: ${allInvoices.length}`, 20, y + 11)

  y += 20

  // ── Summary KPIs ───────────────────────────────────────────────────────
  const totalRevenue = allInvoices.reduce((s: number, inv: any) =>
    s + Number(inv.grand_total || inv.total || 0), 0)
  const totalDiscount = allInvoices.reduce((s: number, inv: any) =>
    s + Number(inv.discount || 0), 0)
  const totalTax = allInvoices.reduce((s: number, inv: any) =>
    s + Number(inv.tax || inv.vat_amount || 0), 0)
  const totalServiceCharge = allInvoices.reduce((s: number, inv: any) =>
    s + Number(inv.service_charge || 0), 0)
  const totalTips = allInvoices.reduce((s: number, inv: any) =>
    s + Number(inv.tips || 0), 0)
  const paidCount = allInvoices.filter((inv: any) => inv.payment_status === 'paid').length
  const unpaidCount = allInvoices.length - paidCount

  // KPI cards
  const kpiWidth = (pageWidth - 40) / 4
  const kpis = [
    { label: 'Total Revenue', value: formatCurrency(totalRevenue), color: BRAND.primaryColor },
    { label: 'Total Discount', value: formatCurrency(totalDiscount), color: BRAND.warningOrange },
    { label: 'Tax / VAT', value: formatCurrency(totalTax), color: BRAND.accentColor },
    { label: 'Paid / Unpaid', value: `${paidCount} / ${unpaidCount}`, color: BRAND.successGreen },
  ]

  kpis.forEach((kpi, idx) => {
    const kx = 15 + idx * (kpiWidth + 4)
    doc.setFillColor(...kpi.color)
    doc.roundedRect(kx, y, kpiWidth, 18, 2, 2, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(kpi.label, kx + kpiWidth / 2, y + 6, { align: 'center' })

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(kpi.value, kx + kpiWidth / 2, y + 14, { align: 'center' })
  })

  y += 26

  // ── Detailed Invoice Table ─────────────────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND.textDark)
  doc.text('Invoice Details', 15, y)
  y += 4

  const headers = ['#', 'Invoice No', 'Date', 'Customer', 'Status', 'Total']
  const colWidths = [10, 30, 25, 50, 25, 30]

  const rows = allInvoices.map((inv: any, idx: number) => [
    String(idx + 1),
    inv.invoice_no || `INV-${String(inv.invoice_number).padStart(5, '0')}`,
    formatDate(inv.invoice_date || inv.created_at),
    inv.customer_name || 'Walk-in',
    (inv.payment_status || 'unpaid').toUpperCase(),
    formatCurrency(inv.grand_total || inv.total),
  ])

  y = drawTable(doc, y, headers, rows, colWidths, { alignRight: [5] })

  // ── Totals row ─────────────────────────────────────────────────────────
  y += 3
  doc.setFillColor(...BRAND.secondaryColor)
  doc.roundedRect(15, y, pageWidth - 30, 10, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('GRAND TOTAL', 20, y + 7)
  doc.text(formatCurrency(totalRevenue), pageWidth - 20, y + 7, { align: 'right' })

  y += 16

  // ── Breakdown section (additional totals) ──────────────────────────────
  if (y + 40 > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage()
    y = 20
  }

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND.textDark)
  doc.text('Financial Breakdown', 15, y)
  y += 4

  const breakdownHeaders = ['Category', 'Amount']
  const breakdownWidths = [100, 70]
  const breakdownRows = [
    ['Subtotal (before tax/discount)', formatCurrency(allInvoices.reduce((s: number, inv: any) => s + Number(inv.subtotal || 0), 0))],
    ['Total Discounts', formatCurrency(totalDiscount)],
    ['Total Tax / VAT', formatCurrency(totalTax)],
    ['Total Service Charges', formatCurrency(totalServiceCharge)],
    ['Total Tips', formatCurrency(totalTips)],
    ['Total Delivery Charges', formatCurrency(allInvoices.reduce((s: number, inv: any) => s + Number(inv.delivery_charge || 0), 0))],
    ['Net Revenue', formatCurrency(totalRevenue)],
  ]

  y = drawTable(doc, y, breakdownHeaders, breakdownRows, breakdownWidths, { alignRight: [1] })

  // ── Payment method breakdown ───────────────────────────────────────────
  y += 10
  if (y + 30 > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage()
    y = 20
  }

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND.textDark)
  doc.text('Payment Method Breakdown', 15, y)
  y += 4

  const paymentGroups: Record<string, { count: number; total: number }> = {}
  allInvoices.forEach((inv: any) => {
    const method = (inv.payment_type || 'cash').toUpperCase()
    if (!paymentGroups[method]) {
      paymentGroups[method] = { count: 0, total: 0 }
    }
    paymentGroups[method].count++
    paymentGroups[method].total += Number(inv.grand_total || inv.total || 0)
  })

  const payHeaders = ['Payment Method', 'Count', 'Total']
  const payWidths = [80, 40, 50]
  const payRows = Object.entries(paymentGroups).map(([method, data]) => [
    method,
    String(data.count),
    formatCurrency(data.total),
  ])

  if (payRows.length > 0) {
    y = drawTable(doc, y, payHeaders, payRows, payWidths, { alignRight: [1, 2] })
  }

  // ── Footer on all pages ────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawFooter(doc, i, totalPages)
  }

  const pdfOutput = doc.output('arraybuffer')
  const filename = `Sales_Statement_${dateFrom}_to_${dateTo}_${Date.now()}.pdf`

  return {
    bytes: new Uint8Array(pdfOutput),
    filename,
  }
}
