<template>
  <q-page class="q-pa-md ai-insights-page">

    <!-- ── PAGE HEADER ──────────────────────────────────────────────────── -->
    <div class="row items-center q-mb-lg">
      <q-btn flat round icon="arrow_back" @click="router.back()" />
      <div class="q-ml-sm">
        <div class="text-h5 text-weight-bold">AI System Audit</div>
        <div class="text-caption text-grey-6">Department-wise business health scan · Gemini AI</div>
      </div>
      <q-space />
      <div class="row q-gutter-sm">
        <q-btn
          v-if="!scanning && systemAuditData && activeTab === 'audit'"
          outline color="secondary"
          icon="picture_as_pdf"
          label="Download PDF"
          @click="downloadPdf"
        />
        <q-btn
          outline color="primary"
          icon="summarize"
          label="EOD Report"
          @click="activeTab = 'eod'"
        />
        <q-btn
          color="primary"
          icon="auto_awesome"
          label="Run System Audit"
          unelevated
          :loading="aiStore.loading.systemAudit"
          :disable="aiStore.isAiUnavailable"
          @click="runSystemAudit"
        />
      </div>
    </div>

    <!-- AI unavailable banner -->
    <q-banner v-if="aiStore.isAiUnavailable" rounded class="bg-orange-1 text-orange-9 q-mb-md">
      <template #avatar><q-icon name="warning" color="orange" /></template>
      AI service unavailable. Check that <strong>GEMINI_API_KEY</strong> is set in Supabase Edge Function Secrets.
    </q-banner>

    <!-- ── KPI SUMMARY ROW ───────────────────────────────────────────────── -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-6 col-md-3">
        <q-card flat bordered class="kpi-card text-center q-pa-md">
          <q-skeleton v-if="aiStore.loading.dashboard" type="QAvatar" size="28px" class="q-mx-auto" />
          <q-icon v-else name="bug_report" size="28px" :color="kpiIssues > 0 ? 'negative' : 'positive'" />
          <div class="text-h5 text-weight-bold q-mt-xs" :class="kpiIssues > 0 ? 'text-negative' : 'text-positive'">
            <q-skeleton v-if="aiStore.loading.dashboard" type="text" width="40px" class="q-mx-auto" />
            <template v-else>{{ kpiIssues }}</template>
          </div>
          <div class="text-caption text-grey-5">Issues Found</div>
        </q-card>
      </div>
      <div class="col-6 col-md-3">
        <q-card flat bordered class="kpi-card text-center q-pa-md">
          <q-skeleton v-if="aiStore.loading.dashboard" type="QAvatar" size="28px" class="q-mx-auto" />
          <q-icon v-else name="priority_high" size="28px" :color="kpiCritical > 0 ? 'deep-orange' : 'positive'" />
          <div class="text-h5 text-weight-bold q-mt-xs" :class="kpiCritical > 0 ? 'text-deep-orange' : 'text-positive'">
            <q-skeleton v-if="aiStore.loading.dashboard" type="text" width="40px" class="q-mx-auto" />
            <template v-else>{{ kpiCritical }}</template>
          </div>
          <div class="text-caption text-grey-5">Critical / High</div>
        </q-card>
      </div>
      <div class="col-6 col-md-3">
        <q-card flat bordered class="kpi-card text-center q-pa-md">
          <q-icon name="domain_verification" size="28px" color="primary" />
          <div class="text-h5 text-weight-bold q-mt-xs text-primary">
            {{ deptDepartments.length || 0 }}
          </div>
          <div class="text-caption text-grey-5">Departments Checked</div>
        </q-card>
      </div>
      <div class="col-6 col-md-3">
        <q-card flat bordered class="kpi-card text-center q-pa-md">
          <q-icon name="schedule" size="28px" color="grey-5" />
          <div class="text-h5 text-weight-bold q-mt-xs text-grey-6" style="font-size: 16px !important">
            {{ lastScanLabel }}
          </div>
          <div class="text-caption text-grey-5">Last Audit</div>
        </q-card>
      </div>
    </div>

    <!-- ── TAB NAVIGATION ───────────────────────────────────────────────── -->
    <q-tabs v-model="activeTab" align="left" narrow-indicator active-color="primary" indicator-color="primary" class="q-mb-none">
      <q-tab name="audit" icon="security" label="Live Audit" />
      <q-tab name="eod" icon="summarize" label="EOD Report" />
      <q-tab name="history" icon="history" label="Insights History" />
    </q-tabs>
    <q-separator class="q-mb-md" />

    <q-tab-panels v-model="activeTab" animated>

      <!-- ══════════════════════════════════════════════════════════════════
           TAB 1 — LIVE AUDIT
      ═══════════════════════════════════════════════════════════════════ -->
      <q-tab-panel name="audit" class="q-pa-none">

        <!-- Scan log (terminal) -->
        <q-card v-if="scanning || scanLog.length" flat bordered class="q-mb-md audit-log-card">
          <q-card-section class="q-py-sm row items-center">
            <q-icon name="terminal" size="18px" color="primary" class="q-mr-xs" />
            <span class="text-caption text-weight-bold text-grey-4">Audit Log</span>
            <q-space />
            <q-spinner v-if="scanning" color="primary" size="16px" />
          </q-card-section>
          <q-separator />
          <div class="audit-log q-pa-sm">
            <div
              v-for="(entry, i) in scanLog"
              :key="i"
              class="audit-log__line text-caption"
              :class="logLineClass(entry.type)"
            >
              <span class="audit-log__time text-grey-6">{{ entry.time }}</span>
              <span class="q-ml-sm">{{ entry.message }}</span>
            </div>
          </div>
        </q-card>

        <!-- Empty state (no scan yet) -->
        <q-card
          v-if="!scanning && !deptDepartments.length"
          flat bordered
          class="text-center q-pa-xl empty-state"
        >
          <q-icon name="security" size="64px" color="primary" class="q-mb-md" />
          <div class="text-h6 text-weight-bold q-mb-sm">No Audit Data Yet</div>
          <div class="text-body2 text-grey-6 q-mb-lg">
            Run a system audit to get a department-wise health check across Finance, Operations, HR, and CRM.
          </div>
          <q-btn
            color="primary"
            icon="auto_awesome"
            label="Run System Audit"
            unelevated
            :loading="aiStore.loading.systemAudit"
            :disable="aiStore.isAiUnavailable"
            @click="runSystemAudit"
          />
        </q-card>

        <!-- Overall health banner (post-scan) -->
        <div ref="auditReportRef">
          <div v-if="!scanning && systemAuditData" class="q-mb-md row items-center q-gutter-sm">
          <q-badge
            :color="healthColor(systemAuditData.overall_health)"
            :label="'Overall: ' + (systemAuditData.overall_health || 'unknown').toUpperCase()"
            class="text-subtitle2 q-pa-sm"
          />
          <span class="text-body2 text-grey-5">Score: {{ systemAuditData.overall_score }}/100</span>
          <span class="text-body2 text-grey-6 ellipsis">{{ systemAuditData.summary }}</span>
        </div>

        <!-- Department cards -->
        <template v-if="!scanning && deptDepartments.length">
          <q-card
            v-for="dept in deptDepartments"
            :key="dept.name"
            flat bordered
            class="q-mb-md dept-card"
            :class="`dept-card--${dept.status}`"
          >
            <q-card-section class="dept-card__header row items-center q-py-sm">
              <q-icon :name="deptIcon(dept.name)" size="24px" :color="statusColor(dept.status)" class="q-mr-sm" />
              <div class="text-subtitle1 text-weight-bold">{{ dept.name }}</div>
              <q-space />
              <q-badge :color="statusColor(dept.status)" :label="(dept.status || 'info').toUpperCase()" />
              <div class="text-caption text-grey-6 q-ml-md">Score: {{ dept.score }}/100</div>
            </q-card-section>
            <q-separator />
            <q-card-section class="q-pt-sm">
              <div
                v-for="(finding, fi) in dept.findings"
                :key="fi"
                class="finding-row"
                :class="{ 'q-mb-sm': fi < dept.findings.length - 1 }"
              >
                <div class="row items-start q-gutter-sm">
                  <q-icon
                    :name="severityIcon(finding.severity)"
                    :color="severityColor(finding.severity)"
                    size="18px"
                    class="q-mt-xs"
                  />
                  <div class="col">
                    <div class="text-body2 text-weight-medium">{{ finding.title }}</div>
                    <div class="text-caption text-grey-6">{{ finding.detail }}</div>
                    <div v-if="finding.action" class="text-caption text-primary q-mt-xs">
                      → {{ finding.action }}
                    </div>
                  </div>
                  <q-badge :color="severityColor(finding.severity)" :label="finding.severity" outline />
                </div>
              </div>
              <div v-if="!dept.findings?.length" class="text-caption text-positive row items-center q-gutter-xs">
                <q-icon name="check_circle" />
                <span>No issues found in this department</span>
              </div>
            </q-card-section>
          </q-card>

          <!-- Top Actions + Commendations -->
          <div class="row q-col-gutter-md q-mt-sm">
            <div v-if="systemAuditData?.top_actions?.length" class="col-12 col-md-6">
              <q-card flat bordered class="full-height">
                <q-card-section class="q-pb-xs">
                  <div class="text-subtitle2 text-weight-bold row items-center q-gutter-xs">
                    <q-icon name="task_alt" color="negative" />
                    <span>Actions Required</span>
                  </div>
                </q-card-section>
                <q-card-section class="q-pt-xs">
                  <div v-for="(action, ai) in systemAuditData.top_actions" :key="ai" class="row items-start q-mb-xs q-gutter-xs">
                    <q-icon name="arrow_right" color="negative" size="16px" class="q-mt-xs" />
                    <span class="text-body2 col">{{ action }}</span>
                  </div>
                </q-card-section>
              </q-card>
            </div>
            <div v-if="systemAuditData?.commendations?.length" class="col-12 col-md-6">
              <q-card flat bordered class="full-height">
                <q-card-section class="q-pb-xs">
                  <div class="text-subtitle2 text-weight-bold row items-center q-gutter-xs">
                    <q-icon name="emoji_events" color="positive" />
                    <span>What Went Well</span>
                  </div>
                </q-card-section>
                <q-card-section class="q-pt-xs">
                  <div v-for="(com, ci) in systemAuditData.commendations" :key="ci" class="row items-start q-mb-xs q-gutter-xs">
                    <q-icon name="check_circle" color="positive" size="16px" class="q-mt-xs" />
                    <span class="text-body2 col">{{ com }}</span>
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>
        </template>
        </div><!-- /auditReportRef -->
      </q-tab-panel>

      <!-- ══════════════════════════════════════════════════════════════════
           TAB 2 — EOD REPORT
      ═══════════════════════════════════════════════════════════════════ -->
      <q-tab-panel name="eod" class="q-pa-none">
        <div class="row q-col-gutter-md">

          <!-- Main content -->
          <div class="col-12 col-md-9">

            <!-- Controls row -->
            <div class="row q-col-gutter-sm items-end q-mb-md">
              <div class="col-12 col-sm-4">
                <q-input
                  v-model="reportDate"
                  type="date"
                  label="Report Date"
                  outlined dense
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-select
                  v-model="selectedBranchId"
                  :options="branchOptions"
                  option-value="id"
                  option-label="name"
                  emit-value map-options
                  label="Branch"
                  outlined dense
                />
              </div>
              <div class="col-12 col-sm-4">
                <q-btn
                  color="primary"
                  icon="auto_awesome"
                  label="Generate EOD Report"
                  unelevated class="full-width"
                  :loading="aiStore.loading.eodReport"
                  :disable="aiStore.isAiUnavailable"
                  @click="generateEodReport"
                />
              </div>
            </div>

            <!-- Loading skeleton -->
            <template v-if="aiStore.loading.reports">
              <q-skeleton type="rect" height="120px" class="q-mb-md rounded-borders" />
              <div class="row q-col-gutter-md q-mb-md">
                <div v-for="n in 4" :key="n" class="col-6 col-md-3">
                  <q-skeleton type="rect" height="90px" class="rounded-borders" />
                </div>
              </div>
            </template>

            <!-- Report exists -->
            <template v-else-if="currentReport">
              <!-- Report header card -->
              <q-card flat bordered class="q-mb-md">
                <q-card-section class="row items-center">
                  <div>
                    <div class="text-h6 text-weight-bold">End of Day Report</div>
                    <div class="text-caption text-grey-6">
                      {{ currentReport.report_date }} ·
                      {{ currentReport.generated_by === 'auto' ? 'Auto-generated' : 'Manual' }}
                    </div>
                  </div>
                  <q-space />
                  <q-badge
                    v-if="currentReport.performance_rating"
                    :color="ratingColor(currentReport.performance_rating)"
                    :label="currentReport.performance_rating.replace('_', ' ').toUpperCase()"
                    class="q-pa-sm text-weight-bold"
                  />
                  <q-btn flat round icon="print" class="q-ml-md" @click="printReport" />
                  <q-btn flat round icon="download" class="q-ml-xs" @click="exportReport" />
                </q-card-section>
              </q-card>

              <!-- Financial summary -->
              <div class="row q-col-gutter-md q-mb-md">
                <div class="col-6 col-md-3">
                  <q-card flat bordered class="kpi-card q-pa-md text-center">
                    <q-icon name="trending_up" size="24px" color="positive" />
                    <div class="text-h6 text-weight-bold text-positive q-mt-xs">
                      {{ formatCurrency(currentReport.total_revenue) }}
                    </div>
                    <div class="text-caption text-grey-5">Revenue</div>
                  </q-card>
                </div>
                <div class="col-6 col-md-3">
                  <q-card flat bordered class="kpi-card q-pa-md text-center">
                    <q-icon name="trending_down" size="24px" color="negative" />
                    <div class="text-h6 text-weight-bold text-negative q-mt-xs">
                      {{ formatCurrency(currentReport.total_expenses) }}
                    </div>
                    <div class="text-caption text-grey-5">Expenses</div>
                  </q-card>
                </div>
                <div class="col-6 col-md-3">
                  <q-card flat bordered class="kpi-card q-pa-md text-center">
                    <q-icon name="account_balance" size="24px" :color="currentReport.net_profit >= 0 ? 'positive' : 'negative'" />
                    <div
                      class="text-h6 text-weight-bold q-mt-xs"
                      :class="currentReport.net_profit >= 0 ? 'text-positive' : 'text-negative'"
                    >
                      {{ formatCurrency(currentReport.net_profit) }}
                    </div>
                    <div class="text-caption text-grey-5">Net Profit</div>
                  </q-card>
                </div>
                <div class="col-6 col-md-3">
                  <q-card flat bordered class="kpi-card q-pa-md text-center">
                    <q-icon name="receipt_long" size="24px" color="primary" />
                    <div class="text-h6 text-weight-bold text-primary q-mt-xs">
                      {{ currentReport.paid_orders }} / {{ currentReport.total_orders }}
                    </div>
                    <div class="text-caption text-grey-5">Paid / Total Orders</div>
                  </q-card>
                </div>
              </div>

              <!-- Payment breakdown -->
              <q-card flat bordered class="q-mb-md">
                <q-card-section class="q-pb-xs">
                  <div class="text-subtitle2 text-weight-bold row items-center q-gutter-xs">
                    <q-icon name="payments" color="primary" />
                    <span>Payment Breakdown</span>
                  </div>
                </q-card-section>
                <q-card-section class="q-pt-xs">
                  <div class="row q-col-gutter-md">
                    <div class="col-3 text-center">
                      <div class="text-caption text-grey-5 q-mb-xs">
                        <q-icon name="money" size="14px" class="q-mr-xs" />Cash
                      </div>
                      <div class="text-subtitle1 text-weight-bold">{{ formatCurrency(currentReport.cash_collected) }}</div>
                    </div>
                    <div class="col-3 text-center">
                      <div class="text-caption text-grey-5 q-mb-xs">
                        <q-icon name="credit_card" size="14px" class="q-mr-xs" />Visa
                      </div>
                      <div class="text-subtitle1 text-weight-bold">{{ formatCurrency(currentReport.visa_collected) }}</div>
                    </div>
                    <div class="col-3 text-center">
                      <div class="text-caption text-grey-5 q-mb-xs">
                        <q-icon name="credit_card" size="14px" class="q-mr-xs" />Master
                      </div>
                      <div class="text-subtitle1 text-weight-bold">{{ formatCurrency(currentReport.master_collected) }}</div>
                    </div>
                    <div class="col-3 text-center">
                      <div class="text-caption text-grey-5 q-mb-xs">
                        <q-icon name="qr_code_2" size="14px" class="q-mr-xs" />QR
                      </div>
                      <div class="text-subtitle1 text-weight-bold">{{ formatCurrency(currentReport.qr_collected) }}</div>
                    </div>
                  </div>
                  <div class="row q-col-gutter-md q-mt-sm">
                    <div class="col-4 text-center">
                      <div class="text-caption text-grey-5 q-mb-xs">
                        <q-icon name="account_balance" size="14px" class="q-mr-xs" />Bank
                      </div>
                      <div class="text-subtitle1 text-weight-bold">{{ formatCurrency(currentReport.bank_collected) }}</div>
                    </div>
                    <div class="col-4 text-center">
                      <div class="text-caption text-grey-5 q-mb-xs">
                        <q-icon name="history_edu" size="14px" class="q-mr-xs" />Credit
                      </div>
                      <div class="text-subtitle1 text-weight-bold">{{ formatCurrency(currentReport.credit_collected) }}</div>
                    </div>
                    <div class="col-4 text-center">
                      <div class="text-caption text-grey-5 q-mb-xs">
                        <q-icon name="phone_android" size="14px" class="q-mr-xs" />Online
                      </div>
                      <div class="text-subtitle1 text-weight-bold">{{ formatCurrency(currentReport.online_collected) }}</div>
                    </div>
                  </div>
                </q-card-section>
              </q-card>

              <!-- HR + Operations row -->
              <div class="row q-col-gutter-md q-mb-md">
                <!-- HR Summary -->
                <div class="col-12 col-md-6">
                  <q-card flat bordered class="full-height">
                    <q-card-section class="q-pb-xs">
                      <div class="text-subtitle2 text-weight-bold row items-center q-gutter-xs">
                        <q-icon name="groups" color="primary" />
                        <span>HR Summary</span>
                      </div>
                    </q-card-section>
                    <q-card-section class="q-pt-xs">
                      <div class="row q-col-gutter-sm text-center">
                        <div class="col">
                          <div class="text-h6 text-weight-bold">{{ currentReport.scheduled_staff }}</div>
                          <div class="text-caption text-grey-5">Scheduled</div>
                        </div>
                        <div class="col">
                          <div class="text-h6 text-weight-bold text-positive">{{ currentReport.present_staff }}</div>
                          <div class="text-caption text-grey-5">Present</div>
                        </div>
                        <div class="col">
                          <div class="text-h6 text-weight-bold text-negative">{{ currentReport.absent_staff }}</div>
                          <div class="text-caption text-grey-5">Absent</div>
                        </div>
                        <div class="col">
                          <div class="text-h6 text-weight-bold text-warning">{{ currentReport.late_arrivals }}</div>
                          <div class="text-caption text-grey-5">Late</div>
                        </div>
                        <div class="col">
                          <div class="text-h6 text-weight-bold text-info">{{ currentReport.on_leave }}</div>
                          <div class="text-caption text-grey-5">On Leave</div>
                        </div>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
                <!-- Operations Summary -->
                <div class="col-12 col-md-6">
                  <q-card flat bordered class="full-height">
                    <q-card-section class="q-pb-xs">
                      <div class="text-subtitle2 text-weight-bold row items-center q-gutter-xs">
                        <q-icon name="restaurant" color="primary" />
                        <span>Operations Summary</span>
                      </div>
                    </q-card-section>
                    <q-card-section class="q-pt-xs">
                      <div class="row q-col-gutter-sm text-center">
                        <div class="col">
                          <div class="text-h6 text-weight-bold">{{ currentReport.total_kots }}</div>
                          <div class="text-caption text-grey-5">KOTs</div>
                        </div>
                        <div class="col">
                          <div class="text-h6 text-weight-bold">{{ currentReport.avg_kot_completion_mins ? currentReport.avg_kot_completion_mins.toFixed(1) : '—' }}</div>
                          <div class="text-caption text-grey-5">Avg Min</div>
                        </div>
                        <div class="col">
                          <div class="text-h6 text-weight-bold">{{ currentReport.tables_served }}</div>
                          <div class="text-caption text-grey-5">Tables</div>
                        </div>
                        <div class="col">
                          <div class="text-h6 text-weight-bold">{{ currentReport.delivery_orders }}</div>
                          <div class="text-caption text-grey-5">Delivery</div>
                        </div>
                        <div class="col">
                          <div class="text-h6 text-weight-bold">{{ currentReport.takeaway_orders }}</div>
                          <div class="text-caption text-grey-5">Takeaway</div>
                        </div>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
              </div>

              <!-- Audit Checks Table -->
              <q-card flat bordered class="q-mb-md" v-if="auditChecks.length">
                <q-card-section class="q-pb-xs">
                  <div class="text-subtitle2 text-weight-bold row items-center q-gutter-xs">
                    <q-icon name="fact_check" color="primary" />
                    <span>Audit Checks</span>
                  </div>
                </q-card-section>
                <q-table
                  :rows="auditChecks"
                  :columns="checkColumns"
                  flat
                  dense
                  :pagination="{ rowsPerPage: 20 }"
                  :rows-per-page-options="[20]"
                  hide-bottom
                >
                  <template #body-cell-status="props">
                    <q-td :props="props">
                      <q-badge
                        :color="checkStatusColor(props.value)"
                        :label="props.value.toUpperCase()"
                      />
                    </q-td>
                  </template>
                  <template #body-cell-department="props">
                    <q-td :props="props">
                      <span class="text-weight-medium text-capitalize">{{ props.value }}</span>
                    </q-td>
                  </template>
                  <template #body="props">
                    <q-tr :props="props" :class="`check-row--${props.row.status}`">
                      <q-td v-for="col in props.cols" :key="col.name" :props="props">
                        <template v-if="col.name === 'status'">
                          <q-badge :color="checkStatusColor(col.value)" :label="col.value.toUpperCase()" />
                        </template>
                        <template v-else>{{ col.value }}</template>
                      </q-td>
                    </q-tr>
                  </template>
                </q-table>
              </q-card>

              <!-- AI Narrative -->
              <q-card v-if="currentReport.ai_summary" flat bordered class="q-mb-md ai-narrative-card">
                <q-card-section class="row items-center q-pb-xs">
                  <q-icon name="auto_awesome" color="primary" class="q-mr-sm" />
                  <div class="text-subtitle2 text-weight-bold">AI Commentary</div>
                </q-card-section>
                <q-separator />
                <q-card-section class="text-body2" style="white-space: pre-wrap">
                  {{ currentReport.ai_summary }}
                </q-card-section>
              </q-card>

              <!-- Key Wins + Issues -->
              <div
                v-if="reportKeyWins.length || reportIssues.length"
                class="row q-col-gutter-md q-mb-md"
              >
                <div v-if="reportKeyWins.length" class="col-12 col-md-6">
                  <q-card flat bordered class="full-height">
                    <q-card-section class="q-pb-xs">
                      <div class="text-subtitle2 text-weight-bold text-positive row items-center q-gutter-xs">
                        <q-icon name="emoji_events" color="positive" />
                        <span>Key Wins</span>
                      </div>
                    </q-card-section>
                    <q-card-section class="q-pt-xs">
                      <div v-for="(win, wi) in reportKeyWins" :key="wi" class="row items-start q-mb-xs q-gutter-xs">
                        <q-icon name="check_circle" color="positive" size="16px" class="q-mt-xs" />
                        <span class="text-body2 col">{{ win }}</span>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
                <div v-if="reportIssues.length" class="col-12 col-md-6">
                  <q-card flat bordered class="full-height">
                    <q-card-section class="q-pb-xs">
                      <div class="text-subtitle2 text-weight-bold text-negative row items-center q-gutter-xs">
                        <q-icon name="warning" color="negative" />
                        <span>Issues to Address</span>
                      </div>
                    </q-card-section>
                    <q-card-section class="q-pt-xs">
                      <div v-for="(issue, ii) in reportIssues" :key="ii" class="row items-start q-mb-xs q-gutter-xs">
                        <q-icon name="arrow_right" color="negative" size="16px" class="q-mt-xs" />
                        <span class="text-body2 col">{{ issue }}</span>
                      </div>
                    </q-card-section>
                  </q-card>
                </div>
              </div>
            </template>

            <!-- No report for date -->
            <div v-else-if="!aiStore.loading.reports" class="text-center q-pa-xl">
              <q-icon name="summarize" size="64px" color="grey-4" />
              <div class="text-h6 text-grey-6 q-mt-md">No report for {{ reportDate }}</div>
              <q-btn
                color="primary"
                icon="auto_awesome"
                label="Generate EOD Report"
                unelevated
                class="q-mt-md"
                :loading="aiStore.loading.eodReport"
                :disable="aiStore.isAiUnavailable"
                @click="generateEodReport"
              />
            </div>
          </div>

          <!-- Report history sidebar -->
          <div class="col-12 col-md-3 lt-md-hide">
            <q-card flat bordered>
              <q-card-section class="q-py-sm">
                <div class="text-subtitle2 text-weight-bold">Report History</div>
              </q-card-section>
              <q-separator />
              <q-list dense>
                <q-item
                  v-for="rep in aiStore.dailyReports.slice(0, 10)"
                  :key="rep.id"
                  clickable
                  :active="currentReport?.id === rep.id"
                  active-class="bg-primary-1 text-primary"
                  @click="loadReport(rep.id)"
                >
                  <q-item-section>
                    <q-item-label class="text-body2">{{ rep.report_date }}</q-item-label>
                    <q-item-label caption>
                      <q-badge
                        :color="ratingColor(rep.performance_rating)"
                        :label="rep.performance_rating || rep.status"
                        size="xs"
                      />
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon :name="rep.status === 'generated' ? 'check_circle' : 'hourglass_empty'" size="14px" :color="rep.status === 'generated' ? 'positive' : 'grey'" />
                  </q-item-section>
                </q-item>
                <q-item v-if="!aiStore.dailyReports.length">
                  <q-item-section>
                    <q-item-label caption class="text-grey-6">No reports yet</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card>
          </div>
        </div>
      </q-tab-panel>

      <!-- ══════════════════════════════════════════════════════════════════
           TAB 3 — INSIGHTS HISTORY
      ═══════════════════════════════════════════════════════════════════ -->
      <q-tab-panel name="history" class="q-pa-none">

        <!-- Filters + Actions -->
        <div class="row items-center q-gutter-sm q-mb-md">
          <div class="text-body2 text-grey-6 q-mr-xs">Severity:</div>
          <q-chip
            v-for="sev in severityFilters"
            :key="sev"
            clickable
            :selected="severityFilter === sev"
            :color="sev === 'all' ? 'primary' : severityColor(sev)"
            text-color="white"
            size="sm"
            @click="severityFilter = sev"
          >
            {{ sev === 'all' ? 'All' : sev }}
          </q-chip>

          <q-space />

          <q-select
            v-model="moduleFilter"
            :options="moduleOptions"
            dense outlined
            label="Module"
            style="min-width: 130px"
            emit-value map-options
          />
          <q-btn
            flat
            color="grey-6"
            icon="done_all"
            label="Mark All Read"
            size="sm"
            @click="markAllRead"
          />
        </div>

        <!-- Insights list -->
        <div v-if="filteredInsights.length" class="q-col-gutter-md">
          <AiInsightCard
            v-for="insight in filteredInsights"
            :key="insight.id"
            :insight="insight"
            class="q-mb-md"
            @acknowledge="handleInsightAction(insight.id, 'acknowledged')"
            @action="handleInsightAction(insight.id, 'actioned')"
            @dismiss="handleInsightAction(insight.id, 'dismissed')"
          />
          <div class="text-center q-mt-md" v-if="canLoadMore">
            <q-btn
              flat color="primary"
              icon="expand_more"
              label="Load More"
              :loading="aiStore.loading.insights"
              @click="loadMoreInsights"
            />
          </div>
        </div>

        <div v-else-if="aiStore.loading.dashboard" class="q-col-gutter-md">
          <q-skeleton v-for="n in 4" :key="n" type="rect" height="100px" class="q-mb-md rounded-borders" />
        </div>

        <div v-else class="text-center q-pa-xl">
          <q-icon name="inbox" size="64px" color="grey-4" />
          <div class="text-h6 text-grey-6 q-mt-md">No insights found</div>
          <div class="text-body2 text-grey-5">Run a system audit to generate AI insights.</div>
        </div>
      </q-tab-panel>

    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useQuasar, date } from 'quasar'
