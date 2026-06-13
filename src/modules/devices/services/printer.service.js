// ═══════════════════════════════════════════════════════════════════
// Printer Service — Printer management, print jobs, queue control
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { api } from 'src/core/api/ApiClient'

const MODULE = 'devices.printer'

// ─── PRINTERS ───────────────────────────────────────────────────────
export async function fetchPrinters(branchId) {
  return api.query(
    (c) => c.from('device_printers')
      .select('*, devices!inner(branch_id, device_name, status)')
      .eq('devices.branch_id', branchId)
      .order('printer_name'),
    { module: MODULE, action: 'fetchPrinters' }
  )
}

export async function createPrinter(printer) {
  return api.query(
    (c) => c.from('device_printers').insert(printer).select().single(),
    { module: MODULE, action: 'createPrinter', retries: 0 }
  )
}

export async function updatePrinter(id, updates) {
  return api.query(
    (c) => c.from('device_printers').update(updates).eq('id', id).select().single(),
    { module: MODULE, action: 'updatePrinter', retries: 0 }
  )
}

export async function deletePrinter(id) {
  return api.query(
    (c) => c.from('device_printers').delete().eq('id', id),
    { module: MODULE, action: 'deletePrinter', retries: 0 }
  )
}

// ─── PRINT JOBS ─────────────────────────────────────────────────────
export async function fetchPrintJobs(branchId, status = null) {
  let query = (c) => {
    let q = c.from('print_jobs')
      .select('*, device_printers(printer_name, printer_type)')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (status) q = q.eq('status', status)
    return q
  }
  return api.query(query, { module: MODULE, action: 'fetchPrintJobs' })
}

export async function createPrintJob(job) {
  return api.query(
    (c) => c.from('print_jobs').insert(job).select().single(),
    { module: MODULE, action: 'createPrintJob', retries: 0 }
  )
}

export async function updatePrintJobStatus(id, status, errorMessage = null) {
  const updates = {
    status,
    ...(status === 'printed' ? { printed_at: new Date().toISOString() } : {}),
    ...(errorMessage ? { error_message: errorMessage } : {}),
    ...(status === 'failed' ? {} : { error_message: null }),
  }
  return api.query(
    (c) => c.from('print_jobs').update(updates).eq('id', id).select().single(),
    { module: MODULE, action: 'updatePrintJobStatus', retries: 0 }
  )
}

export async function retryPrintJob(id) {
  return api.query(
    (c) => c.from('print_jobs')
      .update({ status: 'queued', error_message: null, retry_count: 0 })
      .eq('id', id)
      .in('status', ['failed', 'cancelled'])
      .select()
      .single(),
    { module: MODULE, action: 'retryPrintJob', retries: 0 }
  )
}

export async function cancelPrintJob(id) {
  return api.query(
    (c) => c.from('print_jobs')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .in('status', ['queued', 'failed'])
      .select()
      .single(),
    { module: MODULE, action: 'cancelPrintJob', retries: 0 }
  )
}
