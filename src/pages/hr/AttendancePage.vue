<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="Attendance" breadcrumbs="Human Resources / Attendance" />

    <div class="row items-end q-mb-md q-gutter-x-sm q-gutter-y-md">
      <div class="col-auto">
        <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
          Select Date
        </div>
        <q-input
          :dark="$q.dark.isActive"
          dense
          outlined
          v-model="filterDate"
          type="date"
          style="width: 150px"
          @update:model-value="loadAttendance"
        />
      </div>
      <div class="col-auto">
        <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
          Department
        </div>
        <q-select
          :dark="$q.dark.isActive"
          dense
          outlined
          v-model="filterDepartment"
          :options="departments"
          option-label="name"
          option-value="id"
          emit-value
          map-options
          clearable
          style="width: 180px"
          @update:model-value="loadAttendance"
        />
      </div>
      <div class="col-auto">
        <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
          Employee
        </div>
        <q-select
          :dark="$q.dark.isActive"
          dense
          outlined
          v-model="filterEmployee"
          :options="filteredEmployeesList"
          option-label="full_name"
          option-value="id"
          emit-value
          map-options
          clearable
          style="width: 220px"
          @update:model-value="loadAttendance"
        >
          <template v-slot:option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
      </div>

      <div class="col-auto">
        <div class="row q-gutter-x-sm">
          <q-btn
            color="primary"
            icon="refresh"
            @click="loadAttendance"
            no-caps
            unelevated
            style="height: 40px"
          >
            <q-tooltip>Refresh</q-tooltip>
          </q-btn>
          <q-btn
            color="amber-8"
            text-color="dark"
            icon="add"
            label="Mark"
            @click="openMarkAttendance"
            no-caps
            unelevated
            style="height: 40px"
          />
          <q-btn
            color="deep-orange"
            icon="person_off"
            label="Mark Absentees"
            @click="markAbsentees"
            :loading="markingAbsentees"
            no-caps
            unelevated
            style="height: 40px"
          >
            <q-tooltip>Create no-pay records for scheduled staff who never clocked in</q-tooltip>
          </q-btn>
          <q-btn
            v-if="canManageAttendance"
            color="indigo"
            icon="fact_check"
            label="Bulk / Finalize"
            @click="openBulkBuilder"
            no-caps
            unelevated
            style="height: 40px"
          >
            <q-tooltip>Month-end: bulk build / correct attendance before payroll</q-tooltip>
          </q-btn>
          <q-btn
            color="positive"
            icon="download"
            label="Excel"
            @click="exportExcel"
            no-caps
            unelevated
            style="height: 40px"
          />
          <q-btn
            color="red-6"
            icon="picture_as_pdf"
            label="PDF"
            @click="exportPDF"
            no-caps
            unelevated
            style="height: 40px"
          />
        </div>
      </div>
      <q-space />
      <div class="col-12 col-sm-3 col-md-2">
        <q-input
          :dark="$q.dark.isActive"
          dense
          outlined
          v-model="search"
          placeholder="Search Table..."
          clearable
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
    </div>

    <!-- KPI Row -->
    <div class="row q-col-gutter-md q-mb-md items-stretch">
      <div class="col-12 col-sm-6 col-md">
        <q-card flat class="hr-kpi-card hr-kpi-card--green">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="how_to_reg" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Present</div>
              <div class="hr-kpi-value">{{ stats.present }}</div>
            </div>
            <q-icon name="person_check" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md">
        <q-card flat class="hr-kpi-card hr-kpi-card--red">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="person_off" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Absent</div>
              <div class="hr-kpi-value">{{ stats.absent }}</div>
            </div>
            <q-icon name="no_accounts" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md">
        <q-card flat class="hr-kpi-card hr-kpi-card--amber">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="schedule" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">Late</div>
              <div class="hr-kpi-value">{{ stats.late }}</div>
            </div>
            <q-icon name="alarm" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md">
        <q-card flat class="hr-kpi-card hr-kpi-card--cyan">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="beach_access" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">On Leave</div>
              <div class="hr-kpi-value">{{ stats.leave }}</div>
            </div>
            <q-icon name="event_available" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-sm-6 col-md">
        <q-card flat class="hr-kpi-card hr-kpi-card--orange">
          <q-card-section class="hr-kpi-inner">
            <div class="hr-kpi-icon"><q-icon name="money_off" size="22px" color="white" /></div>
            <div style="flex: 1">
              <div class="hr-kpi-label">No Pay</div>
              <div class="hr-kpi-value">{{ stats.no_pay }}</div>
            </div>
            <q-icon name="paid" size="64px" class="hr-kpi-watermark" color="white" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-table
      :dark="$q.dark.isActive"
      flat
      bordered
      :rows="records"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="search"
      :pagination="{ rowsPerPage: 30 }"
      :class="[$q.dark.isActive ? 'bg-dark' : 'bg-white']"
    >
      <template #body-cell-employee="props">
        <q-td :props="props">
          <div :class="['text-weight-bold', $q.dark.isActive ? 'text-white' : 'text-dark']">
            {{ props.row.employees?.full_name }}
          </div>
          <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">
            {{ props.row.employees?.employee_code }}
          </div>
        </q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="attColor(props.row.status)"
            :label="props.row.status"
            class="text-capitalize"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn flat round dense icon="edit" color="amber" size="sm" @click="editRecord(props.row)"
            ><q-tooltip>Edit</q-tooltip></q-btn
          >
        </q-td>
      </template>
    </q-table>

    <!-- Edit Dialog -->
    <q-dialog v-model="showEdit">
      <q-card
        style="min-width: 440px; padding: 0"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
      >
        <q-card-section
          class="row items-center q-pa-md"
          :style="{
            borderBottom: $q.dark.isActive
              ? '1px solid rgba(255,255,255,0.07)'
              : '1px solid rgba(0,0,0,0.1)',
          }"
        >
          <q-icon name="edit_calendar" size="20px" color="amber" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Edit Attendance</div>
        </q-card-section>
        <q-card-section class="q-gutter-md q-pa-lg">
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                Check In
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="editForm.clock_in"
                mask="time"
                @blur="triggerEditCalc"
              >
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time
                        :dark="$q.dark.isActive"
                        v-model="editForm.clock_in"
                        format24h
                        @update:model-value="triggerEditCalc"
                      >
                        <div class="row items-center justify-end">
                          <q-btn v-close-popup label="Done" color="primary" flat />
                        </div>
                      </q-time>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-6">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                Check Out
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="editForm.clock_out"
                mask="time"
                @blur="triggerEditCalc"
              >
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time
                        :dark="$q.dark.isActive"
                        v-model="editForm.clock_out"
                        format24h
                        @update:model-value="triggerEditCalc"
                      >
                        <div class="row items-center justify-end">
                          <q-btn v-close-popup label="Done" color="primary" flat />
                        </div>
                      </q-time>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
          </div>

          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Status
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="editForm.status"
              :options="statusOptions"
            />
          </div>

          <!-- Auto-calculated metrics -->
          <div
            :class="['rounded-borders q-pa-md', $q.dark.isActive ? 'bg-grey-9' : 'bg-blue-grey-1']"
          >
            <div class="row items-center q-mb-sm">
              <q-icon name="auto_fix_high" size="14px" color="primary" class="q-mr-xs" />
              <span
                class="text-caption text-weight-medium"
                :class="$q.dark.isActive ? 'text-blue-3' : 'text-primary'"
                >Auto-Calculated</span
              >
              <q-space />
              <q-btn
                flat
                dense
                no-caps
                size="xs"
                icon="refresh"
                label="Recalculate"
                color="primary"
                @click="triggerEditCalc"
              />
            </div>
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <div class="text-caption text-grey-6 q-mb-xs">Late (Mins)</div>
                <div
                  class="text-h6 text-weight-bold"
                  :class="
                    editForm.late_minutes > 0
                      ? 'text-red'
                      : $q.dark.isActive
                        ? 'text-white'
                        : 'text-dark'
                  "
                >
                  {{ editForm.late_minutes || 0 }}
                  <span v-if="editForm.late_minutes > 0" class="text-caption text-red q-ml-xs"
                    >mins late</span
                  >
                </div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-6 q-mb-xs">OT (Hours)</div>
                <div
                  class="text-h6 text-weight-bold"
                  :class="
                    editForm.overtime_hours > 0
                      ? 'text-green'
                      : $q.dark.isActive
                        ? 'text-white'
                        : 'text-dark'
                  "
                >
                  {{ editForm.overtime_hours || 0 }}
                  <span v-if="editForm.overtime_hours > 0" class="text-caption text-green q-ml-xs"
                    >hrs OT</span
                  >
                </div>
              </div>
              <div class="col-6">
                <div class="text-caption text-grey-6 q-mb-xs">Early Departure (Mins)</div>
                <div
                  class="text-h6 text-weight-bold"
                  :class="
                    editForm.early_departure_minutes > 0
                      ? 'text-deep-orange'
                      : $q.dark.isActive
                        ? 'text-white'
                        : 'text-dark'
                  "
                >
                  {{ editForm.early_departure_minutes || 0 }}
                  <span
                    v-if="editForm.early_departure_minutes > 0"
                    class="text-caption text-deep-orange q-ml-xs"
                    >mins early</span
                  >
                </div>
              </div>
            </div>
            <div v-if="editForm.no_shift" class="text-caption text-orange q-mt-sm">
              <q-icon name="warning" size="14px" class="q-mr-xs" />No shift assigned for this date
            </div>
            <div v-if="calculating" class="text-caption text-grey-5 q-mt-xs">
              <q-spinner size="10px" class="q-mr-xs" />Calculating...
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey-6" no-caps />
          <q-btn
            color="primary"
            label="Update Attendance"
            unelevated
            icon="save"
            @click="saveEdit"
            :loading="saving"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <!-- Mark Dialog -->
    <q-dialog v-model="showMark">
      <q-card
        style="min-width: 460px; padding: 0"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
      >
        <q-card-section
          class="row items-center q-pa-md"
          :style="{
            borderBottom: $q.dark.isActive
              ? '1px solid rgba(255,255,255,0.07)'
              : '1px solid rgba(0,0,0,0.1)',
          }"
        >
          <q-icon name="fingerprint" size="20px" color="amber-8" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Mark Attendance</div>
          <q-space />
          <q-btn
            flat
            round
            dense
            icon="close"
            v-close-popup
            :color="$q.dark.isActive ? 'grey-4' : 'grey-8'"
          />
        </q-card-section>
        <q-card-section class="q-gutter-md q-pa-lg">
          <!-- Employee -->
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Select Employee *
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="markForm.employee_id"
              :options="employees"
              option-label="full_name"
              option-value="id"
              emit-value
              map-options
            >
              <template v-slot:option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                    <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </div>

          <!-- Date -->
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Date *
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="markForm.attendance_date"
              type="date"
            />
          </div>

          <!-- Times -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                Check In *
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="markForm.clock_in"
                mask="time"
                @blur="triggerMarkCalc"
              >
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time
                        :dark="$q.dark.isActive"
                        v-model="markForm.clock_in"
                        format24h
                        @update:model-value="triggerMarkCalc"
                      >
                        <div class="row items-center justify-end">
                          <q-btn v-close-popup label="Done" color="primary" flat />
                        </div>
                      </q-time>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-6">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                Check Out
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="markForm.clock_out"
                mask="time"
                @blur="triggerMarkCalc"
              >
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time
                        :dark="$q.dark.isActive"
                        v-model="markForm.clock_out"
                        format24h
                        @update:model-value="triggerMarkCalc"
                      >
                        <div class="row items-center justify-end">
                          <q-btn v-close-popup label="Done" color="primary" flat />
                        </div>
                      </q-time>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
          </div>

          <!-- Status -->
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Status *
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="markForm.status"
              :options="statusOptions"
            />
          </div>

          <!-- Auto-calculated results panel -->
          <div
            :class="['rounded-borders q-pa-md', $q.dark.isActive ? 'bg-grey-9' : 'bg-blue-grey-1']"
          >
            <div class="row items-center q-mb-sm">
              <q-icon name="auto_fix_high" size="14px" color="primary" class="q-mr-xs" />
              <span
                class="text-caption text-weight-medium"
                :class="$q.dark.isActive ? 'text-blue-3' : 'text-primary'"
                >Auto-Calculated from Check In / Out</span
              >
              <q-space />
              <q-btn
                flat
                dense
                no-caps
                size="xs"
                icon="refresh"
                label="Recalculate"
                color="primary"
                @click="triggerMarkCalc"
              />
            </div>
            <div class="row q-gutter-md">
              <div>
                <div class="text-caption text-grey-6">Late Minutes</div>
                <div
                  class="text-h5 text-weight-bold q-mt-xs"
                  :class="markForm.late_minutes > 0 ? 'text-red' : 'text-green'"
                >
                  {{ markForm.late_minutes || 0 }}
                  <span class="text-caption q-ml-xs">
                    {{ markForm.late_minutes > 0 ? 'mins late' : 'on time' }}
                  </span>
                </div>
              </div>
              <q-separator vertical />
              <div>
                <div class="text-caption text-grey-6">Overtime Hours</div>
                <div
                  class="text-h5 text-weight-bold q-mt-xs"
                  :class="
                    markForm.overtime_hours > 0
                      ? 'text-green'
                      : $q.dark.isActive
                        ? 'text-grey-4'
                        : 'text-grey-7'
                  "
                >
                  {{ markForm.overtime_hours || 0 }}
                  <span class="text-caption q-ml-xs">
                    {{ markForm.overtime_hours > 0 ? 'hrs OT' : 'no OT' }}
                  </span>
                </div>
              </div>
              <q-separator vertical />
              <div>
                <div class="text-caption text-grey-6">Early Departure</div>
                <div
                  class="text-h5 text-weight-bold q-mt-xs"
                  :class="
                    markForm.early_departure_minutes > 0
                      ? 'text-deep-orange'
                      : $q.dark.isActive
                        ? 'text-grey-4'
                        : 'text-grey-7'
                  "
                >
                  {{ markForm.early_departure_minutes || 0 }}
                  <span class="text-caption q-ml-xs">
                    {{ markForm.early_departure_minutes > 0 ? 'mins early' : 'none' }}
                  </span>
                </div>
              </div>
            </div>
            <div v-if="markForm.no_shift" class="text-caption text-orange q-mt-sm">
              <q-icon name="warning" size="14px" class="q-mr-xs" />No shift assigned for this date
            </div>
            <div v-if="calculating" class="text-caption text-grey-5 q-mt-sm">
              <q-spinner size="10px" class="q-mr-xs" />Calculating metrics...
            </div>
            <div v-if="!markForm.clock_in" class="text-caption text-grey-5 q-mt-xs">
              Enter check-in time to auto-calculate
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey-6" no-caps />
          <q-btn
            color="amber-8"
            text-color="dark"
            label="Save Record"
            unelevated
            icon="save"
            @click="saveMarkAttendance"
            :loading="saving"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Bulk / Month-End Builder Dialog -->
    <q-dialog v-model="showBulk" persistent>
      <q-card
        style="min-width: 720px; max-width: 96vw; padding: 0"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
      >
        <q-card-section
          class="row items-center q-pa-md"
          :style="{
            borderBottom: $q.dark.isActive
              ? '1px solid rgba(255,255,255,0.07)'
              : '1px solid rgba(0,0,0,0.1)',
          }"
        >
          <q-icon name="fact_check" size="20px" color="indigo" class="q-mr-sm" />
          <div>
            <div class="text-subtitle1 text-weight-bold">Month-End Attendance Builder</div>
            <div class="text-caption text-grey-6">
              Pre-payroll finalization — build or correct attendance for a date range before running
              payroll
            </div>
          </div>
          <q-space />
          <q-btn
            flat
            round
            dense
            icon="close"
            v-close-popup
            :color="$q.dark.isActive ? 'grey-4' : 'grey-8'"
          />
        </q-card-section>

        <q-card-section class="q-pa-lg">
          <div class="row q-col-gutter-sm items-end">
            <div class="col-6 col-sm-3">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                Start Date *
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="bulkForm.start_date"
                type="date"
              />
            </div>
            <div class="col-6 col-sm-3">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                End Date *
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="bulkForm.end_date"
                type="date"
              />
            </div>
            <div class="col-12 col-sm-4">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                Department
              </div>
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="bulkForm.department_id"
                :options="departments"
                option-label="name"
                option-value="id"
                emit-value
                map-options
                clearable
              />
            </div>
            <div class="col-12 col-sm-2">
              <q-btn
                color="indigo"
                icon="grid_on"
                label="Build"
                @click="buildBulkGrid"
                :loading="bulkBuilding"
                no-caps
                unelevated
                class="full-width"
                style="height: 40px"
              />
            </div>
          </div>

          <div class="row items-center q-mt-sm">
            <q-checkbox
              v-model="bulkForm.autoFill"
              label="Auto-fill assigned days as Present (using shift times)"
              :dark="$q.dark.isActive"
              dense
            />
            <q-space />
            <div v-if="bulkRows.length" class="text-caption text-grey-6">
              {{ bulkRows.length }} employee-days · {{ bulkSaveCount }} to save
            </div>
          </div>

          <q-banner
            v-if="bulkRows.length"
            dense
            class="q-mt-sm rounded-borders"
            :class="$q.dark.isActive ? 'bg-indigo-10 text-indigo-2' : 'bg-indigo-1 text-indigo-9'"
          >
            <template #avatar><q-icon name="info" color="indigo" /></template>
            Set a status per employee-day. Rows left as <b>skip</b> are not written. Saving upserts
            (re-running corrects existing rows); late/OT/early are recomputed server-side.
          </q-banner>

          <q-table
            v-if="bulkRows.length"
            :dark="$q.dark.isActive"
            flat
            bordered
            dense
            class="q-mt-sm"
            :rows="bulkRows"
            :columns="bulkColumns"
            row-key="key"
            :pagination="{ rowsPerPage: 0 }"
            hide-bottom
            style="max-height: 46vh"
            virtual-scroll
          >
            <template #body-cell-shift="props">
              <q-td :props="props">
                <q-icon
                  :name="props.row.has_shift ? 'event_available' : 'event_busy'"
                  :color="props.row.has_shift ? 'green' : 'grey'"
                  size="18px"
                >
                  <q-tooltip>{{
                    props.row.has_shift ? 'Shift assigned' : 'No shift assigned'
                  }}</q-tooltip>
                </q-icon>
              </q-td>
            </template>
            <template #body-cell-status="props">
              <q-td :props="props">
                <q-select
                  :dark="$q.dark.isActive"
                  dense
                  outlined
                  v-model="props.row.status"
                  :options="bulkStatusOptions"
                  style="min-width: 120px"
                />
              </q-td>
            </template>
            <template #body-cell-clock_in="props">
              <q-td :props="props">
                <q-input
                  :dark="$q.dark.isActive"
                  dense
                  outlined
                  v-model="props.row.clock_in"
                  mask="time"
                  style="width: 90px"
                  :disable="props.row.status === 'skip'"
                />
              </q-td>
            </template>
            <template #body-cell-clock_out="props">
              <q-td :props="props">
                <q-input
                  :dark="$q.dark.isActive"
                  dense
                  outlined
                  v-model="props.row.clock_out"
                  mask="time"
                  style="width: 90px"
                  :disable="props.row.status === 'skip'"
                />
              </q-td>
            </template>
          </q-table>

          <div v-else class="text-center text-grey-6 q-pa-lg">
            <q-icon name="calendar_month" size="42px" class="q-mb-sm" />
            <div>Pick a date range + department, then <b>Build</b> the grid.</div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" v-close-popup color="grey-6" no-caps />
          <q-btn
            color="indigo"
            :label="`Save ${bulkSaveCount} Record${bulkSaveCount === 1 ? '' : 's'}`"
            unelevated
            icon="save"
            @click="saveBulk"
            :loading="bulkSaving"
            :disable="bulkSaveCount === 0"
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { usePermission } from 'src/core/rbac/usePermission'
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as xlsx from 'xlsx'

