<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="hr"
      title="Leave Management"
      breadcrumbs="Human Resources / Leave Management"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg items-stretch">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="hr-kpi-card hr-kpi-card--amber">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon">
              <q-icon name="pending_actions" size="22px" color="white" />
            </div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Pending Requests</div>
              <div class="hr-kpi-value">{{ kpi.pending }}</div>
            </div>
            <q-icon name="hourglass_top" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="hr-kpi-card hr-kpi-card--green">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="check_circle" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Approved (Month)</div>
              <div class="hr-kpi-value">{{ kpi.approvedMonth }}</div>
            </div>
            <q-icon name="task_alt" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="hr-kpi-card hr-kpi-card--red">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="cancel" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Rejected (Month)</div>
              <div class="hr-kpi-value">{{ kpi.rejectedMonth }}</div>
            </div>
            <q-icon name="block" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat class="hr-kpi-card hr-kpi-card--cyan">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="category" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Leave Types</div>
              <div class="hr-kpi-value">{{ kpi.types }}</div>
            </div>
            <q-icon name="list_alt" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Main Tabs Card -->
    <q-card
      flat
      bordered
      :class="[$q.dark.isActive ? 'bg-dark border-dark' : 'bg-white']"
      :style="{ borderTop: '3px solid #f9a825' }"
    >
      <div class="row items-center justify-between q-px-md q-pt-sm">
        <q-tabs
          v-model="activeTab"
          :dark="$q.dark.isActive"
          dense
          align="left"
          active-color="amber-9"
          indicator-color="amber-9"
          narrow-indicator
          no-caps
          :class="[$q.dark.isActive ? 'text-grey-5' : 'text-grey-7', 'text-weight-medium']"
        >
          <q-tab name="requests" label="Leave Requests" />
          <q-tab name="types" label="Leave Types" />
          <q-tab name="balances" label="Balances" />
          <q-tab name="calendar" label="Calendar" icon="calendar_month" />
        </q-tabs>
        <div class="q-gutter-sm">
          <q-btn
            v-if="activeTab === 'requests'"
            unelevated
            color="positive"
            text-color="white"
            icon="download"
            label="Excel"
            no-caps
            dense
            padding="xs md"
            class="text-weight-medium"
            @click="exportRequestsExcel"
          />
          <q-btn
            v-if="activeTab === 'requests'"
            unelevated
            color="red-6"
            text-color="white"
            icon="picture_as_pdf"
            label="PDF"
            no-caps
            dense
            padding="xs md"
            class="text-weight-medium"
            @click="exportRequestsPDF"
          />
          <q-btn
            v-if="activeTab === 'requests'"
            unelevated
            color="amber-8"
            text-color="dark"
            icon="add"
            label="New Request"
            no-caps
            dense
            padding="xs md"
            class="text-weight-medium"
            @click="openNewRequest"
          />
          <q-btn
            v-if="activeTab === 'types'"
            unelevated
            color="amber-8"
            text-color="dark"
            icon="add"
            label="Add Leave Type"
            no-caps
            dense
            padding="xs md"
            class="text-weight-medium"
            @click="openLeaveTypeDialog()"
          />
          <q-btn
            v-if="activeTab === 'balances'"
            unelevated
            color="positive"
            text-color="white"
            icon="download"
            label="Excel"
            no-caps
            dense
            padding="xs md"
            class="text-weight-medium"
            @click="exportBalancesExcel"
          />
          <q-btn
            v-if="activeTab === 'balances'"
            unelevated
            color="red-6"
            text-color="white"
            icon="picture_as_pdf"
            label="PDF"
            no-caps
            dense
            padding="xs md"
            class="text-weight-medium"
            @click="exportBalancesPDF"
          />
          <q-btn
            v-if="activeTab === 'balances'"
            outline
            color="amber-8"
            icon="refresh"
            label="Initialize All Balances"
            no-caps
            dense
            padding="xs md"
            class="text-weight-medium"
            :loading="initializingAll"
            @click="initAllBalances"
          />
        </div>
      </div>
      <q-separator :dark="$q.dark.isActive" />

      <q-tab-panels v-model="activeTab" animated style="background: transparent">
        <!-- ══ LEAVE REQUESTS TAB ══════════════════════════════════════════ -->
        <q-tab-panel name="requests" class="q-pa-md">
          <!-- Filters -->
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-12 col-sm-3">
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
                v-model="reqStatusFilter"
                :options="[
                  { label: 'All Statuses', value: '' },
                  { label: 'Pending', value: 'pending' },
                  { label: 'Approved', value: 'approved' },
                  { label: 'Rejected', value: 'rejected' },
                  { label: 'Cancelled', value: 'cancelled' },
                ]"
                emit-value
                map-options
              />
            </div>
            <div class="col-12 col-sm-3">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Employee
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="reqEmpFilter"
                :options="[{ label: 'All Employees', value: '' }, ...employeeOptions]"
                emit-value
                map-options
                clearable
              />
            </div>
            <div class="col-12 col-sm-3">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Leave Type
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="reqTypeFilter"
                :options="[{ label: 'All Types', value: '' }, ...leaveTypeOptions]"
                emit-value
                map-options
                clearable
              />
            </div>
            <div class="col-12 col-sm-3">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Month
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="reqDateFilter"
                type="month"
                clearable
              />
            </div>
          </div>

          <q-table
            :dark="$q.dark.isActive"
            flat
            bordered
            dense
            :rows="filteredRequests"
            :columns="requestColumns"
            row-key="id"
            :loading="loadingRequests"
            :pagination="{ rowsPerPage: 15 }"
            :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'text-body2']"
            table-header-class="text-weight-bold text-uppercase"
          >
            <template #body-cell-employee="props">
              <q-td :props="props">
                <div :class="['text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-dark']">
                  {{ props.row.employees?.full_name || props.row.employees?.first_name }}
                </div>
                <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">
                  {{ props.row.employees?.employee_code }}
                </div>
              </q-td>
            </template>

            <template #body-cell-leave_type="props">
              <q-td :props="props">
                <q-badge
                  :color="props.row.leave_types?.is_paid ? 'green-9' : 'orange-9'"
                  :label="props.row.leave_types?.name || '—'"
                />
              </q-td>
            </template>

            <template #body-cell-dates="props">
              <q-td :props="props">
                <div class="text-caption text-grey-3">
                  {{ props.row.start_date }} → {{ props.row.end_date }}
                </div>
                <div class="text-caption text-amber">{{ props.row.total_days }} day(s)</div>
              </q-td>
            </template>

            <template #body-cell-status="props">
              <q-td :props="props" class="text-center">
                <q-badge
                  :color="statusColor(props.row.status)"
                  :label="props.row.status"
                  class="text-capitalize"
                />
              </q-td>
            </template>

            <template #body-cell-actions="props">
              <q-td :props="props" class="q-gutter-xs">
                <template v-if="props.row.status === 'pending'">
                  <q-btn
                    flat
                    dense
                    round
                    icon="check_circle"
                    color="green"
                    size="sm"
                    @click="confirmApprove(props.row)"
                  >
                    <q-tooltip>Approve</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    round
                    icon="cancel"
                    color="negative"
                    size="sm"
                    @click="openRejectDialog(props.row)"
                  >
                    <q-tooltip>Reject</q-tooltip>
                  </q-btn>
                </template>
                <q-btn
                  v-if="props.row.status !== 'approved'"
                  flat
                  dense
                  round
                  icon="delete"
                  color="negative"
                  size="xs"
                  @click="deleteRequest(props.row)"
                >
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ LEAVE TYPES TAB ════════════════════════════════════════════ -->
        <q-tab-panel name="types" class="q-pa-md">
          <q-table
            :dark="$q.dark.isActive"
            flat
            bordered
            dense
            :rows="leaveTypes"
            :columns="typeColumns"
            row-key="id"
            :loading="loadingTypes"
            :pagination="{ rowsPerPage: 15 }"
            :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'text-body2']"
            table-header-class="text-weight-bold text-uppercase"
          >
            <template #body-cell-is_paid="props">
              <q-td :props="props" class="text-center">
                <q-badge
                  :color="props.row.is_paid ? 'green' : 'orange'"
                  :label="props.row.is_paid ? 'Paid' : 'Unpaid'"
                />
              </q-td>
            </template>
            <template #body-cell-carry_forward="props">
              <q-td :props="props" class="text-center">
                <q-icon
                  :name="props.row.carry_forward ? 'check' : 'close'"
                  :color="props.row.carry_forward ? 'green' : 'grey'"
                />
                <span v-if="props.row.carry_forward" class="text-caption text-grey-4 q-ml-xs"
                  >max {{ props.row.max_carry_forward_days }}d</span
                >
              </q-td>
            </template>
            <template #body-cell-is_active="props">
              <q-td :props="props" class="text-center">
                <q-toggle
                  :model-value="props.row.is_active"
                  color="green"
                  size="sm"
                  @update:model-value="toggleLeaveType(props.row)"
                />
              </q-td>
            </template>
            <template #body-cell-actions="props">
              <q-td :props="props" class="q-gutter-xs">
                <q-btn
                  flat
                  dense
                  round
                  icon="edit"
                  color="amber"
                  size="sm"
                  @click="openLeaveTypeDialog(props.row)"
                >
                  <q-tooltip>Edit</q-tooltip>
                </q-btn>
                <q-btn
                  flat
                  dense
                  round
                  icon="delete"
                  color="negative"
                  size="sm"
                  @click="deleteLeaveType(props.row)"
                >
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ LEAVE BALANCES TAB ═════════════════════════════════════════ -->
        <q-tab-panel name="balances" class="q-pa-md">
          <div class="row q-col-gutter-sm q-mb-md items-center">
            <div class="col-auto">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Year
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="balanceYear"
                :options="yearOptions"
                style="width: 120px"
                @update:model-value="loadBalances"
              />
            </div>
            <div class="col-auto">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Employee
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="balanceEmpFilter"
                :options="[{ label: 'All Employees', value: '' }, ...employeeOptions]"
                emit-value
                map-options
                clearable
                style="width: 220px"
              />
            </div>
            <div class="col-auto">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Leave Type
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="balanceTypeFilter"
                :options="[{ label: 'All Types', value: '' }, ...leaveTypeOptions]"
                emit-value
                map-options
                clearable
                style="width: 200px"
              />
            </div>
          </div>

          <q-table
            :dark="$q.dark.isActive"
            flat
            bordered
            dense
            :rows="filteredBalances"
            :columns="balanceColumns"
            row-key="id"
            :loading="loadingBalances"
            :pagination="{ rowsPerPage: 25 }"
            :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white', 'text-body2']"
            table-header-class="text-weight-bold text-uppercase"
          >
            <template #body-cell-employee="props">
              <q-td :props="props">
                <div :class="['text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-dark']">
                  {{ props.row.employees?.full_name || props.row.employees?.first_name }}
                </div>
                <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">
                  {{ props.row.employees?.employee_code }}
                </div>
              </q-td>
            </template>
            <template #body-cell-leave_type="props">
              <q-td :props="props">
                <q-badge
                  :color="props.row.leave_types?.is_paid ? 'green-9' : 'orange-9'"
                  :label="props.row.leave_types?.name"
                />
              </q-td>
            </template>
            <template #body-cell-remaining_days="props">
              <q-td :props="props" class="text-center">
                <span
                  :class="
                    Number(props.row.remaining_days) > 0
                      ? 'text-green text-weight-bold'
                      : 'text-red text-weight-bold'
                  "
                >
                  {{ props.row.remaining_days }}
                </span>
              </q-td>
            </template>
            <template #body-cell-progress="props">
              <q-td :props="props" style="min-width: 120px">
                <q-linear-progress
                  :value="
                    props.row.total_entitlement > 0
                      ? props.row.used_days / props.row.total_entitlement
                      : 0
                  "
                  :color="Number(props.row.remaining_days) > 0 ? 'amber' : 'red'"
                  track-color="grey-8"
                  rounded
                  size="6px"
                />
                <div class="text-caption text-grey-5 q-mt-xs">
                  {{ props.row.used_days }} / {{ props.row.total_entitlement }} used
                </div>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- ══ CALENDAR TAB ══════════════════════════════════════════════ -->
        <q-tab-panel name="calendar" class="q-pa-md">
          <!-- Month navigation -->
          <div class="row items-center justify-between q-mb-md">
            <q-btn
              flat
              round
              icon="chevron_left"
              :dark="$q.dark.isActive"
              @click="calPrevMonth"
              :disable="loadingCalendar"
            />
            <div class="text-h6 text-weight-bold">
              {{ calMonthLabel }}
            </div>
            <q-btn
              flat
              round
              icon="chevron_right"
              :dark="$q.dark.isActive"
              @click="calNextMonth"
              :disable="loadingCalendar"
            />
          </div>

          <!-- Loading -->
          <div v-if="loadingCalendar" class="row justify-center q-pa-xl">
            <q-spinner-orbit color="amber" size="48px" />
          </div>

          <!-- Calendar grid -->
          <div v-else>
            <!-- Weekday headers -->
            <div class="row q-mb-xs">
              <div
                v-for="d in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']"
                :key="d"
                class="col text-center text-caption text-weight-bold"
                :class="$q.dark.isActive ? 'text-grey-5' : 'text-grey-7'"
              >
                {{ d }}
              </div>
            </div>

            <!-- Calendar rows -->
            <div
              v-for="(week, wi) in calWeeks"
              :key="wi"
              class="row q-mb-xs"
            >
              <div
                v-for="(day, di) in week"
                :key="di"
                class="col"
                style="min-height: 72px; padding: 2px"
              >
                <div
                  v-if="day"
                  class="rounded-borders q-pa-xs"
                  style="height: 100%; cursor: default"
                  :style="{
                    background: day.isToday
                      ? ($q.dark.isActive ? 'rgba(249,168,37,0.18)' : 'rgba(249,168,37,0.12)')
                      : ($q.dark.isActive ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                    border: day.isToday ? '1.5px solid #f9a825' : '1px solid rgba(128,128,128,0.15)',
                  }"
                >
                  <div
                    class="text-right text-caption text-weight-medium q-mb-xs"
                    :class="day.isToday ? 'text-amber-8' : ($q.dark.isActive ? 'text-grey-4' : 'text-grey-8')"
                  >
                    {{ day.date }}
                  </div>
                  <!-- Leave chips -->
                  <div v-for="(leave, li) in day.leaves.slice(0, 3)" :key="li">
                    <q-chip
                      dense
                      size="xs"
                      :color="leave.color"
                      text-color="white"
                      style="font-size: 10px; max-width: 100%; overflow: hidden"
                      class="q-ma-none q-mb-xs full-width"
                    >
                      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                        {{ leave.emp_name }}
                      </span>
                      <q-tooltip>
                        <div class="text-caption">
                          <strong>{{ leave.emp_name }}</strong><br />
                          {{ leave.leave_type }}<br />
                          {{ leave.start_date }} → {{ leave.end_date }}
                        </div>
                      </q-tooltip>
                    </q-chip>
                  </div>
                  <div
                    v-if="day.leaves.length > 3"
                    class="text-caption text-amber-7 q-mt-xs"
                    style="font-size: 10px"
                  >
                    +{{ day.leaves.length - 3 }} more
                  </div>
                </div>
              </div>
            </div>

            <!-- Legend -->
            <div class="row q-mt-md q-gutter-sm items-center">
              <span :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">Leave Types:</span>
              <q-chip
                v-for="lt in calLegend"
                :key="lt.name"
                dense
                size="sm"
                :color="lt.color"
                text-color="white"
              >{{ lt.name }}</q-chip>
              <span
                v-if="calLegend.length === 0"
                :class="['text-caption', $q.dark.isActive ? 'text-grey-6' : 'text-grey-5']"
              >No approved leaves this month</span>
            </div>
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>

    <!-- ══ NEW LEAVE REQUEST DIALOG ══════════════════════════════════════ -->
    <q-dialog v-model="showNewRequest" persistent>
      <q-card
        style="min-width: 520px"
        :class="[$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark']"
      >
        <q-card-section
          class="row items-center"
          :style="{
            borderBottom: $q.dark.isActive
              ? '1px solid rgba(255,255,255,0.07)'
              : '1px solid rgba(0,0,0,0.1)',
          }"
        >
          <q-icon name="event_note" size="24px" color="amber-6" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">New Leave Request</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section class="q-pt-md">
          <div class="q-mb-md">
            <div
              :class="[
                'text-caption text-weight-medium q-mb-xs',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
              ]"
            >
              Employee <span class="text-red">*</span>
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="reqForm.employee_id"
              :options="employeeOptions"
              emit-value
              map-options
            />
          </div>
          <div class="q-mb-md">
            <div
              :class="[
                'text-caption text-weight-medium q-mb-xs',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
              ]"
            >
              Leave Type <span class="text-red">*</span>
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="reqForm.leave_type_id"
              :options="activeLeaveTypeOptions"
              emit-value
              map-options
            />
          </div>
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-6">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Start Date <span class="text-red">*</span>
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="reqForm.start_date"
                type="date"
                @update:model-value="calcDays"
              />
            </div>
            <div class="col-6">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                End Date <span class="text-red">*</span>
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="reqForm.end_date"
                type="date"
                @update:model-value="calcDays"
              />
            </div>
          </div>
          <div
            v-if="reqForm.start_date && reqForm.end_date"
            class="q-pa-sm rounded-borders text-center q-mb-md"
            style="background: rgba(249, 168, 37, 0.1); border: 1px solid rgba(249, 168, 37, 0.3)"
          >
            <span class="text-amber text-weight-bold">{{ reqForm.total_days }} day(s)</span>
            <div class="text-caption text-grey-6 q-mt-xs">
              {{ reqForm.working_days }} working · {{ reqForm.calendar_days }} calendar day(s)
            </div>
            <div
              v-if="reqForm.working_days === 0 && reqForm.calendar_days > 0"
              class="text-caption text-orange q-mt-xs"
            >
              <q-icon name="info" size="13px" class="q-mr-xs" />Range covers only non-working days
              (weekend) — counted as calendar days
            </div>
          </div>
          <div class="text-caption text-grey-6 q-mb-md">
            <q-icon name="paid" size="14px" class="q-mr-xs" />On approval, paid leave is recorded as
            a paid attendance day (on_leave); unpaid leave as no-pay.
          </div>
          <div class="q-mb-sm">
            <div
              :class="[
                'text-caption text-weight-medium q-mb-xs',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
              ]"
            >
              Reason
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="reqForm.reason"
              type="textarea"
              rows="2"
            />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-7" no-caps v-close-popup />
          <q-btn
            unelevated
            color="amber-8"
            text-color="dark"
            icon="save"
            label="Submit Request"
            no-caps
            :loading="savingRequest"
            @click="saveLeaveRequest"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ REJECT REASON DIALOG ══════════════════════════════════════════ -->
    <q-dialog v-model="showRejectDialog" persistent>
      <q-card style="min-width: 420px; background: #111827; color: #fff">
        <q-card-section class="row items-center">
          <q-icon name="cancel" size="24px" color="negative" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">Reject Leave Request</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section>
          <div class="text-caption text-grey-4 q-mb-sm">
            Rejecting leave for
            <strong class="text-white">{{ rejectTarget?.employees?.full_name }}</strong> ({{
              rejectTarget?.total_days
            }}
            day(s))
          </div>
          <q-input
            dark
            outlined
            v-model="rejectionReason"
            label="Reason for Rejection *"
            type="textarea"
            rows="3"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="negative"
            icon="cancel"
            label="Reject"
            no-caps
            :loading="rejectingRequest"
            @click="confirmReject"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ LEAVE TYPE DIALOG ══════════════════════════════════════════════ -->
    <q-dialog v-model="showLeaveTypeDialog" persistent>
      <q-card
        style="min-width: 480px"
        :class="[$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark']"
      >
        <q-card-section
          class="row items-center"
          :style="{
            borderBottom: $q.dark.isActive
              ? '1px solid rgba(255,255,255,0.07)'
              : '1px solid rgba(0,0,0,0.1)',
          }"
        >
          <q-icon name="category" size="24px" color="cyan" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">
            {{ editingType ? 'Edit Leave Type' : 'New Leave Type' }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section class="q-pt-md">
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-8">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Leave Type Name <span class="text-red">*</span>
              </div>
              <q-input :dark="$q.dark.isActive" dense outlined v-model="typeForm.name" />
            </div>
            <div class="col-4">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Code <span class="text-red">*</span>
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="typeForm.code"
                hint="e.g. AL, SL"
              />
            </div>
          </div>
          <div class="row q-col-gutter-md q-mb-md items-center">
            <div class="col-6">
              <div
                :class="[
                  'text-caption text-weight-medium q-mb-xs',
                  $q.dark.isActive ? 'text-grey-4' : 'text-grey-8',
                ]"
              >
                Annual Quota (days) <span class="text-red">*</span>
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model.number="typeForm.annual_quota"
                type="number"
              />
            </div>
            <div class="col-6">
              <q-toggle
                :dark="$q.dark.isActive"
                v-model="typeForm.is_paid"
                label="Paid Leave"
                color="green"
              />
            </div>
          </div>
          <div class="row q-col-gutter-md q-mb-md items-center">
            <div class="col-6">
              <q-toggle
                :dark="$q.dark.isActive"
                v-model="typeForm.carry_forward"
                label="Carry Forward"
                color="blue"
              />
            </div>
            <div class="col-6" v-if="typeForm.carry_forward">
              <q-input
                dark
                outlined
                v-model.number="typeForm.max_carry_forward_days"
                type="number"
                label="Max Carry Forward (days)"
              />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="cyan"
            icon="save"
            :label="editingType ? 'Update' : 'Create'"
            no-caps
            :loading="savingType"
            @click="saveLeaveType"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { fetchAllRows } from 'src/services/hr/hrDates'
