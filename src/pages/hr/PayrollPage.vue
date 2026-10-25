<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="Payroll" breadcrumbs="Human Resources / Payroll" />

    <!-- Top Action Bar -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn
        unelevated
        color="amber-8"
        text-color="dark"
        icon="play_arrow"
        label="Run Payroll"
        @click="showRunDialog = true"
        no-caps
        dense
        padding="xs md"
        class="text-weight-medium"
      />
      <q-space />
      <div style="min-width: 160px">
        <div
          :class="[
            'text-caption text-weight-medium q-mb-xs',
            $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
          ]"
        >
          Status
        </div>
        <q-select
          :dark="$q.dark.isActive"
          dense
          outlined
          v-model="statusFilter"
          :options="['All', 'Draft', 'Processing', 'Processed', 'Approved', 'Paid']"
          style="min-width: 160px"
        />
      </div>
    </div>

    <!-- Payroll Runs Table -->
    <q-table
      :dark="$q.dark.isActive"
      flat
      bordered
      dense
      :rows="runs"
      :columns="runColumns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 10 }"
      :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'text-body2']"
      table-header-class="text-weight-bold text-uppercase"
    >
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="runStatusColor(props.row.status)"
            :label="props.row.status"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            flat
            dense
            icon="visibility"
            color="primary"
            size="sm"
            @click="viewRun(props.row)"
            label="View"
            no-caps
          />
          <q-btn
            v-if="props.row.status === 'processed'"
            flat
            dense
            icon="check"
            color="green"
            size="sm"
            @click="finalApprove(props.row)"
            label="Approve"
            no-caps
          />
          <!-- Post to Finance: visible for approved runs that are not yet paid -->
          <q-btn
            v-if="props.row.status === 'approved'"
            unelevated
            dense
            no-caps
            size="sm"
            color="blue-8"
            icon="account_balance"
            label="Post to Finance"
            @click="openPostFinanceForRun(props.row)"
          >
            <q-tooltip>Post this payroll run to Finance & mark all salaries as PAID</q-tooltip>
          </q-btn>
          <!-- Bulk Export: visible for paid runs -->
          <q-btn
            v-if="props.row.status === 'paid'"
            unelevated
            dense
            no-caps
            size="sm"
            color="deep-purple-8"
            icon="download"
            label="Bulk Export"
            @click="
              async () => {
                await viewRun(props.row)
                openBulkPaymentExport()
              }
            "
          >
            <q-tooltip>Download bank-wise bulk payment files</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- ══ Run Payroll Dialog ══ -->
    <q-dialog v-model="showRunDialog" persistent>
      <q-card :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-white']" style="min-width: 450px">
        <q-card-section>
          <div :class="['text-h6 text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-dark']">
            Run Monthly Payroll
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <div
            :class="[
              'text-caption text-weight-medium q-mb-xs',
              $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
            ]"
          >
            Payroll Month
          </div>
          <q-input
            :dark="$q.dark.isActive"
            outlined
            dense
            v-model="payrollMonth"
            type="month"
            hint="e.g. 2026-03"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey" no-caps />
          <q-btn
            unelevated
            color="amber-8"
            text-color="dark"
            label="Process"
            icon="play_arrow"
            @click="runPayroll"
            :loading="processing"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ Payslips Dialog (maximized) ══ -->
    <q-dialog v-model="showPayslips" maximized>
      <q-card :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-grey-1']">
        <!-- Header Bar -->
        <q-bar
          :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white']"
          style="border-bottom: 3px solid #f9a825; height: 56px; padding: 0 12px"
        >
          <q-icon name="payments" color="amber" />
          <div
            class="q-ml-sm text-weight-bold"
            :class="$q.dark.isActive ? 'text-white' : 'text-dark'"
          >
            Payroll: {{ selectedRun?.period_start }} — {{ selectedRun?.period_end }}
          </div>
          <q-badge
            :color="runStatusColor(selectedRun?.status)"
            :label="selectedRun?.status?.toUpperCase()"
            class="q-ml-sm text-caption"
          />
          <q-space />
          <!-- ✅ BULK PAYMENT EXPORT — visible for paid runs -->
          <q-btn
            v-if="selectedRun?.status === 'paid'"
            unelevated
            no-caps
            color="deep-purple-8"
            icon="download"
            label="Bulk Payment Export"
            class="q-mr-sm"
            @click="openBulkPaymentExport"
          >
            <q-tooltip>Download bank-wise bulk payment files for salary transfer</q-tooltip>
          </q-btn>
          <!-- ✅ POST TO FINANCE — prominent, always visible for approved runs -->
          <q-btn
            v-if="selectedRun?.status === 'approved'"
            unelevated
            no-caps
            color="blue-8"
            icon="account_balance"
            label="Post to Finance"
            class="q-mr-sm"
            @click="sendToFinance"
          >
            <q-tooltip>Post all pending salaries to Finance & mark as PAID</q-tooltip>
          </q-btn>
          <q-btn
            v-if="selectedRun?.status === 'processed'"
            unelevated
            no-caps
            color="green-8"
            icon="check_circle"
            label="Final Approve"
            class="q-mr-sm"
            @click="finalApprove(selectedRun)"
          >
            <q-tooltip>Approve payroll run — locks payslips for payment</q-tooltip>
          </q-btn>
          <q-btn dense flat icon="close" @click="showPayslips = false" />
        </q-bar>

        <q-scroll-area style="height: calc(100vh - 48px)">
          <div class="q-pa-md">
            <!-- KPI Cards -->
            <div class="row q-col-gutter-md q-mb-md items-stretch">
              <div class="col-6 col-sm-3">
                <q-card flat class="hr-kpi-card hr-kpi-card--green">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon">
                      <q-icon name="trending_up" size="20px" color="white" />
                    </div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Total Gross</div>
                      <div class="hr-kpi-value" style="font-size: 16px">
                        LKR {{ fmt(selectedRun?.total_gross) }}
                      </div>
                    </div>
                    <q-icon name="payments" size="56px" class="hr-kpi-watermark" color="white" />
                  </q-card-section>
                </q-card>
              </div>

              <div class="col-6 col-sm-3">
                <q-card flat class="hr-kpi-card hr-kpi-card--red">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon">
                      <q-icon name="trending_down" size="20px" color="white" />
                    </div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Total Deductions</div>
                      <div class="hr-kpi-value" style="font-size: 16px">
                        LKR {{ fmt(selectedRun?.total_deductions) }}
                      </div>
                    </div>
                    <q-icon
                      name="remove_circle"
                      size="56px"
                      class="hr-kpi-watermark"
                      color="white"
                    />
                  </q-card-section>
                </q-card>
              </div>

              <div class="col-6 col-sm-3">
                <q-card flat class="hr-kpi-card hr-kpi-card--blue">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon">
                      <q-icon name="account_balance_wallet" size="20px" color="white" />
                    </div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Total Net</div>
                      <div class="hr-kpi-value" style="font-size: 16px">
                        LKR {{ fmt(selectedRun?.total_net) }}
                      </div>
                    </div>
                    <q-icon name="wallet" size="56px" class="hr-kpi-watermark" color="white" />
                  </q-card-section>
                </q-card>
              </div>

              <div class="col-6 col-sm-3">
                <q-card flat class="hr-kpi-card hr-kpi-card--purple">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon">
                      <q-icon name="groups" size="20px" color="white" />
                    </div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Employees</div>
                      <div class="hr-kpi-value">{{ selectedRun?.employee_count }}</div>
                    </div>
                    <q-icon name="people" size="56px" class="hr-kpi-watermark" color="white" />
                  </q-card-section>
                </q-card>
              </div>
            </div>

            <!-- ── FILTERS ── -->
            <q-card
              flat
              :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white']"
              :style="{
                border: $q.dark.isActive
                  ? '1px solid rgba(255,255,255,0.08)'
                  : '1px solid rgba(0,0,0,0.1)',
                borderRadius: '10px',
                marginBottom: '12px',
              }"
            >
              <q-card-section class="q-pa-md">
                <div class="row q-col-gutter-sm items-end">
                  <!-- Employee Search -->
                  <div class="col-12 col-sm-3">
                    <div
                      :class="[
                        'text-caption text-weight-medium q-mb-xs',
                        $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                      ]"
                    >
                      Employee
                    </div>
                    <q-input
                      :dark="$q.dark.isActive"
                      dense
                      outlined
                      v-model="psEmpFilter"
                      placeholder="Search name or code…"
                      clearable
                    >
                      <template #prepend><q-icon name="search" size="xs" /></template>
                    </q-input>
                  </div>
                  <!-- Bank Filter -->
                  <div class="col-12 col-sm-3">
                    <div
                      :class="[
                        'text-caption text-weight-medium q-mb-xs',
                        $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                      ]"
                    >
                      Bank
                    </div>
                    <q-select
                      :dark="$q.dark.isActive"
                      dense
                      outlined
                      v-model="psBankFilter"
                      :options="['All Banks', ...availableBanks]"
                      emit-value
                      map-options
                    />
                  </div>
                  <!-- Paid / Unpaid Filter -->
                  <div class="col-12 col-sm-3">
                    <div
                      :class="[
                        'text-caption text-weight-medium q-mb-xs',
                        $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                      ]"
                    >
                      Payment Status
                    </div>
                    <q-select
                      :dark="$q.dark.isActive"
                      dense
                      outlined
                      v-model="psPaidFilter"
                      :options="[
                        { label: 'All', value: 'all' },
                        { label: 'Paid', value: 'paid' },
                        { label: 'Unpaid / Pending', value: 'unpaid' },
                        { label: 'On Hold', value: 'held' },
                      ]"
                      emit-value
                      map-options
                    />
                  </div>
                  <!-- Bulk Actions -->
                  <div class="col-12 col-sm-3 row q-gutter-xs justify-end items-end">
                    <!-- Post to Finance: always visible when run is approved -->
                    <q-btn
                      v-if="selectedRun?.status === 'approved'"
                      unelevated
                      dense
                      no-caps
                      color="blue-8"
                      icon="account_balance"
                      label="Post to Finance"
                      @click="sendToFinance"
                    >
                      <q-tooltip>Post all non-held salaries to Finance</q-tooltip>
                    </q-btn>
                    <q-btn
                      v-if="selectedPayslipIds.length > 0"
                      flat
                      dense
                      no-caps
                      color="grey"
                      icon="clear_all"
                      label="Clear"
                      @click="selectedPayslipRows = []"
                    />
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <!-- ── Payslips Table ── -->
            <q-table
              :dark="$q.dark.isActive"
              flat
              bordered
              dense
              :rows="filteredPayslips"
              :columns="payslipColumns"
              row-key="id"
              :pagination="{ rowsPerPage: 25 }"
              selection="multiple"
              v-model:selected="selectedPayslipRows"
              :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'text-body2']"
              table-header-class="text-weight-bold text-uppercase"
            >
              <template #body-cell-employee="props">
                <q-td :props="props">
                  <div
                    :class="[
                      'text-weight-bold text-caption',
                      $q.dark.isActive ? 'text-white' : 'text-dark',
                    ]"
                  >
                    {{ props.row.employees?.full_name }}
                  </div>
                  <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">
                    {{ props.row.employees?.employee_code }}
                  </div>
                </q-td>
              </template>

              <template #body-cell-bank="props">
                <q-td :props="props">
                  <div class="text-caption">{{ props.row.employees?.bank_name || '—' }}</div>
                  <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-6']">
                    {{ props.row.employees?.account_number || '' }}
                  </div>
                </q-td>
              </template>

              <template #body-cell-status="props">
                <q-td :props="props" class="text-center">
                  <q-badge
                    :color="
                      props.row.is_held || props.row.payment_status === 'held'
                        ? 'red-9'
                        : psStatusColor(props.row.payment_status)
                    "
                    :label="
                      props.row.is_held || props.row.payment_status === 'held'
                        ? 'HELD'
                        : props.row.payment_status || 'pending'
                    "
                    class="text-capitalize text-caption"
                  />
                  <div
                    v-if="
                      (props.row.is_held || props.row.payment_status === 'held') &&
                      props.row.hold_reason
                    "
                    class="text-caption text-red-4 q-mt-xs"
                    style="font-size: 10px; max-width: 120px; white-space: normal"
                  >
                    {{ props.row.hold_reason }}
                  </div>
                </q-td>
              </template>

              <template #body-cell-actions="props">
                <q-td :props="props" class="q-gutter-xs">
                  <!-- View Breakdown -->
                  <q-btn
                    flat
                    dense
                    round
                    icon="receipt_long"
                    color="cyan"
                    size="xs"
                    @click="viewBreakdown(props.row)"
                  >
                    <q-tooltip>View Breakdown</q-tooltip>
                  </q-btn>
                  <!-- Download PDF -->
                  <q-btn
                    flat
                    dense
                    round
                    icon="picture_as_pdf"
                    color="red-4"
                    size="xs"
                    @click="downloadPayslipPDF(props.row)"
                  >
                    <q-tooltip>Download PDF</q-tooltip>
                  </q-btn>
                  <!-- Email -->
                  <q-btn
                    flat
                    dense
                    round
                    icon="email"
                    color="blue-4"
                    size="xs"
                    @click="sendPayslipEmail(props.row)"
                    :loading="sendingEmail === props.row.id"
                  >
                    <q-tooltip>Send to Email</q-tooltip>
                  </q-btn>
                  <!-- Hold: show if not held and not paid -->
                  <q-btn
                    v-if="
                      !(props.row.is_held || props.row.payment_status === 'held') &&
                      props.row.payment_status !== 'paid'
                    "
                    flat
                    dense
                    round
                    icon="pause_circle"
                    color="orange"
                    size="xs"
                    @click="openHoldDialog(props.row)"
                  >
                    <q-tooltip>Put on Hold</q-tooltip>
                  </q-btn>
                  <!-- Release: show if held -->
                  <q-btn
                    v-if="props.row.is_held || props.row.payment_status === 'held'"
                    flat
                    dense
                    round
                    icon="play_circle"
                    color="teal"
                    size="xs"
                    @click="releaseHold(props.row)"
                  >
                    <q-tooltip>Release Hold</q-tooltip>
                  </q-btn>
                  <!-- Mark Paid (individual): show if not held and not paid -->
                  <q-btn
                    v-if="
                      !(props.row.is_held || props.row.payment_status === 'held') &&
                      props.row.payment_status !== 'paid'
                    "
                    flat
                    dense
                    round
                    icon="check_circle"
                    color="green-6"
                    size="xs"
                    @click="openMarkPaidDialog(props.row)"
                  >
                    <q-tooltip>Mark as Paid</q-tooltip>
                  </q-btn>
                </q-td>
              </template>
            </q-table>

            <!-- Summary bar for filtered selection -->
            <div v-if="filteredPayslips.length" class="row justify-end q-mt-sm q-gutter-md">
              <div class="text-caption" :class="$q.dark.isActive ? 'text-grey-5' : 'text-grey-7'">
                Showing {{ filteredPayslips.length }} payslips &nbsp;|&nbsp;
                <span class="text-green text-weight-bold">Paid: LKR {{ fmt(paidTotal) }}</span>
                &nbsp;|&nbsp;
                <span class="text-amber text-weight-bold"
                  >Pending: LKR {{ fmt(pendingTotal) }}</span
                >
                &nbsp;|&nbsp;
                <span class="text-red text-weight-bold">Held: LKR {{ fmt(heldTotal) }}</span>
              </div>
            </div>
          </div>
        </q-scroll-area>
      </q-card>
    </q-dialog>

    <!-- ══ Bulk Payment Export Dialog ══ -->
    <q-dialog v-model="showBulkPaymentDialog" maximized>
      <q-card :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-grey-1']">
        <q-bar
          :class="[$q.dark.isActive ? 'bg-dark' : 'bg-deep-purple-8', 'text-white']"
          style="height: 56px; padding: 0 12px"
        >
          <q-icon name="account_balance" />
          <div class="q-ml-sm text-weight-bold">Salary & Wages Transfer</div>
          <q-badge color="amber" text-color="dark" class="q-ml-sm">
            {{ bulkMonthLabel }}
          </q-badge>
          <q-space />
          <q-btn dense flat icon="close" color="white" @click="showBulkPaymentDialog = false" />
        </q-bar>

        <q-scroll-area style="height: calc(100vh - 56px)">
          <div class="q-pa-lg">
            <!-- Summary Cards -->
            <div class="row q-col-gutter-md q-mb-lg">
              <div class="col-6 col-sm-3">
                <q-card flat class="hr-kpi-card hr-kpi-card--blue">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon">
                      <q-icon name="groups" size="20px" color="white" />
                    </div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Total Employees</div>
                      <div class="hr-kpi-value">{{ bulkPaymentData.length }}</div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>
              <div class="col-6 col-sm-3">
                <q-card flat class="hr-kpi-card hr-kpi-card--green">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon">
                      <q-icon name="account_balance" size="20px" color="white" />
                    </div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Bank Groups</div>
                      <div class="hr-kpi-value">{{ bankGroupsComputed.length }}</div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>
              <div class="col-6 col-sm-3">
                <q-card flat class="hr-kpi-card hr-kpi-card--purple">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon">
                      <q-icon name="payments" size="20px" color="white" />
                    </div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Cash Payments</div>
                      <div class="hr-kpi-value">{{ cashGroupComputed.length }}</div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>
              <div class="col-6 col-sm-3">
                <q-card flat class="hr-kpi-card hr-kpi-card--red">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon">
                      <q-icon name="account_balance_wallet" size="20px" color="white" />
                    </div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Total Net Payout</div>
                      <div class="hr-kpi-value" style="font-size: 16px">
                        LKR
                        {{
                          fmt(bulkPaymentData.reduce((s, p) => s + Number(p.net_salary || 0), 0))
                        }}
                      </div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>
            </div>

            <!-- Bank Tabs -->
            <q-tabs
              v-model="activeBulkTab"
              dense
              active-color="blue-8"
              indicator-color="blue-8"
              align="left"
              narrow-indicator
              class="q-mb-md"
              :class="$q.dark.isActive ? 'text-grey-4' : 'text-grey-8'"
            >
              <q-tab
                v-for="g in bankGroupsComputed"
                :key="g.bankName"
                :name="g.bankName"
                :label="g.bankName + ' (' + g.employees.length + ')'"
                no-caps
              />
              <q-tab v-if="cashGroupComputed.length" name="__cash__" label="Cash" no-caps>
                <q-badge color="orange" floating>{{ cashGroupComputed.length }}</q-badge>
              </q-tab>
            </q-tabs>

            <!-- Tab Panels -->
            <q-tab-panels
              v-model="activeBulkTab"
              animated
              :class="$q.dark.isActive ? 'bg-grey-10' : 'bg-transparent'"
            >
              <!-- Bank Group Panels -->
              <q-tab-panel
                v-for="group in bankGroupsComputed"
                :key="group.bankName"
                :name="group.bankName"
                class="q-pa-none"
              >
                <!-- Export Buttons -->
                <div class="row q-gutter-sm q-mb-md">
                  <q-btn
                    unelevated
                    no-caps
                    color="red-8"
                    icon="picture_as_pdf"
                    :label="'Download PDF — ' + group.bankName"
                    @click="exportBankPDF(group)"
                  />
                  <q-btn
                    unelevated
                    no-caps
                    color="green-8"
                    icon="table_chart"
                    :label="'Download XLSX — ' + group.bankName"
                    @click="exportBankXLSX(group)"
                  />
                </div>

                <!-- Letter Preview -->
                <q-card
                  flat
                  :class="$q.dark.isActive ? 'bg-dark' : 'bg-white'"
                  :style="{
                    border: $q.dark.isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid #ccc',
                    borderRadius: '8px',
                  }"
                >
                  <q-card-section
                    style="
                      padding: 40px 50px;
                      font-family: 'Times New Roman', serif;
                      color: #000;
                      font-size: 14px;
                      line-height: 1.7;
                    "
                  >
                    <div>{{ bulkLetterDate }}</div>
                    <div class="q-mt-sm" style="font-weight: 600">THE MANAGER</div>
                    <div style="font-weight: 600; text-transform: uppercase">
                      {{ group.bankName }}
                    </div>
                    <div
                      class="q-mt-sm"
                      style="
                        font-weight: 700;
                        text-decoration: underline;
                        text-align: center;
                        font-size: 15px;
                      "
                    >
                      SALARY & WAGES TRANSFER – {{ bulkMonthLabel }}
                    </div>
                    <div class="q-mt-md">Dear Sir,</div>
                    <div class="q-mt-sm">
                      Appreciate if you could arrange to Transfer
                      <strong>Rs. {{ fmt(group.totalNet) }}</strong> to the following individual
                      accounts as salary payment, for the month of {{ bulkMonthLabel }} from Rupee
                      <strong>Account No.{{ getCompanyBankAccount(group.bankName) }}</strong>
                    </div>
                    <div class="q-mt-md" style="text-align: center; font-weight: 700">
                      Seven Wave Food Court (Pvt) Ltd
                    </div>
                    <div style="text-align: center; font-weight: 700; text-decoration: underline">
                      SALARY & WAGES TRANSFER – {{ bulkMonthLabel }}
                    </div>

                    <!-- Employee Table -->
                    <table
                      style="
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 16px;
                        font-size: 13px;
                        border: 1px solid #000;
                      "
                    >
                      <thead>
                        <tr
                          style="
                            background: #f5f5f5;
                            font-weight: 700;
                            border-bottom: 2px solid #000;
                          "
                        >
                          <td style="border: 1px solid #000; padding: 6px 10px; text-align: center">
                            Employee<br />No.
                          </td>
                          <td style="border: 1px solid #000; padding: 6px 10px">Name</td>
                          <td style="border: 1px solid #000; padding: 6px 10px">NIC No.</td>
                          <td style="border: 1px solid #000; padding: 6px 10px">Account No.</td>
                          <td style="border: 1px solid #000; padding: 6px 10px; text-align: right">
                            Amount
                          </td>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="(emp, idx) in group.employees"
                          :key="emp.id"
                          style="border-bottom: 1px solid #ccc"
                        >
                          <td style="border: 1px solid #ccc; padding: 5px 10px; text-align: center">
                            {{ idx + 1 }}
                          </td>
                          <td style="border: 1px solid #ccc; padding: 5px 10px">
                            {{ emp.employees?.full_name }}
                          </td>
                          <td style="border: 1px solid #ccc; padding: 5px 10px">
                            {{ emp.employees?.nic_number || '—' }}
                          </td>
                          <td style="border: 1px solid #ccc; padding: 5px 10px">
                            {{
                              emp.employees?.bank_account_number ||
                              emp.employees?.account_number ||
                              '—'
                            }}
                          </td>
                          <td
                            style="
                              border: 1px solid #ccc;
                              padding: 5px 10px;
                              text-align: right;
                              white-space: nowrap;
                            "
                          >
                            LKR {{ fmt(emp.net_salary) }}
                          </td>
                        </tr>
                        <tr
                          style="font-weight: 700; border-top: 2px solid #000; background: #f9f9f9"
                        >
                          <td
                            colspan="4"
                            style="border: 1px solid #000; padding: 6px 10px; text-align: right"
                          >
                            TOTAL
                          </td>
                          <td
                            style="
                              border: 1px solid #000;
                              padding: 6px 10px;
                              text-align: right;
                              white-space: nowrap;
                            "
                          >
                            LKR {{ fmt(group.totalNet) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div class="q-mt-xl">Thank You</div>
                    <div class="q-mt-xl" style="letter-spacing: 4px">………………………………….</div>
                    <div style="font-weight: 600">Director</div>
                  </q-card-section>
                </q-card>
              </q-tab-panel>

              <!-- Cash Panel -->
              <q-tab-panel v-if="cashGroupComputed.length" name="__cash__" class="q-pa-none">
                <div class="row q-gutter-sm q-mb-md">
                  <q-btn
                    unelevated
                    no-caps
                    color="red-8"
                    icon="picture_as_pdf"
                    label="Download Cash PDF"
                    @click="exportCashPDF"
                  />
                  <q-btn
                    unelevated
                    no-caps
                    color="green-8"
                    icon="table_chart"
                    label="Download Cash XLSX"
                    @click="exportCashXLSX"
                  />
                </div>
                <q-card
                  flat
                  :class="$q.dark.isActive ? 'bg-dark' : 'bg-white'"
                  :style="{
                    border: $q.dark.isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid #ccc',
                    borderRadius: '8px',
                  }"
                >
                  <q-card-section
                    style="
                      padding: 40px 50px;
                      font-family: 'Times New Roman', serif;
                      color: #000;
                      font-size: 14px;
                      line-height: 1.7;
                    "
                  >
                    <div>{{ bulkLetterDate }}</div>
                    <div class="q-mt-md" style="text-align: center; font-weight: 700">
                      Seven Wave Food Court (Pvt) Ltd
                    </div>
                    <div style="text-align: center; font-weight: 700; text-decoration: underline">
                      CASH SALARY PAYMENT – {{ bulkMonthLabel }}
                    </div>
                    <table
                      style="
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 16px;
                        font-size: 13px;
                        border: 1px solid #000;
                      "
                    >
                      <thead>
                        <tr
                          style="
                            background: #f5f5f5;
                            font-weight: 700;
                            border-bottom: 2px solid #000;
                          "
                        >
                          <td style="border: 1px solid #000; padding: 6px 10px; text-align: center">
                            No.
                          </td>
                          <td style="border: 1px solid #000; padding: 6px 10px">Employee Name</td>
                          <td style="border: 1px solid #000; padding: 6px 10px">NIC No.</td>
                          <td style="border: 1px solid #000; padding: 6px 10px; text-align: right">
                            Amount
                          </td>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="(emp, idx) in cashGroupComputed"
                          :key="emp.id"
                          style="border-bottom: 1px solid #ccc"
                        >
                          <td style="border: 1px solid #ccc; padding: 5px 10px; text-align: center">
                            {{ idx + 1 }}
                          </td>
                          <td style="border: 1px solid #ccc; padding: 5px 10px">
                            {{ emp.employees?.full_name }}
                          </td>
                          <td style="border: 1px solid #ccc; padding: 5px 10px">
                            {{ emp.employees?.nic_number || '—' }}
                          </td>
                          <td
                            style="
                              border: 1px solid #ccc;
                              padding: 5px 10px;
                              text-align: right;
                              white-space: nowrap;
                            "
                          >
                            LKR {{ fmt(emp.net_salary) }}
                          </td>
                        </tr>
                        <tr
                          style="font-weight: 700; border-top: 2px solid #000; background: #f9f9f9"
                        >
                          <td
                            colspan="3"
                            style="border: 1px solid #000; padding: 6px 10px; text-align: right"
                          >
                            TOTAL
                          </td>
                          <td
                            style="
                              border: 1px solid #000;
                              padding: 6px 10px;
                              text-align: right;
                              white-space: nowrap;
                            "
                          >
                            LKR
                            {{
                              fmt(
                                cashGroupComputed.reduce(
                                  (s, p) => s + Number(p.net_salary || 0),
                                  0,
                                ),
                              )
                            }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div class="q-mt-xl">Thank You</div>
                    <div class="q-mt-xl" style="letter-spacing: 4px">………………………………….</div>
                    <div style="font-weight: 600">Director</div>
                  </q-card-section>
                </q-card>
              </q-tab-panel>
            </q-tab-panels>

            <!-- Empty state -->
            <div v-if="bulkPaymentData.length === 0" class="text-center q-pa-xl">
              <q-icon name="info" size="48px" color="grey" />
              <div class="text-grey q-mt-md">No paid payslips found for this run.</div>
            </div>
          </div>
        </q-scroll-area>
      </q-card>
    </q-dialog>

    <!-- ══ Hold Dialog ══ -->
    <q-dialog v-model="showHoldDialog" persistent>
      <q-card :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-white']" style="min-width: 460px">
        <q-card-section>
          <div class="row items-center q-mb-sm">
            <q-icon name="pause_circle" color="orange" size="sm" class="q-mr-sm" />
            <div
              :class="[
                'text-subtitle1 text-weight-bold',
                $q.dark.isActive ? 'text-white' : 'text-dark',
              ]"
            >
              Put Salary on Hold
            </div>
          </div>
          <div :class="['text-caption q-mb-md', $q.dark.isActive ? 'text-grey-4' : 'text-grey-7']">
            Employee: <strong>{{ holdTarget?.employees?.full_name }}</strong> &nbsp;|&nbsp; Net
            Salary: <strong class="text-orange">LKR {{ fmt(holdTarget?.net_salary) }}</strong>
          </div>
          <div
            :class="[
              'text-caption text-weight-medium q-mb-xs',
              $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
            ]"
          >
            Reason for Hold *
          </div>
          <q-input
            :dark="$q.dark.isActive"
            outlined
            dense
            v-model="holdReason"
            type="textarea"
            rows="3"
            placeholder="e.g. Pending disciplinary action, Document verification…"
            :rules="[(v) => !!v || 'Reason is required']"
          />
          <div
            :class="['text-caption q-mt-sm', $q.dark.isActive ? 'text-orange-3' : 'text-orange-10']"
          >
            <q-icon name="info" size="14px" class="q-mr-xs" />
            The held salary will NOT be sent to Finance and will remain as pending until released.
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="orange-8"
            icon="pause_circle"
            label="Hold Salary"
            no-caps
            :loading="holdSaving"
            @click="saveHold"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ Mark Paid Dialog ══ -->
    <q-dialog v-model="showMarkPaidDialog" persistent>
      <q-card :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-white']" style="min-width: 480px">
        <q-card-section>
          <div class="row items-center q-mb-sm">
            <q-icon name="check_circle" color="green" size="sm" class="q-mr-sm" />
            <div
              :class="[
                'text-subtitle1 text-weight-bold',
                $q.dark.isActive ? 'text-white' : 'text-dark',
              ]"
            >
              Mark as Paid
            </div>
          </div>
          <div :class="['text-caption q-mb-md', $q.dark.isActive ? 'text-grey-4' : 'text-grey-7']">
            Employee: <strong>{{ markPaidTarget?.employees?.full_name }}</strong> &nbsp;|&nbsp; Net:
            <strong class="text-green">LKR {{ fmt(markPaidTarget?.net_salary) }}</strong>
          </div>
          <div class="q-gutter-sm">
            <!-- Payment Method -->
            <div>
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Payment Method
              </div>
              <q-select
                :dark="$q.dark.isActive"
                outlined
                dense
                v-model="paidMethod"
                :options="['Bank Transfer', 'Cash', 'Cheque', 'Online']"
              />
            </div>
            <!-- Cash/Bank Account (Finance) -->
            <div>
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Paid From Account
              </div>
              <q-select
                :dark="$q.dark.isActive"
                outlined
                dense
                v-model="paidAccountId"
                :options="cashBankAccounts"
                emit-value
                map-options
                clearable
                placeholder="Select finance account..."
                :loading="!financeAccounts.length"
                @popup-show="loadAccounts"
              >
                <template #prepend><q-icon name="account_balance" size="xs" /></template>
              </q-select>
              <div class="text-caption text-grey-5 q-mt-xs">
                <q-icon name="info" size="12px" class="q-mr-xs" />
                {{
                  paidMethod === 'Cash'
                    ? 'Select the Cash Account that will be credited'
                    : 'Select the Bank Account that will be debited'
                }}
              </div>
            </div>
            <!-- Reference -->
            <div>
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Reference / Transaction ID
              </div>
              <q-input
                :dark="$q.dark.isActive"
                outlined
                dense
                v-model="paidReference"
                placeholder="e.g. TXN2026030012"
              />
            </div>
            <!-- Date -->
            <div>
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Payment Date
              </div>
              <q-input :dark="$q.dark.isActive" outlined dense v-model="paidDate" type="date" />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="green-8"
            icon="check_circle"
            label="Confirm Paid"
            no-caps
            :loading="markPaidSaving"
            @click="confirmMarkPaid"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ Payslip Breakdown Dialog (Visual Replica of PDF) ══ -->
    <q-dialog v-model="showBreakdown" full-height>
      <q-card
        :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-grey-2']"
        style="width: 550px; max-width: 95vw; display: flex; flex-direction: column"
      >
        <q-bar :class="[$q.dark.isActive ? 'bg-dark' : 'bg-blue-grey-8', 'text-white']">
          <q-icon name="receipt_long" />
          <div class="q-ml-sm text-weight-bold">
            Payslip Preview — {{ selectedPayslip?.employees?.full_name }}
          </div>
          <q-space />
          <q-btn dense flat icon="close" @click="showBreakdown = false" />
        </q-bar>

        <q-card-section v-if="loadingBreakdown" class="text-center q-pa-xl flex-center flex">
          <q-spinner size="40px" color="primary" />
          <div class="q-mt-sm text-grey-6 text-body2">Loading preview…</div>
        </q-card-section>

        <!-- Preview Document Area -->
        <q-card-section
          v-if="!loadingBreakdown && pdfData"
          scroll
          class="q-pa-md flex flex-center bg-grey-3"
        >
          <div
            class="shadow-4"
            style="
              width: 450px;
              background: white;
              color: black;
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              padding: 25px;
            "
          >
            <div style="border: 2px solid black">
              <!-- Top Header Section -->
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  padding: 30px 25px 25px 25px;
                  align-items: flex-start;
                "
              >
                <div style="width: 90px; text-align: left">
                  <img
                    src="~assets/seven-waves-logo-transparent.png"
                    style="width: 70px; height: auto; object-fit: contain; display: block"
                  />
                </div>
                <div
                  style="
                    text-align: right;
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    color: #111;
                  "
                >
                  <div
                    style="
                      margin-bottom: 35px;
                      font-weight: 800;
                      font-size: 18px;
                      letter-spacing: 2px;
                    "
                  >
                    SEVEN_WAVES
                  </div>
                  <div style="margin-bottom: 15px; font-weight: 500; font-size: 15px">
                    {{ pdfData.year }}
                  </div>
                  <div style="font-weight: 500; font-size: 15px">{{ pdfData.month }}</div>
                </div>
              </div>

              <!-- Main Details Table -->
              <table
                style="
                  width: 100%;
                  border-collapse: collapse;
                  font-size: 14px;
                  border-top: 2px solid black;
                  color: #000;
                "
              >
                <tbody>
                  <tr>
                    <td class="pspdf-lbl">Employee ID</td>
                    <td class="pspdf-val">{{ pdfData.code }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Employee Name</td>
                    <td class="pspdf-val">{{ pdfData.empName }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Designation</td>
                    <td class="pspdf-val">{{ pdfData.designation }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Basic Salary</td>
                    <td class="pspdf-val">{{ pdfData.basic }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">FingerPrint ID</td>
                    <td class="pspdf-val">{{ pdfData.fingerprintId }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Gross Pay</td>
                    <td class="pspdf-val">{{ pdfData.grossPay }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Attendance Allowance</td>
                    <td class="pspdf-val">{{ pdfData.attendanceAllowance }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Variable Allowance</td>
                    <td class="pspdf-val">{{ pdfData.variableAllowance }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Service Charge</td>
                    <td class="pspdf-val">{{ pdfData.serviceCharge }}</td>
                  </tr>

                  <tr>
                    <td class="pspdf-lbl">
                      <div style="display: flex; justify-content: space-between">
                        <span>Extra Day Work</span
                        ><span style="letter-spacing: 2px">{{ pdfData.extraDayHours }}</span>
                      </div>
                    </td>
                    <td class="pspdf-val">{{ pdfData.extraDayAmount }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">
                      <div style="display: flex; justify-content: space-between">
                        <span>Normal OT</span
                        ><span style="letter-spacing: 2px">{{ pdfData.normalOtHours }}</span>
                      </div>
                    </td>
                    <td class="pspdf-val">{{ pdfData.normalOtAmount }}</td>
                  </tr>
                  <tr style="font-weight: 700">
                    <td class="pspdf-lbl">
                      <div style="display: flex; justify-content: space-between">
                        <span>(Less) No Pay</span
                        ><span style="letter-spacing: 2px">{{ pdfData.noPayDays }}</span>
                      </div>
                    </td>
                    <td class="pspdf-val">{{ pdfData.noPayAmount }}</td>
                  </tr>
                  <tr style="font-weight: 800; font-size: 14px">
                    <td class="pspdf-lbl">Gross Salary</td>
                    <td class="pspdf-val">{{ pdfData.grossSalary }}</td>
                  </tr>

                  <!-- Deductions Section -->
                  <tr>
                    <td
                      colspan="2"
                      style="
                        padding: 25px 10px 10px 10px;
                        font-weight: 800;
                        font-size: 13px;
                        border-right: 1px solid transparent;
                        border-bottom: 2px dotted transparent;
                      "
                    >
                      Deductions
                    </td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">EPF Deduction</td>
                    <td class="pspdf-val">{{ pdfData.epfDeduction }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Staff Bill</td>
                    <td class="pspdf-val">{{ pdfData.staffBill }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Staff Loan</td>
                    <td class="pspdf-val">{{ pdfData.staffLoan }}</td>
                  </tr>
                  <tr>
                    <td class="pspdf-lbl">Salary Advance</td>
                    <td class="pspdf-val">{{ pdfData.salaryAdvance }}</td>
                  </tr>
                  <tr style="font-weight: 800; font-size: 14px">
                    <td class="pspdf-lbl">Total Deduction</td>
                    <td class="pspdf-val">{{ pdfData.totalDeduction }}</td>
                  </tr>
                  <tr style="font-weight: 800; font-size: 14px">
                    <td class="pspdf-lbl" style="padding-bottom: 30px; border-bottom: none">
                      Net Salary
                    </td>
                    <td class="pspdf-val" style="padding-bottom: 30px; border-bottom: none">
                      {{ pdfData.netSalary }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Bottom Signature -->
            <div
              style="
                margin-top: 55px;
                margin-bottom: 10px;
                text-align: center;
                color: black;
                font-size: 12px;
                font-family: 'Consolas', 'Courier New', monospace;
              "
            >
              <div style="border-top: 2px dotted #555; width: 85%; margin: 0 auto 8px auto"></div>
              <div>Signature</div>
              <div
                style="
                  color: #d32f2f;
                  margin-top: 20px;
                  font-size: 11px;
                  font-family: 'Arial', sans-serif;
                "
              >
                * This is only a payslip preview and has not been<br />approved by the accountant
                yet. *
              </div>
            </div>
          </div>
        </q-card-section>

        <!-- Actions -->
        <q-card-actions align="right" class="bg-white q-pa-md">
          <q-btn flat label="Close" color="grey" v-close-popup no-caps />
          <q-btn
            unelevated
            icon="download"
            label="Download PDF"
            color="primary"
            @click="downloadPayslipPDF(selectedPayslip)"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ POST TO FINANCE Dialog ══ -->
    <q-dialog v-model="showPostFinanceDialog" persistent>
      <q-card
        :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-white']"
        style="min-width: 540px; max-width: 95vw"
      >
        <!-- Header -->
        <q-card-section
          class="row items-center q-pa-md"
          :style="{ background: 'linear-gradient(135deg, #0f4c75 0%, #1976d2 100%)' }"
        >
          <q-icon name="account_balance" color="white" size="22px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold text-white">Post Payroll to Finance</div>
          <q-space />
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>

        <!-- Payroll Summary Banner -->
        <div :class="['row q-pa-md q-col-gutter-md', $q.dark.isActive ? 'bg-grey-9' : 'bg-blue-1']">
          <div class="col">
            <div class="text-caption text-grey-6">Period</div>
            <div class="text-weight-bold text-caption">
              {{ selectedRun?.period_start }} — {{ selectedRun?.period_end }}
            </div>
          </div>
          <div class="col">
            <div class="text-caption text-grey-6">Employees</div>
            <div class="text-weight-bold text-caption">
              {{ payslips.filter((p) => !p.is_held).length }}
            </div>
          </div>
          <div class="col">
            <div class="text-caption text-grey-6">Total to Pay</div>
            <div class="text-weight-bold text-green">
              LKR
              {{
                fmt(
                  payslips
                    .filter((p) => !p.is_held && p.payment_status !== 'paid')
                    .reduce((s, p) => s + Number(p.net_salary || 0), 0),
                )
              }}
            </div>
          </div>
          <div class="col" v-if="heldTotal > 0">
            <div class="text-caption text-grey-6">On Hold (excluded)</div>
            <div class="text-weight-bold text-orange">LKR {{ fmt(heldTotal) }}</div>
          </div>
        </div>

        <q-card-section class="q-gutter-md q-pa-lg">
          <!-- ── STEP 1: Payment Method ──────────────────────── -->
          <div>
            <div class="row items-center q-mb-sm">
              <q-avatar
                size="22px"
                color="blue-8"
                text-color="white"
                class="q-mr-sm text-caption text-weight-bold"
                >1</q-avatar
              >
              <span :class="['text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-dark']"
                >Payment Method</span
              >
            </div>
            <div class="row q-gutter-sm">
              <q-btn
                v-for="m in paymentMethods"
                :key="m.value"
                unelevated
                no-caps
                :label="m.label"
                :icon="m.icon"
                :color="
                  postFinanceForm.payment_method === m.value
                    ? 'blue-8'
                    : $q.dark.isActive
                      ? 'grey-8'
                      : 'grey-2'
                "
                :text-color="postFinanceForm.payment_method === m.value ? 'white' : 'grey-7'"
                @click="postFinanceForm.payment_method = m.value"
                style="flex: 1; min-width: 120px"
              />
            </div>
          </div>

          <q-separator />

          <!-- ── STEP 2: Which account is money going OUT from ─ -->
          <div>
            <div class="row items-center q-mb-sm">
              <q-avatar
                size="22px"
                color="blue-8"
                text-color="white"
                class="q-mr-sm text-caption text-weight-bold"
                >2</q-avatar
              >
              <span :class="['text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-dark']">
                {{
                  postFinanceForm.payment_method === 'cash'
                    ? 'Cash Account (money goes out from)'
                    : postFinanceForm.payment_method === 'cheque'
                      ? 'Bank Account (cheque issued from)'
                      : 'Bank Account (transfer from)'
                }}
              </span>
            </div>
            <q-select
              :dark="$q.dark.isActive"
              outlined
              dense
              v-model="postFinanceForm.cash_bank_acc"
              :options="postFinanceForm.payment_method === 'cash' ? cashAccounts : bankAccounts"
              emit-value
              map-options
              clearable
              :loading="loadingAccounts"
              @popup-show="loadAccounts"
            >
              <template #prepend>
                <q-icon
                  :name="
                    postFinanceForm.payment_method === 'cash'
                      ? 'payments'
                      : 'account_balance_wallet'
                  "
                  size="xs"
                />
              </template>
              <template #no-option>
                <q-item
                  ><q-item-section class="text-grey-5"
                    >No accounts found — add accounts in Finance → Chart of Accounts</q-item-section
                  ></q-item
                >
              </template>
            </q-select>
            <div class="text-caption text-grey-5 q-mt-xs q-pl-xs">
              <q-icon name="info" size="12px" class="q-mr-xs" />
              {{
                postFinanceForm.payment_method === 'cash'
                  ? '💵 This cash account will be CREDITED (balance reduces)'
                  : '🏦 This bank account will be CREDITED (balance reduces)'
              }}
            </div>
          </div>

          <q-separator />

          <!-- Removed Step 3 UI manually mapped to codes: 5100, 2200, etc. -->

          <!-- Held salary warning -->
          <div
            v-if="heldTotal > 0"
            :class="[
              'rounded-borders q-pa-sm row items-center q-gutter-sm',
              $q.dark.isActive ? 'bg-orange-10' : 'bg-orange-1',
            ]"
          >
            <q-icon name="warning" color="orange" />
            <div class="text-caption text-orange">
              <strong>{{ payslips.filter((p) => p.is_held).length }} salary(ies) on HOLD</strong> —
              LKR {{ fmt(heldTotal) }} will NOT be posted to Finance.
            </div>
          </div>
        </q-card-section>

        <q-card-actions
          align="right"
          class="q-pa-md"
          :style="{
            borderTop: $q.dark.isActive
              ? '1px solid rgba(255,255,255,0.07)'
              : '1px solid rgba(0,0,0,0.08)',
          }"
        >
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="blue-8"
            icon="account_balance"
            no-caps
            label="Post to Finance & Mark Paid"
            @click="confirmPostToFinance"
            :loading="postingFinance"
            :disable="!postFinanceForm.cash_bank_acc"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Hidden Template for Print/PDF -->
    <div
      style="
        position: absolute;
        left: -9999px;
        top: -9999px;
        overflow: hidden;
        pointer-events: none;
      "
    >
      <div
        v-if="pdfData"
        id="payslip-print-view"
        style="
          width: 450px;
          background: white;
          color: black;
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          padding: 25px;
        "
      >
        <div style="border: 2px solid black">
          <!-- Top Header Section -->
          <div
            style="
              display: flex;
              justify-content: space-between;
              padding: 30px 25px 25px 25px;
              align-items: flex-start;
            "
          >
            <div style="width: 90px; text-align: left">
              <img
                src="~assets/seven-waves-logo-transparent.png"
                style="width: 70px; height: auto; object-fit: contain; display: block"
              />
            </div>
            <div
              style="
                text-align: right;
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                color: #111;
              "
            >
              <div
                style="margin-bottom: 35px; font-weight: 800; font-size: 18px; letter-spacing: 2px"
              >
                SEVEN_WAVES
              </div>
              <div style="margin-bottom: 15px; font-weight: 500; font-size: 15px">
                {{ pdfData.year }}
              </div>
              <div style="font-weight: 500; font-size: 15px">{{ pdfData.month }}</div>
            </div>
          </div>

          <!-- Main Details Table -->
          <table
            style="
              width: 100%;
              border-collapse: collapse;
              font-size: 14px;
              border-top: 2px solid black;
              color: #000;
            "
          >
            <tbody>
              <tr>
                <td class="pspdf-lbl">Employee ID</td>
                <td class="pspdf-val">{{ pdfData.code }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Employee Name</td>
                <td class="pspdf-val">{{ pdfData.empName }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Designation</td>
                <td class="pspdf-val">{{ pdfData.designation }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Basic Salary</td>
                <td class="pspdf-val">{{ pdfData.basic }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">FingerPrint ID</td>
                <td class="pspdf-val">{{ pdfData.fingerprintId }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Gross Pay</td>
                <td class="pspdf-val">{{ pdfData.grossPay }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Attendance Allowance</td>
                <td class="pspdf-val">{{ pdfData.attendanceAllowance }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Variable Allowance</td>
                <td class="pspdf-val">{{ pdfData.variableAllowance }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Service Charge</td>
                <td class="pspdf-val">{{ pdfData.serviceCharge }}</td>
              </tr>

              <tr>
                <td class="pspdf-lbl">
                  <div style="display: flex; justify-content: space-between">
                    <span>Extra Day Work</span
                    ><span style="letter-spacing: 2px">{{ pdfData.extraDayHours }}</span>
                  </div>
                </td>
                <td class="pspdf-val">{{ pdfData.extraDayAmount }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">
                  <div style="display: flex; justify-content: space-between">
                    <span>Normal OT</span
                    ><span style="letter-spacing: 2px">{{ pdfData.normalOtHours }}</span>
                  </div>
                </td>
                <td class="pspdf-val">{{ pdfData.normalOtAmount }}</td>
              </tr>
              <tr style="font-weight: 700">
                <td class="pspdf-lbl">
                  <div style="display: flex; justify-content: space-between">
                    <span>(Less) No Pay</span
                    ><span style="letter-spacing: 2px">{{ pdfData.noPayDays }}</span>
                  </div>
                </td>
                <td class="pspdf-val">{{ pdfData.noPayAmount }}</td>
              </tr>
              <tr style="font-weight: 800; font-size: 14px">
                <td class="pspdf-lbl">Gross Salary</td>
                <td class="pspdf-val">{{ pdfData.grossSalary }}</td>
              </tr>

              <!-- Deductions Section -->
              <tr>
                <td
                  colspan="2"
                  style="
                    padding: 25px 10px 10px 10px;
                    font-weight: 800;
                    font-size: 13px;
                    border-right: 1px solid transparent;
                    border-bottom: 2px dotted transparent;
                  "
                >
                  Deductions
                </td>
              </tr>
              <tr>
                <td class="pspdf-lbl">EPF Deduction</td>
                <td class="pspdf-val">{{ pdfData.epfDeduction }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Staff Bill</td>
                <td class="pspdf-val">{{ pdfData.staffBill }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Staff Loan</td>
                <td class="pspdf-val">{{ pdfData.staffLoan }}</td>
              </tr>
              <tr>
                <td class="pspdf-lbl">Salary Advance</td>
                <td class="pspdf-val">{{ pdfData.salaryAdvance }}</td>
              </tr>
              <tr style="font-weight: 800; font-size: 14px">
                <td class="pspdf-lbl">Total Deduction</td>
                <td class="pspdf-val">{{ pdfData.totalDeduction }}</td>
              </tr>
              <tr style="font-weight: 800; font-size: 14px">
                <td class="pspdf-lbl" style="padding-bottom: 30px; border-bottom: none">
                  Net Salary
                </td>
                <td class="pspdf-val" style="padding-bottom: 30px; border-bottom: none">
                  {{ pdfData.netSalary }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Bottom Signature -->
        <div
          style="
            margin-top: 55px;
            margin-bottom: 10px;
            text-align: center;
            color: black;
            font-size: 12px;
            font-family: 'Consolas', 'Courier New', monospace;
          "
        >
          <div style="border-top: 2px dotted #555; width: 85%; margin: 0 auto 8px auto"></div>
          <div>Signature</div>
          <div
            style="
              color: #d32f2f;
              margin-top: 20px;
              font-size: 11px;
              font-family: 'Arial', sans-serif;
            "
          >
            * This is only a payslip preview and has not been<br />approved by the accountant yet. *
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const $q = useQuasar()
const authStore = useAuthStore()

// For the exact format PDF
const pdfData = ref(null)

// ── Payroll Runs ──────────────────────────────────────────────────────────────
const loading = ref(false)
const processing = ref(false)
const runs = ref([])
const statusFilter = ref('All')
const showRunDialog = ref(false)
const payrollMonth = ref('')
const selectedRun = ref(null)

// ── Payslips view ─────────────────────────────────────────────────────────────
const payslips = ref([])
const showPayslips = ref(false)
const sendingEmail = ref(null)
const selectedPayslipRows = ref([])

// ── Filters inside payslips dialog ───────────────────────────────────────────
const psEmpFilter = ref('')
const psBankFilter = ref('All Banks')
const psPaidFilter = ref('all')

// ── Hold dialog ───────────────────────────────────────────────────────────────
const showHoldDialog = ref(false)
const holdTarget = ref(null)
const holdReason = ref('')
const holdSaving = ref(false)

// ── Mark Paid dialog ──────────────────────────────────────────────────────────
const showMarkPaidDialog = ref(false)
const markPaidTarget = ref(null)
const paidMethod = ref('Bank Transfer')
const paidReference = ref('')
const paidDate = ref(new Date().toISOString().slice(0, 10))
const paidAccountId = ref(null) // ← which finance account cash goes from
const markPaidSaving = ref(false)

// ── Post to Finance (full run) ────────────────────────────────────────────────
const showPostFinanceDialog = ref(false)
const postingFinance = ref(false)
const financeAccounts = ref([]) // all chart_of_accounts rows
const postFinanceForm = reactive({
  payment_method: 'bank_transfer', // bank_transfer | cash
  salary_expense_acc: null, // Debit: Salary Expense
  epf_expense_acc: null, // Debit: EPF Expense (Employer)
  etf_expense_acc: null, // Debit: ETF Expense (Employer)
  salary_payable_acc: null, // Credit: Salaries Payable
  epf_payable_acc: null, // Credit: EPF Payable
  etf_payable_acc: null, // Credit: ETF Payable
  cash_bank_acc: null, // Actual cash/bank account
})

// Grouped account lists for dropdowns
const cashBankAccounts = computed(() =>
  financeAccounts.value
    .filter((a) => a.account_type === 'Asset' && a.is_active)
    .map((a) => ({ label: `${a.code} — ${a.name}`, value: a.id })),
)
// Bank accounts = Bank accounts from finance_accounts
const bankAccounts = computed(() =>
  financeAccounts.value
    .filter(
      (a) =>
        a.account_type === 'bank' ||
        (a.account_type === 'Asset' && a.is_active && a.name?.toLowerCase().includes('bank')),
    )
    .map((a) => {
      const bName = a.bank_name ? `${a.bank_name} — ` : ''
      const accNum = a.account_number ? ` (${a.account_number})` : ''
      const bal = a.current_balance !== undefined ? ` — LKR ${fmt(a.current_balance)}` : ''
      return {
        label: `${bName}${a.registered_name || a.name}${accNum}${bal}`,
        value: a.id,
      }
    }),
)
// Cash accounts = Cash accounts from finance_accounts
const cashAccounts = computed(() =>
  financeAccounts.value
    .filter(
      (a) =>
        a.account_type === 'cash' ||
        (a.account_type === 'Asset' &&
          a.is_active &&
          (a.name?.toLowerCase().includes('cash') || a.name?.toLowerCase().includes('petty'))),
    )
    .map((a) => {
      const bal = a.current_balance !== undefined ? ` — LKR ${fmt(a.current_balance)}` : ''
      return {
        label: `${a.registered_name || a.name} (Cash Account)${bal}`,
        value: a.id,
      }
    }),
)

watch(
  () => postFinanceForm.payment_method,
  (method) => {
    const isCash = method === 'cash'
    const targetList = isCash ? cashAccounts.value : bankAccounts.value
    if (targetList.length > 0) {
      const stillValid = targetList.some((a) => a.value === postFinanceForm.cash_bank_acc)
      if (!stillValid) {
        postFinanceForm.cash_bank_acc = targetList[0].value
      }
    }
  },
)
const loadingAccounts = ref(false)

const paymentMethods = [
  { label: 'Bank Transfer', value: 'bank_transfer', icon: 'account_balance' },
  { label: 'Cash', value: 'cash', icon: 'payments' },
  { label: 'Cheque', value: 'cheque', icon: 'description' },
]

// ── Breakdown ─────────────────────────────────────────────────────────────────
const showBreakdown = ref(false)
const selectedPayslip = ref(null)
const breakdown = ref(null)
const loadingBreakdown = ref(false)

// ── Bulk Payment Export ───────────────────────────────────────────────────────
const showBulkPaymentDialog = ref(false)
const bulkPaymentData = ref([])
const activeBulkTab = ref('')
const companyBankAccounts = ref([])

const bulkMonthLabel = computed(() => {
  if (!selectedRun.value?.period_start) return ''
  const d = new Date(selectedRun.value.period_start + 'T00:00:00')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
})

const bulkLetterDate = computed(() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
})

const bankGroupsComputed = computed(() => {
  const groups = {}
  bulkPaymentData.value.forEach((p) => {
    const bankName = p.employees?.bank_name?.trim()
    if (!bankName) return
    if (!groups[bankName]) groups[bankName] = { bankName, employees: [], totalNet: 0 }
    groups[bankName].employees.push(p)
    groups[bankName].totalNet += Number(p.net_salary || 0)
  })
  return Object.values(groups).sort((a, b) => a.bankName.localeCompare(b.bankName))
})

const cashGroupComputed = computed(() =>
  bulkPaymentData.value.filter((p) => !p.employees?.bank_name?.trim()),
)

function getCompanyBankAccount(bankName) {
  const match = companyBankAccounts.value.find(
    (a) =>
      a.bank_name?.toLowerCase().includes(bankName.toLowerCase()) ||
      bankName.toLowerCase().includes(a.bank_name?.toLowerCase()),
  )
  return match?.account_number || '_______________'
}

async function openBulkPaymentExport() {
  if (!selectedRun.value) return
  $q.loading.show({ message: 'Loading payment data...' })
  try {
    // Load payslips with employee bank details
    const { data, error } = await supabase
      .from('payslips')
      .select(
        '*, employees(full_name, employee_code, email, nic_number, bank_name, bank_branch, bank_account_name, bank_account_number, account_number, bank_code)',
      )
      .eq('payroll_run_id', selectedRun.value.id)
      .eq('payment_status', 'paid')
      .order('net_salary', { ascending: false })
    if (error) throw error
    bulkPaymentData.value = data || []

    // Load company bank accounts
    const { data: banks } = await supabase
      .from('bank_accounts')
      .select('name, bank_name, account_number')
      .eq('is_active', true)
    companyBankAccounts.value = banks || []

    // Set first tab
    if (bankGroupsComputed.value.length > 0) {
      activeBulkTab.value = bankGroupsComputed.value[0].bankName
    } else if (cashGroupComputed.value.length > 0) {
      activeBulkTab.value = '__cash__'
    }
    showBulkPaymentDialog.value = true
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load payment data: ' + err.message })
  } finally {
    $q.loading.hide()
  }
}

// ── PDF Export (Bank Letter Format) ──────────────────────────────────────────
function exportBankPDF(group) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const monthLabel = bulkMonthLabel.value
  const dateStr = bulkLetterDate.value
  const companyAcc = getCompanyBankAccount(group.bankName)
  const totalStr = fmt(group.totalNet)
  let y = 20

  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  doc.text(dateStr, 20, y)
  y += 8
  doc.text('THE MANAGER', 20, y)
  y += 6
  doc.setFont('times', 'bold')
  doc.text(group.bankName.toUpperCase(), 20, y)
  y += 10

  // Title
  doc.setFontSize(13)
  doc.setFont('times', 'bold')
  const title = `SALARY & WAGES TRANSFER \u2013 ${monthLabel}`
  doc.text(title, 105, y, { align: 'center' })
  doc.setLineWidth(0.5)
  const titleW = doc.getTextWidth(title)
  doc.line(105 - titleW / 2, y + 1, 105 + titleW / 2, y + 1)
  y += 10

  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.text('Dear Sir,', 20, y)
  y += 8

  const bodyText = `Appreciate if you could arrange to Transfer Rs. ${totalStr} to the following individual accounts as salary payment, for the month of ${monthLabel} from Rupee Account No.${companyAcc}`
  const bodyLines = doc.splitTextToSize(bodyText, 170)
  doc.text(bodyLines, 20, y)
  y += bodyLines.length * 5.5 + 6

  // Company name
  doc.setFont('times', 'bold')
  doc.setFontSize(12)
  doc.text('Seven Wave Food Court (Pvt) Ltd', 105, y, { align: 'center' })
  y += 6
  doc.setFontSize(11)
  doc.text(`SALARY & WAGES TRANSFER \u2013 ${monthLabel}`, 105, y, { align: 'center' })
  y += 4

  // Table
  const tableData = group.employees.map((emp, i) => [
    i + 1,
    emp.employees?.full_name || '',
    emp.employees?.nic_number || '',
    emp.employees?.bank_account_number || emp.employees?.account_number || '',
    `LKR ${fmt(emp.net_salary)}`,
  ])
  // Add total row
  tableData.push(['', '', '', '', `LKR ${totalStr}`])

  autoTable(doc, {
    startY: y + 2,
    margin: { left: 20, right: 20 },
    head: [['Employee\nNo.', 'Name', 'NIC No.', 'Account No.', 'Amount']],
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
      1: { cellWidth: 45 },
      2: { cellWidth: 32 },
      3: { cellWidth: 42 },
      4: { halign: 'right', cellWidth: 36 },
    },
    didParseCell: (data) => {
      // Bold the total row
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        if (data.column.index < 4) data.cell.styles.fillColor = [249, 249, 249]
      }
    },
  })

  y = doc.lastAutoTable.finalY + 15

  // Check if we need a new page
  if (y > 260) {
    doc.addPage()
    y = 20
  }

  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  doc.text('Thank You', 20, y)
  y += 20
  doc.text('...................................', 20, y)
  y += 6
  doc.setFont('times', 'bold')
  doc.text('Director', 20, y)

  const period = selectedRun.value?.period_end?.substring(0, 7) || 'payroll'
  const filename = `Salary_Transfer_${group.bankName.replace(/\s+/g, '_')}_${period}.pdf`
  doc.save(filename)
  $q.notify({ type: 'positive', icon: 'picture_as_pdf', message: `Downloaded: ${filename}` })
}

function exportCashPDF() {
  const doc = new jsPDF('p', 'mm', 'a4')
  const monthLabel = bulkMonthLabel.value
  const dateStr = bulkLetterDate.value
  const cashTotal = cashGroupComputed.value.reduce((s, p) => s + Number(p.net_salary || 0), 0)
  let y = 20

  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  doc.text(dateStr, 20, y)
  y += 12

  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.text('Seven Wave Food Court (Pvt) Ltd', 105, y, { align: 'center' })
  y += 6
  doc.setFontSize(12)
  doc.text(`CASH SALARY PAYMENT \u2013 ${monthLabel}`, 105, y, { align: 'center' })
  y += 8

  const tableData = cashGroupComputed.value.map((emp, i) => [
    i + 1,
    emp.employees?.full_name || '',
    emp.employees?.nic_number || '',
    `LKR ${fmt(emp.net_salary)}`,
  ])
  tableData.push(['', '', 'TOTAL', `LKR ${fmt(cashTotal)}`])

  autoTable(doc, {
    startY: y,
    margin: { left: 20, right: 20 },
    head: [['No.', 'Employee Name', 'NIC No.', 'Amount']],
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
      1: { cellWidth: 60 },
      2: { cellWidth: 45 },
      3: { halign: 'right', cellWidth: 35 },
    },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  y = doc.lastAutoTable.finalY + 15
  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  doc.text('Thank You', 20, y)
  y += 20
  doc.text('...................................', 20, y)
  y += 6
  doc.setFont('times', 'bold')
  doc.text('Director', 20, y)

  const period = selectedRun.value?.period_end?.substring(0, 7) || 'payroll'
  const filename = `Cash_Salary_Payment_${period}.pdf`
  doc.save(filename)
  $q.notify({ type: 'positive', icon: 'picture_as_pdf', message: `Downloaded: ${filename}` })
}

// ── XLSX Export ──────────────────────────────────────────────────────────────
function exportBankXLSX(group) {
  const monthLabel = bulkMonthLabel.value
  const companyAcc = getCompanyBankAccount(group.bankName)

  // Build worksheet data
  const wsData = [
    [bulkLetterDate.value],
    ['THE MANAGER'],
    [group.bankName.toUpperCase()],
    [],
    [`SALARY & WAGES TRANSFER \u2013 ${monthLabel}`],
    [],
    ['Dear Sir,'],
    [
      `Appreciate if you could arrange to Transfer Rs. ${fmt(group.totalNet)} to the following individual accounts as salary payment, for the month of ${monthLabel} from Rupee Account No.${companyAcc}`,
    ],
    [],
    ['Seven Wave Food Court (Pvt) Ltd'],
    [`SALARY & WAGES TRANSFER \u2013 ${monthLabel}`],
    [],
    ['Employee No.', 'Name', 'NIC No.', 'Account No.', 'Amount'],
  ]

  group.employees.forEach((emp, i) => {
    wsData.push([
      i + 1,
      emp.employees?.full_name || '',
      emp.employees?.nic_number || '',
      emp.employees?.bank_account_number || emp.employees?.account_number || '',
      Number(emp.net_salary || 0),
    ])
  })

  wsData.push(['', '', '', 'TOTAL', group.totalNet])
  wsData.push([])
  wsData.push(['Thank You'])
  wsData.push([])
  wsData.push(['...................................'])
  wsData.push(['Director'])

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  // Set column widths
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 22 }, { wch: 18 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, group.bankName.substring(0, 31))

  const period = selectedRun.value?.period_end?.substring(0, 7) || 'payroll'
  const filename = `Salary_Transfer_${group.bankName.replace(/\s+/g, '_')}_${period}.xlsx`
  XLSX.writeFile(wb, filename)
  $q.notify({ type: 'positive', icon: 'table_chart', message: `Downloaded: ${filename}` })
}

function exportCashXLSX() {
  const monthLabel = bulkMonthLabel.value
  const cashTotal = cashGroupComputed.value.reduce((s, p) => s + Number(p.net_salary || 0), 0)

  const wsData = [
    [bulkLetterDate.value],
    [],
    ['Seven Wave Food Court (Pvt) Ltd'],
    [`CASH SALARY PAYMENT \u2013 ${monthLabel}`],
    [],
    ['No.', 'Employee Name', 'NIC No.', 'Amount'],
  ]

  cashGroupComputed.value.forEach((emp, i) => {
    wsData.push([
      i + 1,
      emp.employees?.full_name || '',
      emp.employees?.nic_number || '',
      Number(emp.net_salary || 0),
    ])
  })

  wsData.push(['', '', 'TOTAL', cashTotal])
  wsData.push([])
  wsData.push(['Thank You'])
  wsData.push([])
  wsData.push(['...................................'])
  wsData.push(['Director'])

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 18 }, { wch: 18 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cash Payments')

  const period = selectedRun.value?.period_end?.substring(0, 7) || 'payroll'
  const filename = `Cash_Salary_Payment_${period}.xlsx`
  XLSX.writeFile(wb, filename)
  $q.notify({ type: 'positive', icon: 'table_chart', message: `Downloaded: ${filename}` })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v) => Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })

const selectedPayslipIds = computed(() => selectedPayslipRows.value.map((r) => r.id))

const availableBanks = computed(() => {
  const banks = payslips.value.map((p) => p.employees?.bank_name).filter(Boolean)
  return [...new Set(banks)].sort()
})

// Helper: treat payslip as held if either field set (both kept in sync now)
const isHeld = (p) => p.is_held === true || p.payment_status === 'held'

const filteredPayslips = computed(() => {
  let rows = payslips.value
  // Employee search
  if (psEmpFilter.value) {
    const q = psEmpFilter.value.toLowerCase()
    rows = rows.filter(
      (p) =>
        p.employees?.full_name?.toLowerCase().includes(q) ||
        p.employees?.employee_code?.toLowerCase().includes(q),
    )
  }
  // Bank filter
  if (psBankFilter.value && psBankFilter.value !== 'All Banks') {
    rows = rows.filter((p) => p.employees?.bank_name === psBankFilter.value)
  }
  // Paid/Unpaid/Held filter
  if (psPaidFilter.value === 'paid') {
    rows = rows.filter((p) => !isHeld(p) && p.payment_status === 'paid')
  } else if (psPaidFilter.value === 'unpaid') {
    rows = rows.filter((p) => !isHeld(p) && p.payment_status !== 'paid')
  } else if (psPaidFilter.value === 'held') {
    rows = rows.filter((p) => isHeld(p))
  }
  return rows
})

const paidTotal = computed(() =>
  payslips.value
    .filter((p) => !isHeld(p) && p.payment_status === 'paid')
    .reduce((s, p) => s + Number(p.net_salary || 0), 0),
)
const pendingTotal = computed(() =>
  payslips.value
    .filter((p) => !isHeld(p) && p.payment_status !== 'paid')
    .reduce((s, p) => s + Number(p.net_salary || 0), 0),
)
const heldTotal = computed(() =>
  payslips.value.filter((p) => isHeld(p)).reduce((s, p) => s + Number(p.net_salary || 0), 0),
)

// ── Table column definitions ──────────────────────────────────────────────────
const runColumns = [
  {
    name: 'period',
    label: 'Period',
    align: 'left',
    field: (r) => `${r.period_start} — ${r.period_end}`,
  },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'employees', label: 'Employees', align: 'center', field: 'employee_count' },
  {
    name: 'gross',
    label: 'Gross (LKR)',
    align: 'right',
    field: 'total_gross',
    format: (v) => fmt(v),
  },
  { name: 'net', label: 'Net (LKR)', align: 'right', field: 'total_net', format: (v) => fmt(v) },
  { name: 'actions', label: '', align: 'center' },
]

const payslipColumns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  { name: 'bank', label: 'Bank / Account', align: 'left', field: (r) => r.employees?.bank_name },
  { name: 'basic', label: 'Basic', align: 'right', field: 'basic_salary', format: (v) => fmt(v) },
  {
    name: 'allowances',
    label: 'Allowances',
    align: 'right',
    field: 'total_allowances',
    format: (v) => fmt(v),
  },
  { name: 'gross', label: 'Gross', align: 'right', field: 'gross_salary', format: (v) => fmt(v) },
  {
    name: 'deductions',
    label: 'Deductions',
    align: 'right',
    field: 'total_deductions',
    format: (v) => fmt(v),
  },
  { name: 'net', label: 'Net Salary', align: 'right', field: 'net_salary', format: (v) => fmt(v) },
  { name: 'status', label: 'Status', align: 'center', field: 'payment_status' },
  { name: 'actions', label: 'Actions', align: 'center', field: 'id' },
]

// ── Status colors ─────────────────────────────────────────────────────────────
function runStatusColor(s) {
  return (
    {
      draft: 'grey',
      processing: 'amber',
      processed: 'blue',
      approved: 'teal',
      paid: 'green',
      cancelled: 'red',
    }[s] || 'grey'
  )
}
function psStatusColor(s) {
  return { paid: 'green', pending: 'amber-8', unpaid: 'orange-9' }[s] || 'amber-8'
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadRuns() {
  loading.value = true
  const branchId = authStore.currentBranch?.id
  let q = supabase
    .from('payroll_runs')
    .select('*')
    .eq('branch_id', branchId)
    .order('period_start', { ascending: false })
  if (statusFilter.value !== 'All') q = q.eq('status', statusFilter.value.toLowerCase())
  const { data } = await q
  runs.value = data || []
  loading.value = false
}

async function runPayroll() {
  if (!payrollMonth.value) {
    $q.notify({ type: 'warning', message: 'Select a month' })
    return
  }
  processing.value = true
  try {
    const { data, error } = await supabase.rpc('process_monthly_payroll', {
      p_branch_id: authStore.currentBranch?.id,
      p_period_month: payrollMonth.value + '-01',
    })
    if (error) throw error
    if (data?.success === false) throw new Error(data.error)
    $q.notify({ type: 'positive', message: `Payroll processed: ${data.employee_count} employees` })
    showRunDialog.value = false
    loadRuns()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    processing.value = false
  }
}

async function viewRun(run) {
  selectedRun.value = run
  selectedPayslipRows.value = []
  psEmpFilter.value = ''
  psBankFilter.value = 'All Banks'
  psPaidFilter.value = 'all'
  const { data } = await supabase
    .from('payslips')
    .select(
      '*, employees(full_name, employee_code, email, bank_name, bank_branch, bank_account_name, bank_account_number, account_number, bank_code)',
    )
    .eq('payroll_run_id', run.id)
    .order('net_salary', { ascending: false })
  payslips.value = data || []
  showPayslips.value = true
}

async function finalApprove(run) {
  $q.dialog({
    title: 'Final Approval',
    message: 'Approve and mark all payslips as PAID?',
    cancel: true,
    persistent: true,
    dark: $q.dark.isActive,
  }).onOk(async () => {
    try {
      const { data, error } = await supabase.rpc('approve_salary_final', {
        p_payroll_run_id: run.id,
      })
      if (error) throw error
      if (data?.success === false) throw new Error(data.error)
      $q.notify({ type: 'positive', message: 'Payroll approved and paid' })
      loadRuns()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

// ── Hold / Release ────────────────────────────────────────────────────────────
function openHoldDialog(payslip) {
  holdTarget.value = payslip
  holdReason.value = ''
  showHoldDialog.value = true
}

async function saveHold() {
  if (!holdReason.value.trim()) {
    $q.notify({ type: 'warning', message: 'Please enter a reason for hold' })
    return
  }
  holdSaving.value = true
  try {
    const { error } = await supabase
      .from('payslips')
      .update({
        is_held: true,
        hold_reason: holdReason.value.trim(),
        payment_status: 'held', // sync so SQL function excludes this payslip
        payment_notes: holdReason.value.trim(),
      })
      .eq('id', holdTarget.value.id)
    if (error) throw error
    $q.notify({
      type: 'warning',
      icon: 'pause_circle',
      message: `⏸️ Salary held for ${holdTarget.value.employees?.full_name}`,
    })
    showHoldDialog.value = false
    await refreshPayslips()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    holdSaving.value = false
  }
}

async function releaseHold(payslip) {
  $q.dialog({
    title: 'Release Hold',
    message: `Release salary hold for <strong>${payslip.employees?.full_name}</strong>?<br><small class="text-grey">This will move the payslip back to Pending — it will be included in the next Finance posting.</small>`,
    html: true,
    cancel: true,
    dark: $q.dark.isActive,
  }).onOk(async () => {
    const { error } = await supabase
      .from('payslips')
      .update({
        is_held: false,
        hold_reason: null,
        payment_status: 'pending', // restore to pending
        payment_notes: null,
      })
      .eq('id', payslip.id)
    if (error) {
      $q.notify({ type: 'negative', message: error.message })
    } else {
      $q.notify({
        type: 'positive',
        icon: 'play_circle',
        message: `▶️ Hold released for ${payslip.employees?.full_name} — salary is now Pending`,
      })
      await refreshPayslips()
    }
  })
}

// ── Open Post to Finance from Run Table row directly ─────────────────────────
async function openPostFinanceForRun(run) {
  // Load the payslips for this run first (needed by the dialog)
  selectedRun.value = run
  payslips.value = []
  const { data } = await supabase
    .from('payslips')
    .select(
      '*, employees(full_name, employee_code, email, bank_name, bank_branch, bank_account_name, bank_account_number, account_number, bank_code)',
    )
    .eq('payroll_run_id', run.id)
    .order('net_salary', { ascending: false })
  payslips.value = data || []
  await loadAccounts()
  postFinanceForm.cash_bank_acc = null
  showPostFinanceDialog.value = true
}

// ── Mark Paid (individual) ────────────────────────────────────────────────────
function openMarkPaidDialog(payslip) {
  markPaidTarget.value = payslip
  paidMethod.value = 'Bank Transfer'
  paidReference.value = ''
  paidDate.value = new Date().toISOString().slice(0, 10)
  showMarkPaidDialog.value = true
}

async function confirmMarkPaid() {
  markPaidSaving.value = true
  try {
    const { error } = await supabase
      .from('payslips')
      .update({
        payment_status: 'paid',
        payment_method: paidMethod.value,
        payment_reference: paidReference.value || null,
        payment_date: paidDate.value,
        paid_at: new Date().toISOString(),
        paid_by: authStore.user?.id,
      })
      .eq('id', markPaidTarget.value.id)
    if (error) throw error
    $q.notify({
      type: 'positive',
      message: `${markPaidTarget.value.employees?.full_name} marked as Paid`,
    })
    showMarkPaidDialog.value = false
    await refreshPayslips()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    markPaidSaving.value = false
  }
}

// ── Send to Finance / Post to Finance dialog opener ──────────────────────────
async function sendToFinance() {
  await loadAccounts()
  // Reset the form's cash/bank account when dialog opens
  postFinanceForm.cash_bank_acc = null
  showPostFinanceDialog.value = true
}

// Clear account selection when payment method switches (bank vs cash have different lists)
watch(
  () => postFinanceForm.payment_method,
  () => {
    postFinanceForm.cash_bank_acc = null
  },
)

async function loadAccounts() {
  if (financeAccounts.value.length) return
  loadingAccounts.value = true
  try {
    const { data: realAccounts, error: rErr } = await supabase
      .from('finance_accounts')
      .select('id, registered_name, account_type, account_number, current_balance, ledger_id')
      .order('registered_name')
    if (!rErr && realAccounts && realAccounts.length > 0) {
      financeAccounts.value = realAccounts
      return
    }

    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, code, name, account_type, is_active')
      .eq('is_active', true)
      .order('code')
    financeAccounts.value = data || []
  } finally {
    loadingAccounts.value = false
  }
}

async function confirmPostToFinance() {
  const f = postFinanceForm
  if (!f.cash_bank_acc) {
    $q.notify({ type: 'warning', message: 'Please select a Cash/Bank account to transfer from.' })
    return
  }

  if (!selectedRun.value) return
  postingFinance.value = true
  try {
    // 1. Prefer modern post_payroll_to_finance_v2 (linked to finance_ledgers & finance_cashbook_entries)
    const { data: res, error: rpcErr } = await supabase.rpc('post_payroll_to_finance_v2', {
      p_payroll_run_id: selectedRun.value.id,
      p_cash_bank_account_id: f.cash_bank_acc,
      p_payment_method: f.payment_method,
      p_posted_by: authStore.user?.id,
    })

    if (!rpcErr && res && res.success !== false) {
      $q.notify({
        type: 'positive',
        icon: 'account_balance',
        message: `✅ Payroll posted to Finance! Ledgers & Cashbook updated, payslips marked PAID.`,
        timeout: 4000,
      })
      showPostFinanceDialog.value = false
      showPayslips.value = false
      await loadRuns()
      return
    }

    // 2. Fallback to legacy post_payroll_to_finance if v2 RPC is not yet migrated in Supabase
    const expAcc = financeAccounts.value.find((a) => a.code === '5100')?.id
    const payAcc = financeAccounts.value.find((a) => a.code === '2200')?.id
    const epfExp = financeAccounts.value.find((a) => a.code === '5130')?.id
    const etfExp = financeAccounts.value.find((a) => a.code === '5140')?.id
    const epfPay = financeAccounts.value.find((a) => a.code === '2210')?.id
    const etfPay = financeAccounts.value.find((a) => a.code === '2220')?.id

    if (!expAcc || !payAcc) {
      if (rpcErr) throw rpcErr
      $q.notify({
        type: 'warning',
        message: 'Standard Payroll accounts not found. Please run Migration #129 in Supabase.',
      })
      return
    }

    const { error } = await supabase.rpc('post_payroll_to_finance', {
      p_payroll_run_id: selectedRun.value.id,
      p_salary_expense_acc: expAcc,
      p_epf_expense_acc: epfExp || expAcc,
      p_etf_expense_acc: etfExp || expAcc,
      p_salary_payable_acc: payAcc,
      p_epf_payable_acc: epfPay || payAcc,
      p_etf_payable_acc: etfPay || payAcc,
      p_cash_bank_acc: f.cash_bank_acc,
      p_payment_method: f.payment_method,
      p_posted_by: authStore.user?.id,
    })
    if (error) throw (rpcErr || error)
    $q.notify({
      type: 'positive',
      icon: 'account_balance',
      message: `✅ Payroll posted to Finance! All pending payslips marked as PAID.`,
      timeout: 4000,
    })
    showPostFinanceDialog.value = false
    showPayslips.value = false
    await loadRuns()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    postingFinance.value = false
  }
}

async function refreshPayslips() {
  if (!selectedRun.value) return
  const { data } = await supabase
    .from('payslips')
    .select(
      '*, employees(full_name, employee_code, email, bank_name, bank_branch, bank_account_name, bank_account_number, account_number, bank_code)',
    )
    .eq('payroll_run_id', selectedRun.value.id)
    .order('net_salary', { ascending: false })
  payslips.value = data || []
}

// ── Build PDF Data Helper ───────────────────────────────────────────────────
function populatePdfData(payslip, bd) {
  const findAmt = (arr, lbl) =>
    (arr || []).find((e) => e.label && e.label.toLowerCase().includes(lbl.toLowerCase()))?.amount || 0
  const monthName = new Date(selectedRun.value?.period_start || new Date())
    .toLocaleString('en-US', { month: 'long' })
    .toUpperCase()

  const basicAmt = Number(findAmt(bd?.earnings, 'basic') || payslip.basic_salary || 0)
  const attendanceAmt = Number(findAmt(bd?.earnings, 'attendance') || 0)

  // Sum allowances: housing + transport + meal + other + commission + shift
  const housingAmt = Number(findAmt(bd?.earnings, 'housing') || payslip.housing_allowance || 0)
  const transportAmt = Number(findAmt(bd?.earnings, 'transport') || payslip.transport_allowance || 0)
  const mealAmt = Number(findAmt(bd?.earnings, 'meal') || payslip.meal_allowance || 0)
  const otherAllowAmt = Number(findAmt(bd?.earnings, 'other allow') || payslip.other_allowances || 0)
  const commissionAmt = Number(findAmt(bd?.earnings, 'commission') || payslip.commission_amount || 0)
  const shiftAllowAmt = Number(findAmt(bd?.earnings, 'shift') || payslip.shift_allowance_amount || 0)
  const totalVariable =
    (housingAmt + transportAmt + mealAmt + otherAllowAmt + commissionAmt + shiftAllowAmt) ||
    Number(payslip.total_allowances || 0)

  const extraDayHrs =
    payslip.holiday_ot_hours > 0 ? Number(payslip.holiday_ot_hours).toFixed(2) : '0.00'
  const extraDayAmt = Number(findAmt(bd?.earnings, 'holiday') || payslip.holiday_ot_amount || 0)

  const normalOtHrs =
    payslip.normal_ot_hours > 0 ? Number(payslip.normal_ot_hours).toFixed(2) : '0.00'
  const normalOtAmt = Number(findAmt(bd?.earnings, 'normal ot') || payslip.normal_ot_amount || 0)

  const noPayD = bd?.days_absent != null ? Number(bd.days_absent) : Number(payslip.days_absent || 0)
  const dailyRate = basicAmt > 0 ? basicAmt / 26.0 : Number(payslip.basic_salary || 0) / 26.0
  const noPayAmt = Number(
    findAmt(bd?.deductions, 'absent') ||
    payslip.absent_deduction ||
    (noPayD * dailyRate) ||
    0
  )

  const grossVal = bd?.gross_salary ?? bd?.gross ?? payslip.gross_salary ?? 0
  const totDedVal = bd?.total_deductions ?? payslip.total_deductions ?? 0
  const netVal = bd?.net_salary ?? bd?.net ?? payslip.net_salary ?? 0

  pdfData.value = {
    year:
      String(selectedRun.value?.period_start || '').substring(0, 4) ||
      String(new Date().getFullYear()),
    month: monthName,
    code: bd?.code || payslip.employees?.employee_code || '-',
    empName: bd?.employee || payslip.employees?.full_name || '-',
    designation: payslip.employees?.designation?.name || bd?.designation || 'Staff',
    basic: fmt(basicAmt),
    fingerprintId: payslip.employees?.fingerprint_id || bd?.code?.replace('EMP', '') || '-',
    grossPay: fmt(basicAmt),
    attendanceAllowance: fmt(attendanceAmt),
    variableAllowance: fmt(totalVariable),
    serviceCharge: fmt(findAmt(bd?.earnings, 'service')),

    extraDayHours: extraDayHrs,
    extraDayAmount: fmt(extraDayAmt),
    normalOtHours: normalOtHrs,
    normalOtAmount: fmt(normalOtAmt),

    noPayDays: noPayD.toFixed(2),
    noPayAmount: fmt(noPayAmt),

    grossSalary: fmt(grossVal),

    epfDeduction: fmt(findAmt(bd?.deductions, 'epf') || payslip.epf_employee || 0),
    staffBill: fmt(findAmt(bd?.deductions, 'staff bill') || 0),
    staffLoan: fmt(findAmt(bd?.deductions, 'loan') || payslip.loan_deduction || 0),
    salaryAdvance: fmt(findAmt(bd?.deductions, 'advance') || payslip.advance_deduction || 0),
    totalDeduction: fmt(totDedVal),
    netSalary: fmt(netVal),
  }
}

// ── Breakdown ─────────────────────────────────────────────────────────────────
async function viewBreakdown(payslip) {
  selectedPayslip.value = payslip
  breakdown.value = null
  showBreakdown.value = true
  loadingBreakdown.value = true
  try {
    const { data, error } = await supabase.rpc('get_payslip_breakdown', {
      p_payslip_id: payslip.id,
    })
    if (error) throw error
    breakdown.value = data
    populatePdfData(payslip, data)
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load breakdown: ' + err.message })
  } finally {
    loadingBreakdown.value = false
  }
}

// ── PDF / Email ───────────────────────────────────────────────────────────────
async function generatePayslipPdfDoc(payslip) {
  let bd = null
  try {
    const { data, error } = await supabase.rpc('get_payslip_breakdown', {
      p_payslip_id: payslip.id,
    })
    if (error) throw error
    bd = data
  } catch (err) {
    console.error('Error fetching breakdown:', err)
  }

  populatePdfData(payslip, bd)
  await nextTick()
  await new Promise((r) => setTimeout(r, 200))

  const el = document.getElementById('payslip-print-view')
  if (!el) throw new Error('Payslip template element not found')

  const canvas = await html2canvas(el, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
  })

  const imgData = canvas.toDataURL('image/jpeg', 1.0)
  const pdfWidth = 105
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pdfWidth, pdfHeight],
  })

  pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight)
  const filename = `Payslip_${pdfData.value?.code || 'EMP'}_${pdfData.value?.month || 'PAYROLL'}.pdf`
  const dataUri = pdf.output('datauristring')
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri

  return { pdf, filename, base64 }
}

async function downloadPayslipPDF(payslip) {
  $q.loading.show({ message: 'Generating Payslip PDF...' })
  try {
    const { pdf, filename } = await generatePayslipPdfDoc(payslip)
    pdf.save(filename)
    $q.notify({ type: 'positive', message: `Payslip downloaded: ${filename}` })
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: 'Error generating PDF: ' + err.message })
  } finally {
    $q.loading.hide()
  }
}

async function sendPayslipEmail(payslip) {
  const empName = payslip.employees?.full_name || 'Employee'
  const empEmail = payslip.employees?.email
  if (!empEmail) {
    $q.notify({ type: 'warning', message: `No email address on file for ${empName}` })
    return
  }
  sendingEmail.value = payslip.id
  $q.loading.show({ message: `Generating PDF and emailing to ${empName}...` })
  try {
    // Generate official payslip PDF base64
    const { base64, filename } = await generatePayslipPdfDoc(payslip)

    const { error } = await supabase.functions.invoke('send-payslip', {
      body: {
        payslip_id: payslip.id,
        period_start: selectedRun.value?.period_start,
        period_end: selectedRun.value?.period_end,
        pdf_base64: base64,
        filename: filename,
      },
    })
    if (error) throw error
    $q.notify({ type: 'positive', icon: 'mark_email_read', message: `Payslip PDF successfully emailed to ${empEmail}` })
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Email failed: ' + (err.message || 'Unknown error') })
  } finally {
    sendingEmail.value = null
    $q.loading.hide()
  }
}

watch(statusFilter, () => loadRuns())
onMounted(() => loadRuns())
</script>

<style scoped>
/* Hidden Payslip Layout Styles */
.pspdf-lbl {
  border-bottom: 2px dotted #888;
  border-right: 1px solid black;
  padding: 10px 10px;
  width: 55%;
  vertical-align: middle;
}
.pspdf-val {
  border-bottom: 2px dotted #888;
  padding: 10px 10px;
  text-align: right;
  width: 45%;
  vertical-align: middle;
}
</style>
