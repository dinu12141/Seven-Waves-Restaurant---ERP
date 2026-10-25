<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Accounts Receivable"
      breadcrumbs="Finance / Receivables & Payables / AR"
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
        <span class="fin-panel__title"
          >Outstanding Receivables ({{ filteredReceivables.length }})</span
        >
      </div>
      <q-table
        :rows="filteredReceivables"
        :columns="columns"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[20, 50]"
        class="fin-table"
        :loading="loading"
        no-data-label="No outstanding receivables"
      >
        <template #body-cell-customer="props">
          <q-td :props="props">
            <div>{{ props.row.customers?.name || '-' }}</div>
            <div class="text-caption text-grey-5" v-if="props.row.customers?.bank_name">
              {{ props.row.customers?.bank_name }} -
              {{ props.row.customers?.bank_account_number || 'N/A' }}
            </div>
          </q-td>
        </template>
        <template #body-cell-status="props">
          <q-td :props="props">
            <span :class="statusClass(props.row.status)">{{ props.row.status }}</span>
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchReceivables, fetchReceivableAging } from 'src/services/financeService'
import { useQuasar } from 'quasar'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const loading = ref(false)
const receivables = ref([])
const agingData = ref([])
const companyBankAccounts = ref([])

const selectedBank = ref('All Banks')
const bankOptions = ['All Banks', 'BOC', 'HNB', 'Commercial Bank', 'Sampath Bank']

const filteredReceivables = computed(() => {
  if (selectedBank.value === 'All Banks') return receivables.value
  return receivables.value.filter((r) => {
    const bName = r.customers?.bank_name || ''
    return (
      bName.toLowerCase().includes(selectedBank.value.toLowerCase()) ||
      selectedBank.value.toLowerCase().includes(bName.toLowerCase())
    )
  })
})

const filteredAgingData = computed(() => {
  if (selectedBank.value === 'All Banks') return agingData.value
  return agingData.value.filter((a) => {
    const bName = a.bank_name || ''
    return (
      bName.toLowerCase().includes(selectedBank.value.toLowerCase()) ||
      selectedBank.value.toLowerCase().includes(bName.toLowerCase())
    )
  })
})

const agingBuckets = computed(() => {
  const buckets = { current: 0, '1-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 }
  filteredAgingData.value.forEach((r) => {
    if (buckets[r.aging_bucket] !== undefined) buckets[r.aging_bucket] += Number(r.balance || 0)
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
  {
    name: 'customer',
    label: 'Customer & Bank',
    field: (row) => row.customers?.name || '-',
    align: 'left',
  },
  {
    name: 'total_amount',
    label: 'Total',
    field: 'total_amount',
    align: 'right',
    format: (v) => fmt(v),
  },
  {
    name: 'paid_amount',
    label: 'Paid',
    field: 'paid_amount',
    align: 'right',
    format: (v) => fmt(v),
  },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', format: (v) => fmt(v) },
  { name: 'due_date', label: 'Due Date', field: 'due_date', align: 'left' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
}
function statusClass(s) {
  const m = {
    outstanding: 'fin-badge fin-badge--warning',
    partial: 'fin-badge fin-badge--info',
    paid: 'fin-badge fin-badge--success',
    overdue: 'fin-badge fin-badge--danger',
  }
  return m[s] || 'fin-badge fin-badge--muted'
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
  const totalAmount = filteredReceivables.value.reduce((s, r) => s + Number(r.balance || 0), 0)
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
  const title = `ACCOUNTS RECEIVABLE COLLECTION \u2013 ${currentMonthLabel.value}`
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

    const bodyText = `Appreciate if you could arrange to Collect Rs. ${totalStr} from the following customer accounts as accounts receivable settlement for ${currentMonthLabel.value} to Rupee Account No.${companyAcc}`
    const bodyLines = doc.splitTextToSize(bodyText, 170)
    doc.text(bodyLines, 20, y)
    y += bodyLines.length * 5.5 + 6
  }

  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.text('Seven Wave Food Court (Pvt) Ltd', 105, y, { align: 'center' })
  y += 6
  doc.setFontSize(11)
  doc.text(`CUSTOMER COLLECTIONS \u2013 ${currentMonthLabel.value}`, 105, y, { align: 'center' })
  y += 4

  const tableData = filteredReceivables.value.map((r, i) => [
    i + 1,
    r.customers?.name || '',
    r.invoice_id || 'N/A',
    r.customers?.bank_account_number || '',
    `LKR ${fmt(r.balance)}`,
  ])
  tableData.push(['', '', '', 'TOTAL', `LKR ${totalStr}`])

  autoTable(doc, {
    startY: y + 2,
    margin: { left: 20, right: 20 },
    head: [['No.', 'Customer', 'Invoice ID', 'Account No.', 'Balance']],
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

  const filename = `AR_Export_${bName.replace(/\s+/g, '_')}_${currentDateStr.value.replace(/\//g, '')}.pdf`
  doc.save(filename)
  $q.notify({ type: 'positive', icon: 'picture_as_pdf', message: `Downloaded: ${filename}` })
}

function exportBankXLSX() {
  const bName = selectedBank.value
  const companyAcc = getCompanyBankAccount(bName)
  const totalAmount = filteredReceivables.value.reduce((s, r) => s + Number(r.balance || 0), 0)

  const wsData = []
  if (bName !== 'All Banks') {
    wsData.push([currentDateStr.value])
    wsData.push(['THE MANAGER'])
    wsData.push([bName.toUpperCase()])
    wsData.push([])
    wsData.push([`ACCOUNTS RECEIVABLE COLLECTION \u2013 ${currentMonthLabel.value}`])
    wsData.push([])
    wsData.push(['Dear Sir,'])
    wsData.push([
      `Appreciate if you could arrange to Collect Rs. ${fmt(totalAmount)} from the following customer accounts as accounts receivable settlement for ${currentMonthLabel.value} to Rupee Account No.${companyAcc}`,
    ])
    wsData.push([])
  }

  wsData.push(['Seven Wave Food Court (Pvt) Ltd'])
  wsData.push([`CUSTOMER COLLECTIONS \u2013 ${currentMonthLabel.value}`])
  wsData.push([])
  wsData.push(['No.', 'Customer', 'Invoice ID', 'Account No.', 'Balance'])

  filteredReceivables.value.forEach((r, i) => {
    wsData.push([
      i + 1,
      r.customers?.name || '',
      r.invoice_id || 'N/A',
      r.customers?.bank_account_number || '',
      Number(r.balance || 0),
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

  const filename = `AR_Export_${bName.replace(/\s+/g, '_')}_${currentDateStr.value.replace(/\//g, '')}.xlsx`
  XLSX.writeFile(wb, filename)
  $q.notify({ type: 'positive', icon: 'table_chart', message: `Downloaded: ${filename}` })
}

async function loadData() {
  loading.value = true

  const { data: banks } = await supabase
    .from('finance_accounts')
    .select('registered_name, bank_name, account_number')
    .eq('account_type', 'bank')
    .eq('is_active', true)
    .is('deleted_at', null)
  companyBankAccounts.value = (banks || []).map(b => ({
    name: b.registered_name,
    bank_name: b.bank_name,
    account_number: b.account_number
  }))

  const [recvRes, agingRes] = await Promise.all([fetchReceivables(), fetchReceivableAging()])
  receivables.value = recvRes.data || []
  agingData.value = agingRes.data || []
  loading.value = false
}
onMounted(() => {
  loadData()
})

</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
