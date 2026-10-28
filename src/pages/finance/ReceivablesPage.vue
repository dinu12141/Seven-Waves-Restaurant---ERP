<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="request_page"
      subtitle="Customer invoices, receipts, ageing and write-offs"
      title="Accounts Receivable"
      breadcrumbs="Finance / Receivables & Payables / AR"
      show-refresh
      @refresh="loadData"
    >
      <template #actions>
        <q-btn
          v-if="canWrite"
          unelevated
          no-caps
          icon="post_add"
          color="primary"
          label="New Customer Invoice"
          class="q-mr-sm"
          @click="openInvoiceDialog"
        />
        <q-select
          v-model="selectedBank"
          :options="bankOptions"
          label="Collecting Bank"
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
          no-caps
          icon="picture_as_pdf"
          color="red-6"
          label="PDF"
          class="q-mr-sm"
          @click="exportBankPDF"
        />
        <q-btn unelevated no-caps icon="table_chart" color="green-6" label="Excel" @click="exportBankXLSX" />
      </template>
    </FinancePageHeader>

    <q-banner v-if="loadError" class="bg-red-10 text-white q-mb-md rounded-borders" dense>
      <template #avatar><q-icon name="error" /></template>
      {{ loadError }}
    </q-banner>

    <!-- ══ KPI AGING CARDS (days past DUE date, open balance) ══════════════ -->
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="bucket in agingBuckets" :key="bucket.key" class="col-12 col-sm-6 col-md">
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

    <!-- ══ GL CONTROL BANNER (sub-ledger vs 1003) ══════════════════════════ -->
    <div v-if="control" class="fin-panel q-mb-md ar-control" :class="controlClass">
      <div class="row items-center q-col-gutter-md">
        <div class="col-12 col-md-auto row items-center">
          <q-icon :name="control.reconciled ? 'verified' : 'warning'" size="26px" :color="control.reconciled ? 'positive' : 'amber'" />
          <span class="text-weight-bold q-ml-sm">AR control (ledger 1003)</span>
        </div>
        <div class="col-6 col-md">
          <div class="text-caption text-grey-5">AR sub-ledger (open invoices)</div>
          <div class="text-weight-bold">LKR {{ fmt(control.open_receivables_total) }}</div>
        </div>
        <div class="col-6 col-md">
          <div class="text-caption text-grey-5">GL 1003 Accounts Receivable</div>
          <div class="text-weight-bold">LKR {{ fmt(control.ledger_balance) }}</div>
        </div>
        <div class="col-6 col-md">
          <div class="text-caption text-grey-5">POS credit not yet in GL</div>
          <div class="text-weight-bold text-amber-4">LKR {{ fmt(control.unposted_pos_credit_total) }}</div>
        </div>
        <div class="col-6 col-md">
          <div class="text-caption text-grey-5">Unexplained difference</div>
          <div class="text-weight-bolder" :class="control.reconciled ? 'text-positive' : 'text-negative'">
            LKR {{ fmt(control.unexplained_difference) }}
          </div>
        </div>
      </div>
      <div class="text-caption q-mt-sm" :class="control.reconciled ? 'text-grey-6' : 'text-amber-4'">
        <template v-if="control.difference === 0">Sub-ledger and GL 1003 agree.</template>
        <template v-else-if="control.reconciled">
          Difference of LKR {{ fmt(control.difference) }} is POS credit receivables that have no GL entry
          (Dr 1003) yet. POS credit sales are normally posted to the GL the moment the order is paid
          (fn_pos_post_sale, #145) — check that #145 is applied and those sales were posted.
        </template>
        <template v-else>
          Sub-ledger and GL 1003 differ by LKR {{ fmt(control.difference) }}<template v-if="control.unposted_pos_credit_total">;
          only LKR {{ fmt(control.unposted_pos_credit_total) }} is explained by POS credit not yet in the GL</template>.
          Check manual journals posted to 1003 or receivables created outside the AR screens.
        </template>
        <span v-if="writeOffTotal > 0" class="q-ml-xs">
          Bad-debt write-offs (LKR {{ fmt(writeOffTotal) }} posted) reduce both the sub-ledger and GL 1003.
        </span>
      </div>
    </div>

    <div class="fin-panel">
      <q-tabs v-model="tab" dense align="left" active-color="primary" indicator-color="primary" class="text-grey-5 q-mb-sm" no-caps>
        <q-tab name="open" icon="receipt_long" :label="`Open Invoices (${openRows.length})`" />
        <q-tab name="receipts" icon="payments" :label="`Receipts (${receipts.length})`" />
        <q-tab name="customers" icon="groups" :label="`Customers (${customerBalances.length})`" />
        <q-tab name="writeoffs" icon="money_off" :label="`Write-offs (${writeOffs.length})`" />
      </q-tabs>

      <q-tab-panels v-model="tab" animated class="bg-transparent">
        <!-- ══ OPEN INVOICES ══════════════════════════════════════════ -->
        <q-tab-panel name="open" class="q-pa-none">
          <div class="row q-col-gutter-sm q-mb-sm items-center">
            <div class="col-12 col-sm-4">
              <q-input v-model="search" placeholder="Search customer, doc #, description" outlined dense clearable>
                <template #prepend><q-icon name="search" size="xs" /></template>
              </q-input>
            </div>
            <div class="col-6 col-sm-4">
              <q-select
                v-model="customerFilter"
                :options="customerFilterOptions"
                label="Customer"
                outlined
                dense
                emit-value
                map-options
                clearable
              />
            </div>
            <div class="col-6 col-sm-4">
              <q-select
                v-model="statusFilter"
                :options="statusOptions"
                label="Status"
                outlined
                dense
                emit-value
                map-options
                @update:model-value="loadStatusRows"
              />
            </div>
          </div>

          <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
            <div
              v-if="selectedRows.length > 0"
              class="row items-center justify-between q-pa-sm q-mb-sm rounded-borders text-white shadow-2"
              style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)"
            >
              <div class="row items-center q-gutter-sm">
                <q-badge color="positive" class="text-weight-bold q-pa-xs">
                  {{ selectedRows.length }} Invoice{{ selectedRows.length > 1 ? 's' : '' }} Selected
                </q-badge>
                <span class="text-weight-bold">Open: LKR {{ fmt(selectedOpenTotal) }}</span>
                <span class="text-caption text-amber-2">({{ selectionSummary }})</span>
              </div>
              <div class="row q-gutter-xs">
                <q-btn
                  v-if="canWrite"
                  unelevated
                  no-caps
                  color="positive"
                  icon="payments"
                  :label="`Receive Payment (${selectedRows.length})`"
                  :disable="!selectionCustomerId"
                  @click="openReceiveDialog(selectionCustomerId, selectedRows.map((r) => r.id))"
                >
                  <q-tooltip v-if="!selectionCustomerId">Tick invoices of ONE registered customer</q-tooltip>
                </q-btn>
                <q-btn flat dense no-caps color="white" label="Clear Selection" @click="selectedRows = []" />
              </div>
            </div>
          </transition>

          <q-table
            v-model:selected="selectedRows"
            :rows="filteredRows"
            :columns="invoiceColumns"
            row-key="id"
            selection="multiple"
            flat
            dense
            :rows-per-page-options="[20, 50, 100]"
            class="fin-table"
            :loading="loading"
            no-data-label="No receivables"
          >
            <template #body-cell-customer="props">
              <q-td :props="props">
                <div class="text-weight-bold">{{ props.row.customer_name }}</div>
                <div v-if="props.row.customers?.phone" class="text-caption text-grey-5">{{ props.row.customers.phone }}</div>
              </q-td>
            </template>
            <template #body-cell-due_date="props">
              <q-td :props="props">
                {{ props.row.due_date || '-' }}
                <div v-if="props.row.days_past_due > 0 && props.row.balance > 0" class="text-caption text-red-4">
                  {{ props.row.days_past_due }} day{{ props.row.days_past_due === 1 ? '' : 's' }} overdue
                </div>
              </q-td>
            </template>
            <template #body-cell-paid_amount="props">
              <q-td :props="props" class="text-right">
                {{ fmt(props.row.paid_amount) }}
                <div v-if="props.row.written_off_amount > 0" class="text-caption text-amber-4">
                  incl. {{ fmt(props.row.written_off_amount) }} written off
                </div>
              </q-td>
            </template>
            <template #body-cell-balance="props">
              <q-td :props="props" class="text-right text-weight-bolder text-red-4">{{ fmt(props.row.balance) }}</q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" class="text-center">
                <q-btn
                  v-if="canWriteOff && isOpenReceivable(props.row)"
                  flat
                  dense
                  no-caps
                  size="sm"
                  color="amber-7"
                  icon="money_off"
                  label="Write off"
                  @click.stop="openWriteOffDialog(props.row)"
                >
                  <q-tooltip>Write off as bad debt (Dr Bad Debts / Cr Accounts Receivable)</q-tooltip>
                </q-btn>
              </q-td>
            </template>
            <template #body-cell-status="props">
              <q-td :props="props">
                <span :class="statusClass(displayStatus(props.row))">{{ displayStatus(props.row) }}</span>
              </q-td>
            </template>
            <template #body-cell-source="props">
              <q-td :props="props">
                <span>{{ props.row.source === 'pos_credit' ? 'POS credit' : 'Manual' }}</span>
                <q-icon
                  v-if="props.row.source === 'pos_credit' && !props.row.gl_posted_at"
                  name="hourglass_top"
                  color="amber"
                  size="14px"
                  class="q-ml-xs"
                >
                  <q-tooltip>Not yet posted to GL 1003</q-tooltip>
                </q-icon>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ RECEIPTS ═══════════════════════════════════════════════ -->
        <q-tab-panel name="receipts" class="q-pa-none">
          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-12 col-sm-4">
              <q-input v-model="receiptSearch" placeholder="Search receipt, customer, reference" outlined dense clearable>
                <template #prepend><q-icon name="search" size="xs" /></template>
              </q-input>
            </div>
            <div class="col-6 col-sm-3">
              <q-select
                v-model="receiptStatus"
                :options="[
                  { label: 'All', value: 'all' },
                  { label: 'Posted', value: 'posted' },
                  { label: 'Cancelled', value: 'cancelled' },
                ]"
                label="Status"
                outlined
                dense
                emit-value
                map-options
              />
            </div>
          </div>
          <q-table
            :rows="filteredReceipts"
            :columns="receiptColumns"
            row-key="id"
            flat
            dense
            :rows-per-page-options="[20, 50, 100]"
            class="fin-table"
            :loading="loading"
            no-data-label="No customer receipts"
          >
            <template #body-cell-status="props">
              <q-td :props="props">
                <span :class="props.row.status === 'posted' ? 'fin-badge fin-badge--success' : 'fin-badge fin-badge--muted'">
                  {{ props.row.status }}
                </span>
                <div v-if="props.row.cancel_reason" class="text-caption text-grey-5">{{ props.row.cancel_reason }}</div>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" class="text-center">
                <q-btn
                  v-if="canCancel && props.row.status === 'posted'"
                  flat
                  dense
                  no-caps
                  size="sm"
                  color="negative"
                  icon="block"
                  label="Cancel"
                  @click="confirmCancelReceipt(props.row)"
                />
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ CUSTOMERS ══════════════════════════════════════════════ -->
        <q-tab-panel name="customers" class="q-pa-none">
          <q-table
            :rows="customerBalances"
            :columns="customerColumns"
            row-key="customer_id"
            flat
            dense
            :rows-per-page-options="[20, 50, 100]"
            class="fin-table"
            :loading="loading"
            no-data-label="No customer balances"
            @row-click="(_e, row) => openStatement(row)"
          >
            <template #body-cell-customer_name="props">
              <q-td :props="props">
                <span class="text-weight-bold text-primary cursor-pointer">{{ props.row.customer_name }}</span>
                <div v-if="props.row.phone" class="text-caption text-grey-5">{{ props.row.phone }}</div>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" class="text-center">
                <q-btn flat dense no-caps size="sm" color="primary" icon="description" label="Statement" @click.stop="openStatement(props.row)" />
                <q-btn
                  v-if="canWrite && props.row.customer_id"
                  flat
                  dense
                  no-caps
                  size="sm"
                  color="positive"
                  icon="payments"
                  label="Receive"
                  @click.stop="openReceiveDialog(props.row.customer_id, [])"
                />
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>
        <!-- ══ WRITE-OFFS ═════════════════════════════════════════════ -->
        <q-tab-panel name="writeoffs" class="q-pa-none">
          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-12 col-sm-4">
              <q-input v-model="writeOffSearch" placeholder="Search write-off, customer, invoice, reason" outlined dense clearable>
                <template #prepend><q-icon name="search" size="xs" /></template>
              </q-input>
            </div>
            <div class="col-6 col-sm-3">
              <q-select
                v-model="writeOffStatus"
                :options="[
                  { label: 'All', value: 'all' },
                  { label: 'Posted', value: 'posted' },
                  { label: 'Reversed', value: 'reversed' },
                ]"
                label="Status"
                outlined
                dense
                emit-value
                map-options
              />
            </div>
          </div>
          <q-table
            :rows="filteredWriteOffs"
            :columns="writeOffColumns"
            row-key="id"
            flat
            dense
            :rows-per-page-options="[20, 50, 100]"
            class="fin-table"
            :loading="loading"
            no-data-label="No bad-debt write-offs"
          >
            <template #body-cell-reason="props">
              <q-td :props="props" style="white-space: normal; max-width: 320px">{{ props.row.reason }}</q-td>
            </template>
            <template #body-cell-status="props">
              <q-td :props="props">
                <span :class="props.row.status === 'posted' ? 'fin-badge fin-badge--warning' : 'fin-badge fin-badge--muted'">
                  {{ props.row.status }}
                </span>
                <div v-if="props.row.reverse_reason" class="text-caption text-grey-5">{{ props.row.reverse_reason }}</div>
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" class="text-center">
                <q-btn
                  v-if="canWriteOff && props.row.status === 'posted'"
                  flat
                  dense
                  no-caps
                  size="sm"
                  color="negative"
                  icon="undo"
                  label="Reverse"
                  @click="confirmReverseWriteOff(props.row)"
                />
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>
      </q-tab-panels>
    </div>

    <!-- ══ BAD-DEBT WRITE-OFF DIALOG ═════════════════════════════════════ -->
    <q-dialog v-model="showWriteOffDialog" persistent>
      <q-card style="width: 520px; max-width: 95vw" class="fin-surface">
        <q-card-section class="row items-center bg-amber-9 text-white q-pa-md">
          <q-icon name="money_off" size="24px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Write Off Bad Debt</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section v-if="woRow" class="q-gutter-md">
          <div class="rounded-borders q-pa-sm fin-surface-2">
            <div class="row justify-between items-center">
              <div>
                <div class="text-caption text-grey-6">{{ woRow.customer_name }}</div>
                <div class="text-weight-bold">{{ woRow.doc_number || woRow.id.slice(0, 8) }}</div>
                <div class="text-caption text-grey-5">
                  Total LKR {{ fmt(woRow.total_amount) }} · Paid LKR {{ fmt(woRow.paid_amount) }}
                </div>
              </div>
              <div class="text-right">
                <div class="text-caption text-grey-6">Open balance</div>
                <div class="text-subtitle1 text-weight-bolder text-red-5">LKR {{ fmt(woRow.balance) }}</div>
              </div>
            </div>
          </div>
          <q-input
            v-model.number="woForm.amount"
            type="number"
            label="Write-off amount (LKR) *"
            outlined
            dense
            min="0.01"
            :max="woRow.balance"
            step="0.01"
            prefix="LKR"
            :hint="`Up to the open balance LKR ${fmt(woRow.balance)}`"
          />
          <q-input v-model="woForm.date" type="date" label="Write-off date *" stack-label outlined dense />
          <q-input
            v-model="woForm.reason"
            type="textarea"
            autogrow
            label="Reason *"
            outlined
            dense
            placeholder="e.g. Customer untraceable after 3 reminders"
          />
          <q-banner dense class="bg-amber-10 text-white rounded-borders">
            <template #avatar><q-icon name="warning" color="amber-2" /></template>
            This posts a journal entry <b>Dr 10002 Bad Debts / Cr 1003 Accounts Receivable</b> for LKR
            {{ fmt(Number(woForm.amount) || 0) }} and reduces this invoice's open balance. It is an expense in the
            P&amp;L. It can be reversed later from the Write-offs tab.
          </q-banner>
          <div v-if="woErrors.length" class="text-caption text-amber-4">{{ woErrors[0] }}</div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md fin-surface-2">
          <q-btn flat no-caps label="Cancel" color="grey-6" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="amber-9"
            icon="money_off"
            label="Post Write-off"
            :loading="writingOff"
            :disable="woErrors.length > 0"
            @click="submitWriteOff"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ RECEIVE PAYMENT DIALOG ════════════════════════════════════════ -->
    <q-dialog v-model="showReceiveDialog" persistent :maximized="$q.screen.lt.sm">
      <q-card style="width: 860px; max-width: 95vw" class="fin-surface">
        <q-card-section class="row items-center bg-positive text-white q-pa-md">
          <q-icon name="payments" size="24px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">
            Receive Customer Payment {{ recvCheck.selectedCount > 1 ? `(${recvCheck.selectedCount} Invoices)` : '' }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md q-gutter-md">
          <div class="rounded-borders q-pa-sm fin-surface-2">
            <div class="row justify-between items-center">
              <div>
                <div class="text-caption text-grey-6">Customer</div>
                <div class="text-weight-bold text-subtitle2">{{ recvCustomer.name }}</div>
              </div>
              <div class="text-right">
                <div class="text-caption text-grey-6">Total Open ({{ recvLines.length }} invoice{{ recvLines.length === 1 ? '' : 's' }})</div>
                <div class="text-subtitle1 text-weight-bolder text-red-5">LKR {{ fmt(recvOpenTotal) }}</div>
              </div>
            </div>
          </div>

          <div>
            <div class="row items-center justify-between q-mb-xs">
              <div class="text-caption text-weight-bold">Invoices to settle *</div>
              <div class="row q-gutter-xs">
                <q-btn flat dense no-caps size="sm" color="primary" icon="done_all" label="Select all" @click="selectAllLines" />
                <q-btn flat dense no-caps size="sm" color="grey-6" icon="remove_done" label="Clear" @click="clearLines" />
                <q-btn flat dense no-caps size="sm" color="primary" icon="low_priority" label="Auto-allocate oldest-due-first" @click="autoAllocate">
                  <q-tooltip>Spread the receipt amount over this customer's invoices, oldest due date first</q-tooltip>
                </q-btn>
              </div>
            </div>
            <div class="pay-lines-wrap rounded-borders">
              <q-markup-table flat dense separator="horizontal" class="pay-lines-table">
                <thead>
                  <tr>
                    <th style="width: 36px"></th>
                    <th class="text-left">Doc #</th>
                    <th class="text-left gt-xs">Date</th>
                    <th class="text-left gt-xs">Due</th>
                    <th class="text-right">Balance</th>
                    <th class="text-right" style="width: 150px">Amount Received</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in recvLines" :key="line.id" :class="{ 'pay-line--selected': line.selected }">
                    <td>
                      <q-checkbox :model-value="line.selected" dense @update:model-value="(v) => toggleLine(line, v)" />
                    </td>
                    <td class="text-weight-bold">
                      {{ line.doc_number || line.id.slice(0, 8) }}
                      <div class="text-caption text-grey-6 ellipsis" style="max-width: 220px">{{ line.description || '' }}</div>
                    </td>
                    <td class="gt-xs">{{ line.doc_date || '-' }}</td>
                    <td class="gt-xs" :class="line.days_past_due > 0 ? 'text-red-4' : ''">{{ line.due_date || '-' }}</td>
                    <td class="text-right">LKR {{ fmt(line.balance) }}</td>
                    <td class="text-right">
                      <q-input
                        :model-value="line.allocation"
                        type="number"
                        dense
                        outlined
                        min="0"
                        :max="line.balance"
                        step="0.01"
                        input-class="text-right"
                        :disable="!line.selected"
                        @update:model-value="(v) => onLineInput(line, v)"
                        @blur="onLineBlur(line)"
                      />
                    </td>
                  </tr>
                  <tr v-if="recvLines.length === 0">
                    <td colspan="6" class="text-center text-grey-6 q-pa-md">
                      {{ recvLoading ? 'Loading…' : 'No open invoices for this customer.' }}
                    </td>
                  </tr>
                </tbody>
              </q-markup-table>
            </div>
          </div>

          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Receipt Amount (LKR) *</div>
            <q-input
              v-model.number="recvForm.amount"
              type="number"
              outlined
              dense
              min="0.01"
              step="0.01"
              prefix="LKR"
              debounce="400"
              hint="Typing an amount spreads it over the ticked invoices, oldest due first"
              @update:model-value="onAmountInput"
            />
          </div>

          <div class="rounded-borders q-pa-sm fin-surface-2">
            <div class="row q-col-gutter-sm text-center">
              <div class="col-6 col-sm-3">
                <div class="text-caption text-grey-6">Invoices</div>
                <div class="text-weight-bold">{{ recvCheck.allocations.length }} / {{ recvLines.length }}</div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="text-caption text-grey-6">Allocated</div>
                <div class="text-weight-bold">LKR {{ fmt(recvCheck.allocated) }}</div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="text-caption text-grey-6">Receipt amount</div>
                <div class="text-weight-bold">LKR {{ fmt(recvCheck.amount) }}</div>
              </div>
              <div class="col-6 col-sm-3">
                <div class="text-caption text-grey-6">Difference</div>
                <div class="text-weight-bolder" :class="recvCheck.difference === 0 ? 'text-positive' : 'text-negative'">
                  LKR {{ fmt(recvCheck.difference) }}
                </div>
              </div>
            </div>
            <div v-if="recvErrors.length" class="text-caption text-negative q-mt-sm">
              <q-icon name="warning" size="14px" /> {{ recvErrors[0] }}
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div class="text-caption text-weight-bold q-mb-xs">Receipt Date *</div>
              <q-input v-model="recvForm.receipt_date" type="date" outlined dense />
            </div>
            <div class="col-6">
              <div class="text-caption text-weight-bold q-mb-xs">Payment Method *</div>
              <q-select v-model="recvForm.payment_method" :options="paymentMethods" outlined dense />
            </div>
          </div>

          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Receiving Account *</div>
            <q-select
              v-model="recvForm.account_id"
              :options="receivingAccountOptions"
              outlined
              dense
              emit-value
              map-options
              placeholder="Select cash / bank account"
            >
              <template #prepend>
                <q-icon :name="isCashMethod ? 'payments' : 'account_balance'" size="18px" />
              </template>
            </q-select>
            <div class="text-caption text-grey-5 q-mt-xs">
              This account will be DEBITED and Accounts Receivable (1003) CREDITED.
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-6">
              <div class="text-caption text-weight-bold q-mb-xs">{{ recvForm.payment_method === 'Cheque' ? 'Cheque Number' : 'Reference' }}</div>
              <q-input v-model="recvForm.reference_no" outlined dense placeholder="e.g. TRF-99210" />
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-weight-bold q-mb-xs">Remarks</div>
              <q-input v-model="recvForm.remarks" outlined dense placeholder="Optional notes" />
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md fin-surface-2">
          <q-btn flat no-caps label="Cancel" color="grey-6" v-close-popup />
          <q-btn
            unelevated
            no-caps
            label="Confirm Receipt"
            color="positive"
            icon="check_circle"
            :loading="receiving"
            :disable="recvErrors.length > 0"
            @click="submitReceipt"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ NEW CUSTOMER INVOICE DIALOG ═══════════════════════════════════ -->
    <q-dialog v-model="showInvoiceDialog" persistent>
      <q-card style="width: 560px; max-width: 95vw" class="fin-surface">
        <q-card-section class="row items-center bg-primary text-white q-pa-md">
          <q-icon name="post_add" size="24px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">New Customer Invoice</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-model="invForm.customer"
            :options="customerOptions"
            option-label="display_name"
            label="Registered customer *"
            outlined
            dense
            use-input
            input-debounce="300"
            :loading="customerSearching"
            @filter="filterCustomers"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.display_name }}</q-item-label>
                  <q-item-label caption>{{ [scope.opt.customer_code, scope.opt.phone].filter(Boolean).join(' · ') }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
            <template #no-option>
              <q-item><q-item-section class="text-grey">Type a name, phone or code</q-item-section></q-item>
            </template>
          </q-select>
          <q-select
            v-model="invForm.income_ledger_id"
            :options="incomeLedgerOptions"
            label="Income ledger *"
            outlined
            dense
            emit-value
            map-options
          />
          <q-input v-model.number="invForm.amount" type="number" label="Amount (LKR) *" outlined dense min="0.01" step="0.01" />
          <div class="row q-col-gutter-sm">
            <div class="col-6"><q-input v-model="invForm.doc_date" type="date" label="Invoice date" stack-label outlined dense /></div>
            <div class="col-6"><q-input v-model="invForm.due_date" type="date" label="Due date" stack-label outlined dense /></div>
          </div>
          <q-input v-model="invForm.description" label="Description" outlined dense placeholder="e.g. Function hall booking 12 Nov" />
          <div class="text-caption text-grey-5">Posts Dr 1003 Accounts Receivable / Cr the selected income ledger.</div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md fin-surface-2">
          <q-btn flat no-caps label="Cancel" color="grey-6" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="primary"
            icon="check_circle"
            label="Create Invoice"
            :loading="creatingInvoice"
            :disable="!invFormValid"
            @click="submitInvoice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ CUSTOMER STATEMENT DIALOG ═════════════════════════════════════ -->
    <q-dialog v-model="showStatementDialog" :maximized="$q.screen.lt.md">
      <q-card style="width: 900px; max-width: 95vw" class="fin-surface">
        <q-card-section class="row items-center q-pa-md" style="background: linear-gradient(135deg, #0f4c75 0%, #1976d2 100%)">
          <q-icon name="description" size="24px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Statement — {{ stmtCustomer.name }}</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section>
          <div class="row q-col-gutter-sm items-end q-mb-sm">
            <div class="col-6 col-sm-3"><q-input v-model="stmtFrom" type="date" label="From" stack-label outlined dense /></div>
            <div class="col-6 col-sm-3"><q-input v-model="stmtTo" type="date" label="To" stack-label outlined dense /></div>
            <div class="col-12 col-sm-6 row justify-end q-gutter-xs">
              <q-btn unelevated no-caps color="primary" icon="refresh" label="Load" :loading="stmtLoading" @click="loadStatement" />
              <q-btn unelevated no-caps color="red-6" icon="picture_as_pdf" label="PDF" :disable="!statement" @click="exportStatementPDF" />
              <q-btn unelevated no-caps color="green-6" icon="table_chart" label="Excel" :disable="!statement" @click="exportStatementXLSX" />
            </div>
          </div>
          <q-table
            :rows="statement?.lines || []"
            :columns="statementColumns"
            :row-key="(r) => `${r.type}-${r.ref}-${r.date}`"
            flat
            dense
            :pagination="{ rowsPerPage: 0 }"
            hide-pagination
            class="fin-table"
            :loading="stmtLoading"
            no-data-label="No transactions"
          />
          <div v-if="statement" class="row justify-end q-mt-sm">
            <div style="min-width: 280px">
              <div class="row justify-between"><span class="text-grey-6">Opening b/f</span><span>LKR {{ fmt(statement.opening_balance) }}</span></div>
              <div class="row justify-between"><span class="text-grey-6">Invoiced</span><span>LKR {{ fmt(statement.total_debit) }}</span></div>
              <div class="row justify-between"><span class="text-grey-6">Received</span><span class="text-green-4">LKR {{ fmt(statement.total_received) }}</span></div>
              <div v-if="statement.total_written_off" class="row justify-between">
                <span class="text-grey-6">Bad debt written off</span><span class="text-amber-4">LKR {{ fmt(statement.total_written_off) }}</span>
              </div>
              <q-separator class="q-my-xs" />
              <div class="row justify-between text-weight-bolder"><span>Closing balance</span><span class="text-red-4">LKR {{ fmt(statement.closing_balance) }}</span></div>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted } from 'vue'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import { useQuasar } from 'quasar'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { useAuthStore } from 'src/stores/auth'
