<template>
  <q-page class="q-pa-md approvals-page">
    <!-- ── Page Header ─────────────────────────────────────────────── -->
    <div class="row items-center justify-between q-mb-md">
      <div>
        <div class="row items-center text-caption text-grey-7 q-mb-xs">
          <q-icon name="shield" size="14px" class="q-mr-xs text-primary" />
          <span>APPROVALS / {{ activeTab === 'dashboard' ? 'OVERVIEW' : currentTabLabel.toUpperCase() }}</span>
        </div>
        <div class="text-h5 text-weight-bold row items-center">
          <q-icon :name="currentTabIcon" color="primary" size="28px" class="q-mr-sm" />
          {{ activeTab === 'dashboard' ? 'Approvals & Governance Dashboard' : currentTabLabel }}
        </div>
      </div>
      <div class="row q-gutter-sm items-center">
        <q-btn
          v-if="activeTab !== 'dashboard'"
          unelevated
          no-caps
          color="primary"
          icon="arrow_back"
          label="Approvals Dashboard"
          @click="switchTab('dashboard')"
        />
        <q-btn
          outline
          no-caps
          icon="refresh"
          label="Refresh Inbox"
          color="primary"
          :loading="loading"
          @click="loadAllPending"
        />
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════ -->
    <!-- 1. DEDICATED APPROVALS DASHBOARD VIEW                          -->
    <!-- ═══════════════════════════════════════════════════════════════ -->
    <div v-if="activeTab === 'dashboard'">
      <!-- Hero KPI Summary Cards (4 Balanced Columns) -->
      <div class="row q-col-gutter-md q-mb-lg">
        <!-- 1. Total Pending -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-hero-card" :class="$q.dark.isActive ? 'bg-dark' : 'bg-white'">
            <q-card-section class="q-pa-md">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-caption text-weight-medium text-grey-7">Total Pending Actions</span>
                <q-avatar size="36px" color="blue-1" text-color="primary" icon="pending_actions" />
              </div>
              <div class="row items-baseline justify-between q-mt-xs">
                <div class="text-h4 text-weight-bold text-primary">
                  {{ grandTotalPending }}
                </div>
                <q-badge :color="grandTotalPending > 0 ? 'warning' : 'positive'" :text-color="grandTotalPending > 0 ? 'dark' : 'white'">
                  {{ grandTotalPending > 0 ? 'Action Needed' : 'All Clear' }}
                </q-badge>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 2. Financial Outflow at Stake -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-hero-card" :class="$q.dark.isActive ? 'bg-dark' : 'bg-white'">
            <q-card-section class="q-pa-md">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-caption text-weight-medium text-grey-7">Financial Outflow</span>
                <q-avatar size="36px" color="amber-1" text-color="amber-9" icon="account_balance_wallet" />
              </div>
              <div class="row items-baseline justify-between q-mt-xs">
                <div class="text-h5 text-weight-bold text-amber-9 ellipsis">
                  {{ formatCurrency(totalFinancialAtStake) }}
                </div>
                <q-badge color="amber-2" text-color="amber-10">Sign-off Queued</q-badge>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 3. Kitchen Wastage Loss -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-hero-card" :class="$q.dark.isActive ? 'bg-dark' : 'bg-white'">
            <q-card-section class="q-pa-md">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-caption text-weight-medium text-grey-7">Kitchen Spoilage Loss</span>
                <q-avatar size="36px" color="red-1" text-color="negative" icon="delete_sweep" />
              </div>
              <div class="row items-baseline justify-between q-mt-xs">
                <div class="text-h5 text-weight-bold text-negative ellipsis">
                  {{ formatCurrency(totalWastageLoss) }}
                </div>
                <q-badge color="red-2" text-color="red-10">Stock Write-off</q-badge>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 4. Security & Compliance Audits -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-hero-card" :class="$q.dark.isActive ? 'bg-dark' : 'bg-white'">
            <q-card-section class="q-pa-md">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-caption text-weight-medium text-grey-7">Audits & Security Gates</span>
                <q-avatar size="36px" color="purple-1" text-color="purple-9" icon="gavel" />
              </div>
              <div class="row items-baseline justify-between q-mt-xs">
                <div class="text-h4 text-weight-bold text-purple-9">
                  {{ totalAuditCount }}
                </div>
                <q-badge color="purple-2" text-color="purple-10">High Security</q-badge>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Department Inboxes Navigation Grid (Symmetrical 4x2 Layout) -->
      <div class="row items-center justify-between q-mb-md">
        <div class="text-subtitle1 text-weight-bold">Department Governance Inboxes</div>
      </div>

      <div class="row q-col-gutter-md q-mb-lg">
        <!-- 1. Kitchen & Store Wastage -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-inbox-card cursor-pointer" @click="switchTab('wastage')">
            <q-card-section class="q-pa-md">
              <div class="row items-center no-wrap justify-between q-mb-sm">
                <q-avatar icon="delete_sweep" color="red-1" text-color="negative" size="38px" />
                <q-badge :color="wastageList.length ? 'negative' : 'grey-5'" class="text-bold">
                  {{ wastageList.length }} Pending
                </q-badge>
              </div>
              <div class="text-subtitle2 text-weight-bold q-mb-sm">Kitchen & Store Wastage</div>
              <div class="row items-center justify-between text-caption border-top q-pt-sm">
                <span class="text-weight-bold text-negative">{{ formatCurrency(totalWastageLoss) }}</span>
                <span class="text-primary text-weight-medium row items-center">Open <q-icon name="arrow_forward" size="14px" class="q-ml-xs" /></span>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 2. Purchase Orders -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-inbox-card cursor-pointer" @click="switchTab('procurement')">
            <q-card-section class="q-pa-md">
              <div class="row items-center no-wrap justify-between q-mb-sm">
                <q-avatar icon="shopping_cart" color="amber-1" text-color="amber-9" size="38px" />
                <q-badge :color="poList.length ? 'amber-9' : 'grey-5'" class="text-bold">
                  {{ poList.length }} Pending
                </q-badge>
              </div>
              <div class="text-subtitle2 text-weight-bold q-mb-sm">Purchase Orders (PO)</div>
              <div class="row items-center justify-between text-caption border-top q-pt-sm">
                <span class="text-weight-bold text-amber-9">{{ formatCurrency(totalPoAmount) }}</span>
                <span class="text-primary text-weight-medium row items-center">Open <q-icon name="arrow_forward" size="14px" class="q-ml-xs" /></span>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 3. Finance & Pay Vouchers -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-inbox-card cursor-pointer" @click="switchTab('finance')">
            <q-card-section class="q-pa-md">
              <div class="row items-center no-wrap justify-between q-mb-sm">
                <q-avatar icon="receipt_long" color="blue-1" text-color="primary" size="38px" />
                <q-badge :color="voucherList.length ? 'primary' : 'grey-5'" class="text-bold">
                  {{ voucherList.length }} Pending
                </q-badge>
              </div>
              <div class="text-subtitle2 text-weight-bold q-mb-sm">Finance & Pay Vouchers</div>
              <div class="row items-center justify-between text-caption border-top q-pt-sm">
                <span class="text-weight-bold text-primary">{{ formatCurrency(totalVoucherAmount) }}</span>
                <span class="text-primary text-weight-medium row items-center">Open <q-icon name="arrow_forward" size="14px" class="q-ml-xs" /></span>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 4. POS Shift Variance -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-inbox-card cursor-pointer" @click="switchTab('shifts')">
            <q-card-section class="q-pa-md">
              <div class="row items-center no-wrap justify-between q-mb-sm">
                <q-avatar icon="point_of_sale" color="orange-1" text-color="deep-orange" size="38px" />
                <q-badge :color="shiftVarianceList.length ? 'deep-orange' : 'grey-5'" class="text-bold">
                  {{ shiftVarianceList.length }} Audits
                </q-badge>
              </div>
              <div class="text-subtitle2 text-weight-bold q-mb-sm">POS Shift Variance</div>
              <div class="row items-center justify-between text-caption border-top q-pt-sm">
                <span class="text-weight-bold text-deep-orange">Cash Discrepancies</span>
                <span class="text-primary text-weight-medium row items-center">Open <q-icon name="arrow_forward" size="14px" class="q-ml-xs" /></span>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 5. Document Amendments & Unlocks -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-inbox-card cursor-pointer" @click="switchTab('amendments')">
            <q-card-section class="q-pa-md">
              <div class="row items-center no-wrap justify-between q-mb-sm">
                <q-avatar icon="lock_open" color="teal-1" text-color="teal-9" size="38px" />
                <q-badge :color="amendmentList.length ? 'teal' : 'grey-5'" class="text-bold">
                  {{ amendmentList.length }} Locked
                </q-badge>
              </div>
              <div class="text-subtitle2 text-weight-bold q-mb-sm">Doc Amendments & Unlocks</div>
              <div class="row items-center justify-between text-caption border-top q-pt-sm">
                <span class="text-weight-bold text-teal-9">Audit Control</span>
                <span class="text-primary text-weight-medium row items-center">Open <q-icon name="arrow_forward" size="14px" class="q-ml-xs" /></span>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 6. HR & Staff Requests -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-inbox-card cursor-pointer" @click="switchTab('hr')">
            <q-card-section class="q-pa-md">
              <div class="row items-center no-wrap justify-between q-mb-sm">
                <q-avatar icon="badge" color="purple-1" text-color="purple-9" size="38px" />
                <q-badge :color="hrTotalPending ? 'purple' : 'grey-5'" class="text-bold">
                  {{ hrTotalPending }} Requests
                </q-badge>
              </div>
              <div class="text-subtitle2 text-weight-bold q-mb-sm">HR & Staff Requests</div>
              <div class="row items-center justify-between text-caption border-top q-pt-sm">
                <span class="text-weight-bold text-purple-9">{{ hrLeaves.length }} Leaves · {{ hrAdvances.length }} Adv</span>
                <span class="text-primary text-weight-medium row items-center">Open <q-icon name="arrow_forward" size="14px" class="q-ml-xs" /></span>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 7. Role & Permission Gates -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-inbox-card cursor-pointer" @click="switchTab('permissions')">
            <q-card-section class="q-pa-md">
              <div class="row items-center no-wrap justify-between q-mb-sm">
                <q-avatar icon="security" color="indigo-1" text-color="indigo-9" size="38px" />
                <q-badge :color="pendingPermissions.length ? 'indigo' : 'grey-5'" class="text-bold">
                  {{ pendingPermissions.length }} Gates
                </q-badge>
              </div>
              <div class="text-subtitle2 text-weight-bold q-mb-sm">Permission Gates</div>
              <div class="row items-center justify-between text-caption border-top q-pt-sm">
                <span class="text-weight-bold text-indigo-9">Security Elevation</span>
                <span class="text-primary text-weight-medium row items-center">Open <q-icon name="arrow_forward" size="14px" class="q-ml-xs" /></span>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- 8. System Governance Status -->
        <div class="col-12 col-sm-6 col-md-3">
          <q-card flat bordered class="approvals-inbox-card" :class="$q.dark.isActive ? 'bg-dark' : 'bg-grey-1'">
            <q-card-section class="q-pa-md">
              <div class="row items-center no-wrap justify-between q-mb-sm">
                <q-avatar icon="verified_user" color="green-1" text-color="positive" size="38px" />
                <q-badge color="positive" class="text-bold">Enforced</q-badge>
              </div>
              <div class="text-subtitle2 text-weight-bold q-mb-sm">Governance & Audit</div>
              <div class="row items-center justify-between text-caption border-top q-pt-sm">
                <span class="text-weight-bold text-positive">Policy Compliant</span>
                <span class="text-grey-6">Realtime Active</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Urgent Pending Approvals Queue (Unified Action Stream) -->
      <div class="fin-panel q-mb-lg">
        <div class="row items-center justify-between q-pa-md border-bottom">
          <div class="text-subtitle1 text-weight-bold row items-center">
            <q-icon name="bolt" color="amber-9" size="22px" class="q-mr-xs" />
            Urgent Pending Approvals Queue ({{ filteredUnifiedItems.length }})
          </div>
          <div class="row q-gutter-xs">
            <q-btn-toggle
              v-model="queueFilter"
              dense
              no-caps
              rounded
              unelevated
              toggle-color="primary"
              :options="[
                { label: `All (${allPendingItems.length})`, value: 'all' },
                { label: 'Operations', value: 'operations' },
                { label: 'Finance', value: 'finance' },
                { label: 'HR', value: 'hr' },
                { label: 'Audits', value: 'audits' },
              ]"
            />
          </div>
        </div>

        <q-table
          :rows="filteredUnifiedItems"
          :columns="unifiedColumns"
          row-key="id"
          flat
          :dark="$q.dark.isActive"
          dense
          :loading="loading"
          :rows-per-page-options="[10, 25, 50]"
          no-data-label="All clear! No pending approval actions required across any department."
        >
          <template #body-cell-category="props">
            <q-td :props="props">
              <q-chip dense size="sm" :color="props.row.categoryColor" text-color="white" :icon="props.row.icon">
                {{ props.row.category }}
              </q-chip>
            </q-td>
          </template>

          <template #body-cell-docNumber="props">
            <q-td :props="props" class="text-weight-bold">
              {{ props.value }}
            </q-td>
          </template>

          <template #body-cell-date="props">
            <q-td :props="props">{{ formatDate(props.value) }}</q-td>
          </template>

          <template #body-cell-amount="props">
            <q-td :props="props" align="right">
              <span v-if="props.value" class="text-weight-bold" :class="props.value < 0 ? 'text-negative' : 'text-primary'">
                {{ formatCurrency(props.value) }}
              </span>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>

          <template #body-cell-status="props">
            <q-td :props="props" align="center">
              <q-badge color="warning" text-color="dark">{{ props.value }}</q-badge>
            </q-td>
          </template>

          <template #body-cell-actions="props">
            <q-td :props="props" align="center">
              <q-btn
                unelevated
                dense
                size="sm"
                color="primary"
                icon="open_in_new"
                label="Review & Action"
                no-caps
                @click="switchTab(props.row.tab)"
              />
            </q-td>
          </template>
        </q-table>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════ -->
    <!-- 2. SPECIFIC DEPARTMENT INBOX TABS VIEW                          -->
    <!-- ═══════════════════════════════════════════════════════════════ -->
    <div v-else>
      <q-card flat bordered class="shadow-1 q-mb-md">
        <!-- Horizontal Tabs Bar for switching inboxes -->
        <q-tabs
          v-model="activeTab"
          dense
          align="left"
          active-color="primary"
          indicator-color="primary"
          class="border-bottom"
          :class="$q.dark.isActive ? 'bg-dark text-grey-4' : 'bg-grey-1 text-grey-8'"
          @update:model-value="(t) => switchTab(t)"
        >
          <q-tab name="wastage" icon="delete_sweep" label="Kitchen & Store Wastage">
            <q-badge v-if="wastageList.length" color="negative" floating>{{ wastageList.length }}</q-badge>
          </q-tab>
          <q-tab name="procurement" icon="shopping_cart" label="Purchase Orders">
            <q-badge v-if="poList.length" color="amber-9" floating>{{ poList.length }}</q-badge>
          </q-tab>
          <q-tab name="finance" icon="receipt_long" label="Finance & Pay Vouchers">
            <q-badge v-if="voucherList.length" color="primary" floating>{{ voucherList.length }}</q-badge>
          </q-tab>
          <q-tab name="shifts" icon="point_of_sale" label="POS Shift Variance">
            <q-badge v-if="shiftVarianceList.length" color="deep-orange" floating>{{ shiftVarianceList.length }}</q-badge>
          </q-tab>
          <q-tab name="amendments" icon="lock_open" label="Doc Amendments & Unlocks">
            <q-badge v-if="amendmentList.length" color="teal" floating>{{ amendmentList.length }}</q-badge>
          </q-tab>
          <q-tab name="hr" icon="badge" label="HR & Shift Requests">
            <q-badge v-if="hrTotalPending > 0" color="purple" floating>{{ hrTotalPending }}</q-badge>
          </q-tab>
          <q-tab name="permissions" icon="security" label="Role & Permission Gate">
            <q-badge v-if="pendingPermissions.length" color="indigo" floating>{{ pendingPermissions.length }}</q-badge>
          </q-tab>
        </q-tabs>

        <q-tab-panels v-model="activeTab" animated class="q-pa-none">
          <!-- ══ 1. KITCHEN & STORE WASTAGE APPROVALS ═════════════════════ -->
          <q-tab-panel name="wastage" class="q-pa-md">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-bold">Pending Wastage / Spoilage Documents</div>
              <div class="text-weight-bold text-negative">
                Total Loss Value: {{ formatCurrency(totalWastageLoss) }}
              </div>
            </div>
            <q-table
              :rows="wastageList"
              :columns="wastageColumns"
              row-key="id"
              flat
              bordered
              :dark="$q.dark.isActive"
              dense
              :loading="loading"
              no-data-label="No pending kitchen/store wastage documents"
            >
              <template #body-cell-doc_date="props">
                <q-td :props="props">{{ formatDate(props.value) }}</q-td>
              </template>
              <template #body-cell-total_cost="props">
                <q-td :props="props" align="right" class="text-weight-bold text-negative">
                  {{ formatCurrency(props.value) }}
                </q-td>
              </template>
              <template #body-cell-status="props">
                <q-td :props="props" align="center">
                  <q-badge color="warning" text-color="dark">Pending Approval</q-badge>
                </q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn
                      unelevated
                      dense
                      size="sm"
                      color="positive"
                      icon="check"
                      label="Approve"
                      @click="approveWastage(props.row)"
                    />
                    <q-btn
                      flat
                      dense
                      size="sm"
                      color="negative"
                      icon="close"
                      label="Reject"
                      @click="rejectWastage(props.row)"
                    />
                  </div>
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <!-- ══ 2. PROCUREMENT PO APPROVALS ═════════════════════════════ -->
          <q-tab-panel name="procurement" class="q-pa-md">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-bold">Pending Purchase Orders (POs)</div>
              <div class="text-weight-bold text-amber-9">
                Total PO Commitment: {{ formatCurrency(totalPoAmount) }}
              </div>
            </div>
            <q-table
              :rows="poList"
              :columns="poColumns"
              row-key="id"
              flat
              bordered
              :dark="$q.dark.isActive"
              dense
              :loading="loading"
              no-data-label="No draft purchase orders requiring approval"
            >
              <template #body-cell-doc_date="props">
                <q-td :props="props">{{ formatDate(props.value) }}</q-td>
              </template>
              <template #body-cell-total_amount="props">
                <q-td :props="props" align="right" class="text-weight-bold">
                  {{ formatCurrency(props.value) }}
                </q-td>
              </template>
              <template #body-cell-status="props">
                <q-td :props="props" align="center">
                  <q-badge color="amber-8" text-color="dark">Draft / Pending</q-badge>
                </q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn
                      unelevated
                      dense
                      size="sm"
                      color="positive"
                      icon="check"
                      label="Approve PO"
                      @click="approvePOItem(props.row)"
                    />
                    <q-btn
                      flat
                      dense
                      size="sm"
                      color="negative"
                      icon="close"
                      label="Reject"
                      @click="rejectPOItem(props.row)"
                    />
                  </div>
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <!-- ══ 3. FINANCE VOUCHERS APPROVALS ═══════════════════════════ -->
          <q-tab-panel name="finance" class="q-pa-md">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-bold">Pending Finance Pay Vouchers</div>
              <div class="text-weight-bold text-primary">
                Total Payment Release: {{ formatCurrency(totalVoucherAmount) }}
              </div>
            </div>
            <q-table
              :rows="voucherList"
              :columns="voucherColumns"
              row-key="id"
              flat
              bordered
              :dark="$q.dark.isActive"
              dense
              :loading="loading"
              no-data-label="No draft vouchers requiring approval"
            >
              <template #body-cell-voucher_date="props">
                <q-td :props="props">{{ formatDate(props.value) }}</q-td>
              </template>
              <template #body-cell-amount="props">
                <q-td :props="props" align="right" class="text-weight-bold text-primary">
                  {{ formatCurrency(props.value) }}
                </q-td>
              </template>
              <template #body-cell-status="props">
                <q-td :props="props" align="center">
                  <q-badge color="amber-8" text-color="dark">Draft</q-badge>
                </q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn
                      unelevated
                      dense
                      size="sm"
                      color="positive"
                      icon="check"
                      label="Approve Voucher"
                      @click="approveVoucherItem(props.row)"
                    />
                    <q-btn
                      flat
                      dense
                      size="sm"
                      color="negative"
                      icon="close"
                      label="Reject"
                      @click="rejectVoucherItem(props.row)"
                    />
                  </div>
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <!-- ══ 4. POS SHIFT VARIANCE REVIEW ════════════════════════════ -->
          <q-tab-panel name="shifts" class="q-pa-md">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-bold">POS Cash Variance Audits</div>
            </div>
            <q-table
              :rows="shiftVarianceList"
              :columns="shiftVarianceColumns"
              row-key="id"
              flat
              bordered
              :dark="$q.dark.isActive"
              dense
              :loading="loading"
              no-data-label="No major shift cash variances recorded"
            >
              <template #body-cell-created_at="props">
                <q-td :props="props">{{ formatDate(props.value) }}</q-td>
              </template>
              <template #body-cell-cash_variance="props">
                <q-td :props="props" align="right" class="text-weight-bold" :class="props.value < 0 ? 'text-negative' : 'text-positive'">
                  {{ formatCurrency(props.value) }}
                </q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <q-btn
                    unelevated
                    dense
                    size="sm"
                    color="primary"
                    icon="task_alt"
                    label="Sign Off"
                    @click="signOffShift(props.row)"
                  />
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <!-- ══ 5. DOCUMENT AMENDMENTS & UNLOCK REQUESTS ══════════════ -->
          <q-tab-panel name="amendments" class="q-pa-md">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-bold row items-center">
                <q-icon name="lock_open" color="teal" size="24px" class="q-mr-xs" />
                Locked Document Amendment & Unlock Requests
              </div>
            </div>
            <q-table
              :rows="amendmentList"
              :columns="amendmentColumns"
              row-key="id"
              flat
              bordered
              :dark="$q.dark.isActive"
              dense
              :loading="loading"
              no-data-label="No pending document amendment or unlock requests"
            >
              <template #body-cell-doc_type="props">
                <q-td :props="props" align="center">
                  <q-badge :color="getDocTypeColor(props.value)">{{ props.value }}</q-badge>
                </q-td>
              </template>
              <template #body-cell-created_at="props">
                <q-td :props="props">{{ new Date(props.value).toLocaleString() }}</q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn
                      unelevated
                      dense
                      size="sm"
                      color="positive"
                      icon="lock_open"
                      label="Approve & Unlock"
                      @click="handleApproveAmendment(props.row)"
                    />
                    <q-btn
                      flat
                      dense
                      size="sm"
                      color="negative"
                      icon="close"
                      label="Reject"
                      @click="handleRejectAmendment(props.row)"
                    />
                  </div>
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>

          <!-- ══ 6. HR REQUESTS & SHIFT CHANGES ══════════════════════════ -->
          <q-tab-panel name="hr" class="q-pa-md">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-bold">Staff Requests</div>
              <q-btn-toggle
                v-model="hrSubTab"
                dense
                no-caps
                rounded
                unelevated
                toggle-color="primary"
                :options="[
                  { label: `Shift Changes (${hrShiftSwaps.length})`, value: 'shiftswaps' },
                  { label: `Leaves (${hrLeaves.length})`, value: 'leaves' },
                  { label: `Advances (${hrAdvances.length})`, value: 'advances' },
                  { label: `Loans (${hrLoans.length})`, value: 'loans' },
                  { label: `Claims (${hrExpenses.length})`, value: 'expenses' },
                ]"
              />
            </div>

            <!-- Shift Changes Table -->
            <div v-if="hrSubTab === 'shiftswaps'">
              <q-table
                :rows="hrShiftSwaps"
                :columns="hrShiftSwapColumns"
                row-key="id"
                flat
                bordered
                :dark="$q.dark.isActive"
                dense
                :loading="loading"
                no-data-label="No pending shift change or swap requests"
              >
                <template #body-cell-shift_date="props">
                  <q-td :props="props">{{ formatDate(props.value) }}</q-td>
                </template>
                <template #body-cell-actions="props">
                  <q-td :props="props" align="center">
                    <div class="row q-gutter-xs justify-center">
                      <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve Swap" @click="approveShiftSwap(props.row)" />
                      <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="rejectShiftSwap(props.row)" />
                    </div>
                  </q-td>
                </template>
              </q-table>
            </div>

            <!-- Leaves Table -->
            <div v-if="hrSubTab === 'leaves'">
              <q-table
                :rows="hrLeaves"
                :columns="hrLeaveColumns"
                row-key="id"
                flat
                bordered
                :dark="$q.dark.isActive"
                dense
                :loading="loading"
                no-data-label="No pending leave requests"
              >
                <template #body-cell-actions="props">
                  <q-td :props="props" align="center">
                    <div class="row q-gutter-xs justify-center">
                      <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve" @click="handleHRAction('leaves', props.row.id, 'approved')" />
                      <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="handleHRAction('leaves', props.row.id, 'rejected')" />
                    </div>
                  </q-td>
                </template>
              </q-table>
            </div>

            <!-- Advances Table -->
            <div v-if="hrSubTab === 'advances'">
              <q-table
                :rows="hrAdvances"
                :columns="hrAdvanceColumns"
                row-key="id"
                flat
                bordered
                :dark="$q.dark.isActive"
                dense
                :loading="loading"
                no-data-label="No pending salary advance requests"
              >
                <template #body-cell-amount="props">
                  <q-td :props="props" align="right" class="text-weight-bold">{{ formatCurrency(props.value) }}</q-td>
                </template>
                <template #body-cell-actions="props">
                  <q-td :props="props" align="center">
                    <div class="row q-gutter-xs justify-center">
                      <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve" @click="handleHRAction('advances', props.row.id, 'approved')" />
                      <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="handleHRAction('advances', props.row.id, 'rejected')" />
                    </div>
                  </q-td>
                </template>
              </q-table>
            </div>

            <!-- Loans Table -->
            <div v-if="hrSubTab === 'loans'">
              <q-table
                :rows="hrLoans"
                :columns="hrLoanColumns"
                row-key="id"
                flat
                bordered
                :dark="$q.dark.isActive"
                dense
                :loading="loading"
                no-data-label="No pending loan applications"
              >
                <template #body-cell-loan_amount="props">
                  <q-td :props="props" align="right" class="text-weight-bold">{{ formatCurrency(props.value) }}</q-td>
                </template>
                <template #body-cell-installment_amount="props">
                  <q-td :props="props" align="right">{{ formatCurrency(props.value) }}</q-td>
                </template>
                <template #body-cell-actions="props">
                  <q-td :props="props" align="center">
                    <div class="row q-gutter-xs justify-center">
                      <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve Loan" @click="handleHRAction('loans', props.row.id, 'approved')" />
                      <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="handleHRAction('loans', props.row.id, 'rejected')" />
                    </div>
                  </q-td>
                </template>
              </q-table>
            </div>

            <!-- Expenses Claims Table -->
            <div v-if="hrSubTab === 'expenses'">
              <q-table
                :rows="hrExpenses"
                :columns="hrExpenseColumns"
                row-key="id"
                flat
                bordered
                :dark="$q.dark.isActive"
                dense
                :loading="loading"
                no-data-label="No pending employee expense claims"
              >
                <template #body-cell-amount="props">
                  <q-td :props="props" align="right" class="text-weight-bold">{{ formatCurrency(props.value) }}</q-td>
                </template>
                <template #body-cell-actions="props">
                  <q-td :props="props" align="center">
                    <div class="row q-gutter-xs justify-center">
                      <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve" @click="handleHRAction('expenses', props.row.id, 'approved')" />
                      <q-btn flat dense size="sm" color="negative" icon="close" label="Reject" @click="handleHRAction('expenses', props.row.id, 'rejected')" />
                    </div>
                  </q-td>
                </template>
              </q-table>
            </div>
          </q-tab-panel>

          <!-- ══ 7. ROLE & PERMISSION ELEVATION GATE ══════════════════════ -->
          <q-tab-panel name="permissions" class="q-pa-md">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-bold">Elevated Privilege & Permission Gate</div>
            </div>
            <q-table
              :rows="pendingPermissions"
              :columns="permissionColumns"
              row-key="id"
              flat
              bordered
              :dark="$q.dark.isActive"
              dense
              :loading="loading"
              no-data-label="No elevated permission requests awaiting admin approval"
            >
              <template #body-cell-permission="props">
                <q-td :props="props">
                  <q-badge color="indigo-8">{{ props.value }}</q-badge>
                </q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" align="center">
                  <div class="row q-gutter-xs justify-center">
                    <q-btn unelevated dense size="sm" color="positive" icon="check" label="Approve Access" @click="approvePermission(props.row)" />
                    <q-btn flat dense size="sm" color="negative" icon="close" label="Deny Access" @click="denyPermission(props.row)" />
                  </div>
                </q-td>
              </template>
            </q-table>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { approvePO } from 'src/services/procurementService'
