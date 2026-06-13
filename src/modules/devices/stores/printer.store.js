// ═══════════════════════════════════════════════════════════════════
// Printer Store — Print queue state management
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchPrinters, createPrinter, updatePrinter, deletePrinter,
  fetchPrintJobs, createPrintJob, updatePrintJobStatus, retryPrintJob, cancelPrintJob
} from '../services/printer.service'

export const usePrinterStore = defineStore('printers', () => {
  const printers = ref([])
  const printJobs = ref([])
  const loading = ref(false)

  // ─── Computed ─────────────────────────────────────────────────────
  const defaultPrinter = computed(() => printers.value.find(p => p.is_default))
  const receiptPrinters = computed(() => printers.value.filter(p => p.printer_type === 'receipt'))
  const kitchenPrinters = computed(() => printers.value.filter(p => p.printer_type === 'kitchen'))
  const queuedJobs = computed(() => printJobs.value.filter(j => j.status === 'queued'))
  const failedJobs = computed(() => printJobs.value.filter(j => j.status === 'failed'))
  const activeJobCount = computed(() => printJobs.value.filter(j => ['queued', 'printing'].includes(j.status)).length)

  // ─── Actions ──────────────────────────────────────────────────────
  async function loadPrinters(branchId) {
    loading.value = true
    try {
      const result = await fetchPrinters(branchId)
      if (result.data) printers.value = result.data
    } finally {
      loading.value = false
    }
  }

  async function addPrinter(printer) {
    const result = await createPrinter(printer)
    if (result.data) printers.value.push(result.data)
    return result
  }

  async function editPrinter(id, updates) {
    const result = await updatePrinter(id, updates)
    if (result.data) {
      const idx = printers.value.findIndex(p => p.id === id)
      if (idx !== -1) printers.value[idx] = result.data
    }
    return result
  }

  async function removePrinter(id) {
    const result = await deletePrinter(id)
    if (!result.error) printers.value = printers.value.filter(p => p.id !== id)
    return result
  }

  async function loadPrintJobs(branchId, status = null) {
    const result = await fetchPrintJobs(branchId, status)
    if (result.data) printJobs.value = result.data
  }

  async function submitPrintJob(job) {
    const result = await createPrintJob(job)
    if (result.data) printJobs.value.unshift(result.data)
    return result
  }

  async function markJobStatus(id, status, errorMsg = null) {
    const result = await updatePrintJobStatus(id, status, errorMsg)
    if (result.data) {
      const idx = printJobs.value.findIndex(j => j.id === id)
      if (idx !== -1) printJobs.value[idx] = result.data
    }
    return result
  }

  async function retry(id) {
    const result = await retryPrintJob(id)
    if (result.data) {
      const idx = printJobs.value.findIndex(j => j.id === id)
      if (idx !== -1) printJobs.value[idx] = result.data
    }
    return result
  }

  async function cancel(id) {
    const result = await cancelPrintJob(id)
    if (result.data) {
      const idx = printJobs.value.findIndex(j => j.id === id)
      if (idx !== -1) printJobs.value[idx] = result.data
    }
    return result
  }

  return {
    printers, printJobs, loading,
    defaultPrinter, receiptPrinters, kitchenPrinters,
    queuedJobs, failedJobs, activeJobCount,
    loadPrinters, addPrinter, editPrinter, removePrinter,
    loadPrintJobs, submitPrintJob, markJobStatus, retry, cancel,
  }
})
