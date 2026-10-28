<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="request_quote"
      subtitle="Supplier bills, ageing and payments"
      title="Accounts Payable"
      breadcrumbs="Finance / Receivables & Payables / AP"
      show-refresh
      @refresh="loadData"
    >
      <template #actions>
        <q-input
          v-model="searchQuery"
          placeholder="Search supplier or bill..."
          outlined
          dense
          color="primary"
          clearable
          style="min-width: 220px"
          class="q-mr-sm"
        >
          <template #prepend>
            <q-icon name="search" size="xs" />
          </template>
        </q-input>

        <q-select
          v-model="selectedBank"
          :options="bankOptions"
          label="Filter by Bank"
          outlined
          dense
          color="primary"
          style="min-width: 180px"
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
          no-caps
        />
        <q-btn
          unelevated
          icon="table_chart"
          color="green-6"
          label="Excel"
          @click="exportBankXLSX"
          no-caps
        />
      </template>
    </FinancePageHeader>

    <!-- ══ KPI AGING CARDS ══════════════════════════════════════════════ -->
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="(bucket, i) in agingBuckets" :key="i" class="col-12 col-sm-6 col-md">
        <div :class="['fin-kpi-card', bucket.colorClass]">
          <div class="fin-kpi-card__icon">
            <q-icon name="schedule" size="18px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">{{ bucket.label }}</div>
            <div class="fin-kpi-card__value">LKR {{ fmt(bucket.total) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ GL CONTROL BANNER (sub-ledger vs 2000) ══════════════════════ -->
    <div v-if="apControl" class="fin-panel q-mb-md ap-control" :class="{ 'ap-control--warn': !apControl.reconciled }">
      <div class="row items-center q-col-gutter-md">
        <div class="col-12 col-md-auto row items-center no-wrap">
          <q-icon
            :name="apControl.reconciled ? 'verified' : 'warning'"
            size="26px"
            :color="apControl.reconciled ? 'positive' : 'amber'"
          />
          <span class="text-weight-bold q-ml-sm">AP control (ledger 2000)</span>
        </div>
        <div class="col-6 col-md">
          <div class="text-caption text-grey-5">Open posted bills ({{ apControl.open_bills_count }})</div>
          <div class="text-weight-bold">LKR {{ fmt(apControl.open_bills_total) }}</div>
        </div>
        <div class="col-6 col-md">
          <div class="text-caption text-grey-5">Σ Supplier balances</div>
          <div class="text-weight-bold">LKR {{ fmt(apControl.suppliers_balance_total) }}</div>
        </div>
        <div class="col-6 col-md">
          <div class="text-caption text-grey-5">GL 2000 Accounts Payable (Cr)</div>
          <div class="text-weight-bold">LKR {{ fmt(apControl.ledger_balance) }}</div>
        </div>
        <div class="col-6 col-md">
          <div class="text-caption text-grey-5">Difference (bills − GL)</div>
          <div class="text-weight-bolder" :class="apControl.reconciled ? 'text-positive' : 'text-negative'">
            LKR {{ fmt(apControl.difference) }}
          </div>
        </div>
      </div>
      <div v-if="!apControl.reconciled" class="text-caption text-amber-4 q-mt-sm">
        <template v-if="!apControl.ledger_found">Ledger 2000 Accounts Payable was not found in the chart of accounts.</template>
        <template v-else>
          The AP sub-ledger and GL 2000 do not agree. Check manual journals / vouchers posted to 2000, or bills and
          payments changed outside Procurement.
        </template>
      </div>
    </div>

    <!-- ══ AP LEDGER ENTRIES TABLE ═════════════════════════════════════ -->
    <div class="fin-panel">
      <div class="fin-panel__header row items-center justify-between">
        <span class="fin-panel__title">AP Ledger Entries ({{ filteredPayables.length }})</span>
        <div class="text-caption text-grey-6">
          Click any <strong class="text-primary">Bill #</strong> to view items or make payment
        </div>
      </div>

      <div v-if="unpostedAp.count > 0" class="text-caption text-amber-4 q-mb-sm">
        <q-icon name="pending_actions" size="14px" />
        {{ unpostedAp.count }} bill{{ unpostedAp.count === 1 ? '' : 's' }} (LKR {{ fmt(unpostedAp.total) }})
        {{ unpostedAp.count === 1 ? 'is' : 'are' }} still draft and not listed — they must be posted (Procurement → AP Invoices) before payment.
      </div>

      <!-- Multi-bill selection action bar -->
      <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
        <div
          v-if="selectedRows.length > 0"
          class="row items-center justify-between q-pa-sm q-mb-sm rounded-borders text-white shadow-2"
          style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)"
        >
          <div class="row items-center q-gutter-sm">
            <q-badge color="positive" class="text-weight-bold q-pa-xs">
              {{ selectedRows.length }} Bill{{ selectedRows.length > 1 ? 's' : '' }} Selected
            </q-badge>
            <span class="text-weight-bold">Total Due: LKR {{ fmt(selectedTotalDue) }}</span>
            <span v-if="selectedSupplierSummary" class="text-caption text-amber-2">
              ({{ selectedSupplierSummary }})
            </span>
          </div>
          <div class="row q-gutter-xs">
            <q-btn
              v-if="selectionSupplierId && supplierPayableCount(selectionSupplierId) > selectedRows.length"
              flat
              dense
              color="white"
              icon="library_add_check"
              :label="`Select all ${supplierPayableCount(selectionSupplierId)} of this supplier`"
              no-caps
              @click="selectAllOfSupplier(selectionSupplierId)"
            />
            <q-btn
              unelevated
              color="positive"
              icon="payments"
              :label="'Pay Selected Bills (' + selectedRows.length + ')'"
              no-caps
              @click="openPaySelectedDialog"
            />
            <q-btn flat dense color="white" label="Clear Selection" no-caps @click="selectedRows = []" />
          </div>
        </div>
      </transition>

      <q-table
        :rows="filteredPayables"
        :columns="columns"
        row-key="id"
        selection="multiple"
        v-model:selected="selectedRows"
        flat
        dense
        :rows-per-page-options="[20, 50, 100]"
        :pagination="{ sortBy: 'doc_date', descending: true, rowsPerPage: 20 }"
        class="fin-table"
        :loading="loading"
        no-data-label="No payable entries found"
      >
        <template #body-cell-supplier="props">
          <q-td :props="props">
            <div class="row items-center no-wrap">
              <span class="text-weight-bold">{{ props.row.supplier_name }}</span>
              <q-btn
                v-if="supplierPayableCount(props.row.supplier_id) > 1"
                flat
                round
                dense
                size="xs"
                color="primary"
                icon="library_add_check"
                class="q-ml-xs"
                @click.stop="selectAllOfSupplier(props.row.supplier_id)"
              >
                <q-tooltip>Select all {{ supplierPayableCount(props.row.supplier_id) }} open bills of this supplier</q-tooltip>
              </q-btn>
            </div>
            <div class="text-caption text-grey-5" v-if="props.row.bank_name || props.row.bank_account_number">
              {{ props.row.bank_name || 'Bank' }}: {{ props.row.bank_account_number || '-' }}
            </div>
          </q-td>
        </template>

        <template #body-cell-doc_number="props">
          <q-td :props="props">
            <span
              class="text-weight-bold text-primary cursor-pointer text-decoration-underline"
              @click="openInvoiceDetails(props.row)"
            >
              <q-icon name="receipt_long" size="15px" class="q-mr-xs text-primary" />
              {{ props.row.doc_number }}
            </span>
          </q-td>
        </template>

        <template #body-cell-credit="props">
          <q-td :props="props" class="text-right text-weight-bold text-amber-4">
            LKR {{ fmt(props.row.credit) }}
          </q-td>
        </template>

        <template #body-cell-debit="props">
          <q-td :props="props" class="text-right text-green-4">
            LKR {{ fmt(props.row.debit) }}
          </q-td>
        </template>

        <template #body-cell-balance="props">
          <q-td :props="props" class="text-right text-weight-bolder text-red-4">
            LKR {{ fmt(props.row.balance) }}
          </q-td>
        </template>

        <template #body-cell-aging_bucket="props">
          <q-td :props="props" class="text-center">
            <span :class="bucketClass(props.row.aging_bucket)">{{ props.row.aging_bucket }}</span>
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props" class="text-center">
            <q-btn
              v-if="isPayableBill(props.row)"
              unelevated
              dense
              no-caps
              size="sm"
              color="positive"
              icon="payments"
              label="Pay Bill"
              @click="openPayDialog(props.row)"
            >
              <q-tooltip>Pay this invoice</q-tooltip>
            </q-btn>
            <q-badge v-else color="grey-8" label="Paid" />
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- ══ INVOICE DETAILS MODAL (CLICKED FROM BILL #) ═════════════════ -->
    <q-dialog v-model="showInvoiceDialog" persistent>
      <q-card style="min-width: 650px; max-width: 95vw" :class="[$q.dark.isActive ? 'bg-grey-10 text-white' : 'bg-white text-dark']">
        <q-card-section class="row items-center q-pa-md" :style="{ background: 'linear-gradient(135deg, #0f4c75 0%, #1976d2 100%)' }">
          <q-icon name="receipt" color="white" size="24px" class="q-mr-sm" />
          <div class="text-h6 text-white text-weight-bold">{{ selectedInvoice?.doc_number }}</div>
          <q-space />
          <q-badge
            :color="selectedInvoice?.status === 'paid' ? 'positive' : selectedInvoice?.status === 'posted' ? 'info' : 'warning'"
            class="text-uppercase text-weight-bold q-mr-md q-px-sm"
          >
            {{ selectedInvoice?.status }}
          </q-badge>
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md">
          <!-- Supplier & Meta Info -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-6">
              <div class="text-caption text-grey-5">Supplier</div>
              <div class="text-weight-bold text-subtitle2">{{ selectedInvoice?.suppliers?.name }}</div>
              <div class="text-caption text-grey-6" v-if="selectedInvoice?.suppliers?.bank_name">
                🏦 {{ selectedInvoice.suppliers.bank_name }} — {{ selectedInvoice.suppliers.bank_account_number || '-' }}
              </div>
              <div class="text-caption text-grey-6" v-if="selectedInvoice?.suppliers?.phone">
                📞 {{ selectedInvoice.suppliers.phone }}
              </div>
            </div>
            <div class="col-12 col-md-6">
              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <div class="text-caption text-grey-5">Bill Date</div>
                  <div class="text-weight-bold">{{ selectedInvoice?.doc_date || '-' }}</div>
                </div>
                <div class="col-6">
                  <div class="text-caption text-grey-5">Due Date</div>
                  <div class="text-weight-bold text-orange">{{ selectedInvoice?.due_date || '-' }}</div>
                </div>
                <div class="col-12" v-if="selectedInvoice?.remarks">
                  <div class="text-caption text-grey-5">Remarks</div>
                  <div class="text-caption">{{ selectedInvoice.remarks }}</div>
                </div>
              </div>
            </div>
          </div>

          <q-separator class="q-my-sm" />

          <!-- Invoice Lines Table -->
          <div class="text-caption text-weight-bold text-uppercase q-mb-xs text-grey-6">Items / Goods Received</div>
          <q-table
            :rows="invoiceLines"
            :columns="lineColumns"
            row-key="id"
            flat
            dense
            :loading="loadingLines"
            :pagination="{ rowsPerPage: 10 }"
            class="fin-table q-mb-md"
            no-data-label="No line items found for this bill"
          />

          <!-- Totals Breakdown -->
          <div class="row justify-end q-mt-sm">
            <div style="min-width: 280px" class="q-gutter-xs">
              <div class="row justify-between text-body2">
                <span class="text-grey-6">Total Billed:</span>
                <span class="text-weight-bold">LKR {{ fmt(selectedInvoice?.total_amount) }}</span>
              </div>
              <div class="row justify-between text-body2">
                <span class="text-grey-6">Amount Paid:</span>
                <span class="text-weight-bold text-green">LKR {{ fmt(selectedInvoice?.paid_amount) }}</span>
              </div>
              <q-separator class="q-my-xs" />
              <div class="row justify-between text-subtitle1">
                <span class="text-weight-bold">Balance Due:</span>
                <span class="text-weight-bolder text-red">LKR {{ fmt(selectedInvoice?.balance_due) }}</span>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md fin-surface-2">
          <q-btn flat label="Close" color="grey-4" v-close-popup no-caps />
          <q-btn
            v-if="isPayableBill(selectedInvoice)"
            unelevated
            color="positive"
            icon="payments"
            label="Pay This Bill"
            no-caps
            @click="openPayFromInvoice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ PAY BILL / RECORD SUPPLIER PAYMENT DIALOG ═══════════════════ -->
    <q-dialog v-model="showPayDialog" persistent :maximized="$q.screen.lt.sm">
      <q-card style="width: 820px; max-width: 95vw" :class="[$q.dark.isActive ? 'bg-grey-10 text-white' : 'bg-white text-dark']">
        <q-card-section class="row items-center bg-positive text-white q-pa-md">
          <q-icon name="payments" size="24px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">
            Record Supplier Payment {{ payCheck.selectedCount > 1 ? `(${payCheck.selectedCount} Bills)` : '' }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md q-gutter-md">
          <!-- Supplier banner -->
          <div class="rounded-borders q-pa-sm" :class="$q.dark.isActive ? 'fin-surface-2' : 'bg-grey-2'">
            <div class="row justify-between items-center q-col-gutter-sm">
              <div>
                <div class="text-caption text-grey-6">Supplier / Payee</div>
                <div class="text-weight-bold text-subtitle2">{{ paySupplier.name }}</div>
              </div>
              <div class="text-right">
                <div class="text-caption text-grey-6">
                  Total Open ({{ payLines.length }} bill{{ payLines.length === 1 ? '' : 's' }})
                </div>
                <div class="text-subtitle1 text-weight-bolder text-red-5">LKR {{ fmt(paySupplierOpenTotal) }}</div>
              </div>
            </div>
          </div>

          <!-- Bills of this supplier -->
          <div>
            <div class="row items-center justify-between q-mb-xs q-col-gutter-xs">
              <div class="text-caption text-weight-bold">Bills to settle *</div>
              <div class="row q-gutter-xs">
                <q-btn flat dense no-caps size="sm" color="primary" icon="done_all" label="Select all" @click="selectAllPayLines" />
                <q-btn flat dense no-caps size="sm" color="grey-6" icon="remove_done" label="Clear" @click="clearPayLines" />
                <q-btn
                  flat
                  dense
                  no-caps
                  size="sm"
                  color="primary"
                  icon="low_priority"
                  label="Auto-allocate oldest-first"
                  @click="autoAllocateAllLines"
                >
                  <q-tooltip>Spread the payment amount over this supplier's bills, oldest first</q-tooltip>
                </q-btn>
              </div>
            </div>
            <div class="pay-lines-wrap rounded-borders">
              <q-markup-table flat dense :dark="$q.dark.isActive" separator="horizontal" class="pay-lines-table">
                <thead>
                  <tr>
                    <th class="text-left" style="width: 36px"></th>
                    <th class="text-left">Bill #</th>
                    <th class="text-left gt-xs">Date</th>
                    <th class="text-left gt-xs">Due</th>
                    <th class="text-right">Balance Due</th>
                    <th class="text-right" style="width: 150px">Amount to Pay</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="line in payLines"
                    :key="line.id"
                    :class="{ 'pay-line--selected': line.selected }"
                  >
                    <td>
                      <q-checkbox
                        :model-value="line.selected"
                        dense
                        :dark="$q.dark.isActive"
                        @update:model-value="(v) => togglePayLine(line, v)"
                      />
                    </td>
                    <td class="text-weight-bold">
                      {{ line.doc_number }}
                      <div class="text-caption text-grey-6 lt-sm">{{ line.doc_date || '-' }}</div>
                    </td>
                    <td class="gt-xs">{{ line.doc_date || '-' }}</td>
                    <td class="gt-xs">{{ line.due_date || '-' }}</td>
                    <td class="text-right">LKR {{ fmt(line.balance) }}</td>
                    <td class="text-right">
                      <q-input
                        :model-value="line.allocation"
                        type="number"
                        dense
                        outlined
                        :dark="$q.dark.isActive"
                        min="0"
                        :max="line.balance"
                        step="0.01"
                        input-class="text-right"
                        :disable="!line.selected"
                        @update:model-value="(v) => onLineAllocationInput(line, v)"
                        @blur="onLineAllocationBlur(line)"
                      />
                    </td>
                  </tr>
                  <tr v-if="payLines.length === 0">
                    <td colspan="6" class="text-center text-grey-6 q-pa-md">No payable bills for this supplier.</td>
                  </tr>
                </tbody>
              </q-markup-table>
            </div>
          </div>

          <!-- Amount to pay -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Payment Amount (LKR) *</div>
            <q-input
              v-model.number="payForm.amount"
              type="number"
              outlined
              dense
              :dark="$q.dark.isActive"
              min="0.01"
              step="0.01"
              prefix="LKR"
              debounce="400"
              hint="Typing an amount spreads it over the ticked bills, oldest first"
              @update:model-value="onPayAmountInput"
            />
          </div>

          <!-- Allocation summary -->
          <div class="rounded-borders q-pa-sm" :class="$q.dark.isActive ? 'fin-surface-2' : 'bg-grey-2'">
            <div class="row q-col-gutter-sm text-center">
              <div class="col-6 col-sm-3">
                <div class="text-caption text-grey-6">Bills selected</div>
                <div class="text-weight-bold">{{ payCheck.allocations.length }} / {{ payLines.length }}</div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="text-caption text-grey-6">Total allocated</div>
                <div class="text-weight-bold">LKR {{ fmt(payCheck.allocated) }}</div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="text-caption text-grey-6">Payment amount</div>
                <div class="text-weight-bold">LKR {{ fmt(payCheck.amount) }}</div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="text-caption text-grey-6">Difference</div>
                <div class="text-weight-bolder" :class="payCheck.difference === 0 ? 'text-positive' : 'text-negative'">
                  LKR {{ fmt(payCheck.difference) }}
                </div>
              </div>
            </div>
            <div v-if="!payCheck.valid" class="row items-center justify-between q-mt-sm q-col-gutter-xs">
              <div class="text-caption text-negative">
                <q-icon name="warning" size="14px" />
                {{ payCheck.errors[0] }}
              </div>
              <q-btn
                v-if="payCheck.difference !== 0 && payCheck.allocated > 0"
                outline
                dense
                no-caps
                size="sm"
                color="primary"
                icon="sync_alt"
                label="Set amount = allocated"
                @click="syncAmountToAllocated"
              />
            </div>
          </div>

          <!-- Payment Date & Method -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div class="text-caption text-weight-bold q-mb-xs">Payment Date *</div>
              <q-input v-model="payForm.doc_date" type="date" outlined dense />
            </div>
            <div class="col-6">
              <div class="text-caption text-weight-bold q-mb-xs">Payment Method *</div>
              <q-select
                v-model="payForm.payment_method"
                :options="['Cheque', 'Bank Transfer', 'Cash']"
                outlined
                dense
              />
            </div>
          </div>

          <!-- Paying Account (from finance_accounts) -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">
              {{ (payForm.payment_method || '').toLowerCase().includes('cash') ? 'Paying Cash Account *' : 'Paying Bank Account *' }}
            </div>
            <q-select
              v-model="payForm.bank_account_id"
              :options="payingAccountOptions"
              outlined
              dense
              emit-value
              map-options
              :placeholder="(payForm.payment_method || '').toLowerCase().includes('cash') ? 'Select cash drawer / account' : 'Select bank account'"
            >
              <template #prepend>
                <q-icon :name="(payForm.payment_method || '').toLowerCase().includes('cash') ? 'payments' : 'account_balance'" size="18px" />
              </template>
            </q-select>
            <div class="text-caption text-grey-5 q-mt-xs">
              💵 This account balance will be DEDUCTED and Accounts Payable (2000) will be DEBITED.
            </div>
          </div>

          <!-- CHEQUE PAYMENT SPECIAL CONTROLS -->
          <div v-if="(payForm.payment_method || '').toLowerCase().includes('cheque')" class="q-pa-sm fin-surface-2 rounded-borders q-gutter-xs">
            <div class="row items-center justify-between q-mb-xs">
              <span class="text-caption text-weight-bold text-indigo-3">Cheque Selection Mode</span>
              <div class="row q-gutter-sm">
                <q-radio v-model="payForm.cheque_source" val="planned" label="Select Planned Cheque" dense />
                <q-radio v-model="payForm.cheque_source" val="new" label="Enter New Cheque" dense />
              </div>
            </div>

            <!-- Planned Cheque Dropdown -->
            <div v-if="payForm.cheque_source === 'planned'" class="q-mb-xs">
              <div class="text-caption text-weight-bold q-mb-xs">Select Planned Cheque *</div>
              <q-select
                v-model="payForm.selected_planned_cheque"
                :options="plannedChequeOptions"
                outlined
                dense
                emit-value
                map-options
                placeholder="Choose available planned cheque"
                @update:model-value="onPlannedChequeSelected"
              >
                <template #no-option>
                  <div class="q-pa-sm text-caption text-grey-5">
                    No planned cheques found for this bank account. Switch to "Enter New Cheque" or plan one in Cheque Plan.
                  </div>
                </template>
              </q-select>
            </div>

            <!-- Cheque Number & Cheque Date -->
            <div class="row q-col-gutter-sm q-mt-xs">
              <div class="col-6">
                <div class="text-caption text-weight-bold q-mb-xs">Cheque Number *</div>
                <q-input
                  v-model="payForm.reference"
                  placeholder="e.g. 578427"
                  outlined
                  dense
                  :readonly="payForm.cheque_source === 'planned' && !!payForm.selected_planned_cheque"
                />
              </div>
              <div class="col-6">
                <div class="text-caption text-weight-bold q-mb-xs">Cheque Date * (PDC Support)</div>
                <q-input v-model="payForm.cheque_date" type="date" outlined dense />
              </div>
            </div>
          </div>

          <!-- Non-Cheque Reference -->
          <div v-else>
            <div class="text-caption text-weight-bold q-mb-xs">Reference Number</div>
            <q-input v-model="payForm.reference" placeholder="e.g. TRF-99210" outlined dense />
          </div>

          <!-- Remarks -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Remarks</div>
            <q-input v-model="payForm.remarks" placeholder="Optional notes" outlined dense />
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md" :class="$q.dark.isActive ? 'fin-surface-2' : 'bg-grey-2'">
          <q-btn flat label="Cancel" color="grey-6" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Confirm Payment"
            color="positive"
            icon="check_circle"
            no-caps
            :loading="paying"
            :disable="!payCheck.valid"
            @click="submitSupplierPayment"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { todayLK } from 'src/modules/finance/utils/finance-dates'
import { ref, computed, reactive, watch, onMounted } from 'vue'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import { fetchPayableAging, fetchUnpostedApSummary, fetchApControl } from 'src/services/financeService'
import {
  createAndPostPayment,
  isPayableBill,
  compareBillsOldestFirst,
  allocateOldestFirst,
  clampAllocation,
  sumAmounts,
  checkPaymentAllocations,
} from 'src/services/procurementService'
import { useQuasar } from 'quasar'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const loading = ref(false)
const payables = ref([])
/** Draft/approved bills — not payable until posted, so not listed. */
const unpostedAp = ref({ count: 0, total: 0 })
const apControl = ref(null)
const companyBankAccounts = ref([])
const financeAccounts = ref([])

const searchQuery = ref('')
const selectedBank = ref('All Banks')
const bankOptions = ['All Banks', 'BOC', 'HNB', 'Commercial Bank', 'Sampath Bank']

// Multi-bill selection
const selectedRows = ref([])
const selectedTotalDue = computed(() => {
  return selectedRows.value.reduce((s, r) => s + Number(r.balance || 0), 0)
})
const selectedSupplierSummary = computed(() => {
  if (selectedRows.value.length === 0) return ''
  const names = [...new Set(selectedRows.value.map((r) => r.supplier_name))]
  if (names.length === 1) return names[0]
  return `${names.length} different suppliers`
})
/** Supplier id when the whole selection belongs to one supplier, else null. */
const selectionSupplierId = computed(() => {
  const ids = [...new Set(selectedRows.value.map((r) => r.supplier_id))]
  return ids.length === 1 ? ids[0] : null
})
/** Open (payable) bills per supplier, from the loaded AP list. */
const payableBySupplier = computed(() => {
  const map = new Map()
  for (const r of payables.value) {
    if (!isPayableBill(r)) continue
    if (!map.has(r.supplier_id)) map.set(r.supplier_id, [])
    map.get(r.supplier_id).push(r)
  }
  return map
})
function supplierPayableCount(supplierId) {
  return payableBySupplier.value.get(supplierId)?.length || 0
}
/** Replace the selection with every open bill of this supplier. */
function selectAllOfSupplier(supplierId) {
  const bills = payableBySupplier.value.get(supplierId) || []
  if (bills.length === 0) return
  selectedRows.value = [...bills].sort(compareBillsOldestFirst)
}

// ── Invoices Details State ──────────────────────────────────────────
const showInvoiceDialog = ref(false)
const selectedInvoice = ref(null)
const invoiceLines = ref([])
const loadingLines = ref(false)

const lineColumns = [
  { name: 'line_number', label: '#', field: 'line_number', align: 'center', style: 'width: 40px' },
  { name: 'item_code', label: 'Item Code', field: (r) => r.items?.code || '-', align: 'left' },
  { name: 'item_name', label: 'Item Name', field: (r) => r.items?.name || r.description || '-', align: 'left' },
  { name: 'quantity', label: 'Quantity', field: 'quantity', align: 'right' },
  { name: 'unit_price', label: 'Unit Price', field: 'unit_price', align: 'right', format: (v) => `LKR ${fmt(v)}` },
  { name: 'line_total', label: 'Total', field: 'line_total', align: 'right', format: (v) => `LKR ${fmt(v)}` },
]

// ── Payment Dialog State ────────────────────────────────────────────
const showPayDialog = ref(false)
/** Supplier of the payment being recorded (one payment = one supplier). */
const paySupplier = ref({ id: null, name: '' })
/**
 * All open payable bills of that supplier, oldest first:
 * { id, supplier_id, status, doc_number, doc_date, due_date, balance, balance_due, selected, allocation }
 */
const payLines = ref([])
const paying = ref(false)
const plannedCheques = ref([])

const paySupplierOpenTotal = computed(() => sumAmounts(payLines.value.map((l) => l.balance)))

function allocatedTotal() {
  return sumAmounts(payLines.value.filter((l) => l.selected).map((l) => l.allocation))
}

const plannedChequeOptions = computed(() => {
  return plannedCheques.value.map((c) => ({
    label: `Cheque #${c.cheque_no} (${c.cheque_date}) — LKR ${fmt(c.amount)} ${c.issued_to ? '— ' + c.issued_to : ''}`,
    value: c.id,
    cheque: c,
  }))
})

const payForm = reactive({
  amount: 0,
  doc_date: todayLK(),
  payment_method: 'Cheque',
  bank_account_id: null,
  reference: '',
  remarks: '',
  cheque_source: 'planned',
  selected_planned_cheque: null,
  cheque_date: todayLK(),
  cheque_id: null,
})

/** Live validation of the allocation table (mirrors server rules #128/#140). */
const payCheck = computed(() => checkPaymentAllocations(payLines.value, payForm.amount))

/** Default remarks follow the ticked bills until the user types their own. */
function autoRemarks() {
  return `Payment for ${payLines.value
    .filter((l) => l.selected)
    .map((l) => l.doc_number)
    .join(', ')}`
}
let lastAutoRemarks = ''
watch(
  () => payLines.value.filter((l) => l.selected).map((l) => l.id).join(','),
  () => {
    if (!showPayDialog.value || payForm.remarks !== lastAutoRemarks) return
    lastAutoRemarks = autoRemarks()
    payForm.remarks = lastAutoRemarks
  },
)

/** Editing lines drives the payment amount. */
function syncAmountToAllocated() {
  payForm.amount = allocatedTotal()
}

function togglePayLine(line, value) {
  line.selected = !!value
  line.allocation = line.selected ? line.balance : 0
  syncAmountToAllocated()
}

function onLineAllocationInput(line, value) {
  const n = value === '' || value === null ? 0 : Number(value)
  // Over-allocation is clamped straight away; rounding to cents happens on blur
  line.allocation = Number.isFinite(n) && n > line.balance ? line.balance : value
  syncAmountToAllocated()
}

function onLineAllocationBlur(line) {
  line.allocation = clampAllocation(line.allocation, line.balance)
  syncAmountToAllocated()
}

function selectAllPayLines() {
  for (const l of payLines.value) {
    l.selected = true
    l.allocation = l.balance
  }
  syncAmountToAllocated()
}

function clearPayLines() {
  for (const l of payLines.value) {
    l.selected = false
    l.allocation = 0
  }
  syncAmountToAllocated()
}

/** Spread `amount` over the given lines oldest-first; the rest of them get 0. */
function spreadAmount(lines, amount) {
  const { allocations } = allocateOldestFirst(
    lines.map((l) => ({ ...l, balance_due: l.balance })),
    amount,
  )
  const byId = new Map(allocations.map((a) => [a.invoice_id, a.amount]))
  for (const l of lines) l.allocation = byId.get(l.id) || 0
  return byId
}

/** Typing a payment amount re-spreads it over the ticked bills, oldest first. */
function onPayAmountInput(value) {
  const ticked = payLines.value.filter((l) => l.selected)
  if (ticked.length === 0) return
  spreadAmount(ticked, value)
}

/** Spread the payment amount over ALL of the supplier's bills, ticking the ones that get paid. */
function autoAllocateAllLines() {
  const typed = Number(payForm.amount) || 0
  const amount = typed > 0 ? typed : paySupplierOpenTotal.value
  const byId = spreadAmount(payLines.value, amount)
  for (const l of payLines.value) l.selected = byId.has(l.id)
  if (typed <= 0) {
    syncAmountToAllocated()
  } else if (typed > paySupplierOpenTotal.value) {
    $q.notify({
      type: 'warning',
      message: `Amount exceeds this supplier's open balance (LKR ${fmt(paySupplierOpenTotal.value)}).`,
    })
  }
}

// Dynamic account filtering: Cash vs Bank based on payment method
const payingAccountOptions = computed(() => {
  const method = (payForm.payment_method || '').toLowerCase()
  const isCash = method.includes('cash')

  const filtered = financeAccounts.value.filter((a) => {
    if (isCash) {
      return a.account_type === 'cash'
    } else {
      return a.account_type === 'bank'
    }
  })

  return filtered.map((a) => {
    const typeLabel = a.account_type === 'cash' ? 'Cash Account' : (a.bank_name || 'Bank')
    const accNum = a.account_number ? ` (${a.account_number})` : ''
    return {
      label: `${a.registered_name}${accNum} [${typeLabel}] — LKR ${fmt(a.current_balance)}`,
      value: a.id,
      account_type: a.account_type,
    }
  })
})

async function loadPlannedCheques(bankAccountId = null) {
  let q = supabase
    .from('finance_cheques')
    .select('id, cheque_no, cheque_date, amount, issued_to, bank_account_id')
    .eq('status', 'planned')
    .order('cheque_date', { ascending: true })

  if (bankAccountId) {
    q = q.eq('bank_account_id', bankAccountId)
  }

  const { data } = await q
  plannedCheques.value = data || []
}

function onPlannedChequeSelected(val) {
  const opt = plannedChequeOptions.value.find((o) => o.value === val)
  if (opt?.cheque) {
    const c = opt.cheque
    payForm.reference = c.cheque_no
    payForm.cheque_date = c.cheque_date
    if (Number(c.amount) > 0) {
      payForm.amount = Number(c.amount)
      onPayAmountInput(payForm.amount)
    }
    payForm.cheque_id = c.id
  }
}

// Auto-switch selected account when payment method toggles between Cash and Bank
watch(
  () => payForm.payment_method,
  async (newMethod) => {
    const opts = payingAccountOptions.value
    if (opts.length > 0) {
      const stillValid = opts.some((o) => o.value === payForm.bank_account_id)
      if (!stillValid) {
        payForm.bank_account_id = opts[0].value
      }
    } else {
      payForm.bank_account_id = null
    }

    if (newMethod && newMethod.toLowerCase().includes('cheque')) {
      await loadPlannedCheques(payForm.bank_account_id)
      if (plannedCheques.value.length === 0) {
        payForm.cheque_source = 'new'
      }
    }
  },
)

watch(
  () => payForm.bank_account_id,
  async (newAccId) => {
    if (newAccId && payForm.payment_method.toLowerCase().includes('cheque')) {
      await loadPlannedCheques(newAccId)
    }
  },
)

// ── Table Columns ───────────────────────────────────────────────────
const columns = [
  { name: 'supplier', label: 'Supplier & Bank', field: 'supplier_name', align: 'left' },
  { name: 'doc_number', label: 'Bill / Doc #', field: 'doc_number', align: 'left' },
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'credit', label: 'Billed Amount (LKR)', field: 'credit', align: 'right' },
  { name: 'debit', label: 'Paid (LKR)', field: 'debit', align: 'right' },
  { name: 'balance', label: 'Balance Due (LKR)', field: 'balance', align: 'right' },
  { name: 'due_date', label: 'Due Date', field: 'due_date', align: 'left' },
  { name: 'aging_bucket', label: 'Aging', field: 'aging_bucket', align: 'center' },
  { name: 'actions', label: 'Action', field: 'id', align: 'center' },
]

// ── Filtered Payables ───────────────────────────────────────────────
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

  if (searchQuery.value && searchQuery.value.trim() !== '') {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(
      (p) =>
        (p.supplier_name && p.supplier_name.toLowerCase().includes(q)) ||
        (p.doc_number && p.doc_number.toLowerCase().includes(q)) ||
        (p.bank_name && p.bank_name.toLowerCase().includes(q))
    )
  }

  // Oldest first (payment priority), deterministic within the same day
  return [...list].sort(compareBillsOldestFirst)
})