import {
  listReceivables,
  listOpenReceivablesForCustomer,
  listReceipts,
  getCustomerStatement,
  getArControl,
  receivePayment,
  createInvoice,
  cancelReceipt,
  listWriteOffs,
  writeOff,
  reverseWriteOff,
  searchCustomers,
  listReceivingAccounts,
  listIncomeLedgers,
  defaultIncomeLedgerId,
} from 'src/services/finance/arService'
import {
  AR_AGING_KEYS,
  AR_PAYMENT_METHODS,
  summarizeAging,
  summarizeCustomerBalances,
  allocateOldestDueFirst,
  checkReceiptAllocations,
  clampAllocation,
  checkWriteOff,
  isOpenReceivable,
  sumAmounts,
  localIsoDate,
} from 'src/services/finance/arAllocation'

const $q = useQuasar()
const auth = useAuthStore()

const canWrite = computed(() => auth.isAdmin || auth.hasAnyRole(['finance', 'manager']))
const canCancel = computed(() => auth.isAdmin || auth.hasRole('finance'))
/** Bad-debt write-off / reversal: admin + finance only (managers cannot — enforced by the RPC too). */
const canWriteOff = computed(() => auth.isAdmin || auth.hasRole('finance'))

const loading = ref(false)
const loadError = ref('')
const tab = ref('open')