import { useAuthStore } from 'stores/auth'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const $q = useQuasar()
const authStore = useAuthStore()

// ── Tab state ─────────────────────────────────────────────────────────────────
const activeTab = ref('requests')

// ── Leave Requests ─────────────────────────────────────────────────────────────
const requests = ref([])
const loadingRequests = ref(false)
const reqStatusFilter = ref('pending')
const reqEmpFilter = ref('')
const reqTypeFilter = ref('')
const reqDateFilter = ref('')

// ── Leave Types ────────────────────────────────────────────────────────────────
const leaveTypes = ref([])
const loadingTypes = ref(false)
const showLeaveTypeDialog = ref(false)
const editingType = ref(null)
const savingType = ref(false)
const typeForm = reactive({
  name: '',
  code: '',
  annual_quota: 14,
  is_paid: true,
  carry_forward: false,
  max_carry_forward_days: 0,
})

// ── Leave Balances ─────────────────────────────────────────────────────────────
const balances = ref([])
const loadingBalances = ref(false)
const initializingAll = ref(false)
const balanceYear = ref(new Date().getFullYear())
const balanceEmpFilter = ref('')
const balanceTypeFilter = ref('')

const yearOptions = computed(() => {
  const y = new Date().getFullYear()
  return [y - 1, y, y + 1]
})

