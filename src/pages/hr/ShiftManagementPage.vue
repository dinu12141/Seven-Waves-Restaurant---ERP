<template>
  <q-page class="q-pa-md">
    <!-- Sub-tabs: Shift Types vs Assignments -->
    <div class="row q-mb-md q-gutter-sm items-center">
      <q-btn-toggle
        v-model="viewMode"
        toggle-color="primary"
        :text-color="$q.dark.isActive ? 'grey-3' : 'grey-7'"
        no-caps
        dense
        size="sm"
        class="shift-toggle"
        :class="$q.dark.isActive ? 'bg-grey-9 border-grey-8' : ''"
        :options="[
          { label: 'Shift Definitions', value: 'definitions', icon: 'schedule' },
          { label: 'Employee Assignments', value: 'assignments', icon: 'calendar_month' },
        ]"
      />
      <q-space />
      <q-btn
        v-if="viewMode === 'definitions'"
        color="primary"
        icon="add"
        label="New Shift"
        no-caps
        dense
        size="sm"
        unelevated
        @click="openShiftDialog()"
      />
      <div class="row q-gutter-x-sm">
        <q-btn
          v-if="viewMode === 'assignments'"
          color="positive"
          icon="download"
          label="Excel"
          no-caps
          dense
          size="sm"
          unelevated
          @click="exportExcel"
        />
        <q-btn
          v-if="viewMode === 'assignments'"
          color="red-6"
          icon="picture_as_pdf"
          label="PDF"
          no-caps
          dense
          size="sm"
          unelevated
          @click="exportPDF"
        />
        <q-btn
          v-if="viewMode === 'assignments'"
          color="secondary"
          icon="upload_file"
          label="Upload Roster"
          no-caps
          dense
          size="sm"
          unelevated
          @click="openUploadDialog()"
        />
        <q-btn
          v-if="viewMode === 'assignments'"
          color="primary"
          icon="person_add"
          label="Assign Shift"
          no-caps
          dense
          size="sm"
          unelevated
          @click="openAssignDialog()"
        />
      </div>
    </div>

    <!-- ─── SHIFT DEFINITIONS VIEW ─── -->
    <div v-if="viewMode === 'definitions'">
      <div class="row q-col-gutter-sm">
        <div v-for="shift in shifts" :key="shift.id" class="col-12 col-sm-6 col-md-4 col-lg-3">
          <q-card
            flat
            class="shift-card"
            :class="$q.dark.isActive ? 'bg-grey-9' : 'bg-white'"
            bordered
            :style="$q.dark.isActive ? 'border-color: #424242' : 'border-color: #e0e0e0'"
          >
            <!-- Color bar based on shift type -->
            <div :class="`shift-bar shift-${getShiftType(shift)}`"></div>
            <q-card-section class="q-py-sm q-px-md">
              <div class="row items-center no-wrap">
                <div class="col">
                  <div class="text-weight-bold shift-name">{{ shift.name }}</div>
                  <div class="text-caption shift-type-label" style="font-size: 10px">
                    {{ getShiftType(shift).toUpperCase() }} SHIFT
                  </div>
                </div>
                <q-badge
                  :color="shift.is_active ? 'positive' : 'grey-7'"
                  class="q-ml-sm"
                  style="font-size: 9px"
                >
                  {{ shift.is_active ? 'Active' : 'Inactive' }}
                </q-badge>
              </div>
            </q-card-section>

            <q-card-section class="q-pt-none q-pb-xs q-px-md">
              <div class="row q-col-gutter-xs">
                <div class="col-6">
                  <div class="shift-time-block">
                    <q-icon name="login" size="12px" class="text-green q-mr-xs" />
                    <span class="text-caption shift-time-label" style="font-size: 10px">Start</span>
                    <div class="text-weight-bold shift-time-value" style="font-size: 12px">
                      {{ formatTime(shift.start_time) }}
                    </div>
                  </div>
                </div>
                <div class="col-6">
                  <div class="shift-time-block">
                    <q-icon name="logout" size="12px" class="text-red q-mr-xs" />
                    <span class="text-caption shift-time-label" style="font-size: 10px">End</span>
                    <div class="text-weight-bold shift-time-value" style="font-size: 12px">
                      {{ formatTime(shift.end_time) }}
                      <q-badge
                        v-if="shift.is_overnight"
                        color="purple"
                        dense
                        class="q-ml-xs"
                        label="+1"
                        style="font-size: 9px"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div class="row q-mt-xs q-col-gutter-xs shift-meta-text" style="font-size: 10px">
                <div class="col-auto">
                  <q-icon name="coffee" size="10px" class="q-mr-xs" />
                  {{ shift.break_duration_minutes }}min break
                </div>
                <div class="col-auto">
                  <q-icon name="timer" size="10px" class="q-mr-xs" />
                  {{ calculateHours(shift) }}hrs
                </div>
              </div>
            </q-card-section>

            <q-separator />
            <q-card-actions class="q-px-sm q-py-xs">
              <q-btn
                flat
                dense
                no-caps
                color="amber"
                icon="edit"
                label="Edit"
                size="xs"
                @click="openShiftDialog(shift)"
              />
              <q-space />
              <q-btn
                flat
                dense
                no-caps
                :color="shift.is_active ? 'negative' : 'positive'"
                :icon="shift.is_active ? 'block' : 'check_circle'"
                :label="shift.is_active ? 'Deactivate' : 'Activate'"
                size="xs"
                @click="toggleShiftActive(shift)"
              />
            </q-card-actions>
          </q-card>
        </div>

        <div
          v-if="shifts.length === 0 && !loadingShifts"
          class="col-12 text-center q-pa-xl text-grey-6"
        >
          <q-icon name="schedule" size="48px" class="q-mb-md" />
          <div>No shifts defined yet. Click <strong>New Shift</strong> to create one.</div>
        </div>
        <div v-if="loadingShifts" class="col-12 text-center q-pa-xl">
          <q-spinner-dots color="primary" size="40px" />
        </div>
      </div>
    </div>

    <!-- ─── EMPLOYEE ASSIGNMENTS VIEW ─── -->
    <div v-if="viewMode === 'assignments'">
      <!-- Filters -->
      <div class="row q-mb-md q-gutter-x-sm q-gutter-y-md items-end">
        <!-- Date filters -->
        <div class="col-auto">
          <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
            From Date
          </div>
          <q-input
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="assignFilter.dateFrom"
            type="date"
            style="width: 155px"
          />
        </div>
        <div class="col-auto">
          <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
            To Date
          </div>
          <q-input
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="assignFilter.dateTo"
            type="date"
            style="width: 155px"
          />
        </div>
        <!-- Shift filter -->
        <div class="col-auto">
          <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
            Filter by Shift
          </div>
          <q-select
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="assignFilter.shiftId"
            :options="shiftOptions"
            option-label="name"
            option-value="id"
            emit-value
            map-options
            clearable
            style="width: 190px"
          >
            <template #prepend><q-icon name="schedule" size="18px" /></template>
          </q-select>
        </div>
        <!-- Employee filter -->
        <div class="col-auto">
          <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
            Filter by Employee
          </div>
          <q-select
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="assignFilter.employeeId"
            :options="employeeOptions"
            option-label="full_name"
            option-value="id"
            emit-value
            map-options
            clearable
            use-input
            input-debounce="0"
            @filter="filterEmps"
            style="min-width: 200px"
          >
            <template #prepend><q-icon name="person" size="18px" /></template>
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-avatar
                    :color="avatarColor(scope.opt.full_name)"
                    text-color="white"
                    size="28px"
                    style="font-size: 11px"
                  >
                    {{ initials(scope.opt.full_name) }}
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                  <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </div>
        <!-- Load button -->
        <div class="col-auto">
          <div class="row q-gutter-x-sm">
            <q-btn
              color="primary"
              icon="refresh"
              label="Load"
              no-caps
              unelevated
              style="height: 40px"
              @click="loadAssignments"
            />
            <!-- Clear filters -->
            <q-btn
              v-if="assignFilter.shiftId || assignFilter.employeeId"
              flat
              color="grey-5"
              icon="clear"
              label="Clear"
              no-caps
              style="height: 40px"
              @click="clearAssignFilters"
            />
          </div>
        </div>
        <q-space />
        <!-- Text search -->
        <div class="col-12 col-sm-3 col-md-2">
          <q-input
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="assignSearch"
            placeholder="Search Table..."
            clearable
          >
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
      </div>

      <!-- Weekly Calendar View -->
      <div class="weekly-grid q-mb-md">
        <div v-for="day in weekDays" :key="day.date" class="week-day-col">
          <div class="week-day-header" :class="{ today: day.isToday }">
            <div class="text-weight-bold">{{ day.label }}</div>
            <div class="text-caption">{{ day.date }}</div>
          </div>
          <div class="week-day-body">
            <div
              v-for="asgn in getAssignmentsForDay(day.date)"
              :key="asgn.id"
              class="asgn-chip"
              :class="`asgn-${asgn.status}`"
            >
              <div class="asgn-emp">{{ asgn.employees?.full_name?.split(' ')[0] }}</div>
              <div class="asgn-shift">{{ asgn.shifts?.name }}</div>
            </div>
            <div v-if="getAssignmentsForDay(day.date).length === 0" class="week-day-empty">—</div>
          </div>
        </div>
      </div>

      <!-- Table View -->
      <q-table
        flat
        bordered
        :rows="filteredAssignments"
        :columns="assignColumns"
        row-key="id"
        :loading="loadingAssignments"
        :filter="assignSearch"
        :pagination="{ rowsPerPage: 25 }"
        class="erp-data-grid"
      >
        <template #body-cell-employee="props">
          <q-td :props="props">
            <div class="row items-center no-wrap q-gutter-sm">
              <q-avatar
                size="30px"
                :color="avatarColor(props.row.employees?.full_name)"
                text-color="white"
                class="text-weight-bold"
                style="font-size: 13px"
              >
                {{ initials(props.row.employees?.full_name) }}
              </q-avatar>
              <div>
                <div class="text-weight-bold">{{ props.row.employees?.full_name }}</div>
                <div class="text-caption text-grey-5">{{ props.row.employees?.employee_code }}</div>
              </div>
            </div>
          </q-td>
        </template>
        <template #body-cell-shift="props">
          <q-td :props="props">
            <q-chip
              dense
              :color="getShiftColor(props.row.shifts?.name)"
              text-color="white"
              icon="schedule"
              >{{ props.row.shifts?.name }}</q-chip
            >
          </q-td>
        </template>
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="statusColor(props.row.status)"
              :label="props.row.status"
              class="text-capitalize"
            />
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props" class="q-gutter-xs">
            <q-btn
              flat
              round
              dense
              icon="edit"
              color="amber"
              size="sm"
              @click="editAssignment(props.row)"
            >
              <q-tooltip>Edit</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              icon="delete"
              color="negative"
              size="sm"
              @click="deleteAssignment(props.row)"
            >
              <q-tooltip>Delete</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- ─── SHIFT DEFINITION DIALOG ─── -->
    <q-dialog v-model="shiftDialog.open" persistent>
      <q-card style="min-width: 480px">
        <q-toolbar class="bg-primary">
          <q-toolbar-title>{{
            shiftDialog.isEdit ? 'Edit Shift' : 'Create New Shift'
          }}</q-toolbar-title>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-toolbar>
        <q-card-section class="q-gutter-md q-pa-lg">
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Shift Name *
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="shiftForm.name"
              placeholder="e.g. Morning Shift"
              :rules="[(v) => !!v || 'Required']"
            />
          </div>
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                Start Time *
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="shiftForm.start_time"
                mask="time"
                :rules="[(v) => !!v || 'Required']"
              >
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time :dark="$q.dark.isActive" v-model="shiftForm.start_time" format24h>
                        <div class="row items-center justify-end">
                          <q-btn v-close-popup label="Close" color="primary" flat />
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
                End Time *
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="shiftForm.end_time"
                mask="time"
                :rules="[(v) => !!v || 'Required']"
              >
                <template v-slot:append>
                  <q-icon name="access_time" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-time :dark="$q.dark.isActive" v-model="shiftForm.end_time" format24h>
                        <div class="row items-center justify-end">
                          <q-btn v-close-popup label="Close" color="primary" flat />
                        </div>
                      </q-time>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
          </div>
          <div class="row q-col-gutter-sm items-center">
            <div class="col-8">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                Break Duration (minutes)
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model.number="shiftForm.break_duration_minutes"
                type="number"
                min="0"
              />
            </div>
            <div class="col-4 q-pt-md">
              <q-toggle
                :dark="$q.dark.isActive"
                v-model="shiftForm.is_overnight"
                label="Overnight?"
                color="purple"
              />
            </div>
          </div>
          <!-- Removed Shift Type here to avoid schema 400 errors -->
          <q-toggle
            :dark="$q.dark.isActive"
            v-model="shiftForm.is_active"
            label="Active"
            color="positive"
          />

          <!-- Preview -->
          <q-card
            flat
            class="q-pa-md rounded-borders"
            :class="$q.dark.isActive ? 'bg-grey-9' : 'bg-grey-1'"
          >
            <div
              :class="['text-caption q-mb-md', $q.dark.isActive ? 'text-grey-4' : 'text-grey-7']"
            >
              SHIFT PREVIEW
            </div>
            <div class="row q-gutter-md text-center">
              <div class="col">
                <div :class="['text-caption', $q.dark.isActive ? 'text-grey-4' : 'text-grey-7']">
                  Duration
                </div>
                <div class="text-h6 text-weight-bold">{{ previewHours }} hrs</div>
              </div>
              <div class="col">
                <div :class="['text-caption', $q.dark.isActive ? 'text-grey-4' : 'text-grey-7']">
                  Effective Hours
                </div>
                <div class="text-h6 text-weight-bold">{{ previewEffective }} hrs</div>
              </div>
            </div>
          </q-card>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn
            :label="shiftDialog.isEdit ? 'Update Shift' : 'Create Shift'"
            color="primary"
            icon="save"
            @click="saveShift"
            :loading="saving"
            unelevated
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ─── ASSIGNMENT DIALOG ─── -->
    <q-dialog v-model="assignDialog.open" persistent>
      <q-card style="min-width: 560px; max-width: 640px">
        <q-toolbar class="bg-primary">
          <q-toolbar-title class="text-weight-bold">{{
            assignDialog.isEdit ? 'Edit Assignment' : 'Assign Shift to Employees'
          }}</q-toolbar-title>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-toolbar>
        <q-card-section class="q-gutter-md q-pa-lg">
          <!-- Multi Employee Select -->
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              {{ assignDialog.isEdit ? 'Employee *' : 'Employees * (select multiple)' }}
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="assignForm.employee_ids"
              :options="employeeOptions"
              option-label="full_name"
              option-value="id"
              emit-value
              map-options
              :multiple="!assignDialog.isEdit"
              use-chips
              use-input
              input-debounce="0"
              @filter="filterEmps"
              :rules="[
                (v) => (Array.isArray(v) ? v.length > 0 : !!v) || 'Select at least one employee',
              ]"
            >
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section avatar>
                    <q-avatar
                      :color="avatarColor(scope.opt.full_name)"
                      text-color="white"
                      size="32px"
                      style="font-size: 12px"
                    >
                      {{ initials(scope.opt.full_name) }}
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ scope.opt.full_name }}</q-item-label>
                    <q-item-label caption>{{ scope.opt.employee_code }}</q-item-label>
                  </q-item-section>
                </q-item>
              </template>
              <template #selected-item="scope">
                <q-chip
                  dense
                  removable
                  @remove="scope.removeAtIndex(scope.index)"
                  :color="avatarColor(scope.opt.full_name)"
                  text-color="white"
                  size="sm"
                  class="q-my-xs"
                >
                  {{ scope.opt.full_name }}
                </q-chip>
              </template>
            </q-select>
          </div>

          <!-- Multi Shift Select -->
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              {{ assignDialog.isEdit ? 'Shift *' : 'Shifts * (select multiple)' }}
            </div>
            <q-select
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="assignForm.shift_ids"
              :options="activeShifts"
              option-label="name"
              option-value="id"
              emit-value
              map-options
              :multiple="!assignDialog.isEdit"
              use-chips
              :rules="[
                (v) => (Array.isArray(v) ? v.length > 0 : !!v) || 'Select at least one shift',
              ]"
            >
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section>
                    <q-item-label>{{ scope.opt.name }}</q-item-label>
                    <q-item-label caption
                      >{{ formatTime(scope.opt.start_time) }} –
                      {{ formatTime(scope.opt.end_time) }}</q-item-label
                    >
                  </q-item-section>
                </q-item>
              </template>
              <template #selected-item="scope">
                <q-chip
                  dense
                  removable
                  @remove="scope.removeAtIndex(scope.index)"
                  :color="getShiftColor(scope.opt.name)"
                  text-color="white"
                  size="sm"
                  icon="schedule"
                  class="q-my-xs"
                >
                  {{ scope.opt.name }}
                </q-chip>
              </template>
            </q-select>
          </div>

          <!-- Summary Banner -->
          <div
            v-if="!assignDialog.isEdit && assignSummary"
            class="assign-summary-banner q-pa-sm rounded-borders"
            :class="$q.dark.isActive ? 'bg-grey-9 border-grey-8' : 'bg-grey-1'"
          >
            <q-icon
              name="info"
              size="16px"
              class="q-mr-xs"
              :color="$q.dark.isActive ? 'grey-4' : 'primary'"
            />
            <span :class="$q.dark.isActive ? 'text-grey-4' : 'text-primary'">{{
              assignSummary
            }}</span>
          </div>

          <!-- Date Range -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                From Date *
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="assignForm.date_from"
                type="date"
                :rules="[(v) => !!v || 'Required']"
              />
            </div>
            <div class="col-6">
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                To Date *
              </div>
              <q-input
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="assignForm.date_to"
                type="date"
                :rules="[(v) => !!v || 'Required']"
              />
            </div>
          </div>

          <!-- Days of Week -->
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              REPEAT ON DAYS
            </div>
            <div class="row q-gutter-xs">
              <q-btn
                v-for="d in daysOfWeek"
                :key="d.val"
                :outline="!assignForm.days.includes(d.val)"
                :flat="$q.dark.isActive && !assignForm.days.includes(d.val)"
                :class="
                  $q.dark.isActive && !assignForm.days.includes(d.val) ? 'border border-grey-7' : ''
                "
                :color="assignForm.days.includes(d.val) ? 'primary' : 'grey-7'"
                dense
                no-caps
                rounded
                :label="d.short"
                size="sm"
                @click="toggleDay(d.val)"
              />
            </div>
          </div>

          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Notes
            </div>
            <q-input :dark="$q.dark.isActive" dense outlined v-model="assignForm.notes" autogrow />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn
            :label="assignDialog.isEdit ? 'Update' : 'Assign Shifts'"
            color="primary"
            icon="save"
            @click="saveAssignment"
            :loading="saving"
            unelevated
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ─── ROSTER UPLOAD & TEMPLATE DIALOG ─── -->
    <q-dialog v-model="uploadDialog.open" persistent>
      <q-card
        style="min-width: 500px; padding: 0"
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
          <div class="text-h6 text-weight-bold">Monthly Roster Upload</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-lg row q-col-gutter-md">
          <div class="col-12">
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Select Month/Year *
            </div>
            <q-input
              :dark="$q.dark.isActive"
              dense
              outlined
              v-model="uploadForm.month"
              type="month"
            />
          </div>

          <div class="col-12">
            <q-separator class="q-my-md" />
            <div class="text-subtitle2 q-mb-sm text-secondary text-weight-bold">
              1. Download Template
            </div>
            <div class="row q-col-gutter-sm items-end">
              <div class="col-12 col-sm-6">
                <div
                  :class="[
                    'text-caption q-mb-xs',
                    $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                  ]"
                >
                  Filter by Department (Optional)
                </div>
                <q-select
                  :dark="$q.dark.isActive"
                  dense
                  outlined
                  v-model="uploadForm.department_id"
                  :options="departments"
                  option-label="name"
                  option-value="id"
                  emit-value
                  map-options
                  clearable
                />
              </div>
              <div class="col-12 col-sm-6 text-right">
                <q-btn
                  label="Download Template"
                  color="secondary"
                  icon="download"
                  @click="generateTemplate"
                  unelevated
                  no-caps
                  size="md"
                />
              </div>
            </div>
            <div class="text-caption q-mt-sm text-grey-6">
              Downloads an Excel template pre-filled with exactly the employees in the selected
              department.
            </div>
          </div>

          <div class="col-12">
            <q-separator class="q-my-md" />
            <div class="text-subtitle2 q-mb-sm text-primary text-weight-bold">
              2. Upload Filled Roster
            </div>
            <div>
              <div
                :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
              >
                Select Excel File *
              </div>
              <q-file
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="uploadForm.file"
                accept=".xlsx, .xls, .csv"
              >
                <template v-slot:prepend>
                  <q-icon name="attach_file" />
                </template>
              </q-file>
            </div>
            <div class="text-caption q-mt-sm text-grey-6">
              Upload the filled template. Valid shift names (e.g. "Morning Shift", "Night") mapped
              to correctly dated columns will be assigned. Enter "Off" or "-" to leave empty.
            </div>
          </div>
        </q-card-section>

        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" v-close-popup no-caps />
          <q-btn
            label="Process Upload"
            color="primary"
            icon="upload"
            @click="processRosterUpload"
            :loading="uploading"
            unelevated
            no-caps
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const $q = useQuasar()
const authStore = useAuthStore()

