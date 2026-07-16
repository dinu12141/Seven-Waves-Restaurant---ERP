/**
 * Print Service
 *
 * Centralised service for all printing operations.
 *
 * Current mode: Browser preview + window.print()
 * Future mode:  ESC/POS via local print-agent (HTTP bridge on localhost:6001)
 *
 * Usage:
 *   import { printService } from 'src/services/printService'
 *   const result = await printService.printKot(kotId)
 */

import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

/** A fully resolved KOT ticket ready to render */
export interface KotTicket {
  id: string
  kot_number: number | null
  status: string
  printed_at: string | null
  created_at: string
  order: {
    order_number: string | number
    order_type: string | null
    notes: string | null
    table: { table_number: string | number } | null
  } | null
  kitchen: { name: string } | null
  items: {
    name: string
    qty: number
    notes: string
  }[]
  branch?: { name: string; address?: string | null; phone?: string | null } | null
}

export interface PrintResult {
  success: boolean
  error?: string
  isReprint?: boolean
}

// ─── Internal: Fetch Helpers ──────────────────────────────────────────────────

async function fetchKotFull(kotId: string): Promise<KotTicket | null> {
  const { data, error } = await supabase
    .from('kot_tickets')
    .select(
      `
      id,
      kot_number,
      status,
      printed_at,
      created_at,
      order:orders (
        order_number,
        order_type,
        notes,
        table:restaurant_tables ( table_number )
      ),
      kitchen:kitchens (
        name,
        branch:branches ( name, address, phone )
      ),
      kot_items (
        quantity,
        notes,
        order_item:order_items (
          menu_item:menu_items ( name )
        )
      )
    `,
    )
    .eq('id', kotId)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    kot_number: data.kot_number,
    status: data.status,
    printed_at: data.printed_at,
    created_at: data.created_at,
    order: data.order as any,
    kitchen: data.kitchen as any,
    branch: (data.kitchen as any)?.branch ?? null,
    items: ((data.kot_items as any[]) ?? []).map((ki) => ({
      name: ki.order_item?.menu_item?.name ?? 'Unknown Item',
      qty: ki.quantity,
      notes: ki.notes ?? '',
    })),
  }
}

async function logPrint(kotId: string, printerId?: string): Promise<boolean> {
  const auth = useAuthStore()
  const userId = auth.user?.id
  const { error } = await supabase.from('kot_print_logs').insert({
    kot_id: kotId,
    printed_by: userId ?? null,
    printer_id: printerId ?? null,
  })
  return !error
}

async function markPrintedAt(kotId: string): Promise<void> {
  await supabase
    .from('kot_tickets')
    .update({ printed_at: new Date().toISOString() })
    .eq('id', kotId)
    .is('printed_at', null) // first print only
}

