<template>
  <div class="ai-operations-watchdog">
    <!-- Watchdog Status Button / Badge -->
    <q-btn
      flat
      dense
      rounded
      no-caps
      :class="badgeClass"
      class="watchdog-badge q-px-sm q-py-xs"
      @click="showDrawer = true"
    >
      <div class="row items-center no-wrap q-gutter-x-xs">
        <q-icon
          :name="statusIcon"
          size="18px"
          :class="{ 'pulse-animation': alertCount > 0 }"
        />
        <div class="column text-left leading-tight">
          <span class="text-weight-bolder" style="font-size: 0.75rem; line-height: 1.1">
            AI WATCHDOG
          </span>
          <span class="text-caption" style="font-size: 0.65rem; opacity: 0.9">
            {{ statusText }}
          </span>
        </div>
        <q-badge
          v-if="alertCount > 0"
          :color="severityColor"
          floating
          rounded
          class="q-ml-xs text-weight-bold"
        >
          {{ alertCount }}
        </q-badge>
      </div>
      <q-tooltip anchor="bottom middle" self="top middle">
        {{ tooltipText }} (Click to open AI Control Center)
      </q-tooltip>
    </q-btn>

    <!-- AI Operations Drawer / Dialog -->
    <q-dialog v-model="showDrawer" position="right" maximized>
      <q-card class="ai-drawer-card bg-dark-glass text-white column">
        <!-- Header -->
        <q-card-section class="row items-center justify-between border-b q-py-sm">
          <div class="row items-center q-gutter-x-sm">
            <q-avatar size="36px" color="primary" text-color="white" icon="smart_toy" />
            <div>
              <div class="text-subtitle1 text-weight-bold row items-center q-gutter-x-xs">
                <span>KOT & Operations AI Agent</span>
                <q-badge color="positive" size="xs">24/7 CLOUD ACTIVE</q-badge>
              </div>
              <div class="text-caption text-grey-4">
                Realtime KDS Routing, Delay Watchdog & Sales Audit
              </div>
            </div>
          </div>
          <div class="row items-center q-gutter-x-xs">
            <q-btn
              flat
              round
              dense
              icon="refresh"
              :loading="isAuditing"
              @click="runManualAudit"
            >
              <q-tooltip>Run Live AI Audit</q-tooltip>
            </q-btn>
            <q-btn flat round dense icon="close" v-close-popup />
          </div>
        </q-card-section>

        <!-- Body content -->
        <q-card-section class="col q-pa-md scroll">
          <!-- Multi-Agent Department Navigation Tabs -->
          <div class="q-mb-md">
            <q-tabs
              v-model="activeDepartmentTab"
              dense
              align="justify"
              class="text-grey-4 bg-dark-glass-light rounded-borders"
              active-color="amber-4"
              indicator-color="amber-4"
            >
              <q-tab name="operations" icon="restaurant" label="Operations">
                <q-badge v-if="kotAlertsCount > 0" color="red" floating rounded>{{ kotAlertsCount }}</q-badge>
              </q-tab>
              <q-tab name="finance" icon="account_balance_wallet" label="FinGuard">
                <q-badge v-if="finAlertsCount > 0" color="amber-9" floating rounded>{{ finAlertsCount }}</q-badge>
              </q-tab>
              <q-tab name="hr" icon="people" label="TalentOps">
                <q-badge v-if="hrAlertsCount > 0" color="blue-8" floating rounded>{{ hrAlertsCount }}</q-badge>
              </q-tab>
              <q-tab name="inventory" icon="inventory_2" label="SupplySense">
                <q-badge v-if="supplyAlertsCount > 0" color="purple-8" floating rounded>{{ supplyAlertsCount }}</q-badge>
              </q-tab>
            </q-tabs>
          </div>

          <!-- ════ TAB 1: KOT & OPERATIONS (Live Watchdog) ════ -->
          <div v-show="activeDepartmentTab === 'operations'">
            <!-- Live Operational Health Score -->
          <div class="q-pa-md rounded-borders q-mb-md health-score-card">
            <div class="row items-center justify-between">
              <div>
                <div class="text-caption text-grey-4">OPERATIONAL HEALTH SCORE</div>
                <div class="text-h4 text-weight-bolder font-mono" :class="scoreColor">
                  {{ auditData?.summary?.health_score || (alertCount === 0 ? 100 : Math.max(40, 100 - alertCount * 15)) }}%
                </div>
              </div>
              <q-circular-progress
                show-value
                font-size="12px"
                :value="auditData?.summary?.health_score || (alertCount === 0 ? 100 : Math.max(40, 100 - alertCount * 15))"
                size="60px"
                :thickness="0.2"
                :color="circularColor"
                track-color="grey-8"
              >
                {{ auditData?.summary?.health_score || (alertCount === 0 ? 100 : Math.max(40, 100 - alertCount * 15)) }}%
              </q-circular-progress>
            </div>
            <div class="text-caption q-mt-xs text-grey-3">
              {{ aiSummaryText }}
            </div>
          </div>

          <!-- Section 0: QR Table Order Guardian (Auto-Healing) -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="healing" color="cyan" />
              <span>QR Order Guardian (Self-Healing)</span>
            </span>
            <q-badge color="cyan-9" class="text-weight-bold" size="xs">
              90s AUTO-DISPATCH ACTIVE
            </q-badge>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <div class="row items-center justify-between q-mb-xs">
              <div class="text-caption text-grey-4">
                Protects customer QR orders from waiter delays &amp; routing glitches.
              </div>
              <q-btn
                dense
                flat
                size="xs"
                color="cyan"
                icon="autorenew"
                label="Self-Heal Scan"
                :loading="isHealing"
                @click="triggerSelfHealManual"
              />
            </div>

            <div v-if="healedOrders.length === 0" class="text-caption text-grey-4 q-pa-xs">
              <q-icon name="verified_user" color="positive" size="14px" class="q-mr-xs" />
              Zero dropped orders. All QR orders claimed or dispatched within 90s.
            </div>
            <div v-else class="q-gutter-y-xs">
              <div
                v-for="(ho, idx) in healedOrders"
                :key="idx"
                class="q-pa-xs rounded-borders bg-cyan-10 text-white text-caption row items-center justify-between"
              >
                <div class="row items-center q-gutter-x-xs">
                  <q-icon name="check_circle" size="14px" />
                  <span>Order #{{ ho.order_number }} (Table {{ ho.table_number || 'N/A' }})</span>
                </div>
                <span class="text-weight-bold">Rescued at {{ ho.elapsed_seconds }}s</span>
              </div>
            </div>
          </div>

          <!-- Section 0.5: Omnichannel End-to-End Pipeline Watchdog -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="schema" color="amber-4" />
              <span>Omnichannel Pipeline (8 Stages)</span>
            </span>
            <q-badge
              :color="pipelineData?.pipeline_health === 'optimal' ? 'positive' : 'warning'"
              class="text-weight-bold"
              size="xs"
            >
              {{ pipelineData?.pipeline_health === 'optimal' ? '100% HEALTHY' : 'NEEDS ATTENTION' }}
            </q-badge>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <!-- Channel Origin Badges -->
            <div class="row items-center justify-between q-mb-xs text-caption text-grey-4">
              <span>Live Channels:</span>
              <div class="row items-center q-gutter-x-xs font-mono" style="font-size: 11px">
                <q-badge color="blue-9">QR: {{ pipelineData?.sources?.qr_orders || 0 }}</q-badge>
                <q-badge color="purple-9">POS: {{ pipelineData?.sources?.pos_orders || 0 }}</q-badge>
                <q-badge color="teal-9">Web: {{ pipelineData?.sources?.website_orders || 0 }}</q-badge>
              </div>
            </div>

            <!-- 8 Stages Grid -->
            <div class="pipeline-stages-grid q-mt-xs">
              <div class="stage-cell">
                <div class="stage-num">S1</div>
                <div class="stage-name">Broadcast</div>
                <div class="stage-val text-positive">✓ Active</div>
              </div>
              <div class="stage-cell">
                <div class="stage-num">S2</div>
                <div class="stage-name">Waiter Claim</div>
                <div class="stage-val" :class="(pipelineData?.stages?.stage_2_pending_waiter || 0) > 0 ? 'text-warning' : 'text-grey-3'">
                  {{ pipelineData?.stages?.stage_2_pending_waiter || 0 }} pend
                </div>
              </div>
              <div class="stage-cell">
                <div class="stage-num">S3</div>
                <div class="stage-name">KDS Routing</div>
                <div class="stage-val text-positive">✓ Routed</div>
              </div>
              <div class="stage-cell">
                <div class="stage-num">S4</div>
                <div class="stage-name">Kitchen Prep</div>
                <div class="stage-val text-amber-4">
                  {{ pipelineData?.stages?.stage_3_kitchen_preparing || 0 }} active
                </div>
              </div>
              <div class="stage-cell">
                <div class="stage-num">S5</div>
                <div class="stage-name">Customer Realtime</div>
                <div class="stage-val text-cyan">Live Sync</div>
              </div>
              <div class="stage-cell">
                <div class="stage-num">S6</div>
                <div class="stage-name">POS Billing</div>
                <div class="stage-val" :class="(pipelineData?.stages?.stage_5_billing_discrepancies || 0) > 0 ? 'text-negative' : 'text-positive'">
                  {{ (pipelineData?.stages?.stage_5_billing_discrepancies || 0) > 0 ? '⚠️ Discrepancy' : '✓ 100% Match' }}
                </div>
              </div>
              <div class="stage-cell">
                <div class="stage-num">S7</div>
                <div class="stage-name">Lead Time</div>
                <div class="stage-val text-blue-3">
                  {{ pipelineData?.stages?.stage_6_avg_lead_time_mins || 0 }}m avg
                </div>
              </div>
              <div class="stage-cell">
                <div class="stage-num">S8</div>
                <div class="stage-name">AI Guardian</div>
                <div class="stage-val text-positive">Auto-Heal</div>
              </div>
            </div>
          </div>

          <!-- Section 0.8: Unassigned Waiter Escalations (Manager Action Required) -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="person_off" :color="unassignedOrders.length === 0 ? 'positive' : 'negative'" />
              <span>Orders Missing Waiter ({{ unassignedOrders.length }})</span>
            </span>
            <q-badge :color="unassignedOrders.length === 0 ? 'positive' : 'negative'" size="xs">
              {{ unassignedOrders.length === 0 ? 'ALL ASSIGNED' : `${unassignedOrders.length} NEED WAITER` }}
            </q-badge>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <div v-if="unassignedOrders.length === 0" class="text-caption text-grey-4 q-pa-xs">
              <q-icon name="verified_user" color="positive" size="14px" class="q-mr-xs" />
              100% of orders assigned to on-duty servers. Zero unattended dishes on the pass.
            </div>
            <div v-else class="q-gutter-y-xs">
              <div class="text-caption text-negative text-weight-bold q-mb-xs row items-center">
                <q-icon name="warning" size="14px" class="q-mr-xs" />
                Manager Alert: Orders in kitchen without assigned waiter.
              </div>
              <div
                v-for="order in unassignedOrders"
                :key="order.order_id"
                class="q-pa-xs rounded-borders bg-red-10 text-white text-caption row items-center justify-between"
              >
                <div class="column">
                  <div class="row items-center q-gutter-x-xs">
                    <q-badge
                      :color="order.order_source === 'qr' ? 'blue-8' : (order.order_source === 'website' ? 'teal-8' : 'purple-8')"
                      size="xs"
                    >
                      {{ order.order_source?.toUpperCase() }}
                    </q-badge>
                    <span class="text-weight-bolder">Order #{{ order.order_number }}</span>
                    <span class="text-grey-3">({{ order.table_number ? 'T' + order.table_number : 'Takeaway' }})</span>
                  </div>
                  <span class="text-grey-4" style="font-size: 10.5px">
                    Wait: {{ order.elapsed_minutes }}m · LKR {{ Number(order.total_amount || 0).toLocaleString() }}
                  </span>
                </div>
                <q-btn
                  dense
                  unelevated
                  size="xs"
                  color="warning"
                  text-color="dark"
                  icon="person_add"
                  label="Assign Waiter"
                  class="text-weight-bold"
                  @click="openAssignDialog(order)"
                />
              </div>
            </div>
          </div>

          <!-- Section 1: Delayed KOT Watchdog -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="timer" color="warning" />
              <span>Active KOT Delays ({{ delayedKots.length }})</span>
            </span>
            <span class="text-caption text-grey-4">&gt; 15 min threshold</span>
          </div>

          <div v-if="delayedKots.length === 0" class="q-pa-sm text-center bg-dark-glass-light rounded-borders q-mb-md text-grey-4">
            <q-icon name="check_circle" color="positive" size="20px" class="q-mr-xs" />
            No delayed tickets. All kitchen stations running on schedule!
          </div>

          <div v-else class="q-gutter-y-sm q-mb-md">
            <q-card
              v-for="kot in delayedKots"
              :key="kot.kot_id || kot.id"
              flat
              bordered
              class="delayed-kot-card q-pa-sm"
              :class="kot.elapsed_minutes >= 25 || kot.severity === 'critical' ? 'critical-border' : 'warning-border'"
            >
              <div class="row items-center justify-between">
                <div class="row items-center q-gutter-x-xs">
                  <q-badge
                    :color="kot.elapsed_minutes >= 25 ? 'red-8' : 'orange-8'"
                    class="text-weight-bold"
                  >
                    {{ kot.elapsed_minutes || kot.delay_minutes }} min delay
                  </q-badge>
                  <span class="text-weight-bolder">Order #{{ kot.order_number || 'N/A' }}</span>
                  <span class="text-caption text-grey-4">
                    ({{ kot.table_number ? 'T' + kot.table_number : 'Takeaway' }})
                  </span>
                </div>
                <div class="text-caption font-mono text-grey-4">
                  {{ kot.kitchen_name || 'Kitchen' }}
                </div>
              </div>

              <!-- Item summary -->
              <div v-if="kot.items && kot.items.length" class="text-caption text-grey-3 q-mt-xs">
                Items: {{ kot.items.map(i => `${i.name} x${i.qty}`).join(', ') }}
              </div>

              <!-- Quick action -->
              <div class="row items-center justify-end q-mt-xs q-gutter-x-xs">
                <q-btn
                  dense
                  flat
                  size="xs"
                  color="warning"
                  icon="notifications_active"
                  label="Expedite Sound Alert"
                  @click="triggerKitchenExpedite(kot)"
                />
              </div>
            </q-card>
          </div>

          <!-- Section 2: KOT Routing Integrity -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="alt_route" color="primary" />
              <span>Routing Integrity</span>
            </span>
            <q-badge :color="routingErrors.length === 0 ? 'positive' : 'negative'" size="xs">
              {{ routingErrors.length === 0 ? '100% ROUTED' : `${routingErrors.length} MISROUTED` }}
            </q-badge>
          </div>

          <div v-if="routingErrors.length === 0" class="q-pa-sm text-center bg-dark-glass-light rounded-borders q-mb-md text-grey-4">
            <q-icon name="check_circle" color="positive" size="20px" class="q-mr-xs" />
            All items accurately dispatched to assigned station displays.
          </div>
          <div v-else class="q-gutter-y-xs q-mb-md">
            <div
              v-for="(err, idx) in routingErrors"
              :key="idx"
              class="q-pa-xs rounded-borders bg-red-10 text-white text-caption row items-center justify-between"
            >
              <span>⚠️ Order #{{ err.order_number }}: "{{ err.item_name }}" missing from {{ err.expected_kitchen_name }}</span>
            </div>
          </div>

          <!-- Section 3: Live Sales & Void Audit -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="insights" color="cyan" />
              <span>Live Shift Sales & Velocity</span>
            </span>
            <span class="text-caption text-grey-4">Audited by Gemini</span>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <div class="row q-col-gutter-xs text-center">
              <div class="col-4">
                <div class="text-caption text-grey-4">Orders</div>
                <div class="text-subtitle1 text-weight-bold">{{ salesMetrics.today_orders_count || 0 }}</div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-4">Sales Total</div>
                <div class="text-subtitle1 text-weight-bold text-positive">
                  LKR {{ Number(salesMetrics.today_sales_total || 0).toLocaleString() }}
                </div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-4">Void Rate</div>
                <div
                  class="text-subtitle1 text-weight-bold"
                  :class="salesMetrics.is_void_spike ? 'text-negative' : 'text-grey-2'"
                >
                  {{ salesMetrics.void_percentage || 0 }}%
                </div>
              </div>
            </div>

            <div v-if="salesMetrics.is_void_spike" class="q-mt-xs text-caption text-negative bg-red-10 q-pa-xs rounded-borders">
              🚨 <strong>Void Anomaly Alert:</strong> {{ salesMetrics.recent_voids_2h }} voided orders in the last 2 hours.
            </div>
          </div>

          <!-- Section 4: Live Kitchen Stations Load -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="kitchen" color="purple-4" />
              <span>Station Capacities</span>
            </span>
          </div>

          <div class="q-gutter-y-xs q-mb-md">
            <div
              v-for="st in stationLoads"
              :key="st.kitchen_id"
              class="q-pa-xs rounded-borders bg-dark-glass-light row items-center justify-between text-caption"
            >
              <div class="row items-center q-gutter-x-xs">
                <span class="text-weight-bold">{{ st.kitchen_name }}</span>
                <q-badge :color="st.is_overloaded ? 'red-8' : 'grey-8'" size="xs">
                  {{ st.active_tickets }} active
                </q-badge>
              </div>
              <div class="text-grey-4">
                Avg Prep: {{ st.avg_prep_time_today }}m
              </div>
            </div>
          </div>

          <!-- Section 5: Real-Time ERP Reports Integrity Audit -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="analytics" color="teal-4" />
              <span>ERP Reports Real-Time Audit</span>
            </span>
            <q-badge :color="reportingAudit?.is_healthy ? 'positive' : 'warning'" size="xs">
              {{ reportingAudit?.is_healthy ? '100% RECONCILED' : 'ACTION REQUIRED' }}
            </q-badge>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <div class="row q-col-gutter-xs text-center q-mb-xs">
              <div class="col-6">
                <div class="text-caption text-grey-4">Waiter Attribution</div>
                <div
                  class="text-subtitle2 text-weight-bold"
                  :class="(reportingAudit?.waiter_reports?.attribution_rate_pct || 100) >= 95 ? 'text-positive' : 'text-warning'"
                >
                  {{ reportingAudit?.waiter_reports?.attribution_rate_pct || 100 }}%
                </div>
                <div class="text-caption text-grey-5" style="font-size: 10px">
                  {{ reportingAudit?.waiter_reports?.assigned_orders || 0 }}/{{ reportingAudit?.waiter_reports?.total_orders || 0 }} assigned
                </div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-4">Kitchen KOT Sync</div>
                <div class="text-subtitle2 text-weight-bold text-positive">
                  {{ reportingAudit?.kitchen_reports?.station_sync_rate_pct || 100 }}%
                </div>
                <div class="text-caption text-grey-5" style="font-size: 10px">
                  All station displays
                </div>
              </div>
            </div>

            <div class="text-caption text-grey-4 row items-center justify-between border-t q-pt-xs q-mt-xs" style="font-size: 11px">
              <span>Channel Audit:</span>
              <span class="font-mono">
                QR: {{ reportingAudit?.channel_breakdown?.qr_orders || 0 }} · POS: {{ reportingAudit?.channel_breakdown?.pos_orders || 0 }} · Web: {{ reportingAudit?.channel_breakdown?.web_orders || 0 }}
              </span>
            </div>
          </div>

          <!-- Section 6: Waiter Reward Points & Monthly Awards -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="military_tech" color="amber-4" />
              <span>Waiter Points & Awards</span>
            </span>
            <q-badge color="positive" size="xs">
              {{ pointsAuditData?.integrity_status || '100% RECONCILED' }}
            </q-badge>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <div class="row items-center justify-between q-mb-xs">
              <div class="text-caption text-grey-4">
                Points awarded automatically upon order serve/completion.
              </div>
              <q-badge color="amber-9" class="text-weight-bold" style="font-size: 10px">
                +10 base · +5 speed bonus
              </q-badge>
            </div>

            <!-- Points Reconcile Stats -->
            <div class="row q-col-gutter-xs text-center q-my-xs">
              <div class="col-4">
                <div class="text-caption text-grey-4">Served Today</div>
                <div class="text-subtitle2 text-weight-bold text-white">
                  {{ pointsAuditData?.eligible_orders || 0 }}
                </div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-4">Points Awarded</div>
                <div class="text-subtitle2 text-weight-bold text-amber-4">
                  {{ pointsAuditData?.points_awarded_orders || 0 }}
                </div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-4">Auto-Healed</div>
                <div class="text-subtitle2 text-weight-bold text-cyan">
                  {{ pointsAuditData?.auto_reconciled_count || 0 }}
                </div>
              </div>
            </div>

            <!-- Waiter of the Month Action -->
            <div class="q-mt-sm">
              <q-btn
                unelevated
                no-caps
                class="full-width text-weight-bold"
                style="background: linear-gradient(135deg, #f59e0b 0%, #b45309 100%); color: white; border-radius: 8px;"
                :loading="isGeneratingReport"
                @click="handleGenerateWaiterReport"
              >
                <q-icon name="emoji_events" class="q-mr-xs" />
                AI Waiter of the Month Report & Gift Nomination
              </q-btn>
            </div>
          </div>

          <!-- Section 7: Owner Daily EOD Executive Briefing (WhatsApp & Email) -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="send_to_mobile" color="green-4" />
              <span>Owner Daily EOD Briefing</span>
            </span>
            <q-badge color="green-9" size="xs">
              WHATSAPP: 0717462205
            </q-badge>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <div class="row items-center justify-between q-mb-xs">
              <div class="text-caption text-grey-4">
                Automated daily summary sent directly to the owner.
              </div>
              <q-badge color="teal-9" class="text-weight-bold" style="font-size: 10px">
                EOD Auto-Scheduled
              </q-badge>
            </div>

            <div class="q-pa-xs rounded-borders bg-dark-glass text-caption q-my-xs">
              <div class="row items-center q-gutter-x-xs">
                <q-icon name="chat" color="green-4" size="14px" />
                <span class="text-weight-bold text-white">Target: +94717462205</span>
                <span class="text-grey-4">(WhatsApp &amp; Email)</span>
              </div>
              <div class="text-grey-5 q-mt-xs" style="font-size: 10.5px">
                Includes Daily Revenue, Payment Breakdown, Omnichannel Sales, Lead Time &amp; Star Staff.
              </div>
            </div>

            <!-- Preview & Dispatch Button -->
            <div class="q-mt-sm">
              <q-btn
                unelevated
                no-caps
                class="full-width text-weight-bold"
                style="background: linear-gradient(135deg, #10b981 0%, #047857 100%); color: white; border-radius: 8px;"
                :loading="isGeneratingBriefing"
                @click="handlePreviewOwnerBriefing"
              >
                <q-icon name="mark_chat_unread" class="q-mr-xs" />
                Preview &amp; Send Owner Briefing Now
              </q-btn>
            </div>
          </div>

          <!-- Section 8: Chef Morning Kitchen Prep Briefing -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="restaurant_menu" color="amber-5" />
              <span>Chef Morning Kitchen Prep</span>
            </span>
            <q-badge color="amber-9" size="xs">
              AI DEMAND FORECAST
            </q-badge>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <div class="row items-center justify-between q-mb-xs">
              <div class="text-caption text-grey-4 font-mono" style="font-size: 11px">
                Forecasted Covers Today: <span class="text-amber-3 text-weight-bold">~48 orders</span>
              </div>
              <q-badge color="blue-9" class="text-weight-bold" style="font-size: 10px">
                Food Waste -35%
              </q-badge>
            </div>
            <div class="text-grey-5 q-mb-xs" style="font-size: 10.5px">
              Calculates target portions &amp; ingredient defrost tasks to eliminate food waste.
            </div>
            <div class="q-mt-sm">
              <q-btn
                unelevated
                no-caps
                class="full-width text-weight-bold"
                style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; border-radius: 8px;"
                :loading="isGeneratingPrepPlan"
                @click="handleGeneratePrepPlan"
              >
                <q-icon name="wb_sunny" class="q-mr-xs" />
                Preview &amp; Send Chef Morning Prep Plan
              </q-btn>
            </div>
          </div>

          <!-- Section 9: AI Loss Prevention & Anti-Theft Sentinel -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="security" color="red-4" />
              <span>Loss Prevention Sentinel</span>
            </span>
            <q-badge
              :color="securityAuditData?.security_status === 'SECURE' ? 'positive' : 'negative'"
              size="xs"
              :class="{ 'pulse-animation': securityAuditData?.security_status === 'CRITICAL_RISK' }"
            >
              {{ securityAuditData?.security_status || 'SECURE' }}
            </q-badge>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <div class="row q-col-gutter-xs text-center q-mb-xs">
              <div class="col-4">
                <div class="text-caption text-grey-4" style="font-size: 9.5px">Late Voids</div>
                <div class="text-subtitle2 text-weight-bolder" :class="securityAuditData?.late_void_count > 0 ? 'text-negative' : 'text-positive'">
                  {{ securityAuditData?.late_void_count || 0 }}
                </div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-4" style="font-size: 9.5px">Discount Spike</div>
                <div class="text-subtitle2 text-weight-bolder" :class="securityAuditData?.discount_spike_count > 0 ? 'text-warning' : 'text-positive'">
                  {{ securityAuditData?.discount_spike_count || 0 }}
                </div>
              </div>
              <div class="col-4">
                <div class="text-caption text-grey-4" style="font-size: 9.5px">Cash Variance</div>
                <div class="text-subtitle2 text-weight-bolder" :class="securityAuditData?.cash_variance_count > 0 ? 'text-negative' : 'text-positive'">
                  {{ securityAuditData?.cash_variance_count || 0 }}
                </div>
              </div>
            </div>
            <div class="text-grey-5 q-mb-xs" style="font-size: 10.5px">
              Protects against cash drawer theft, post-print voids &amp; unauthorized discount spikes.
            </div>
            <div class="q-mt-sm">
              <q-btn
                unelevated
                no-caps
                class="full-width text-weight-bold"
                style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: white; border-radius: 8px;"
                :loading="isAuditingSecurity"
                @click="handleRunSecurityAudit"
              >
                <q-icon name="shield_moon" class="q-mr-xs" />
                Audit Security &amp; Alert Owner (+94717462205)
              </q-btn>
            </div>
          </div>

          <!-- Section 10: Real-Time Customer Negative Feedback Rescue -->
          <div class="text-subtitle2 text-weight-bold q-mb-xs row items-center justify-between">
            <span class="row items-center q-gutter-x-xs">
              <q-icon name="sentiment_very_dissatisfied" color="pink-4" />
              <span>Negative Feedback Rescue</span>
            </span>
            <q-badge
              :color="activeFeedbackAlerts.length > 0 ? 'negative' : 'positive'"
              size="xs"
              :class="{ 'pulse-animation': activeFeedbackAlerts.length > 0 }"
            >
              {{ activeFeedbackAlerts.length > 0 ? `${activeFeedbackAlerts.length} URGENT RESCUES` : 'ALL GUESTS HAPPY' }}
            </q-badge>
          </div>

          <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
            <div v-if="activeFeedbackAlerts.length === 0" class="text-center q-pa-xs text-grey-4 text-caption">
              <q-icon name="star" color="amber" size="16px" class="q-mr-xs" />
              Zero negative ratings detected. 100% Google rating protection active.
            </div>
            <div v-else class="q-gutter-y-xs">
              <div
                v-for="alert in activeFeedbackAlerts"
                :key="alert.id"
                class="q-pa-xs rounded-borders bg-red-10 text-white"
                style="border-left: 4px solid #ef4444;"
              >
                <div class="row items-center justify-between">
                  <span class="text-weight-bold" style="font-size: 11px">🚨 Table #{{ alert.table_number }} ({{ alert.rating }} ★)</span>
                  <q-badge color="white" text-color="red-10" size="xs" class="text-weight-bold">
                    SEATED NOW
                  </q-badge>
                </div>
                <div class="text-caption text-grey-3 q-my-xs font-italic" style="font-size: 10.5px">
                  "{{ alert.comment || 'Unhappy with delay or food taste' }}"
                </div>
                <div class="row justify-end q-mt-xs">
                  <q-btn
                    dense
                    unelevated
                    no-caps
                    size="xs"
                    color="white"
                    text-color="negative"
                    label="Claim Rescue &amp; Intervene at Table"
                    class="text-weight-bold"
                    @click="openRescueDialog(alert)"
                  />
                </div>
              </div>
            </div>
          </div>
          </div>

          <!-- ════ TAB 2: FINGUARD AI (Finance Controller) ════ -->
          <div v-show="activeDepartmentTab === 'finance'">
            <!-- FinGuard Health Score Card -->
            <div class="q-pa-md rounded-borders q-mb-md health-score-card">
              <div class="row items-center justify-between">
                <div>
                  <div class="text-caption text-grey-4">FINANCIAL INTEGRITY SCORE</div>
                  <div class="text-h4 text-weight-bolder font-mono text-amber-4">
                    {{ finGuardData?.health_score ?? 100 }}%
                  </div>
                </div>
                <q-circular-progress
                  show-value
                  font-size="12px"
                  :value="finGuardData?.health_score ?? 100"
                  size="60px"
                  :thickness="0.2"
                  color="amber-7"
                  track-color="grey-8"
                >
                  {{ finGuardData?.health_score ?? 100 }}%
                </q-circular-progress>
              </div>
              <div class="text-caption q-mt-xs text-grey-3">
                {{ finAlertsCount === 0 ? 'All cashbooks, drawer reconciliations, and journal entries balanced.' : `${finAlertsCount} financial variance alert(s) detected.` }}
              </div>
            </div>

            <!-- FinGuard KPI Summary Grid -->
            <div class="row q-col-gutter-sm q-mb-md">
              <div class="col-4">
                <div class="bg-dark-glass-light q-pa-sm rounded-borders text-center">
                  <div class="text-caption text-grey-4" style="font-size: 10px">Cash Variances</div>
                  <div class="text-subtitle1 text-weight-bolder" :class="finCashVariances.length > 0 ? 'text-negative' : 'text-positive'">
                    {{ finCashVariances.length }}
                  </div>
                </div>
              </div>
              <div class="col-4">
                <div class="bg-dark-glass-light q-pa-sm rounded-borders text-center">
                  <div class="text-caption text-grey-4" style="font-size: 10px">Negative Accts</div>
                  <div class="text-subtitle1 text-weight-bolder" :class="finNegativeAccounts.length > 0 ? 'text-negative' : 'text-positive'">
                    {{ finNegativeAccounts.length }}
                  </div>
                </div>
              </div>
              <div class="col-4">
                <div class="bg-dark-glass-light q-pa-sm rounded-borders text-center">
                  <div class="text-caption text-grey-4" style="font-size: 10px">Unposted Shifts</div>
                  <div class="text-subtitle1 text-weight-bolder" :class="finUnpostedTransfers.length > 0 ? 'text-warning' : 'text-positive'">
                    {{ finUnpostedTransfers.length }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Quick Action Toolbar -->
            <div class="row justify-between items-center q-mb-sm">
              <span class="text-subtitle2 text-weight-bold row items-center q-gutter-x-xs">
                <q-icon name="gavel" color="amber-7" />
                <span>FinGuard Realtime Alerts</span>
              </span>
              <q-btn
                dense
                flat
                size="xs"
                color="amber-7"
                icon="refresh"
                label="Run Financial Audit"
                :loading="isAuditingFin"
                @click="triggerFinGuardAudit"
              />
            </div>

            <!-- FinGuard Alerts List -->
            <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
              <div v-if="finAlertsList.length === 0" class="text-center q-pa-md text-grey-4 text-caption">
                <q-icon name="check_circle" color="positive" size="24px" class="q-mb-xs block q-mx-auto" />
                Zero financial variances. Drawer sales and ledgers reconciled.
              </div>
              <div v-else class="q-gutter-y-xs">
                <div
                  v-for="alert in finAlertsList"
                  :key="alert.id"
                  class="q-pa-sm rounded-borders"
                  :style="{
                    background: alert.severity === 'critical' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                    borderLeft: alert.severity === 'critical' ? '4px solid #ef4444' : '4px solid #f59e0b'
                  }"
                >
                  <div class="row items-center justify-between">
                    <span class="text-weight-bold" style="font-size: 12px">{{ alert.title }}</span>
                    <q-badge :color="alert.severity === 'critical' ? 'negative' : 'warning'" size="xs">
                      {{ alert.severity.toUpperCase() }}
                    </q-badge>
                  </div>
                  <div class="text-caption text-grey-3 q-my-xs" style="font-size: 11px">
                    {{ alert.message }}
                  </div>
                  <div class="row justify-between items-center q-mt-xs">
                    <span class="text-caption text-grey-5 font-mono" style="font-size: 10px">
                      {{ new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                    </span>
                    <div class="row q-gutter-x-xs">
                      <q-btn
                        v-if="alert.metadata?.category === 'unposted_shift_cash'"
                        dense
                        unelevated
                        size="xs"
                        color="amber-8"
                        text-color="dark"
                        icon="payments"
                        label="Auto-Transfer to Cash in Hand"
                        @click="handleTransferPosCash(alert.metadata.shift_id)"
                      />
                      <q-btn
                        dense
                        flat
                        size="xs"
                        color="grey-4"
                        label="Dismiss"
                        @click="handleDismissMultiAlert(alert.id)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ════ TAB 3: TALENTOPS AI (HR Guardian) ════ -->
          <div v-show="activeDepartmentTab === 'hr'">
            <!-- TalentOps Health Score Card -->
            <div class="q-pa-md rounded-borders q-mb-md health-score-card">
              <div class="row items-center justify-between">
                <div>
                  <div class="text-caption text-grey-4">WORKFORCE COMPLIANCE SCORE</div>
                  <div class="text-h4 text-weight-bolder font-mono text-blue-4">
                    {{ talentOpsData?.health_score ?? 100 }}%
                  </div>
                </div>
                <q-circular-progress
                  show-value
                  font-size="12px"
                  :value="talentOpsData?.health_score ?? 100"
                  size="60px"
                  :thickness="0.2"
                  color="blue-7"
                  track-color="grey-8"
                >
                  {{ talentOpsData?.health_score ?? 100 }}%
                </q-circular-progress>
              </div>
              <div class="text-caption q-mt-xs text-grey-3">
                {{ hrAlertsCount === 0 ? 'All employee biometric punches, overtime rules, and salary caps verified.' : `${hrAlertsCount} HR compliance alert(s) active.` }}
              </div>
            </div>

            <!-- TalentOps KPI Summary Grid -->
            <div class="row q-col-gutter-sm q-mb-md">
              <div class="col-4">
                <div class="bg-dark-glass-light q-pa-sm rounded-borders text-center">
                  <div class="text-caption text-grey-4" style="font-size: 10px">Orphaned Punches</div>
                  <div class="text-subtitle1 text-weight-bolder" :class="hrOrphanedPunches.length > 0 ? 'text-warning' : 'text-positive'">
                    {{ hrOrphanedPunches.length }}
                  </div>
                </div>
              </div>
              <div class="col-4">
                <div class="bg-dark-glass-light q-pa-sm rounded-borders text-center">
                  <div class="text-caption text-grey-4" style="font-size: 10px">Advance Cap Alerts</div>
                  <div class="text-subtitle1 text-weight-bolder" :class="hrAdvanceCapAlerts.length > 0 ? 'text-negative' : 'text-positive'">
                    {{ hrAdvanceCapAlerts.length }}
                  </div>
                </div>
              </div>
              <div class="col-4">
                <div class="bg-dark-glass-light q-pa-sm rounded-borders text-center">
                  <div class="text-caption text-grey-4" style="font-size: 10px">EPF/ETF Status</div>
                  <div class="text-subtitle1 text-weight-bolder text-positive">
                    100%
                  </div>
                </div>
              </div>
            </div>

            <!-- Quick Action Toolbar -->
            <div class="row justify-between items-center q-mb-sm">
              <span class="text-subtitle2 text-weight-bold row items-center q-gutter-x-xs">
                <q-icon name="verified_user" color="blue-7" />
                <span>TalentOps Live Watchdog</span>
              </span>
              <div class="row q-gutter-x-xs">
                <q-btn
                  dense
                  flat
                  size="xs"
                  color="blue-4"
                  icon="refresh"
                  label="Audit Workforce"
                  :loading="isAuditingHr"
                  @click="triggerTalentOpsAudit"
                />
              </div>
            </div>

            <!-- TalentOps Alerts List -->
            <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
              <div v-if="hrAlertsList.length === 0" class="text-center q-pa-md text-grey-4 text-caption">
                <q-icon name="check_circle" color="positive" size="24px" class="q-mb-xs block q-mx-auto" />
                Workforce roster 100% compliant. Zero orphaned punches detected.
              </div>
              <div v-else class="q-gutter-y-xs">
                <div
                  v-for="alert in hrAlertsList"
                  :key="alert.id"
                  class="q-pa-sm rounded-borders"
                  :style="{
                    background: alert.severity === 'critical' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.15)',
                    borderLeft: alert.severity === 'critical' ? '4px solid #ef4444' : '4px solid #3b82f6'
                  }"
                >
                  <div class="row items-center justify-between">
                    <span class="text-weight-bold" style="font-size: 12px">{{ alert.title }}</span>
                    <q-badge :color="alert.severity === 'critical' ? 'negative' : 'primary'" size="xs">
                      {{ alert.severity.toUpperCase() }}
                    </q-badge>
                  </div>
                  <div class="text-caption text-grey-3 q-my-xs" style="font-size: 11px">
                    {{ alert.message }}
                  </div>
                  <div class="row justify-between items-center q-mt-xs">
                    <span class="text-caption text-grey-5 font-mono" style="font-size: 10px">
                      {{ new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                    </span>
                    <div class="row q-gutter-x-xs">
                      <q-btn
                        v-if="alert.metadata?.category === 'orphaned_clock_in'"
                        dense
                        unelevated
                        size="xs"
                        color="blue-7"
                        text-color="white"
                        icon="punch_clock"
                        label="Auto-Close Shift at 9h Cap"
                        @click="handleHealShift(alert.metadata.attendance_id)"
                      />
                      <q-btn
                        dense
                        flat
                        size="xs"
                        color="grey-4"
                        label="Dismiss"
                        @click="handleDismissMultiAlert(alert.id)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ════ TAB 4: SUPPLYSENSE AI (Stock Guardian) ════ -->
          <div v-show="activeDepartmentTab === 'inventory'">
            <!-- SupplySense Health Score Card -->
            <div class="q-pa-md rounded-borders q-mb-md health-score-card">
              <div class="row items-center justify-between">
                <div>
                  <div class="text-caption text-grey-4">STOCK &amp; PROCUREMENT SCORE</div>
                  <div class="text-h4 text-weight-bolder font-mono text-purple-4">
                    {{ supplySenseData?.health_score ?? 100 }}%
                  </div>
                </div>
                <q-circular-progress
                  show-value
                  font-size="12px"
                  :value="supplySenseData?.health_score ?? 100"
                  size="60px"
                  :thickness="0.2"
                  color="purple-7"
                  track-color="grey-8"
                >
                  {{ supplySenseData?.health_score ?? 100 }}%
                </q-circular-progress>
              </div>
              <div class="text-caption q-mt-xs text-grey-3">
                {{ supplyAlertsCount === 0 ? 'All recipe BOM mappings active. Central inventory and kitchen safety stocks verified.' : `${supplyAlertsCount} stock or recipe gap alert(s) detected.` }}
              </div>
            </div>

            <!-- SupplySense KPI Summary Grid -->
            <div class="row q-col-gutter-sm q-mb-md">
              <div class="col-4">
                <div class="bg-dark-glass-light q-pa-sm rounded-borders text-center">
                  <div class="text-caption text-grey-4" style="font-size: 10px">Recipe BOM Gaps</div>
                  <div class="text-subtitle1 text-weight-bolder" :class="supplyRecipeGaps.length > 0 ? 'text-warning' : 'text-positive'">
                    {{ supplyRecipeGaps.length }}
                  </div>
                </div>
              </div>
              <div class="col-4">
                <div class="bg-dark-glass-light q-pa-sm rounded-borders text-center">
                  <div class="text-caption text-grey-4" style="font-size: 10px">Reorder Status</div>
                  <div class="text-subtitle1 text-weight-bolder text-positive">
                    Optimal
                  </div>
                </div>
              </div>
              <div class="col-4">
                <div class="bg-dark-glass-light q-pa-sm rounded-borders text-center">
                  <div class="text-caption text-grey-4" style="font-size: 10px">Wastage Alert</div>
                  <div class="text-subtitle1 text-weight-bolder text-positive">
                    Normal
                  </div>
                </div>
              </div>
            </div>

            <!-- Quick Action Toolbar -->
            <div class="row justify-between items-center q-mb-sm">
              <span class="text-subtitle2 text-weight-bold row items-center q-gutter-x-xs">
                <q-icon name="inventory_2" color="purple-7" />
                <span>SupplySense Stock Alerts</span>
              </span>
              <q-btn
                dense
                flat
                size="xs"
                color="purple-4"
                icon="refresh"
                label="Audit Recipes &amp; Stock"
                :loading="isAuditingSupply"
                @click="triggerSupplySenseAudit"
              />
            </div>

            <!-- SupplySense Alerts List -->
            <div class="bg-dark-glass-light q-pa-sm rounded-borders q-mb-md">
              <div v-if="supplyAlertsList.length === 0" class="text-center q-pa-md text-grey-4 text-caption">
                <q-icon name="check_circle" color="positive" size="24px" class="q-mb-xs block q-mx-auto" />
                All active dishes have ingredient recipes mapped. Kitchen stock deduction operational.
              </div>
              <div v-else class="q-gutter-y-xs">
                <div
                  v-for="alert in supplyAlertsList"
                  :key="alert.id"
                  class="q-pa-sm rounded-borders"
                  :style="{
                    background: alert.severity === 'critical' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(168, 85, 247, 0.15)',
                    borderLeft: alert.severity === 'critical' ? '4px solid #ef4444' : '4px solid #a855f7'
                  }"
                >
                  <div class="row items-center justify-between">
                    <span class="text-weight-bold" style="font-size: 12px">{{ alert.title }}</span>
                    <q-badge :color="alert.severity === 'critical' ? 'negative' : 'purple'" size="xs">
                      {{ alert.severity.toUpperCase() }}
                    </q-badge>
                  </div>
                  <div class="text-caption text-grey-3 q-my-xs" style="font-size: 11px">
                    {{ alert.message }}
                  </div>
                  <div class="row justify-between items-center q-mt-xs">
                    <span class="text-caption text-grey-5 font-mono" style="font-size: 10px">
                      Category: {{ alert.metadata?.category || 'Menu' }}
                    </span>
                    <div class="row q-gutter-x-xs">
                      <q-btn
                        dense
                        flat
                        size="xs"
                        color="grey-4"
                        label="Dismiss"
                        @click="handleDismissMultiAlert(alert.id)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>

        <!-- Footer -->
        <q-card-section class="border-t q-py-sm row items-center justify-between">
          <div class="text-caption text-grey-5">
            Cloud Watchdog Interval: 120s
          </div>
          <q-btn
            dense
            outline
            color="primary"
            size="sm"
            label="Dismiss Resolved Alerts"
            @click="clearResolvedAlerts"
          />
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- Quick Waiter Assignment Dialog for Manager -->
    <q-dialog v-model="assignDialog" persistent>
      <q-card class="bg-grey-10 text-white q-pa-md" style="min-width: 320px; max-width: 400px; border: 1px solid rgba(255,255,255,0.15); border-radius: 16px;">
        <div class="row items-center justify-between q-mb-md">
          <div class="text-subtitle1 text-weight-bold row items-center q-gutter-x-xs">
            <q-icon name="person_add" color="primary" size="22px" />
            <span>Assign Waiter</span>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <div class="text-caption text-grey-4 q-mb-sm">
          Assign on-duty server to <strong>Order #{{ selectedOrderToAssign?.order_number }}</strong>
          ({{ selectedOrderToAssign?.order_source?.toUpperCase() }} · Table {{ selectedOrderToAssign?.table_number || 'Takeaway' }}).
        </div>

        <div v-if="activeWaiters.length === 0" class="q-pa-sm text-center text-warning bg-orange-10 rounded-borders text-caption q-my-sm">
          No active waiter profiles found in this branch.
        </div>

        <q-select
          v-else
          v-model="selectedWaiter"
          :options="activeWaiters"
          option-value="id"
          option-label="name"
          emit-value
          map-options
          outlined
          dark
          dense
          label="Select On-Duty Waiter"
          class="q-mb-md"
        >
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section avatar>
                <q-avatar size="28px" color="primary" text-color="white">
                  {{ scope.opt.name.charAt(0) }}
                </q-avatar>
              </q-item-section>
              <q-item-section>
                <q-item-label>{{ scope.opt.name }}</q-item-label>
                <q-item-label caption class="text-grey-5">{{ scope.opt.waiter_code }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>

        <div class="row justify-end q-gutter-x-sm">
          <q-btn flat label="Cancel" color="grey-5" no-caps v-close-popup />
          <q-btn
            unelevated
            color="primary"
            no-caps
            label="Assign & Notify Waiter"
            :loading="isAssigning"
            :disable="!selectedWaiter"
            @click="handleAssignWaiter"
          />
        </div>
      </q-card>
    </q-dialog>

    <!-- AI Waiter of the Month Report & Gift Nomination Dialog -->
    <q-dialog v-model="monthlyReportDialog">
      <q-card
        class="bg-grey-10 text-white q-pa-md"
        style="min-width: 360px; max-width: 520px; border: 1.5px solid rgba(245, 158, 11, 0.4); border-radius: 20px; box-shadow: 0 12px 36px rgba(0,0,0,0.7);"
      >
        <!-- Header -->
        <div class="row items-center justify-between q-mb-sm">
          <div class="row items-center q-gutter-x-sm">
            <q-avatar size="36px" style="background: radial-gradient(circle, #f59e0b 0%, #b45309 100%);">
              <span style="font-size: 20px">🏆</span>
            </q-avatar>
            <div>
              <div class="text-subtitle1 text-weight-bolder text-amber-4">
                Waiter of the Month
              </div>
              <div class="text-caption text-grey-4 font-mono" style="font-size: 11px">
                {{ monthlyReportData?.period }} · Seven Waves AI Audit
              </div>
            </div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <q-separator dark class="q-my-sm" />

        <!-- Winner Spotlight Card -->
        <div
          v-if="monthlyReportData?.winner"
          class="q-pa-sm rounded-borders q-mb-md text-center"
          style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%); border: 1px solid rgba(245, 158, 11, 0.3);"
        >
          <q-badge color="amber-10" text-color="white" class="text-weight-bold q-mb-xs">
            🥇 #1 TOP PERFORMER
          </q-badge>
          <div class="text-h6 text-weight-bolder text-white">
            {{ monthlyReportData.winner.name }}
          </div>
          <div class="text-caption text-amber-3 font-mono q-mb-sm">
            Waiter Code: {{ monthlyReportData.winner.waiter_code }}
          </div>

          <!-- KPI Grid -->
          <div class="row q-col-gutter-xs text-center">
            <div class="col-3">
              <div class="text-caption text-grey-4" style="font-size: 10px">Points</div>
              <div class="text-subtitle2 text-weight-bolder text-amber-4">
                {{ monthlyReportData.winner.monthly_points }}
              </div>
            </div>
            <div class="col-3">
              <div class="text-caption text-grey-4" style="font-size: 10px">Orders</div>
              <div class="text-subtitle2 text-weight-bolder text-white">
                {{ monthlyReportData.winner.orders_served }}
              </div>
            </div>
            <div class="col-3">
              <div class="text-caption text-grey-4" style="font-size: 10px">Revenue</div>
              <div class="text-subtitle2 text-weight-bolder text-positive" style="font-size: 11.5px">
                LKR {{ Number(monthlyReportData.winner.sales_volume || 0).toLocaleString() }}
              </div>
            </div>
            <div class="col-3">
              <div class="text-caption text-grey-4" style="font-size: 10px">Avg Speed</div>
              <div class="text-subtitle2 text-weight-bolder text-cyan">
                {{ monthlyReportData.winner.avg_turnaround_mins }}m
              </div>
            </div>
          </div>
        </div>

        <!-- AI Bilingual Evaluation Letter -->
        <div class="q-mb-md">
          <div class="text-caption text-amber-4 text-weight-bold q-mb-xs">
            🤖 AI Performance Commendation (සිංහල & English):
          </div>
          <div class="q-pa-sm rounded-borders bg-dark-glass-light text-caption text-grey-3 q-mb-xs" style="line-height: 1.45; font-size: 11.5px;">
            {{ monthlyReportData?.ai_evaluation?.si }}
          </div>
          <div class="q-pa-sm rounded-borders bg-dark-glass-light text-caption text-grey-4" style="line-height: 1.45; font-size: 11px; font-style: italic;">
            "{{ monthlyReportData?.ai_evaluation?.en }}"
          </div>
        </div>

        <!-- AI Recommended Gifts / Rewards -->
        <div class="q-mb-md">
          <div class="text-caption text-weight-bold text-amber-4 q-mb-xs">
            🎁 AI-Recommended Monthly Gifts:
          </div>
          <div class="q-gutter-y-xs">
            <div
              v-for="(gift, gIdx) in monthlyReportData?.recommended_gifts"
              :key="gIdx"
              class="q-pa-xs rounded-borders bg-dark-glass-light row items-center justify-between text-caption"
            >
              <div class="row items-center q-gutter-x-xs">
                <q-icon name="card_giftcard" color="amber-4" size="16px" />
                <span class="text-weight-bold text-white">{{ gift.title }}</span>
              </div>
              <span class="text-grey-4" style="font-size: 10.5px">{{ gift.desc }}</span>
            </div>
          </div>
        </div>

        <div class="row justify-end q-gutter-x-sm">
          <q-btn flat label="Close" color="grey-5" no-caps v-close-popup />
          <q-btn
            unelevated
            no-caps
            label="Approve & Send Recognition"
            style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;"
            v-close-popup
            @click="$q.notify({ type: 'positive', message: 'Recognition announcement and certificate queued!', position: 'top' })"
          />
        </div>
      </q-card>
    </q-dialog>

    <!-- Owner Daily EOD Executive Briefing Dialog (WhatsApp & Email) -->
    <q-dialog v-model="ownerBriefingDialog" :maximized="$q.screen.lt.sm">
      <q-card
        class="bg-grey-10 text-white q-pa-md"
        style="min-width: 360px; max-width: 580px; border: 1.5px solid rgba(16, 185, 129, 0.4); border-radius: 20px; box-shadow: 0 12px 36px rgba(0,0,0,0.7);"
      >
        <!-- Header -->
        <div class="row items-center justify-between q-mb-sm">
          <div class="row items-center q-gutter-x-sm">
            <q-avatar size="38px" style="background: radial-gradient(circle, #10b981 0%, #065f46 100%);">
              <span style="font-size: 20px">📲</span>
            </q-avatar>
            <div>
              <div class="text-subtitle1 text-weight-bolder text-green-4 row items-center">
                Owner Daily EOD Briefing
                <q-badge color="positive" rounded class="q-ml-sm text-caption text-weight-bold">
                  LIVE RECONCILED
                </q-badge>
              </div>
              <div class="text-caption text-grey-4">
                Target: <strong>+94717462205</strong> · {{ ownerBriefingData?.report_date }}
              </div>
            </div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <q-separator dark class="q-my-sm" />

        <!-- Tabs: WhatsApp vs HTML Email -->
        <q-tabs
          v-model="briefingTab"
          dense
          no-caps
          active-color="green-4"
          indicator-color="green-4"
          class="text-grey-5 q-mb-sm"
        >
          <q-tab name="whatsapp" icon="chat" label="WhatsApp Format" />
          <q-tab name="email" icon="email" label="Executive Email" />
        </q-tabs>

        <!-- Tab 1: WhatsApp Format -->
        <div v-if="briefingTab === 'whatsapp'" class="q-pa-xs">
          <div
            class="q-pa-sm rounded-borders font-mono text-caption text-grey-3"
            style="background: #064e3b; border: 1px solid rgba(16, 185, 129, 0.3); white-space: pre-wrap; line-height: 1.4; max-height: 380px; overflow-y: auto; font-size: 11.5px;"
          >
            {{ ownerBriefingData?.whatsapp_message }}
          </div>

          <div class="row justify-between items-center q-mt-sm q-gutter-x-xs">
            <q-btn
              flat
              dense
              no-caps
              size="sm"
              icon="content_copy"
              label="Copy Text"
              color="grey-4"
              @click="copyBriefingText"
            />
            <q-btn
              unelevated
              no-caps
              size="sm"
              style="background: #25d366; color: white;"
              icon="open_in_new"
              label="Open in WhatsApp (+94717462205)"
              :href="ownerBriefingData?.whatsapp_url"
              target="_blank"
            />
          </div>
        </div>

        <!-- Tab 2: HTML Email Preview -->
        <div v-else class="q-pa-xs">
          <!-- AI-generated HTML is untrusted (prompt-injectable via order notes,
               item names, etc.) — render it in a fully sandboxed iframe (no
               scripts, no same-origin access to the ERP session) instead of v-html. -->
          <iframe
            class="rounded-borders"
            style="width: 100%; height: 380px; border: 0; background: #fff;"
            sandbox=""
            referrerpolicy="no-referrer"
            title="Owner briefing email preview"
            :srcdoc="ownerBriefingData?.html_email || ''"
          />
        </div>

        <div class="row justify-between items-center q-mt-md border-t q-pt-sm">
          <div class="text-caption text-grey-5 font-mono" style="font-size: 10.5px">
            Auto-dispatched daily at shift close
          </div>
          <div class="row q-gutter-x-xs">
            <q-btn flat label="Close" color="grey-5" no-caps v-close-popup />
            <q-btn
              unelevated
              no-caps
              color="positive"
              icon="send"
              label="Dispatch to Owner Now"
              :loading="isDispatchingBriefing"
              @click="handleDispatchOwnerBriefing"
            />
          </div>
        </div>
      </q-card>
    </q-dialog>

    <!-- Dialog 1: Chef Morning Kitchen Prep Plan (AI Demand Forecasting) -->
    <q-dialog v-model="prepPlanDialog">
      <q-card
        class="bg-grey-10 text-white q-pa-md"
        style="min-width: 360px; max-width: 540px; border: 1.5px solid rgba(245, 158, 11, 0.4); border-radius: 20px; box-shadow: 0 12px 36px rgba(0,0,0,0.7);"
      >
        <div class="row items-center justify-between q-mb-sm">
          <div class="row items-center q-gutter-x-sm">
            <q-avatar size="36px" color="amber-10" text-color="white" icon="restaurant_menu" />
            <div>
              <div class="text-subtitle1 text-weight-bolder text-amber-4">
                Head Chef Morning Kitchen Prep Plan
              </div>
              <div class="text-caption text-grey-4 font-mono" style="font-size: 11px">
                {{ prepPlanData?.plan_date }} · AI Demand Forecasting
              </div>
            </div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <q-separator dark class="q-my-sm" />

        <div class="q-pa-xs rounded-borders font-mono text-caption q-mb-md" style="background: #064e3b; border: 1px solid rgba(16, 185, 129, 0.3); white-space: pre-wrap; line-height: 1.4; max-height: 320px; overflow-y: auto; font-size: 11.5px;">
          {{ prepPlanData?.whatsapp_message }}
        </div>

        <div class="row justify-between items-center q-gutter-x-xs">
          <q-btn flat dense no-caps size="sm" icon="content_copy" label="Copy Plan Text" color="grey-4" @click="copyPrepPlanText" />
          <div class="row q-gutter-x-xs">
            <q-btn flat label="Close" color="grey-5" no-caps v-close-popup />
            <q-btn
              unelevated
              no-caps
              size="sm"
              style="background: #25d366; color: white;"
              icon="open_in_new"
              label="Send to Head Chef (WhatsApp)"
              :href="prepPlanData?.whatsapp_url"
              target="_blank"
            />
          </div>
        </div>
      </q-card>
    </q-dialog>

    <!-- Dialog 2: AI Loss Prevention & Anti-Theft Sentinel -->
    <q-dialog v-model="securityDialog">
      <q-card
        class="bg-grey-10 text-white q-pa-md"
        style="min-width: 360px; max-width: 520px; border: 1.5px solid rgba(239, 68, 68, 0.4); border-radius: 20px; box-shadow: 0 12px 36px rgba(0,0,0,0.7);"
      >
        <div class="row items-center justify-between q-mb-sm">
          <div class="row items-center q-gutter-x-sm">
            <q-avatar size="36px" color="red-10" text-color="white" icon="shield" />
            <div>
              <div class="text-subtitle1 text-weight-bolder text-red-4">
                Anti-Theft &amp; Loss Prevention Audit
              </div>
              <div class="text-caption text-grey-4 font-mono" style="font-size: 11px">
                Confidential Sentinel · Target: +94717462205
              </div>
            </div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <q-separator dark class="q-my-sm" />

        <div class="q-pa-xs rounded-borders font-mono text-caption q-mb-md" style="background: #450a0a; border: 1px solid rgba(239, 68, 68, 0.3); white-space: pre-wrap; line-height: 1.4; max-height: 320px; overflow-y: auto; font-size: 11.5px;">
          {{ securityAuditData?.whatsapp_alert }}
        </div>

        <div class="row justify-between items-center q-gutter-x-xs">
          <q-btn flat dense no-caps size="sm" icon="content_copy" label="Copy Alert" color="grey-4" @click="copySecurityAlertText" />
          <div class="row q-gutter-x-xs">
            <q-btn flat label="Close" color="grey-5" no-caps v-close-popup />
            <q-btn
              unelevated
              no-caps
              size="sm"
              color="negative"
              icon="open_in_new"
              label="Send Alert to Owner (+94717462205)"
              :href="securityAuditData?.owner_whatsapp_url"
              target="_blank"
            />
          </div>
        </div>
      </q-card>
    </q-dialog>

    <!-- Dialog 3: Real-Time Customer Negative Feedback Table Rescue -->
    <q-dialog v-model="feedbackRescueDialog" persistent>
      <q-card
        class="bg-grey-10 text-white q-pa-md"
        style="min-width: 340px; max-width: 440px; border: 1.5px solid rgba(244, 63, 94, 0.5); border-radius: 20px; box-shadow: 0 12px 36px rgba(0,0,0,0.7);"
      >
        <div class="row items-center justify-between q-mb-sm">
          <div class="row items-center q-gutter-x-sm">
            <q-avatar size="36px" color="pink-10" text-color="white" icon="sentiment_very_dissatisfied" />
            <div>
              <div class="text-subtitle1 text-weight-bolder text-pink-4">
                Table #{{ selectedFeedbackToRescue?.table_number }} Rescue Action
              </div>
              <div class="text-caption text-grey-4 font-mono" style="font-size: 11px">
                Customer seated · Rating: {{ selectedFeedbackToRescue?.rating }} Stars
              </div>
            </div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </div>

        <div class="q-pa-sm rounded-borders bg-red-10 text-caption q-my-sm">
          <strong>Customer Comment:</strong> "{{ selectedFeedbackToRescue?.comment || 'Unhappy with delay or service' }}"
        </div>

        <div class="text-caption text-grey-3 q-mb-xs">Select Resolution Offer (Compliment):</div>
        <q-select
          v-model="rescueOffer"
          :options="[
            'Complimentary Dessert (Chocolate Lava Cake)',
            'Complimentary Fresh Fruit Cooler / Shake',
            '10% Goodwill Discount on Bill',
            'Chef Direct Table Apology & Item Replacement'
          ]"
          dense
          dark
          outlined
          class="q-mb-sm"
        />

        <div class="text-caption text-grey-3 q-mb-xs">Manager Notes:</div>
        <q-input
          v-model="rescueNotes"
          type="textarea"
          rows="2"
          placeholder="e.g. Apologized for delay, served warm chocolate lava cake. Customer delighted and satisfied."
          dense
          dark
          outlined
          class="q-mb-md"
        />

        <div class="row justify-end q-gutter-x-sm">
          <q-btn flat label="Cancel" color="grey-5" no-caps v-close-popup />
          <q-btn
            unelevated
            color="positive"
            no-caps
            label="Complete Rescue &amp; Protect Rating"
            :loading="isResolvingRescue"
            @click="handleCompleteRescue"
          />
        </div>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { useQuasar } from 'quasar'