// ── New request dialog ─────────────────────────────────────────────────────────
const showNewRequest = ref(false)
const savingRequest = ref(false)
const reqForm = reactive({
  employee_id: null,
  leave_type_id: null,
  start_date: '',
  end_date: '',
  total_days: 0,
  working_days: 0,
  calendar_days: 0,
  reason: '',
})

// ── Reject dialog ──────────────────────────────────────────────────────────────
const showRejectDialog = ref(false)
const rejectTarget = ref(null)
const rejectionReason = ref('')
const rejectingRequest = ref(false)

// ── Employees list (for dropdowns) ────────────────────────────────────────────
const allEmployees = ref([])
const employeeOptions = computed(() =>
  allEmployees.value.map((e) => ({
    label: `${e.full_name || e.first_name} (${e.employee_code})`,
    value: e.id,
  })),
)
const leaveTypeOptions = computed(() =>
  leaveTypes.value.map((t) => ({ label: t.name, value: t.id })),
)
const activeLeaveTypeOptions = computed(() =>
  leaveTypes.value
    .filter((t) => t.is_active)
    .map((t) => ({ label: `${t.name} (${t.code})`, value: t.id })),
)

// ── KPI ───────────────────────────────────────────────────────────────────────
const kpi = computed(() => {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return {
    pending: requests.value.filter((r) => r.status === 'pending').length,
    approvedMonth: requests.value.filter(
      (r) => r.status === 'approved' && (r.approved_at || '').startsWith(thisMonth),
    ).length,
    rejectedMonth: requests.value.filter(
      (r) => r.status === 'rejected' && (r.updated_at || '').startsWith(thisMonth),
    ).length,
    types: leaveTypes.value.length,
  }
})