// ─── KOT HTML Generator ───────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function buildKotHtml(ticket: KotTicket, isReprint: boolean): string {
  const orderType = ticket.order?.order_type
    ? ticket.order.order_type
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('-')
    : 'Dine-in'

  const tableLabel =
    ticket.order?.table?.table_number != null
      ? `Table ${ticket.order.table.table_number}`
      : 'Takeaway'

  const itemRows = ticket.items
    .map(
      (item) => `
    <tr>
      <td class="qty">${item.qty}x</td>
      <td class="item-name">
        ${item.name}
        ${item.notes ? `<div class="item-note">⚑ ${item.notes}</div>` : ''}
      </td>
    </tr>
  `,
    )
    .join('')

  const reprintBadge = isReprint ? `<div class="reprint-badge">★ REPRINT ★</div>` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Order #${ticket.order?.order_number ?? ticket.kot_number ?? ticket.id.slice(0, 6)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 14px;
    color: #000;
    background: #fff;
    width: 80mm;
    margin: 0 auto;
    padding: 8px;
  }

  /* ── Screen Preview Wrapper ── */
  .preview-wrapper {
    max-width: 340px;
    background: #fff;
    margin: 0 auto;
    padding: 12px;
    border: 1px dashed #ccc;
    border-radius: 4px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }

  /* ── Header ── */
  .header { text-align: center; margin-bottom: 10px; }
  .kitchen-name {
    font-size: 18px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 2px;
    border-bottom: 3px solid #000;
    padding-bottom: 6px;
    margin-bottom: 6px;
  }
  .branch-info { font-size: 11px; color: #555; }

  /* ── KOT Number ── */
  .kot-number-block {
    text-align: center;
    border: 2px solid #000;
    border-radius: 4px;
    padding: 6px 0;
    margin: 10px 0;
  }
  .kot-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
  .kot-number { font-size: 32px; font-weight: 900; letter-spacing: -1px; line-height: 1.1; }

  /* ── Reprint ── */
  .reprint-badge {
    text-align: center;
    background: #000;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    padding: 3px;
    letter-spacing: 2px;
    margin-bottom: 8px;
  }

  /* ── Meta Info ── */
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-bottom: 10px;
    font-size: 12px;
  }
  .meta-item { }
  .meta-label { font-size: 10px; text-transform: uppercase; color: #888; }
  .meta-value { font-weight: 700; }

  /* ── Divider ── */
  .divider {
    border: none;
    border-top: 1px dashed #000;
    margin: 8px 0;
  }
  .divider-thick {
    border-top: 2px solid #000;
    margin: 8px 0;
  }

  /* ── Items ── */
  .items-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #555;
    margin-bottom: 6px;
  }
  .items-table { width: 100%; border-collapse: collapse; }
  .items-table .qty {
    width: 28px;
    font-weight: 900;
    font-size: 15px;
    vertical-align: top;
    padding-right: 6px;
    color: #000;
  }
  .items-table .item-name {
    font-size: 14px;
    font-weight: 700;
    padding: 4px 0;
    border-bottom: 1px dotted #ddd;
    vertical-align: top;
  }
  .items-table tr:last-child .item-name { border-bottom: none; }
  .item-note {
    font-size: 11px;
    font-weight: 400;
    font-style: italic;
    color: #555;
    margin-top: 2px;
  }

  /* ── Order Notes ── */
  .order-notes {
    background: #f5f5f5;
    border-left: 3px solid #000;
    padding: 5px 8px;
    font-size: 11px;
    margin-top: 8px;
  }
  .order-notes-label { font-weight: 700; text-transform: uppercase; font-size: 10px; }

  /* ── Footer ── */
  .footer {
    text-align: center;
    margin-top: 12px;
    font-size: 10px;
    color: #888;
    border-top: 1px dashed #aaa;
    padding-top: 6px;
  }

  /* ── Print Media ── */
  @media print {
    body { width: 80mm; padding: 0; }
    .preview-wrapper { border: none; box-shadow: none; padding: 0; max-width: 80mm; }
    .no-print { display: none !important; }
    @page {
      size: 80mm auto;
      margin: 4mm;
    }
  }
</style>
</head>
<body>
<div class="preview-wrapper">
  <!-- Header -->
  <div class="header">
    <div class="kitchen-name">${ticket.kitchen?.name ?? 'Kitchen'}</div>
    ${ticket.branch?.name ? `<div class="branch-info">${ticket.branch.name}</div>` : ''}
    ${ticket.branch?.address ? `<div class="branch-info">${ticket.branch.address}</div>` : ''}
  </div>

  ${reprintBadge}

  <!-- Order Number (Prominent for Waiters/Cashiers) -->
  <div class="kot-number-block">
    <div class="kot-label">ORDER</div>
    <div class="kot-number">#${ticket.order?.order_number ?? ticket.kot_number ?? '—'}</div>
  </div>

  <!-- Meta Info -->
  <div class="meta-grid">
    <div class="meta-item">
      <div class="meta-label">KOT</div>
      <div class="meta-value">#${ticket.kot_number ?? '—'}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Type</div>
      <div class="meta-value">${orderType}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Table</div>
      <div class="meta-value">${tableLabel}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Time</div>
      <div class="meta-value">${formatTime(ticket.created_at)}</div>
    </div>
  </div>

  <hr class="divider-thick" />

  <!-- Items -->
  <div class="items-title">Items</div>
  <table class="items-table">
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  ${
    ticket.order?.notes
      ? `<div class="order-notes">
    <div class="order-notes-label">Order Notes</div>
    ${ticket.order.notes}
  </div>`
      : ''
  }

  <hr class="divider" />

  <!-- Footer -->
  <div class="footer">
    Printed: ${formatDateTime(new Date().toISOString())}
  </div>
</div>

<!-- Print trigger (auto-print) -->
<script>
  window.onload = function() {
    // Give preview a moment to render before print dialog
    setTimeout(() => window.print(), 300)
  }