/** Open receivables (outstanding/partial/overdue) — drives aging, customers, control. */
const openRows = ref([])
/** Rows for a non-open status filter (paid, written_off, all). */
const statusRows = ref([])
const receipts = ref([])
const writeOffs = ref([])
const control = ref(null)
const receivingAccounts = ref([])
const incomeLedgers = ref([])

// ── Filters ────────────────────────────────────────────────────────────────
const search = ref('')
const customerFilter = ref(null)
const statusFilter = ref('open')
const statusOptions = [
  { label: 'Open (all unpaid)', value: 'open' },
  { label: 'Outstanding', value: 'outstanding' },
  { label: 'Partial', value: 'partial' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Paid', value: 'paid' },
  { label: 'Written off', value: 'written_off' },
  { label: 'All', value: 'all' },
]
const receiptSearch = ref('')
const receiptStatus = ref('all')
const writeOffSearch = ref('')
const writeOffStatus = ref('all')

const selectedBank = ref('All Banks')
const bankOptions = ['All Banks', 'BOC', 'HNB', 'Commercial Bank', 'Sampath Bank']

const OPEN_FILTER_STATUSES = ['outstanding', 'partial', 'overdue']

const baseRows = computed(() => {
  if (statusFilter.value === 'open') return openRows.value
  if (OPEN_FILTER_STATUSES.includes(statusFilter.value)) {
    return openRows.value.filter((r) => displayStatus(r) === statusFilter.value || r.status === statusFilter.value)
  }
  return statusRows.value
})

const filteredRows = computed(() => {
  const s = (search.value || '').trim().toLowerCase()
  return baseRows.value.filter((r) => {
    if (customerFilter.value && r.customer_id !== customerFilter.value) return false
    if (!s) return true
    return [r.customer_name, r.doc_number, r.description, r.customers?.phone, r.customers?.customer_code]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(s))
  })
})

