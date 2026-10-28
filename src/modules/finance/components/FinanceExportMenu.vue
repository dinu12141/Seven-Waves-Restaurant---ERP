<template>
  <q-btn-dropdown
    outline
    no-caps
    dense
    color="primary"
    icon="file_download"
    label="Export"
    class="fin-export-menu"
    :disable="!rows || !rows.length"
  >
    <q-list dense style="min-width: 170px">
      <q-item clickable v-close-popup @click="toExcel">
        <q-item-section avatar><q-icon name="table_view" color="positive" /></q-item-section>
        <q-item-section>Excel (.xlsx)</q-item-section>
      </q-item>
      <q-item clickable v-close-popup @click="toPdf">
        <q-item-section avatar><q-icon name="picture_as_pdf" color="negative" /></q-item-section>
        <q-item-section>PDF</q-item-section>
      </q-item>
      <q-item clickable v-close-popup @click="toPrint">
        <q-item-section avatar><q-icon name="print" color="grey-7" /></q-item-section>
        <q-item-section>Print</q-item-section>
      </q-item>
    </q-list>
  </q-btn-dropdown>
</template>

<script setup>
/**
 * Standard Finance export dropdown (Excel / PDF / Print) for a q-table's
 * columns + rows. Columns named 'actions' are skipped; PDF/Print use each
 * column's `format`, Excel keeps raw numbers so totals can be summed.
 */
import { useQuasar } from 'quasar'
import { exportTableToExcel, exportTableToPDF, printTableAsPDF } from 'src/services/exportService'

const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  filename: { type: String, default: '' },
})

const $q = useQuasar()
const exportable = () => props.columns.filter((c) => c.name !== 'actions')
const fileBase = () => (props.filename || props.title).replace(/[^\w-]+/g, '_')

async function run(fn, okMsg) {
  try {
    await fn()
    if (okMsg) $q.notify({ type: 'positive', message: okMsg, timeout: 1500 })
  } catch (e) {
    $q.notify({ type: 'negative', message: `Export failed: ${e?.message || e}` })
  }
}
const toExcel = () => run(() => exportTableToExcel(exportable(), props.rows, fileBase()), 'Excel exported')
const toPdf = () => run(() => exportTableToPDF(exportable(), props.rows, props.title, props.subtitle), 'PDF exported')
const toPrint = () => run(() => printTableAsPDF(exportable(), props.rows, props.title, props.subtitle))
</script>