<\/script>
</body>
</html>`
}

// ─── Print via browser popup window ──────────────────────────────────────────

function openPrintWindow(html: string): void {
  const win = window.open('', '_blank', 'width=400,height=700,toolbar=0,menubar=0,scrollbars=1')
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to print KOT tickets.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

// ─── Shift Receipt Helpers ───────────────────────────────────────────────────

function buildReceiptBaseHtml(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 13px;
    color: #000;
    background: #fff;
    width: 80mm;
    margin: 0 auto;
    padding: 8px;
  }
  .receipt-wrapper {
    max-width: 290px;
    margin: 0 auto;
  }
  .header { text-align: center; margin-bottom: 8px; }
  .title { font-size: 15px; font-weight: bold; text-transform: uppercase; margin-top: 4px; }
  .subtitle { font-size: 11px; margin-bottom: 4px; }
  .divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .double-divider { border: none; border-top: 1px double #000; border-bottom: 1px double #000; height: 3px; margin: 6px 0; }
  .info-row { display: flex; justify-content: space-between; font-size: 12px; margin: 4px 0; }
  .info-label { font-weight: normal; }
  .info-val { font-weight: bold; text-align: right; }
  .total-row { font-weight: bold; font-size: 13px; margin-top: 6px; }
  .sig-section { margin-top: 35px; display: flex; justify-content: space-between; font-size: 10px; }
  .sig-line { border-top: 1px solid #000; width: 45%; text-align: center; padding-top: 4px; margin-top: 25px; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  @media print {
    body { width: 80mm; padding: 0; }
    .receipt-wrapper { max-width: 80mm; }
    @page { size: 80mm auto; margin: 4mm; }
  }
</style>
</head>
<body>
<div class="receipt-wrapper">
  <div class="header">
    <div style="font-size: 16px; font-weight: 900; text-transform: uppercase;">SEVEN WAVES</div>
    <div class="subtitle">Restaurant & Lounge</div>
    <div class="title">${title}</div>
  </div>
  <hr class="divider" />
  ${bodyContent}
  <hr class="divider" />
  <div class="footer" style="text-align: center; font-size: 9px; color: #555; margin-top: 10px;">
    Printed: ${new Date().toLocaleString('en-LK', { hour12: true })}
  </div>
</div>
<script>
  window.onload = function() {
    setTimeout(() => {
      window.print();
      setTimeout(() => window.close(), 500);
    }, 300);
  }
<\/script>
</body>
</html>`
}

function buildShiftOpenBody(shift: any): string {
  return `
    <div class="info-row">
      <span class="info-label">Shift ID:</span>
      <span class="info-val">${(shift.id || '').slice(0, 8).toUpperCase()}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Branch:</span>
      <span class="info-val">${shift.branch_name || 'Main Branch'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Terminal:</span>
      <span class="info-val">${shift.terminal_id}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Cashier:</span>
      <span class="info-val">${shift.cashier_name}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Open Time:</span>
      <span class="info-val">${new Date(shift.opened_at).toLocaleString('en-LK', { hour12: true })}</span>
    </div>
    <hr class="divider" />
    <div class="info-row total-row">
      <span class="info-label">OPENING FLOAT:</span>
      <span class="info-val">LKR ${parseFloat(shift.opening_cash_float || 0).toFixed(2)}</span>
    </div>
    ${shift.opening_note ? `
    <div style="margin-top: 10px; font-size: 11px; font-style: italic; word-break: break-word;">
      <strong>Note:</strong> ${shift.opening_note}
    </div>` : ''}
    <div class="sig-section">
      <div class="sig-line">Cashier Signature</div>
      <div class="sig-line">Manager Signature</div>
    </div>
  `
}

function buildCashMovementBody(movement: any): string {
  const typeLabels: Record<string, string> = {
    cash_drop: 'CASH DROP SLIP',
    cash_in: 'CASH IN SLIP',
    cash_out: 'CASH OUT SLIP'
  }
  const label = typeLabels[movement.type] || 'CASH MOVEMENT'
  
  return `
    <div class="info-row">
      <span class="info-label">Trans ID:</span>
      <span class="info-val">${(movement.id || '').slice(0, 8).toUpperCase()}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Shift ID:</span>
      <span class="info-val">${(movement.shift_id || '').slice(0, 8).toUpperCase()}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Terminal:</span>
      <span class="info-val">${movement.terminal_id}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Cashier:</span>
      <span class="info-val">${movement.cashier_name}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Timestamp:</span>
      <span class="info-val">${new Date(movement.created_at).toLocaleString('en-LK', { hour12: true })}</span>
    </div>
    <hr class="divider" />
    <div class="info-row total-row">
      <span class="info-label">AMOUNT:</span>
      <span class="info-val">LKR ${parseFloat(movement.amount || 0).toFixed(2)}</span>
    </div>
    ${movement.reason ? `
    <div style="margin-top: 10px; font-size: 11px; font-style: italic; word-break: break-word;">
      <strong>Reason:</strong> ${movement.reason}
    </div>` : ''}
    <div class="sig-section">
      <div class="sig-line">Cashier Signature</div>
      <div class="sig-line">Receiver/Mgr Sig</div>
    </div>
  `
}