// ─── State ───────────────────────────────────────────────────────────────────
const viewMode = ref('definitions')
const shifts = ref([])
const assignments = ref([])
const employees = ref([])
const departments = ref([])
const employeeOptions = ref([])
const loadingShifts = ref(false)
const loadingAssignments = ref(false)
const saving = ref(false)
const assignSearch = ref('')

const assignFilter = reactive({
  dateFrom: (() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay()) // start of this week (Sunday)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })(),
  dateTo: (() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + 6) // end of this week (Saturday)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })(),
  shiftId: null,
  employeeId: null,
})

function clearAssignFilters() {
  assignFilter.shiftId = null
  assignFilter.employeeId = null
  assignSearch.value = ''
}

// ─── Shift Dialog ──────────────────────────────────────────────────────────
const shiftDialog = reactive({ open: false, isEdit: false })
const shiftForm = reactive({
  id: null,
  name: '',
  start_time: '08:00',
  end_time: '17:00',
  break_duration_minutes: 60,
  is_overnight: false,
  is_active: true,
})

function openShiftDialog(shift = null) {
  shiftDialog.isEdit = !!shift
  if (shift) {
    Object.assign(shiftForm, {
      id: shift.id,
      name: shift.name,
      start_time: shift.start_time?.substring(0, 5) || '08:00',
      end_time: shift.end_time?.substring(0, 5) || '17:00',
      break_duration_minutes: shift.break_duration_minutes || 0,
      is_overnight: shift.is_overnight || false,
      is_active: shift.is_active !== false,
    })
  } else {
    Object.assign(shiftForm, {
      id: null,
      name: '',
      start_time: '08:00',
      end_time: '17:00',
      break_duration_minutes: 60,
      is_overnight: false,
      is_active: true,
    })
  }
  shiftDialog.open = true
}

