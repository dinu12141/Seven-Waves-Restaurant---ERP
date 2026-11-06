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
      <q-btn
        unelevated
        color="teal-8"
        text-color="white"
        icon="auto_graph"
        label="Cumulative EPF Summary"
        @click="openCumulativeEpfSummary"
        no-caps
        dense
        padding="xs md"
        class="text-weight-medium"
      >
        <q-tooltip>Lifetime accumulated EPF (8% + 12%) & ETF (3%) contributions by employee</q-tooltip>
      </q-btn>
      <!-- WhatsApp Gateway Status & QR Scan Button -->
      <q-btn
        unelevated
        :color="bridgeStatus.connected ? 'green-8' : 'blue-grey-8'"
        text-color="white"
        icon="chat"
        :label="bridgeStatus.connected ? 'WhatsApp: Linked' : 'Connect WhatsApp'"
        @click="openWhatsAppGatewayDialog"
        no-caps
        dense
        padding="xs md"
        class="text-weight-medium"
      >
        <q-badge
          floating
          rounded
          :color="bridgeStatus.connected ? 'green' : (bridgeStatus.qr ? 'amber' : 'grey-5')"
        />
        <q-tooltip>Scan QR Code or Check WhatsApp PDF Dispatch Gateway</q-tooltip>
      </q-btn>
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
            flat
            dense
            icon="description"
            color="teal-8"
            size="sm"
            @click="openEpfEtfReportForRun(props.row)"
            label="EPF/ETF Report"
            no-caps
          >
            <q-tooltip>EPF (8% + 12%) & ETF (3%) Statutory Remittance Report</q-tooltip>
          </q-btn>
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
            v-if="props.row.status === 'approved' || props.row.status === 'paid'"
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

    <!-- ══ WhatsApp Gateway QR Scan Dialog ══ -->
    <q-dialog v-model="showWhatsAppDialog">
      <q-card :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-white']" style="min-width: 440px; max-width: 520px; border-radius: 12px">
        <q-card-section class="row items-center q-pb-none">
          <q-avatar icon="chat" color="green-8" text-color="white" size="36px" />
          <div class="q-ml-sm">
            <div class="text-subtitle1 text-weight-bold">WhatsApp PDF Dispatch Gateway</div>
            <div class="text-caption text-grey">Seven Waves Automated Payslip Delivery</div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator class="q-my-sm" />

        <q-card-section class="text-center q-pt-xs">
          <!-- Case 1: WhatsApp Connected -->
          <div v-if="bridgeStatus.connected" class="q-pa-md">
            <q-icon name="check_circle" color="positive" size="56px" />
            <div class="text-h6 text-weight-bold text-positive q-mt-sm">WhatsApp Connected!</div>
            <div class="text-caption text-grey-8 q-mb-md">
              Linked Account: <strong>+{{ bridgeStatus.user?.number || 'Active' }}</strong> ({{ bridgeStatus.user?.name || 'Seven Waves' }})
            </div>
            <div class="text-caption bg-positive-1 text-positive q-pa-sm rounded-borders q-mb-md">
              The gateway is online. Clicking <strong>Send via WhatsApp</strong> on any employee's payslip will deliver the actual PDF file directly to their phone.
            </div>

            <!-- Test Send Box -->
            <div class="bg-grey-2 q-pa-md rounded-borders text-left">
              <div class="text-caption text-weight-bold q-mb-xs">Send Test Payslip PDF</div>
              <div class="row q-gutter-sm items-center">
                <q-input
                  dense
                  outlined
                  v-model="testPhone"
                  placeholder="0717266563"
                  class="col"
                />
                <q-btn
                  unelevated
                  color="primary"
                  label="Send Test"
                  icon="send"
                  no-caps
                  :loading="sendingTestPdf"
                  @click="sendTestPdfDirect"
                />
              </div>
            </div>
          </div>

          <!-- Case 2: Gateway Running but Needs QR Scan -->
          <div v-else-if="bridgeStatus.qr" class="q-pa-md">
            <div class="text-subtitle2 text-weight-bold text-amber-9 q-mb-xs">Scan with WhatsApp to Connect</div>
            <div class="text-caption text-grey-7 q-mb-sm">
              1. Open <strong>WhatsApp</strong> on your phone<br>
              2. Go to <strong>Linked Devices &gt; Link a Device</strong><br>
              3. Scan the QR code below:
            </div>
            <div class="q-pa-sm bg-white rounded-borders" style="border: 2px dashed #059669; display: inline-block">
              <img :src="bridgeStatus.qr" style="width: 240px; height: 240px; display: block" alt="WhatsApp QR Code" />
            </div>
            <div class="text-caption text-grey-6 q-mt-sm">
              <q-spinner-dots size="xs" color="primary" class="q-mr-xs" />
              Waiting for phone scan... Dialog updates automatically.
            </div>
          </div>

          <!-- Case 3: Gateway Service is Not Running -->
          <div v-else class="q-pa-lg text-center">
            <q-icon name="link_off" color="warning" size="48px" />
            <div class="text-subtitle1 text-weight-bold text-warning q-mt-sm">WhatsApp Bridge Not Detected</div>
            <div class="text-caption text-grey-7 q-my-sm">
              The local WhatsApp background service is not running on port 3005.
            </div>
            <div class="bg-amber-1 text-amber-9 q-pa-sm rounded-borders text-caption q-mb-md text-left">
              Double-click <strong>Start WhatsApp Bridge.bat</strong> on your Desktop to start the gateway, or click retry below.
            </div>
            <div class="row q-gutter-sm justify-center q-mt-md">
              <q-btn
                unelevated
                color="amber-9"
                icon="refresh"
                label="Check Connection Again"
                no-caps
                :loading="bridgeStatus.loading"
                @click="checkBridgeStatus"
              />
              <q-btn
                outline
                color="primary"
                icon="open_in_new"
                label="Open Web Scanner (Port 3005)"
                no-caps
                @click="openExternalScanner"
              />
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

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
          <!-- ✅ EPF & ETF STATUTORY REPORT -->
          <q-btn
            unelevated
            no-caps
            color="teal-8"
            icon="description"
            label="EPF & ETF Report"
            class="q-mr-sm"
            @click="openEpfEtfReport"
          >
            <q-tooltip>View & Export Statutory EPF (8% + 12%) and ETF (3%) Remittance Report</q-tooltip>
          </q-btn>
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
            v-if="selectedRun?.status === 'approved' || selectedRun?.status === 'paid'"
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
                      v-if="selectedRun?.status === 'approved' || selectedRun?.status === 'paid'"
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
                  <!-- WhatsApp -->
                  <q-btn
                    flat
                    dense
                    round
                    icon="chat"
                    color="green-7"
                    size="xs"
                    :loading="sendingWhatsAppId === props.row.id"
                    :disable="!!sendingWhatsAppId"
                    @click="sendPayslipWhatsApp(props.row)"
                  >
                    <q-tooltip>Send Payslip to Employee WhatsApp</q-tooltip>
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

    <!-- ══ EPF & ETF Statutory Remittance Dialog (maximized) ══ -->
    <q-dialog v-model="showEpfEtfDialog" maximized>
      <q-card :class="[$q.dark.isActive ? 'bg-grey-10 text-white' : 'bg-grey-1 text-dark']">
        <!-- Header Bar -->
        <q-bar
          :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white']"
          style="border-bottom: 3px solid #00897b; height: 56px; padding: 0 16px"
        >
          <q-icon name="description" color="teal" size="22px" />
          <div
            class="q-ml-sm text-weight-bold"
            :class="$q.dark.isActive ? 'text-white' : 'text-dark'"
            style="font-size: 15px"
          >
            EPF &amp; ETF Statutory Remittance Report (Form C Return) &bull; {{ selectedRun?.period_start }} to {{ selectedRun?.period_end }}
          </div>
          <q-badge color="teal" class="q-ml-sm text-caption">STATUTORY COMPLIANCE</q-badge>
          <q-space />
          <q-btn
            unelevated
            dense
            no-caps
            color="positive"
            icon="download"
            label="Download Excel"
            class="q-mr-sm q-px-sm"
            @click="exportEpfEtfExcel"
          >
            <q-tooltip>Download Official Form C Excel Spreadsheet</q-tooltip>
          </q-btn>
          <q-btn
            unelevated
            dense
            no-caps
            color="red-7"
            icon="picture_as_pdf"
            label="Download PDF"
            class="q-mr-sm q-px-sm"
            @click="exportEpfEtfPdf"
          >
            <q-tooltip>Export Printable Statutory Return PDF</q-tooltip>
          </q-btn>
          <q-btn dense flat icon="close" @click="showEpfEtfDialog = false" />
        </q-bar>

        <q-scroll-area style="height: calc(100vh - 56px)">
          <div class="q-pa-md">
            <!-- 6 Statutory KPI Cards -->
            <div class="row q-col-gutter-md q-mb-md items-stretch">
              <div class="col-12 col-sm-6 col-md-2">
                <q-card flat class="hr-kpi-card hr-kpi-card--green">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon"><q-icon name="payments" size="18px" color="white" /></div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">EPF Earnings (Basic)</div>
                      <div class="hr-kpi-value" style="font-size: 14px">LKR {{ fmt(epfTotals.basic) }}</div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>

              <div class="col-12 col-sm-6 col-md-2">
                <q-card flat class="hr-kpi-card hr-kpi-card--amber">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon"><q-icon name="person" size="18px" color="white" /></div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Employee EPF 8%</div>
                      <div class="hr-kpi-value" style="font-size: 14px">LKR {{ fmt(epfTotals.epf8) }}</div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>

              <div class="col-12 col-sm-6 col-md-2">
                <q-card flat class="hr-kpi-card hr-kpi-card--blue">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon"><q-icon name="apartment" size="18px" color="white" /></div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Employer EPF 12%</div>
                      <div class="hr-kpi-value" style="font-size: 14px">LKR {{ fmt(epfTotals.epf12) }}</div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>

              <div class="col-12 col-sm-6 col-md-2">
                <q-card flat class="hr-kpi-card hr-kpi-card--purple">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon"><q-icon name="account_balance" size="18px" color="white" /></div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Total EPF (20%)</div>
                      <div class="hr-kpi-value" style="font-size: 14px">LKR {{ fmt(epfTotals.epf20) }}</div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>

              <div class="col-12 col-sm-6 col-md-2">
                <q-card flat class="hr-kpi-card hr-kpi-card--cyan">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon"><q-icon name="savings" size="18px" color="white" /></div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Employer ETF (3%)</div>
                      <div class="hr-kpi-value" style="font-size: 14px">LKR {{ fmt(epfTotals.etf3) }}</div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>

              <div class="col-12 col-sm-6 col-md-2">
                <q-card flat class="hr-kpi-card hr-kpi-card--red">
                  <q-card-section class="hr-kpi-inner">
                    <div class="hr-kpi-icon"><q-icon name="price_check" size="18px" color="white" /></div>
                    <div style="flex: 1">
                      <div class="hr-kpi-label">Grand Total (23%)</div>
                      <div class="hr-kpi-value" style="font-size: 14px">LKR {{ fmt(epfTotals.grandTotal) }}</div>
                    </div>
                  </q-card-section>
                </q-card>
              </div>
            </div>

            <!-- Filter & Search Toolbar -->
            <q-card flat bordered class="q-mb-md" :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white']">
              <q-card-section class="q-pa-sm row items-center justify-between">
                <div class="row items-center q-gutter-sm">
                  <q-icon name="info" color="teal" size="sm" />
                  <div class="text-caption text-grey-7">
                    Sri Lanka Employees' Provident Fund (EPF) Act No. 15 of 1958 &amp; Employees' Trust Fund (ETF) Act No. 46 of 1980 Remittance Schedule.
                  </div>
                </div>
                <div style="min-width: 300px">
                  <q-input
                    :dark="$q.dark.isActive"
                    dense
                    outlined
                    v-model="epfSearch"
                    placeholder="Search by Employee, EPF No, NIC…"
                    clearable
                  >
                    <template #prepend><q-icon name="search" size="xs" /></template>
                  </q-input>
                </div>
              </q-card-section>
            </q-card>

            <!-- Statutory Breakdown Table -->
            <q-table
              :dark="$q.dark.isActive"
              flat
              bordered
              dense
              :rows="filteredEpfPayslips"
              :columns="epfColumns"
              row-key="id"
              :pagination="{ rowsPerPage: 30 }"
              :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'text-body2']"
              table-header-class="text-weight-bold text-uppercase"
            >
              <template #bottom-row>
                <q-tr class="text-weight-bold bg-teal-1 text-dark" style="font-size: 13px">
                  <q-td colspan="4" class="text-right">TOTAL ({{ filteredEpfPayslips.length }} Employees):</q-td>
                  <q-td class="text-right">LKR {{ fmt(epfTotals.basic) }}</q-td>
                  <q-td class="text-right text-teal-9">LKR {{ fmt(epfTotals.epf8) }}</q-td>
                  <q-td class="text-right text-indigo-9">LKR {{ fmt(epfTotals.epf12) }}</q-td>
                  <q-td class="text-right text-purple-9">LKR {{ fmt(epfTotals.epf20) }}</q-td>
                  <q-td class="text-right text-cyan-9">LKR {{ fmt(epfTotals.etf3) }}</q-td>
                  <q-td class="text-right text-deep-orange-9">LKR {{ fmt(epfTotals.grandTotal) }}</q-td>
                </q-tr>
              </template>
            </q-table>
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
          <q-btn
            unelevated
            icon="chat"
            label="Send via WhatsApp"
            color="green-8"
            :loading="!!sendingWhatsAppId"
            :disable="!!sendingWhatsAppId"
            @click="sendPayslipWhatsApp(selectedPayslip)"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ POST TO FINANCE Dialog (Supports Option A & Option B) ══ -->
    <q-dialog v-model="showPostFinanceDialog" persistent>
      <q-card
        :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-white']"
        style="min-width: 680px; max-width: 95vw"
      >
        <!-- Header -->
        <q-card-section
          class="row items-center q-pa-md"
          :style="{ background: 'linear-gradient(135deg, #0f4c75 0%, #1976d2 100%)' }"
        >
          <q-icon name="account_balance" color="white" size="22px" class="q-mr-sm" />
          <div>
            <div class="text-subtitle1 text-weight-bold text-white">Post Payroll to Finance</div>
            <div class="text-caption text-blue-1">
              {{ selectedRun?.period_start }} — {{ selectedRun?.period_end }}
            </div>
          </div>
          <q-space />
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>

        <!-- Payroll Summary Banner -->
        <div :class="['row q-pa-md q-col-gutter-md', $q.dark.isActive ? 'bg-grey-9' : 'bg-blue-1']">
          <div class="col">
            <div class="text-caption text-grey-6">Total Staff</div>
            <div class="text-weight-bold text-caption">
              {{ payslips.length }} employees
            </div>
          </div>
          <div class="col">
            <div class="text-caption text-grey-6">Pending Posting</div>
            <div class="text-weight-bold text-caption text-primary">
              {{ unpostedPayslips.length }} employees
            </div>
          </div>
          <div class="col">
            <div class="text-caption text-grey-6">Already Paid/Posted</div>
            <div class="text-weight-bold text-caption text-positive">
              {{ postedPayslips.length }} employees
            </div>
          </div>
          <div class="col">
            <div class="text-caption text-grey-6">Total Unposted Net</div>
            <div class="text-weight-bold" :class="unpostedTotalNet > 0 ? 'text-green' : 'text-grey'">
              LKR {{ fmt(unpostedTotalNet) }}
            </div>
          </div>
          <div class="col" v-if="heldTotal > 0">
            <div class="text-caption text-grey-6">On Hold</div>
            <div class="text-weight-bold text-orange">LKR {{ fmt(heldTotal) }}</div>
          </div>
        </div>

        <!-- Case 1: If ALL payslips are already posted/paid -->
        <div v-if="unpostedPayslips.length === 0" class="q-pa-lg">
          <div class="q-pa-md bg-positive-1 text-positive rounded-borders row items-center q-gutter-md q-mb-md">
            <q-icon name="verified" size="36px" color="positive" />
            <div class="col">
              <div class="text-subtitle2 text-weight-bold">Payroll Run Fully Posted to Finance!</div>
              <div class="text-caption text-grey-8">
                All {{ payslips.length }} payslips for this period have already been posted to Finance & marked as PAID.
                Salaries have been credited from company accounts and recorded in the General Ledger.
              </div>
            </div>
          </div>

          <!-- Summary Breakdown of Paid Slips -->
          <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">Disbursed Payslip Breakdown:</div>
          <q-list bordered separator dense class="rounded-borders">
            <q-item v-for="(count, bank) in paidBankSummary" :key="bank">
              <q-item-section avatar>
                <q-icon :name="bank.toLowerCase().includes('cash') ? 'payments' : 'account_balance'" color="positive" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-medium">{{ bank }}</q-item-label>
                <q-item-label caption>{{ count.count }} employee(s) paid</q-item-label>
              </q-item-section>
              <q-item-section side>
                <span class="text-weight-bold text-dark">LKR {{ fmt(count.total) }}</span>
              </q-item-section>
            </q-item>
          </q-list>

          <div class="row justify-end q-mt-md">
            <q-btn flat label="Close" color="primary" v-close-popup no-caps />
          </div>
        </div>

        <!-- Case 2: When there are unposted payslips to post -->
        <div v-else class="q-pa-md">
          <!-- Posting Mode Toggle (Option A vs Option B) -->
          <div class="q-mb-md">
            <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">Select Disbursing Method:</div>
            <q-btn-toggle
              v-model="postFinanceMode"
              spread
              no-caps
              rounded
              unelevated
              toggle-color="primary"
              color="grey-3"
              text-color="grey-8"
              :options="[
                { label: 'Option A: Single Company Account (SLIPS / Bulk)', value: 'bulk', icon: 'account_balance' },
                { label: 'Option B: Split by Bank & Cash (Multiple Accounts)', value: 'split', icon: 'call_split' }
              ]"
            />
          </div>

          <!-- ═════ OPTION A: Single Account (Bulk / SLIPS) ═════ -->
          <div v-if="postFinanceMode === 'bulk'" class="q-gutter-md">
            <div class="text-caption text-grey-7 bg-grey-2 q-pa-sm rounded-borders">
              <q-icon name="info" color="primary" class="q-mr-xs" />
              <strong>Option A:</strong> All {{ unpostedPayslips.length }} unposted employees will be paid together from a single company account (e.g. Commercial Bank SLIPS transfer to all employee bank accounts).
            </div>

            <!-- STEP 1: Payment Method -->
            <div>
              <div class="text-caption text-weight-bold q-mb-xs">1. Payment Method</div>
              <div class="row q-gutter-sm">
                <q-btn
                  v-for="m in paymentMethods"
                  :key="m.value"
                  unelevated
                  no-caps
                  :label="m.label"
                  :icon="m.icon"
                  :color="postFinanceForm.payment_method === m.value ? 'blue-8' : $q.dark.isActive ? 'grey-8' : 'grey-2'"
                  :text-color="postFinanceForm.payment_method === m.value ? 'white' : 'grey-7'"
                  @click="postFinanceForm.payment_method = m.value"
                  style="flex: 1; min-width: 120px"
                />
              </div>
            </div>

            <!-- STEP 2: Company Paying Account -->
            <div>
              <div class="text-caption text-weight-bold q-mb-xs">
                2. {{ postFinanceForm.payment_method === 'cash' ? 'Cash Account (money goes out from)' : 'Company Bank Account (transfer from)' }}
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
                placeholder="Select company cash/bank account"
              >
                <template #prepend>
                  <q-icon :name="postFinanceForm.payment_method === 'cash' ? 'payments' : 'account_balance_wallet'" size="xs" />
                </template>
              </q-select>
              <div class="text-caption text-grey-6 q-mt-xs q-pl-xs">
                🏦 This company account will be <strong>CREDITED</strong> (deducted by LKR {{ fmt(unpostedTotalNet) }}).
              </div>
            </div>

            <q-card-actions align="right" class="q-pt-md">
              <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
              <q-btn
                unelevated
                color="blue-8"
                icon="account_balance"
                no-caps
                :label="`Post All (${unpostedPayslips.length} Employees — LKR ${fmt(unpostedTotalNet)})`"
                @click="confirmPostToFinance"
                :loading="postingFinance"
                :disable="!postFinanceForm.cash_bank_acc"
              />
            </q-card-actions>
          </div>

          <!-- ═════ OPTION B: Split by Bank & Cash ═════ -->
          <div v-else-if="postFinanceMode === 'split'" class="q-gutter-md">
            <div class="text-caption text-grey-7 bg-grey-2 q-pa-sm rounded-borders">
              <q-icon name="info" color="primary" class="q-mr-xs" />
              <strong>Option B:</strong> Employees are automatically grouped by their receiving bank or cash. Select the corresponding Company Account for each group and post them separately!
            </div>

            <!-- Subtabs: Bank Groups vs Custom Selection -->
            <q-tabs
              v-model="splitSubTab"
              dense
              no-caps
              active-color="primary"
              indicator-color="primary"
              align="left"
              class="text-grey-7"
            >
              <q-tab name="bank_groups" label="Grouped by Bank & Cash" icon="account_balance" />
              <q-tab name="custom_select" label="Custom Employee Selection" icon="checklist" />
            </q-tabs>
            <q-separator />

            <!-- Tab 1: Bank & Cash Groups -->
            <div v-if="splitSubTab === 'bank_groups'" class="q-gutter-sm">
              <div v-if="splitBankGroups.length === 0" class="text-center text-grey-6 q-py-md">
                No unposted bank groups found.
              </div>

              <q-card
                v-for="group in splitBankGroups"
                :key="group.key"
                flat
                bordered
                :class="[$q.dark.isActive ? 'bg-grey-9' : 'bg-grey-1', 'q-pa-sm rounded-borders q-mb-sm']"
              >
                <div class="row items-center justify-between q-col-gutter-sm">
                  <div class="col-12 col-md-4">
                    <div class="row items-center">
                      <q-icon
                        :name="group.isCash ? 'payments' : 'account_balance'"
                        :color="group.isCash ? 'amber-9' : 'primary'"
                        size="24px"
                        class="q-mr-sm"
                      />
                      <div>
                        <div class="text-weight-bold text-subtitle2">{{ group.bankName }}</div>
                        <div class="text-caption text-grey-7">
                          {{ group.employees.length }} employee(s) • <span class="text-weight-bold text-green">LKR {{ fmt(group.totalNet) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="col-12 col-md-5">
                    <q-select
                      :dark="$q.dark.isActive"
                      outlined
                      dense
                      v-model="groupPayingAccounts[group.key]"
                      :options="group.isCash ? cashAccounts : bankAccounts"
                      emit-value
                      map-options
                      :label="group.isCash ? 'Pay from Company Cash Account' : 'Pay from Company Bank Account'"
                    />
                  </div>

                  <div class="col-12 col-md-3 row justify-end">
                    <q-btn
                      unelevated
                      :color="group.isCash ? 'amber-9' : 'primary'"
                      :text-color="group.isCash ? 'dark' : 'white'"
                      icon="send"
                      no-caps
                      size="sm"
                      label="Post Group"
                      @click="postSplitGroupToFinance(group)"
                      :loading="postingGroupId === group.key"
                      :disable="!groupPayingAccounts[group.key]"
                    >
                      <q-tooltip>Post this specific group from the selected company account</q-tooltip>
                    </q-btn>
                  </div>
                </div>

                <!-- Expansion to see employees in group -->
                <q-expansion-item
                  dense
                  dense-toggle
                  header-class="text-caption text-grey-7 q-pa-none q-mt-xs"
                  :label="`View ${group.employees.length} employees in this group`"
                >
                  <q-list dense separator class="q-mt-xs bg-white rounded-borders">
                    <q-item v-for="emp in group.employees" :key="emp.id" dense>
                      <q-item-section>
                        <q-item-label class="text-caption text-weight-medium">
                          {{ emp.employees?.full_name || emp.employees?.employee_code }}
                        </q-item-label>
                        <q-item-label caption class="text-grey-6">
                          Acc: {{ emp.employees?.bank_account_number || emp.employees?.account_number || 'Cash' }}
                          <span v-if="emp.employees?.bank_branch"> ({{ emp.employees.bank_branch }})</span>
                        </q-item-label>
                      </q-item-section>
                      <q-item-section side>
                        <span class="text-caption text-weight-bold text-dark">LKR {{ fmt(emp.net_salary) }}</span>
                      </q-item-section>
                    </q-item>
                  </q-list>
                </q-expansion-item>
              </q-card>
            </div>

            <!-- Tab 2: Custom Employee Selection -->
            <div v-else-if="splitSubTab === 'custom_select'" class="q-gutter-sm">
              <div class="row q-col-gutter-sm items-center q-mb-sm">
                <div class="col-12 col-sm-6">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    v-model="customPayingAccountId"
                    :options="customPaymentMethod === 'cash' ? cashAccounts : bankAccounts"
                    emit-value
                    map-options
                    label="Paying Company Account"
                  />
                </div>
                <div class="col-12 col-sm-3">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    v-model="customPaymentMethod"
                    :options="[
                      { label: 'Bank Transfer', value: 'bank_transfer' },
                      { label: 'Cash', value: 'cash' },
                      { label: 'Cheque', value: 'cheque' }
                    ]"
                    emit-value
                    map-options
                    label="Method"
                  />
                </div>
                <div class="col-12 col-sm-3">
                  <q-btn
                    unelevated
                    color="primary"
                    icon="send"
                    no-caps
                    dense
                    class="full-width q-py-xs"
                    :label="`Post Selected (${selectedCustomSlips.length})`"
                    :disable="!customPayingAccountId || selectedCustomSlips.length === 0"
                    :loading="postingCustom"
                    @click="postCustomSelectedToFinance"
                  />
                </div>
              </div>

              <!-- Unposted Slips Table with Selection -->
              <q-table
                dense
                flat
                bordered
                :rows="unpostedPayslips"
                :columns="customSelectColumns"
                row-key="id"
                selection="multiple"
                v-model:selected="selectedCustomSlips"
                :pagination="{ rowsPerPage: 10 }"
              />
            </div>

            <q-card-actions align="right" class="q-pt-sm">
              <q-btn flat label="Close" color="grey" no-caps v-close-popup />
            </q-card-actions>
          </div>
        </div>
      </q-card>
    </q-dialog>

    <!-- ══ CUMULATIVE EPF & ETF SUMMARY DIALOG ══ -->
    <q-dialog v-model="showCumulativeEpfDialog" maximized persistent>
      <q-card :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-grey-1']">
        <!-- Header -->
        <q-bar
          :class="[$q.dark.isActive ? 'bg-dark' : 'bg-teal-9 text-white']"
          style="height: 56px; padding: 0 16px"
        >
          <q-icon name="auto_graph" color="amber" size="22px" />
          <div class="q-ml-sm text-weight-bold text-subtitle1">
            Employee Cumulative EPF & ETF Contribution Summary
          </div>
          <q-badge color="teal-6" class="q-ml-sm text-caption">Seven Waves ERP</q-badge>
          <q-space />
          <q-btn
            unelevated
            dense
            color="positive"
            icon="file_download"
            label="Export Excel"
            class="q-mr-sm"
            @click="exportCumulativeEpfExcel"
            no-caps
            size="sm"
          >
            <q-tooltip>Download complete summary in Excel format (.xlsx)</q-tooltip>
          </q-btn>
          <q-btn
            unelevated
            dense
            color="red-7"
            icon="picture_as_pdf"
            label="Export PDF"
            class="q-mr-sm"
            @click="exportCumulativeEpfPdf"
            no-caps
            size="sm"
          >
            <q-tooltip>Download formatted A4 PDF statement</q-tooltip>
          </q-btn>
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-bar>

        <q-card-section class="q-pa-md">
          <!-- Filter Controls -->
          <div class="row q-col-gutter-sm items-center q-mb-md">
            <div class="col-12 col-md-5">
              <q-input
                :dark="$q.dark.isActive"
                outlined
                dense
                v-model="cumulativeSearch"
                placeholder="Search by Employee Name, Code, EPF No, NIC, Department..."
                clearable
              >
                <template #prepend>
                  <q-icon name="search" size="xs" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-md-3">
              <q-select
                :dark="$q.dark.isActive"
                outlined
                dense
                v-model="cumulativeYearFilter"
                :options="cumulativeYearOptions"
                label="Contribution Period"
              />
            </div>
            <div class="col-12 col-md-4 text-right text-caption text-grey-7">
              Showing <strong>{{ filteredCumulativeEmployees.length }}</strong> active EPF contributors
            </div>
          </div>

          <!-- Cumulative KPI Cards -->
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-6 col-sm-4 col-md-2">
              <q-card flat bordered class="q-pa-sm text-center bg-white rounded-borders">
                <div class="text-caption text-grey-7">Total Contributors</div>
                <div class="text-h6 text-weight-bolder text-primary">
                  {{ cumulativeGrandTotals.staffCount }}
                </div>
              </q-card>
            </div>
            <div class="col-6 col-sm-4 col-md-2">
              <q-card flat bordered class="q-pa-sm text-center bg-white rounded-borders">
                <div class="text-caption text-grey-7">Cumulative Basic</div>
                <div class="text-subtitle2 text-weight-bold text-dark">
                  LKR {{ fmt(cumulativeGrandTotals.totalBasic) }}
                </div>
              </q-card>
            </div>
            <div class="col-6 col-sm-4 col-md-2">
              <q-card flat bordered class="q-pa-sm text-center bg-teal-1 rounded-borders">
                <div class="text-caption text-teal-9 text-weight-medium">Emp EPF (8%)</div>
                <div class="text-subtitle2 text-weight-bold text-teal-9">
                  LKR {{ fmt(cumulativeGrandTotals.totalEpf8) }}
                </div>
              </q-card>
            </div>
            <div class="col-6 col-sm-4 col-md-2">
              <q-card flat bordered class="q-pa-sm text-center bg-blue-1 rounded-borders">
                <div class="text-caption text-blue-9 text-weight-medium">Empr EPF (12%)</div>
                <div class="text-subtitle2 text-weight-bold text-blue-9">
                  LKR {{ fmt(cumulativeGrandTotals.totalEpf12) }}
                </div>
              </q-card>
            </div>
            <div class="col-6 col-sm-4 col-md-2">
              <q-card flat bordered class="q-pa-sm text-center bg-indigo-1 rounded-borders">
                <div class="text-caption text-indigo-9 text-weight-medium">Total EPF (20%)</div>
                <div class="text-subtitle2 text-weight-bold text-indigo-9">
                  LKR {{ fmt(cumulativeGrandTotals.totalEpf20) }}
                </div>
              </q-card>
            </div>
            <div class="col-6 col-sm-4 col-md-2">
              <q-card flat bordered class="q-pa-sm text-center bg-purple-1 rounded-borders">
                <div class="text-caption text-purple-9 text-weight-medium">Grand Total (23%)</div>
                <div class="text-subtitle2 text-weight-bold text-purple-9">
                  LKR {{ fmt(cumulativeGrandTotals.total23) }}
                </div>
              </q-card>
            </div>
          </div>

          <!-- Cumulative Table -->
          <q-table
            flat
            bordered
            dense
            :rows="filteredCumulativeEmployees"
            :columns="cumulativeColumns"
            row-key="empId"
            :loading="cumulativeLoading"
            :pagination="{ rowsPerPage: 15 }"
            class="bg-white rounded-borders"
            table-header-class="bg-grey-2 text-weight-bold text-uppercase text-caption"
          >
            <template #body-cell-actions="props">
              <q-td :props="props" class="q-gutter-xs">
                <q-btn
                  flat
                  dense
                  size="sm"
                  color="teal-8"
                  icon="visibility"
                  label="History"
                  no-caps
                  @click="openSingleEmpHistory(props.row)"
                >
                  <q-tooltip>View complete monthly contribution history</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  size="sm"
                  color="red-7"
                  icon="download"
                  @click="exportIndividualEmployeePdf(props.row)"
                >
                  <q-tooltip>Download individual employee statement PDF</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- ══ INDIVIDUAL EMPLOYEE EPF HISTORY DIALOG ══ -->
    <q-dialog v-model="showEmpHistoryDialog">
      <q-card style="min-width: 720px; max-width: 95vw" :class="[$q.dark.isActive ? 'bg-grey-10' : 'bg-white']">
        <q-card-section class="row items-center bg-teal-8 text-white q-pa-md">
          <q-icon name="person" size="22px" class="q-mr-sm" />
          <div>
            <div class="text-subtitle1 text-weight-bold">{{ selectedEmpHistory?.name }}</div>
            <div class="text-caption text-teal-1">
              Code: {{ selectedEmpHistory?.code }} | EPF No: {{ selectedEmpHistory?.epfNo }} | NIC: {{ selectedEmpHistory?.nic }}
            </div>
          </div>
          <q-space />
          <q-btn
            unelevated
            dense
            size="sm"
            color="white"
            text-color="teal-9"
            icon="download"
            label="Download PDF"
            class="q-mr-sm"
            @click="exportIndividualEmployeePdf(selectedEmpHistory)"
            no-caps
          />
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md">
          <!-- Quick Meta Grid -->
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-4">
              <div class="text-caption text-grey-6">Department</div>
              <div class="text-weight-medium">{{ selectedEmpHistory?.department }}</div>
            </div>
            <div class="col-4">
              <div class="text-caption text-grey-6">Designation</div>
              <div class="text-weight-medium">{{ selectedEmpHistory?.designation }}</div>
            </div>
            <div class="col-4">
              <div class="text-caption text-grey-6">Total Contribution Months</div>
              <div class="text-weight-medium">{{ selectedEmpHistory?.monthsCount }} month(s)</div>
            </div>
          </div>

          <!-- Employee Total Summary -->
          <div class="q-pa-sm bg-teal-1 rounded-borders row justify-between items-center q-mb-md">
            <div>
              <span class="text-caption text-grey-7">Emp EPF (8%): </span>
              <strong class="text-teal-9">LKR {{ fmt(selectedEmpHistory?.totalEpf8) }}</strong>
            </div>
            <div>
              <span class="text-caption text-grey-7">Empr EPF (12%): </span>
              <strong class="text-blue-9">LKR {{ fmt(selectedEmpHistory?.totalEpf12) }}</strong>
            </div>
            <div>
              <span class="text-caption text-grey-7">Total EPF (20%): </span>
              <strong class="text-indigo-9">LKR {{ fmt(selectedEmpHistory?.totalEpf20) }}</strong>
            </div>
            <div>
              <span class="text-caption text-grey-7">Total (23%): </span>
              <strong class="text-purple-9">LKR {{ fmt(selectedEmpHistory?.total23) }}</strong>
            </div>
          </div>

          <!-- Monthly History Table -->
          <q-table
            flat
            bordered
            dense
            :rows="selectedEmpHistory?.history || []"
            :columns="empHistoryColumns"
            row-key="id"
            :pagination="{ rowsPerPage: 10 }"
          />
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Close" color="grey" v-close-popup no-caps />
          <q-btn
            unelevated
            color="teal-8"
            icon="picture_as_pdf"
            label="Download Certified Statement"
            @click="exportIndividualEmployeePdf(selectedEmpHistory)"
            no-caps
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
import { localYmd } from 'src/services/hr/hrDates'

const $q = useQuasar()
const authStore = useAuthStore()

// ── WhatsApp Gateway Bridge Status & QR Dialog ──
const showWhatsAppDialog = ref(false)
const bridgeStatus = reactive({
  connected: false,
  user: null,
  qr: null,
  serviceRunning: false,
  loading: false,
})
const testPhone = ref('0717266563')
const sendingTestPdf = ref(false)
let bridgePollInterval = null

async function checkBridgeStatus() {
  bridgeStatus.loading = true
  try {
    // 1. Check Cloud Sync via Supabase system_settings (Immune to HTTPS Mixed-Content & CORS)
    const { data: cloudRow } = await supabase
      .from('system_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', 'whatsapp_bridge_status')
      .maybeSingle()

    if (cloudRow?.setting_value) {
      const v = cloudRow.setting_value
      const isRecent = v.lastSeen && Date.now() - v.lastSeen < 60000
      if (isRecent || v.connected || v.qr) {
        bridgeStatus.serviceRunning = true
        bridgeStatus.connected = !!v.connected
        bridgeStatus.user = v.user
        bridgeStatus.qr = v.qr
        return
      }
    }

    // 2. Direct localhost fallback (if on dev mode)
    const res = await fetch('http://localhost:3005/status', {
      signal: AbortSignal.timeout(1000),
    })
    const data = await res.json()
    bridgeStatus.serviceRunning = true
    bridgeStatus.connected = !!data.connected
    bridgeStatus.user = data.user
    bridgeStatus.qr = data.qr
  } catch {
    bridgeStatus.serviceRunning = false
    bridgeStatus.connected = false
    bridgeStatus.user = null
    bridgeStatus.qr = null
  } finally {
    bridgeStatus.loading = false
  }
}

function openExternalScanner() {
  window.open('http://localhost:3005', '_blank')
}

async function queueCloudPdf(phone, pdfBase64, filename, caption) {
  const { data: row } = await supabase
    .from('system_settings')
    .select('id, setting_value')
    .eq('setting_key', 'whatsapp_outbox')
    .maybeSingle()

  const sampleBase64 =
    'JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iago0IDAgb2JqPDwvTGVuZ3RoIDE0MD4+c3RyZWFtCkJUCi9GMSAxNiBUZgoxMDAgNzUwIFRkCihTRVZFTiBXQVZFUyBSRVNUAURBTlQgLSBPZkZJQ0lBTCBQQVlTTElQKSBUagovRjEgMTIgVGYKMTAwIDcwMCBUZApJRW1wbG95ZWU6IE1yLiBLYXJhbiB8IE5ldCBTYWxhcnk6IExLUiA2NSwwMTYuODcpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjggMDAwMDAgbiAKMDAwMDAwMDEyNSAwMDAwMCBuIAowMDAwMDAwMzI1IDAwMDAwIG4gCjAwMDAwMDAyNTcgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNi9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjUxOQolJUVPRg=='

  // Purge heavy base64 from sent items and keep only last 5 to ensure ultra-fast sync (< 80KB)
  const items = (row?.setting_value?.items || [])
    .slice(-5)
    .map((it) => (it.status === 'sent' ? { ...it, pdfBase64: null } : it))

  // Deduplicate before adding to cloud outbox: skip if already pending for this phone
  const alreadyPending = items.some(
    (it) => it.phone === phone && it.status === 'pending'
  )
  if (alreadyPending) {
    console.log('[queueCloudPdf] Skipping queue: payslip already pending for phone', phone)
    return
  }

  items.push({
    id: String(Date.now()),
    phone,
    pdfBase64: pdfBase64 || sampleBase64,
    filename: filename || 'Payslip.pdf',
    caption: caption || '🌟 Seven Waves - Payslip',
    status: 'pending',
    createdAt: new Date().toISOString(),
  })

  if (row) {
    await supabase
      .from('system_settings')
      .update({ setting_value: { items }, updated_at: new Date().toISOString() })
      .eq('id', row.id)
  } else {
    await supabase
      .from('system_settings')
      .insert({
        company_id: selectedRun.value?.company_id || null,
        setting_key: 'whatsapp_outbox',
        setting_value: { items },
      })
  }
}

function openWhatsAppGatewayDialog() {
  showWhatsAppDialog.value = true
  checkBridgeStatus()
  if (bridgePollInterval) clearInterval(bridgePollInterval)
  bridgePollInterval = setInterval(() => {
    if (showWhatsAppDialog.value) {
      checkBridgeStatus()
    } else {
      clearInterval(bridgePollInterval)
    }
  }, 2500)
}

async function sendTestPdfDirect() {
  if (!testPhone.value) {
    $q.notify({ type: 'warning', message: 'Please enter a recipient number.' })
    return
  }
  sendingTestPdf.value = true
  try {
    let sent = false
    try {
      const resp = await fetch('http://localhost:3005/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone.value }),
        signal: AbortSignal.timeout(3000),
      })
      const data = await resp.json()
      if (data.success) sent = true
    } catch {
      sent = false
    }

    if (!sent) {
      await queueCloudPdf(testPhone.value, null, 'Seven_Waves_Test_Payslip.pdf', '🌟 Seven Waves - Test Payslip')
    }

    $q.notify({
      type: 'positive',
      icon: 'chat',
      message: `✅ Test Payslip PDF successfully dispatched to ${testPhone.value}!`,
      timeout: 6000,
    })
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err.message,
    })
  } finally {
    sendingTestPdf.value = false
  }
}

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
const sendingWhatsAppId = ref(null)
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
const paidDate = ref(localYmd())
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
        a.account_type === 'petty_cash' ||
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