const customerFilterOptions = computed(() => {
  const map = new Map()
  for (const r of [...openRows.value, ...statusRows.value]) {
    if (r.customer_id && !map.has(r.customer_id)) map.set(r.customer_id, r.customer_name)
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const filteredReceipts = computed(() => {
  const s = (receiptSearch.value || '').trim().toLowerCase()
  return receipts.value.filter((r) => {
    if (receiptStatus.value !== 'all' && r.status !== receiptStatus.value) return false
    if (!s) return true
    return [r.receipt_no, r.customer_name, r.reference_no, r.invoice_numbers, r.remarks]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(s))
  })
})

const filteredWriteOffs = computed(() => {
  const s = (writeOffSearch.value || '').trim().toLowerCase()
  return writeOffs.value.filter((w) => {
    if (writeOffStatus.value !== 'all' && w.status !== writeOffStatus.value) return false
    if (!s) return true
    return [w.write_off_no, w.customer_name, w.doc_number, w.reason]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(s))
  })
})
const writeOffTotal = computed(() => sumAmounts(writeOffs.value.filter((w) => w.status === 'posted').map((w) => w.amount)))

// ── Aging / customers ──────────────────────────────────────────────────────
const AGING_META = {
  current: { label: 'Current (not yet due)', colorClass: 'fin-kpi-card--green' },
  '1-30 days': { label: '1-30 Days Past Due', colorClass: 'fin-kpi-card--amber' },
  '31-60 days': { label: '31-60 Days Past Due', colorClass: 'fin-kpi-card--orange' },
  '61-90 days': { label: '61-90 Days Past Due', colorClass: 'fin-kpi-card--purple' },
  '90+ days': { label: '90+ Days Past Due', colorClass: 'fin-kpi-card--red' },
}
const agingBuckets = computed(() => {
  const totals = summarizeAging(openRows.value)
  return AR_AGING_KEYS.map((key) => ({ key, total: totals[key], ...AGING_META[key] }))
})

const customerBalances = computed(() => summarizeCustomerBalances(openRows.value))

const controlClass = computed(() => (control.value && !control.value.reconciled ? 'ar-control--warn' : ''))

// ── Selection ──────────────────────────────────────────────────────────────
const selectedRows = ref([])
const selectedOpenTotal = computed(() => sumAmounts(selectedRows.value.map((r) => r.balance)))
const selectionCustomerId = computed(() => {
  const ids = [...new Set(selectedRows.value.map((r) => r.customer_id || ''))]
  return ids.length === 1 && ids[0] ? ids[0] : null
})
const selectionSummary = computed(() => {
  const names = [...new Set(selectedRows.value.map((r) => r.customer_name))]
  if (names.length === 1) return names[0]
  return `${names.length} different customers — receive one customer at a time`
})

// ── Columns ────────────────────────────────────────────────────────────────
const invoiceColumns = [
  { name: 'customer', label: 'Customer', field: 'customer_name', align: 'left', sortable: true },
  { name: 'doc_number', label: 'Doc #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'due_date', label: 'Due', field: 'due_date', align: 'left', sortable: true },
  { name: 'total_amount', label: 'Total', field: 'total_amount', align: 'right', format: (v) => fmt(v), sortable: true },
  { name: 'paid_amount', label: 'Paid', field: 'paid_amount', align: 'right', format: (v) => fmt(v) },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'source', label: 'Source', field: 'source', align: 'left' },
  { name: 'actions', label: '', field: 'id', align: 'center' },
]
const writeOffColumns = [
  { name: 'write_off_no', label: 'Write-off #', field: 'write_off_no', align: 'left', sortable: true },
  { name: 'write_off_date', label: 'Date', field: 'write_off_date', align: 'left', sortable: true },
  { name: 'customer', label: 'Customer', field: 'customer_name', align: 'left', sortable: true },
  { name: 'doc_number', label: 'Invoice', field: 'doc_number', align: 'left' },
  { name: 'reason', label: 'Reason', field: 'reason', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: (v) => fmt(v), sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: '', field: 'id', align: 'center' },
]
const receiptColumns = [
  { name: 'receipt_no', label: 'Receipt #', field: 'receipt_no', align: 'left', sortable: true },
  { name: 'receipt_date', label: 'Date', field: 'receipt_date', align: 'left', sortable: true },
  { name: 'customer', label: 'Customer', field: 'customer_name', align: 'left', sortable: true },
  { name: 'method', label: 'Method', field: (r) => methodLabel(r.payment_method), align: 'left' },
  { name: 'account', label: 'Account', field: 'account_name', align: 'left' },
  { name: 'invoices', label: 'Invoices', field: 'invoice_numbers', align: 'left' },
  { name: 'reference_no', label: 'Reference', field: 'reference_no', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: (v) => fmt(v), sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: '', field: 'id', align: 'center' },
]
const customerColumns = [
  { name: 'customer_name', label: 'Customer', field: 'customer_name', align: 'left', sortable: true },
  { name: 'open_count', label: 'Open Invoices', field: 'open_count', align: 'center', sortable: true },
  { name: 'oldest_due', label: 'Oldest Due', field: 'oldest_due', align: 'left', sortable: true },
  { name: 'overdue', label: 'Overdue', field: 'overdue', align: 'right', format: (v) => fmt(v), sortable: true },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', format: (v) => fmt(v), sortable: true },
  { name: 'actions', label: '', field: 'customer_id', align: 'center' },
]
const statementColumns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left' },
  { name: 'ref', label: 'Ref', field: 'ref', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'debit', label: 'Invoiced (Dr)', field: 'debit', align: 'right', format: (v) => (v ? fmt(v) : '') },
  { name: 'credit', label: 'Received / Written off (Cr)', field: 'credit', align: 'right', format: (v) => (v ? fmt(v) : '') },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', format: (v) => fmt(v) },
]