// ── Filtered rows ─────────────────────────────────────────────────────────────
const filteredRequests = computed(() => {
  let rows = requests.value
  if (reqStatusFilter.value) rows = rows.filter((r) => r.status === reqStatusFilter.value)
  if (reqEmpFilter.value) rows = rows.filter((r) => r.employee_id === reqEmpFilter.value)
  if (reqTypeFilter.value) rows = rows.filter((r) => r.leave_type_id === reqTypeFilter.value)
  if (reqDateFilter.value) rows = rows.filter((r) => r.start_date?.startsWith(reqDateFilter.value))
  return rows
})

const filteredBalances = computed(() => {
  let rows = balances.value
  if (balanceEmpFilter.value) rows = rows.filter((b) => b.employee_id === balanceEmpFilter.value)
  if (balanceTypeFilter.value)
    rows = rows.filter((b) => b.leave_type_id === balanceTypeFilter.value)
  return rows
})

// ── Table columns ──────────────────────────────────────────────────────────────
const requestColumns = [
  { name: 'employee', label: 'Employee', align: 'left', field: 'employee_id' },
  { name: 'leave_type', label: 'Leave Type', align: 'left', field: 'leave_type_id' },
  { name: 'dates', label: 'Dates', align: 'left', field: 'start_date' },
  { name: 'reason', label: 'Reason', align: 'left', field: 'reason', format: (v) => v || '—' },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'actions', label: '', align: 'center', field: 'id' },
]