import {
  fetchPendingAmendments,
  approveDocumentAmendment,
  rejectDocumentAmendment,
} from 'src/services/amendmentService'
import { useAuthStore } from 'src/stores/auth'
import {
  disburseStaffReceivable,
  disburseEmployeeAdvance,
  FINANCE_POSTING_UNAVAILABLE,
} from 'src/services/hr/staffReceivableService'
import { hrTargetStatus, requiresDisbursement } from 'src/services/hr/hrApprovalStatus'

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const activeTab = ref(route.query.tab || 'dashboard')
const hrSubTab = ref('shiftswaps')
const queueFilter = ref('all')
const loading = ref(false)

const wastageList = ref([])
const poList = ref([])
const voucherList = ref([])
const amendmentList = ref([])
const hrShiftSwaps = ref([])
const hrLeaves = ref([])
const hrAdvances = ref([])
const hrLoans = ref([])
const hrExpenses = ref([])
const pendingPermissions = ref([])
const shiftVarianceList = ref([])

// Sync activeTab with URL route query
watch(
  () => route.query.tab,
  (newTab) => {
    activeTab.value = newTab || 'dashboard'
  },
  { immediate: true },
)

function switchTab(tabKey) {
  activeTab.value = tabKey
  router.replace({
    query: {
      ...route.query,
      tab: tabKey === 'dashboard' ? undefined : tabKey,
    },
  })
}