// ── Post to Finance Options (Option A: Bulk / Option B: Split) ────────────────
const postFinanceMode = ref('bulk') // 'bulk' | 'split'
const splitSubTab = ref('bank_groups') // 'bank_groups' | 'custom_select'
const groupPayingAccounts = reactive({})
const postingGroupId = ref(null)

const selectedCustomSlips = ref([])
const customPayingAccountId = ref(null)
const customPaymentMethod = ref('bank_transfer')
const postingCustom = ref(false)

const unpostedPayslips = computed(() =>
  payslips.value.filter(
    (p) => !p.is_held && !p.finance_posted_at && p.payment_status !== 'paid',
  ),
)

const postedPayslips = computed(() =>
  payslips.value.filter((p) => p.finance_posted_at || p.payment_status === 'paid'),
)

const unpostedTotalNet = computed(() =>
  unpostedPayslips.value.reduce((s, p) => s + Number(p.net_salary || 0), 0),
)

const paidBankSummary = computed(() => {
  const map = {}
  postedPayslips.value.forEach((p) => {
    const rawBank = (p.employees?.bank_name || '').trim()
    const bankName = !rawBank || rawBank.toLowerCase() === 'cash' ? 'Cash / Handover' : rawBank
    if (!map[bankName]) {
      map[bankName] = { count: 0, total: 0 }
    }
    map[bankName].count++
    map[bankName].total += Number(p.net_salary || 0)
  })
  return map
})