const typeColumns = [
  { name: 'name', label: 'Name', align: 'left', field: 'name' },
  { name: 'code', label: 'Code', align: 'center', field: 'code' },
  { name: 'annual_quota', label: 'Quota (days)', align: 'center', field: 'annual_quota' },
  { name: 'is_paid', label: 'Paid?', align: 'center', field: 'is_paid' },
  { name: 'carry_forward', label: 'Carry Forward', align: 'center', field: 'carry_forward' },
  { name: 'is_active', label: 'Active', align: 'center', field: 'is_active' },
  { name: 'actions', label: '', align: 'center', field: 'id' },
]

const balanceColumns = [
  { name: 'employee', label: 'Employee', align: 'left', field: 'employee_id' },
  { name: 'leave_type', label: 'Leave Type', align: 'left', field: 'leave_type_id' },
  { name: 'total_entitlement', label: 'Entitled', align: 'center', field: 'total_entitlement' },
  { name: 'used_days', label: 'Used', align: 'center', field: 'used_days' },
  { name: 'remaining_days', label: 'Remaining', align: 'center', field: 'remaining_days' },
  { name: 'progress', label: 'Usage', align: 'left', field: 'used_days' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusColor(s) {
  if (s === 'approved') return 'green'
  if (s === 'rejected') return 'negative'
  if (s === 'cancelled') return 'grey'
  return 'amber-8'
}

function calcDays() {
  reqForm.working_days = 0
  reqForm.calendar_days = 0
  if (!reqForm.start_date || !reqForm.end_date) {
    reqForm.total_days = 0
    return
  }
  const start = new Date(reqForm.start_date)
  const end = new Date(reqForm.end_date)
  if (end < start) {
    reqForm.total_days = 0
    return
  }
  let working = 0
  let calendar = 0
  const cur = new Date(start)
  while (cur <= end) {
    calendar++
    const d = cur.getDay()
    if (d !== 0 && d !== 6) working++
    cur.setDate(cur.getDate() + 1)
  }
  reqForm.working_days = working
  reqForm.calendar_days = calendar
  // Persisted total defaults to working days, but a weekend-only range (working
  // = 0) falls back to the inclusive calendar-day count so single-day / weekend
  // leave still submits instead of being blocked as "invalid".
  reqForm.total_days = working > 0 ? working : calendar
}

// Map raw Supabase errors to actionable messages (RLS denials are cryptic).
function humanizeError(err) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'You do not have permission to create leave for other employees. Requires admin or HR.'
  }
  return msg
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadRequests() {
  loadingRequests.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return
    // Page past PostgREST's 1000-row cap (history grows every month).
    requests.value = await fetchAllRows(() =>
      supabase
        .from('leave_requests')
        .select(
          '*, employees(id, full_name, first_name, employee_code), leave_types(id, name, is_paid)',
        )
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }),
    )
  } catch (err) {
    console.error('[Leave] loadRequests:', err.message)
    $q.notify({ type: 'negative', message: `Failed to load leave requests: ${err.message}` })
  } finally {
    loadingRequests.value = false
  }
}