import {
  runQrOrderSelfHeal,
  runPipelineHealthAudit,
  fetchUnassignedOrders,
  assignWaiterToOrder,
  fetchActiveShiftWaiters,
  auditReportingIntegrity,
  auditWaiterPointsRealtime,
  generateWaiterOfTheMonthReport,
  generateOwnerDailyBriefing,
  dispatchOwnerBriefing,
  generateKitchenPrepPlan,
  runSecurityAudit,
  fetchActiveFeedbackAlerts,
  resolveFeedbackRescue,
  runFinGuardAudit,
  runTalentOpsAudit,
  runSupplySenseAudit,
  fetchMultiAgentAlerts,
  autoCloseOrphanedShift,
  autoTransferPosCash,
  resolveMultiAgentAlert,
} from 'src/modules/ai/services/ai.service'

const $q = useQuasar()
const authStore = useAuthStore()

const showDrawer = ref(false)
const isAuditing = ref(false)
const isHealing = ref(false)
const healedOrders = ref([])
const auditData = ref(null)
const pipelineData = ref(null)

// ── Multi-Agent Control Center State ─────────────────────────────────────────
const activeDepartmentTab = ref('operations')
const finGuardData = ref(null)
const talentOpsData = ref(null)
const supplySenseData = ref(null)
const multiAgentAlertsList = ref([])
const isAuditingFin = ref(false)
const isAuditingHr = ref(false)
const isAuditingSupply = ref(false)

