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
  return new Date(dateStr).toLocaleString('en-US', {
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
<title>KOT #${ticket.kot_number ?? ticket.id.slice(0, 6)}</title>
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

  <!-- KOT Number -->
  <div class="kot-number-block">
    <div class="kot-label">KOT</div>
    <div class="kot-number">#${ticket.kot_number ?? '—'}</div>
  </div>

  <!-- Meta Info -->
  <div class="meta-grid">
    <div class="meta-item">
      <div class="meta-label">Order</div>
      <div class="meta-value">#${ticket.order?.order_number ?? '—'}</div>
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
