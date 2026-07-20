<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Accounts Payable"
      breadcrumbs="Finance / Receivables & Payables / AP"
      showRefresh
      @refresh="loadData"
    >
      <template #actions>
        <q-select
          v-model="selectedBank"
          :options="bankOptions"
          label="Filter by Bank"
          outlined
          dense
          dark
          color="primary"
          style="min-width: 200px"
          emit-value
          map-options
          class="q-mr-sm"
        />
        <q-btn
          unelevated
          icon="picture_as_pdf"
          color="red-6"
          label="PDF"
          @click="exportBankPDF"
          class="q-mr-sm"
        />
        <q-btn
          unelevated
          icon="table_chart"
          color="green-6"
          label="Excel"
          @click="exportBankXLSX"
        />
      </template>
    </ERPToolbar>

    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="(bucket, i) in agingBuckets" :key="i" class="col-12 col-sm-6 col-md">
        <div :class="['fin-kpi-card', bucket.colorClass]">
          <div class="fin-kpi-card__icon">
            <q-icon name="schedule" size="18px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">{{ bucket.label }}</div>
            <div class="fin-kpi-card__value">{{ fmt(bucket.total) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">AP Ledger Entries ({{ filteredPayables.length }})</span>
      </div>
      <q-table
        :rows="filteredPayables"
        :columns="columns"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[20, 50]"
        :pagination="{ sortBy: 'doc_date', descending: true, rowsPerPage: 20 }"
        class="fin-table"
        :loading="loading"
        no-data-label="No payable entries"
      >
        <template #body-cell-supplier="props">
          <q-td :props="props">
            <div>{{ props.row.supplier_name }}</div>
            <div class="text-caption text-grey-5" v-if="props.row.bank_name">
              {{ props.row.bank_name }} - {{ props.row.bank_account_number || 'N/A' }}
            </div>
          </q-td>
        </template>
        <template #body-cell-aging_bucket="props">
          <q-td :props="props">
            <span :class="bucketClass(props.row.aging_bucket)">{{ props.row.aging_bucket }}</span>
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchPayableAging } from 'src/services/financeService'
import { useQuasar } from 'quasar'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const loading = ref(false)
const payables = ref([])
const companyBankAccounts = ref([])

const selectedBank = ref('All Banks')
const bankOptions = ['All Banks', 'BOC', 'HNB', 'Commercial Bank', 'Sampath Bank']

const filteredPayables = computed(() => {
  let list = payables.value
  if (selectedBank.value !== 'All Banks') {
    list = list.filter((p) => {
      const bName = p.bank_name || ''
      return (
        bName.toLowerCase().includes(selectedBank.value.toLowerCase()) ||
        selectedBank.value.toLowerCase().includes(bName.toLowerCase())
      )
    })
  }
  // Sort newest first
  return [...list].sort((a, b) => {
    const da = a.doc_date || ''
    const db = b.doc_date || ''
    return db.localeCompare(da)
  })
})

const agingBuckets = computed(() => {
  const buckets = { current: 0, '1-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 }
  filteredPayables.value.forEach((p) => {
    if (buckets[p.aging_bucket] !== undefined) buckets[p.aging_bucket] += Number(p.debit || 0)
  })
  return [
    { label: 'Current', total: buckets.current, colorClass: 'fin-kpi-card--green' },
    { label: '1-30 Days', total: buckets['1-30 days'], colorClass: 'fin-kpi-card--amber' },
    { label: '31-60 Days', total: buckets['31-60 days'], colorClass: 'fin-kpi-card--red' },
    { label: '61-90 Days', total: buckets['61-90 days'], colorClass: 'fin-kpi-card--purple' },
    { label: '90+ Days', total: buckets['90+ days'], colorClass: 'fin-kpi-card--red' },
  ]
})

const columns = [
  { name: 'supplier', label: 'Supplier & Bank', field: 'supplier_name', align: 'left' },
  { name: 'entry_type', label: 'Entry Type', field: 'entry_type', align: 'left' },
  { name: 'doc_number', label: 'Doc #', field: 'doc_number', align: 'left' },
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'debit', label: 'Debit', field: 'debit', align: 'right', format: (v) => fmt(v) },
  { name: 'credit', label: 'Credit', field: 'credit', align: 'right', format: (v) => fmt(v) },
  { name: 'due_date', label: 'Due Date', field: 'due_date', align: 'left' },
  { name: 'aging_bucket', label: 'Aging', field: 'aging_bucket', align: 'center' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}
function bucketClass(b) {
  if (b === 'current') return 'fin-badge fin-badge--success'
  if (b === '1-30 days') return 'fin-badge fin-badge--warning'
  return 'fin-badge fin-badge--danger'
}

const currentDateStr = computed(() => {
  const now = new Date()
  return now.toISOString().split('T')[0].replace(/-/g, '/')
})

const currentMonthLabel = computed(() => {
  const now = new Date()
  return now.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
})

function getCompanyBankAccount(bName) {
  if (bName === 'All Banks') return '_______________'
  const match = companyBankAccounts.value.find(
    (a) =>
      a.bank_name?.toLowerCase().includes(bName.toLowerCase()) ||
      bName.toLowerCase().includes(a.bank_name?.toLowerCase()),
  )
  return match?.account_number || '_______________'
}

function exportBankPDF() {
  const doc = new jsPDF('p', 'mm', 'a4')
  const bName = selectedBank.value
  const companyAcc = getCompanyBankAccount(bName)
  const totalAmount = filteredPayables.value.reduce((s, p) => s + Number(p.debit || 0), 0)
  const totalStr = fmt(totalAmount)
  let y = 20

  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  doc.text(currentDateStr.value, 20, y)
  y += 8

  if (bName !== 'All Banks') {
    doc.text('THE MANAGER', 20, y)
    y += 6
    doc.setFont('times', 'bold')
    doc.text(bName.toUpperCase(), 20, y)
    y += 10
  }

  doc.setFontSize(13)
  doc.setFont('times', 'bold')
  const title = `ACCOUNTS PAYABLE TRANSFER \u2013 ${currentMonthLabel.value}`
  doc.text(title, 105, y, { align: 'center' })
  doc.setLineWidth(0.5)
  const titleW = doc.getTextWidth(title)
  doc.line(105 - titleW / 2, y + 1, 105 + titleW / 2, y + 1)
  y += 10

  if (bName !== 'All Banks') {
    doc.setFont('times', 'normal')
    doc.setFontSize(11)
    doc.text('Dear Sir,', 20, y)
    y += 8

    const bodyText = `Appreciate if you could arrange to Transfer Rs. ${totalStr} to the following supplier accounts as accounts payable settlement for ${currentMonthLabel.value} from Rupee Account No.${companyAcc}`
    const bodyLines = doc.splitTextToSize(bodyText, 170)
    doc.text(bodyLines, 20, y)
    y += bodyLines.length * 5.5 + 6
  }

  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.text('Seven Wave Food Court (Pvt) Ltd', 105, y, { align: 'center' })
  y += 6
  doc.setFontSize(11)
  doc.text(`SUPPLIER PAYMENTS \u2013 ${currentMonthLabel.value}`, 105, y, { align: 'center' })
  y += 4

  const tableData = filteredPayables.value.map((p, i) => [
    i + 1,
    p.supplier_name || '',
    p.doc_number || '',
    p.bank_account_number || '',
    `LKR ${fmt(p.debit)}`,
  ])
  tableData.push(['', '', '', 'TOTAL', `LKR ${totalStr}`])

  autoTable(doc, {
    startY: y + 2,
    margin: { left: 20, right: 20 },
    head: [['No.', 'Supplier', 'Invoice/Ref', 'Account No.', 'Amount']],
    body: tableData,
    theme: 'grid',
    styles: { font: 'times', fontSize: 10, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.3 },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { cellWidth: 50 },
      2: { cellWidth: 35 },
      3: { cellWidth: 35 },
      4: { halign: 'right', cellWidth: 35 },
    },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        if (data.column.index < 4) data.cell.styles.fillColor = [249, 249, 249]
      }
    },
  })

  y = doc.lastAutoTable.finalY + 15
  if (y > 260) {
    doc.addPage()
    y = 20
  }

  if (bName !== 'All Banks') {
    doc.setFont('times', 'normal')
    doc.setFontSize(12)
    doc.text('Thank You', 20, y)
    y += 20
    doc.text('...................................', 20, y)
    y += 6
    doc.setFont('times', 'bold')
    doc.text('Director', 20, y)
  }

  const filename = `AP_Export_${bName.replace(/\s+/g, '_')}_${currentDateStr.value.replace(/\//g, '')}.pdf`
  doc.save(filename)
  $q.notify({ type: 'positive', icon: 'picture_as_pdf', message: `Downloaded: ${filename}` })
}