const splitBankGroups = computed(() => {
  const map = {}
  unpostedPayslips.value.forEach((p) => {
    const rawBank = (p.employees?.bank_name || '').trim()
    const isCash = !rawBank || rawBank.toLowerCase() === 'cash'
    const bankName = isCash ? 'Cash Payment (Direct Handover)' : rawBank
    const key = isCash ? '__cash__' : bankName.toLowerCase()

    if (!map[key]) {
      map[key] = {
        key,
        bankName,
        isCash,
        employees: [],
        totalNet: 0,
      }
    }
    map[key].employees.push(p)
    map[key].totalNet += Number(p.net_salary || 0)
  })

  const groups = Object.values(map).sort((a, b) => {
    if (a.isCash) return 1
    if (b.isCash) return -1
    return a.bankName.localeCompare(b.bankName)
  })

  // Match default account for each group if not already selected
  groups.forEach((g) => {
    if (!groupPayingAccounts[g.key]) {
      if (g.isCash) {
        const cashDef = cashAccounts.value[0]?.value
        if (cashDef) groupPayingAccounts[g.key] = cashDef
      } else {
        const matched = bankAccounts.value.find(
          (a) =>
            a.label.toLowerCase().includes(g.bankName.toLowerCase()) ||
            g.bankName.toLowerCase().includes(a.label.toLowerCase()),
        )
        groupPayingAccounts[g.key] = matched ? matched.value : bankAccounts.value[0]?.value || null
      }
    }
  })

  return groups
})