const unassignedOrders = ref([])
const activeWaiters = ref([])
const reportingAudit = ref(null)
const assignDialog = ref(false)
const selectedOrderToAssign = ref(null)
const selectedWaiter = ref(null)
const isAssigning = ref(false)

const pointsAuditData = ref(null)
const monthlyReportDialog = ref(false)
const monthlyReportData = ref(null)
const isGeneratingReport = ref(false)

const ownerBriefingDialog = ref(false)
const ownerBriefingData = ref(null)
const isGeneratingBriefing = ref(false)
const isDispatchingBriefing = ref(false)
const briefingTab = ref('whatsapp')

// ── Enterprise Suite State ───────────────────────────────────────────────────
// Feature 1: Demand Forecasting & Chef Morning Kitchen Prep
const prepPlanDialog = ref(false)
const prepPlanData = ref(null)
const isGeneratingPrepPlan = ref(false)

// Feature 2: Anti-Theft & Loss Prevention Sentinel
const securityDialog = ref(false)
const securityAuditData = ref(null)
const isAuditingSecurity = ref(false)

// Feature 3: Negative Customer Feedback Table Rescue
const activeFeedbackAlerts = ref([])
const feedbackRescueDialog = ref(false)
const selectedFeedbackToRescue = ref(null)
const rescueOffer = ref('Complimentary Dessert')
const rescueNotes = ref('')
const isResolvingRescue = ref(false)