// ─── Assignment Dialog ─────────────────────────────────────────────────────
const assignDialog = reactive({ open: false, isEdit: false })
const assignForm = reactive({
  id: null,
  employee_ids: [], // multi-select for create, single value for edit
  shift_ids: [], // multi-select for create, single value for edit
  date_from: (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })(),
  date_to: (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30) // Default repeat window: 30 days
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })(),
  days: [1, 2, 3, 4, 5], // Mon-Fri by default
  notes: '',
})

const daysOfWeek = [
  { val: 0, short: 'Sun', label: 'Sunday' },
  { val: 1, short: 'Mon', label: 'Monday' },
  { val: 2, short: 'Tue', label: 'Tuesday' },
  { val: 3, short: 'Wed', label: 'Wednesday' },
  { val: 4, short: 'Thu', label: 'Thursday' },
  { val: 5, short: 'Fri', label: 'Friday' },
  { val: 6, short: 'Sat', label: 'Saturday' },
]

const assignSummary = computed(() => {
  const empCount = Array.isArray(assignForm.employee_ids) ? assignForm.employee_ids.length : 0
  const shiftCount = Array.isArray(assignForm.shift_ids) ? assignForm.shift_ids.length : 0

  let matchCount = 0
  if (assignForm.date_from && assignForm.date_to) {
    const from = new Date(
      assignForm.date_from.split('-')[0],
      assignForm.date_from.split('-')[1] - 1,
      assignForm.date_from.split('-')[2],
    )
    const to = new Date(
      assignForm.date_to.split('-')[0],
      assignForm.date_to.split('-')[1] - 1,
      assignForm.date_to.split('-')[2],
    )
    if (from <= to) {
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        if (assignForm.days.includes(d.getDay())) {
          matchCount++
        }
      }
    }
  }

  if (empCount === 0 || shiftCount === 0 || matchCount === 0)
    return 'Select employees, shifts, and a valid date range to preview...'

  return `${matchCount} MATCHING DAY(S) IN RANGE • ${empCount} employee(s) × ${shiftCount} shift(s) = ${empCount * shiftCount * matchCount} assignments will be created.`
})