import { useRouter } from 'vue-router'
import { useAiStore } from 'src/modules/ai/stores/ai.store'
import { useAuthStore } from 'src/stores/auth'
import AiInsightCard from 'src/modules/ai/components/AiInsightCard.vue'
import html2pdf from 'html2pdf.js'

const $q = useQuasar()
const router = useRouter()
const aiStore = useAiStore()
const authStore = useAuthStore()

// ── Tab state ──────────────────────────────────────────────────────────────
const activeTab = ref('audit')
const auditReportRef = ref(null)

// ── Scan state ──────────────────────────────────────────────────────────────
const scanning = ref(false)
const scanLog = ref([])
const systemAuditData = ref(null)

// ── EOD state ───────────────────────────────────────────────────────────────
const reportDate = ref(date.formatDate(new Date(), 'YYYY-MM-DD'))
const selectedBranchId = ref(null)

// ── Insights history state ──────────────────────────────────────────────────
const severityFilter = ref('all')
const moduleFilter = ref('all')
const insightsPage = ref(1)

const severityFilters = ['all', 'critical', 'high', 'medium', 'low', 'info']
const moduleOptions = [
  { label: 'All Modules', value: 'all' },
  { label: 'Finance', value: 'finance' },
  { label: 'Operations', value: 'operations' },
  { label: 'HR', value: 'hr' },
  { label: 'CRM', value: 'crm' },
  { label: 'Security', value: 'security' },
]