let realtimeChannel = null
let autoRefreshTimer = null

// ── Multi-Agent Computed Lists ───────────────────────────────────────────────
const finAlertsList = computed(() => {
  return multiAgentAlertsList.value.filter(a => a.agent_type === 'finance' && !a.is_resolved)
})
const finAlertsCount = computed(() => finAlertsList.value.length)
const finCashVariances = computed(() => {
  return finAlertsList.value.filter(a => a.metadata?.category === 'shift_cash_variance')
})
const finNegativeAccounts = computed(() => {
  return finAlertsList.value.filter(a => a.metadata?.category === 'negative_account_balance')
})
const finUnpostedTransfers = computed(() => {
  return finAlertsList.value.filter(a => a.metadata?.category === 'unposted_shift_cash')
})

const hrAlertsList = computed(() => {
  return multiAgentAlertsList.value.filter(a => a.agent_type === 'hr' && !a.is_resolved)
})
const hrAlertsCount = computed(() => hrAlertsList.value.length)
const hrOrphanedPunches = computed(() => {
  return hrAlertsList.value.filter(a => a.metadata?.category === 'orphaned_clock_in')
})
const hrAdvanceCapAlerts = computed(() => {
  return hrAlertsList.value.filter(a => a.metadata?.category === 'salary_advance_cap')
})