const hrTotalPending = computed(() => {
  return (
    hrShiftSwaps.value.length +
    hrLeaves.value.length +
    hrAdvances.value.length +
    hrLoans.value.length +
    hrExpenses.value.length
  )
})

const totalWastageLoss = computed(() => {
  return wastageList.value.reduce((sum, w) => sum + Number(w.total_cost || 0), 0)
})

const totalPoAmount = computed(() => {
  return poList.value.reduce((sum, po) => sum + Number(po.total_amount || 0), 0)
})

const totalVoucherAmount = computed(() => {
  return voucherList.value.reduce((sum, v) => sum + Number(v.amount || 0), 0)
})

const totalAdvanceAmount = computed(() => {
  return hrAdvances.value.reduce((sum, a) => sum + Number(a.amount || 0), 0)
})

const totalLoanAmount = computed(() => {
  return hrLoans.value.reduce((sum, l) => sum + Number(l.loan_amount || 0), 0)
})

const totalFinancialAtStake = computed(() => {
  return totalPoAmount.value + totalVoucherAmount.value + totalAdvanceAmount.value + totalLoanAmount.value
})

const totalAuditCount = computed(() => {
  return amendmentList.value.length + pendingPermissions.value.length + shiftVarianceList.value.length
})

// Tab metadata for dynamic headers
const tabMeta = {
  dashboard: {
    label: 'Approvals & Governance Dashboard',
    icon: 'dashboard',
  },
  wastage: {
    label: 'Kitchen & Store Wastage',
    icon: 'delete_sweep',
  },
  procurement: {
    label: 'Purchase Orders',
    icon: 'shopping_cart',
  },
  finance: {
    label: 'Finance & Pay Vouchers',
    icon: 'receipt_long',
  },
  shifts: {
    label: 'POS Shift Variance',
    icon: 'point_of_sale',
  },
  amendments: {
    label: 'Document Amendments & Unlocks',
    icon: 'lock_open',
  },
  hr: {
    label: 'HR & Staff Requests',
    icon: 'badge',
  },
  permissions: {
    label: 'Permission & Security Gates',
    icon: 'security',
  },
}