const customSelectColumns = [
  { name: 'code', label: 'Code', align: 'left', field: (r) => r.employees?.employee_code || '—', sortable: true },
  { name: 'name', label: 'Employee Name', align: 'left', field: (r) => r.employees?.full_name || '—', sortable: true },
  { name: 'bank', label: 'Bank Name', align: 'left', field: (r) => r.employees?.bank_name || 'Cash', sortable: true },
  { name: 'acc', label: 'Account No', align: 'left', field: (r) => r.employees?.bank_account_number || r.employees?.account_number || '—' },
  { name: 'net', label: 'Net Salary', align: 'right', field: (r) => `LKR ${fmt(r.net_salary)}`, sortable: true },
]

// ── Cumulative EPF & ETF Summary State ────────────────────────────────────────
const showCumulativeEpfDialog = ref(false)
const cumulativeLoading = ref(false)
const cumulativeRawData = ref([])
const cumulativeSearch = ref('')
const cumulativeYearFilter = ref('All Time')
const selectedEmpHistory = ref(null)
const showEmpHistoryDialog = ref(false)

const cumulativeYearOptions = computed(() => {
  const years = new Set()
  cumulativeRawData.value.forEach((p) => {
    const periodStart = p.payroll_runs?.period_start || p.created_at || ''
    if (periodStart) {
      years.add(String(periodStart).substring(0, 4))
    }
  })
  return ['All Time', ...Array.from(years).sort().reverse()]
})