async function loadLeaveTypes() {
  loadingTypes.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    if (!companyId) return
    const { data, error } = await supabase
      .from('leave_types')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    if (error) throw error
    leaveTypes.value = data || []
  } catch (err) {
    console.error('[Leave] loadLeaveTypes:', err.message)
  } finally {
    loadingTypes.value = false
  }
}

async function loadBalances() {
  loadingBalances.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    if (!companyId) return
    const { data, error } = await supabase
      .from('leave_balances')
      .select(
        '*, employees(id, full_name, first_name, employee_code), leave_types(id, name, is_paid)',
      )
      .eq('company_id', companyId)
      .eq('year', balanceYear.value)
      .order('employee_id')
    if (error) throw error
    balances.value = data || []
  } catch (err) {
    console.error('[Leave] loadBalances:', err.message)
  } finally {
    loadingBalances.value = false
  }
}

async function loadEmployees() {
  const branchId = authStore.currentBranch?.id
  const companyId = authStore.currentBranch?.company_id
  let data = null
  if (branchId) {
    ;({ data } = await supabase
      .from('employees')
      .select('id, full_name, first_name, employee_code')
      .eq('branch_id', branchId)
      .order('first_name'))
  }
  // Fall back to company-scoped employees when the branch filter is empty or
  // yields nothing (matches other HR pages), so the dropdown is never empty.
  if ((!data || data.length === 0) && companyId) {
    ;({ data } = await supabase
      .from('employees')
      .select('id, full_name, first_name, employee_code')
      .eq('company_id', companyId)
      .order('first_name'))
  }
  allEmployees.value = data || []
}

// ── Actions — Requests ─────────────────────────────────────────────────────────
function openNewRequest() {
  Object.assign(reqForm, {
    employee_id: null,
    leave_type_id: null,
    start_date: '',
    end_date: '',
    total_days: 0,
    working_days: 0,
    calendar_days: 0,
    reason: '',
  })
  showNewRequest.value = true
}

async function saveLeaveRequest() {
  if (!reqForm.employee_id || !reqForm.leave_type_id || !reqForm.start_date || !reqForm.end_date) {
    $q.notify({ type: 'warning', message: 'Employee, leave type, and dates are required' })
    return
  }
  if (reqForm.total_days <= 0) {
    $q.notify({ type: 'warning', message: 'Invalid date range — end date is before start date' })
    return
  }
  savingRequest.value = true
  try {
    const { error } = await supabase.from('leave_requests').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      employee_id: reqForm.employee_id,
      leave_type_id: reqForm.leave_type_id,
      start_date: reqForm.start_date,
      end_date: reqForm.end_date,
      total_days: reqForm.total_days,
      reason: reqForm.reason || null,
      status: 'pending',
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Leave request submitted' })
    showNewRequest.value = false
    loadRequests()
  } catch (err) {
    console.error('[Leave] saveLeaveRequest:', err)
    $q.notify({
      type: 'negative',
      message: humanizeError(err),
      position: 'top',
      timeout: 6000,
      multiLine: true,
    })
  } finally {
    savingRequest.value = false
  }
}

function confirmApprove(req) {
  $q.dialog({
    title: 'Approve Leave',
    message: `Approve ${req.total_days} day(s) of ${req.leave_types?.name || 'leave'} for ${
      req.employees?.full_name || 'this employee'
    } (${req.start_date} → ${req.end_date})? Attendance rows will be written automatically.`,
    cancel: true,
    persistent: true,
    ok: { label: 'Approve', color: 'positive', unelevated: true, noCaps: true },
  }).onOk(() => approveRequest(req))
}