const currentTabLabel = computed(() => tabMeta[activeTab.value]?.label || 'Approvals')
const currentTabIcon = computed(() => tabMeta[activeTab.value]?.icon || 'verified')

// Unified Action Queue Items (Flattened for Dashboard)
const allPendingItems = computed(() => {
  const items = []

  wastageList.value.forEach((w) => {
    items.push({
      id: `w_${w.id}`,
      rawId: w.id,
      tab: 'wastage',
      group: 'operations',
      category: 'Kitchen Wastage',
      categoryColor: 'negative',
      icon: 'delete_sweep',
      docNumber: w.doc_number || 'WST-DOC',
      requester: w.warehouses?.name || 'Main Kitchen',
      date: w.doc_date || w.created_at,
      amount: w.total_cost || 0,
      details: w.remarks || 'Stock write-off',
      status: 'Pending Approval',
      raw: w,
    })
  })

  poList.value.forEach((po) => {
    items.push({
      id: `po_${po.id}`,
      rawId: po.id,
      tab: 'procurement',
      group: 'operations',
      category: 'Purchase Order',
      categoryColor: 'amber-9',
      icon: 'shopping_cart',
      docNumber: po.doc_number || 'PO-DOC',
      requester: po.suppliers?.name || 'Procurement',
      date: po.doc_date || po.created_at,
      amount: po.total_amount || 0,
      details: 'Draft PO awaiting order release',
      status: 'Draft / Pending',
      raw: po,
    })
  })

  voucherList.value.forEach((v) => {
    items.push({
      id: `v_${v.id}`,
      rawId: v.id,
      tab: 'finance',
      group: 'finance',
      category: 'Pay Voucher',
      categoryColor: 'primary',
      icon: 'receipt_long',
      docNumber: v.voucher_no || 'VOUCHER',
      requester: v.pay_to || 'Payee',
      date: v.voucher_date || v.created_at,
      amount: v.amount || 0,
      details: v.narration || 'Payment authorization',
      status: 'Pending Sign-off',
      raw: v,
    })
  })

  amendmentList.value.forEach((a) => {
    items.push({
      id: `am_${a.id}`,
      rawId: a.id,
      tab: 'amendments',
      group: 'audits',
      category: 'Doc Unlock',
      categoryColor: 'teal',
      icon: 'lock_open',
      docNumber: `${a.doc_type}: ${a.doc_number}`,
      requester: `${a.requested_by_name || 'Staff'} (${a.requester_role || 'User'})`,
      date: a.created_at,
      amount: 0,
      details: a.reason || 'Unlock request',
      status: 'Locked / Pending',
      raw: a,
    })
  })

  hrLeaves.value.forEach((l) => {
    items.push({
      id: `l_${l.id}`,
      rawId: l.id,
      tab: 'hr',
      group: 'hr',
      category: 'HR: Leave',
      categoryColor: 'purple',
      icon: 'event_busy',
      docNumber: `${l.leave_types?.name || 'Leave'} (${l.total_days}d)`,
      requester: l.employees?.full_name || 'Staff',
      date: l.start_date,
      amount: 0,
      details: l.reason || 'Leave application',
      status: 'Pending',
      raw: l,
    })
  })

  hrAdvances.value.forEach((adv) => {
    items.push({
      id: `adv_${adv.id}`,
      rawId: adv.id,
      tab: 'hr',
      group: 'hr',
      category: 'HR: Advance',
      categoryColor: 'purple-8',
      icon: 'payments',
      docNumber: 'Advance Request',
      requester: adv.employees?.full_name || 'Staff',
      date: adv.request_date || adv.created_at,
      amount: adv.amount || 0,
      details: adv.reason || 'Salary advance',
      status: 'Pending',
      raw: adv,
    })
  })

  hrLoans.value.forEach((lo) => {
    items.push({
      id: `lo_${lo.id}`,
      rawId: lo.id,
      tab: 'hr',
      group: 'hr',
      category: 'HR: Loan',
      categoryColor: 'purple-9',
      icon: 'request_quote',
      docNumber: `Loan: LKR ${Number(lo.loan_amount || 0).toLocaleString()}`,
      requester: lo.employees?.full_name || 'Staff',
      date: lo.created_at,
      amount: lo.loan_amount || 0,
      details: `${lo.total_installments} Installments (${formatCurrency(lo.installment_amount)}/mo)`,
      status: 'Pending',
      raw: lo,
    })
  })

  hrShiftSwaps.value.forEach((sw) => {
    items.push({
      id: `sw_${sw.id}`,
      rawId: sw.id,
      tab: 'hr',
      group: 'hr',
      category: 'HR: Shift Swap',
      categoryColor: 'deep-purple',
      icon: 'swap_horiz',
      docNumber: `Shift Date: ${formatDate(sw.shift_date)}`,
      requester: sw.employees?.full_name || 'Staff',
      date: sw.shift_date,
      amount: 0,
      details: `${sw.current_shift?.name || 'Shift'} ➔ ${sw.requested_shift?.name || 'Target'}`,
      status: 'Pending',
      raw: sw,
    })
  })

  shiftVarianceList.value.forEach((sv) => {
    items.push({
      id: `sv_${sv.id}`,
      rawId: sv.id,
      tab: 'shifts',
      group: 'finance',
      category: 'Shift Variance',
      categoryColor: 'deep-orange',
      icon: 'point_of_sale',
      docNumber: 'Cash Drawer Audit',
      requester: sv.cashier_name || 'Cashier',
      date: sv.created_at,
      amount: sv.cash_variance || 0,
      details: `Closing Cash: ${formatCurrency(sv.closing_cash)}`,
      status: 'Discrepancy Sign-off',
      raw: sv,
    })
  })

  pendingPermissions.value.forEach((p) => {
    items.push({
      id: `p_${p.id}`,
      rawId: p.id,
      tab: 'permissions',
      group: 'audits',
      category: 'Permission Gate',
      categoryColor: 'indigo',
      icon: 'security',
      docNumber: p.permission || 'Access Gate',
      requester: p.user_email || p.user_name || 'Staff User',
      date: p.created_at || new Date().toISOString(),
      amount: 0,
      details: `Elevation granted by: ${p.granted_by || 'Manager'}`,
      status: 'Security Review',
      raw: p,
    })
  })

  return items
})