const $q = useQuasar()
const authStore = useAuthStore()
const { can } = usePermission()
// Admin/HR/manager can build & finalize attendance before payroll.
// Uses the wildcard-aware RBAC check (hr/manager hold 'hr.attendance.*').
const canManageAttendance = computed(() => can('hr.attendance.manage'))
const loading = ref(false)
const saving = ref(false)
const markingAbsentees = ref(false)
const records = ref([])
const search = ref('')
const filterDate = ref(new Date().toISOString().split('T')[0])
const filterDepartment = ref(null)
const filterEmployee = ref(null)

const departments = ref([])

// Employees list for marking attendance
const employees = ref([])
const filteredEmployeesList = computed(() => {
  if (!filterDepartment.value) return employees.value
  return employees.value.filter((e) => e.department_id === filterDepartment.value)
})

// Edit Dialog
const showEdit = ref(false)
const editForm = reactive({
  id: null,
  employee_id: null,
  clock_in: '',
  clock_out: '',
  date: '',
  status: 'present',
  late_minutes: 0,
  overtime_hours: 0,
  early_departure_minutes: 0,
  total_hours: 0,
  break_hours: 0,
  shift_id: null,
  scheduled_start: null,
  scheduled_end: null,
  no_shift: false,
})

// Mark Dialog
const showMark = ref(false)
const markForm = reactive({
  employee_id: null,
  attendance_date: '',
  clock_in: '',
  clock_out: '',
  status: 'present',
  late_minutes: 0,
  overtime_hours: 0,
  early_departure_minutes: 0,
  total_hours: 0,
  break_hours: 0,
  shift_id: null,
  scheduled_start: null,
  scheduled_end: null,
  no_shift: false,
})