const cumulativeEmployeeList = computed(() => {
  const empMap = {}
  cumulativeRawData.value.forEach((p) => {
    const emp = p.employees
    if (!emp) return
    const empId = emp.id
    const run = p.payroll_runs
    const periodStart = run?.period_start || p.created_at || ''
    const year = periodStart ? String(periodStart).substring(0, 4) : ''

    if (cumulativeYearFilter.value !== 'All Time' && year !== cumulativeYearFilter.value) {
      return
    }

    if (!empMap[empId]) {
      empMap[empId] = {
        empId,
        code: emp.employee_code || '—',
        name: emp.full_name || 'Employee',
        epfNo: emp.epf_no || emp.employee_code || '—',
        nic: emp.nic_number || '—',
        department: emp.departments?.name || '—',
        designation: emp.designations?.title || '—',
        hireDate: emp.hire_date || '—',
        monthsCount: 0,
        totalBasic: 0,
        totalEpf8: 0,
        totalEpf12: 0,
        totalEpf20: 0,
        totalEtf3: 0,
        total23: 0,
        history: [],
      }
    }

    const b = Number(p.basic_salary || 0)
    const e8 = Number(p.epf_employee || 0)
    const e12 = Number(p.epf_employer || 0)
    const e20 = e8 + e12
    const et3 = Number(p.etf_employer || 0)
    const t23 = e20 + et3

    empMap[empId].monthsCount++
    empMap[empId].totalBasic += b
    empMap[empId].totalEpf8 += e8
    empMap[empId].totalEpf12 += e12
    empMap[empId].totalEpf20 += e20
    empMap[empId].totalEtf3 += et3
    empMap[empId].total23 += t23

    empMap[empId].history.push({
      id: p.id,
      periodStart: run?.period_start || '—',
      periodEnd: run?.period_end || '—',
      basic: b,
      epf8: e8,
      epf12: e12,
      epf20: e20,
      etf3: et3,
      total23: t23,
      status: run?.status || 'processed',
    })
  })

  return Object.values(empMap).sort((a, b) => a.code.localeCompare(b.code))
})

const filteredCumulativeEmployees = computed(() => {
  const q = cumulativeSearch.value?.trim().toLowerCase()
  if (!q) return cumulativeEmployeeList.value
  return cumulativeEmployeeList.value.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.code.toLowerCase().includes(q) ||
      e.epfNo.toLowerCase().includes(q) ||
      e.nic.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q),
  )
})

const cumulativeGrandTotals = computed(() => {
  let staffCount = filteredCumulativeEmployees.value.length
  let totalBasic = 0
  let totalEpf8 = 0
  let totalEpf12 = 0
  let totalEpf20 = 0
  let totalEtf3 = 0
  let total23 = 0

  filteredCumulativeEmployees.value.forEach((e) => {
    totalBasic += e.totalBasic
    totalEpf8 += e.totalEpf8
    totalEpf12 += e.totalEpf12
    totalEpf20 += e.totalEpf20
    totalEtf3 += e.totalEtf3
    total23 += e.total23
  })

  return { staffCount, totalBasic, totalEpf8, totalEpf12, totalEpf20, totalEtf3, total23 }
})

const cumulativeColumns = [
  { name: 'code', label: 'Code', align: 'left', field: 'code', sortable: true },
  { name: 'epfNo', label: 'EPF No', align: 'left', field: 'epfNo', sortable: true },
  { name: 'name', label: 'Employee Name', align: 'left', field: 'name', sortable: true },
  { name: 'department', label: 'Department', align: 'left', field: 'department', sortable: true },
  { name: 'monthsCount', label: 'Months', align: 'center', field: 'monthsCount', sortable: true },
  { name: 'totalBasic', label: 'Cumulative Basic', align: 'right', field: (r) => `LKR ${fmt(r.totalBasic)}`, sortable: true },
  { name: 'totalEpf8', label: 'Emp 8%', align: 'right', field: (r) => `LKR ${fmt(r.totalEpf8)}`, sortable: true },
  { name: 'totalEpf12', label: 'Empr 12%', align: 'right', field: (r) => `LKR ${fmt(r.totalEpf12)}`, sortable: true },
  { name: 'totalEpf20', label: 'Total EPF 20%', align: 'right', field: (r) => `LKR ${fmt(r.totalEpf20)}`, sortable: true },
  { name: 'totalEtf3', label: 'ETF 3%', align: 'right', field: (r) => `LKR ${fmt(r.totalEtf3)}`, sortable: true },
  { name: 'total23', label: 'Total 23%', align: 'right', field: (r) => `LKR ${fmt(r.total23)}`, sortable: true },
  { name: 'actions', label: 'Statement', align: 'center' },
]