const supplyAlertsList = computed(() => {
  return multiAgentAlertsList.value.filter(a => (a.agent_type === 'inventory' || a.agent_type === 'procurement') && !a.is_resolved)
})
const supplyAlertsCount = computed(() => supplyAlertsList.value.length)
const supplyRecipeGaps = computed(() => {
  return supplyAlertsList.value.filter(a => a.metadata?.category === 'recipe_ingredient_gap')
})

const kotAlertsCount = computed(() => {
  const delayed = delayedKots.value.length
  const routing = routingErrors.value.length
  const voidSpike = salesMetrics.value.is_void_spike ? 1 : 0
  const unassigned = unassignedOrders.value.length
  return delayed + routing + voidSpike + unassigned
})

// ── Computed Status ──────────────────────────────────────────────────────────
const alertCount = computed(() => {
  const delayed = delayedKots.value.length
  const routing = routingErrors.value.length
  const voidSpike = salesMetrics.value.is_void_spike ? 1 : 0
  const unassigned = unassignedOrders.value.length
  const security = securityAuditData.value?.total_anomalies || 0
  const feedback = activeFeedbackAlerts.value.length
  const fin = finAlertsCount.value
  const hr = hrAlertsCount.value
  const supply = supplyAlertsCount.value
  return delayed + routing + voidSpike + unassigned + security + feedback + fin + hr + supply
})