// ── Derived ─────────────────────────────────────────────────────────────────
const branchId = computed(() => selectedBranchId.value || authStore.currentBranch?.id)

const branchOptions = computed(() => {
  const branches = authStore.branches || []
  return branches.map(b => ({
    id: b.branches?.id || b.id,
    name: b.branches?.name || b.name
  })).filter(b => b.id)
})

const currentReport = computed(() => aiStore.currentReport)
const auditChecks = computed(() => aiStore.auditChecks)

const deptDepartments = computed(() => {
  const data = systemAuditData.value || aiStore.systemAuditResult
  return data?.departments || []
})

const kpiIssues = computed(() => {
  const depts = deptDepartments.value
  if (!depts.length) return aiStore.dashboardSummary.total_insights || 0
  return depts.reduce((sum, d) => sum + (d.findings?.length || 0), 0)
})

const kpiCritical = computed(() => {
  const depts = deptDepartments.value
  if (!depts.length) return aiStore.dashboardSummary.critical_count || 0
  return depts.reduce((sum, d) => sum + (d.findings?.filter(f => f.severity === 'critical' || f.severity === 'high').length || 0), 0)
})

const lastScanLabel = computed(() => {
  if (!aiStore.lastScanAt) return 'Never'
  return date.formatDate(aiStore.lastScanAt, 'HH:mm')
})