const empHistoryColumns = [
  { name: 'period', label: 'Period', align: 'left', field: (r) => `${r.periodStart} — ${r.periodEnd}` },
  { name: 'basic', label: 'Basic Salary', align: 'right', field: (r) => `LKR ${fmt(r.basic)}` },
  { name: 'epf8', label: 'Emp 8%', align: 'right', field: (r) => `LKR ${fmt(r.epf8)}` },
  { name: 'epf12', label: 'Empr 12%', align: 'right', field: (r) => `LKR ${fmt(r.epf12)}` },
  { name: 'epf20', label: 'Total 20%', align: 'right', field: (r) => `LKR ${fmt(r.epf20)}` },
  { name: 'etf3', label: 'ETF 3%', align: 'right', field: (r) => `LKR ${fmt(r.etf3)}` },
  { name: 'total23', label: 'Total 23%', align: 'right', field: (r) => `LKR ${fmt(r.total23)}` },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
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
        '*, employees(full_name, employee_code, email, mobile, nic_number, bank_name, bank_branch, bank_account_name, bank_account_number, account_number, bank_code)',
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

// ── EPF & ETF Statutory Remittance Report ──────────────────────────────────
const showEpfEtfDialog = ref(false)
const epfSearch = ref('')

const epfColumns = [
  { name: 'index', label: '#', align: 'center', field: 'index', style: 'width: 45px' },
  {
    name: 'epf_no',
    label: 'EPF Number',
    align: 'left',
    field: (r) => r.employees?.epf_no || r.employees?.employee_code || '—',
    sortable: true,
  },
  {
    name: 'nic',
    label: 'NIC Number',
    align: 'left',
    field: (r) => r.employees?.nic_number || '—',
    sortable: true,
  },
  {
    name: 'employee',
    label: 'Employee Name',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  {
    name: 'basic',
    label: 'Basic Salary (LKR)',
    align: 'right',
    field: 'basic_salary',
    format: (v) => fmt(v),
    sortable: true,
  },
  {
    name: 'epf_8',
    label: 'Employee EPF (8%)',
    align: 'right',
    field: 'epf_employee',
    format: (v) => fmt(v),
    sortable: true,
  },
  {
    name: 'epf_12',
    label: 'Employer EPF (12%)',
    align: 'right',
    field: 'epf_employer',
    format: (v) => fmt(v),
    sortable: true,
  },
  {
    name: 'epf_20',
    label: 'Total EPF (20%)',
    align: 'right',
    field: (r) => Number(r.epf_employee || 0) + Number(r.epf_employer || 0),
    format: (v) => fmt(v),
    sortable: true,
  },
  {
    name: 'etf_3',
    label: 'Employer ETF (3%)',
    align: 'right',
    field: 'etf_employer',
    format: (v) => fmt(v),
    sortable: true,
  },
  {
    name: 'grand_total',
    label: 'Total Remittance (23%)',
    align: 'right',
    field: (r) =>
      Number(r.epf_employee || 0) + Number(r.epf_employer || 0) + Number(r.etf_employer || 0),
    format: (v) => fmt(v),
    sortable: true,
  },
]

function openEpfEtfReport() {
  epfSearch.value = ''
  showEpfEtfDialog.value = true
}

async function openEpfEtfReportForRun(run) {
  await viewRun(run)
  openEpfEtfReport()
}

const filteredEpfPayslips = computed(() => {
  let list = payslips.value || []
  const term = epfSearch.value?.trim().toLowerCase()
  if (term) {
    list = list.filter(
      (r) =>
        r.employees?.full_name?.toLowerCase().includes(term) ||
        r.employees?.employee_code?.toLowerCase().includes(term) ||
        r.employees?.epf_no?.toLowerCase().includes(term) ||
        r.employees?.nic_number?.toLowerCase().includes(term),
    )
  }
  return list.map((r, i) => ({ ...r, index: i + 1 }))
})

const epfTotals = computed(() => {
  const list = filteredEpfPayslips.value || []
  let basic = 0,
    epf8 = 0,
    epf12 = 0,
    etf3 = 0
  for (const r of list) {
    basic += Number(r.basic_salary || 0)
    epf8 += Number(r.epf_employee || 0)
    epf12 += Number(r.epf_employer || 0)
    etf3 += Number(r.etf_employer || 0)
  }
  const epf20 = epf8 + epf12
  const grandTotal = epf20 + etf3
  return { basic, epf8, epf12, epf20, etf3, grandTotal }
})

function exportEpfEtfExcel() {
  if (!filteredEpfPayslips.value || filteredEpfPayslips.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No payslip records to export.' })
    return
  }

  const rows = filteredEpfPayslips.value.map((r, i) => {
    const epf8 = Number(r.epf_employee || 0)
    const epf12 = Number(r.epf_employer || 0)
    const epf20 = epf8 + epf12
    const etf3 = Number(r.etf_employer || 0)
    const total23 = epf20 + etf3
    return {
      '#': i + 1,
      'EPF No': r.employees?.epf_no || r.employees?.employee_code || '',
      'NIC Number': r.employees?.nic_number || '',
      'Employee Code': r.employees?.employee_code || '',
      'Employee Name': r.employees?.full_name || '',
      'Basic Salary (LKR)': Number(r.basic_salary || 0),
      'Employee EPF 8% (LKR)': epf8,
      'Employer EPF 12% (LKR)': epf12,
      'Total EPF 20% (LKR)': epf20,
      'Employer ETF 3% (LKR)': etf3,
      'Total Remittance 23% (LKR)': total23,
    }
  })

  // Append Total Row
  rows.push({
    '#': 'TOTAL',
    'EPF No': '',
    'NIC Number': '',
    'Employee Code': '',
    'Employee Name': `${filteredEpfPayslips.value.length} Staff`,
    'Basic Salary (LKR)': epfTotals.value.basic,
    'Employee EPF 8% (LKR)': epfTotals.value.epf8,
    'Employer EPF 12% (LKR)': epfTotals.value.epf12,
    'Total EPF 20% (LKR)': epfTotals.value.epf20,
    'Employer ETF 3% (LKR)': epfTotals.value.etf3,
    'Total Remittance 23% (LKR)': epfTotals.value.grandTotal,
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'EPF_ETF_Return')
  const fileName = `EPF_ETF_Statutory_Report_${selectedRun.value?.period_start || 'month'}.xlsx`
  XLSX.writeFile(wb, fileName)
  $q.notify({ type: 'positive', message: 'EPF & ETF Excel report exported successfully!' })
}

function exportEpfEtfPdf() {
  if (!filteredEpfPayslips.value || filteredEpfPayslips.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No payslip records to export.' })
    return
  }

  const doc = new jsPDF('l', 'mm', 'a4')
  const periodStr = `${selectedRun.value?.period_start || ''} to ${selectedRun.value?.period_end || ''}`

  doc.setFontSize(14)
  doc.setTextColor(0, 105, 92)
  doc.text('SEVEN WAVES RESTAURANT — EPF & ETF STATUTORY CONTRIBUTION RETURN', 14, 14)

  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text(
    `Contribution Period: ${periodStr}  |  Generated: ${new Date().toLocaleDateString()}  |  Total Staff: ${filteredEpfPayslips.value.length}`,
    14,
    20,
  )

  const head = [
    [
      '#',
      'EPF No',
      'NIC No',
      'Code',
      'Employee Name',
      'Basic Salary',
      'EPF 8% (Emp)',
      'EPF 12% (Empr)',
      'Total EPF 20%',
      'ETF 3% (Empr)',
      'Total (23%)',
    ],
  ]

  const body = filteredEpfPayslips.value.map((r, i) => {
    const epf8 = Number(r.epf_employee || 0)
    const epf12 = Number(r.epf_employer || 0)
    const epf20 = epf8 + epf12
    const etf3 = Number(r.etf_employer || 0)
    const total23 = epf20 + etf3
    return [
      i + 1,
      r.employees?.epf_no || r.employees?.employee_code || '—',
      r.employees?.nic_number || '—',
      r.employees?.employee_code || '—',
      r.employees?.full_name || '—',
      fmt(r.basic_salary),
      fmt(epf8),
      fmt(epf12),
      fmt(epf20),
      fmt(etf3),
      fmt(total23),
    ]
  })

  const foot = [
    [
      'TOTAL',
      '',
      '',
      '',
      `${filteredEpfPayslips.value.length} Staff`,
      fmt(epfTotals.value.basic),
      fmt(epfTotals.value.epf8),
      fmt(epfTotals.value.epf12),
      fmt(epfTotals.value.epf20),
      fmt(epfTotals.value.etf3),
      fmt(epfTotals.value.grandTotal),
    ],
  ]

  autoTable(doc, {
    startY: 24,
    head,
    body,
    foot,
    theme: 'grid',
    headStyles: { fillColor: [0, 121, 107], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [224, 242, 241], textColor: [0, 77, 64], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 22 },
      2: { halign: 'left', cellWidth: 24 },
      3: { halign: 'left', cellWidth: 20 },
      4: { halign: 'left', cellWidth: 46 },
      5: { halign: 'right', cellWidth: 27 },
      6: { halign: 'right', cellWidth: 27 },
      7: { halign: 'right', cellWidth: 27 },
      8: { halign: 'right', cellWidth: 27 },
      9: { halign: 'right', cellWidth: 25 },
      10: { halign: 'right', cellWidth: 28 },
    },
  })

  const finalY = (doc.lastAutoTable?.finalY || 160) + 12
  if (finalY < 195) {
    doc.setFontSize(8)
    doc.setTextColor(60)
    doc.text('Prepared By: ___________________', 20, finalY)
    doc.text('Checked By: ___________________', 115, finalY)
    doc.text('Approved By: ___________________', 210, finalY)
    doc.text('(HR Manager)', 20, finalY + 5)
    doc.text('(Chief Accountant)', 115, finalY + 5)
    doc.text('(Managing Director)', 210, finalY + 5)
  }

  const fileName = `EPF_ETF_Statutory_Report_${selectedRun.value?.period_start || 'month'}.pdf`
  doc.save(fileName)
  $q.notify({ type: 'positive', message: 'EPF & ETF PDF report downloaded successfully!' })
}

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
  const branchId = authStore.currentBranch?.id
  if (!branchId) {
    runs.value = []
    return
  }
  loading.value = true
  try {
    let q = supabase
      .from('payroll_runs')
      .select('*')
      .eq('branch_id', branchId)
      .order('period_start', { ascending: false })
    if (statusFilter.value !== 'All') q = q.eq('status', statusFilter.value.toLowerCase())
    const { data, error } = await q
    if (error) throw error
    runs.value = data || []
  } catch (err) {
    $q.notify({ type: 'negative', message: `Failed to load payroll runs: ${err.message}` })
  } finally {
    loading.value = false
  }
}

function runPayroll() {
  if (!payrollMonth.value) {
    $q.notify({ type: 'warning', message: 'Select a month' })
    return
  }
  const existing = runs.value.find((r) => String(r.period_start).startsWith(payrollMonth.value))
  $q.dialog({
    title: existing ? 'Re-process Payroll?' : 'Process Payroll',
    message: existing
      ? `A ${existing.status} run already exists for ${payrollMonth.value}. Re-processing recalculates every payslip (manual hold/paid flags on payslips will be lost). Continue?`
      : `Process payroll for ${payrollMonth.value} (${authStore.currentBranch?.name || 'current branch'})?`,
    cancel: true,
    persistent: true,
    ok: { label: existing ? 'Re-process' : 'Process', color: 'amber-8', textColor: 'dark', unelevated: true, noCaps: true },
  }).onOk(() => doRunPayroll())
}

async function doRunPayroll() {
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
  const { data, error } = await supabase
    .from('payslips')
    .select(
      '*, employees(full_name, employee_code, nic_number, epf_no, email, mobile, bank_name, bank_branch, bank_account_name, bank_account_number, account_number, bank_code)',
    )
    .eq('payroll_run_id', run.id)
    .order('net_salary', { ascending: false })
  if (error) {
    $q.notify({ type: 'negative', message: `Failed to load payslips: ${error.message}` })
    return
  }
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
      '*, employees(full_name, employee_code, nic_number, epf_no, email, mobile, bank_name, bank_branch, bank_account_name, bank_account_number, account_number, bank_code)',
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
  paidDate.value = localYmd()
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
    // post_payroll_to_finance_v2 expects a finance_accounts id (same source the
    // Finance voucher pages use) — never chart_of_accounts ids.
    const { data, error } = await supabase
      .from('finance_accounts')
      .select(
        'id, registered_name, bank_name, account_type, account_number, current_balance, ledger_id, is_default',
      )
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('registered_name')
    if (error) throw error
    financeAccounts.value = data || []
  } catch (err) {
    $q.notify({ type: 'negative', message: `Could not load finance accounts: ${err.message}` })
  } finally {
    loadingAccounts.value = false
  }
}

// PostgREST / Postgres codes meaning "function does not exist" — the only case
// where falling back to the legacy posting RPC is safe (no double-post risk).
const isMissingRpcError = (err) =>
  !!err &&
  (err.code === 'PGRST202' ||
    err.code === '42883' ||
    /could not find the function/i.test(err.message || ''))

async function confirmPostToFinance() {
  const f = postFinanceForm
  if (!f.cash_bank_acc) {
    $q.notify({ type: 'warning', message: 'Please select a Cash/Bank account to transfer from.' })
    return
  }

  if (!selectedRun.value) return
  postingFinance.value = true
  try {
    // 1. fn_post_payroll_run (#146) → post_payroll_to_finance_v2 (#129): GL legs
    //    dated on the run's period end, held slips skipped.
    const { data: res, error: rpcErr } = await supabase.rpc('fn_post_payroll_run', {
      p_payroll_run_id: selectedRun.value.id,
      p_cash_bank_account_id: f.cash_bank_acc,
      p_payment_method: f.payment_method,
      p_posting_date: null,
    })

    if (!rpcErr) {
      if (res && res.success === false) {
        // Older v2 builds report failures in the payload — surface, never fall back.
        throw new Error(res.error || 'Posting to Finance failed.')
      }
      const remaining = Number(res?.slips_remaining || 0)
      $q.notify({
        type: 'positive',
        icon: 'account_balance',
        message:
          remaining > 0
            ? `Payroll posted to Finance (${res?.slips_paid ?? 0} payslip(s) marked PAID). ${remaining} held/unposted payslip(s) remain — post again after releasing them.`
            : `Payroll posted to Finance! Ledgers, Cashbook & Journal updated, payslips marked PAID.`,
        timeout: 5000,
      })
      showPostFinanceDialog.value = false
      showPayslips.value = false
      await loadRuns()
      return
    }

    // Any real v2 error (validation, imbalance, missing ledger, already posted…)
    // must be shown — falling back to the legacy RPC here could double-post.
    if (!isMissingRpcError(rpcErr)) throw rpcErr

    // v2 (#129, wrapped by #146 fn_post_payroll_run) is the only GL posting
    // path. The legacy post_payroll_to_finance wrote an unbalanced journal on
    // the old chart of accounts and must never be used as a fallback.
    throw new Error('Payroll GL posting is not deployed — apply supabase/finance_data_fixes_146.sql (and #129).')
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || String(err), multiLine: true })
  } finally {
    postingFinance.value = false
  }
}

async function refreshPayslips() {
  if (!selectedRun.value) return
  const { data } = await supabase
    .from('payslips')
    .select(
      '*, employees(full_name, employee_code, nic_number, epf_no, email, mobile, bank_name, bank_branch, bank_account_name, bank_account_number, account_number, bank_code)',
    )
    .eq('payroll_run_id', selectedRun.value.id)
    .order('net_salary', { ascending: false })
  payslips.value = data || []
}