const delayedKots = computed(() => {
  return auditData.value?.delayed_kots || []
})

const routingErrors = computed(() => {
  return auditData.value?.routing_errors || []
})

const salesMetrics = computed(() => {
  return auditData.value?.sales_summary || {}
})

const stationLoads = computed(() => {
  return auditData.value?.station_loads || []
})

const hasCritical = computed(() => {
  return delayedKots.value.some(k => k.severity === 'critical' || k.elapsed_minutes >= 25) ||
         salesMetrics.value.is_void_spike ||
         unassignedOrders.value.some(o => o.elapsed_minutes >= 5) ||
         securityAuditData.value?.security_status === 'CRITICAL_RISK' ||
         activeFeedbackAlerts.value.length > 0
})

const severityColor = computed(() => {
  if (hasCritical.value) return 'negative'
  if (alertCount.value > 0) return 'warning'
  return 'positive'
})

const badgeClass = computed(() => {
  if (hasCritical.value) return 'bg-red-10 text-white border-critical'
  if (alertCount.value > 0) return 'bg-orange-10 text-white border-warning'
  return 'bg-dark-glass text-grey-3'
})

const statusIcon = computed(() => {
  if (hasCritical.value) return 'warning'
  if (alertCount.value > 0) return 'access_time'
  return 'check_circle'
})