// ── Formatting ─────────────────────────────────────────────────────────────
function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function methodLabel(m) {
  const s = String(m || '').replace(/_/g, ' ')
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}
/** Status shown: open invoices past their due date show as overdue. */
function displayStatus(r) {
  if (['outstanding', 'partial'].includes(r.status) && r.days_past_due > 0 && r.balance > 0) return 'overdue'
  return r.status
}
function statusClass(s) {
  const m = {
    outstanding: 'fin-badge fin-badge--warning',
    partial: 'fin-badge fin-badge--info',
    paid: 'fin-badge fin-badge--success',
    overdue: 'fin-badge fin-badge--danger',
    written_off: 'fin-badge fin-badge--muted',
  }
  return m[s] || 'fin-badge fin-badge--muted'
}
function notifyError(e, fallback) {
  $q.notify({ type: 'negative', message: e?.message || fallback, timeout: 6000 })
}

// ── Loading ────────────────────────────────────────────────────────────────
async function loadStatusRows() {
  selectedRows.value = []
  if (statusFilter.value === 'open' || OPEN_FILTER_STATUSES.includes(statusFilter.value)) {
    statusRows.value = []
    return
  }
  try {
    statusRows.value = await listReceivables({ status: statusFilter.value })
  } catch (e) {
    notifyError(e, 'Failed to load receivables')
  }
}