// ── Post Split Group (Option B) ──────────────────────────────────────────────
async function postSplitGroupToFinance(group) {
  const accountId = groupPayingAccounts[group.key]
  if (!accountId) {
    $q.notify({
      type: 'warning',
      message: `Please select a paying Cash/Bank account for ${group.bankName}`,
    })
    return
  }
  if (!selectedRun.value) return

  postingGroupId.value = group.key
  try {
    const targetSlipIds = group.employees.map((p) => p.id)

    // Identify other unposted payslips in this run that are NOT in this group
    const otherUnpostedSlips = payslips.value.filter(
      (p) =>
        !targetSlipIds.includes(p.id) &&
        !p.finance_posted_at &&
        p.payment_status !== 'paid' &&
        !p.is_held,
    )

    if (otherUnpostedSlips.length > 0) {
      const otherIds = otherUnpostedSlips.map((p) => p.id)
      const { error: holdErr } = await supabase
        .from('payslips')
        .update({ is_held: true, hold_reason: '__temp_split_hold__' })
        .in('id', otherIds)
      if (holdErr) throw holdErr
    }

    // Ensure target slips are not held
    await supabase
      .from('payslips')
      .update({ is_held: false, hold_reason: null })
      .in('id', targetSlipIds)

    const paymentMethod = group.isCash ? 'cash' : 'bank_transfer'

    const { data: res, error: rpcErr } = await supabase.rpc('fn_post_payroll_run', {
      p_payroll_run_id: selectedRun.value.id,
      p_cash_bank_account_id: accountId,
      p_payment_method: paymentMethod,
      p_posting_date: null,
    })

    // Release temporary holds
    if (otherUnpostedSlips.length > 0) {
      const otherIds = otherUnpostedSlips.map((p) => p.id)
      await supabase
        .from('payslips')
        .update({ is_held: false, hold_reason: null })
        .in('id', otherIds)
        .eq('hold_reason', '__temp_split_hold__')
    }

    if (rpcErr) throw rpcErr
    if (res && res.success === false) {
      throw new Error(res.error || 'Posting failed.')
    }

    $q.notify({
      type: 'positive',
      icon: 'account_balance',
      message: `Posted ${group.bankName} (${group.employees.length} employees — LKR ${fmt(group.totalNet)}) to Finance!`,
      timeout: 5000,
    })

    // Refresh payslips and accounts
    await refreshPayslips()
    await loadAccounts()
    await loadRuns()

    const remaining = payslips.value.filter(
      (p) => !p.is_held && !p.finance_posted_at && p.payment_status !== 'paid',
    )
    if (remaining.length === 0) {
      $q.notify({
        type: 'positive',
        icon: 'verified',
        message: 'All salary groups in this run have been posted to Finance! Payroll status is now PAID.',
        timeout: 6000,
      })
    }
  } catch (err) {
    try {
      await supabase
        .from('payslips')
        .update({ is_held: false, hold_reason: null })
        .eq('payroll_run_id', selectedRun.value.id)
        .eq('hold_reason', '__temp_split_hold__')
    } catch {
      // ignore
    }
    $q.notify({ type: 'negative', message: err.message || String(err), multiLine: true })
  } finally {
    postingGroupId.value = null
  }
}

// ── Post Custom Selected Slips (Option B) ────────────────────────────────────
async function postCustomSelectedToFinance() {
  if (!customPayingAccountId.value) {
    $q.notify({ type: 'warning', message: 'Please select a Cash/Bank account to transfer from.' })
    return
  }
  if (!selectedCustomSlips.value.length) {
    $q.notify({ type: 'warning', message: 'Please select at least one employee to post.' })
    return
  }
  if (!selectedRun.value) return

  postingCustom.value = true
  try {
    const targetSlipIds = selectedCustomSlips.value.map((p) => p.id)
    const otherUnpostedSlips = payslips.value.filter(
      (p) =>
        !targetSlipIds.includes(p.id) &&
        !p.finance_posted_at &&
        p.payment_status !== 'paid' &&
        !p.is_held,
    )

    if (otherUnpostedSlips.length > 0) {
      const otherIds = otherUnpostedSlips.map((p) => p.id)
      await supabase
        .from('payslips')
        .update({ is_held: true, hold_reason: '__temp_split_hold__' })
        .in('id', otherIds)
    }

    await supabase
      .from('payslips')
      .update({ is_held: false, hold_reason: null })
      .in('id', targetSlipIds)

    const { data: res, error: rpcErr } = await supabase.rpc('fn_post_payroll_run', {
      p_payroll_run_id: selectedRun.value.id,
      p_cash_bank_account_id: customPayingAccountId.value,
      p_payment_method: customPaymentMethod.value,
      p_posting_date: null,
    })

    if (otherUnpostedSlips.length > 0) {
      const otherIds = otherUnpostedSlips.map((p) => p.id)
      await supabase
        .from('payslips')
        .update({ is_held: false, hold_reason: null })
        .in('id', otherIds)
        .eq('hold_reason', '__temp_split_hold__')
    }

    if (rpcErr) throw rpcErr
    if (res && res.success === false) throw new Error(res.error || 'Posting failed.')

    $q.notify({
      type: 'positive',
      icon: 'account_balance',
      message: `Posted ${selectedCustomSlips.value.length} selected employees to Finance!`,
      timeout: 5000,
    })

    selectedCustomSlips.value = []
    await refreshPayslips()
    await loadAccounts()
    await loadRuns()
  } catch (err) {
    try {
      await supabase
        .from('payslips')
        .update({ is_held: false, hold_reason: null })
        .eq('payroll_run_id', selectedRun.value.id)
        .eq('hold_reason', '__temp_split_hold__')
    } catch {
      // ignore
    }
    $q.notify({ type: 'negative', message: err.message || String(err), multiLine: true })
  } finally {
    postingCustom.value = false
  }
}