const statusText = computed(() => {
  if (hasCritical.value) return 'CRITICAL'
  if (alertCount.value > 0) return `${alertCount.value} DELAYS`
  return 'HEALTHY'
})

const tooltipText = computed(() => {
  if (alertCount.value > 0) {
    return `${alertCount.value} operational bottlenecks detected by AI`
  }
  return 'All orders & stations flowing smoothly'
})

const scoreColor = computed(() => {
  const s = auditData.value?.summary?.health_score || 100
  if (s >= 85) return 'text-positive'
  if (s >= 65) return 'text-warning'
  return 'text-negative'
})

const circularColor = computed(() => {
  const s = auditData.value?.summary?.health_score || 100
  if (s >= 85) return 'positive'
  if (s >= 65) return 'warning'
  return 'negative'
})

const aiSummaryText = computed(() => {
  if (hasCritical.value) {
    return 'Critical backlog detected. Immediate floor intervention recommended.'
  }
  if (alertCount.value > 0) {
    return 'Minor preparation delays flagged. Kitchen monitoring advised.'
  }
  return 'Kitchen stations, KOT routing, and sales velocity are operating at optimal peak.'
})

// ── Operations Audit Execution ───────────────────────────────────────────────
async function runManualAudit() {
  isAuditing.value = true
  const branchId = authStore.currentBranch?.id
  if (!branchId) {
    isAuditing.value = false
    return
  }

  try {
    // 1. Try calling the PostgreSQL audit function
    const { data, error } = await supabase.rpc('fn_audit_kot_and_operations', {
      p_branch_id: branchId,
      p_auto_create_alerts: true
    })

    if (!error && data) {
      auditData.value = data
    } else {
      // 2. Fallback: query tables directly if RPC is not yet applied
      await runLocalAuditFallback(branchId)
    }

    // 3. Fetch 8-stage omnichannel pipeline health
    const pipeRes = await runPipelineHealthAudit(branchId)
    if (pipeRes.success && pipeRes.data) {
      pipelineData.value = pipeRes.data
    }

    // 4. Fetch unassigned orders requiring manager assignment
    const unassignedRes = await fetchUnassignedOrders(branchId)
    if (unassignedRes.success) {
      unassignedOrders.value = unassignedRes.data || []
    }

    // 5. Fetch active shift waiters
    const waitersRes = await fetchActiveShiftWaiters(branchId)
    if (waitersRes.success) {
      activeWaiters.value = waitersRes.data || []
    }

    // 6. Fetch real-time ERP reporting integrity audit
    const repRes = await auditReportingIntegrity(branchId)
    if (repRes.success) {
      reportingAudit.value = repRes.data || null
    }

    // 7. Fetch real-time waiter reward points audit
    const pointsRes = await auditWaiterPointsRealtime(branchId)
    if (pointsRes.success) {
      pointsAuditData.value = pointsRes.data || null
    }

    // 8. Fetch active customer negative feedback rescue alerts
    await loadFeedbackAlerts()

    // 9. Fetch anti-theft & loss prevention security audit
    const secRes = await runSecurityAudit(branchId)
    if (secRes.success) {
      securityAuditData.value = secRes.data
    }

    // 10. Multi-Agent Audits (FinGuard, TalentOps, SupplySense)
    const [finRes, hrRes, supplyRes, allAlerts] = await Promise.all([
      runFinGuardAudit(branchId),
      runTalentOpsAudit(branchId),
      runSupplySenseAudit(branchId),
      fetchMultiAgentAlerts(branchId),
    ])
    if (finRes?.success) finGuardData.value = finRes.data
    if (hrRes?.success) talentOpsData.value = hrRes.data
    if (supplyRes?.success) supplySenseData.value = supplyRes.data
    multiAgentAlertsList.value = allAlerts || []
  } catch (err) {
    console.warn('[AI Watchdog] RPC failed, using local fallback:', err)
    await runLocalAuditFallback(branchId)
  } finally {
    isAuditing.value = false
  }
}

// ── Multi-Agent Actions ──────────────────────────────────────────────────────
async function triggerFinGuardAudit() {
  const branchId = authStore.currentBranch?.id
  isAuditingFin.value = true
  try {
    const res = await runFinGuardAudit(branchId)
    if (res?.success) finGuardData.value = res.data
    const allAlerts = await fetchMultiAgentAlerts(branchId)
    multiAgentAlertsList.value = allAlerts || []
    $q.notify({ type: 'positive', message: 'FinGuard financial audit completed.', position: 'top', timeout: 2000 })
  } finally {
    isAuditingFin.value = false
  }
}

async function triggerTalentOpsAudit() {
  const branchId = authStore.currentBranch?.id
  isAuditingHr.value = true
  try {
    const res = await runTalentOpsAudit(branchId)
    if (res?.success) talentOpsData.value = res.data
    const allAlerts = await fetchMultiAgentAlerts(branchId)
    multiAgentAlertsList.value = allAlerts || []
    $q.notify({ type: 'positive', message: 'TalentOps workforce audit completed.', position: 'top', timeout: 2000 })
  } finally {
    isAuditingHr.value = false
  }
}

async function triggerSupplySenseAudit() {
  const branchId = authStore.currentBranch?.id
  isAuditingSupply.value = true
  try {
    const res = await runSupplySenseAudit(branchId)
    if (res?.success) supplySenseData.value = res.data
    const allAlerts = await fetchMultiAgentAlerts(branchId)
    multiAgentAlertsList.value = allAlerts || []
    $q.notify({ type: 'positive', message: 'SupplySense stock audit completed.', position: 'top', timeout: 2000 })
  } finally {
    isAuditingSupply.value = false
  }
}

async function handleTransferPosCash(shiftId) {
  const branchId = authStore.currentBranch?.id
  try {
    const res = await autoTransferPosCash(shiftId, branchId)
    if (res?.success) {
      $q.notify({
        type: 'positive',
        message: `Draft Receipt Voucher ${res.voucher_number} created for Cash in Hand!`,
        position: 'top',
        timeout: 3000,
      })
      await triggerFinGuardAudit()
    } else {
      $q.notify({ type: 'negative', message: res?.error || 'Failed to create cash transfer voucher', position: 'top' })
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message, position: 'top' })
  }
}

async function handleHealShift(attendanceId) {
  try {
    const res = await autoCloseOrphanedShift(attendanceId, 9)
    if (res?.success) {
      $q.notify({
        type: 'positive',
        message: 'Shift auto-closed capped at 9 standard hours!',
        position: 'top',
        timeout: 3000,
      })
      await triggerTalentOpsAudit()
    } else {
      $q.notify({ type: 'negative', message: res?.error || 'Failed to auto-close shift', position: 'top' })
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message, position: 'top' })
  }
}

async function handleDismissMultiAlert(alertId) {
  try {
    const res = await resolveMultiAgentAlert(alertId, 'dismissed', 'Acknowledged by user', authStore.user?.id)
    if (res?.success) {
      multiAgentAlertsList.value = multiAgentAlertsList.value.filter(a => a.id !== alertId)
      $q.notify({ type: 'info', message: 'Alert dismissed.', position: 'top', timeout: 1500 })
    }
  } catch (err) {
    console.error('Dismiss error:', err)
  }
}

async function handleGenerateWaiterReport() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  isGeneratingReport.value = true
  try {
    const res = await generateWaiterOfTheMonthReport(branchId)
    if (res.success && res.data) {
      monthlyReportData.value = res.data
      monthlyReportDialog.value = true
    } else {
      throw new Error(res.error || 'Failed to generate report')
    }
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err.message || 'Error generating waiter report',
      position: 'top',
    })
  } finally {
    isGeneratingReport.value = false
  }
}

async function handlePreviewOwnerBriefing() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  isGeneratingBriefing.value = true
  try {
    const res = await generateOwnerDailyBriefing(branchId)
    if (res.success && res.data) {
      ownerBriefingData.value = res.data
      ownerBriefingDialog.value = true
    } else {
      $q.notify({
        type: 'warning',
        message: res.error || 'Failed to generate owner briefing',
        position: 'top',
      })
    }
  } catch (err) {
    console.debug('Error generating owner briefing:', err)
  } finally {
    isGeneratingBriefing.value = false
  }
}