// ── Aging Buckets ───────────────────────────────────────────────────
const agingBuckets = computed(() => {
  const buckets = { current: 0, '1-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 }
  filteredPayables.value.forEach((p) => {
    if (buckets[p.aging_bucket] !== undefined) buckets[p.aging_bucket] += Number(p.balance || 0)
  })
  return [
    { label: 'Current', total: buckets.current, colorClass: 'fin-kpi-card--green' },
    { label: '1-30 Days', total: buckets['1-30 days'], colorClass: 'fin-kpi-card--amber' },
    { label: '31-60 Days', total: buckets['31-60 days'], colorClass: 'fin-kpi-card--red' },
    { label: '61-90 Days', total: buckets['61-90 days'], colorClass: 'fin-kpi-card--purple' },
    { label: '90+ Days', total: buckets['90+ days'], colorClass: 'fin-kpi-card--red' },
  ]
})

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function bucketClass(b) {
  if (b === 'current') return 'fin-badge fin-badge--success'
  if (b === '1-30 days') return 'fin-badge fin-badge--warning'
  return 'fin-badge fin-badge--danger'
}

const currentDateStr = computed(() => {
  const now = new Date()
  return todayLK(now).replace(/-/g, '/')
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

// ── Open Invoice Details ────────────────────────────────────────────
async function openInvoiceDetails(row) {
  loadingLines.value = true
  showInvoiceDialog.value = true

  try {
    const { data: inv, error } = await supabase
      .from('ap_invoices')
      .select(`
        id, doc_number, doc_date, due_date, total_amount, paid_amount, balance_due, status, remarks, supplier_inv_no, supplier_id,
        suppliers(id, name, bank_name, bank_account_number, bank_branch, phone),
        ap_invoice_lines(id, line_number, description, quantity, unit_price, line_total, item_id, items(id, name, code))
      `)
      .eq('id', row.id)
      .single()

    if (error) throw error

    selectedInvoice.value = inv
    invoiceLines.value = inv.ap_invoice_lines || []
  } catch (err) {
    console.error('Failed to load invoice details:', err)
    $q.notify({ type: 'negative', message: 'Failed to load invoice details: ' + err.message })
  } finally {
    loadingLines.value = false
  }
}

// ── Open Payment Dialog ─────────────────────────────────────────────
async function openPayDialog(row) {
  if (!isPayableBill(row)) {
    $q.notify({ type: 'warning', message: 'Only posted bills with a balance due can be paid. Post the bill first (Procurement → AP Invoices).' })
    return
  }
  await openPaymentFor([row])
}

async function openPaySelectedDialog() {
  if (selectedRows.value.length === 0) {
    $q.notify({ type: 'warning', message: 'Please select at least one bill to pay.' })
    return
  }
  const supIds = [...new Set(selectedRows.value.map((r) => r.supplier_id))]
  if (supIds.length > 1) {
    $q.notify({
      type: 'warning',
      message: 'Multiple suppliers selected. A payment must be issued to a single supplier. Please select bills from one supplier.',
      timeout: 5000,
    })
    return
  }

  if (selectedRows.value.some((r) => !isPayableBill(r))) {
    $q.notify({ type: 'warning', message: 'Only posted bills with a balance due can be paid. Remove draft/settled bills from the selection.' })
    return
  }

  await openPaymentFor(selectedRows.value)
}

/**
 * Build the allocation table: every open payable bill of the supplier, with
 * the chosen bills pre-ticked at their full balance. Other open bills are
 * listed unticked so they can be added without leaving the dialog.
 */
async function openPaymentFor(targets) {
  const first = targets[0]
  paySupplier.value = { id: first.supplier_id, name: first.supplier_name || '' }
  const preselected = new Set(targets.map((t) => t.id))

  const byId = new Map()
  for (const r of [...(payableBySupplier.value.get(first.supplier_id) || []), ...targets]) {
    if (r.supplier_id === first.supplier_id && isPayableBill(r) && !byId.has(r.id)) byId.set(r.id, r)
  }
  payLines.value = [...byId.values()]
    .map((r) => {
      const raw = r.balance ?? r.balance_due
      const balance = clampAllocation(raw, raw)
      const selected = preselected.has(r.id)
      return {
        id: r.id,
        supplier_id: r.supplier_id,
        status: r.status,
        doc_number: r.doc_number,
        doc_date: r.doc_date || null,
        due_date: r.due_date && r.due_date !== '-' ? r.due_date : null,
        balance,
        balance_due: balance,
        selected,
        allocation: selected ? balance : 0,
      }
    })
    .sort(compareBillsOldestFirst)

  await initPaymentForm()
  showPayDialog.value = true
}

async function initPaymentForm() {
  payForm.amount = allocatedTotal()
  payForm.doc_date = todayLK()
  payForm.payment_method = 'Cheque'
  payForm.cheque_source = 'planned'
  payForm.selected_planned_cheque = null
  payForm.cheque_id = null
  payForm.reference = ''
  payForm.cheque_date = todayLK()
  lastAutoRemarks = autoRemarks()
  payForm.remarks = lastAutoRemarks

  const opts = payingAccountOptions.value
  payForm.bank_account_id = opts.length > 0 ? opts[0].value : null

  await loadPlannedCheques(payForm.bank_account_id)
  if (plannedCheques.value.length === 0) {
    payForm.cheque_source = 'new'
  }
}

function openPayFromInvoice() {
  if (!selectedInvoice.value) return
  const target = {
    id: selectedInvoice.value.id,
    supplier_id: selectedInvoice.value.supplier_id,
    supplier_name: selectedInvoice.value.suppliers?.name,
    doc_number: selectedInvoice.value.doc_number,
    doc_date: selectedInvoice.value.doc_date,
    due_date: selectedInvoice.value.due_date,
    status: selectedInvoice.value.status,
    balance: selectedInvoice.value.balance_due,
  }
  openPayDialog(target)
}

// ── Submit Supplier Payment ─────────────────────────────────────────
async function submitSupplierPayment() {
  const check = payCheck.value
  if (!check.valid) {
    $q.notify({ type: 'warning', message: check.errors[0] || 'Check the bill allocations.' })
    return
  }
  if (!payForm.bank_account_id) {
    $q.notify({ type: 'warning', message: 'Please select a paying cash/bank account.' })
    return
  }
  if (!paySupplier.value.id) {
    $q.notify({ type: 'warning', message: 'No supplier selected for payment.' })
    return
  }

  const isCheque = (payForm.payment_method || '').toLowerCase().includes('cheque')
  if (isCheque && payForm.cheque_source === 'planned' && !payForm.selected_planned_cheque) {
    $q.notify({ type: 'warning', message: 'Please select a planned cheque or switch to "Enter New Cheque".' })
    return
  }
  if (isCheque && payForm.cheque_source === 'new' && (!payForm.reference || !payForm.reference.trim())) {
    $q.notify({ type: 'warning', message: 'Please enter the cheque number.' })
    return
  }

  paying.value = true
  try {
    const selectedAcc = financeAccounts.value.find((a) => a.id === payForm.bank_account_id)
    const paymentMethod = (payForm.payment_method || 'bank_transfer').toLowerCase().replace(/ /g, '_')

    // One supplier, posted bills only, 0 < allocation <= balance due and
    // amount == sum(allocations): checked by checkPaymentAllocations here and
    // again server-side (#128/#140).
    const allocations = check.allocations

    const chequeNo = isCheque ? (payForm.reference || null) : null

    const res = await createAndPostPayment(
      {
        supplier_id: paySupplier.value.id,
        supplier_name: paySupplier.value.name,
        doc_date: payForm.doc_date,
        payment_method: paymentMethod,
        reference_no: payForm.reference || null,
        cheque_no: chequeNo,
        cheque_date: isCheque ? payForm.cheque_date : null,
        cheque_id: isCheque && payForm.cheque_source === 'planned' ? payForm.selected_planned_cheque : null,
        total_amount: check.amount,
        remarks: payForm.remarks || null,
        bank_account_code: selectedAcc?.account_number || selectedAcc?.registered_name || null,
        bank_account_id: selectedAcc?.id || null,
      },
      allocations,
      true,
    )

    if (!res.success) {
      throw new Error(res.error || 'Payment failed')
    }

    $q.notify({
      type: 'positive',
      icon: 'check_circle',
      message: `✅ Payment ${res.doc_number || ''} recorded successfully! Bill balance reduced and bank account updated.`,
      timeout: 4500,
    })
    if (res.warning) $q.notify({ type: 'warning', message: res.warning, timeout: 8000 })

    showPayDialog.value = false
    showInvoiceDialog.value = false
    selectedRows.value = []
    await loadData()
  } catch (err) {
    console.error('Payment error:', err)
    $q.notify({ type: 'negative', message: 'Payment failed: ' + err.message })
  } finally {
    paying.value = false
  }
}

// ── PDF Export ──────────────────────────────────────────────────────
function exportBankPDF() {
  const doc = new jsPDF('p', 'mm', 'a4')
  const bName = selectedBank.value
  const companyAcc = getCompanyBankAccount(bName)

  const totalBilled = filteredPayables.value.reduce((s, p) => s + Number(p.credit || 0), 0)
  const totalPaid = filteredPayables.value.reduce((s, p) => s + Number(p.debit || 0), 0)
  const totalBalance = filteredPayables.value.reduce((s, p) => s + Number(p.balance || 0), 0)

  let y = 18

  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.text(currentDateStr.value, 15, y)
  y += 7

  if (bName !== 'All Banks') {
    doc.text('THE MANAGER', 15, y)
    y += 5
    doc.setFont('times', 'bold')
    doc.text(bName.toUpperCase(), 15, y)
    y += 8
  }

  doc.setFontSize(13)
  doc.setFont('times', 'bold')
  const title = `ACCOUNTS PAYABLE TRANSFER – ${currentMonthLabel.value}`
  doc.text(title, 105, y, { align: 'center' })
  doc.setLineWidth(0.5)
  const titleW = doc.getTextWidth(title)
  doc.line(105 - titleW / 2, y + 1, 105 + titleW / 2, y + 1)
  y += 8

  if (bName !== 'All Banks') {
    doc.setFont('times', 'normal')
    doc.setFontSize(10.5)
    doc.text('Dear Sir,', 15, y)
    y += 6

    const bodyText = `Appreciate if you could arrange to Transfer Rs. ${fmt(totalBalance)} to the following supplier accounts as accounts payable settlement for ${currentMonthLabel.value} from Rupee Account No. ${companyAcc}`
    const bodyLines = doc.splitTextToSize(bodyText, 180)
    doc.text(bodyLines, 15, y)
    y += bodyLines.length * 5 + 4
  }

  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.text('Seven Wave Food Court (Pvt) Ltd', 105, y, { align: 'center' })
  y += 5
  doc.setFontSize(10)
  doc.text(`SUPPLIER PAYMENTS – ${currentMonthLabel.value}`, 105, y, { align: 'center' })
  y += 4

  const tableData = filteredPayables.value.map((p, i) => [
    i + 1,
    p.supplier_name || '',
    p.doc_number || '',
    p.bank_account_number || '-',
    `LKR ${fmt(p.credit)}`,
    `LKR ${fmt(p.debit)}`,
    `LKR ${fmt(p.balance)}`,
  ])

  tableData.push([
    '',
    '',
    '',
    'TOTAL',
    `LKR ${fmt(totalBilled)}`,
    `LKR ${fmt(totalPaid)}`,
    `LKR ${fmt(totalBalance)}`,
  ])

  autoTable(doc, {
    startY: y + 2,
    margin: { left: 15, right: 15 },
    head: [['No.', 'Supplier', 'Invoice/Ref', 'Account No.', 'Billed (LKR)', 'Paid (LKR)', 'Balance Due (LKR)']],
    body: tableData,
    theme: 'grid',
    styles: { font: 'times', fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 42 },
      2: { cellWidth: 32 },
      3: { cellWidth: 26 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 24 },
    },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [245, 245, 245]
      }
    },
  })

  y = doc.lastAutoTable.finalY + 12
  if (y > 260) {
    doc.addPage()
    y = 20
  }

  if (bName !== 'All Banks') {
    doc.setFont('times', 'normal')
    doc.setFontSize(11)
    doc.text('Thank You', 15, y)
    y += 18
    doc.text('...................................', 15, y)
    y += 5
    doc.setFont('times', 'bold')
    doc.text('Director', 15, y)
  }

  const filename = `AP_Export_${bName.replace(/\s+/g, '_')}_${currentDateStr.value.replace(/\//g, '')}.pdf`
  doc.save(filename)
  $q.notify({ type: 'positive', icon: 'picture_as_pdf', message: `Downloaded: ${filename}` })
}

