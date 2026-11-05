<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5 text-weight-bold">Procurement Reports</div>
    </div>

    <q-card flat bordered :style="{ borderTop: '3px solid #f9a825' }">
      <q-tabs
        v-model="activeTab"
        dense
        align="left"
        active-color="amber-9"
        indicator-color="amber-9"
        narrow-indicator
        no-caps
        class="text-weight-medium"
      >
        <q-tab name="statement" label="Supplier Statement" icon="description" />
        <q-tab name="aging" label="AP Aging" icon="access_time" />
        <q-tab name="po_grn" label="PO vs GRN" icon="compare_arrows" />
        <q-tab name="summary" label="Supplier Summary" icon="summarize" />
        <q-tab name="purchases" label="Purchase Report" icon="receipt_long" />
      </q-tabs>
      <q-separator />

      <q-tab-panels v-model="activeTab" animated style="background: transparent">

        <!-- ══ TAB 1: SUPPLIER STATEMENT ══════════════════════════════════ -->
        <q-tab-panel name="statement" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div class="row q-col-gutter-md items-end col-grow">
              <div class="col-12 col-md-4">
                <div class="text-caption q-mb-xs text-weight-medium">Supplier</div>
                <q-select
                  v-model="statementSupplier"
                  :options="supplierOptions"
                  option-label="name"
                  option-value="id"
                  emit-value
                  map-options
                  outlined
                  dense
                  clearable
                  placeholder="Select supplier"
                  use-input
                  input-debounce="0"
                  @filter="filterSuppliers"
                />
              </div>
              <div class="col-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">From</div>
                <q-input v-model="statementFrom" type="date" outlined dense />
              </div>
              <div class="col-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">To</div>
                <q-input v-model="statementTo" type="date" outlined dense />
              </div>
              <div class="col-12 col-md-2">
                <q-btn
                  unelevated
                  color="amber-8"
                  text-color="dark"
                  icon="search"
                  label="Generate"
                  no-caps
                  class="full-width"
                  :loading="loadingStatement"
                  :disable="!statementSupplier"
                  @click="loadStatement"
                />
              </div>
            </div>
            <div class="row q-gutter-sm q-ml-sm" v-if="statementRows.length > 0">
              <q-btn
                flat dense icon="print" label="Print" color="grey-8" no-caps
                @click="printReport(statementCols, statementRows, 'Supplier Statement', statementSubtitle)"
              />
              <q-btn
                flat dense icon="picture_as_pdf" label="Export PDF" color="negative" no-caps
                @click="exportPDF(statementCols, statementRows, 'Supplier_Statement', statementSubtitle)"
              />
              <q-btn
                flat dense icon="table_view" label="Export Excel" color="positive" no-caps
                @click="exportExcel(statementCols, statementRows, 'Supplier_Statement')"
              />
            </div>
          </div>

          <!-- Summary chips -->
          <div v-if="statementRows.length > 0" class="row q-col-gutter-sm q-mb-md">
            <div class="col-auto">
              <q-chip color="blue-grey-7" text-color="white" dense>
                Total Invoiced: {{ fmtCur(statementTotals.amount) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip color="green-7" text-color="white" dense>
                Total Paid: {{ fmtCur(statementTotals.paid) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip :color="statementTotals.balance > 0 ? 'red-7' : 'green-7'" text-color="white" dense>
                Balance: {{ fmtCur(statementTotals.balance) }}
              </q-chip>
            </div>
          </div>

          <q-table
            :rows="statementRows"
            :columns="statementCols"
            row-key="id"
            flat
            bordered
            dense
            :loading="loadingStatement"
            :rows-per-page-options="[20, 50, 0]"
          >
            <template #body-cell-status="props">
              <q-td :props="props">
                <q-chip
                  dense
                  size="sm"
                  :color="
                    props.row.status === 'paid'
                      ? 'green'
                      : props.row.status === 'partial'
                        ? 'orange'
                        : 'red-5'
                  "
                  text-color="white"
                >
                  {{ props.row.status }}
                </q-chip>
              </q-td>
            </template>
            <template #bottom-row>
              <q-tr class="bg-grey-2 text-weight-bold">
                <q-td>TOTAL</q-td>
                <q-td />
                <q-td class="text-right">{{ fmtCur(statementTotals.amount) }}</q-td>
                <q-td class="text-right">{{ fmtCur(statementTotals.paid) }}</q-td>
                <q-td class="text-right">{{ fmtCur(statementTotals.balance) }}</q-td>
                <q-td />
              </q-tr>
            </template>
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                {{ statementSupplier ? 'No invoices found for this period' : 'Select a supplier to view statement' }}
              </div>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ TAB 2: AP AGING ══════════════════════════════════════════════ -->
        <q-tab-panel name="aging" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div class="text-subtitle1 text-weight-bold">Accounts Payable Aging</div>
            <div class="row q-gutter-sm">
              <q-btn
                unelevated
                color="amber-8"
                text-color="dark"
                icon="refresh"
                label="Refresh"
                no-caps
                :loading="loadingAging"
                @click="loadAging"
              />
              <template v-if="agingRows.length > 0">
                <q-btn
                  flat dense icon="print" label="Print" color="grey-8" no-caps
                  @click="printReport(agingCols, agingRows, 'AP Aging', agingSubtitle)"
                />
                <q-btn
                  flat dense icon="picture_as_pdf" label="Export PDF" color="negative" no-caps
                  @click="exportPDF(agingCols, agingRows, 'AP_Aging', agingSubtitle)"
                />
                <q-btn
                  flat dense icon="table_view" label="Export Excel" color="positive" no-caps
                  @click="exportExcel(agingCols, agingRows, 'AP_Aging')"
                />
              </template>
            </div>
          </div>

          <!-- Aging buckets summary -->
          <div class="row q-col-gutter-md q-mb-lg">
            <div v-for="bucket in agingBuckets" :key="bucket.label" class="col-6 col-md-3">
              <q-card flat bordered>
                <q-card-section class="text-center q-pa-sm">
                  <div class="text-caption text-weight-bold q-mb-xs" :class="`text-${bucket.color}`">
                    {{ bucket.label }}
                  </div>
                  <div class="text-h6 text-weight-bold" :class="`text-${bucket.color}`">
                    {{ fmtCur(bucket.total) }}
                  </div>
                  <div class="text-caption text-grey">{{ bucket.count }} invoice(s)</div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <q-table
            :rows="agingRows"
            :columns="agingCols"
            row-key="id"
            flat
            bordered
            dense
            :loading="loadingAging"
            :rows-per-page-options="[20, 50, 0]"
          >
            <template #body-cell-bucket="props">
              <q-td :props="props">
                <q-chip
                  dense
                  size="sm"
                  :color="agingBucketColor(props.row.days_overdue)"
                  text-color="white"
                >
                  {{ agingBucketLabel(props.row.days_overdue) }}
                </q-chip>
              </q-td>
            </template>
            <template #body-cell-balance_due="props">
              <q-td :props="props" class="text-right text-weight-bold text-red-6">
                {{ fmtCur(props.row.balance_due) }}
              </q-td>
            </template>
            <template #bottom-row>
              <q-tr class="bg-grey-2 text-weight-bold">
                <q-td>TOTAL</q-td>
                <q-td />
                <q-td />
                <q-td class="text-right">{{ fmtCur(agingTotals.total) }}</q-td>
                <q-td class="text-right">{{ fmtCur(agingTotals.paid) }}</q-td>
                <q-td class="text-right text-red-6">{{ fmtCur(agingTotals.balance) }}</q-td>
                <q-td />
                <q-td />
              </q-tr>
            </template>
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                No outstanding AP invoices
              </div>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ TAB 3: PO vs GRN SUMMARY ════════════════════════════════════ -->
        <q-tab-panel name="po_grn" class="q-pa-md">
          <div class="row q-col-gutter-md q-mb-md items-end">
            <div class="col-6 col-md-3">
              <div class="text-caption q-mb-xs text-weight-medium">From</div>
              <q-input v-model="poGrnFrom" type="date" outlined dense />
            </div>
            <div class="col-6 col-md-3">
              <div class="text-caption q-mb-xs text-weight-medium">To</div>
              <q-input v-model="poGrnTo" type="date" outlined dense />
            </div>
            <div class="col-12 col-md-2">
              <q-btn
                unelevated
                color="amber-8"
                text-color="dark"
                icon="search"
                label="Load"
                no-caps
                class="full-width"
                :loading="loadingPoGrn"
                @click="loadPoGrn"
              />
            </div>
            <div class="col-12 col-md-3 row q-gutter-sm" v-if="poGrnRows.length > 0">
              <q-btn
                flat dense icon="print" label="Print" color="grey-8" no-caps
                @click="printReport(poGrnCols, poGrnRows, 'PO vs GRN', poGrnSubtitle)"
              />
              <q-btn
                flat dense icon="picture_as_pdf" label="Export PDF" color="negative" no-caps
                @click="exportPDF(poGrnCols, poGrnRows, 'PO_vs_GRN', poGrnSubtitle)"
              />
              <q-btn
                flat dense icon="table_view" label="Export Excel" color="positive" no-caps
                @click="exportExcel(poGrnCols, poGrnRows, 'PO_vs_GRN')"
              />
            </div>
          </div>

          <q-table
            :rows="poGrnRows"
            :columns="poGrnCols"
            row-key="id"
            flat
            bordered
            dense
            :loading="loadingPoGrn"
            :rows-per-page-options="[20, 50, 0]"
          >
            <template #body-cell-variance="props">
              <q-td
                :props="props"
                class="text-right text-weight-bold"
                :class="props.row.variance < 0 ? 'text-red-6' : props.row.variance > 0 ? 'text-orange-7' : 'text-green-6'"
              >
                {{ fmtCur(props.row.variance) }}
              </q-td>
            </template>
            <template #bottom-row>
              <q-tr class="bg-grey-2 text-weight-bold">
                <q-td>TOTAL</q-td>
                <q-td />
                <q-td />
                <q-td class="text-right">{{ fmtCur(poGrnTotals.poAmount) }}</q-td>
                <q-td class="text-right">{{ fmtCur(poGrnTotals.received) }}</q-td>
                <q-td class="text-right">{{ fmtCur(poGrnTotals.variance) }}</q-td>
                <q-td />
              </q-tr>
            </template>
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                No purchase orders found for this period
              </div>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ TAB 4: SUPPLIER SUMMARY ═══════════════════════════════════════ -->
        <q-tab-panel name="summary" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div class="row q-col-gutter-md items-end col-grow">
              <div class="col-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">From</div>
                <q-input v-model="summaryFrom" type="date" outlined dense />
              </div>
              <div class="col-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">To</div>
                <q-input v-model="summaryTo" type="date" outlined dense />
              </div>
              <div class="col-12 col-md-2">
                <q-btn
                  unelevated
                  color="amber-8"
                  text-color="dark"
                  icon="search"
                  label="Load"
                  no-caps
                  class="full-width"
                  :loading="loadingSummary"
                  @click="loadSummary"
                />
              </div>
            </div>
            <div class="row q-gutter-sm q-ml-sm" v-if="summaryRows.length > 0">
              <q-btn
                flat dense icon="print" label="Print" color="grey-8" no-caps
                @click="printReport(summaryCols, summaryRows, 'Supplier Summary', summarySubtitle)"
              />
              <q-btn
                flat dense icon="picture_as_pdf" label="Export PDF" color="negative" no-caps
                @click="exportPDF(summaryCols, summaryRows, 'Supplier_Summary', summarySubtitle)"
              />
              <q-btn
                flat dense icon="table_view" label="Export Excel" color="positive" no-caps
                @click="exportExcel(summaryCols, summaryRows, 'Supplier_Summary')"
              />
            </div>
          </div>

          <!-- Grand totals chips -->
          <div v-if="summaryRows.length > 0" class="row q-col-gutter-sm q-mb-md">
            <div class="col-auto">
              <q-chip color="blue-grey-7" text-color="white" dense>
                Total Invoiced: {{ fmtCur(summaryTotals.total_invoiced) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip color="green-7" text-color="white" dense>
                Total Paid: {{ fmtCur(summaryTotals.total_paid) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip :color="summaryTotals.total_due > 0 ? 'red-7' : 'green-7'" text-color="white" dense>
                Total Due: {{ fmtCur(summaryTotals.total_due) }}
              </q-chip>
            </div>
            <div class="col-auto">
              <q-chip color="deep-orange-7" text-color="white" dense>
                Overdue Invoices: {{ summaryTotals.overdue_count }}
              </q-chip>
            </div>
          </div>

          <q-table
            :rows="summaryRows"
            :columns="summaryCols"
            row-key="supplier_id"
            flat
            bordered
            dense
            :loading="loadingSummary"
            :rows-per-page-options="[20, 50, 0]"
          >
            <template #body-cell-total_due="props">
              <q-td :props="props" class="text-right text-weight-bold" :class="props.row.total_due > 0 ? 'text-red-6' : 'text-green-6'">
                {{ fmtCur(props.row.total_due) }}
              </q-td>
            </template>
            <template #body-cell-overdue_count="props">
              <q-td :props="props" class="text-center">
                <q-chip v-if="props.row.overdue_count > 0" dense size="sm" color="red-5" text-color="white">
                  {{ props.row.overdue_count }}
                </q-chip>
                <span v-else>0</span>
              </q-td>
            </template>
            <template #bottom-row>
              <q-tr class="bg-grey-2 text-weight-bold">
                <q-td>TOTAL</q-td>
                <q-td class="text-right">{{ fmtCur(summaryTotals.total_invoiced) }}</q-td>
                <q-td class="text-right">{{ fmtCur(summaryTotals.total_paid) }}</q-td>
                <q-td class="text-right">{{ fmtCur(summaryTotals.total_due) }}</q-td>
                <q-td class="text-center">{{ summaryTotals.invoice_count }}</q-td>
                <q-td class="text-center">{{ summaryTotals.overdue_count }}</q-td>
              </q-tr>
            </template>
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                No supplier invoices found for this period
              </div>
            </template>
          </q-table>
        </q-tab-panel>
                <!-- ══ TAB 5: UNIFIED PURCHASE REPORT ════════════════════════════════ -->
        <q-tab-panel name="purchases" class="q-pa-md">
          <div class="row items-center justify-between q-mb-md">
            <div class="row q-col-gutter-sm items-end col-grow">
              <div class="col-6 col-sm-3 col-md-2">
                <div class="text-caption q-mb-xs text-weight-medium">From</div>
                <q-input v-model="purchasesFrom" type="date" outlined dense />
              </div>
              <div class="col-6 col-sm-3 col-md-2">
                <div class="text-caption q-mb-xs text-weight-medium">To</div>
                <q-input v-model="purchasesTo" type="date" outlined dense />
              </div>
              <div class="col-12 col-sm-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">Supplier</div>
                <q-select
                  v-model="purchasesSupplier"
                  :options="supplierOptions"
                  option-label="name"
                  option-value="id"
                  emit-value
                  map-options
                  outlined
                  dense
                  clearable
                  placeholder="All Suppliers"
                  use-input
                  input-debounce="0"
                  @filter="filterSuppliers"
                />
              </div>
              <div class="col-12 col-sm-6 col-md-3">
                <div class="text-caption q-mb-xs text-weight-medium">Item</div>
                <q-select
                  v-model="purchasesItem"
                  :options="itemOptions"
                  :option-label="(opt) => opt ? (opt.code ? opt.code + ' - ' + opt.name : opt.name) : 'All Items'"
                  option-value="id"
                  emit-value
                  map-options
                  outlined
                  dense
                  clearable
                  placeholder="All Items"
                  use-input
                  input-debounce="0"
                  @filter="filterItems"
                />
              </div>
              <div class="col-6 col-sm-3 col-md-2">
                <div class="text-caption q-mb-xs text-weight-medium">Source Document</div>
                <q-select
                  v-model="purchasesSource"
                  :options="sourceOptions"
                  emit-value
                  map-options
                  outlined
                  dense
                />
              </div>
              <div class="col-6 col-sm-3 col-md-auto">
                <q-btn
                  unelevated
                  color="amber-8"
                  text-color="dark"
                  icon="search"
                  label="Generate"
                  no-caps
                  style="min-width: 110px; height: 40px"
                  :loading="loadingPurchases"
                  @click="loadPurchasesReport"
                />
              </div>
            </div>

            <!-- Export / Print -->
            <div class="row q-gutter-xs q-mt-sm q-mt-md-none" v-if="rawPurchaseRows.length > 0">
              <q-btn
                flat dense icon="print" label="Print" color="grey-8" no-caps
                @click="printPurchases"
              />
              <q-btn
                flat dense icon="picture_as_pdf" label="Export PDF" color="negative" no-caps
                @click="exportPurchasesPDF"
              />
              <q-btn
                flat dense icon="table_view" label="Export Excel" color="positive" no-caps
                @click="exportPurchasesExcel"
              />
            </div>
          </div>

          <!-- Summary Chips & View Switcher -->
          <div class="row items-center justify-between q-col-gutter-sm q-mb-md" v-if="rawPurchaseRows.length > 0">
            <div class="row q-gutter-xs col-auto">
              <q-chip color="blue-grey-8" text-color="white" dense icon="payments">
                Total Spend: {{ fmtCur(purchasesTotals.totalAmount) }}
              </q-chip>
              <q-chip color="teal-8" text-color="white" dense icon="scale">
                Total Qty: {{ Number(purchasesTotals.totalQty.toFixed(2)).toLocaleString() }}
              </q-chip>
              <q-chip color="deep-purple-7" text-color="white" dense icon="inventory_2">
                Unique Items: {{ purchasesTotals.uniqueItems }}
              </q-chip>
              <q-chip color="indigo-7" text-color="white" dense icon="people" v-if="purchasesTotals.uniqueSuppliers > 1">
                Suppliers: {{ purchasesTotals.uniqueSuppliers }}
              </q-chip>
              <q-chip color="amber-9" text-color="dark" dense icon="star" v-if="purchasesTotals.topItem">
                Top Item: {{ purchasesTotals.topItem }} ({{ fmtCur(purchasesTotals.topItemAmount) }})
              </q-chip>
            </div>

            <div class="col-auto">
              <q-btn-toggle
                v-model="purchasesViewMode"
                no-caps
                dense
                rounded
                unelevated
                toggle-color="primary"
                color="grey-3"
                text-color="grey-9"
                :options="[
                  { label: 'Detailed (With Date)', value: 'detailed', icon: 'calendar_today' },
                  { label: 'Group by Item', value: 'by_item', icon: 'inventory_2' },
                  { label: 'Group by Supplier', value: 'by_supplier', icon: 'local_shipping' },
                ]"
              />
            </div>
          </div>

          <!-- Live Search Filter -->
          <div class="row q-mb-sm" v-if="rawPurchaseRows.length > 0">
            <div class="col-12 col-md-5">
              <q-input
                v-model="purchasesSearch"
                dense
                outlined
                clearable
                placeholder="Filter by date, doc #, item, supplier, category..."
              >
                <template #prepend><q-icon name="search" size="18px" /></template>
              </q-input>
            </div>
          </div>

          <!-- Table -->
          <q-table
            :rows="activePurchaseRows"
            :columns="activePurchaseCols"
            :row-key="purchasesViewMode === 'detailed' ? 'id' : purchasesViewMode === 'by_item' ? 'item_id' : 'id'"
            flat
            bordered
            dense
            :loading="loadingPurchases"
            :rows-per-page-options="[25, 50, 100, 0]"
          >
            <template #body-cell-doc_date="props">
              <q-td :props="props" class="text-weight-bold text-blue-grey-9">
                {{ props.row.doc_date }}
              </q-td>
            </template>
            <template #body-cell-doc_number="props">
              <q-td :props="props" class="text-weight-medium text-primary">
                {{ props.row.doc_number }}
              </q-td>
            </template>
            <template #body-cell-code="props">
              <q-td :props="props" class="text-weight-bold text-blue-9">
                {{ props.row.code }}
              </q-td>
            </template>
            <template #body-cell-name="props">
              <q-td :props="props" class="text-weight-medium">
                {{ props.row.name }}
              </q-td>
            </template>
            <template #body-cell-last_date="props">
              <q-td :props="props" class="text-center text-weight-medium text-grey-8">
                {{ props.row.last_date || '—' }}
              </q-td>
            </template>
            <template #body-cell-line_total="props">
              <q-td :props="props" class="text-right text-weight-bolder text-green-8">
                {{ fmtCur(props.row.line_total) }}
              </q-td>
            </template>
            <template #body-cell-total_amount="props">
              <q-td :props="props" class="text-right text-weight-bolder text-green-8">
                {{ fmtCur(props.row.total_amount) }}
              </q-td>
            </template>
            <template #bottom-row>
              <q-tr class="bg-grey-2 text-weight-bold" v-if="activePurchaseRows.length > 0">
                <template v-if="purchasesViewMode === 'detailed'">
                  <q-td>TOTAL ({{ activePurchaseRows.length }} Entries)</q-td>
                  <q-td />
                  <q-td />
                  <q-td />
                  <q-td />
                  <q-td />
                  <q-td />
                  <q-td class="text-right">{{ Number(purchasesTableTotals.totalQty.toFixed(2)).toLocaleString() }}</q-td>
                  <q-td />
                  <q-td class="text-right text-green-9">{{ fmtCur(purchasesTableTotals.totalAmount) }}</q-td>
                </template>
                <template v-else-if="purchasesViewMode === 'by_item'">
                  <q-td>TOTAL ({{ activePurchaseRows.length }} Items)</q-td>
                  <q-td />
                  <q-td />
                  <q-td />
                  <q-td class="text-right">{{ Number(purchasesTableTotals.totalQty.toFixed(2)).toLocaleString() }}</q-td>
                  <q-td />
                  <q-td class="text-right text-green-9">{{ fmtCur(purchasesTableTotals.totalAmount) }}</q-td>
                  <q-td />
                  <q-td />
                  <q-td />
                </template>
                <template v-else>
                  <q-td>TOTAL ({{ activePurchaseRows.length }} Rows)</q-td>
                  <q-td />
                  <q-td />
                  <q-td />
                  <q-td class="text-right">{{ Number(purchasesTableTotals.totalQty.toFixed(2)).toLocaleString() }}</q-td>
                  <q-td />
                  <q-td class="text-right text-green-9">{{ fmtCur(purchasesTableTotals.totalAmount) }}</q-td>
                  <q-td class="text-right">100%</q-td>
                  <q-td />
                  <q-td />
                </template>
              </q-tr>
            </template>
            <template #no-data>
              <div class="full-width row justify-center text-grey q-pa-md">
                No purchase records found for this period and filters
              </div>
            </template>
          </q-table>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { getSupplierSummaryReport, localDateKey } from 'src/services/procurementService'
import { exportTableToExcel, exportTableToPDF, printTableAsPDF } from 'src/services/exportService'

const $q = useQuasar()

const activeTab = ref('statement')
const exporting = ref(false)

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCur(val) {
  return Number(val || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Shared Print / Export PDF / Export Excel handlers (matches SupplierPaymentReport.vue UX)
async function printReport(columns, rows, title, subtitle, foot) {
  exporting.value = true
  try {
    await printTableAsPDF(columns, rows, title, subtitle, foot)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Print failed' })
  } finally {
    exporting.value = false
  }
}

async function exportPDF(columns, rows, title, subtitle, foot) {
  exporting.value = true
  try {
    await exportTableToPDF(columns, rows, title, subtitle, foot)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'PDF export failed' })
  } finally {
    exporting.value = false
  }
}

function exportExcel(columns, rows, filename) {
  try {
    exportTableToExcel(columns, rows, filename)
    $q.notify({ type: 'positive', message: 'Excel exported successfully' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Excel export failed' })
  }
}

// ── Supplier list ─────────────────────────────────────────────────────────────
const allSuppliers = ref([])
const supplierOptions = ref([])

onMounted(async () => {
  const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name')
  allSuppliers.value = data || []
  supplierOptions.value = allSuppliers.value
  loadAging()
  loadSummary()
  loadCategoriesAndUoms()
  loadItemsList()
  loadPurchasesReport()
})

function filterSuppliers(val, update) {
  update(() => {
    const q = val.toLowerCase()
    supplierOptions.value = q
      ? allSuppliers.value.filter((s) => s.name.toLowerCase().includes(q))
      : allSuppliers.value
  })
}

// ── TAB 1: Supplier Statement ─────────────────────────────────────────────────
const statementSupplier = ref(null)
const today = new Date()
const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
const todayStr = localDateKey(today) // local date (UTC+5:30 safe)
const statementFrom = ref(firstOfMonth)
const statementTo = ref(todayStr)
const loadingStatement = ref(false)
const statementRows = ref([])

const statementCols = [
  { name: 'doc_number', label: 'Invoice #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_date', label: 'Invoice Date', field: 'doc_date', align: 'left', sortable: true },
  {
    name: 'total_amount',
    label: 'Amount',
    field: 'total_amount',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  {
    name: 'paid_amount',
    label: 'Paid',
    field: 'paid_amount',
    align: 'right',
    format: (v) => fmtCur(v),
  },
  {
    name: 'balance_due',
    label: 'Balance',
    field: 'balance_due',
    align: 'right',
    format: (v) => fmtCur(v),
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

const statementSubtitle = computed(() => {
  const supplierName = allSuppliers.value.find((s) => s.id === statementSupplier.value)?.name
  return `Period: ${statementFrom.value} to ${statementTo.value}${supplierName ? ' | Supplier: ' + supplierName : ''}`
})

const activeStatementRows = computed(() =>
  statementRows.value.filter((r) => r.status !== 'cancelled' && r.status !== 'void')
)

const statementTotals = computed(() => ({
  amount: activeStatementRows.value.reduce((s, r) => s + Number(r.total_amount || 0), 0),
  paid: activeStatementRows.value.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
  balance: activeStatementRows.value.reduce((s, r) => s + Number(r.balance_due || 0), 0),
}))

async function loadStatement() {
  if (!statementSupplier.value) return
  loadingStatement.value = true
  try {
    const { data, error } = await supabase
      .from('ap_invoices')
      .select('id, doc_number, doc_date, total_amount, paid_amount, balance_due, status')
      .eq('supplier_id', statementSupplier.value)
      .neq('status', 'cancelled')
      .gte('doc_date', statementFrom.value)
      .lte('doc_date', statementTo.value)
      .order('doc_date')
    if (error) throw error
    statementRows.value = data || []
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load supplier statement' })
  } finally {
    loadingStatement.value = false
  }
}

// ── TAB 2: AP Aging ───────────────────────────────────────────────────────────
const loadingAging = ref(false)
const agingRows = ref([])

const agingCols = [
  { name: 'supplier', label: 'Supplier', field: (r) => r.suppliers?.name || '—', align: 'left', sortable: true },
  { name: 'doc_number', label: 'Invoice #', field: 'doc_number', align: 'left' },
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  {
    name: 'total_amount',
    label: 'Total',
    align: 'right',
    field: 'total_amount',
    format: (v) => fmtCur(v),
  },
  {
    name: 'paid_amount',
    label: 'Paid',
    align: 'right',
    field: 'paid_amount',
    format: (v) => fmtCur(v),
  },
  {
    name: 'balance_due',
    label: 'Balance Due',
    align: 'right',
    field: 'balance_due',
    format: (v) => fmtCur(v),
  },
  { name: 'days_overdue', label: 'Days', field: 'days_overdue', align: 'center', sortable: true },
  {
    name: 'bucket',
    label: 'Age Bucket',
    field: 'days_overdue',
    align: 'center',
    format: (v) => agingBucketLabel(v),
  },
]

const agingSubtitle = computed(() => `As of ${todayStr}`)

const activeAgingRows = computed(() =>
  agingRows.value.filter((r) => r.status !== 'cancelled' && r.status !== 'void')
)

const agingTotals = computed(() => ({
  total: activeAgingRows.value.reduce((s, r) => s + Number(r.total_amount || 0), 0),
  paid: activeAgingRows.value.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
  balance: activeAgingRows.value.reduce((s, r) => s + Number(r.balance_due || 0), 0),
}))

function agingBucketLabel(days) {
  if (days <= 0) return 'Current'
  if (days <= 30) return '1-30 Days'
  if (days <= 60) return '31-60 Days'
  if (days <= 90) return '61-90 Days'
  return '90+ Days'
}

function agingBucketColor(days) {
  if (days <= 0) return 'green'
  if (days <= 30) return 'yellow-8'
  if (days <= 60) return 'orange'
  if (days <= 90) return 'deep-orange'
  return 'red'
}

const agingBuckets = computed(() => {
  const buckets = [
    { label: 'Current', color: 'green', key: (d) => d <= 0, total: 0, count: 0 },
    { label: '1-30 Days', color: 'yellow-8', key: (d) => d > 0 && d <= 30, total: 0, count: 0 },
    { label: '31-60 Days', color: 'orange', key: (d) => d > 30 && d <= 60, total: 0, count: 0 },
    { label: '61-90 Days', color: 'deep-orange', key: (d) => d > 60 && d <= 90, total: 0, count: 0 },
    { label: '90+ Days', color: 'red', key: (d) => d > 90, total: 0, count: 0 },
  ]
  activeAgingRows.value.forEach((r) => {
    const d = Number(r.days_overdue || 0)
    buckets.forEach((b) => {
      if (b.key(d)) {
        b.total += Number(r.balance_due || 0)
        b.count++
      }
    })
  })
  return buckets
})

async function loadAging() {
  loadingAging.value = true
  try {
    const { data, error } = await supabase
      .from('ap_invoices')
      .select('id, doc_number, doc_date, total_amount, paid_amount, balance_due, status, suppliers(name)')
      .in('status', ['posted', 'partial_paid'])
      .gt('balance_due', 0)
      .neq('status', 'cancelled')
      .order('doc_date')
    if (error) throw error

    const today = new Date()
    agingRows.value = (data || []).map((r) => {
      const docDate = new Date(r.doc_date)
      const days = Math.floor((today - docDate) / (1000 * 60 * 60 * 24))
      return { ...r, days_overdue: days }
    })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load AP aging' })
  } finally {
    loadingAging.value = false
  }
}

// ── TAB 3: PO vs GRN Summary ──────────────────────────────────────────────────
const poGrnFrom = ref(firstOfMonth)
const poGrnTo = ref(todayStr)
const loadingPoGrn = ref(false)
const poGrnRows = ref([])

const poGrnCols = [
  { name: 'doc_number', label: 'PO #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_date', label: 'PO Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'supplier', label: 'Supplier', field: (r) => r.suppliers?.name || '—', align: 'left' },
  {
    name: 'total_amount',
    label: 'PO Amount',
    field: 'total_amount',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  {
    name: 'received_amount',
    label: 'Received',
    field: 'received_amount',
    align: 'right',
    format: (v) => fmtCur(v),
  },
  {
    name: 'variance',
    label: 'Variance',
    field: 'variance',
    align: 'right',
    format: (v) => fmtCur(v),
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

const poGrnSubtitle = computed(() => `Period: ${poGrnFrom.value} to ${poGrnTo.value}`)

const activePoGrnRows = computed(() =>
  poGrnRows.value.filter((r) => r.status !== 'cancelled' && r.status !== 'void')
)

const poGrnTotals = computed(() => ({
  poAmount: activePoGrnRows.value.reduce((s, r) => s + Number(r.total_amount || 0), 0),
  received: activePoGrnRows.value.reduce((s, r) => s + Number(r.received_amount || 0), 0),
  variance: activePoGrnRows.value.reduce((s, r) => s + Number(r.variance || 0), 0),
}))

async function loadPoGrn() {
  loadingPoGrn.value = true
  try {
    // Load POs in date range (exclude cancelled/void)
    const { data: poData, error: poErr } = await supabase
      .from('purchase_orders')
      .select('id, doc_number, doc_date, total_amount, status, suppliers(name)')
      .gte('doc_date', poGrnFrom.value)
      .lte('doc_date', poGrnTo.value)
      .neq('status', 'cancelled')
      .order('doc_date')
    if (poErr) throw poErr

    // Load GRN totals per PO
    const poIds = (poData || []).map((p) => p.id)
    let grnByPo = {}
    if (poIds.length > 0) {
      const { data: grnData } = await supabase
        .from('goods_receipts')
        .select('po_id, total_amount')
        .in('po_id', poIds)
      ;(grnData || []).forEach((g) => {
        grnByPo[g.po_id] = (grnByPo[g.po_id] || 0) + Number(g.total_amount || 0)
      })
    }

    poGrnRows.value = (poData || []).map((po) => {
      const received = grnByPo[po.id] || 0
      return {
        ...po,
        received_amount: received,
        variance: Number(po.total_amount || 0) - received,
      }
    })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load PO vs GRN data' })
  } finally {
    loadingPoGrn.value = false
  }
}

// ── TAB 4: Supplier Summary ────────────────────────────────────────────────────
const summaryFrom = ref(firstOfMonth)
const summaryTo = ref(todayStr)
const loadingSummary = ref(false)
const summaryRows = ref([])
const summaryTotals = ref({
  total_invoiced: 0,
  total_paid: 0,
  total_due: 0,
  invoice_count: 0,
  overdue_count: 0,
})

const summaryCols = [
  { name: 'supplier_name', label: 'Supplier', field: 'supplier_name', align: 'left', sortable: true },
  {
    name: 'total_invoiced',
    label: 'Total Invoiced',
    field: 'total_invoiced',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  {
    name: 'total_paid',
    label: 'Total Paid',
    field: 'total_paid',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  {
    name: 'total_due',
    label: 'Total Due',
    field: 'total_due',
    align: 'right',
    format: (v) => fmtCur(v),
    sortable: true,
  },
  { name: 'invoice_count', label: '# Invoices', field: 'invoice_count', align: 'center', sortable: true },
  { name: 'overdue_count', label: '# Overdue', field: 'overdue_count', align: 'center', sortable: true },
]

const summarySubtitle = computed(() => `Period: ${summaryFrom.value} to ${summaryTo.value}`)

async function loadSummary() {
  loadingSummary.value = true
  try {
    const { rows, totals } = await getSupplierSummaryReport({
      from_date: summaryFrom.value,
      to_date: summaryTo.value,
    })
    summaryRows.value = rows
    summaryTotals.value = totals
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load supplier summary' })
  } finally {
    loadingSummary.value = false
  }
}

// ── Items List & Filter ───────────────────────────────────────────────────────
const allItems = ref([])
const itemOptions = ref([])

async function loadItemsList() {
  try {
    const { data } = await supabase
      .from('items')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')
    allItems.value = data || []
    itemOptions.value = allItems.value
  } catch (e) {
    console.warn('Could not load items list', e)
  }
}

function filterItems(val, update) {
  update(() => {
    const q = (val || '').toLowerCase().trim()
    itemOptions.value = q
      ? allItems.value.filter(
          (i) =>
            (i.name && i.name.toLowerCase().includes(q)) ||
            (i.code && i.code.toLowerCase().includes(q)),
        )
      : allItems.value
  })
}

// ── TAB 5: Unified Purchase Report ───────────────────────────────────────────
const purchasesFrom = ref(firstOfMonth)
const purchasesTo = ref(todayStr)
const purchasesSupplier = ref(null)
const purchasesItem = ref(null)
const purchasesSource = ref('grn')
const purchasesSearch = ref('')
const purchasesViewMode = ref('detailed') // 'detailed' | 'by_item' | 'by_supplier'
const loadingPurchases = ref(false)
const rawPurchaseRows = ref([])

const sourceOptions = [
  { label: 'Goods Receipts (GRN)', value: 'grn' },
  { label: 'Purchase Orders (PO)', value: 'po' },
]

const categoryMap = new Map()
const uomMap = new Map()

async function loadCategoriesAndUoms() {
  try {
    const [{ data: cats }, { data: uoms }] = await Promise.all([
      supabase.from('item_categories').select('id, name'),
      supabase.from('uom').select('id, code, name'),
    ])
    ;(cats || []).forEach((c) => categoryMap.set(c.id, c.name))
    ;(uoms || []).forEach((u) => uomMap.set(u.id, u.code || u.name))
  } catch (e) {
    console.warn('Could not preload category or UOM maps', e)
  }
}

watch(activeTab, (val) => {
  if (val === 'item_wise' || val === 'supplier_wise') {
    activeTab.value = 'purchases'
  }
  if (val === 'purchases' && rawPurchaseRows.value.length === 0) {
    loadPurchasesReport()
  }
})

// Detailed View Columns (WITH DATE!)
const purchasesDetailedCols = [
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'doc_number', label: 'Doc #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'supplier_name', label: 'Supplier', field: 'supplier_name', align: 'left', sortable: true },
  { name: 'code', label: 'Item Code', field: 'code', align: 'left', sortable: true },
  { name: 'name', label: 'Item Name', field: 'name', align: 'left', sortable: true },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'center', sortable: true },
  {
    name: 'quantity',
    label: 'Qty',
    field: 'quantity',
    align: 'right',
    sortable: true,
    format: (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    name: 'unit_cost',
    label: 'Unit Cost (LKR)',
    field: 'unit_cost',
    align: 'right',
    sortable: true,
    format: (v) => fmtCur(v),
  },
  {
    name: 'line_total',
    label: 'Total Amount (LKR)',
    field: 'line_total',
    align: 'right',
    sortable: true,
    format: (v) => fmtCur(v),
  },
]

// Item Grouped Columns
const purchasesByItemCols = [
  { name: 'code', label: 'Item Code', field: 'code', align: 'left', sortable: true },
  { name: 'name', label: 'Item Name', field: 'name', align: 'left', sortable: true },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'center', sortable: true },
  {
    name: 'total_qty',
    label: 'Total Qty',
    field: 'total_qty',
    align: 'right',
    sortable: true,
    format: (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    name: 'avg_cost',
    label: 'Avg Cost (LKR)',
    field: 'avg_cost',
    align: 'right',
    sortable: true,
    format: (v) => fmtCur(v),
  },
  {
    name: 'total_amount',
    label: 'Total Spend (LKR)',
    field: 'total_amount',
    align: 'right',
    sortable: true,
    format: (v) => fmtCur(v),
  },
  { name: 'last_date', label: 'Last Date', field: 'last_date', align: 'center', sortable: true },
  { name: 'doc_count', label: '# Receipts/POs', field: 'doc_count', align: 'center', sortable: true },
  { name: 'supplier_name', label: 'Main Supplier', field: 'supplier_name', align: 'left', sortable: true },
]

// Supplier Grouped Columns
const purchasesBySupplierCols = [
  { name: 'supplier_name', label: 'Supplier', field: 'supplier_name', align: 'left', sortable: true },
  { name: 'code', label: 'Item Code', field: 'code', align: 'left', sortable: true },
  { name: 'name', label: 'Item Name', field: 'name', align: 'left', sortable: true },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'center', sortable: true },
  {
    name: 'total_qty',
    label: 'Total Qty',
    field: 'total_qty',
    align: 'right',
    sortable: true,
    format: (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  },
  {
    name: 'avg_cost',
    label: 'Avg Cost (LKR)',
    field: 'avg_cost',
    align: 'right',
    sortable: true,
    format: (v) => fmtCur(v),
  },
  {
    name: 'total_amount',
    label: 'Total Spend (LKR)',
    field: 'total_amount',
    align: 'right',
    sortable: true,
    format: (v) => fmtCur(v),
  },
  {
    name: 'share',
    label: '% Share',
    field: 'share',
    align: 'right',
    sortable: true,
    format: (v) => `${v}%`,
  },
  { name: 'last_date', label: 'Last Date', field: 'last_date', align: 'center', sortable: true },
  { name: 'doc_count', label: '# Receipts/POs', field: 'doc_count', align: 'center', sortable: true },
]

async function loadPurchasesReport() {
  loadingPurchases.value = true
  try {
    let rowsData = []
    if (purchasesSource.value === 'grn') {
      let query = supabase
        .from('goods_receipt_lines')
        .select(`
          id, quantity, unit_cost, line_total, uom_id, item_id,
          items ( id, name, code, category_id ),
          goods_receipts!inner (
            id, doc_number, doc_date, status, supplier_id,
            suppliers ( id, name )
          )
        `)
        .gte('goods_receipts.doc_date', purchasesFrom.value)
        .lte('goods_receipts.doc_date', purchasesTo.value)
        .neq('goods_receipts.status', 'cancelled')

      if (purchasesSupplier.value) {
        query = query.eq('goods_receipts.supplier_id', purchasesSupplier.value)
      }
      if (purchasesItem.value) {
        query = query.eq('item_id', purchasesItem.value)
      }
      const { data, error } = await query
      if (error) throw error

      rowsData = (data || []).map((r) => {
        const qty = Number(r.quantity || 0)
        const uCost = Number(r.unit_cost || 0)
        const lTot = Number(r.line_total != null ? r.line_total : qty * uCost) || 0
        return {
          id: r.id,
          doc_date: r.goods_receipts?.doc_date || '—',
          doc_number: r.goods_receipts?.doc_number || '—',
          supplier_id: r.goods_receipts?.supplier_id,
          supplier_name: r.goods_receipts?.suppliers?.name || 'Unknown Supplier',
          item_id: r.items?.id || r.item_id,
          code: r.items?.code || '—',
          name: r.items?.name || 'Unnamed Item',
          category: categoryMap.get(r.items?.category_id) || 'General',
          uom: uomMap.get(r.uom_id) || 'PCS',
          quantity: qty,
          unit_cost: uCost,
          line_total: lTot,
        }
      })
    } else {
      let query = supabase
        .from('purchase_order_lines')
        .select(`
          id, quantity, unit_price, line_total, uom_id, item_id,
          items ( id, name, code, category_id ),
          purchase_orders!inner (
            id, doc_number, doc_date, status, supplier_id,
            suppliers ( id, name )
          )
        `)
        .gte('purchase_orders.doc_date', purchasesFrom.value)
        .lte('purchase_orders.doc_date', purchasesTo.value)
        .neq('purchase_orders.status', 'cancelled')

      if (purchasesSupplier.value) {
        query = query.eq('purchase_orders.supplier_id', purchasesSupplier.value)
      }
      if (purchasesItem.value) {
        query = query.eq('item_id', purchasesItem.value)
      }
      const { data, error } = await query
      if (error) throw error

      rowsData = (data || []).map((r) => {
        const qty = Number(r.quantity || 0)
        const uPrice = Number(r.unit_price || 0)
        const lTot = Number(r.line_total != null ? r.line_total : qty * uPrice) || 0
        return {
          id: r.id,
          doc_date: r.purchase_orders?.doc_date || '—',
          doc_number: r.purchase_orders?.doc_number || '—',
          supplier_id: r.purchase_orders?.supplier_id,
          supplier_name: r.purchase_orders?.suppliers?.name || 'Unknown Supplier',
          item_id: r.items?.id || r.item_id,
          code: r.items?.code || '—',
          name: r.items?.name || 'Unnamed Item',
          category: categoryMap.get(r.items?.category_id) || 'General',
          uom: uomMap.get(r.uom_id) || 'PCS',
          quantity: qty,
          unit_cost: uPrice,
          line_total: lTot,
        }
      })
    }

    rawPurchaseRows.value = rowsData.sort((a, b) => {
      if (a.doc_date === b.doc_date) return 0
      return a.doc_date < b.doc_date ? 1 : -1
    })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load purchases report' })
  } finally {
    loadingPurchases.value = false
  }
}

// 1. Detailed Rows
const detailedRows = computed(() => {
  const s = (purchasesSearch.value || '').trim().toLowerCase()
  if (!s) return rawPurchaseRows.value
  return rawPurchaseRows.value.filter(
    (r) =>
      (r.doc_date && String(r.doc_date).toLowerCase().includes(s)) ||
      (r.doc_number && String(r.doc_number).toLowerCase().includes(s)) ||
      (r.code && String(r.code).toLowerCase().includes(s)) ||
      (r.name && String(r.name).toLowerCase().includes(s)) ||
      (r.category && String(r.category).toLowerCase().includes(s)) ||
      (r.supplier_name && String(r.supplier_name).toLowerCase().includes(s)),
  )
})

// 2. Item Grouped Rows
const itemGroupedRows = computed(() => {
  const map = new Map()
  for (const r of rawPurchaseRows.value) {
    const key = r.item_id || r.code || r.name
    if (!map.has(key)) {
      map.set(key, {
        item_id: key,
        code: r.code,
        name: r.name,
        category: r.category,
        uom: r.uom,
        total_qty: 0,
        total_amount: 0,
        doc_count: 0,
        suppliers: new Set(),
        last_date: r.doc_date,
      })
    }
    const entry = map.get(key)
    entry.total_qty += r.quantity
    entry.total_amount += r.line_total
    entry.doc_count += 1
    if (r.supplier_name) entry.suppliers.add(r.supplier_name)
    if (r.doc_date && (!entry.last_date || r.doc_date > entry.last_date)) {
      entry.last_date = r.doc_date
    }
  }
  const res = Array.from(map.values())
    .map((e) => ({
      ...e,
      avg_cost: e.total_qty > 0 ? e.total_amount / e.total_qty : 0,
      supplier_name:
        Array.from(e.suppliers).slice(0, 2).join(', ') +
        (e.suppliers.size > 2 ? ` (+${e.suppliers.size - 2})` : ''),
    }))
    .sort((a, b) => b.total_amount - a.total_amount)

  const s = (purchasesSearch.value || '').trim().toLowerCase()
  if (!s) return res
  return res.filter(
    (r) =>
      (r.code && String(r.code).toLowerCase().includes(s)) ||
      (r.name && String(r.name).toLowerCase().includes(s)) ||
      (r.category && String(r.category).toLowerCase().includes(s)) ||
      (r.supplier_name && String(r.supplier_name).toLowerCase().includes(s)) ||
      (r.last_date && String(r.last_date).toLowerCase().includes(s)),
  )
})

// 3. Supplier Grouped Rows
const supplierGroupedRows = computed(() => {
  const map = new Map()
  let grandTotal = 0
  for (const r of rawPurchaseRows.value) {
    const key = `${r.supplier_name}__${r.code}__${r.name}`
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        supplier_name: r.supplier_name,
        code: r.code,
        name: r.name,
        uom: r.uom,
        total_qty: 0,
        total_amount: 0,
        doc_count: 0,
        last_date: r.doc_date,
      })
    }
    const entry = map.get(key)
    entry.total_qty += r.quantity
    entry.total_amount += r.line_total
    entry.doc_count += 1
    grandTotal += r.line_total
    if (r.doc_date && (!entry.last_date || r.doc_date > entry.last_date)) {
      entry.last_date = r.doc_date
    }
  }
  const res = Array.from(map.values())
    .map((e) => ({
      ...e,
      avg_cost: e.total_qty > 0 ? e.total_amount / e.total_qty : 0,
      share: grandTotal > 0 ? Number(((e.total_amount / grandTotal) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => {
      const cmp = a.supplier_name.localeCompare(b.supplier_name)
      return cmp !== 0 ? cmp : b.total_amount - a.total_amount
    })

  const s = (purchasesSearch.value || '').trim().toLowerCase()
  if (!s) return res
  return res.filter(
    (r) =>
      (r.supplier_name && String(r.supplier_name).toLowerCase().includes(s)) ||
      (r.code && String(r.code).toLowerCase().includes(s)) ||
      (r.name && String(r.name).toLowerCase().includes(s)) ||
      (r.last_date && String(r.last_date).toLowerCase().includes(s)),
  )
})

const activePurchaseRows = computed(() => {
  if (purchasesViewMode.value === 'by_item') return itemGroupedRows.value
  if (purchasesViewMode.value === 'by_supplier') return supplierGroupedRows.value
  return detailedRows.value
})

const activePurchaseCols = computed(() => {
  if (purchasesViewMode.value === 'by_item') return purchasesByItemCols
  if (purchasesViewMode.value === 'by_supplier') return purchasesBySupplierCols
  return purchasesDetailedCols
})

const purchasesTotals = computed(() => {
  const rows = rawPurchaseRows.value
  const totalAmount = rows.reduce((s, r) => s + Number(r.line_total || 0), 0)
  const totalQty = rows.reduce((s, r) => s + Number(r.quantity || 0), 0)
  const uniqueItems = new Set(rows.map((r) => r.name)).size
  const uniqueSuppliers = new Set(rows.map((r) => r.supplier_name)).size

  const itemSpend = new Map()
  for (const r of rows) {
    itemSpend.set(r.name, (itemSpend.get(r.name) || 0) + r.line_total)
  }
  let topItem = ''
  let topItemAmount = 0
  for (const [name, amt] of itemSpend.entries()) {
    if (amt > topItemAmount) {
      topItemAmount = amt
      topItem = name
    }
  }

  return {
    totalAmount,
    totalQty,
    uniqueItems,
    uniqueSuppliers,
    totalRecords: rows.length,
    topItem,
    topItemAmount,
  }
})

const purchasesTableTotals = computed(() => {
  const rows = activePurchaseRows.value
  return {
    totalAmount: rows.reduce((s, r) => s + Number(r.line_total || r.total_amount || 0), 0),
    totalQty: rows.reduce((s, r) => s + Number(r.quantity || r.total_qty || 0), 0),
    recordCount: rows.length,
  }
})

const purchasesSubtitle = computed(() => {
  const suppName = purchasesSupplier.value
    ? allSuppliers.value.find((s) => s.id === purchasesSupplier.value)?.name
    : 'All Suppliers'
  const itmName = purchasesItem.value
    ? allItems.value.find((i) => i.id === purchasesItem.value)?.name
    : 'All Items'
  const modeLabel =
    purchasesViewMode.value === 'by_item'
      ? 'Grouped by Item'
      : purchasesViewMode.value === 'by_supplier'
      ? 'Grouped by Supplier'
      : 'Detailed (By Date)'
  return `Period: ${purchasesFrom.value} to ${purchasesTo.value} | View: ${modeLabel} | Source: ${purchasesSource.value.toUpperCase()} | Supplier: ${suppName} | Item: ${itmName}`
})

async function exportPurchasesPDF() {
  const mode = purchasesViewMode.value
  let foot = []
  if (mode === 'detailed') {
    foot = [
      [
        `TOTAL (${purchasesTableTotals.value.recordCount} Transactions)`,
        '',
        '',
        '',
        '',
        '',
        '',
        Number(purchasesTableTotals.value.totalQty.toFixed(2)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        '',
        fmtCur(purchasesTableTotals.value.totalAmount),
      ],
    ]
  } else if (mode === 'by_item') {
    foot = [
      [
        `TOTAL (${purchasesTableTotals.value.recordCount} Items)`,
        '',
        '',
        '',
        Number(purchasesTableTotals.value.totalQty.toFixed(2)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        '',
        fmtCur(purchasesTableTotals.value.totalAmount),
        '',
        '',
        '',
      ],
    ]
  } else {
    foot = [
      [
        `TOTAL (${purchasesTableTotals.value.recordCount} Rows)`,
        '',
        '',
        '',
        Number(purchasesTableTotals.value.totalQty.toFixed(2)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        '',
        fmtCur(purchasesTableTotals.value.totalAmount),
        '100%',
        '',
        '',
      ],
    ]
  }
  await exportPDF(
    activePurchaseCols.value,
    activePurchaseRows.value,
    'Purchases Report',
    purchasesSubtitle.value,
    foot,
  )
}

async function printPurchases() {
  const mode = purchasesViewMode.value
  let foot = []
  if (mode === 'detailed') {
    foot = [
      [
        `TOTAL (${purchasesTableTotals.value.recordCount} Transactions)`,
        '',
        '',
        '',
        '',
        '',
        '',
        Number(purchasesTableTotals.value.totalQty.toFixed(2)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        '',
        fmtCur(purchasesTableTotals.value.totalAmount),
      ],
    ]
  } else if (mode === 'by_item') {
    foot = [
      [
        `TOTAL (${purchasesTableTotals.value.recordCount} Items)`,
        '',
        '',
        '',
        Number(purchasesTableTotals.value.totalQty.toFixed(2)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        '',
        fmtCur(purchasesTableTotals.value.totalAmount),
        '',
        '',
        '',
      ],
    ]
  } else {
    foot = [
      [
        `TOTAL (${purchasesTableTotals.value.recordCount} Rows)`,
        '',
        '',
        '',
        Number(purchasesTableTotals.value.totalQty.toFixed(2)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        '',
        fmtCur(purchasesTableTotals.value.totalAmount),
        '100%',
        '',
        '',
      ],
    ]
  }
  await printReport(
    activePurchaseCols.value,
    activePurchaseRows.value,
    'Purchases Report',
    purchasesSubtitle.value,
    foot,
  )
}

function exportPurchasesExcel() {
  exportExcel(
    activePurchaseCols.value,
    activePurchaseRows.value,
    `Purchases_Report_${purchasesViewMode.value}`,
  )
}

</script>