const stats = reactive({ present: 0, absent: 0, late: 0, leave: 0, no_pay: 0 })

const columns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  { name: 'date', label: 'Date', align: 'left', field: 'attendance_date', sortable: true },
  {
    name: 'checkin',
    label: 'Check In',
    align: 'center',
    field: 'clock_in',
    format: (v) => formatDisplayTime(v),
  },
  {
    name: 'checkout',
    label: 'Check Out',
    align: 'center',
    field: 'clock_out',
    format: (v) => formatDisplayTime(v),
  },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'late', label: 'Late Mins', align: 'center', field: 'late_minutes' },
  {
    name: 'early',
    label: 'Early Dep (Mins)',
    align: 'center',
    field: 'early_departure_minutes',
    format: (v) => v || 0,
  },
  { name: 'ot', label: 'OT Hrs', align: 'center', field: 'overtime_hours' },
  { name: 'actions', label: '', align: 'center' },
]

function attColor(s) {
  return (
    {
      present: 'green',
      absent: 'red',
      late: 'amber-8',
      half_day: 'orange',
      on_leave: 'cyan',
      no_pay: 'deep-orange',
    }[s] || 'grey'
  )
}

// Status options shared by the edit + mark selects
const statusOptions = ['present', 'absent', 'late', 'half_day', 'on_leave', 'no_pay']