function toggleDay(val) {
  const idx = assignForm.days.indexOf(val)
  if (idx === -1) assignForm.days.push(val)
  else assignForm.days.splice(idx, 1)
}

function openAssignDialog() {
  const today = new Date()
  const nextMonth = new Date(today)
  nextMonth.setDate(today.getDate() + 30)

  Object.assign(assignForm, {
    id: null,
    employee_ids: [],
    shift_ids: [],
    date_from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
    date_to: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`,
    days: [1, 2, 3, 4, 5],
    notes: '',
  })
  assignDialog.isEdit = false
  assignDialog.open = true
}

function editAssignment(row) {
  // Parse the actual day of the assignment to pre-select it
  const [y, m, d] = row.assignment_date.split('-').map(Number)
  const actualDay = new Date(y, m - 1, d).getDay()

  Object.assign(assignForm, {
    id: row.id,
    employee_ids: row.employee_id, // single value for edit
    shift_ids: row.shift_id, // single value for edit
    date_from: row.assignment_date,
    date_to: row.assignment_date,
    days: [actualDay], // Pre-select the actual day of this assignment
    notes: row.notes || '',
  })
  assignDialog.isEdit = true
  assignDialog.open = true
}

// ─── Computed ──────────────────────────────────────────────────────────────
const activeShifts = computed(() => shifts.value.filter((s) => s.is_active))
const shiftOptions = computed(() => shifts.value)

const previewHours = computed(() => {
  try {
    const [sh, sm] = shiftForm.start_time.split(':').map(Number)
    const [eh, em] = shiftForm.end_time.split(':').map(Number)
    let mins = eh * 60 + em - (sh * 60 + sm)
    if (mins < 0) mins += 24 * 60
    else if (shiftForm.is_overnight) mins += 24 * 60
    return (mins / 60).toFixed(1)
  } catch {
    return '—'
  }
})

watch([() => shiftForm.start_time, () => shiftForm.end_time], ([st, et]) => {
  if (st && et) {
    const [sh, sm] = st.split(':').map(Number)
    const [eh, em] = et.split(':').map(Number)
    if (eh * 60 + em < sh * 60 + sm) {
      shiftForm.is_overnight = true
    } else {
      shiftForm.is_overnight = false
    }
  }
})

const previewEffective = computed(() => {
  const dur = parseFloat(previewHours.value) || 0
  const brk = (shiftForm.break_duration_minutes || 0) / 60
  return Math.max(0, dur - brk).toFixed(1)
})

const weekDays = computed(() => {
  const days = []
  const from = new Date(assignFilter.dateFrom)
  const to = new Date(assignFilter.dateTo)
  for (let d = new Date(from); d <= to && days.length < 7; d.setDate(d.getDate() + 1)) {
    const today = new Date().toISOString().split('T')[0]
    const ds = d.toISOString().split('T')[0]
    days.push({
      date: ds,
      label: d.toLocaleDateString('en', { weekday: 'short' }),
      isToday: ds === today,
    })
  }
  return days
})

const filteredAssignments = computed(() => {
  let result = assignments.value

  // Filter by employee (client-side for instant response)
  if (assignFilter.employeeId) {
    result = result.filter((a) => a.employee_id === assignFilter.employeeId)
  }

  // Text search
  if (assignSearch.value) {
    const s = assignSearch.value.toLowerCase()
    result = result.filter(
      (a) =>
        a.employees?.full_name?.toLowerCase().includes(s) ||
        a.shifts?.name?.toLowerCase().includes(s) ||
        a.assignment_date?.includes(s),
    )
  }

  return result
})

const assignColumns = [
  {
    name: 'employee',
    label: 'Employee',
    align: 'left',
    field: (r) => r.employees?.full_name,
    sortable: true,
  },
  { name: 'shift', label: 'Shift', align: 'left', field: (r) => r.shifts?.name, sortable: true },
  { name: 'date', label: 'Date', align: 'center', field: 'assignment_date', sortable: true },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'actions', label: '', align: 'center' },
]

// ── Helper: parse 'YYYY-MM-DD' into local Date (avoids UTC timezone shift bug) ──
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d) // local midnight
}
function formatLocalDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── API ───────────────────────────────────────────────────────────────────
async function loadShifts() {
  loadingShifts.value = true
  const branchId = authStore.currentBranch?.id

  let q = supabase.from('shifts').select('*').order('start_time')

  if (branchId) {
    q = q.eq('branch_id', branchId)
  }

  const { data, error } = await q

  if (error) console.error(error)
  else shifts.value = data || []
  loadingShifts.value = false
}

async function loadAssignments() {
  loadingAssignments.value = true
  const branchId = authStore.currentBranch?.id
  let q = supabase
    .from('shift_assignments')
    .select(`*, employees(full_name, employee_code), shifts(name, start_time, end_time)`)
    .gte('assignment_date', assignFilter.dateFrom)
    .lte('assignment_date', assignFilter.dateTo)
    .order('assignment_date')

  if (branchId) q = q.eq('branch_id', branchId)
  if (assignFilter.shiftId) q = q.eq('shift_id', assignFilter.shiftId)

  const { data, error } = await q
  if (error) console.error(error)
  else assignments.value = data || []
  loadingAssignments.value = false
}

function openUploadDialog() {
  uploadForm.file = null
  uploadForm.month = new Date().toISOString().substring(0, 7)
  uploadForm.department_id = null
  uploadDialog.open = true
}

const uploadDialog = reactive({ open: false })
const uploadForm = reactive({ file: null, month: '', department_id: null })
const uploading = ref(false)

function generateTemplate() {
  const [yyyy, mm] = uploadForm.month.split('-')
  const daysInMonth = new Date(yyyy, mm, 0).getDate()

  const header = ['Employee Code', 'Employee Name']
  for (let i = 1; i <= daysInMonth; i++) {
    header.push(`${yyyy}-${mm}-${String(i).padStart(2, '0')}`)
  }
  const data = [header]

  const filteredEmps = uploadForm.department_id
    ? employees.value.filter((e) => e.department_id === uploadForm.department_id)
    : employees.value

  filteredEmps.forEach((e) => {
    const row = [e.employee_code, e.full_name]
    for (let i = 1; i <= daysInMonth; i++) row.push('-')
    data.push(row)
  })

  const ws = XLSX.utils.aoa_to_sheet(data)
  // Auto-width for the first 2 columns
  ws['!cols'] = [{ wch: 15 }, { wch: 25 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'RosterTemplate')
  XLSX.writeFile(wb, `Roster_Template_${yyyy}_${mm}.xlsx`)
}

async function processRosterUpload() {
  if (!uploadForm.file || !uploadForm.month) {
    $q.notify({ type: 'warning', message: 'Please select a file and month' })
    return
  }

  uploading.value = true
  try {
    const file = uploadForm.file
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    if (data.length < 2) throw new Error('File is empty or missing data rows')

    const headers = data[0].map((h) =>
      h !== undefined && h !== null ? h.toString().toLowerCase().trim() : '',
    )
    const empIdx = headers.findIndex((h) => h.includes('code') || h.includes('employee'))

    if (empIdx === -1 && data[0][0]) {
      // Graceful fallback to assume 1st col
    }
    const safeEmpIdx = empIdx !== -1 ? empIdx : 0

    const shiftMap = {}
    shifts.value.forEach((s) => {
      shiftMap[s.name.toLowerCase().trim()] = s.id
      shiftMap[s.name.split(' ')[0].toLowerCase().trim()] = s.id
    })

    const empMap = {}
    employees.value.forEach((e) => {
      if (e.employee_code) empMap[e.employee_code.toString().toLowerCase().trim()] = e.id
    })

    const [yyyy, mm] = uploadForm.month.split('-')
    const daysInMonth = new Date(yyyy, mm, 0).getDate()
    const inserts = []

    for (let r = 1; r < data.length; r++) {
      const row = data[r]
      if (!row || !row[safeEmpIdx]) continue
      const empCode = row[safeEmpIdx].toString().toLowerCase().trim()
      const empId = empMap[empCode]

      if (!empId) continue // Silently skip rows not matching a valid code

      for (let c = 0; c < headers.length; c++) {
        if (c === safeEmpIdx || !data[0][c]) continue

        let dayOrDate = data[0][c].toString().trim()
        let dayNum = parseInt(dayOrDate, 10)
        if (dayOrDate.includes('-')) dayNum = parseInt(dayOrDate.split('-').pop(), 10)

        if (isNaN(dayNum) || dayNum < 1 || dayNum > daysInMonth) continue

        const cellVal = row[c]
        if (!cellVal) continue
        const shiftName = cellVal.toString().toLowerCase().trim()

        if (['off', 'x', '-', 'leave'].includes(shiftName)) continue

        let shiftId = shiftMap[shiftName] || shiftMap[shiftName.replace(' shift', '')]
        if (!shiftId) {
          const sObj = shifts.value.find(
            (s) =>
              s.name.toLowerCase().includes(shiftName) || shiftName.includes(s.name.toLowerCase()),
          )
          if (sObj) shiftId = sObj.id
        }

        if (shiftId) {
          const dateStr = `${yyyy}-${mm}-${String(dayNum).padStart(2, '0')}`
          inserts.push({
            company_id: authStore.currentBranch?.company_id,
            branch_id: authStore.currentBranch?.id,
            employee_id: empId,
            shift_id: shiftId,
            assignment_date: dateStr,
            status: 'scheduled',
            notes: 'Roster Bulk Import',
          })
        }
      }
    }

    if (inserts.length === 0)
      throw new Error('No valid shift assignments found to import. Check shift names and headers.')

    const { error } = await supabase
      .from('shift_assignments')
      .upsert(inserts, { onConflict: 'employee_id,shift_id,assignment_date' })

    if (error) throw error

    $q.notify({
      type: 'positive',
      message: `Successfully imported ${inserts.length} shift assignments!`,
    })
    uploadDialog.open = false
    await loadAssignments()
  } catch (err) {
    console.error('Upload Error:', err)
    $q.notify({ type: 'negative', message: err.message || 'Error processing Excel file' })
  } finally {
    uploading.value = false
  }
}

async function loadEmployees() {
  loadingAssignments.value = true
  const branchId = authStore.currentBranch?.id

  let q = supabase
    .from('employees')
    .select('id, full_name, employee_code, department_id, departments(name)')
    .eq('is_active', true)
    .order('full_name')

  if (branchId) q = q.eq('branch_id', branchId)

  const { data, error } = await q
  if (error) console.error(error)

  employees.value = data || []
  employeeOptions.value = data || []
  loadingAssignments.value = false
}

async function loadDepartments() {
  const branchId = authStore.currentBranch?.id
  let q = supabase.from('departments').select('id, name').eq('is_active', true).order('name')
  if (branchId) q = q.eq('branch_id', branchId)
  const { data } = await q
  departments.value = data || []
}

function filterEmps(val, update) {
  update(() => {
    if (!val) employeeOptions.value = employees.value
    else {
      const s = val.toLowerCase()
      employeeOptions.value = employees.value.filter(
        (e) =>
          (e.full_name && e.full_name.toLowerCase().includes(s)) ||
          (e.employee_code && e.employee_code.toLowerCase().includes(s)),
      )
    }
  })
}

async function saveShift() {
  if (!shiftForm.name || !shiftForm.start_time || !shiftForm.end_time) {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields' })
    return
  }
  saving.value = true
  const branchId = authStore.currentBranch?.id
  const companyId = authStore.currentBranch?.company_id
  const payload = {
    name: shiftForm.name,
    start_time: shiftForm.start_time,
    end_time: shiftForm.end_time,
    break_duration_minutes: shiftForm.break_duration_minutes || 0,
    is_overnight: shiftForm.is_overnight,
    is_active: shiftForm.is_active,
  }
  try {
    if (shiftDialog.isEdit) {
      const { error } = await supabase.from('shifts').update(payload).eq('id', shiftForm.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Shift updated successfully' })
    } else {
      // Add branch and company info only on insert to avoid RLS 400s on update
      payload.company_id = companyId
      payload.branch_id = branchId
      const { error } = await supabase.from('shifts').insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Shift created successfully' })
    }
    shiftDialog.open = false
    await loadShifts()
  } catch (err) {
    console.error('SAVE SHIFT ERROR:', err)
    $q.notify({ type: 'negative', message: err?.details || err?.message || 'Failed to save shift' })
  } finally {
    saving.value = false
  }
}

async function toggleShiftActive(shift) {
  const { error } = await supabase
    .from('shifts')
    .update({ is_active: !shift.is_active })
    .eq('id', shift.id)
  if (error) $q.notify({ type: 'negative', message: error.message })
  else {
    $q.notify({
      type: shift.is_active ? 'info' : 'positive',
      message: `Shift ${shift.is_active ? 'deactivated' : 'activated'}`,
    })
    await loadShifts()
  }
}

async function saveAssignment() {
  const hasEmployees = assignDialog.isEdit
    ? !!assignForm.employee_ids
    : Array.isArray(assignForm.employee_ids) && assignForm.employee_ids.length > 0
  const hasShifts = assignDialog.isEdit
    ? !!assignForm.shift_ids
    : Array.isArray(assignForm.shift_ids) && assignForm.shift_ids.length > 0

  if (!hasEmployees || !hasShifts || !assignForm.date_from || !assignForm.date_to) {
    $q.notify({ type: 'warning', message: 'Please fill in all required fields' })
    return
  }
  saving.value = true
  const branchId = authStore.currentBranch?.id
  const companyId = authStore.currentBranch?.company_id

  try {
    if (assignDialog.isEdit) {
      // Simple single-date update
      const { error } = await supabase
        .from('shift_assignments')
        .update({
          employee_id: assignForm.employee_ids,
          shift_id: assignForm.shift_ids,
          notes: assignForm.notes,
        })
        .eq('id', assignForm.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Assignment updated' })
    } else {
      // Bulk insert for date range + selected days × employees × shifts
      const from = parseLocalDate(assignForm.date_from)
      const to = parseLocalDate(assignForm.date_to)
      const empIds = assignForm.employee_ids
      const shiftIds = assignForm.shift_ids
      const inserts = []

      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay()
        if (assignForm.days.includes(dayOfWeek)) {
          const dateStr = formatLocalDate(d)
          for (const empId of empIds) {
            for (const sId of shiftIds) {
              inserts.push({
                company_id: companyId,
                branch_id: branchId,
                employee_id: empId,
                shift_id: sId,
                assignment_date: dateStr,
                status: 'scheduled',
                notes: assignForm.notes || null,
              })
            }
          }
        }
      }
      if (inserts.length === 0) {
        $q.notify({
          type: 'warning',
          message:
            'No dates matched your selected days of week. Check your date range and day selection.',
        })
        saving.value = false
        return
      }
      // Upsert with the NEW 3-column unique constraint
      const { error } = await supabase
        .from('shift_assignments')
        .upsert(inserts, { onConflict: 'employee_id,shift_id,assignment_date' })
      if (error) throw error

      if (assignForm.date_from < assignFilter.dateFrom) assignFilter.dateFrom = assignForm.date_from
      if (assignForm.date_to > assignFilter.dateTo) assignFilter.dateTo = assignForm.date_to

      $q.notify({ type: 'positive', message: `${inserts.length} shift assignment(s) created` })
    }
    assignDialog.open = false
    await loadAssignments()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to save assignment' })
  } finally {
    saving.value = false
  }
}

async function deleteAssignment(row) {
  $q.dialog({
    title: 'Remove Assignment',
    message: `Remove shift assignment for ${row.employees?.full_name} on ${row.assignment_date}?`,
    cancel: true,
    ok: { label: 'Remove', color: 'negative' },
  }).onOk(async () => {
    const { error } = await supabase.from('shift_assignments').delete().eq('id', row.id)
    if (error) $q.notify({ type: 'negative', message: error.message })
    else {
      $q.notify({ type: 'info', message: 'Assignment removed' })
      await loadAssignments()
    }
  })
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatTime(t) {
  if (!t) return '—'
  const [h, m] = t.split(':')
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getShiftType(shift) {
  const [h] = shift.start_time?.split(':').map(Number) || [8]
  if (h < 9) return 'morning'
  if (h < 14) return 'day'
  if (h < 18) return 'evening'
  return 'night'
}

function calculateHours(shift) {
  try {
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const [eh, em] = shift.end_time.split(':').map(Number)
    let mins = eh * 60 + em - (sh * 60 + sm)
    if (mins < 0) mins += 24 * 60
    else if (shift.is_overnight) mins += 24 * 60
    return (mins / 60).toFixed(1)
  } catch {
    return '—'
  }
}

function getShiftColor(shiftName) {
  if (!shiftName) return 'grey-7'
  const name = shiftName.toLowerCase()
  if (name.includes('morning') || name.includes('early')) return 'amber-8'
  if (name.includes('day') || name.includes('mid')) return 'blue-7'
  if (name.includes('evening') || name.includes('afternoon')) return 'orange-8'
  if (name.includes('night') || name.includes('late')) return 'deep-purple-7'
  return 'indigo-7'
}

function statusColor(s) {
  return (
    { scheduled: 'blue-7', completed: 'green-7', missed: 'red-7', swapped: 'orange-7' }[s] ||
    'grey-7'
  )
}

function getAssignmentsForDay(date) {
  return assignments.value.filter((a) => a.assignment_date === date).slice(0, 4)
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase()
}

const avatarColors = [
  'indigo-7',
  'teal-7',
  'blue-8',
  'green-8',
  'orange-8',
  'red-8',
  'purple-7',
  'cyan-8',
]
function avatarColor(name) {
  if (!name) return 'grey-7'
  return avatarColors[name.charCodeAt(0) % avatarColors.length]
}

watch(
  () => authStore.currentBranch?.id,
  (newId) => {
    if (newId) {
      loadShifts()
      loadEmployees()
      loadAssignments()
    }
  },
)

onMounted(async () => {
  await Promise.all([loadShifts(), loadEmployees(), loadDepartments()])
  await loadAssignments()
})

function exportPDF() {
  if (!filteredAssignments.value || filteredAssignments.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Shift Assignments Report', 14, 15)

  doc.setFontSize(10)
  doc.setTextColor(100)
  let filterText = `From: ${assignFilter.dateFrom} To: ${assignFilter.dateTo}`
  if (assignFilter.shiftId) {
    const shift = shifts.value.find((s) => s.id === assignFilter.shiftId)?.name || ''
    filterText += ` | Shift: ${shift}`
  }
  if (assignSearch.value) filterText += ` | Search: ${assignSearch.value}`

  doc.text(filterText, 14, 22)
  doc.text(`Total Records: ${filteredAssignments.value.length}`, 14, 27)

  const head = [['#', 'Employee Name', 'Shift', 'Date', 'Start Time', 'End Time', 'Status']]
  const body = filteredAssignments.value.map((r, i) => [
    i + 1,
    r.employees?.full_name || '—',
    r.shifts?.name || '—',
    r.assignment_date || '—',
    formatTime(r.shifts?.start_time),
    formatTime(r.shifts?.end_time),
    r.status || '—',
  ])

  autoTable(doc, {
    startY: 32,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [33, 150, 243] },
    styles: { fontSize: 8 },
  })

  doc.save('shift_assignments_report.pdf')
}

function exportExcel() {
  if (!filteredAssignments.value || filteredAssignments.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No records to export.' })
    return
  }

  const exportData = filteredAssignments.value.map((r, i) => ({
    '#': i + 1,
    'Employee Name': r.employees?.full_name || '',
    Shift: r.shifts?.name || '',
    Date: r.assignment_date || '',
    'Start Time': formatTime(r.shifts?.start_time),
    'End Time': formatTime(r.shifts?.end_time),
    Status: r.status || '',
  }))

  const ws = XLSX.utils.json_to_sheet(exportData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Shift Assignments')
  XLSX.writeFile(wb, 'shift_assignments_report.xlsx')
}
</script>

<style scoped lang="scss">
.shift-toggle {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
  :deep(.q-btn) {
    padding: 4px 16px;
    font-size: 12px;
    font-weight: 600;
    min-height: 32px;
  }
}

.shift-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--erp-border-hover);
  }
}

.shift-bar {
  height: 4px;
  width: 100%;
}
.shift-morning {
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
}
.shift-day {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}
.shift-evening {
  background: linear-gradient(90deg, #f97316, #fb923c);
}
.shift-night {
  background: linear-gradient(90deg, #7c3aed, #a78bfa);
}

.shift-name {
  font-size: 1.05rem;
  color: var(--erp-text-primary);
}

.shift-type-label {
  color: var(--erp-text-muted);
}

.shift-time-label {
  color: var(--erp-text-muted);
}

.shift-time-value {
  color: var(--erp-text-primary);
}

.shift-meta-text {
  color: var(--erp-text-muted);
}

.shift-time-block {
  background: var(--erp-bg-hover);
  border-radius: 6px;
  padding: 5px 8px;
}

.shift-preview-card {
  background: var(--erp-bg-hover);
  border: 1px solid var(--erp-border);
}

.shift-preview-label {
  color: var(--erp-text-muted);
}

.erp-data-grid {
  background: var(--erp-bg-card);
  border-radius: 12px;
}

/* Weekly calendar */
.weekly-grid {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}
.week-day-col {
  flex: 1;
  min-width: 100px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--erp-border);
}
.week-day-header {
  background: var(--erp-bg-hover);
  padding: 6px 8px;
  text-align: center;
  font-size: 0.75rem;
  color: var(--erp-text-muted);

  &.today {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }
}
.week-day-body {
  min-height: 60px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--erp-bg-card);
}
.asgn-chip {
  border-radius: 6px;
  padding: 3px 6px;
  font-size: 0.68rem;
  line-height: 1.3;
  border-left: 2px solid;
  overflow: hidden;
}
.asgn-scheduled {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
}
.asgn-completed {
  background: rgba(34, 197, 94, 0.15);
  border-color: #22c55e;
}
.asgn-missed {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
}
.asgn-swapped {
  background: rgba(249, 115, 22, 0.15);
  border-color: #f97316;
}

.asgn-emp {
  font-weight: 700;
  color: var(--erp-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asgn-shift {
  color: var(--erp-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.assign-summary-banner {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.25);
  color: #60a5fa;
  font-size: 0.82rem;
  font-weight: 600;
  display: flex;
  align-items: center;
}
.week-day-empty {
  text-align: center;
  color: var(--erp-text-tertiary);
  font-size: 0.8rem;
  padding: 8px;
}
</style>