function buildShiftSummaryBody(shift: any, isClose: boolean = false): string {
  const totalSales = (shift.cash_sales_total || 0)
    + (shift.card_sales_total || 0)
    + (shift.qr_sales_total || 0)
    + (shift.bank_sales_total || 0)
    + (shift.credit_sales_total || 0)
    
  const expectedCash = (shift.opening_cash_float || 0)
    + (shift.cash_sales_total || 0)
    - (shift.cash_drops_total || 0)
    + (shift.cash_in_total || 0)
    - (shift.cash_out_total || 0)

  let varianceContent = ''
  if (isClose) {
    const v = shift.variance || 0
    const varLabel = v === 0 ? 'BALANCED' : v < 0 ? 'SHORTAGE' : 'OVERAGE'
    const varClass = v === 0 ? 'color: green;' : 'color: red;'
    varianceContent = `
      <hr class="divider" />
      <div class="info-row">
        <span class="info-label">Counted Cash:</span>
        <span class="info-val">LKR ${parseFloat(shift.counted_cash || 0).toFixed(2)}</span>
      </div>
      <div class="info-row total-row">
        <span class="info-label">VARIANCE (${varLabel}):</span>
        <span class="info-val" style="${varClass}">LKR ${v > 0 ? '+' : ''}${parseFloat(v).toFixed(2)}</span>
      </div>
    `
  }

  return `
    <div class="info-row">
      <span class="info-label">Shift ID:</span>
      <span class="info-val">${(shift.id || '').slice(0, 8).toUpperCase()}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Terminal:</span>
      <span class="info-val">${shift.terminal_id}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Cashier:</span>
      <span class="info-val">${shift.cashier_name}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Opened:</span>
      <span class="info-val">${new Date(shift.opened_at).toLocaleString('en-LK', { hour12: true })}</span>
    </div>
    ${shift.closed_at ? `
    <div class="info-row">
      <span class="info-label">Closed:</span>
      <span class="info-val">${new Date(shift.closed_at).toLocaleString('en-LK', { hour12: true })}</span>
    </div>` : ''}
    
    <div class="double-divider"></div>
    <div class="text-center" style="font-weight: bold; margin-bottom: 4px;">SALES BREAKDOWN</div>
    <div class="info-row">
      <span class="info-label">Cash Sales:</span>
      <span class="info-val">${parseFloat(shift.cash_sales_total || 0).toFixed(2)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Card Sales:</span>
      <span class="info-val">${parseFloat(shift.card_sales_total || 0).toFixed(2)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">QR Sales:</span>
      <span class="info-val">${parseFloat(shift.qr_sales_total || 0).toFixed(2)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Bank Transfer:</span>
      <span class="info-val">${parseFloat(shift.bank_sales_total || 0).toFixed(2)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Credit Sales:</span>
      <span class="info-val">${parseFloat(shift.credit_sales_total || 0).toFixed(2)}</span>
    </div>
    <div class="info-row total-row">
      <span class="info-label">TOTAL SALES:</span>
      <span class="info-val">LKR ${totalSales.toFixed(2)}</span>
    </div>

    <div class="double-divider"></div>
    <div class="text-center" style="font-weight: bold; margin-bottom: 4px;">CASH RECONCILIATION</div>
    <div class="info-row">
      <span class="info-label">Opening Float:</span>
      <span class="info-val">${parseFloat(shift.opening_cash_float || 0).toFixed(2)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">(+) Cash Sales:</span>
      <span class="info-val">${parseFloat(shift.cash_sales_total || 0).toFixed(2)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">(-) Cash Drops:</span>
      <span class="info-val">${parseFloat(shift.cash_drops_total || 0).toFixed(2)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">(+) Cash In:</span>
      <span class="info-val">${parseFloat(shift.cash_in_total || 0).toFixed(2)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">(-) Cash Out:</span>
      <span class="info-val">${parseFloat(shift.cash_out_total || 0).toFixed(2)}</span>
    </div>
    <div class="info-row total-row">
      <span class="info-label">EXPECTED CASH:</span>
      <span class="info-val">LKR ${expectedCash.toFixed(2)}</span>
    </div>
    
    ${varianceContent}

    ${shift.closing_note ? `
    <div style="margin-top: 10px; font-size: 11px; font-style: italic; word-break: break-word;">
      <strong>Note:</strong> ${shift.closing_note}
    </div>` : ''}

    <div class="sig-section">
      <div class="sig-line">Cashier Signature</div>
      <div class="sig-line">Manager Signature</div>
    </div>
  `
}