async function approveRequest(req) {
  try {
    // Column-only status update on leave_requests — trg_leave_apply_attendance
    // (att_leave_attendance_116.sql, rewired by the HR #2 no-pay-split
    // migration) fires AFTER UPDATE OF status and writes the actual
    // attendance_records rows via _apply_leave_attendance_rows ->
    // fn_calc_leave_no_pay_split, honoring the combined-across-leave-types
    // monthly paid cap. This code no longer needs (and must not attempt) any
    // attendance-row logic of its own.
    // Only flip a still-pending request: a double click / second approver must
    // not increment leave_balances.used_days twice.
    const { data: flipped, error } = await supabase
      .from('leave_requests')
      .update({
        status: 'approved',
        approved_by: authStore.user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.id)
      .eq('status', 'pending')
      .select('id')
    if (error) throw error
    if (!flipped || flipped.length === 0) {
      $q.notify({ type: 'warning', message: 'This request was already processed.' })
      loadRequests()
      return
    }

    // Leave balance used_days bookkeeping — tracks the leave TYPE's own
    // annual entitlement (a separate concern from the monthly no-pay cap,
    // which is enforced automatically by the trigger above regardless of
    // this balance). Upsert instead of the previous "only update if a row
    // already exists" — if no balance row exists yet for this employee/type/
    // year, one is created here instead of silently skipping the increment
    // (previously: naive `used_days + total_days` with no ceiling check AND
    // no row created when missing). used_days is still allowed to exceed
    // total_entitlement (that's the whole point — it's how "over quota" is
    // visible in the Balances tab), it is just no longer silently dropped
    // when the balance row didn't already exist.
    const year = new Date(req.start_date).getFullYear()
    const { data: bal, error: balErr } = await supabase
      .from('leave_balances')
      .select('id, used_days')
      .eq('employee_id', req.employee_id)
      .eq('leave_type_id', req.leave_type_id)
      .eq('year', year)
      .maybeSingle()
    if (balErr) throw balErr

    if (bal) {
      const { error: updErr } = await supabase
        .from('leave_balances')
        .update({ used_days: Number(bal.used_days || 0) + Number(req.total_days) })
        .eq('id', bal.id)
      if (updErr) throw updErr
    } else {
      const leaveType = leaveTypes.value.find((t) => t.id === req.leave_type_id)
      const { error: insErr } = await supabase.from('leave_balances').insert({
        company_id: authStore.currentBranch?.company_id,
        employee_id: req.employee_id,
        leave_type_id: req.leave_type_id,
        year,
        total_entitlement: leaveType?.annual_quota || 0,
        used_days: Number(req.total_days),
      })
      if (insErr) throw insErr
    }

    $q.notify({ type: 'positive', message: 'Leave request approved' })
    loadRequests()
    loadBalances()
  } catch (err) {
    $q.notify({ type: 'negative', message: humanizeError(err) })
  }
}

function openRejectDialog(req) {
  rejectTarget.value = req
  rejectionReason.value = ''
  showRejectDialog.value = true
}

async function confirmReject() {
  if (!rejectionReason.value.trim()) {
    $q.notify({ type: 'warning', message: 'Please provide a rejection reason' })
    return
  }
  rejectingRequest.value = true
  try {
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: 'rejected', rejection_reason: rejectionReason.value })
      .eq('id', rejectTarget.value.id)
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Leave request rejected' })
    showRejectDialog.value = false
    loadRequests()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    rejectingRequest.value = false
  }
}