async function loadAttendance() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id

    let query = supabase
      .from('attendance_records')
      .select('*, employees!inner(full_name, employee_code, department_id)')
      .eq('branch_id', branchId)

    if (filterDate.value) {
      query = query.eq('attendance_date', filterDate.value)
    }
    if (filterDepartment.value) {
      query = query.eq('employees.department_id', filterDepartment.value)
    }
    if (filterEmployee.value) {
      query = query.eq('employee_id', filterEmployee.value)
    }

    const { data, error } = await query.order('clock_in', { ascending: true })
    if (error) throw error

    records.value = data || []
    stats.present = records.value.filter((r) => r.status === 'present').length
    stats.absent = records.value.filter((r) => r.status === 'absent').length
    stats.late = records.value.filter((r) => r.status === 'late').length
    stats.leave = records.value.filter((r) => r.status === 'on_leave').length
    stats.no_pay = records.value.filter((r) => r.status === 'no_pay').length
  } catch (err) {
    console.error('Failed to load attendance:', err.message)
    $q.notify({ type: 'negative', message: 'Failed to load attendance records' })
  } finally {
    loading.value = false
  }
}

// Create no-pay rows for employees scheduled on the filtered date who never
// clocked in. Server-side (fn_mark_absentees) so leave/holiday are respected.
function markAbsentees() {
  const branchId = authStore.currentBranch?.id
  if (!filterDate.value) {
    $q.notify({ type: 'warning', message: 'Select a date first' })
    return
  }
  if (!branchId) {
    $q.notify({ type: 'warning', message: 'No branch selected' })
    return
  }
  $q.dialog({
    title: 'Mark Absentees',
    message: `Create no-pay attendance records for all staff scheduled on ${filterDate.value} who have no attendance and are not on approved leave/holiday?`,
    cancel: true,
    persistent: true,
    ok: { label: 'Mark Absentees', color: 'deep-orange', unelevated: true, noCaps: true },
  }).onOk(async () => {
    markingAbsentees.value = true
    try {
      const { data, error } = await supabase.rpc('fn_mark_absentees', {
        p_date: filterDate.value,
        p_branch_id: branchId,
      })
      if (error) throw error
      const count = typeof data === 'number' ? data : data?.count || 0
      $q.notify({
        type: count > 0 ? 'positive' : 'info',
        message:
          count > 0
            ? `Marked ${count} employee${count === 1 ? '' : 's'} as no-pay`
            : 'No absentees to mark',
      })
      loadAttendance()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    } finally {
      markingAbsentees.value = false
    }
  })
}