// ─── Preview in a dialog (no auto-print) ─────────────────────────────────────

function buildPreviewUrl(ticket: KotTicket, isReprint: boolean): string {
  const html = buildKotHtml(ticket, isReprint)
  const blob = new Blob([html], { type: 'text/html' })
  return URL.createObjectURL(blob)
}

// ─── Public Service API ───────────────────────────────────────────────────────

export const printService = {
  /**
   * Full print flow for a KOT ticket:
   * 1. Fetch ticket data from Supabase
   * 2. Log to kot_print_logs
   * 3. Update printed_at (if first print)
   * 4. Open browser print window
   */
  async printKot(
    kotId: string,
    options?: { printerId?: string; previewOnly?: boolean },
  ): Promise<PrintResult> {
    try {
      const ticket = await fetchKotFull(kotId)
      if (!ticket) return { success: false, error: 'KOT ticket not found' }

      const isReprint = !!ticket.printed_at

      // Log print event
      await logPrint(kotId, options?.printerId)
      // Mark first-print timestamp
      await markPrintedAt(kotId)

      const html = buildKotHtml(ticket, isReprint)

      if (options?.previewOnly) {
        // Return HTML for embedding in a Vue dialog iframe
        return { success: true, isReprint, error: undefined }
      }

      // Open OS print dialog in a new window
      openPrintWindow(html)

      return { success: true, isReprint }
    } catch (e: any) {
      console.error('[PrintService] printKot error:', e)
      return { success: false, error: e?.message ?? 'Unknown error' }
    }
  },

  /**
   * Get a preview-ready HTML string for a KOT (for embedding in a <iframe>).
   * Does NOT log a print event.
   */
  async getKotPreviewHtml(kotId: string): Promise<string | null> {
    const ticket = await fetchKotFull(kotId)
    if (!ticket) return null
    const isReprint = !!ticket.printed_at
    return buildKotHtml(ticket, isReprint)
  },

  /**
   * Directly print from an already-fetched ticket object (no re-fetch needed).
   * Useful when the KDS page already has the ticket data loaded.
   */
  async printKotFromData(
    ticket: KotTicket,
    options?: { printerId?: string },
  ): Promise<PrintResult> {
    try {
      const isReprint = !!ticket.printed_at
      await logPrint(ticket.id, options?.printerId)
      await markPrintedAt(ticket.id)
      const html = buildKotHtml(ticket, isReprint)
      openPrintWindow(html)
      return { success: true, isReprint }
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Unknown error' }
    }
  },

  /**
   * Print Shift Open Slip
   */
  printShiftOpen(shift: any): void {
    const body = buildShiftOpenBody(shift)
    const html = buildReceiptBaseHtml('Shift Open Ticket', body)
    openPrintWindow(html)
  },

  /**
   * Print Cash Movement Slip (Drop / In / Out)
   */
  printCashMovement(movement: any): void {
    const body = buildCashMovementBody(movement)
    const html = buildReceiptBaseHtml(movement.type.replace('_', ' ') + ' Slip', body)
    openPrintWindow(html)
  },

  /**
   * Print Shift Summary (Mid-Shift / Live)
   */
  printShiftSummary(shift: any): void {
    const body = buildShiftSummaryBody(shift, false)
    const html = buildReceiptBaseHtml('Mid-Shift Summary', body)
    openPrintWindow(html)
  },

  /**
   * Print Shift Close Summary (Final)
   */
  printShiftClose(shift: any): void {
    const body = buildShiftSummaryBody(shift, true)
    const html = buildReceiptBaseHtml('Shift Close Report', body)
    openPrintWindow(html)
  },

  /**
   * Get list of active printers for a branch (for printer picker UI).
   */
  async getPrintersForBranch(branchId: string) {
    const { data } = await supabase
      .from('printers')
      .select('id, name, type, is_default')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
    return data ?? []
  },
}