async function deleteRequest(req) {
  $q.dialog({
    title: 'Delete Request',
    message: 'Delete this leave request?',
    cancel: true,
    dark: $q.dark.isActive,
    color: 'negative',
  }).onOk(async () => {
    try {
      const { error } = await supabase.from('leave_requests').delete().eq('id', req.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Request deleted' })
      loadRequests()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

// ── Actions — Leave Types ──────────────────────────────────────────────────────
function openLeaveTypeDialog(type = null) {
  editingType.value = type
  if (type) {
    Object.assign(typeForm, {
      name: type.name,
      code: type.code,
      annual_quota: type.annual_quota,
      is_paid: type.is_paid,
      carry_forward: type.carry_forward,
      max_carry_forward_days: type.max_carry_forward_days,
    })
  } else {
    Object.assign(typeForm, {
      name: '',
      code: '',
      annual_quota: 14,
      is_paid: true,
      carry_forward: false,
      max_carry_forward_days: 0,
    })
  }
  showLeaveTypeDialog.value = true
}

async function saveLeaveType() {
  if (!typeForm.name || !typeForm.code) {
    $q.notify({ type: 'warning', message: 'Name and code are required' })
    return
  }
  savingType.value = true
  try {
    const payload = {
      name: typeForm.name,
      code: typeForm.code.toUpperCase(),
      annual_quota: typeForm.annual_quota,
      is_paid: typeForm.is_paid,
      carry_forward: typeForm.carry_forward,
      max_carry_forward_days: typeForm.carry_forward ? typeForm.max_carry_forward_days : 0,
    }
    let error
    if (editingType.value) {
      ;({ error } = await supabase
        .from('leave_types')
        .update(payload)
        .eq('id', editingType.value.id))
    } else {
      ;({ error } = await supabase.from('leave_types').insert({
        ...payload,
        company_id: authStore.currentBranch?.company_id,
        is_active: true,
      }))
    }
    if (error) throw error
    $q.notify({
      type: 'positive',
      message: editingType.value ? 'Leave type updated' : 'Leave type created',
    })
    showLeaveTypeDialog.value = false
    loadLeaveTypes()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    savingType.value = false
  }
}

async function toggleLeaveType(type) {
  try {
    const { error } = await supabase
      .from('leave_types')
      .update({ is_active: !type.is_active })
      .eq('id', type.id)
    if (error) throw error
    type.is_active = !type.is_active
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
}

async function deleteLeaveType(type) {
  $q.dialog({
    title: 'Delete Leave Type',
    message: `Delete "${type.name}"? This cannot be undone.`,
    cancel: true,
    dark: $q.dark.isActive,
    color: 'negative',
  }).onOk(async () => {
    try {
      const { error } = await supabase.from('leave_types').delete().eq('id', type.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Leave type deleted' })
      loadLeaveTypes()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

// ── Actions — Balances ─────────────────────────────────────────────────────────
async function initAllBalances() {
  initializingAll.value = true
  try {
    const { error } = await supabase.rpc('initialize_leave_balances', {
      p_year: balanceYear.value,
      p_employee_id: null,
    })
    if (error) throw error
    $q.notify({
      type: 'positive',
      message: `Leave balances initialized for all employees (${balanceYear.value})`,
    })
    loadBalances()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    initializingAll.value = false
  }
}

// ── Export Methods ─────────────────────────────────────────────────────────
function exportRequestsPDF() {
  if (!filteredRequests.value || filteredRequests.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Leave Requests Report', 14, 15)

  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Total Records: ${filteredRequests.value.length}`, 14, 22)

  const head = [
    [
      '#',
      'Employee Code',
      'Employee Name',
      'Leave Type',
      'Start Date',
      'End Date',
      'Days',
      'Status',
    ],
  ]
  const body = filteredRequests.value.map((r, i) => [
    i + 1,
    r.employees?.employee_code || '—',
    r.employees?.full_name || r.employees?.first_name || '—',
    r.leave_types?.name || '—',
    r.start_date || '—',
    r.end_date || '—',
    r.total_days || 0,
    r.status || '—',
  ])

  autoTable(doc, {
    startY: 27,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [33, 150, 243] },
    styles: { fontSize: 8 },
  })

  doc.save('leave_requests_report.pdf')
}

function exportRequestsExcel() {
  if (!filteredRequests.value || filteredRequests.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const exportData = filteredRequests.value.map((r, i) => ({
    '#': i + 1,
    'Employee Code': r.employees?.employee_code || '',
    'Employee Name': r.employees?.full_name || r.employees?.first_name || '',
    'Leave Type': r.leave_types?.name || '',
    'Start Date': r.start_date || '',
    'End Date': r.end_date || '',
    Days: r.total_days || 0,
    Status: r.status || '',
  }))

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leave Requests')
  XLSX.writeFile(wb, 'leave_requests_report.xlsx')
}

function exportBalancesPDF() {
  if (!filteredBalances.value || filteredBalances.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text(`Leave Balances Report (${balanceYear.value})`, 14, 15)

  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Total Records: ${filteredBalances.value.length}`, 14, 22)

  const head = [
    ['#', 'Employee Code', 'Employee Name', 'Leave Type', 'Entitled', 'Used', 'Remaining'],
  ]
  const body = filteredBalances.value.map((r, i) => [
    i + 1,
    r.employees?.employee_code || '—',
    r.employees?.full_name || r.employees?.first_name || '—',
    r.leave_types?.name || '—',
    r.total_entitlement || 0,
    r.used_days || 0,
    r.remaining_days || 0,
  ])

  autoTable(doc, {
    startY: 27,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [33, 150, 243] },
    styles: { fontSize: 8 },
  })

  doc.save('leave_balances_report.pdf')
}

function exportBalancesExcel() {
  if (!filteredBalances.value || filteredBalances.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const exportData = filteredBalances.value.map((r, i) => ({
    '#': i + 1,
    'Employee Code': r.employees?.employee_code || '',
    'Employee Name': r.employees?.full_name || r.employees?.first_name || '',
    'Leave Type': r.leave_types?.name || '',
    'Entitled Days': r.total_entitlement || 0,
    'Used Days': r.used_days || 0,
    'Remaining Days': r.remaining_days || 0,
  }))

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leave Balances')
  XLSX.writeFile(wb, 'leave_balances_report.xlsx')
}

// ── Leave Calendar ─────────────────────────────────────────────────────────────
const calYear = ref(new Date().getFullYear())
const calMonth = ref(new Date().getMonth()) // 0-indexed
const loadingCalendar = ref(false)
const calApprovedLeaves = ref([])

const LEAVE_COLORS = [
  'teal', 'indigo', 'purple', 'deep-orange', 'cyan', 'green', 'blue-grey', 'pink',
]

const calMonthLabel = computed(() => {
  return new Date(calYear.value, calMonth.value, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
})

const calLegend = computed(() => {
  const seen = new Map()
  calApprovedLeaves.value.forEach((l) => {
    const name = l.leave_types?.name || 'Leave'
    if (!seen.has(name)) {
      seen.set(name, LEAVE_COLORS[seen.size % LEAVE_COLORS.length])
    }
  })
  return Array.from(seen.entries()).map(([name, color]) => ({ name, color }))
})

function getLeaveColor(leaveTypeName) {
  const legend = calLegend.value
  const found = legend.find((l) => l.name === leaveTypeName)
  return found ? found.color : 'teal'
}

const calWeeks = computed(() => {
  const year = calYear.value
  const month = calMonth.value
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const weeks = []
  let week = Array(firstDay).fill(null)

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    // Find leaves that cover this date
    const dayLeaves = calApprovedLeaves.value
      .filter((l) => l.start_date <= dateStr && l.end_date >= dateStr)
      .map((l) => ({
        emp_name: l.employees?.first_name
          ? `${l.employees.first_name} ${l.employees.last_name || ''}`.trim()
          : 'Employee',
        leave_type: l.leave_types?.name || 'Leave',
        start_date: l.start_date,
        end_date: l.end_date,
        color: getLeaveColor(l.leave_types?.name || 'Leave'),
      }))

    week.push({ date: d, dateStr, isToday: dateStr === todayStr, leaves: dayLeaves })

    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  return weeks
})

async function loadCalendarLeaves() {
  loadingCalendar.value = true
  try {
    const year = calYear.value
    const month = calMonth.value
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('leave_requests')
      .select('*, employees(first_name, last_name), leave_types(name)')
      .eq('status', 'approved')
      .lte('start_date', to)
      .gte('end_date', from)
    if (error) throw error
    calApprovedLeaves.value = data || []
  } catch (err) {
    console.error('Calendar load error:', err)
    calApprovedLeaves.value = []
  } finally {
    loadingCalendar.value = false
  }
}

function calPrevMonth() {
  if (calMonth.value === 0) {
    calMonth.value = 11
    calYear.value--
  } else {
    calMonth.value--
  }
  if (activeTab.value === 'calendar') loadCalendarLeaves()
}

function calNextMonth() {
  if (calMonth.value === 11) {
    calMonth.value = 0
    calYear.value++
  } else {
    calMonth.value++
  }
  if (activeTab.value === 'calendar') loadCalendarLeaves()
}

// Watch tab changes to load calendar data on demand
watch(activeTab, (tab) => {
  if (tab === 'calendar') loadCalendarLeaves()
})

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([loadRequests(), loadLeaveTypes(), loadEmployees()])
  loadBalances()
})
</script>