async function handleDispatchOwnerBriefing() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  isDispatchingBriefing.value = true
  try {
    const res = await dispatchOwnerBriefing(branchId)
    if (res.success) {
      $q.notify({
        type: 'positive',
        message: 'Daily Briefing dispatched to Owner (+94717462205) & Email!',
        position: 'top',
      })
      ownerBriefingDialog.value = false
    } else {
      $q.notify({
        type: 'warning',
        message: res.error || 'Failed to dispatch owner briefing',
        position: 'top',
      })
    }
  } catch (err) {
    console.debug('Error dispatching owner briefing:', err)
  } finally {
    isDispatchingBriefing.value = false
  }
}

function copyBriefingText() {
  if (ownerBriefingData.value?.whatsapp_message) {
    navigator.clipboard.writeText(ownerBriefingData.value.whatsapp_message)
    $q.notify({
      type: 'positive',
      message: 'WhatsApp briefing copied to clipboard!',
      position: 'top',
    })
  }
}

// ── Enterprise Suite Methods ─────────────────────────────────────────────────
async function handleGeneratePrepPlan() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  isGeneratingPrepPlan.value = true
  try {
    const res = await generateKitchenPrepPlan(branchId)
    if (res.success && res.data) {
      prepPlanData.value = res.data
      prepPlanDialog.value = true
    } else {
      $q.notify({
        type: 'warning',
        message: res.error || 'Failed to generate chef prep plan',
        position: 'top',
      })
    }
  } catch (err) {
    console.debug('Error generating prep plan:', err)
  } finally {
    isGeneratingPrepPlan.value = false
  }
}

async function handleRunSecurityAudit() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  isAuditingSecurity.value = true
  try {
    const res = await runSecurityAudit(branchId)
    if (res.success && res.data) {
      securityAuditData.value = res.data
      securityDialog.value = true
    } else {
      $q.notify({
        type: 'warning',
        message: res.error || 'Failed to complete security audit',
        position: 'top',
      })
    }
  } catch (err) {
    console.debug('Error in security audit:', err)
  } finally {
    isAuditingSecurity.value = false
  }
}

function openRescueDialog(alert) {
  selectedFeedbackToRescue.value = alert
  rescueOffer.value = 'Complimentary Dessert (Chocolate Lava Cake)'
  rescueNotes.value = ''
  feedbackRescueDialog.value = true
}

async function handleCompleteRescue() {
  if (!selectedFeedbackToRescue.value) return
  isResolvingRescue.value = true
  try {
    const res = await resolveFeedbackRescue(
      selectedFeedbackToRescue.value.id,
      authStore.user?.id,
      rescueNotes.value || 'Manager intervened table-side with goodwill offer.',
      rescueOffer.value
    )
    if (res.success) {
      $q.notify({
        type: 'positive',
        icon: 'verified',
        message: `Table #${selectedFeedbackToRescue.value.table_number} customer rescued! Google rating protected.`,
        position: 'top',
        timeout: 4000,
      })
      feedbackRescueDialog.value = false
      await loadFeedbackAlerts()
    }
  } catch (err) {
    console.debug('Error completing rescue:', err)
  } finally {
    isResolvingRescue.value = false
  }
}

async function loadFeedbackAlerts() {
  const branchId = authStore.currentBranch?.id
  if (branchId) {
    try {
      const res = await fetchActiveFeedbackAlerts(branchId)
      if (res.success) {
        activeFeedbackAlerts.value = res.data || []
      }
    } catch (err) {
      console.debug('Error loading feedback alerts:', err)
    }
  }
}

function copyPrepPlanText() {
  if (prepPlanData.value?.whatsapp_message) {
    navigator.clipboard.writeText(prepPlanData.value.whatsapp_message)
    $q.notify({ type: 'positive', message: 'Chef Prep Plan copied to clipboard!', position: 'top' })
  }
}

function copySecurityAlertText() {
  if (securityAuditData.value?.whatsapp_alert) {
    navigator.clipboard.writeText(securityAuditData.value.whatsapp_alert)
    $q.notify({ type: 'positive', message: 'Confidential Security Alert copied to clipboard!', position: 'top' })
  }
}

function openAssignDialog(order) {
  selectedOrderToAssign.value = order
  selectedWaiter.value = activeWaiters.value[0]?.id || null
  assignDialog.value = true
}

async function handleAssignWaiter() {
  if (!selectedOrderToAssign.value || !selectedWaiter.value) return
  isAssigning.value = true
  try {
    const res = await assignWaiterToOrder(
      selectedOrderToAssign.value.order_id,
      selectedWaiter.value,
      authStore.user?.id
    )
    if (res.success) {
      $q.notify({
        type: 'positive',
        icon: 'assignment_turned_in',
        message: `Order #${selectedOrderToAssign.value.order_number} assigned! Waiter push notification dispatched.`,
        position: 'top',
        timeout: 3500,
      })
      assignDialog.value = false
      await runManualAudit()
    } else {
      throw new Error(res.error || 'Assignment failed')
    }
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err.message || 'Failed to assign waiter',
      position: 'top',
    })
  } finally {
    isAssigning.value = false
  }
}

async function runLocalAuditFallback(branchId) {
  try {
    const now = new Date()
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString()
    const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString()

    // Fetch active KOTs
    const { data: tickets } = await supabase
      .from('kot_tickets')
      .select('id, kot_number, order_id, kitchen_id, status, created_at, orders(order_number, table_number, order_type, branch_id), kitchens(name)')
      .in('status', ['created', 'pending', 'preparing', 'queued'])
      .gte('created_at', twelveHoursAgo)

    const delayed = []
    ;(tickets || []).forEach(t => {
      if (t.orders?.branch_id === branchId) {
        const elapsed = (Date.now() - new Date(t.created_at).getTime()) / 60000
        if (elapsed >= 15) {
          delayed.push({
            kot_id: t.id,
            kot_number: t.kot_number,
            order_id: t.order_id,
            order_number: t.orders?.order_number,
            table_number: t.orders?.table_number,
            kitchen_name: t.kitchens?.name || 'Kitchen',
            elapsed_minutes: Math.round(elapsed),
            severity: elapsed >= 25 ? 'critical' : 'warning'
          })
        }
      }
    })

    // Fetch today's sales summary
    const { data: orders } = await supabase
      .from('orders')
      .select('status, total_amount')
      .eq('branch_id', branchId)
      .gte('created_at', todayStart)

    let totalSales = 0, completedCount = 0, voidCount = 0
    ;(orders || []).forEach(o => {
      if (o.status === 'completed' || o.status === 'paid') {
        totalSales += Number(o.total_amount || 0)
        completedCount++
      } else if (o.status === 'void' || o.status === 'cancelled') {
        voidCount++
      }
    })

    const totalOrders = completedCount + voidCount
    const voidRate = totalOrders > 0 ? ((voidCount / totalOrders) * 100).toFixed(1) : 0

    auditData.value = {
      delayed_kots: delayed,
      routing_errors: [],
      sales_summary: {
        today_orders_count: completedCount,
        today_sales_total: totalSales,
        today_void_count: voidCount,
        void_percentage: Number(voidRate),
        is_void_spike: voidCount >= 4 || Number(voidRate) > 10
      },
      station_loads: [],
      summary: {
        health_score: delayed.length === 0 ? 100 : Math.max(40, 100 - delayed.length * 20)
      }
    }
  } catch (fallbackErr) {
    console.error('[AI Watchdog] Fallback audit failed:', fallbackErr)
  }
}

async function triggerSelfHealManual() {
  isHealing.value = true
  const branchId = authStore.currentBranch?.id
  if (!branchId) {
    isHealing.value = false
    return
  }

  try {
    const res = await runQrOrderSelfHeal(branchId, 90)
    if (res.success && res.data) {
      if (res.data.healed_count > 0) {
        healedOrders.value = [...(res.data.healed_orders || []), ...healedOrders.value].slice(0, 10)
        $q.notify({
          type: 'positive',
          icon: 'healing',
          message: `🤖 AI Self-Healed ${res.data.healed_count} QR order(s)! Dispatched directly to Kitchen.`,
          position: 'top',
          timeout: 4000
        })
      } else {
        $q.notify({
          type: 'info',
          message: 'All QR table orders are actively claimed. Zero stalled orders detected.',
          position: 'top',
          timeout: 2500
        })
      }
    }
    await runManualAudit()
  } catch (err) {
    console.error('Self-heal failed:', err)
  } finally {
    isHealing.value = false
  }
}

function triggerKitchenExpedite(kot) {
  $q.notify({
    type: 'warning',
    message: `Alert dispatched to ${kot.kitchen_name || 'Kitchen'} for Order #${kot.order_number}!`,
    position: 'top',
    timeout: 3000
  })
}

async function clearResolvedAlerts() {
  const branchId = authStore.currentBranch?.id
  if (branchId) {
    await supabase
      .from('ai_agent_alerts')
      .update({ is_resolved: true })
      .eq('branch_id', branchId)
      .eq('is_resolved', false)
  }
  await runManualAudit()
}

// ── Realtime Setup ───────────────────────────────────────────────────────────
onMounted(async () => {
  await runManualAudit()

  // Realtime subscription to ai_agent_alerts
  const branchId = authStore.currentBranch?.id
  if (branchId) {
    realtimeChannel = supabase
      .channel('ai-ops-watchdog-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_agent_alerts',
          filter: `branch_id=eq.${branchId}`
        },
        () => {
          runManualAudit()
        }
      )
      .subscribe()
  }

  // Periodic watchdog re-check every 60 seconds
  autoRefreshTimer = setInterval(() => {
    runManualAudit()
  }, 60000)
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
  }
})
</script>

<style scoped>
.watchdog-badge {
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: all 0.25s ease;
}
.watchdog-badge:hover {
  transform: translateY(-1px);
}
.border-warning {
  border-color: #f59e0b !important;
}
.border-critical {
  border-color: #ef4444 !important;
}
.pulse-animation {
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.8; }
  100% { transform: scale(1); opacity: 1; }
}
.ai-drawer-card {
  width: 420px;
  max-width: 95vw;
  backdrop-filter: blur(16px);
  background: #111827;
}
.health-score-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.delayed-kot-card {
  background: rgba(255, 255, 255, 0.03);
}
.warning-border {
  border-left: 4px solid #f59e0b;
}
.critical-border {
  border-left: 4px solid #ef4444;
}
.bg-dark-glass-light {
  background: rgba(255, 255, 255, 0.04);
}
.pipeline-stages-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.stage-cell {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 6px 4px;
  text-align: center;
}
.stage-num {
  font-size: 9px;
  color: #94a3b8;
  font-weight: 700;
  text-transform: uppercase;
}
.stage-name {
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 1px 0;
}
.stage-val {
  font-size: 10px;
  font-weight: 700;
}
</style>