const filteredInsights = computed(() => {
  let list = aiStore.insights
  if (severityFilter.value !== 'all') list = list.filter(i => i.severity === severityFilter.value)
  if (moduleFilter.value !== 'all') list = list.filter(i => i.module === moduleFilter.value)
  return list.slice(0, insightsPage.value * 20)
})

const canLoadMore = computed(() => {
  let list = aiStore.insights
  if (severityFilter.value !== 'all') list = list.filter(i => i.severity === severityFilter.value)
  if (moduleFilter.value !== 'all') list = list.filter(i => i.module === moduleFilter.value)
  return list.length > insightsPage.value * 20
})

const reportKeyWins = computed(() => {
  const raw = currentReport.value?.ai_flags
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
})

const reportIssues = computed(() => {
  const raw = currentReport.value?.ai_recommendations
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
})

// ── Table columns ───────────────────────────────────────────────────────────
const checkColumns = [
  { name: 'department', label: 'Department', field: 'department', align: 'left', sortable: true },
  { name: 'check_name', label: 'Check', field: 'check_name', align: 'left' },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'message', label: 'Result', field: 'message', align: 'left' },
  { name: 'actual_value', label: 'Actual', field: 'actual_value', align: 'left' },
  { name: 'expected_value', label: 'Expected', field: 'expected_value', align: 'left' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(val) {
  return new Intl.NumberFormat('en-LK', { minimumFractionDigits: 2 }).format(val || 0)
}

function logEntry(message, type = 'info') {
  scanLog.value.push({ message, type, time: date.formatDate(new Date(), 'HH:mm:ss') })
}

function logLineClass(type) {
  const map = { success: 'text-positive', error: 'text-negative', warn: 'text-warning', info: 'text-grey-4' }
  return map[type] || 'text-grey-4'
}

function deptIcon(name) {
  const map = {
    finance: 'account_balance',
    operations: 'restaurant',
    hr: 'groups',
    crm: 'people_alt',
    inventory: 'inventory_2',
    security: 'shield',
  }
  return map[name?.toLowerCase()] || 'domain'
}

function statusColor(status) {
  const map = { pass: 'positive', warning: 'warning', fail: 'negative', good: 'positive' }
  return map[status] || 'grey'
}

function healthColor(health) {
  const map = { good: 'positive', warning: 'warning', critical: 'negative' }
  return map[health] || 'grey'
}

function severityColor(s) {
  const map = { critical: 'negative', high: 'deep-orange', medium: 'warning', low: 'info', info: 'grey-6' }
  return map[s] || 'grey'
}

function severityIcon(s) {
  const map = { critical: 'error', high: 'warning', medium: 'info', low: 'info_outline', info: 'circle' }
  return map[s] || 'circle'
}

function ratingColor(rating) {
  const map = { excellent: 'positive', good: 'primary', average: 'warning', needs_improvement: 'negative' }
  return map[rating] || 'grey'
}

function checkStatusColor(status) {
  const map = { pass: 'positive', warning: 'warning', fail: 'negative', info: 'blue-grey', skipped: 'grey' }
  return map[status] || 'grey'
}

// ── Actions ──────────────────────────────────────────────────────────────────
async function downloadPdf() {
  if (!auditReportRef.value) return
  const opt = {
    margin:       [0.5, 0.5, 0.5, 0.5],
    filename:     `System_Audit_Report_${date.formatDate(new Date(), 'YYYY-MM-DD')}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
  }
  html2pdf().set(opt).from(auditReportRef.value).save()
}

async function runSystemAudit() {
  if (!branchId.value) {
    $q.notify({ type: 'warning', message: 'Select a branch first.' })
    return
  }
  scanning.value = true
  scanLog.value = []
  activeTab.value = 'audit'
  logEntry('Initializing AI System Audit…')
  logEntry('Collecting Finance data (orders, invoices, payments, finance queue)…')
  logEntry('Collecting Operations data (KOTs, order flow)…')
  logEntry('Collecting HR data (shifts, attendance, leaves)…')
  logEntry('Collecting CRM data (customers, orders)…')
  logEntry('Sending aggregated data to Gemini AI for analysis…')

  const dateFrom = date.formatDate(new Date(), 'YYYY-MM-DD') + 'T00:00:00Z'
  const result = await aiStore.runSystemAuditAction(branchId.value, dateFrom)

  if (result.success) {
    systemAuditData.value = result.data
    const deptCount = result.data?.departments?.length || 0
    logEntry(`Audit complete — ${deptCount} departments checked`, 'success')
    const fails = (result.data?.departments || []).filter(d => d.status === 'fail').length
    if (fails > 0) logEntry(`${fails} department(s) have issues requiring attention`, 'warn')
    $q.notify({ type: 'positive', message: 'System audit complete!' })
  } else {
    logEntry('Audit failed: ' + (result.error || 'Unknown error'), 'error')
    $q.notify({ type: 'negative', message: result.error || 'Audit failed. Check Edge Function.' })
  }
  scanning.value = false
}

async function generateEodReport() {
  if (!branchId.value) {
    $q.notify({ type: 'warning', message: 'Select a branch first.' })
    return
  }
  const result = await aiStore.generateEodReportAction(branchId.value, reportDate.value, authStore.user?.id)
  if (result.success) {
    await loadReportForDate(reportDate.value)
    $q.notify({ type: 'positive', message: 'EOD Report generated!' })
  } else {
    $q.notify({ type: 'negative', message: result.error || 'Failed to generate report.' })
  }
}

async function loadReportForDate(d) {
  const { fetchDailyReportByDate } = await import('src/modules/ai/services/ai.service')
  const report = await fetchDailyReportByDate(branchId.value, d)
  if (report) {
    aiStore.currentReport = report
    aiStore.auditChecks = report.ai_audit_checks || []
  } else {
    aiStore.currentReport = null
    aiStore.auditChecks = []
  }
}

async function loadReport(reportId) {
  await aiStore.loadReportDetail(reportId)
}

async function handleInsightAction(insightId, action) {
  await aiStore.handleInsightAction(insightId, action, authStore.user?.id)
}

async function markAllRead() {
  const newInsights = aiStore.insights.filter(i => i.status === 'new')
  for (const ins of newInsights) {
    await aiStore.handleInsightAction(ins.id, 'acknowledged', authStore.user?.id)
  }
  $q.notify({ type: 'positive', message: `${newInsights.length} insights acknowledged.` })
}

function loadMoreInsights() {
  insightsPage.value++
}

function printReport() {
  window.print()
}

async function exportReport() {
  const report = currentReport.value
  if (!report) return

  const branchName = branchOptions.value.find(b => b.id === branchId.value)?.name || 'Branch'

  const htmlContent = `
    <div style="padding: 40px; font-family: 'Inter', sans-serif; color: #333; max-width: 800px; margin: auto;">
      <!-- Header -->
      <div style="display: flex; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px;">
        <img src="/logo.jpeg" alt="Logo" style="height: 60px; margin-right: 20px; border-radius: 8px; object-fit: contain;">
        <div>
          <h1 style="margin: 0; font-size: 24px; color: #1e293b;">Seven Waves Restaurant</h1>
          <h2 style="margin: 4px 0 0 0; font-size: 16px; color: #64748b;">End of Day Report - ${branchName}</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Date: ${report.report_date} | Generated by: ${report.generated_by === 'auto' ? 'System (Auto)' : 'Manual'}</p>
        </div>
      </div>

      <!-- Financials -->
      <div style="margin-bottom: 30px;">
        <h3 style="margin-bottom: 15px; color: #0f172a; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Financial Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #475569;">Total Revenue</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #16a34a;">${formatCurrency(report.total_revenue)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #475569;">Total Expenses</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #dc2626;">${formatCurrency(report.total_expenses)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #475569; font-weight: bold;">Net Profit</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; font-size: 16px; color: ${report.net_profit >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(report.net_profit)}</td>
          </tr>
        </table>
      </div>

      <!-- Payment Breakdown -->
      <div style="margin-bottom: 30px;">
        <h3 style="margin-bottom: 15px; color: #0f172a; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Payment Breakdown</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #475569;">Cash</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(report.cash_collected)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #475569;">Visa</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(report.visa_collected)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #475569;">Master</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(report.master_collected)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #475569;">QR Transfer</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(report.qr_collected)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #475569;">Bank Transfer</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(report.bank_collected)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #475569;">Credit</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(report.credit_collected)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #475569;">Online Orders</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${formatCurrency(report.online_collected)}</td>
          </tr>
        </table>
      </div>

      <!-- Operations & HR -->
      <div style="display: flex; gap: 20px; margin-bottom: 30px;">
        <div style="flex: 1;">
          <h3 style="margin-bottom: 15px; color: #0f172a; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Operations</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #475569;">Total Orders</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${report.total_orders}</td></tr>
            <tr><td style="padding: 6px 0; color: #475569;">Paid / Void</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${report.paid_orders} / ${report.void_cancelled_orders}</td></tr>
            <tr><td style="padding: 6px 0; color: #475569;">Average Order</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatCurrency(report.average_order_value)}</td></tr>
            <tr><td style="padding: 6px 0; color: #475569;">Total KOTs</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${report.total_kots}</td></tr>
            <tr><td style="padding: 6px 0; color: #475569;">Avg Prep Time</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${report.avg_kot_completion_mins} min</td></tr>
          </table>
        </div>
        <div style="flex: 1;">
          <h3 style="margin-bottom: 15px; color: #0f172a; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Human Resources</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #475569;">Scheduled Staff</td><td style="padding: 6px 0; text-align: right; font-weight: bold;">${report.scheduled_staff}</td></tr>
            <tr><td style="padding: 6px 0; color: #475569;">Present Staff</td><td style="padding: 6px 0; text-align: right; font-weight: bold; color: #16a34a;">${report.present_staff}</td></tr>
            <tr><td style="padding: 6px 0; color: #475569;">Absent Staff</td><td style="padding: 6px 0; text-align: right; font-weight: bold; color: #dc2626;">${report.absent_staff}</td></tr>
            <tr><td style="padding: 6px 0; color: #475569;">Late Arrivals</td><td style="padding: 6px 0; text-align: right; font-weight: bold; color: #d97706;">${report.late_arrivals}</td></tr>
            <tr><td style="padding: 6px 0; color: #475569;">On Leave</td><td style="padding: 6px 0; text-align: right; font-weight: bold; color: #0284c7;">${report.on_leave}</td></tr>
          </table>
        </div>
      </div>
      
      <div style="margin-top: 40px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
        &copy; ${new Date().getFullYear()} Seven Waves ERP. All rights reserved.
      </div>
    </div>
  `

  const container = document.createElement('div')
  container.innerHTML = htmlContent
  document.body.appendChild(container)

  const opt = {
    margin:       0.5,
    filename:     `EOD_Report_${branchName.replace(/\\s+/g, '_')}_${report.report_date}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
  }

  try {
    await html2pdf().set(opt).from(container).save()
  } finally {
    document.body.removeChild(container)
  }
}