// ── Display helpers ──────────────────────────────────────────────────────────
// Parse time directly from the stored "YYYY-MM-DDTHH:MM:SS" string to avoid
// UTC timezone shift that new Date() would apply to naive local timestamps.
function formatDisplayTime(v) {
  if (!v) return '—'
  // Extract HH:MM from stored value: "2026-03-28T07:30:00" → "07:30"
  const timePart = v.includes('T') ? v.split('T')[1].slice(0, 5) : v.slice(0, 5)
  const [hStr, mStr] = timePart.split(':')
  const h = parseInt(hStr, 10)
  const m = mStr
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${ampm}`
}

function formatTimeToTimestamp(dateStr, timeStr) {
  if (!timeStr) return null
  // Ensure HH:MM:SS format
  const parts = timeStr.split(':')
  const hh = parts[0].padStart(2, '0')
  const mm = (parts[1] || '00').padStart(2, '0')
  return `${dateStr}T${hh}:${mm}:00`
}

function extractTime(timestampOrTime) {
  if (!timestampOrTime) return ''
  // Handle both "2026-03-28T07:30:00" and "07:30" formats
  if (timestampOrTime.includes('T')) {
    return timestampOrTime.split('T')[1].slice(0, 5)
  }
  return timestampOrTime.slice(0, 5)
}

// Metrics are computed server-side (single source of truth). We resolve the
// employee's assigned shift for the date, then ask the DB RPC to calculate
// late/OT/early-departure/hours — the BEFORE trigger recomputes on save anyway,
// so this is only a thin, authoritative preview.
async function calculateMetricsForForm(formRef, inTime, outTime, empId, attDate) {
  if (!empId || !attDate || !inTime) return
  calculating.value = true
  try {
    // Resolve the shift assigned to this employee on this date.
    const { data: shiftAssign } = await supabase
      .from('shift_assignments')
      .select('shift_id')
      .eq('employee_id', empId)
      .eq('assignment_date', attDate)
      .maybeSingle()

    const shiftId = shiftAssign?.shift_id || null
    formRef.shift_id = shiftId
    formRef.no_shift = !shiftId

    const clockInTs = formatTimeToTimestamp(attDate, inTime)
    const clockOutTs = outTime ? formatTimeToTimestamp(attDate, outTime) : null

    const { data, error } = await supabase.rpc('fn_calc_attendance_metrics', {
      p_shift_id: shiftId,
      p_clock_in: clockInTs,
      p_clock_out: clockOutTs,
      p_date: attDate,
    })
    if (error) throw error

    // fn_calc_attendance_metrics RETURNS TABLE → PostgREST returns an array.
    const m = (Array.isArray(data) ? data[0] : data) || {}
    formRef.late_minutes = m.late_minutes || 0
    formRef.overtime_hours = m.overtime_hours || 0
    formRef.early_departure_minutes = m.early_departure_minutes || 0
    formRef.total_hours = m.total_hours || 0
    formRef.break_hours = m.break_hours || 0
    formRef.scheduled_start = m.scheduled_start || null
    formRef.scheduled_end = m.scheduled_end || null

    // Reflect the server's derived status (computed_status) as a preview, but
    // never override an explicit manual selection (absent / leave / half-day / no-pay).
    const manualStatuses = ['absent', 'on_leave', 'half_day', 'no_pay']
    if (m.computed_status && !manualStatuses.includes(formRef.status)) {
      formRef.status = m.computed_status
    }
  } catch (err) {
    console.error('Failed calculating metrics:', err)
  } finally {
    calculating.value = false
  }
}

// ── Calc state ──────────────────────────────────────────────────────────────
const calculating = ref(false)

// Check if a time string is a complete HH:MM (5 chars, no placeholder _)
function isCompleteTime(t) {
  return t && t.length === 5 && !t.includes('_') && /^\d{2}:\d{2}$/.test(t)
}

// Resolve the assigned shift for an employee+date and flag when none exists,
// so the UI can warn instead of silently assuming a 09:00 default.
async function resolveShiftForForm(formRef, empId, attDate) {
  if (!empId || !attDate) {
    formRef.shift_id = null
    formRef.no_shift = false
    return
  }
  const { data } = await supabase
    .from('shift_assignments')
    .select('shift_id')
    .eq('employee_id', empId)
    .eq('assignment_date', attDate)
    .maybeSingle()
  formRef.shift_id = data?.shift_id || null
  formRef.no_shift = !data?.shift_id
}

// Trigger calculation for the Mark dialog — only when time is complete
function triggerMarkCalc() {
  const { clock_in, clock_out, employee_id, attendance_date } = markForm
  if (isCompleteTime(clock_in) && employee_id && attendance_date) {
    calculateMetricsForForm(
      markForm,
      clock_in,
      isCompleteTime(clock_out) ? clock_out : null,
      employee_id,
      attendance_date,
    )
  }
}

// Trigger calculation for the Edit dialog — only when time is complete
function triggerEditCalc() {
  const { clock_in, clock_out } = editForm
  if (isCompleteTime(clock_in) && editForm.employee_id && editForm.date) {
    calculateMetricsForForm(
      editForm,
      clock_in,
      isCompleteTime(clock_out) ? clock_out : null,
      editForm.employee_id,
      editForm.date,
    )
  }
}

// Auto-trigger when employee or date changes in the Mark form: resolve the
// shift (for the no-shift hint) and recalc metrics if a time is already set.
watch([() => markForm.employee_id, () => markForm.attendance_date], () => {
  resolveShiftForForm(markForm, markForm.employee_id, markForm.attendance_date)
  triggerMarkCalc()
})

function editRecord(row) {
  editForm.id = row.id
  editForm.employee_id = row.employee_id
  editForm.date = row.attendance_date
  editForm.clock_in = extractTime(row.clock_in)
  editForm.clock_out = extractTime(row.clock_out)
  editForm.status = row.status
  editForm.late_minutes = row.late_minutes || 0
  editForm.overtime_hours = row.overtime_hours || 0
  editForm.early_departure_minutes = row.early_departure_minutes || 0
  editForm.total_hours = row.total_hours || 0
  editForm.break_hours = row.break_hours || 0
  editForm.shift_id = row.shift_id || null
  editForm.scheduled_start = row.scheduled_start || null
  editForm.scheduled_end = row.scheduled_end || null
  editForm.no_shift = false
  showEdit.value = true
}

async function saveEdit() {
  saving.value = true
  try {
    // Stored metrics are recomputed by the BEFORE trigger from shift_id + clocks.
    // We still send our preview values + shift_id so the trigger has the shift.
    const payload = {
      status: editForm.status,
      late_minutes: editForm.late_minutes,
      overtime_hours: editForm.overtime_hours,
      early_departure_minutes: editForm.early_departure_minutes,
      shift_id: editForm.shift_id,
    }
    if (editForm.scheduled_start) payload.scheduled_start = editForm.scheduled_start
    if (editForm.scheduled_end) payload.scheduled_end = editForm.scheduled_end
    if (editForm.clock_in)
      payload.clock_in = formatTimeToTimestamp(editForm.date, editForm.clock_in)
    if (editForm.clock_out)
      payload.clock_out = formatTimeToTimestamp(editForm.date, editForm.clock_out)

    const { error } = await supabase
      .from('attendance_records')
      .update(payload)
      .eq('id', editForm.id)
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Attendance updated' })
    showEdit.value = false
    loadAttendance()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

async function loadEmployees() {
  const companyId = authStore.currentBranch?.company_id
  if (!companyId) return
  try {
    const { data } = await supabase
      .from('employees')
      .select('id, full_name, employee_code, department_id')
      .eq('company_id', companyId)
      .order('full_name')
    employees.value = data || []
  } catch (e) {
    console.error('Failed to load employees', e)
  }
}

function openMarkAttendance() {
  Object.assign(markForm, {
    employee_id: null,
    attendance_date: filterDate.value,
    clock_in: '',
    clock_out: '',
    status: 'present',
    late_minutes: 0,
    overtime_hours: 0,
    early_departure_minutes: 0,
    total_hours: 0,
    break_hours: 0,
    shift_id: null,
    scheduled_start: null,
    scheduled_end: null,
    no_shift: false,
  })
  showMark.value = true
}

async function saveMarkAttendance() {
  if (!markForm.employee_id) {
    $q.notify({ type: 'warning', message: 'Please select an employee' })
    return
  }
  if (!markForm.attendance_date) {
    $q.notify({ type: 'warning', message: 'Date is required' })
    return
  }
  saving.value = true
  try {
    const payload = {
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      employee_id: markForm.employee_id,
      attendance_date: markForm.attendance_date,
      clock_in: formatTimeToTimestamp(markForm.attendance_date, markForm.clock_in),
      clock_out: formatTimeToTimestamp(markForm.attendance_date, markForm.clock_out),
      status: markForm.status,
      late_minutes: markForm.late_minutes || 0,
      overtime_hours: markForm.overtime_hours || 0,
      early_departure_minutes: markForm.early_departure_minutes || 0,
      shift_id: markForm.shift_id,
    }
    // Populate the schedule window from the resolved shift so the trigger and
    // reports have it (values are re-derived server-side on insert anyway).
    if (markForm.scheduled_start) payload.scheduled_start = markForm.scheduled_start
    if (markForm.scheduled_end) payload.scheduled_end = markForm.scheduled_end

    const { error } = await supabase.from('attendance_records').insert(payload)
    if (error) throw error

    $q.notify({ type: 'positive', message: 'Attendance successfully marked!' })
    showMark.value = false

    // Automatically load data if they marked attendance for the currently viewed date
    if (markForm.attendance_date === filterDate.value) {
      loadAttendance()
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

// ── Bulk / Month-End Builder ─────────────────────────────────────────────────
const showBulk = ref(false)
const bulkBuilding = ref(false)
const bulkSaving = ref(false)
const bulkRows = ref([])
const bulkForm = reactive({
  start_date: '',
  end_date: '',
  department_id: null,
  autoFill: true,
})
// 'skip' is a grid-only sentinel meaning "do not write this employee-day".
const bulkStatusOptions = ['skip', ...statusOptions]
const bulkColumns = [
  { name: 'employee', label: 'Employee', align: 'left', field: 'employee_name' },
  { name: 'date', label: 'Date', align: 'left', field: 'attendance_date' },
  { name: 'shift', label: 'Shift', align: 'center', field: 'has_shift' },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'clock_in', label: 'In', align: 'center', field: 'clock_in' },
  { name: 'clock_out', label: 'Out', align: 'center', field: 'clock_out' },
]

const bulkSaveCount = computed(() => bulkRows.value.filter((r) => r.status !== 'skip').length)

function enumerateDates(start, end) {
  const dates = []
  const d = new Date(`${start}T00:00:00`)
  const last = new Date(`${end}T00:00:00`)
  while (d <= last) {
    dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function openBulkBuilder() {
  bulkForm.start_date = filterDate.value
  bulkForm.end_date = filterDate.value
  bulkForm.department_id = filterDepartment.value
  bulkForm.autoFill = true
  bulkRows.value = []
  showBulk.value = true
}

async function buildBulkGrid() {
  if (!bulkForm.start_date || !bulkForm.end_date) {
    $q.notify({ type: 'warning', message: 'Pick a start and end date' })
    return
  }
  if (bulkForm.end_date < bulkForm.start_date) {
    $q.notify({ type: 'warning', message: 'End date must be on or after start date' })
    return
  }
  const dates = enumerateDates(bulkForm.start_date, bulkForm.end_date)
  const emps = bulkForm.department_id
    ? employees.value.filter((e) => e.department_id === bulkForm.department_id)
    : employees.value
  if (!emps.length) {
    $q.notify({ type: 'warning', message: 'No employees for this filter' })
    return
  }
  if (emps.length * dates.length > 1500) {
    $q.notify({
      type: 'warning',
      message: 'Range too large — narrow the date range or department (max 1500 rows)',
    })
    return
  }

  bulkBuilding.value = true
  try {
    const empIds = emps.map((e) => e.id)

    // Assignments in range → shift map keyed by employee|date
    const { data: assigns } = await supabase
      .from('shift_assignments')
      .select('employee_id, assignment_date, shift_id, shifts(start_time, end_time)')
      .in('employee_id', empIds)
      .gte('assignment_date', bulkForm.start_date)
      .lte('assignment_date', bulkForm.end_date)
      .neq('status', 'cancelled')
    const assignMap = {}
    for (const a of assigns || []) assignMap[`${a.employee_id}|${a.assignment_date}`] = a

    // Existing attendance in range → prefill so re-runs correct, not duplicate
    const { data: existing } = await supabase
      .from('attendance_records')
      .select('id, employee_id, attendance_date, status, clock_in, clock_out, shift_id')
      .eq('branch_id', authStore.currentBranch?.id)
      .in('employee_id', empIds)
      .gte('attendance_date', bulkForm.start_date)
      .lte('attendance_date', bulkForm.end_date)
    const existMap = {}
    for (const r of existing || []) existMap[`${r.employee_id}|${r.attendance_date}`] = r

    const rows = []
    for (const emp of emps) {
      for (const date of dates) {
        const key = `${emp.id}|${date}`
        const a = assignMap[key]
        const ex = existMap[key]
        const hasShift = !!a
        let status
        if (ex) status = ex.status
        else if (hasShift) status = 'present'
        else status = 'skip'
        rows.push({
          key,
          employee_id: emp.id,
          employee_name: emp.full_name,
          employee_code: emp.employee_code,
          attendance_date: date,
          has_shift: hasShift,
          shift_id: a?.shift_id || ex?.shift_id || null,
          existing_id: ex?.id || null,
          status,
          clock_in: ex
            ? extractTime(ex.clock_in)
            : bulkForm.autoFill && a?.shifts?.start_time
              ? a.shifts.start_time.slice(0, 5)
              : '',
          clock_out: ex
            ? extractTime(ex.clock_out)
            : bulkForm.autoFill && a?.shifts?.end_time
              ? a.shifts.end_time.slice(0, 5)
              : '',
        })
      }
    }
    bulkRows.value = rows
    if (!rows.some((r) => r.status !== 'skip')) {
      $q.notify({ type: 'info', message: 'No shift assignments in range — set statuses manually' })
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    bulkBuilding.value = false
  }
}

async function saveBulk() {
  const toSave = bulkRows.value.filter((r) => r.status !== 'skip')
  if (!toSave.length) {
    $q.notify({ type: 'warning', message: 'Nothing to save — all rows are set to skip' })
    return
  }
  bulkSaving.value = true
  try {
    const companyId = authStore.currentBranch?.company_id
    const branchId = authStore.currentBranch?.id
    // Trigger recomputes late/OT/early + scheduled_* from shift_id + clocks.
    const payloads = toSave.map((r) => ({
      company_id: companyId,
      branch_id: branchId,
      employee_id: r.employee_id,
      attendance_date: r.attendance_date,
      status: r.status,
      shift_id: r.shift_id,
      clock_in: r.clock_in ? formatTimeToTimestamp(r.attendance_date, r.clock_in) : null,
      clock_out: r.clock_out ? formatTimeToTimestamp(r.attendance_date, r.clock_out) : null,
    }))

    const { error } = await supabase
      .from('attendance_records')
      .upsert(payloads, { onConflict: 'employee_id,attendance_date' })
    if (error) throw error

    $q.notify({
      type: 'positive',
      message: `Saved ${payloads.length} attendance record${payloads.length === 1 ? '' : 's'}`,
    })
    showBulk.value = false
    loadAttendance()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    bulkSaving.value = false
  }
}

async function loadDepartments() {
  const companyId = authStore.currentBranch?.company_id
  if (!companyId) return
  try {
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name')
    departments.value = data || []
  } catch (e) {
    console.error('Failed to load departments', e)
  }
}

const filteredRecords = computed(() => {
  let result = records.value
  const term = search.value?.toLowerCase()
  if (term) {
    result = result.filter(
      (r) =>
        r.employees?.full_name?.toLowerCase().includes(term) ||
        r.employees?.employee_code?.toLowerCase().includes(term) ||
        r.status?.toLowerCase().includes(term),
    )
  }
  return result
})

function exportPDF() {
  if (!filteredRecords.value || filteredRecords.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Attendance Report', 14, 15)

  doc.setFontSize(10)
  doc.setTextColor(100)
  let filterText = `Date: ${filterDate.value || 'All'}`
  if (filterDepartment.value) {
    const dept = departments.value.find((d) => d.id === filterDepartment.value)?.name || ''
    filterText += ` | Department: ${dept}`
  }
  if (search.value) filterText += ` | Search: ${search.value}`

  doc.text(filterText, 14, 22)
  doc.text(`Total Records: ${filteredRecords.value.length}`, 14, 27)

  const head = [
    [
      '#',
      'Employee Code',
      'Employee Name',
      'Date',
      'Check In',
      'Check Out',
      'Status',
      'Late (Mins)',
      'Early Dep (Mins)',
      'OT (Hrs)',
    ],
  ]
  const body = filteredRecords.value.map((r, i) => [
    i + 1,
    r.employees?.employee_code || '—',
    r.employees?.full_name || '—',
    r.attendance_date || '—',
    formatDisplayTime(r.clock_in),
    formatDisplayTime(r.clock_out),
    r.status || '—',
    r.late_minutes || 0,
    r.early_departure_minutes || 0,
    r.overtime_hours || 0,
  ])

  autoTable(doc, {
    startY: 32,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [33, 150, 243] },
    styles: { fontSize: 8 },
  })

  doc.save('attendance_report.pdf')
}

function exportExcel() {
  if (!filteredRecords.value || filteredRecords.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const exportData = filteredRecords.value.map((r, i) => ({
    '#': i + 1,
    'Employee Code': r.employees?.employee_code || '',
    'Employee Name': r.employees?.full_name || '',
    Date: r.attendance_date || '',
    'Check In': formatDisplayTime(r.clock_in),
    'Check Out': formatDisplayTime(r.clock_out),
    Status: r.status || '',
    'Late (Mins)': r.late_minutes || 0,
    'Early Dep (Mins)': r.early_departure_minutes || 0,
    'OT (Hrs)': r.overtime_hours || 0,
  }))

  const ws = xlsx.utils.json_to_sheet(exportData)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Attendance')
  xlsx.writeFile(wb, 'attendance_report.xlsx')
}

onMounted(() => {
  loadDepartments()
  loadEmployees()
  loadAttendance()
})
</script>

<style scoped>
/* Scoped styles removed in favor of dynamic Vue theme bindings */
</style>