// ── Excel Export ────────────────────────────────────────────────────
function exportBankXLSX() {
  const bName = selectedBank.value
  const companyAcc = getCompanyBankAccount(bName)

  const totalBilled = filteredPayables.value.reduce((s, p) => s + Number(p.credit || 0), 0)
  const totalPaid = filteredPayables.value.reduce((s, p) => s + Number(p.debit || 0), 0)
  const totalBalance = filteredPayables.value.reduce((s, p) => s + Number(p.balance || 0), 0)

  const wsData = []
  if (bName !== 'All Banks') {
    wsData.push([currentDateStr.value])
    wsData.push(['THE MANAGER'])
    wsData.push([bName.toUpperCase()])
    wsData.push([])
    wsData.push([`ACCOUNTS PAYABLE TRANSFER – ${currentMonthLabel.value}`])
    wsData.push([])
    wsData.push(['Dear Sir,'])
    wsData.push([
      `Appreciate if you could arrange to Transfer Rs. ${fmt(totalBalance)} to the following supplier accounts as accounts payable settlement for ${currentMonthLabel.value} from Rupee Account No. ${companyAcc}`,
    ])
    wsData.push([])
  }

  wsData.push(['Seven Wave Food Court (Pvt) Ltd'])
  wsData.push([`SUPPLIER PAYMENTS – ${currentMonthLabel.value}`])
  wsData.push([])
  wsData.push([
    'No.',
    'Supplier',
    'Bank',
    'Account No.',
    'Invoice/Ref',
    'Date',
    'Due Date',
    'Billed Amount (LKR)',
    'Paid Amount (LKR)',
    'Balance Due (LKR)',
    'Aging Bucket',
    'Status',
  ])

  filteredPayables.value.forEach((p, i) => {
    wsData.push([
      i + 1,
      p.supplier_name || '',
      p.bank_name || '-',
      p.bank_account_number || '-',
      p.doc_number || '',
      p.doc_date || '',
      p.due_date || '',
      Number(p.credit || 0),
      Number(p.debit || 0),
      Number(p.balance || 0),
      p.aging_bucket || '',
      p.status || '',
    ])
  })

  wsData.push([
    '',
    '',
    '',
    '',
    '',
    '',
    'TOTAL',
    totalBilled,
    totalPaid,
    totalBalance,
    '',
    '',
  ])

  if (bName !== 'All Banks') {
    wsData.push([])
    wsData.push(['Thank You'])
    wsData.push([])
    wsData.push(['...................................'])
    wsData.push(['Director'])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [
    { wch: 8 },
    { wch: 35 },
    { wch: 18 },
    { wch: 22 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, bName.substring(0, 31))

  const filename = `AP_Export_${bName.replace(/\s+/g, '_')}_${currentDateStr.value.replace(/\//g, '')}.xlsx`
  XLSX.writeFile(wb, filename)
  $q.notify({ type: 'positive', icon: 'table_chart', message: `Downloaded: ${filename}` })
}

// ── Initial Load ────────────────────────────────────────────────────
async function loadData() {
  loading.value = true

  // 1. Load company bank accounts for letter header
  const { data: banks } = await supabase
    .from('finance_accounts')
    .select('registered_name, bank_name, account_number, account_type, current_balance, id')
    .eq('is_active', true)
    .is('deleted_at', null)

  financeAccounts.value = banks || []
  companyBankAccounts.value = (banks || [])
    .filter((b) => b.account_type === 'bank')
    .map((b) => ({
      name: b.registered_name,
      bank_name: b.bank_name,
      account_number: b.account_number,
    }))

  // 2. Load payables aging list
  const [{ data, error: agingError }, unposted] = await Promise.all([fetchPayableAging(), fetchUnpostedApSummary()])
  if (agingError) $q.notify({ type: 'negative', message: `Could not load payables: ${agingError.message || agingError}` })
  payables.value = data || []
  unpostedAp.value = unposted.error ? { count: 0, total: 0 } : { count: unposted.count, total: unposted.total }

  // 3. AP control: open bills vs suppliers.balance vs GL 2000 (reuses the bills just loaded)
  const ctrl = agingError
    ? { data: null }
    : await fetchApControl((data || []).map((p) => ({ balance_due: p.balance })))
  apControl.value = ctrl.data
  loading.value = false
}

onMounted(() => {
  loadData()
})
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';

.ap-control {
  border-left: 4px solid var(--q-positive);
}
.ap-control--warn {
  border-left-color: var(--q-warning);
}

.pay-lines-wrap {
  max-height: 300px;
  overflow: auto;
  border: 1px solid rgba(128, 128, 128, 0.3);
}
.pay-lines-table td,
.pay-lines-table th {
  white-space: nowrap;
}
.pay-line--selected {
  background: rgba(33, 186, 69, 0.1);
}
</style>