// ── Watchers ─────────────────────────────────────────────────────────────────
watch(reportDate, async (newDate) => {
  if (branchId.value && newDate) {
    await loadReportForDate(newDate)
  }
})

watch(branchId, async (newId) => {
  if (newId) {
    await Promise.all([
      aiStore.loadTodayReport(newId),
      aiStore.loadDailyReports(newId, { limit: 10 }),
    ])
  }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  selectedBranchId.value = authStore.currentBranch?.id || null
  if (branchId.value) {
    await Promise.all([
      aiStore.loadDashboard(branchId.value),
      aiStore.loadTodayReport(branchId.value),
      aiStore.loadDailyReports(branchId.value, { limit: 10 }),
    ])
  }
})
</script>

<style lang="scss" scoped>
.ai-insights-page {
  max-width: 1300px;
  margin: 0 auto;
}

// KPI card
.kpi-card {
  border-radius: 12px;
  background: var(--erp-bg-card, rgba(255, 255, 255, 0.03));
  border-color: rgba(255, 255, 255, 0.08);
  transition: transform 0.2s;
  &:hover { transform: translateY(-2px); }
}

// Department audit card
.dept-card {
  border-radius: 12px;
  border-left: 4px solid transparent;
  overflow: hidden;

  &--pass    { border-left-color: var(--q-positive); }
  &--warning { border-left-color: var(--q-warning); }
  &--fail    { border-left-color: var(--q-negative); }

  &__header {
    background: rgba(255, 255, 255, 0.02);
  }
}

// Finding row within dept card
.finding-row {
  padding: 8px 0;
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  &:last-child { border-bottom: none; }
}

// Audit log (terminal style)
.audit-log-card {
  border-radius: 12px;
}

.audit-log {
  font-family: 'Consolas', 'Courier New', monospace;
  max-height: 180px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0 0 12px 12px;

  &__line {
    display: flex;
    align-items: baseline;
    line-height: 1.6;
  }

  &__time {
    white-space: nowrap;
    min-width: 56px;
  }
}

// AI narrative card
.ai-narrative-card {
  border-left: 3px solid var(--q-primary);
  background: rgba(37, 99, 235, 0.04);
  border-radius: 12px;
}

// Audit check table row tints
:deep(.check-row--fail) td   { background: rgba(220, 38, 38, 0.08); }
:deep(.check-row--warning) td { background: rgba(245, 158, 11, 0.08); }
:deep(.check-row--pass) td    { background: rgba(22, 163, 74, 0.05); }

// Empty state
.empty-state {
  border-radius: 16px;
}

// Print styles
@media print {
  .q-tabs,
  .q-btn,
  .q-banner,
  .audit-log-card {
    display: none !important;
  }
  .q-tab-panels {
    padding: 0 !important;
  }
}
</style>