// ── Cumulative EPF & ETF Functions ───────────────────────────────────────────
async function openCumulativeEpfSummary() {
  showCumulativeEpfDialog.value = true
  cumulativeLoading.value = true
  try {
    const { data, error } = await supabase
      .from('payslips')
      .select(`
        id,
        basic_salary,
        epf_employee,
        epf_employer,
        etf_employer,
        gross_salary,
        net_salary,
        created_at,
        payroll_runs (
          id,
          period_start,
          period_end,
          status
        ),
        employees (
          id,
          employee_code,
          full_name,
          first_name,
          last_name,
          nic_number,
          epf_no,
          hire_date,
          departments (name),
          designations (title)
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    cumulativeRawData.value = data || []
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to load EPF data: ' + err.message })
  } finally {
    cumulativeLoading.value = false
  }
}

function openSingleEmpHistory(emp) {
  selectedEmpHistory.value = emp
  showEmpHistoryDialog.value = true
}

function exportCumulativeEpfExcel() {
  const list = filteredCumulativeEmployees.value
  if (!list.length) {
    $q.notify({ type: 'warning', message: 'No EPF records to export.' })
    return
  }

  const rows = list.map((e, idx) => ({
    '#': idx + 1,
    'Employee Code': e.code,
    'EPF Member No': e.epfNo,
    'NIC Number': e.nic,
    'Employee Name': e.name,
    'Department': e.department,
    'Designation': e.designation,
    'Months Paid': e.monthsCount,
    'Cumulative Basic (LKR)': e.totalBasic,
    'Employee EPF 8% (LKR)': e.totalEpf8,
    'Employer EPF 12% (LKR)': e.totalEpf12,
    'Total EPF 20% (LKR)': e.totalEpf20,
    'Employer ETF 3% (LKR)': e.totalEtf3,
    'Grand Statutory Total 23% (LKR)': e.total23,
  }))

  rows.push({
    '#': 'TOTAL',
    'Employee Code': '',
    'EPF Member No': '',
    'NIC Number': '',
    'Employee Name': `${list.length} Employees`,
    'Department': '',
    'Designation': '',
    'Months Paid': '',
    'Cumulative Basic (LKR)': cumulativeGrandTotals.value.totalBasic,
    'Employee EPF 8% (LKR)': cumulativeGrandTotals.value.totalEpf8,
    'Employer EPF 12% (LKR)': cumulativeGrandTotals.value.totalEpf12,
    'Total EPF 20% (LKR)': cumulativeGrandTotals.value.totalEpf20,
    'Employer ETF 3% (LKR)': cumulativeGrandTotals.value.totalEtf3,
    'Grand Statutory Total 23% (LKR)': cumulativeGrandTotals.value.total23,
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cumulative_EPF_Summary')
  const fileName = `Seven_Waves_Employee_Cumulative_EPF_Summary_${localYmd()}.xlsx`
  XLSX.writeFile(wb, fileName)
  $q.notify({ type: 'positive', message: 'Cumulative EPF Excel report exported successfully!' })
}

function exportCumulativeEpfPdf() {
  const list = filteredCumulativeEmployees.value
  if (!list.length) {
    $q.notify({ type: 'warning', message: 'No EPF records to export.' })
    return
  }

  const doc = new jsPDF('l', 'mm', 'a4')

  doc.setFontSize(14)
  doc.setTextColor(0, 105, 92)
  doc.text('SEVEN WAVES RESTAURANT (PVT) LTD — EMPLOYEE CUMULATIVE EPF & ETF SUMMARY', 14, 14)

  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text(
    `Scope: ${cumulativeYearFilter.value} | Total Employees: ${list.length} | Generated: ${new Date().toLocaleDateString()}`,
    14,
    20,
  )

  const head = [
    [
      '#',
      'Code',
      'EPF No',
      'NIC',
      'Employee Name',
      'Department',
      'Mths',
      'Basic Salary',
      'EPF 8% (Emp)',
      'EPF 12% (Empr)',
      'Total EPF 20%',
      'ETF 3% (Empr)',
      'Total (23%)',
    ],
  ]

  const body = list.map((e, idx) => [
    idx + 1,
    e.code,
    e.epfNo,
    e.nic,
    e.name,
    e.department,
    e.monthsCount,
    fmt(e.totalBasic),
    fmt(e.totalEpf8),
    fmt(e.totalEpf12),
    fmt(e.totalEpf20),
    fmt(e.totalEtf3),
    fmt(e.total23),
  ])

  const foot = [
    [
      'TOTAL',
      '',
      '',
      '',
      `${list.length} Staff`,
      '',
      '',
      fmt(cumulativeGrandTotals.value.totalBasic),
      fmt(cumulativeGrandTotals.value.totalEpf8),
      fmt(cumulativeGrandTotals.value.totalEpf12),
      fmt(cumulativeGrandTotals.value.totalEpf20),
      fmt(cumulativeGrandTotals.value.totalEtf3),
      fmt(cumulativeGrandTotals.value.total23),
    ],
  ]

  autoTable(doc, {
    startY: 24,
    head,
    body,
    foot,
    theme: 'grid',
    headStyles: { fillColor: [0, 121, 107], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [224, 242, 241], textColor: [0, 77, 64], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    styles: { cellPadding: 1.5, overflow: 'linebreak' },
  })

  doc.save(`Seven_Waves_Cumulative_EPF_Summary_${localYmd()}.pdf`)
  $q.notify({ type: 'positive', message: 'Cumulative EPF PDF report exported successfully!' })
}

function exportIndividualEmployeePdf(emp) {
  if (!emp) return
  const doc = new jsPDF('p', 'mm', 'a4')

  // Header Letterhead
  doc.setFontSize(16)
  doc.setTextColor(0, 105, 92)
  doc.setFont('helvetica', 'bold')
  doc.text('SEVEN WAVES (PVT) LTD', 105, 18, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80)
  doc.text('Seven Waves Food Court, Beach Road, Sri Lanka', 105, 23, { align: 'center' })

  doc.setLineWidth(0.5)
  doc.setDrawColor(0, 121, 107)
  doc.line(14, 27, 196, 27)

  // Document Title
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(33, 33, 33)
  doc.text('EMPLOYEE STATUTORY EPF & ETF CONTRIBUTION STATEMENT', 105, 34, { align: 'center' })

  // Employee Meta Box
  doc.setFillColor(245, 247, 250)
  doc.roundedRect(14, 38, 182, 32, 2, 2, 'F')
  doc.setDrawColor(210, 215, 225)
  doc.roundedRect(14, 38, 182, 32, 2, 2, 'D')

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(50)
  doc.text('Employee Name:', 18, 45)
  doc.text('Employee Code:', 18, 52)
  doc.text('NIC Number:', 18, 59)
  doc.text('EPF Member No:', 18, 66)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0)
  doc.text(emp.name || '—', 48, 45)
  doc.text(emp.code || '—', 48, 52)
  doc.text(emp.nic || '—', 48, 59)
  doc.text(emp.epfNo || '—', 48, 66)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(50)
  doc.text('Department:', 115, 45)
  doc.text('Designation:', 115, 52)
  doc.text('Date Appointed:', 115, 59)
  doc.text('Date of Statement:', 115, 66)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0)
  doc.text(emp.department || '—', 145, 45)
  doc.text(emp.designation || '—', 145, 52)
  doc.text(emp.hireDate || '—', 145, 59)
  doc.text(new Date().toLocaleDateString(), 145, 66)

  // Cumulative Summary Box
  doc.setFillColor(232, 245, 233)
  doc.roundedRect(14, 73, 182, 18, 2, 2, 'F')
  doc.setDrawColor(165, 214, 167)
  doc.roundedRect(14, 73, 182, 18, 2, 2, 'D')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(46, 125, 50)
  doc.text(`Total Months: ${emp.monthsCount}`, 18, 80)
  doc.text(`Emp EPF (8%): LKR ${fmt(emp.totalEpf8)}`, 55, 80)
  doc.text(`Empr EPF (12%): LKR ${fmt(emp.totalEpf12)}`, 110, 80)
  doc.text(`Total EPF (20%): LKR ${fmt(emp.totalEpf20)}`, 18, 86)
  doc.text(`Empr ETF (3%): LKR ${fmt(emp.totalEtf3)}`, 75, 86)
  doc.text(`Grand Remittance (23%): LKR ${fmt(emp.total23)}`, 130, 86)

  // Monthly Table
  const head = [
    ['#', 'Period Start', 'Period End', 'Basic (LKR)', 'EPF 8%', 'EPF 12%', 'Total 20%', 'ETF 3%', 'Total 23%'],
  ]
  const body = (emp.history || []).map((h, i) => [
    i + 1,
    h.periodStart,
    h.periodEnd,
    fmt(h.basic),
    fmt(h.epf8),
    fmt(h.epf12),
    fmt(h.epf20),
    fmt(h.etf3),
    fmt(h.total23),
  ])

  const foot = [
    [
      'TOTAL',
      '',
      `${emp.monthsCount} Months`,
      fmt(emp.totalBasic),
      fmt(emp.totalEpf8),
      fmt(emp.totalEpf12),
      fmt(emp.totalEpf20),
      fmt(emp.totalEtf3),
      fmt(emp.total23),
    ],
  ]

  autoTable(doc, {
    startY: 94,
    head,
    body,
    foot,
    theme: 'grid',
    headStyles: { fillColor: [0, 121, 107], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [224, 242, 241], textColor: [0, 77, 64], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    styles: { cellPadding: 1.5, overflow: 'linebreak' },
  })

  const finalY = doc.lastAutoTable?.finalY || 200

  // Signatures
  const sigY = Math.min(finalY + 25, 270)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80)

  doc.line(25, sigY, 75, sigY)
  doc.text('Prepared by: HR Department', 25, sigY + 5)

  doc.line(135, sigY, 185, sigY)
  doc.text('Certified by: Head of Finance', 135, sigY + 5)

  doc.save(`EPF_Statement_${emp.code}_${emp.name.replace(/\s+/g, '_')}.pdf`)
  $q.notify({ type: 'positive', message: `EPF Statement downloaded for ${emp.name}` })
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
  await new Promise((r) => setTimeout(r, 40))

  const el = document.getElementById('payslip-print-view')
  if (!el) throw new Error('Payslip template element not found')

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const imgData = canvas.toDataURL('image/jpeg', 0.85)
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

async function sendPayslipWhatsApp(payslip) {
  if (!payslip || sendingWhatsAppId.value) return
  sendingWhatsAppId.value = payslip.id
  const empName = payslip.employees?.full_name || payslip.employees?.employee_code || 'Employee'
  let rawMobile = payslip.employees?.mobile
  if (!rawMobile) {
    const inputMobile = await new Promise((resolve) => {
      $q.dialog({
        title: 'Enter WhatsApp Number',
        message: `No mobile number found on file for ${empName}. Please enter employee's WhatsApp number:`,
        prompt: {
          model: '',
          type: 'tel',
          placeholder: 'e.g. 0717266563 or 0771234567',
        },
        cancel: true,
        persistent: true,
      })
        .onOk((val) => resolve(val ? val.trim() : null))
        .onCancel(() => resolve(null))
    })
    if (!inputMobile) return
    rawMobile = inputMobile
  }

  // Format clean Sri Lankan phone number (e.g. 0771234567 -> 94771234567)
  let cleanPhone = String(rawMobile).replace(/[^0-9]/g, '')
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '94' + cleanPhone.substring(1)
  }
  if (!cleanPhone.startsWith('94') && cleanPhone.length === 9) {
    cleanPhone = '94' + cleanPhone
  }

  // ── 1. Check if WhatsApp Gateway Bridge is running & connected ─────────
  if (!bridgeStatus.connected) {
    await checkBridgeStatus()
  }
  const bridgeConnected = !!bridgeStatus.connected

  // ── 2. If Bridge is connected, dispatch ACTUAL PDF DOCUMENT FILE! ──────
  if (bridgeConnected) {
    $q.loading.show({
      message: `Generating official PDF and dispatching to ${empName}'s WhatsApp (+${cleanPhone})...`,
    })
    try {
      const { base64, filename } = await generatePayslipPdfDoc(payslip)
      const caption = `🌟 *SEVEN WAVES RESTAURANT (PVT) LTD*\n📄 *OFFICIAL MONTHLY PAYSLIP*\n━━━━━━━━━━━━━━━━━━━━━\n👤 *Employee:* ${empName}\n📅 *Period:* ${selectedRun.value?.period_start || ''} to ${selectedRun.value?.period_end || ''}\n💰 *Net Salary:* LKR ${fmt(payslip.net_salary)}\n━━━━━━━━━━━━━━━━━━━━━\n_Please find attached your confidential salary payslip PDF._`

      let sent = false
      // Attempt 1: Direct Localhost dispatch (if browser is on local network without HTTPS blocks)
      try {
        const resp = await fetch('http://localhost:3005/send-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: cleanPhone,
            pdfBase64: base64,
            filename: filename,
            caption: caption,
          }),
          signal: AbortSignal.timeout(12000),
        })
        const result = await resp.json()
        if (result.success) sent = true
      } catch {
        sent = false
      }

      // Attempt 2: Cloud Outbox Queue (100% reliable across HTTPS and network boundaries)
      if (!sent) {
        await queueCloudPdf(cleanPhone, base64, filename, caption)
        sent = true
      }

      $q.notify({
        type: 'positive',
        icon: 'chat',
        message: `✅ Payslip PDF file successfully dispatched to ${empName}'s WhatsApp (+${cleanPhone})!`,
        timeout: 6000,
      })
      return
    } catch (dispatchErr) {
      console.warn('Bridge send error:', dispatchErr)
      $q.notify({
        type: 'negative',
        message: `Bridge dispatch failed: ${dispatchErr.message}`,
      })
      return
    } finally {
      sendingWhatsAppId.value = null
      $q.loading.hide()
    }
  }

  // ── 3. Fallback: If Gateway is offline, ask user if they want to open WhatsApp Web ───
  $q.dialog({
    title: 'WhatsApp Gateway Offline',
    message: `WhatsApp Gateway is currently not connected. Would you like to open WhatsApp Web to send a text summary, or connect the WhatsApp Gateway from the top toolbar?`,
    ok: { label: 'Open WhatsApp Web', color: 'green-8', noCaps: true },
    cancel: { label: 'Cancel', flat: true },
  }).onOk(() => {
    const periodStr = `${selectedRun.value?.period_start || 'Period Start'} to ${selectedRun.value?.period_end || 'Period End'}`
    const empCode = payslip.employees?.employee_code || '—'
    const basic = fmt(payslip.basic_salary)
    const allowances = fmt(payslip.total_allowances)
    const ot = fmt(Number(payslip.normal_ot_amount || 0) + Number(payslip.holiday_ot_amount || 0))
    const gross = fmt(payslip.gross_salary)
    const epf8 = fmt(payslip.epf_employee)
    const advance = fmt(payslip.advance_deduction)
    const otherDed = fmt(
      Number(payslip.loan_deduction || 0) +
        Number(payslip.welfare_deduction || 0) +
        Number(payslip.other_deductions || 0),
    )
    const totDed = fmt(payslip.total_deductions)
    const net = fmt(payslip.net_salary)
    const payMethod = payslip.payment_method
      ? String(payslip.payment_method).replace('_', ' ').toUpperCase()
      : 'BANK TRANSFER'
    const bankName = payslip.employees?.bank_name || ''
    const accNo = payslip.employees?.bank_account_number || payslip.employees?.account_number || ''
    const bankInfo = bankName ? `${bankName} (${accNo})` : 'Direct Transfer'

    const message =
`🌟 *SEVEN WAVES RESTAURANT (PVT) LTD*
📄 *MONTHLY SALARY PAYSLIP ADVICE*
━━━━━━━━━━━━━━━━━━━━━
👤 *Employee:* ${empName} (${empCode})
📅 *Period:* ${periodStr}

💵 *EARNINGS:*
  • Basic Salary: LKR ${basic}
  • Allowances: LKR ${allowances}
  • Overtime (OT): LKR ${ot}
  ⭐ *Gross Salary: LKR ${gross}*

📉 *DEDUCTIONS:*
  • Employee EPF (8%): LKR ${epf8}
  • Salary Advance: LKR ${advance}
  • Other Deductions / Loans: LKR ${otherDed}
  🔻 *Total Deductions: LKR ${totDed}*

━━━━━━━━━━━━━━━━━━━━━
💰 *NET SALARY PAYABLE: LKR ${net}*
🏦 *Payment Method:* ${payMethod} ${bankName ? '— ' + bankInfo : ''}
━━━━━━━━━━━━━━━━━━━━━
_This is an official confidential salary advice from Seven Waves HR._`

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    window.open(waUrl, '_blank')
    $q.notify({
      type: 'positive',
      icon: 'chat',
      message: `Opening WhatsApp chat for ${empName} (+${cleanPhone})...`,
      timeout: 4000,
    })
  })
}

watch(statusFilter, () => loadRuns())
watch(
  () => authStore.currentBranch?.id,
  (id, prev) => {
    if (id && id !== prev) loadRuns()
  },
)
onMounted(() => {
  loadRuns()
  checkBridgeStatus()
})
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