const grandTotalPending = computed(() => allPendingItems.value.length)

const filteredUnifiedItems = computed(() => {
  if (queueFilter.value === 'all') return allPendingItems.value
  return allPendingItems.value.filter((i) => i.group === queueFilter.value)
})

// ── Formatting ───────────────────────────────────────────────
function formatCurrency(val) {
  if (val === undefined || val === null) return 'LKR 0.00'
  return `LKR ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(val) {
  if (!val) return '—'
  return new Date(val).toLocaleDateString()
}

// ── Table Columns ────────────────────────────────────────────
const unifiedColumns = [
  { name: 'category', label: 'Department / Category', field: 'category', align: 'left', sortable: true },
  { name: 'docNumber', label: 'Document / Ref #', field: 'docNumber', align: 'left', sortable: true },
  { name: 'requester', label: 'Requested By / Origin', field: 'requester', align: 'left' },
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'amount', label: 'Financial Impact', field: 'amount', align: 'right', sortable: true },
  { name: 'details', label: 'Justification / Remarks', field: 'details', align: 'left' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const wastageColumns = [
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'doc_number', label: 'Doc Number', field: 'doc_number', align: 'left', sortable: true },
  { name: 'warehouse_id', label: 'Warehouse / Kitchen', field: (r) => r.warehouses?.name || 'Main Kitchen', align: 'left' },
  { name: 'remarks', label: 'Remarks / Reason', field: 'remarks', align: 'left' },
  { name: 'total_cost', label: 'Loss Value', field: 'total_cost', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const poColumns = [
  { name: 'doc_date', label: 'PO Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'doc_number', label: 'PO #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'supplier', label: 'Supplier', field: (r) => r.suppliers?.name || '—', align: 'left' },
  { name: 'total_amount', label: 'Amount', field: 'total_amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const voucherColumns = [
  { name: 'voucher_date', label: 'Voucher Date', field: 'voucher_date', align: 'left', sortable: true },
  { name: 'voucher_no', label: 'Voucher #', field: 'voucher_no', align: 'left', sortable: true },
  { name: 'pay_to', label: 'Paid To', field: 'pay_to', align: 'left' },
  { name: 'narration', label: 'Narration', field: 'narration', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const amendmentColumns = [
  { name: 'doc_number', label: 'Doc Number', field: 'doc_number', align: 'left', sortable: true },
  { name: 'doc_type', label: 'Type', field: 'doc_type', align: 'center' },
  { name: 'requested_by_name', label: 'Requested By', field: (r) => `${r.requested_by_name} (${r.requester_role})`, align: 'left' },
  { name: 'reason', label: 'Reason / Justification', field: 'reason', align: 'left' },
  { name: 'created_at', label: 'Requested At', field: 'created_at', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

function getDocTypeColor(type) {
  const map = {
    GRN: 'orange-9',
    GIN: 'blue-9',
    AP_INV: 'purple-9',
    VOUCHER: 'green-9',
    PO: 'amber-9',
    WASTAGE: 'red-9',
  }
  return map[type] || 'teal'
}

const hrShiftSwapColumns = [
  { name: 'shift_date', label: 'Shift Date', field: 'shift_date', align: 'left' },
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || 'Staff', align: 'left' },
  { name: 'current_shift', label: 'Current Shift', field: (r) => r.current_shift?.name || 'Morning', align: 'left' },
  { name: 'requested_shift', label: 'Target Shift', field: (r) => r.requested_shift?.name || 'Evening', align: 'left' },
  { name: 'reason', label: 'Reason', field: 'reason', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const hrLeaveColumns = [
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || '—', align: 'left' },
  { name: 'leave_type', label: 'Type', field: (r) => r.leave_types?.name || 'Leave', align: 'left' },
  { name: 'start_date', label: 'From', field: 'start_date', align: 'left' },
  { name: 'end_date', label: 'To', field: 'end_date', align: 'left' },
  { name: 'total_days', label: 'Days', field: 'total_days', align: 'center' },
  { name: 'reason', label: 'Reason', field: 'reason', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const hrAdvanceColumns = [
  { name: 'request_date', label: 'Date', field: 'request_date', align: 'left' },
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || '—', align: 'left' },
  { name: 'reason', label: 'Reason', field: 'reason', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const hrLoanColumns = [
  { name: 'created_at', label: 'Requested Date', field: 'created_at', align: 'left' },
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || '—', align: 'left' },
  { name: 'loan_amount', label: 'Loan Amount', field: 'loan_amount', align: 'right' },
  { name: 'total_installments', label: 'Months', field: 'total_installments', align: 'center' },
  { name: 'installment_amount', label: 'Monthly EMI', field: 'installment_amount', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const hrExpenseColumns = [
  { name: 'expense_date', label: 'Date', field: 'expense_date', align: 'left' },
  { name: 'employee', label: 'Employee', field: (r) => r.employees?.full_name || '—', align: 'left' },
  { name: 'expense_type', label: 'Type', field: 'expense_type', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const permissionColumns = [
  { name: 'user', label: 'Target User', field: (r) => r.user_email || r.user_name || 'Staff User', align: 'left' },
  { name: 'role', label: 'Assigned Role', field: (r) => r.role || 'Cashier / Manager', align: 'left' },
  { name: 'permission', label: 'Elevated Privilege', field: 'permission', align: 'left' },
  { name: 'requested_by', label: 'Granted By', field: (r) => r.granted_by || 'HR / Manager', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

const shiftVarianceColumns = [
  { name: 'created_at', label: 'Shift Date', field: 'created_at', align: 'left' },
  { name: 'cashier_name', label: 'Cashier', field: 'cashier_name', align: 'left' },
  { name: 'opening_cash', label: 'Opening Cash', field: 'opening_cash', align: 'right' },
  { name: 'closing_cash', label: 'Closing Cash', field: 'closing_cash', align: 'right' },
  { name: 'cash_variance', label: 'Variance', field: 'cash_variance', align: 'right' },
  { name: 'actions', label: 'Actions', field: 'id', align: 'center' },
]

// ── Data Fetching ────────────────────────────────────────────
async function loadAllPending() {
  loading.value = true
  try {
    const [wRes, poRes, vRes, amendRes, ssRes, lRes, aRes, loRes, eRes, pRes, sRes] = await Promise.allSettled([
      supabase.from('inventory_documents').select('*, warehouses(name)').eq('doc_type', 'WASTAGE').in('status', ['draft', 'pending', 'pending_approval']),
      supabase.from('procurement_purchase_orders').select('*, suppliers(name)').eq('status', 'draft'),
      supabase.from('finance_vouchers').select('*').in('status', ['draft', 'pending']),
      fetchPendingAmendments(),
      supabase.from('shift_swap_requests').select('*, employees(full_name), current_shift:shifts!current_shift_id(name), requested_shift:shifts!requested_shift_id(name)').eq('status', 'pending'),
      supabase.from('leave_requests').select('*, employees(full_name), leave_types(name)').eq('status', 'pending'),
      supabase.from('employee_advances').select('*, employees(full_name)').eq('status', 'pending'),
      supabase.from('employee_loans').select('*, employees(full_name)').eq('status', 'pending'),
      supabase.from('employee_expenses').select('*, employees(full_name)').eq('status', 'pending'),
      supabase.from('user_permissions').select('*').eq('is_active', false),
      supabase.from('pos_shifts').select('*').or('cash_variance.gt.1000,cash_variance.lt.-1000').order('created_at', { ascending: false }).limit(20),
    ])

    if (wRes.status === 'fulfilled') wastageList.value = wRes.value.data || []
    if (poRes.status === 'fulfilled') poList.value = poRes.value.data || []
    if (vRes.status === 'fulfilled') voucherList.value = vRes.value.data || []
    if (amendRes.status === 'fulfilled') amendmentList.value = amendRes.value || []
    if (ssRes.status === 'fulfilled') hrShiftSwaps.value = ssRes.value.data || []
    if (lRes.status === 'fulfilled') hrLeaves.value = lRes.value.data || []
    if (aRes.status === 'fulfilled') hrAdvances.value = aRes.value.data || []
    if (loRes.status === 'fulfilled') hrLoans.value = loRes.value.data || []
    if (eRes.status === 'fulfilled') hrExpenses.value = eRes.value.data || []
    if (pRes.status === 'fulfilled') pendingPermissions.value = pRes.value.data || []
    if (sRes.status === 'fulfilled') shiftVarianceList.value = sRes.value.data || []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAllPending()
})

// ── Actions ──────────────────────────────────────────────────
async function approveWastage(doc) {
  try {
    const { error } = await supabase
      .from('inventory_documents')
      .update({ status: 'posted', approved_at: new Date().toISOString() })
      .eq('id', doc.id)

    if (error) throw error
    $q.notify({ type: 'positive', message: `Wastage Document ${doc.doc_number || ''} Approved` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve wastage', caption: err.message })
  }
}

async function rejectWastage(doc) {
  $q.dialog({
    title: 'Reject Wastage Document',
    message: 'Provide rejection notes:',
    prompt: { model: '', type: 'text' },
    cancel: true,
  }).onOk(async (notes) => {
    try {
      const { error } = await supabase
        .from('inventory_documents')
        .update({ status: 'rejected', remarks: `${doc.remarks || ''} [Rejected: ${notes}]` })
        .eq('id', doc.id)

      if (error) throw error
      $q.notify({ type: 'warning', message: 'Wastage document marked as rejected' })
      loadAllPending()
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to reject wastage', caption: err.message })
    }
  })
}

async function approvePOItem(po) {
  try {
    const res = await approvePO(po.id)
    $q.notify(
      res.status === 'approved'
        ? { type: 'positive', message: `PO ${po.doc_number || ''} Approved & Opened` }
        : { type: 'info', message: `PO ${po.doc_number || ''}: level approved`, caption: res.message },
    )
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve PO', caption: err.message })
  }
}

async function rejectPOItem(po) {
  try {
    const { error } = await supabase
      .from('procurement_purchase_orders')
      .update({ status: 'cancelled' })
      .eq('id', po.id)

    if (error) throw error
    $q.notify({ type: 'warning', message: `PO ${po.doc_number || ''} Cancelled` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to cancel PO', caption: err.message })
  }
}

async function approveVoucherItem(v) {
  try {
    const { error } = await supabase
      .from('finance_vouchers')
      .update({ status: 'approved' })
      .eq('id', v.id)

    if (error) throw error
    $q.notify({ type: 'positive', message: `Voucher ${v.voucher_no || ''} Approved` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve voucher', caption: err.message })
  }
}

async function rejectVoucherItem(v) {
  try {
    const { error } = await supabase
      .from('finance_vouchers')
      .update({ status: 'cancelled' })
      .eq('id', v.id)

    if (error) throw error
    $q.notify({ type: 'warning', message: `Voucher ${v.voucher_no || ''} Cancelled` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to cancel voucher', caption: err.message })
  }
}

async function approveShiftSwap(swap) {
  try {
    const { error } = await supabase
      .from('shift_swap_requests')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', swap.id)

    if (error) throw error

    // Update assignment if shift_assignments ID exists
    if (swap.assignment_id && swap.requested_shift_id) {
      await supabase
        .from('shift_assignments')
        .update({ shift_id: swap.requested_shift_id })
        .eq('id', swap.assignment_id)
    }

    $q.notify({ type: 'positive', message: 'Shift change approved and updated in roster' })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve shift swap', caption: err.message })
  }
}

async function rejectShiftSwap(swap) {
  try {
    const { error } = await supabase
      .from('shift_swap_requests')
      .update({ status: 'rejected' })
      .eq('id', swap.id)

    if (error) throw error
    $q.notify({ type: 'warning', message: 'Shift change request rejected' })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to reject shift swap', caption: err.message })
  }
}

async function approvePermission(perm) {
  try {
    const { error } = await supabase
      .from('user_permissions')
      .update({ is_active: true, approved_at: new Date().toISOString() })
      .eq('id', perm.id)

    if (error) throw error
    $q.notify({ type: 'positive', message: 'Elevated permission verified and activated' })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to approve permission', caption: err.message })
  }
}

async function denyPermission(perm) {
  try {
    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('id', perm.id)

    if (error) throw error
    $q.notify({ type: 'warning', message: 'Elevated permission access denied and revoked' })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Failed to deny permission', caption: err.message })
  }
}

async function handleHRAction(type, id, status) {
  if (requiresDisbursement(type, status)) {
    return approveStaffReceivable(type, id)
  }
  const tableMap = {
    leaves: 'leave_requests',
    advances: 'employee_advances',
    loans: 'employee_loans',
    expenses: 'employee_expenses',
  }
  const table = tableMap[type]
  const dbStatus = hrTargetStatus(type, status)
  try {
    const { error } = await supabase
      .from(table)
      .update({ status: dbStatus, approved_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    $q.notify({ type: status === 'approved' ? 'positive' : 'warning', message: `Request ${status}` })
    loadAllPending()
  } catch (err) {
    $q.notify({ type: 'negative', message: `Failed to update request: ${err.message}` })
  }
}

async function approveStaffReceivable(type, id) {
  const { data: accounts, error: accErr } = await supabase
    .from('finance_accounts')
    .select('id, registered_name, account_type')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('registered_name')
  if (accErr || !accounts?.length) {
    $q.notify({
      type: 'negative',
      message: accErr?.message || 'No active finance cash/bank account to pay this out from.',
    })
    return
  }
  const def = accounts.find((a) => a.account_type === 'cash') || accounts[0]
  $q.dialog({
    title: type === 'loans' ? 'Approve & Disburse Loan' : 'Approve & Disburse Advance',
    message: 'Pay out from which cash/bank account?',
    options: {
      type: 'radio',
      model: def.id,
      items: accounts.map((a) => ({
        label: `${a.registered_name}${a.account_type ? ' (' + a.account_type + ')' : ''}`,
        value: a.id,
      })),
    },
    cancel: true,
    persistent: true,
  }).onOk(async (accountId) => {
    try {
      let res
      if (type === 'advances') {
        res = await disburseEmployeeAdvance(supabase, id, accountId, authStore.user?.id)
      } else {
        res = await disburseStaffReceivable(supabase, 'employee_loan', id, accountId)
        if (res.missing) {
          const { error } = await supabase
            .from('employee_loans')
            .update({
              status: hrTargetStatus('loans', 'approved'),
              approved_at: new Date().toISOString(),
              approved_by: authStore.user?.id,
            })
            .eq('id', id)
          if (error) throw error
          $q.notify({
            type: 'info',
            message: `Loan approved (active). ${FINANCE_POSTING_UNAVAILABLE}`,
            multiLine: true,
            timeout: 7000,
          })
          loadAllPending()
          return
        }
      }
      if (!res.ok) throw new Error(res.missing ? FINANCE_POSTING_UNAVAILABLE : res.error)
      $q.notify({ type: 'positive', message: 'Approved and disbursed' })
      loadAllPending()
    } catch (err) {
      $q.notify({ type: 'negative', message: `Not approved: ${err.message}`, multiLine: true })
    }
  })
}

function signOffShift(row) {
  $q.notify({ type: 'positive', message: `Shift Variance for ${row.cashier_name || 'Cashier'} signed off` })
}

async function handleApproveAmendment(row) {
  $q.dialog({
    title: 'Approve & Unlock Document',
    message: `Are you sure you want to unlock ${row.doc_type} "${row.doc_number}" for editing? This will return the document status to Draft.`,
    prompt: {
      model: '',
      type: 'text',
      label: 'Admin Authorization Note (Optional)',
    },
    cancel: true,
    persistent: true,
    ok: {
      label: 'Approve & Unlock',
      color: 'positive',
    },
  }).onOk(async (adminNotes) => {
    try {
      const res = await approveDocumentAmendment(row.id, row.doc_type, row.doc_id, adminNotes, {
        id: authStore.user?.id,
        name: authStore.userDisplayName || 'Administrator',
      })
      if (!res.success) throw new Error(res.error)
      $q.notify({ type: 'positive', icon: 'lock_open', message: `Document ${row.doc_number} unlocked for editing!` })
      loadAllPending()
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to approve amendment: ' + err.message })
    }
  })
}

async function handleRejectAmendment(row) {
  $q.dialog({
    title: 'Reject Amendment Request',
    message: `Provide rejection justification for ${row.doc_number}:`,
    prompt: {
      model: '',
      type: 'text',
      label: 'Rejection Reason',
    },
    cancel: true,
    persistent: true,
    ok: {
      label: 'Reject Request',
      color: 'negative',
    },
  }).onOk(async (notes) => {
    try {
      const res = await rejectDocumentAmendment(row.id, notes, row.doc_type, row.doc_id)
      if (!res.success) throw new Error(res.error)
      $q.notify({ type: 'warning', message: `Amendment request for ${row.doc_number} rejected.` })
      loadAllPending()
    } catch (err) {
      $q.notify({ type: 'negative', message: 'Failed to reject amendment: ' + err.message })
    }
  })
}
</script>

<style scoped>
.border-bottom {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.border-top {
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.approvals-hero-card {
  border-radius: 12px;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.approvals-inbox-card {
  border-radius: 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.approvals-inbox-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
  border-color: var(--q-primary);
}

.fin-panel {
  background: var(--erp-panel-bg, #ffffff);
  border: 1px solid var(--erp-border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  overflow: hidden;
}

body.body--dark .fin-panel {
  background: #1e1e2d;
  border-color: rgba(255, 255, 255, 0.08);
}
body.body--dark .border-bottom,
body.body--dark .border-top {
  border-color: rgba(255, 255, 255, 0.08);
}
body.body--dark .approvals-inbox-card {
  background: #1e1e2d;
  border-color: rgba(255, 255, 255, 0.08);
}
body.body--dark .approvals-hero-card {
  border-color: rgba(255, 255, 255, 0.08);
}
</style>