async function loadData() {
  loading.value = true
  loadError.value = ''
  selectedRows.value = []
  const results = await Promise.allSettled([
    listReceivables({ status: 'open' }),
    listReceipts(),
    getArControl(),
    listReceivingAccounts(),
    listWriteOffs(),
  ])
  const [openRes, rcptRes, ctrlRes, accRes, woRes] = results
  openRows.value = openRes.status === 'fulfilled' ? openRes.value : []
  receipts.value = rcptRes.status === 'fulfilled' ? rcptRes.value : []
  writeOffs.value = woRes.status === 'fulfilled' ? woRes.value : []
  control.value = ctrlRes.status === 'fulfilled' ? ctrlRes.value : null
  receivingAccounts.value = accRes.status === 'fulfilled' ? accRes.value : []
  const firstErr = results.find((r) => r.status === 'rejected')
  if (firstErr) loadError.value = firstErr.reason?.message || 'Failed to load receivables'
  await loadStatusRows()
  loading.value = false
}

onMounted(loadData)

// ── Receive payment ────────────────────────────────────────────────────────
const paymentMethods = [...AR_PAYMENT_METHODS]
const showReceiveDialog = ref(false)
const recvLoading = ref(false)
const receiving = ref(false)
const recvCustomer = ref({ id: null, name: '' })
const recvLines = ref([])
const recvForm = reactive({
  amount: 0,
  receipt_date: localIsoDate(),
  payment_method: 'Cash',
  account_id: null,
  reference_no: '',
  remarks: '',
})

const recvOpenTotal = computed(() => sumAmounts(recvLines.value.map((l) => l.balance)))
const recvCheck = computed(() => checkReceiptAllocations(recvLines.value, recvForm.amount))
const recvErrors = computed(() => {
  const errs = [...recvCheck.value.errors]
  if (!recvForm.account_id) errs.push('Select the account that received the money.')
  if (!recvForm.receipt_date) errs.push('Receipt date is required.')
  return errs
})

const isCashMethod = computed(() => (recvForm.payment_method || '').toLowerCase() === 'cash')
const receivingAccountOptions = computed(() =>
  receivingAccounts.value
    .filter((a) => (isCashMethod.value ? a.account_type === 'cash' : a.account_type === 'bank'))
    .map((a) => ({
      label: `${a.registered_name}${a.account_number ? ` (${a.account_number})` : ''} [${a.account_type === 'cash' ? 'Cash' : a.bank_name || 'Bank'}]`,
      value: a.id,
    })),
)
watch(
  () => recvForm.payment_method,
  () => {
    const opts = receivingAccountOptions.value
    if (!opts.some((o) => o.value === recvForm.account_id)) recvForm.account_id = opts[0]?.value || null
  },
)

async function openReceiveDialog(customerId, preselectIds = []) {
  if (!customerId) return
  const known = openRows.value.find((r) => r.customer_id === customerId)
  recvCustomer.value = { id: customerId, name: known?.customer_name || 'Customer' }
  recvLines.value = []
  Object.assign(recvForm, {
    amount: 0,
    receipt_date: localIsoDate(),
    payment_method: 'Cash',
    reference_no: '',
    remarks: '',
  })
  recvForm.account_id = receivingAccountOptions.value[0]?.value || null
  showReceiveDialog.value = true
  recvLoading.value = true
  try {
    const rows = await listOpenReceivablesForCustomer(customerId)
    const pre = new Set(preselectIds)
    recvLines.value = rows.map((r) => ({
      ...r,
      selected: pre.has(r.id),
      allocation: pre.has(r.id) ? r.balance : 0,
    }))
    if (rows[0]) recvCustomer.value.name = rows[0].customer_name
    syncAmount()
  } catch (e) {
    notifyError(e, 'Failed to load open invoices')
  } finally {
    recvLoading.value = false
  }
}

function syncAmount() {
  recvForm.amount = sumAmounts(recvLines.value.filter((l) => l.selected).map((l) => l.allocation))
}
function toggleLine(line, v) {
  line.selected = !!v
  line.allocation = line.selected ? line.balance : 0
  syncAmount()
}
function onLineInput(line, value) {
  const n = value === '' || value === null ? 0 : Number(value)
  line.allocation = Number.isFinite(n) && n > line.balance ? line.balance : value
  syncAmount()
}
function onLineBlur(line) {
  line.allocation = clampAllocation(line.allocation, line.balance)
  syncAmount()
}
function selectAllLines() {
  for (const l of recvLines.value) {
    l.selected = true
    l.allocation = l.balance
  }
  syncAmount()
}
function clearLines() {
  for (const l of recvLines.value) {
    l.selected = false
    l.allocation = 0
  }
  syncAmount()
}
function spread(lines, amount) {
  const { allocations } = allocateOldestDueFirst(lines, amount)
  const byId = new Map(allocations.map((a) => [a.receivable_id, a.amount]))
  for (const l of lines) l.allocation = byId.get(l.id) || 0
  return byId
}
function onAmountInput(value) {
  const ticked = recvLines.value.filter((l) => l.selected)
  if (ticked.length === 0) return
  spread(ticked, value)
}
function autoAllocate() {
  const typed = Number(recvForm.amount) || 0
  const amount = typed > 0 ? typed : recvOpenTotal.value
  const byId = spread(recvLines.value, amount)
  for (const l of recvLines.value) l.selected = byId.has(l.id)
  if (typed <= 0) syncAmount()
  else if (typed > recvOpenTotal.value) {
    $q.notify({ type: 'warning', message: `Amount exceeds this customer's open balance (LKR ${fmt(recvOpenTotal.value)}).` })
  }
}