function exportBankXLSX() {
  const bName = selectedBank.value
  const companyAcc = getCompanyBankAccount(bName)
  const totalAmount = filteredPayables.value.reduce((s, p) => s + Number(p.debit || 0), 0)

  const wsData = []
  if (bName !== 'All Banks') {
    wsData.push([currentDateStr.value])
    wsData.push(['THE MANAGER'])
    wsData.push([bName.toUpperCase()])
    wsData.push([])
    wsData.push([`ACCOUNTS PAYABLE TRANSFER \u2013 ${currentMonthLabel.value}`])
    wsData.push([])
    wsData.push(['Dear Sir,'])
    wsData.push([
      `Appreciate if you could arrange to Transfer Rs. ${fmt(totalAmount)} to the following supplier accounts as accounts payable settlement for ${currentMonthLabel.value} from Rupee Account No.${companyAcc}`,
    ])
    wsData.push([])
  }

  wsData.push(['Seven Wave Food Court (Pvt) Ltd'])
  wsData.push([`SUPPLIER PAYMENTS \u2013 ${currentMonthLabel.value}`])
  wsData.push([])
  wsData.push(['No.', 'Supplier', 'Invoice/Ref', 'Account No.', 'Amount'])

  filteredPayables.value.forEach((p, i) => {
    wsData.push([
      i + 1,
      p.supplier_name || '',
      p.doc_number || '',
      p.bank_account_number || '',
      Number(p.debit || 0),
    ])
  })

  wsData.push(['', '', '', 'TOTAL', totalAmount])

  if (bName !== 'All Banks') {
    wsData.push([])
    wsData.push(['Thank You'])
    wsData.push([])
    wsData.push(['...................................'])
    wsData.push(['Director'])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 25 }, { wch: 25 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, bName.substring(0, 31))

  const filename = `AP_Export_${bName.replace(/\s+/g, '_')}_${currentDateStr.value.replace(/\//g, '')}.xlsx`
  XLSX.writeFile(wb, filename)
  $q.notify({ type: 'positive', icon: 'table_chart', message: `Downloaded: ${filename}` })
}

async function loadData() {
  loading.value = true

  const { data: banks } = await supabase
    .from('bank_accounts')
    .select('name, bank_name, account_number')
    .eq('is_active', true)
  companyBankAccounts.value = banks || []

  const { data } = await fetchPayableAging()
  payables.value = data || []
  loading.value = false
}
onMounted(() => {
  loadData()
})
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