async function submitReceipt() {
  if (recvErrors.value.length) return
  const ticked = recvLines.value.filter((l) => recvCheck.value.allocations.some((a) => a.receivable_id === l.id))
  const branches = [...new Set(ticked.map((l) => l.branch_id).filter(Boolean))]
  const branchId = branches.length === 1 ? branches[0] : auth.currentBranch?.id
  receiving.value = true
  try {
    const res = await receivePayment({
      customerId: recvCustomer.value.id,
      branchId,
      receiptDate: recvForm.receipt_date,
      accountId: recvForm.account_id,
      amount: recvCheck.value.amount,
      paymentMethod: recvForm.payment_method,
      referenceNo: recvForm.reference_no,
      remarks: recvForm.remarks,
      allocations: recvCheck.value.allocations,
    })
    $q.notify({ type: 'positive', icon: 'check_circle', message: `Receipt ${res.receipt_no} posted` })
    showReceiveDialog.value = false
    await loadData()
  } catch (e) {
    notifyError(e, 'Failed to receive payment')
  } finally {
    receiving.value = false
  }
}

// ── Cancel receipt ─────────────────────────────────────────────────────────
function confirmCancelReceipt(row) {
  $q.dialog({
    title: `Cancel receipt ${row.receipt_no}?`,
    message: `LKR ${fmt(row.amount)} from ${row.customer_name}. The GL entry is reversed and the invoices re-opened. Reason:`,
    prompt: { model: '', type: 'text', isValid: (v) => !!String(v || '').trim() },
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async (reason) => {
    try {
      await cancelReceipt(row.id, reason)
      $q.notify({ type: 'positive', message: `Receipt ${row.receipt_no} cancelled` })
      await loadData()
    } catch (e) {
      notifyError(e, 'Failed to cancel receipt')
    }
  })
}

// ── Bad-debt write-off ─────────────────────────────────────────────────────
const showWriteOffDialog = ref(false)
const writingOff = ref(false)
const woRow = ref(null)
const woForm = reactive({ amount: 0, date: localIsoDate(), reason: '' })
const woErrors = computed(() =>
  woRow.value
    ? checkWriteOff({ amount: woForm.amount, balance: woRow.value.balance, reason: woForm.reason, date: woForm.date })
    : ['Select an invoice.'],
)

function openWriteOffDialog(row) {
  if (!row || !isOpenReceivable(row)) return
  woRow.value = row
  Object.assign(woForm, { amount: row.balance, date: localIsoDate(), reason: '' })
  showWriteOffDialog.value = true
}

async function submitWriteOff() {
  if (woErrors.value.length) return
  writingOff.value = true
  try {
    const res = await writeOff({
      receivableId: woRow.value.id,
      amount: Number(woForm.amount),
      reason: woForm.reason,
      date: woForm.date,
      openBalance: woRow.value.balance,
    })
    $q.notify({ type: 'positive', icon: 'check_circle', message: `Write-off ${res.write_off_no} posted` })
    showWriteOffDialog.value = false
    await loadData()
  } catch (e) {
    notifyError(e, 'Failed to write off')
  } finally {
    writingOff.value = false
  }
}

function confirmReverseWriteOff(row) {
  $q.dialog({
    title: `Reverse write-off ${row.write_off_no}?`,
    message: `LKR ${fmt(row.amount)} on ${row.doc_number || 'invoice'} (${row.customer_name}). The Bad Debts / AR entry is reversed and the invoice re-opened. Reason:`,
    prompt: { model: '', type: 'text', isValid: (v) => !!String(v || '').trim() },
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async (reason) => {
    try {
      await reverseWriteOff(row.id, reason)
      $q.notify({ type: 'positive', message: `Write-off ${row.write_off_no} reversed` })
      await loadData()
    } catch (e) {
      notifyError(e, 'Failed to reverse write-off')
    }
  })
}

// ── New customer invoice ───────────────────────────────────────────────────
const showInvoiceDialog = ref(false)
const creatingInvoice = ref(false)
const customerOptions = ref([])
const customerSearching = ref(false)
const invForm = reactive({
  customer: null,
  income_ledger_id: null,
  amount: null,
  doc_date: localIsoDate(),
  due_date: '',
  description: '',
})
const incomeLedgerOptions = computed(() =>
  incomeLedgers.value.map((l) => ({ label: `${l.ledger_code || ''} ${l.ledger_name || ''}`.trim(), value: l.id })),
)
const invFormValid = computed(
  () =>
    !!invForm.customer?.id &&
    !!invForm.income_ledger_id &&
    Number(invForm.amount) > 0 &&
    (!invForm.due_date || !invForm.doc_date || invForm.due_date >= invForm.doc_date),
)

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return localIsoDate(new Date(y, m - 1, d + n))
}

async function openInvoiceDialog() {
  Object.assign(invForm, {
    customer: null,
    amount: null,
    doc_date: localIsoDate(),
    due_date: addDays(localIsoDate(), 30),
    description: '',
  })
  showInvoiceDialog.value = true
  try {
    if (!incomeLedgers.value.length) incomeLedgers.value = await listIncomeLedgers()
    invForm.income_ledger_id = defaultIncomeLedgerId(incomeLedgers.value) || incomeLedgers.value[0]?.id || null
  } catch (e) {
    notifyError(e, 'Failed to load income ledgers')
  }
}

function filterCustomers(val, update) {
  customerSearching.value = true
  searchCustomers(val)
    .then((rows) => update(() => (customerOptions.value = rows)))
    .catch((e) => {
      update(() => (customerOptions.value = []))
      notifyError(e, 'Customer search failed')
    })
    .finally(() => (customerSearching.value = false))
}

async function submitInvoice() {
  if (!invFormValid.value) return
  creatingInvoice.value = true
  try {
    const res = await createInvoice({
      customerId: invForm.customer.id,
      branchId: auth.currentBranch?.id,
      docDate: invForm.doc_date,
      dueDate: invForm.due_date || null,
      amount: Number(invForm.amount),
      incomeLedgerId: invForm.income_ledger_id,
      description: invForm.description,
    })
    $q.notify({ type: 'positive', icon: 'check_circle', message: `Invoice ${res.doc_number} created` })
    showInvoiceDialog.value = false
    await loadData()
  } catch (e) {
    notifyError(e, 'Failed to create invoice')
  } finally {
    creatingInvoice.value = false
  }
}

// ── Customer statement ─────────────────────────────────────────────────────
const showStatementDialog = ref(false)
const stmtCustomer = ref({ id: null, name: '' })
const stmtFrom = ref('')
const stmtTo = ref('')
const statement = ref(null)
const stmtLoading = ref(false)

function openStatement(row) {
  if (!row?.customer_id) {
    $q.notify({ type: 'warning', message: 'These receivables have no registered customer.' })
    return
  }
  const today = localIsoDate()
  stmtCustomer.value = { id: row.customer_id, name: row.customer_name }
  stmtFrom.value = `${today.slice(0, 4)}-01-01`
  stmtTo.value = today
  statement.value = null
  showStatementDialog.value = true
  loadStatement()
}

async function loadStatement() {
  stmtLoading.value = true
  try {
    statement.value = await getCustomerStatement(stmtCustomer.value.id, stmtFrom.value || null, stmtTo.value || null)
  } catch (e) {
    notifyError(e, 'Failed to load statement')
  } finally {
    stmtLoading.value = false
  }
}

function stmtFileBase() {
  return `Statement_${stmtCustomer.value.name.replace(/[^\w]+/g, '_')}_${(stmtFrom.value || 'start').replace(/-/g, '')}_${(stmtTo.value || 'today').replace(/-/g, '')}`
}

function exportStatementXLSX() {
  const s = statement.value
  if (!s) return
  const wsData = [
    ['Seven Wave Food Court (Pvt) Ltd'],
    [`CUSTOMER STATEMENT — ${stmtCustomer.value.name}`],
    [`Period: ${stmtFrom.value || '-'} to ${stmtTo.value || '-'}`],
    [],
    ['Date', 'Ref', 'Description', 'Invoiced (Dr)', 'Received / Written off (Cr)', 'Balance'],
    ...s.lines.map((l) => [l.date, l.ref, l.description, l.debit || '', l.credit || '', l.balance]),
    [],
    ['', '', 'Closing balance', s.total_debit, s.total_credit, s.closing_balance],
    ...(s.total_written_off ? [['', '', 'of which bad debt written off', '', s.total_written_off, '']] : []),
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 45 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Statement')
  const filename = `${stmtFileBase()}.xlsx`
  XLSX.writeFile(wb, filename)
  $q.notify({ type: 'positive', icon: 'table_chart', message: `Downloaded: ${filename}` })
}

function exportStatementPDF() {
  const s = statement.value
  if (!s) return
  const doc = new jsPDF('p', 'mm', 'a4')
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.text('Seven Wave Food Court (Pvt) Ltd', 105, 18, { align: 'center' })
  doc.setFontSize(11)
  doc.text(`CUSTOMER STATEMENT — ${stmtCustomer.value.name}`, 105, 25, { align: 'center' })
  doc.setFont('times', 'normal')
  doc.text(`Period: ${stmtFrom.value || '-'} to ${stmtTo.value || '-'}`, 105, 31, { align: 'center' })
  const body = s.lines.map((l) => [l.date, l.ref, l.description, l.debit ? fmt(l.debit) : '', l.credit ? fmt(l.credit) : '', fmt(l.balance)])
  body.push(['', '', 'Closing balance', fmt(s.total_debit), fmt(s.total_credit), fmt(s.closing_balance)])
  autoTable(doc, {
    startY: 36,
    margin: { left: 12, right: 12 },
    head: [['Date', 'Ref', 'Description', 'Invoiced', 'Received / W-off', 'Balance']],
    body,
    theme: 'grid',
    styles: { font: 'times', fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === body.length - 1) data.cell.styles.fontStyle = 'bold'
    },
  })
  const filename = `${stmtFileBase()}.pdf`
  doc.save(filename)
  $q.notify({ type: 'positive', icon: 'picture_as_pdf', message: `Downloaded: ${filename}` })
}

// ── Bank collection letter export (current Open Invoices view) ──────────────
const currentDateStr = computed(() => localIsoDate().replace(/-/g, '/'))
const currentMonthLabel = computed(() =>
  new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase(),
)

function getCompanyBankAccount(bName) {
  if (bName === 'All Banks') return '_______________'
  const b = bName.toLowerCase()
  const match = receivingAccounts.value.find(
    (a) => a.account_type === 'bank' && a.bank_name && (a.bank_name.toLowerCase().includes(b) || b.includes(a.bank_name.toLowerCase())),
  )
  return match?.account_number || '_______________'
}

function exportRows() {
  return filteredRows.value.filter((r) => r.balance > 0)
}

function exportBankPDF() {
  const rows = exportRows()
  const doc = new jsPDF('p', 'mm', 'a4')
  const bName = selectedBank.value
  const companyAcc = getCompanyBankAccount(bName)
  const totalAmount = sumAmounts(rows.map((r) => r.balance))
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
  const title = `ACCOUNTS RECEIVABLE COLLECTION – ${currentMonthLabel.value}`
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
  doc.text(`CUSTOMER COLLECTIONS – ${currentMonthLabel.value}`, 105, y, { align: 'center' })
  y += 4

  const tableData = rows.map((r, i) => [i + 1, r.customer_name, r.doc_number || 'N/A', r.due_date || '-', `LKR ${fmt(r.balance)}`])
  tableData.push(['', '', '', 'TOTAL', `LKR ${totalStr}`])

  autoTable(doc, {
    startY: y + 2,
    margin: { left: 20, right: 20 },
    head: [['No.', 'Customer', 'Invoice #', 'Due Date', 'Balance']],
    body: tableData,
    theme: 'grid',
    styles: { font: 'times', fontSize: 10, cellPadding: 2.5, lineColor: [0, 0, 0], lineWidth: 0.3 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { cellWidth: 50 },
      2: { cellWidth: 35 },
      3: { cellWidth: 35 },
      4: { halign: 'right', cellWidth: 35 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === tableData.length - 1) {
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
  const rows = exportRows()
  const bName = selectedBank.value
  const companyAcc = getCompanyBankAccount(bName)
  const totalAmount = sumAmounts(rows.map((r) => r.balance))

  const wsData = []
  if (bName !== 'All Banks') {
    wsData.push([currentDateStr.value])
    wsData.push(['THE MANAGER'])
    wsData.push([bName.toUpperCase()])
    wsData.push([])
    wsData.push([`ACCOUNTS RECEIVABLE COLLECTION – ${currentMonthLabel.value}`])
    wsData.push([])
    wsData.push(['Dear Sir,'])
    wsData.push([
      `Appreciate if you could arrange to Collect Rs. ${fmt(totalAmount)} from the following customer accounts as accounts receivable settlement for ${currentMonthLabel.value} to Rupee Account No.${companyAcc}`,
    ])
    wsData.push([])
  }
  wsData.push(['Seven Wave Food Court (Pvt) Ltd'])
  wsData.push([`CUSTOMER COLLECTIONS – ${currentMonthLabel.value}`])
  wsData.push([])
  wsData.push(['No.', 'Customer', 'Invoice #', 'Due Date', 'Balance'])
  rows.forEach((r, i) => {
    wsData.push([i + 1, r.customer_name, r.doc_number || 'N/A', r.due_date || '-', Number(r.balance || 0)])
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
  ws['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 25 }, { wch: 15 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, bName.substring(0, 31))
  const filename = `AR_Export_${bName.replace(/\s+/g, '_')}_${currentDateStr.value.replace(/\//g, '')}.xlsx`
  XLSX.writeFile(wb, filename)
  $q.notify({ type: 'positive', icon: 'table_chart', message: `Downloaded: ${filename}` })
}
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';

.ar-control {
  border-left: 4px solid #21ba45;
}
.ar-control--warn {
  border-left-color: #f2c037;
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
