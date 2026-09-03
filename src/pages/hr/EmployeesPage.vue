<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="Employees" breadcrumbs="Human Resources / Employees" />

    <!-- KPI Row -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-6 col-md-3">
        <div class="sys-kpi-card sys-kpi-card--blue">
          <q-icon name="groups" size="64px" class="sys-kpi-watermark" />
          <div class="sys-kpi-icon-wrap">
            <q-icon name="groups" size="20px" color="white" />
          </div>
          <div class="sys-kpi-body">
            <div class="sys-kpi-label">Total Employees</div>
            <div class="sys-kpi-value">{{ stats.total }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <div class="sys-kpi-card sys-kpi-card--green">
          <q-icon name="verified" size="64px" class="sys-kpi-watermark" />
          <div class="sys-kpi-icon-wrap">
            <q-icon name="verified" size="20px" color="white" />
          </div>
          <div class="sys-kpi-body">
            <div class="sys-kpi-label">Permanent</div>
            <div class="sys-kpi-value">{{ stats.permanent }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <div class="sys-kpi-card sys-kpi-card--amber">
          <q-icon name="pending_actions" size="64px" class="sys-kpi-watermark" />
          <div class="sys-kpi-icon-wrap">
            <q-icon name="pending_actions" size="20px" color="white" />
          </div>
          <div class="sys-kpi-body">
            <div class="sys-kpi-label">Probation</div>
            <div class="sys-kpi-value">{{ stats.probation }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <div class="sys-kpi-card sys-kpi-card--teal">
          <q-icon name="description" size="64px" class="sys-kpi-watermark" />
          <div class="sys-kpi-icon-wrap">
            <q-icon name="description" size="20px" color="white" />
          </div>
          <div class="sys-kpi-body">
            <div class="sys-kpi-label">Contract</div>
            <div class="sys-kpi-value">{{ stats.contract }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="row items-end q-mb-md q-gutter-md">
      <!-- Buttons -->
      <div class="col-12 col-md-auto row q-gutter-sm">
        <q-btn color="primary" icon="add" label="Add Employee" @click="openForm()" no-caps />
        <q-btn
          color="amber-8"
          text-color="dark"
          icon="badge"
          label="Add Designation"
          @click="openDesigDialog()"
          no-caps
        />
        <q-btn
          color="indigo"
          icon="account_tree"
          label="Add Department"
          @click="openDeptDialog()"
          no-caps
        />
        <q-btn color="positive" icon="download" label="Excel" @click="exportExcel" no-caps />
        <q-btn color="red-6" icon="picture_as_pdf" label="PDF" @click="exportPDF" no-caps />
        <q-btn
          color="dark"
          icon="manage_accounts"
          label="Manage User Logins"
          to="/admin/users"
          no-caps
          class="q-ml-md"
        />
      </div>

      <q-space class="gt-sm" />

      <!-- Filters -->
      <div class="col-12 col-md-auto row q-gutter-sm">
        <div style="width: 200px">
          <div
            :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']"
            style="line-height: 1"
          >
            Search
          </div>
          <q-input
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="search"
            placeholder="Search by name/nic..."
            clearable
          >
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>

        <div style="width: 140px">
          <div
            :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']"
            style="line-height: 1"
          >
            Status
          </div>
          <q-select
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="statusFilter"
            :options="[
              'All',
              'Active',
              'Permanent',
              'Probation',
              'Contract',
              'Part Time',
              'Resigned',
            ]"
          />
        </div>

        <div style="width: 170px">
          <div
            :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']"
            style="line-height: 1"
          >
            Department
          </div>
          <q-select
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="deptFilter"
            :options="deptFilterOptions"
            emit-value
            map-options
          />
        </div>

        <div style="width: 170px">
          <div
            :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']"
            style="line-height: 1"
          >
            Designation
          </div>
          <q-select
            :dark="$q.dark.isActive"
            dense
            outlined
            v-model="desigFilter"
            :options="desigFilterOptions"
            emit-value
            map-options
          />
        </div>
      </div>
    </div>

    <!-- Employee Table -->
    <q-table
      dark
      flat
      bordered
      :rows="filteredEmployees"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :filter="search"
      :filter-method="customFilter"
      :pagination="{ rowsPerPage: 20 }"
      class="erp-data-grid"
    >
      <template #body-cell-view_id="props">
        <q-td :props="props">
          {{ props.row.employee_code || props.rowIndex + 1 }}
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            flat
            round
            dense
            icon="visibility"
            color="primary"
            size="sm"
            @click="viewEmployee(props.row)"
          >
            <q-tooltip>View</q-tooltip>
          </q-btn>
          <q-btn flat round dense icon="edit" color="amber" size="sm" @click="openForm(props.row)">
            <q-tooltip>Edit</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            dense
            icon="delete"
            color="negative"
            size="sm"
            @click="confirmDelete(props.row)"
          >
            <q-tooltip>Delete</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <q-dialog v-model="showForm" persistent>
      <q-card
        style="
          width: 1000px;
          max-width: 90vw;
          background: var(--erp-bg-form-card, #111827);
          color: #fff;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        "
      >
        <q-card-section class="q-pb-none row justify-between items-center">
          <div class="text-h6 text-weight-bold text-white">Add Employee</div>
          <q-btn icon="close" flat round dense v-close-popup color="grey-4" />
        </q-card-section>

        <q-card-section class="q-pt-sm">
          <q-form @submit.prevent="saveEmployee" ref="formRef" greedy>
            <!-- Section 1: Personal Information -->
            <div
              class="q-pa-sm q-mb-md rounded-borders"
              style="
                background: rgba(33, 150, 243, 0.1);
                border-left: 4px solid #2196f3;
                color: #64b5f6;
                font-weight: 600;
                font-size: 13px;
              "
            >
              Personal Information
            </div>

            <div
              :class="[
                'row q-col-gutter-x-lg q-col-gutter-y-md',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
              ]"
            >
              <div class="col-12">
                <div class="text-caption">Employee ID:</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.employee_code"
                  readonly
                />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Full Name</div>
                <q-input :dark="$q.dark.isActive" outlined dense v-model="form.first_name" />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Address</div>
                <q-input :dark="$q.dark.isActive" outlined dense v-model="form.address_line1" />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">NIC:</div>
                <q-input :dark="$q.dark.isActive" outlined dense v-model="form.nic_number" />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Date of Birth:</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  type="date"
                  v-model="form.date_of_birth"
                  stack-label
                />
              </div>

              <div class="col-12">
                <div class="row items-center q-gutter-x-sm">
                  <div class="col-auto">
                    <div
                      :class="['text-caption', $q.dark.isActive ? 'text-grey-8' : 'text-grey-7']"
                    >
                      <q-icon name="cloud_upload" size="xs" /> Upload Image
                    </div>
                  </div>
                </div>
                <q-file
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.user_pic"
                  class="q-mt-xs"
                  label="Choose Image"
                  accept="image/jpeg,image/png,image/webp"
                  max-file-size="5242880"
                >
                  <template v-slot:append>
                    <span
                      :class="['text-caption', $q.dark.isActive ? 'text-grey-6' : 'text-grey-7']"
                      style="margin-left: 10px"
                      >{{ form.user_pic ? form.user_pic.name : 'No file chosen' }}</span
                    >
                  </template>
                </q-file>
              </div>

              <div class="col-12 col-md-4">
                <div class="text-caption">Gender:</div>
                <div class="row no-wrap items-center">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    class="col"
                    v-model="form.gender"
                    :options="getDynOptions('gender')"
                  >
                    <template #option="scope">
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>{{ scope.opt }}</q-item-section>
                        <q-item-section side v-if="dynOptions.gender.includes(scope.opt)">
                          <q-btn
                            flat
                            round
                            dense
                            icon="close"
                            size="xs"
                            color="negative"
                            @click.stop="removeDynOption('gender', scope.opt)"
                          />
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle_outline"
                    color="indigo-3"
                    size="sm"
                    class="q-ml-xs"
                    @click="openAddOption('gender')"
                    ><q-tooltip>Add option</q-tooltip></q-btn
                  >
                </div>
              </div>
              <div class="col-12 col-md-4">
                <div class="text-caption">Title:</div>
                <div class="row no-wrap items-center">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    class="col"
                    v-model="form.title"
                    :options="getDynOptions('title')"
                  >
                    <template #option="scope">
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>{{ scope.opt }}</q-item-section>
                        <q-item-section side v-if="dynOptions.title.includes(scope.opt)">
                          <q-btn
                            flat
                            round
                            dense
                            icon="close"
                            size="xs"
                            color="negative"
                            @click.stop="removeDynOption('title', scope.opt)"
                          />
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle_outline"
                    color="indigo-3"
                    size="sm"
                    class="q-ml-xs"
                    @click="openAddOption('title')"
                    ><q-tooltip>Add option</q-tooltip></q-btn
                  >
                </div>
              </div>
              <div class="col-12 col-md-4">
                <div class="text-caption">Civil Status:</div>
                <div class="row no-wrap items-center">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    class="col"
                    v-model="form.civil_status"
                    :options="getDynOptions('civil_status')"
                  >
                    <template #option="scope">
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>{{ scope.opt }}</q-item-section>
                        <q-item-section side v-if="dynOptions.civil_status.includes(scope.opt)">
                          <q-btn
                            flat
                            round
                            dense
                            icon="close"
                            size="xs"
                            color="negative"
                            @click.stop="removeDynOption('civil_status', scope.opt)"
                          />
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle_outline"
                    color="indigo-3"
                    size="sm"
                    class="q-ml-xs"
                    @click="openAddOption('civil_status')"
                    ><q-tooltip>Add option</q-tooltip></q-btn
                  >
                </div>
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Personal Phone No:</div>
                <q-input :dark="$q.dark.isActive" outlined dense v-model="form.mobile" />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Email:</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.email"
                  type="email"
                />
              </div>
            </div>

            <!-- Section 2: Employee Details -->
            <div
              class="q-pa-sm q-mt-lg q-mb-md rounded-borders"
              style="
                background: rgba(33, 150, 243, 0.1);
                border-left: 4px solid #2196f3;
                color: #64b5f6;
                font-weight: 600;
                font-size: 13px;
              "
            >
              Employee Details
            </div>

            <div
              :class="[
                'row q-col-gutter-x-lg q-col-gutter-y-md',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
              ]"
            >
              <div class="col-12 col-md-6">
                <div class="text-caption">Short Name</div>
                <q-input :dark="$q.dark.isActive" outlined dense v-model="form.last_name" />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Join Date</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  type="date"
                  v-model="form.hire_date"
                  stack-label
                />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Designation:</div>
                <div class="row no-wrap items-center">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    class="col"
                    v-model="form.designation_id"
                    :options="designationOptions"
                    emit-value
                    map-options
                  />
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle_outline"
                    color="amber-7"
                    size="sm"
                    class="q-ml-xs"
                    @click="openDesigDialog()"
                    ><q-tooltip>Add designation</q-tooltip></q-btn
                  >
                </div>
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Department:</div>
                <q-select
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.department_id"
                  :options="departmentOptions"
                  emit-value
                  map-options
                  clearable
                  placeholder="— Select Department —"
                />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Salary Type:</div>
                <div class="row no-wrap items-center">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    class="col"
                    v-model="form.pay_type"
                    :options="getDynOptions('salary_type')"
                  >
                    <template #option="scope">
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>{{ scope.opt }}</q-item-section>
                        <q-item-section side v-if="dynOptions.salary_type.includes(scope.opt)">
                          <q-btn
                            flat
                            round
                            dense
                            icon="close"
                            size="xs"
                            color="negative"
                            @click.stop="removeDynOption('salary_type', scope.opt)"
                          />
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle_outline"
                    color="indigo-3"
                    size="sm"
                    class="q-ml-xs"
                    @click="openAddOption('salary_type')"
                    ><q-tooltip>Add option</q-tooltip></q-btn
                  >
                </div>
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">OT Eligibility:</div>
                <div class="row no-wrap items-center">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    class="col"
                    v-model="form.ot"
                    :options="getDynOptions('ot')"
                  >
                    <template #option="scope">
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>{{ scope.opt }}</q-item-section>
                        <q-item-section side v-if="dynOptions.ot.includes(scope.opt)">
                          <q-btn
                            flat
                            round
                            dense
                            icon="close"
                            size="xs"
                            color="negative"
                            @click.stop="removeDynOption('ot', scope.opt)"
                          />
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle_outline"
                    color="indigo-3"
                    size="sm"
                    class="q-ml-xs"
                    @click="openAddOption('ot')"
                    ><q-tooltip>Add option</q-tooltip></q-btn
                  >
                </div>
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Promotion Period:</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.probation_period"
                  placeholder="Select Promotion Date"
                />
              </div>

              <div class="col-12 col-md-6">
                <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">
                  Company Name:
                </div>
                <div class="row no-wrap items-center">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    class="col"
                    v-model="form.internal_company"
                    :options="getDynOptions('internal_company')"
                  >
                    <template #option="scope">
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>{{ scope.opt }}</q-item-section>
                        <q-item-section side v-if="dynOptions.internal_company.includes(scope.opt)">
                          <q-btn
                            flat
                            round
                            dense
                            icon="close"
                            size="xs"
                            color="negative"
                            @click.stop="removeDynOption('internal_company', scope.opt)"
                          />
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle_outline"
                    color="indigo-3"
                    size="sm"
                    class="q-ml-xs"
                    @click="openAddOption('internal_company')"
                    ><q-tooltip>Add option</q-tooltip></q-btn
                  >
                </div>
              </div>
            </div>

            <!-- Section 3: Salary Configuration -->
            <div
              class="q-pa-sm q-mt-lg q-mb-md rounded-borders"
              style="
                background: rgba(251, 191, 36, 0.08);
                border-left: 4px solid #f9a825;
                color: #f9a825;
                font-weight: 600;
                font-size: 13px;
              "
            >
              <q-icon name="payments" size="16px" class="q-mr-xs" />Salary Configuration
            </div>

            <div
              :class="[
                'row q-col-gutter-x-lg q-col-gutter-y-md',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
              ]"
            >
              <div class="col-12 col-md-6">
                <div class="text-caption">Salary Method *</div>
                <div class="row no-wrap items-center">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    class="col"
                    v-model="form.salary_method"
                    :options="getDynSalaryMethods()"
                    emit-value
                    map-options
                  >
                    <template #option="scope">
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>{{ scope.opt?.label || scope.opt }}</q-item-section>
                        <q-item-section
                          side
                          v-if="dynOptions.salary_method.some((o) => o.value === scope.opt?.value)"
                        >
                          <q-btn
                            flat
                            round
                            dense
                            icon="close"
                            size="xs"
                            color="negative"
                            @click.stop="removeDynSalaryMethod(scope.opt?.value)"
                          />
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle_outline"
                    color="indigo-3"
                    size="sm"
                    class="q-ml-xs"
                    @click="openAddOption('salary_method')"
                    ><q-tooltip>Add option</q-tooltip></q-btn
                  >
                </div>
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Basic Salary (LKR)</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model.number="form.basic_salary"
                  type="number"
                  placeholder="0.00"
                />
              </div>

              <div class="col-12 col-md-6" v-if="form.salary_method === 'day_salary'">
                <div class="text-caption">Day Rate (LKR)</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model.number="form.day_rate"
                  type="number"
                  placeholder="0.00"
                />
              </div>
              <div class="col-12 col-md-6" v-if="form.salary_method === 'unit_salary'">
                <div class="text-caption">Unit Rate (LKR)</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model.number="form.unit_rate"
                  type="number"
                  placeholder="0.00"
                />
              </div>

              <template v-if="form.ot === 'Eligible'">
                <div class="col-12 col-md-4">
                  <div class="text-caption">
                    Hourly Rate <span class="text-caption text-teal-6">(auto)</span>
                  </div>
                  <q-input
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    v-model.number="form.hourly_rate"
                    type="number"
                    readonly
                    bg-color="teal-1"
                    :hint="`Basic ÷ 26 ÷ 8 = LKR ${form.hourly_rate}`"
                  >
                    <template #append>
                      <q-icon name="schedule" color="teal-7" size="16px">
                        <q-tooltip>Auto: Basic ÷ 26 working days ÷ 8 hours</q-tooltip>
                      </q-icon>
                    </template>
                  </q-input>
                </div>
                <div class="col-12 col-md-4">
                  <div class="text-caption">OT Multiplier</div>
                  <q-input
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    v-model.number="form.overtime_rate_multiplier"
                    type="number"
                    hint="Default: 1.5×"
                  />
                </div>
                <div class="col-12 col-md-4">
                  <div class="text-caption">
                    OT Rate <span class="text-caption text-orange-6">(auto)</span>
                  </div>
                  <q-input
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    :model-value="otRateDisplay"
                    readonly
                    bg-color="orange-1"
                    :hint="`= Hourly × ${form.overtime_rate_multiplier || 1.5}× = LKR ${otRateDisplay}`"
                  >
                    <template #append>
                      <q-icon name="calculate" color="orange-7" size="16px">
                        <q-tooltip>Auto: Hourly Rate × OT Multiplier</q-tooltip>
                      </q-icon>
                    </template>
                  </q-input>
                </div>
              </template>
              <!-- EPF / ETF block (inside Salary Config) -->
              <div class="col-12">
                <q-separator :dark="$q.dark.isActive" class="q-mb-sm" spaced />
                <q-checkbox
                  :dark="$q.dark.isActive"
                  v-model="form.epf_etf_eligible"
                  label="EPF / ETF Eligible"
                  dense
                  color="amber-8"
                  :class="[$q.dark.isActive ? 'text-grey-3' : 'text-grey-9']"
                />
              </div>

              <template v-if="form.epf_etf_eligible">
                <div class="col-12 col-md-4">
                  <div class="text-caption">EPF No</div>
                  <q-input :dark="$q.dark.isActive" outlined dense v-model="form.epf_no" />
                </div>
                <div class="col-12 col-md-4">
                  <div class="text-caption">EPF % (Employee)</div>
                  <q-input
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    v-model.number="form.epf_employee_pct"
                    type="number"
                    suffix="%"
                  />
                </div>
                <div class="col-12 col-md-4">
                  <div class="text-caption">
                    EPF Amount <span class="text-caption text-amber-6">(auto)</span>
                  </div>
                  <q-input
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    v-model="form.epf_amount"
                    readonly
                    bg-color="amber-1"
                    :hint="`= Basic × ${form.epf_employee_pct || 8}% = LKR ${form.epf_amount}`"
                  >
                    <template #append>
                      <q-icon name="calculate" color="amber-7" size="16px">
                        <q-tooltip>Auto-calculated: Basic Salary × EPF%</q-tooltip>
                      </q-icon>
                    </template>
                  </q-input>
                </div>
              </template>

              <div class="col-12">
                <!-- Allowances header + Add button -->
                <div class="row items-center q-mb-xs">
                  <div
                    :class="['text-caption col', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']"
                  >
                    Allowances (LKR)
                  </div>
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle"
                    color="teal"
                    size="sm"
                    @click="addExtraAllowance"
                  >
                    <q-tooltip>Add custom allowance</q-tooltip>
                  </q-btn>
                </div>

                <!-- Fixed allowances -->
                <div class="row q-col-gutter-md q-mb-sm">
                  <div class="col-12 col-md-4">
                    <div class="text-caption" style="font-size: 11px">Housing</div>
                    <q-input
                      :dark="$q.dark.isActive"
                      outlined
                      dense
                      v-model.number="form.housing_allowance"
                      type="number"
                      placeholder="0.00"
                    />
                  </div>
                  <div class="col-12 col-md-4">
                    <div class="text-caption" style="font-size: 11px">Transport</div>
                    <q-input
                      :dark="$q.dark.isActive"
                      outlined
                      dense
                      v-model.number="form.transport_allowance"
                      type="number"
                      placeholder="0.00"
                    />
                  </div>
                  <div class="col-12 col-md-4">
                    <div class="text-caption" style="font-size: 11px">Meals</div>
                    <q-input
                      :dark="$q.dark.isActive"
                      outlined
                      dense
                      v-model.number="form.meal_allowance"
                      type="number"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <!-- Dynamic extra allowances -->
                <div v-if="extraAllowances.length" class="q-gutter-y-xs">
                  <div
                    v-for="(item, idx) in extraAllowances"
                    :key="idx"
                    class="row q-col-gutter-sm items-center"
                  >
                    <div class="col-12 col-md-5">
                      <q-input
                        :dark="$q.dark.isActive"
                        outlined
                        dense
                        v-model="item.label"
                        placeholder="Allowance name (e.g. Attendance)"
                      />
                    </div>
                    <div class="col-12 col-md-5">
                      <q-input
                        :dark="$q.dark.isActive"
                        outlined
                        dense
                        v-model.number="item.amount"
                        type="number"
                        placeholder="0.00"
                        prefix="LKR"
                      />
                    </div>
                    <div class="col-auto">
                      <q-btn
                        flat
                        round
                        dense
                        icon="remove_circle"
                        color="negative"
                        size="sm"
                        @click="extraAllowances.splice(idx, 1)"
                      >
                        <q-tooltip>Remove</q-tooltip>
                      </q-btn>
                    </div>
                  </div>
                </div>

                <!-- Total summary -->
                <div
                  v-if="extraAllowances.length"
                  :class="[
                    'text-caption q-mt-xs',
                    $q.dark.isActive ? 'text-teal-4' : 'text-teal-8',
                  ]"
                >
                  Other allowances total: LKR
                  {{
                    extraAllowances
                      .reduce((s, a) => s + (Number(a.amount) || 0), 0)
                      .toLocaleString('en-LK', { minimumFractionDigits: 2 })
                  }}
                </div>
              </div>
            </div>

            <!-- Section 4: Payment Details -->
            <div
              class="q-pa-sm q-mt-lg q-mb-md rounded-borders"
              style="
                background: rgba(33, 150, 243, 0.1);
                border-left: 4px solid #2196f3;
                color: #64b5f6;
                font-weight: 600;
                font-size: 13px;
              "
            >
              Payment Details
            </div>

            <div
              :class="[
                'row q-col-gutter-x-lg q-col-gutter-y-md',
                $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
              ]"
            >
              <div class="col-12">
                <div class="text-caption">Payment Type:</div>
                <div class="row no-wrap items-center">
                  <q-select
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    class="col"
                    v-model="form.pay_type"
                    :options="getDynOptions('payment_type')"
                    color="amber-8"
                  >
                    <template #option="scope">
                      <q-item v-bind="scope.itemProps">
                        <q-item-section>{{ scope.opt }}</q-item-section>
                        <q-item-section side v-if="dynOptions.payment_type.includes(scope.opt)">
                          <q-btn
                            flat
                            round
                            dense
                            icon="close"
                            size="xs"
                            color="negative"
                            @click.stop="removeDynOption('payment_type', scope.opt)"
                          />
                        </q-item-section>
                      </q-item>
                    </template>
                  </q-select>
                  <q-btn
                    flat
                    round
                    dense
                    icon="add_circle_outline"
                    color="indigo-3"
                    size="sm"
                    class="q-ml-xs"
                    @click="openAddOption('payment_type')"
                    ><q-tooltip>Add option</q-tooltip></q-btn
                  >
                </div>
              </div>

              <div class="col-12">
                <div class="text-caption">Bank:</div>
                <q-select
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.bank_name"
                  :options="bankFilteredOptions"
                  color="amber-8"
                  use-input
                  input-debounce="0"
                  @filter="filterBanks"
                  emit-value
                  map-options
                  clearable
                  placeholder="Search and select bank"
                  @update:model-value="onBankChange(form)"
                >
                  <template #no-option>
                    <q-item
                      ><q-item-section class="text-grey">No banks found</q-item-section></q-item
                    >
                  </template>
                </q-select>
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Branch:</div>
                <q-select
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.bank_branch"
                  :options="getBranchOptions(form.bank_name)"
                  color="amber-8"
                  use-input
                  input-debounce="0"
                  @filter="(val, update) => filterBranches(val, update, form.bank_name)"
                  emit-value
                  map-options
                  clearable
                  placeholder="Select branch"
                  :disable="!form.bank_name"
                >
                  <template #no-option>
                    <q-item
                      ><q-item-section class="text-grey">{{
                        form.bank_name ? 'No branches found' : 'Select a bank first'
                      }}</q-item-section></q-item
                    >
                  </template>
                </q-select>
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Account Name:</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.bank_account_name"
                  color="amber-8"
                  placeholder="Account holder name"
                />
              </div>

              <div class="col-12">
                <div class="text-caption">Account No:</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.bank_account_number"
                  color="amber-8"
                  placeholder="Enter account number"
                />
              </div>
            </div>

            <!-- Section 4b: Emergency Contact -->
            <div
              class="q-pa-sm q-mt-lg q-mb-md rounded-borders"
              style="
                background: rgba(239, 68, 68, 0.08);
                border-left: 4px solid #ef4444;
                color: #fca5a5;
                font-weight: 600;
                font-size: 13px;
              "
            >
              <q-icon name="emergency" size="16px" class="q-mr-xs" /> Emergency Contact
            </div>
            <div class="row q-col-gutter-sm q-mb-md">
              <div class="col-12 col-md-6">
                <div class="text-caption">Contact Name:</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.emergency_contact_name"
                  color="amber-8"
                  placeholder="Full name"
                />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Relationship:</div>
                <q-select
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.emergency_contact_relationship"
                  color="amber-8"
                  :options="['Spouse', 'Parent', 'Sibling', 'Friend', 'Other']"
                  clearable
                  placeholder="Select relationship"
                />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Emergency Phone:</div>
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model="form.emergency_contact_phone"
                  color="amber-8"
                  placeholder="Contact phone number"
                />
              </div>
            </div>

            <!-- Section 5: Employee Documents -->
            <div
              class="q-pa-sm q-mt-lg q-mb-md rounded-borders"
              style="
                background: rgba(99, 102, 241, 0.08);
                border-left: 4px solid #6366f1;
                color: #a5b4fc;
                font-weight: 600;
                font-size: 13px;
              "
            >
              <q-icon name="folder_open" size="16px" class="q-mr-xs" /> Employee Documents
            </div>

            <div
              :class="['q-mb-md text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']"
            >
              Tick a document type to upload the corresponding file. You can also add a custom
              document name.
            </div>

            <!-- Predefined document types with checkboxes -->
            <div class="row q-col-gutter-sm q-mb-md">
              <div v-for="(docEntry, idx) in formDocEntries" :key="idx" class="col-12 col-sm-6">
                <div
                  class="rounded-borders q-pa-sm"
                  :style="{
                    background: docEntry.enabled
                      ? 'rgba(99,102,241,0.12)'
                      : 'rgba(255,255,255,0.03)',
                    border: docEntry.enabled
                      ? '1px solid rgba(99,102,241,0.5)'
                      : '1px solid rgba(255,255,255,0.07)',
                    transition: 'all 0.2s',
                  }"
                >
                  <!-- Checkbox row -->
                  <div class="row items-center no-wrap">
                    <q-checkbox
                      :dark="$q.dark.isActive"
                      :model-value="docEntry.enabled"
                      @update:model-value="
                        (v) => {
                          formDocEntries[idx].enabled = v
                        }
                      "
                      :label="docEntry.label"
                      dense
                      color="indigo-4"
                      :class="['col', $q.dark.isActive ? 'text-grey-3' : 'text-grey-9']"
                    />
                    <q-icon
                      v-if="docEntry.enabled && docEntry.file"
                      name="check_circle"
                      color="green"
                      size="16px"
                    />
                  </div>
                  <!-- File upload (shown when checked) -->
                  <div v-if="docEntry.enabled" class="q-mt-sm">
                    <q-input
                      :dark="$q.dark.isActive"
                      outlined
                      dense
                      :model-value="docEntry.doc_name"
                      @update:model-value="
                        (v) => {
                          formDocEntries[idx].doc_name = v
                        }
                      "
                      :placeholder="docEntry.label + ' – label (optional)'"
                      class="q-mb-xs"
                    />
                    <q-file
                      :dark="$q.dark.isActive"
                      outlined
                      dense
                      :model-value="docEntry.file"
                      @update:model-value="
                        (v) => {
                          formDocEntries[idx].file = v
                        }
                      "
                      :label="'Choose file'"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      max-file-size="10485760"
                    >
                      <template #prepend><q-icon name="attach_file" /></template>
                    </q-file>
                  </div>
                </div>
              </div>
            </div>

            <!-- Custom document entry -->
            <div
              class="q-pa-sm q-mb-md rounded-borders"
              style="
                background: rgba(255, 255, 255, 0.03);
                border: 1px dashed rgba(99, 102, 241, 0.35);
              "
            >
              <div class="text-caption text-indigo-3 q-mb-sm">
                <q-icon name="add_circle_outline" size="xs" class="q-mr-xs" />
                Custom Document (optional)
              </div>
              <div class="row q-col-gutter-sm">
                <div class="col-12 col-md-4">
                  <q-input
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    v-model="customDocEntry.doc_name"
                    placeholder="Document name (e.g. Bank Statement)"
                  />
                </div>
                <div class="col-12 col-md-5">
                  <q-file
                    :dark="$q.dark.isActive"
                    outlined
                    dense
                    v-model="customDocEntry.file"
                    label="Choose file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    max-file-size="10485760"
                    :disable="!customDocEntry.doc_name"
                  >
                    <template #prepend><q-icon name="attach_file" /></template>
                  </q-file>
                </div>
                <div class="col-12 col-md-3 flex items-center">
                  <q-btn
                    unelevated
                    color="indigo-7"
                    icon="add"
                    label="Add"
                    no-caps
                    size="sm"
                    :disable="!customDocEntry.doc_name || !customDocEntry.file"
                    @click="addCustomDocEntry"
                  />
                </div>
              </div>
              <!-- List of added custom docs -->
              <div v-if="extraDocEntries.length" class="q-mt-sm q-gutter-y-xs">
                <div
                  v-for="(ed, ei) in extraDocEntries"
                  :key="ei"
                  :class="[
                    'row items-center text-caption',
                    $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                  ]"
                >
                  <q-icon name="description" size="14px" color="indigo-3" class="q-mr-xs" />
                  <span class="col">{{ ed.doc_name }} — {{ ed.file?.name }}</span>
                  <q-btn
                    flat
                    round
                    dense
                    icon="close"
                    size="xs"
                    color="negative"
                    @click="extraDocEntries.splice(ei, 1)"
                  />
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="row justify-end q-mt-xl q-gutter-sm">
              <q-btn flat label="Cancel" @click="showForm = false" color="grey" no-caps />
              <q-btn
                type="submit"
                color="primary"
                :label="isEditing ? 'Update Employee' : 'Save Employee'"
                icon="save"
                :loading="saving"
                no-caps
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- View Detail Dialog -->
    <q-dialog
      v-model="showDetail"
      maximized
      transition-show="slide-up"
      transition-hide="slide-down"
      @hide="unsubscribeProfileRealtime"
    >
      <q-card
        class="full-width"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
        style="font-family: Roboto, sans-serif"
      >
        <!-- layout -->
        <q-toolbar class="shadow-1" style="height: 60px">
          <q-toolbar-title class="text-weight-bold" style="font-size: 20px">
            Profile
            <span
              :class="[
                'text-caption text-weight-regular',
                $q.dark.isActive ? 'text-grey-5' : 'text-grey-7',
              ]"
              style="font-size: 14px"
              >Preview</span
            >
          </q-toolbar-title>
          <q-space />
          <q-btn
            flat
            round
            dense
            icon="close"
            v-close-popup
            :color="$q.dark.isActive ? 'grey-4' : 'grey-8'"
          />
        </q-toolbar>

        <q-scroll-area style="height: calc(100vh - 60px)">
          <div class="row q-pa-lg q-col-gutter-lg" style="margin: 0 auto; max-width: 1600px">
            <!-- Left Side -->
            <div class="col-12 col-md-4 col-lg-3">
              <q-card flat bordered style="" class="q-mb-md">
                <q-card-section class="q-pb-sm">
                  <!-- Employee Photo -->
                  <div class="text-center q-mb-md">
                    <q-avatar size="100px" style="border: 3px solid rgba(249, 168, 37, 0.5)">
                      <img
                        v-if="viewEmpPhotoUrl"
                        :src="viewEmpPhotoUrl"
                        style="object-fit: cover"
                      />
                      <q-icon v-else name="person" size="60px" color="grey-6" />
                    </q-avatar>
                  </div>

                  <div
                    :class="[
                      'text-subtitle1 text-weight-bold q-mb-sm',
                      $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                    ]"
                  >
                    About Me
                  </div>

                  <div class="q-gutter-y-sm">
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                    >
                      Name:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmp?.full_name || viewEmp?.first_name }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      EMP NO:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmp?.employee_code }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      Basic Salary:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmpSalary?.basic_salary || '0.00' }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      NIC:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmp?.nic_number }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      Address:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmp?.address_line1 || 'No Address' }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      Personal Contact:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmp?.mobile || '' }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      Office Contact:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmp?.residence_phone || '' }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      Designation:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmp?.designations?.title || 'None' }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      Hour Rate:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmpSalary?.hourly_rate || '0.00' }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      EPF No:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >{{ viewEmp?.epf_no || '' }}</span
                      >
                    </div>
                    <div
                      :class="[
                        'q-pa-sm text-caption rounded-borders q-mb-md',
                        $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                      ]"
                      style=""
                    >
                      Company Name:
                      <span
                        :class="[
                          'text-weight-medium',
                          $q.dark.isActive ? 'text-white' : 'text-dark',
                        ]"
                        >SEVEN WAVES (PVT) LTD</span
                      >
                    </div>
                  </div>

                  <div
                    class="text-subtitle1 text-weight-bold q-pa-sm text-center q-mb-md"
                    style="
                      border: 1px solid rgba(34, 197, 94, 0.3);
                      border-radius: 4px;
                      color: #4ade80;
                      background: rgba(34, 197, 94, 0.05);
                    "
                  >
                    Employee Status:
                    <span class="text-uppercase">{{ viewEmp?.employment_status || 'ACTIVE' }}</span>
                  </div>

                  <q-btn
                    class="full-width"
                    :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
                    color="amber-8"
                    text-color="dark"
                    label="Back"
                    unelevated
                    v-close-popup
                    style="border-radius: 6px; font-weight: 600"
                  />
                </q-card-section>
              </q-card>

              <q-card flat bordered style="" class="q-mb-md">
                <q-card-section class="q-pa-sm q-px-md">
                  <div class="row items-center justify-between q-mb-sm">
                    <span
                      :class="['text-subtitle2', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
                      >Officer Areas</span
                    >
                    <div class="q-gutter-sm">
                      <q-btn
                        color="amber-8"
                        outline
                        size="sm"
                        label="Save Area"
                        no-caps
                        :loading="savingArea"
                        @click="saveOfficerAreas"
                      />
                      <q-btn
                        color="amber-8"
                        text-color="dark"
                        size="sm"
                        label="Add Area"
                        unelevated
                        no-caps
                        @click="addOfficerArea"
                      />
                    </div>
                  </div>
                  <!-- Area input row -->
                  <div class="row q-col-gutter-xs q-mb-sm">
                    <div class="col-7">
                      <q-input
                        :dark="$q.dark.isActive"
                        outlined
                        dense
                        v-model="newAreaName"
                        placeholder="Area name"
                        color="amber-8"
                      />
                    </div>
                    <div class="col-5">
                      <q-input
                        :dark="$q.dark.isActive"
                        outlined
                        dense
                        v-model="newAreaCode"
                        placeholder="Code (optional)"
                        color="amber-8"
                      />
                    </div>
                  </div>
                  <!-- Areas list -->
                  <div v-if="loadingAreas" class="text-center q-pa-xs">
                    <q-spinner-dots color="amber" size="24px" />
                  </div>
                  <div
                    v-for="(area, idx) in empAreas"
                    :key="idx"
                    class="row items-center q-mb-xs"
                  >
                    <span
                      :class="['col text-caption', $q.dark.isActive ? 'text-grey-3' : 'text-grey-9']"
                    >
                      {{ area.area_name }}<span v-if="area.area_code" class="text-grey-5 q-ml-xs">({{ area.area_code }})</span>
                    </span>
                    <q-btn
                      flat
                      round
                      dense
                      icon="close"
                      size="xs"
                      color="negative"
                      @click="removeArea(idx)"
                    />
                  </div>
                  <div
                    v-if="!loadingAreas && empAreas.length === 0"
                    :class="['text-caption text-center', $q.dark.isActive ? 'text-grey-6' : 'text-grey-5']"
                  >
                    No areas assigned
                  </div>
                </q-card-section>
              </q-card>

              <q-card flat bordered style="" class="q-mb-md">
                <q-card-section class="q-pa-sm q-px-md">
                  <div class="row items-center justify-between q-mb-sm">
                    <span
                      :class="['text-subtitle2', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
                      >HR Allowance</span
                    >
                  </div>
                  <q-markup-table
                    :dark="$q.dark.isActive"
                    flat
                    bordered
                    dense
                    class="text-caption shadow-0"
                    separator="cell"
                    style=""
                  >
                    <thead>
                      <tr>
                        <th
                          :class="[
                            'text-left text-weight-medium',
                            $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                          ]"
                        >
                          Allowance Type
                        </th>
                        <th
                          :class="[
                            'text-right text-weight-medium',
                            $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                          ]"
                        >
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="viewEmpSalary?.housing_allowance > 0">
                        <td :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'">
                          Housing Allowance
                        </td>
                        <td :class="['text-right', $q.dark.isActive ? 'text-white' : 'text-dark']">
                          {{ Number(viewEmpSalary.housing_allowance).toFixed(2) }}
                        </td>
                      </tr>
                      <tr v-if="viewEmpSalary?.transport_allowance > 0">
                        <td :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'">
                          Transport Allowance
                        </td>
                        <td :class="['text-right', $q.dark.isActive ? 'text-white' : 'text-dark']">
                          {{ Number(viewEmpSalary.transport_allowance).toFixed(2) }}
                        </td>
                      </tr>
                      <tr v-if="viewEmpSalary?.meal_allowance > 0">
                        <td :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'">
                          Meal Allowance
                        </td>
                        <td :class="['text-right', $q.dark.isActive ? 'text-white' : 'text-dark']">
                          {{ Number(viewEmpSalary.meal_allowance).toFixed(2) }}
                        </td>
                      </tr>
                      <tr v-if="viewEmpSalary?.other_allowances > 0">
                        <td :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'">
                          Other Allowances
                        </td>
                        <td :class="['text-right', $q.dark.isActive ? 'text-white' : 'text-dark']">
                          {{ Number(viewEmpSalary.other_allowances).toFixed(2) }}
                        </td>
                      </tr>
                      <tr
                        v-if="
                          !viewEmpSalary ||
                          Number(viewEmpSalary.housing_allowance || 0) +
                            Number(viewEmpSalary.transport_allowance || 0) +
                            Number(viewEmpSalary.meal_allowance || 0) +
                            Number(viewEmpSalary.other_allowances || 0) ===
                            0
                        "
                      >
                        <td
                          colspan="2"
                          :class="['text-center', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']"
                        >
                          No allowances configured
                        </td>
                      </tr>
                      <tr>
                        <td :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'">
                          Total Allowances :
                        </td>
                        <td :class="['text-right', $q.dark.isActive ? 'text-white' : 'text-dark']">
                          {{ viewEmpTotalAllowance.toFixed(2) }}
                        </td>
                      </tr>
                      <tr>
                        <td :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'">
                          Basic Salary :
                        </td>
                        <td :class="['text-right', $q.dark.isActive ? 'text-white' : 'text-dark']">
                          {{ Number(viewEmpSalary?.basic_salary || 0).toFixed(2) }}
                        </td>
                      </tr>
                      <tr class="text-weight-bold">
                        <td :class="$q.dark.isActive ? 'text-amber-4' : 'text-orange-9'">
                          Total :
                        </td>
                        <td
                          :class="[
                            'text-right',
                            $q.dark.isActive ? 'text-amber-4' : 'text-orange-9',
                          ]"
                        >
                          {{
                            (
                              Number(viewEmpSalary?.basic_salary || 0) + viewEmpTotalAllowance
                            ).toFixed(2)
                          }}
                        </td>
                      </tr>
                    </tbody>
                  </q-markup-table>
                </q-card-section>
              </q-card>

              <q-card flat bordered style="" class="q-mb-md">
                <q-card-section class="q-pa-sm q-px-md">
                  <div class="row items-center justify-between q-mb-sm">
                    <span
                      :class="['text-subtitle2', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
                      >HR Deduction</span
                    >
                    <q-btn
                      color="amber-8"
                      outline
                      size="sm"
                      label="Add Deduction"
                      no-caps
                      @click="showDeductionDialog = true"
                    />
                  </div>
                  <div v-if="loadingDeductions" class="text-center q-pa-xs">
                    <q-spinner-dots color="amber" size="24px" />
                  </div>
                  <q-markup-table
                    v-else
                    :dark="$q.dark.isActive"
                    flat
                    bordered
                    dense
                    class="text-caption shadow-0"
                    separator="cell"
                    style=""
                  >
                    <thead>
                      <tr>
                        <th
                          :class="[
                            'text-left text-weight-medium',
                            $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                          ]"
                        >
                          Deduction
                        </th>
                        <th
                          :class="[
                            'text-right text-weight-medium',
                            $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                          ]"
                        >
                          Amount
                        </th>
                        <th
                          :class="[
                            'text-center text-weight-medium',
                            $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                          ]"
                        >
                          #
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="empDeductions.length === 0">
                        <td
                          colspan="3"
                          :class="['text-center', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']"
                        >
                          No records
                        </td>
                      </tr>
                      <tr v-for="ded in empDeductions" :key="ded.id">
                        <td :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'">
                          {{ ded.deduction_type }}
                          <span v-if="ded.effective_date" class="text-grey-5 q-ml-xs">({{ ded.effective_date }})</span>
                        </td>
                        <td :class="['text-right', $q.dark.isActive ? 'text-white' : 'text-dark']">
                          {{ Number(ded.amount || 0).toFixed(2) }}
                        </td>
                        <td class="text-center">
                          <q-btn
                            flat
                            round
                            dense
                            icon="close"
                            size="xs"
                            color="negative"
                            @click="
                              async () => {
                                await supabase.from('employee_deductions').delete().eq('id', ded.id)
                                loadEmpDeductions(viewEmp?.id)
                              }
                            "
                          />
                        </td>
                      </tr>
                    </tbody>
                  </q-markup-table>
                </q-card-section>
              </q-card>

              <q-card flat bordered style="" class="q-mb-xl">
                <q-card-section class="q-pa-sm q-px-md">
                  <span
                    :class="['text-subtitle2', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
                    >Complains</span
                  >
                </q-card-section>
              </q-card>
            </div>

            <!-- Right Side Form -->
            <div class="col-12 col-md-8 col-lg-9">
              <q-card
                flat
                bordered
                style="min-height: 100%; border-top: 4px solid #f9a825"
                class="q-mb-xl"
              >
                <q-tabs
                  v-model="viewTab"
                  :dark="$q.dark.isActive"
                  align="left"
                  dense
                  active-color="amber-4"
                  indicator-color="amber-4"
                >
                  <q-tab
                    name="settings"
                    label="Settings"
                    style="text-transform: capitalize; font-weight: 500"
                  />
                  <q-tab
                    name="documents"
                    label="Documents"
                    style="text-transform: capitalize; font-weight: 500"
                  />
                  <q-tab
                    name="leave"
                    label="Leave"
                    style="text-transform: capitalize; font-weight: 500"
                  />
                  <q-tab
                    name="advances"
                    label="Advances"
                    style="text-transform: capitalize; font-weight: 500"
                  />
                </q-tabs>

                <q-tab-panels v-model="viewTab" animated style="background: transparent">
                  <q-tab-panel name="settings">
                    <div
                      class="row q-col-gutter-y-md items-center text-caption q-mt-sm"
                      style="max-width: 900px"
                    >
                      <!-- Form Inputs -->
                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      ></div>
                      <div class="col-9">
                        <q-checkbox
                          :dark="$q.dark.isActive"
                          v-model="viewEmpSystemApp"
                          label="System App Allowed"
                          dense
                          size="sm"
                          color="amber-8"
                          :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Name
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.first_name"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Title
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.title"
                          :options="['Mr.', 'Mrs.', 'Miss', 'Rev.']"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Gender
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.gender"
                          :options="['Male', 'Female', 'Other']"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Civil Status
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.civil_status"
                          :options="['Single', 'Married', 'Divorced', 'Widowed']"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Date Of Birth
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          type="date"
                          v-model="viewForm.date_of_birth"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Short Name
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.last_name"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Personal Contact (whatsapp)
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.mobile"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Office Contact
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.residence_phone"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        NIC
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.nic_number"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Email Address
                      </div>
                      <div class="col-9">
                        <q-input :dark="$q.dark.isActive" outlined dense v-model="viewForm.email" />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Address
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.address_line1"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Internal Company
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.internal_company"
                          :options="['Select Internal', 'Yes', 'No']"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Designation
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.designation_id"
                          :options="designationOptions"
                          emit-value
                          map-options
                          clearable
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Probation Period
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          type="date"
                          v-model="viewForm.probation_period"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Salary
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.salary"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      ></div>
                      <div class="col-9">
                        <q-checkbox
                          :dark="$q.dark.isActive"
                          v-model="viewForm.epf_etf_eligible"
                          label="EPF / ETF Eligible"
                          dense
                          color="amber-8"
                          :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'"
                        />
                      </div>

                      <template v-if="viewForm.epf_etf_eligible">
                        <div
                          :class="[
                            'col-3 text-right q-pr-md text-weight-medium',
                            $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                          ]"
                        >
                          EPF NO
                        </div>
                        <div class="col-9">
                          <q-input
                            :dark="$q.dark.isActive"
                            outlined
                            dense
                            v-model="viewForm.epf_no"
                          />
                        </div>

                        <div
                          :class="[
                            'col-3 text-right q-pr-md text-weight-medium',
                            $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                          ]"
                        >
                          EPF Amount
                        </div>
                        <div class="col-9">
                          <q-input
                            :dark="$q.dark.isActive"
                            outlined
                            dense
                            v-model="viewForm.epf_amount"
                            readonly
                            bg-color="amber-1"
                            :hint="`= LKR ${viewForm.epf_amount} (Basic × ${viewForm.epf_employee_pct || 8}%)`"
                          >
                            <template #append>
                              <q-icon name="calculate" color="amber-7" size="16px">
                                <q-tooltip>Auto-calculated: Basic Salary × EPF%</q-tooltip>
                              </q-icon>
                            </template>
                          </q-input>
                        </div>
                      </template>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Welfare Amount
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.welfare_amount"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        OT
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.ot"
                          :options="['Eligible', 'Not Eligible']"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Confirm Date
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          type="date"
                          v-model="viewForm.confirm_date"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Resign Date
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          type="date"
                          v-model="viewForm.resign_date"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Pay Type
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.pay_type"
                          :options="['Cash', 'Bank', 'Cheque']"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Bank
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.bank_name"
                          :options="bankFilteredOptionsView"
                          use-input
                          input-debounce="0"
                          @filter="filterBanksView"
                          emit-value
                          map-options
                          clearable
                          placeholder="Search and select bank"
                          @update:model-value="onBankChange(viewForm)"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Branch
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.bank_branch"
                          :options="getBranchOptions(viewForm.bank_name)"
                          use-input
                          input-debounce="0"
                          @filter="(val, update) => filterBranches(val, update, viewForm.bank_name)"
                          emit-value
                          map-options
                          clearable
                          placeholder="Select branch"
                          :disable="!viewForm.bank_name"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Account Name
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.bank_account_name"
                          placeholder="Account holder name"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Account No
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.bank_account_number"
                        />
                      </div>

                      <!-- Emergency Contact separator -->
                      <div class="col-12 q-mt-sm q-mb-xs">
                        <div
                          class="q-pa-xs rounded-borders text-caption text-weight-medium"
                          :style="{
                            background: 'rgba(239,68,68,0.08)',
                            borderLeft: '3px solid #ef4444',
                            color: '#fca5a5',
                          }"
                        >
                          <q-icon name="emergency" size="14px" class="q-mr-xs" />Emergency Contact
                        </div>
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Contact Name
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.emergency_contact_name"
                          placeholder="Full name"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Relationship
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.emergency_contact_relationship"
                          :options="['Spouse', 'Parent', 'Sibling', 'Friend', 'Other']"
                          clearable
                          placeholder="Select relationship"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Emergency Phone
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.emergency_contact_phone"
                          placeholder="Contact phone number"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Join Date
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          type="date"
                          v-model="viewForm.hire_date"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Salary / Shift Rate
                      </div>
                      <div class="col-9">
                        <q-input
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.shift_rate"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        Shift
                      </div>
                      <div class="col-9">
                        <q-select
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.shift"
                          :options="getDynOptions('shift')"
                          clearable
                          placeholder="— Optional —"
                        />
                      </div>

                      <div class="col-3"></div>
                      <div class="col-9 column q-gutter-y-xs q-mt-sm">
                        <q-checkbox
                          :dark="$q.dark.isActive"
                          v-if="viewForm.ot === 'Eligible'"
                          v-model="viewForm.morning_ot"
                          label="Morning OT Pay"
                          dense
                          size="sm"
                          color="amber-8"
                          :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'"
                        />
                        <q-checkbox
                          :dark="$q.dark.isActive"
                          v-model="viewForm.late_deduct"
                          label="Late Pay Deduct"
                          dense
                          size="sm"
                          color="amber-8"
                          :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'"
                        />
                        <q-checkbox
                          :dark="$q.dark.isActive"
                          v-model="viewForm.no_pay_deduct"
                          label="No Pay Deduct"
                          dense
                          size="sm"
                          color="amber-8"
                          :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'"
                        />
                        <q-checkbox
                          :dark="$q.dark.isActive"
                          v-if="viewForm.epf_etf_eligible"
                          v-model="viewForm.epf_attend"
                          label="EPF Attend"
                          dense
                          size="sm"
                          color="amber-8"
                          :class="$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'"
                        />
                      </div>

                      <div
                        :class="[
                          'col-3 text-right q-pr-md text-weight-medium q-mt-md',
                          $q.dark.isActive ? 'text-grey-4' : 'text-grey-9',
                        ]"
                      >
                        User Pic
                      </div>
                      <div class="col-9 q-mt-md">
                        <q-file
                          :dark="$q.dark.isActive"
                          outlined
                          dense
                          v-model="viewForm.user_pic"
                          label="Image Upload"
                        >
                          <template v-slot:prepend><q-icon name="image" size="xs" /></template>
                        </q-file>
                      </div>

                      <div class="col-12 text-right q-mt-lg">
                        <q-separator dark class="q-mb-md" style="" />
                        <q-btn
                          no-caps
                          unelevated
                          color="amber-8"
                          text-color="dark"
                          icon="save"
                          label="Update Profile"
                          :loading="savingProfile"
                          @click="updateProfile"
                        />
                      </div>
                    </div>
                  </q-tab-panel>

                  <!-- ══ DOCUMENTS TAB ══════════════════════════════════════ -->
                  <q-tab-panel name="documents" class="q-pa-md">
                    <!-- Tab header -->
                    <div class="row items-center q-mb-lg">
                      <div>
                        <div
                          :class="[
                            'text-subtitle1 text-weight-bold',
                            $q.dark.isActive ? 'text-grey-2' : 'text-grey-9',
                          ]"
                        >
                          Employee Documents
                        </div>
                        <div
                          :class="[
                            'text-caption',
                            $q.dark.isActive ? 'text-grey-5' : 'text-grey-6',
                          ]"
                        >
                          {{ empDocuments.length }} file{{ empDocuments.length !== 1 ? 's' : '' }}
                          uploaded
                        </div>
                      </div>
                      <q-space />
                      <q-btn
                        unelevated
                        color="amber-8"
                        text-color="dark"
                        icon="upload_file"
                        label="Upload Document"
                        no-caps
                        size="sm"
                        @click="openUploadDoc"
                      />
                    </div>

                    <!-- Loading state -->
                    <div v-if="loadingDocs" class="row justify-center q-pa-xl">
                      <q-spinner-orbit color="amber" size="48px" />
                    </div>

                    <!-- Document type cards grid -->
                    <div v-else class="row q-col-gutter-md">
                      <div
                        v-for="docType in docTypeGroups"
                        :key="docType.key"
                        class="col-12 col-sm-6 col-lg-4"
                      >
                        <q-card
                          flat
                          :style="
                            $q.dark.isActive
                              ? 'background: #1e293b; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px'
                              : 'background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px'
                          "
                          style="min-height: 140px; display: flex; flex-direction: column"
                        >
                          <!-- Card header -->
                          <div
                            class="row items-center q-px-md q-pt-md q-pb-sm"
                            style="border-bottom: 1px solid rgba(0, 0, 0, 0.07); flex-shrink: 0"
                          >
                            <q-icon
                              :name="docType.icon"
                              :color="docType.color"
                              size="20px"
                              class="q-mr-sm"
                            />
                            <div
                              :class="[
                                'text-caption text-weight-bold col',
                                $q.dark.isActive ? 'text-grey-2' : 'text-grey-8',
                              ]"
                            >
                              {{ docType.label }}
                            </div>
                            <q-badge
                              v-if="empDocsByType[docType.key]?.length"
                              :color="docType.color"
                              :label="empDocsByType[docType.key].length"
                              outline
                              class="q-mr-xs"
                              style="font-size: 10px; padding: 2px 7px"
                            />
                            <q-btn
                              flat
                              round
                              dense
                              icon="cloud_upload"
                              color="amber-8"
                              size="xs"
                              @click.stop="openUploadDoc(docType.key)"
                            >
                              <q-tooltip>Upload {{ docType.label }}</q-tooltip>
                            </q-btn>
                          </div>

                          <!-- Document list -->
                          <div
                            v-if="empDocsByType[docType.key]?.length"
                            class="col"
                            style="overflow: hidden"
                          >
                            <div
                              v-for="doc in empDocsByType[docType.key]"
                              :key="doc.id"
                              class="row items-center q-px-md q-py-sm"
                              style="border-bottom: 1px solid rgba(0, 0, 0, 0.05)"
                            >
                              <!-- File type icon -->
                              <q-icon
                                :name="
                                  doc.mime_type?.startsWith('image') ? 'image' : 'picture_as_pdf'
                                "
                                :color="
                                  doc.mime_type?.startsWith('image') ? 'teal-6' : 'deep-orange-5'
                                "
                                size="18px"
                                class="q-mr-sm flex-shrink-0"
                              />

                              <!-- Name + date -->
                              <div class="col" style="min-width: 0">
                                <div
                                  class="text-caption text-weight-medium ellipsis cursor-pointer"
                                  :class="$q.dark.isActive ? 'text-amber-4' : 'text-indigo-7'"
                                  style="text-decoration: underline; text-underline-offset: 2px"
                                  @click="previewDoc(doc)"
                                >
                                  {{
                                    doc.doc_name || doc.file_path?.split('/').pop() || 'Document'
                                  }}
                                </div>
                                <div class="text-grey-6" style="font-size: 10px">
                                  {{ new Date(doc.created_at).toLocaleDateString('en-GB') }}
                                </div>
                              </div>

                              <!-- Actions -->
                              <div class="row no-wrap items-center q-gutter-xs q-ml-xs">
                                <q-icon
                                  v-if="doc.is_verified"
                                  name="verified"
                                  color="green-6"
                                  size="14px"
                                >
                                  <q-tooltip>Verified</q-tooltip>
                                </q-icon>
                                <q-btn
                                  flat
                                  round
                                  dense
                                  icon="visibility"
                                  color="blue-6"
                                  size="xs"
                                  :loading="previewLoading && previewDocId === doc.id"
                                  @click="previewDoc(doc)"
                                >
                                  <q-tooltip>View / Preview</q-tooltip>
                                </q-btn>
                                <q-btn
                                  flat
                                  round
                                  dense
                                  icon="download"
                                  color="amber-8"
                                  size="xs"
                                  @click="downloadDoc(doc)"
                                >
                                  <q-tooltip>Download File</q-tooltip>
                                </q-btn>
                                <q-btn
                                  flat
                                  round
                                  dense
                                  icon="delete_outline"
                                  color="red-5"
                                  size="xs"
                                  @click="confirmDeleteDoc(doc)"
                                >
                                  <q-tooltip>Delete</q-tooltip>
                                </q-btn>
                              </div>
                            </div>
                          </div>

                          <!-- Empty state (clickable upload zone) -->
                          <div
                            v-else
                            class="col column items-center justify-center q-pa-md cursor-pointer"
                            :style="
                              $q.dark.isActive
                                ? 'border: 1.5px dashed rgba(255,255,255,0.15); border-radius: 0 0 12px 12px; margin: 8px 12px 12px; background: rgba(255,255,255,0.02)'
                                : 'border: 1.5px dashed #cbd5e1; border-radius: 0 0 8px 8px; margin: 8px 12px 12px; background: #f8fafc'
                            "
                            @click="openUploadDoc(docType.key)"
                          >
                            <q-icon
                              name="cloud_upload"
                              size="24px"
                              :color="$q.dark.isActive ? 'amber-5' : 'indigo-5'"
                            />
                            <div
                              :class="[
                                'text-caption text-weight-medium q-mt-xs',
                                $q.dark.isActive ? 'text-grey-4' : 'text-grey-7',
                              ]"
                            >
                              Click to upload {{ docType.label }}
                            </div>
                          </div>
                        </q-card>
                      </div>
                    </div>
                  </q-tab-panel>

                  <!-- ══ LEAVE TAB ══════════════════════════════════════════════ -->
                  <q-tab-panel name="leave" class="q-pa-md">
                    <!-- Header row -->
                    <div class="row items-center q-mb-md">
                      <div
                        :class="[
                          'text-subtitle1 text-weight-bold',
                          $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                        ]"
                      >
                        Leave Balances — {{ new Date().getFullYear() }}
                      </div>
                      <q-space />
                      <q-btn
                        flat
                        round
                        dense
                        size="sm"
                        icon="refresh"
                        :loading="loadingLeave"
                        color="amber-7"
                        @click="loadEmpLeaveBalances(viewEmp?.id)"
                      >
                        <q-tooltip>Refresh</q-tooltip>
                      </q-btn>
                    </div>

                    <!-- Loading -->
                    <div v-if="loadingLeave" class="row justify-center q-pa-xl">
                      <q-spinner-orbit color="amber" size="48px" />
                    </div>

                    <!-- Empty state -->
                    <div
                      v-else-if="!empLeaveBalances.length"
                      :class="[
                        'text-center q-pa-xl',
                        $q.dark.isActive ? 'text-grey-5' : 'text-grey-7',
                      ]"
                    >
                      <q-icon name="event_busy" size="48px" class="q-mb-sm" />
                      <div>No leave types configured for this company yet.</div>
                    </div>

                    <!-- Leave type cards grid -->
                    <div v-else class="row q-col-gutter-md">
                      <div
                        v-for="lb in empLeaveBalances"
                        :key="lb.leave_type_id"
                        class="col-12 col-sm-6 col-md-4"
                      >
                        <q-card
                          flat
                          bordered
                          :style="
                            lb.remaining_days <= 0
                              ? 'border-color: rgba(239,68,68,0.3)'
                              : lb.remaining_days < lb.total_entitlement * 0.3
                                ? 'border-color: rgba(251,191,36,0.4)'
                                : 'border-color: rgba(34,197,94,0.3)'
                          "
                        >
                          <q-card-section class="q-pa-md">
                            <!-- Leave type name + paid badge -->
                            <div class="row items-center q-mb-sm">
                              <q-icon
                                name="event_available"
                                :color="
                                  lb.remaining_days <= 0
                                    ? 'red-5'
                                    : lb.remaining_days < lb.total_entitlement * 0.3
                                      ? 'amber-7'
                                      : 'green-6'
                                "
                                size="18px"
                                class="q-mr-xs"
                              />
                              <div
                                :class="[
                                  'text-caption text-weight-bold col ellipsis',
                                  $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                                ]"
                              >
                                {{ lb.leave_type_name }}
                              </div>
                              <q-badge
                                :color="lb.is_paid ? 'green-7' : 'grey-6'"
                                :label="lb.is_paid ? 'Paid' : 'Unpaid'"
                                class="q-ml-xs"
                                style="font-size: 10px"
                              />
                            </div>

                            <!-- Stats row -->
                            <div class="row q-col-gutter-xs text-center q-mb-sm">
                              <div class="col-4">
                                <div
                                  style="font-size: 11px"
                                  :class="$q.dark.isActive ? 'text-grey-5' : 'text-grey-6'"
                                >
                                  Entitled
                                </div>
                                <div class="text-weight-bold text-caption text-blue-6">
                                  {{ lb.total_entitlement }}
                                </div>
                              </div>
                              <div class="col-4">
                                <div
                                  style="font-size: 11px"
                                  :class="$q.dark.isActive ? 'text-grey-5' : 'text-grey-6'"
                                >
                                  Used
                                </div>
                                <div class="text-weight-bold text-caption text-red-5">
                                  {{ lb.used_days }}
                                </div>
                              </div>
                              <div class="col-4">
                                <div
                                  style="font-size: 11px"
                                  :class="$q.dark.isActive ? 'text-grey-5' : 'text-grey-6'"
                                >
                                  Left
                                </div>
                                <div
                                  class="text-weight-bold text-caption"
                                  :class="lb.remaining_days <= 0 ? 'text-red-5' : 'text-green-6'"
                                >
                                  {{ lb.remaining_days }}
                                </div>
                              </div>
                            </div>

                            <!-- Progress bar -->
                            <q-linear-progress
                              :value="
                                lb.total_entitlement > 0 ? lb.used_days / lb.total_entitlement : 0
                              "
                              :color="
                                lb.remaining_days <= 0
                                  ? 'red-5'
                                  : lb.remaining_days < lb.total_entitlement * 0.3
                                    ? 'amber-7'
                                    : 'green-6'
                              "
                              track-color="grey-3"
                              size="6px"
                              rounded
                              class="q-mb-xs"
                            />

                            <!-- Pending -->
                            <div
                              v-if="lb.pending_days > 0"
                              class="text-caption text-amber-7"
                              style="font-size: 10px"
                            >
                              <q-icon name="hourglass_empty" size="10px" />
                              {{ lb.pending_days }} days pending approval
                            </div>
                          </q-card-section>
                        </q-card>
                      </div>
                    </div>

                    <!-- Summary totals -->
                    <div v-if="empLeaveBalances.length" class="row q-col-gutter-md q-mt-md">
                      <div class="col-12">
                        <q-card
                          flat
                          :style="
                            $q.dark.isActive
                              ? 'background: rgba(255,255,255,0.04)'
                              : 'background: rgba(0,0,0,0.03)'
                          "
                        >
                          <q-card-section
                            class="row q-pa-sm q-col-gutter-lg justify-around text-center"
                          >
                            <div>
                              <div
                                :class="[
                                  'text-caption',
                                  $q.dark.isActive ? 'text-grey-5' : 'text-grey-6',
                                ]"
                              >
                                Total Entitlement
                              </div>
                              <div class="text-subtitle2 text-weight-bold text-blue-6">
                                {{
                                  empLeaveBalances.reduce(
                                    (s, l) => s + Number(l.total_entitlement),
                                    0,
                                  )
                                }}
                                days
                              </div>
                            </div>
                            <div>
                              <div
                                :class="[
                                  'text-caption',
                                  $q.dark.isActive ? 'text-grey-5' : 'text-grey-6',
                                ]"
                              >
                                Total Used
                              </div>
                              <div class="text-subtitle2 text-weight-bold text-red-5">
                                {{ empLeaveBalances.reduce((s, l) => s + Number(l.used_days), 0) }}
                                days
                              </div>
                            </div>
                            <div>
                              <div
                                :class="[
                                  'text-caption',
                                  $q.dark.isActive ? 'text-grey-5' : 'text-grey-6',
                                ]"
                              >
                                Total Remaining
                              </div>
                              <div class="text-subtitle2 text-weight-bold text-green-6">
                                {{
                                  empLeaveBalances.reduce((s, l) => s + Number(l.remaining_days), 0)
                                }}
                                days
                              </div>
                            </div>
                            <div v-if="empLeaveBalances.some((l) => l.pending_days > 0)">
                              <div
                                :class="[
                                  'text-caption',
                                  $q.dark.isActive ? 'text-grey-5' : 'text-grey-6',
                                ]"
                              >
                                Pending
                              </div>
                              <div class="text-subtitle2 text-weight-bold text-amber-7">
                                {{
                                  empLeaveBalances.reduce((s, l) => s + Number(l.pending_days), 0)
                                }}
                                days
                              </div>
                            </div>
                          </q-card-section>
                        </q-card>
                      </div>
                    </div>
                  </q-tab-panel>

                  <!-- ══ ADVANCES TAB ═══════════════════════════════════════ -->

                  <q-tab-panel name="advances" class="q-pa-md">
                    <!-- Advances header -->
                    <div class="row items-center q-mb-md">
                      <div
                        :class="[
                          'text-subtitle1 text-weight-bold',
                          $q.dark.isActive ? 'text-grey-3' : 'text-grey-9',
                        ]"
                      >
                        Salary Advances
                      </div>
                      <q-space />
                      <q-btn
                        flat
                        round
                        dense
                        size="sm"
                        icon="refresh"
                        :loading="loadingAdvances"
                        color="amber-7"
                        class="q-mr-sm"
                        @click="loadEmpAdvances(viewEmp?.id)"
                      >
                        <q-tooltip>Refresh</q-tooltip>
                      </q-btn>
                      <q-btn
                        unelevated
                        size="sm"
                        no-caps
                        color="amber-8"
                        text-color="dark"
                        icon="add"
                        label="New Advance"
                        @click="showNewAdvance = true"
                      />
                    </div>

                    <div class="row q-col-gutter-lg q-mb-lg">
                      <div class="col-4">
                        <q-card
                          flat
                          style="
                            background: rgba(251, 191, 36, 0.07);
                            border: 1px solid rgba(251, 191, 36, 0.2);
                          "
                          class="q-pa-sm text-center"
                        >
                          <div
                            :class="[
                              'text-caption',
                              $q.dark.isActive ? 'text-grey-5' : 'text-grey-7',
                            ]"
                          >
                            Total Advanced
                          </div>
                          <div class="text-subtitle1 text-weight-bold text-amber">
                            LKR
                            {{ fmtAdv(empAdvances.reduce((s, a) => s + Number(a.amount || 0), 0)) }}
                          </div>
                        </q-card>
                      </div>
                      <div class="col-4">
                        <q-card
                          flat
                          style="
                            background: rgba(34, 197, 94, 0.07);
                            border: 1px solid rgba(34, 197, 94, 0.2);
                          "
                          class="q-pa-sm text-center"
                        >
                          <div
                            :class="[
                              'text-caption',
                              $q.dark.isActive ? 'text-grey-5' : 'text-grey-7',
                            ]"
                          >
                            Recovered
                          </div>
                          <div class="text-subtitle1 text-weight-bold text-green">
                            LKR
                            {{
                              fmtAdv(
                                empAdvances.reduce(
                                  (s, a) => s + Number(a.recovered_amount || 0),
                                  0,
                                ),
                              )
                            }}
                          </div>
                        </q-card>
                      </div>
                      <div class="col-4">
                        <q-card
                          flat
                          style="
                            background: rgba(239, 68, 68, 0.07);
                            border: 1px solid rgba(239, 68, 68, 0.2);
                          "
                          class="q-pa-sm text-center"
                        >
                          <div
                            :class="[
                              'text-caption',
                              $q.dark.isActive ? 'text-grey-5' : 'text-grey-7',
                            ]"
                          >
                            Outstanding
                          </div>
                          <div class="text-subtitle1 text-weight-bold text-red">
                            LKR
                            {{
                              fmtAdv(
                                empAdvances
                                  .filter((a) => a.status === 'active')
                                  .reduce((s, a) => s + Number(a.remaining_amount || 0), 0),
                              )
                            }}
                          </div>
                        </q-card>
                      </div>
                    </div>

                    <q-table
                      dark
                      flat
                      bordered
                      dense
                      :rows="empAdvances"
                      :columns="advanceColumns"
                      row-key="id"
                      :loading="loadingAdvances"
                      :pagination="{ rowsPerPage: 10 }"
                      class="bg-grey-9"
                    >
                      <template #body-cell-status="props">
                        <q-td :props="props">
                          <q-badge
                            :color="
                              props.row.status === 'active'
                                ? 'amber-8'
                                : props.row.status === 'fully_recovered'
                                  ? 'green'
                                  : 'red'
                            "
                            :label="props.row.status.replace(/_/g, ' ')"
                            class="text-capitalize"
                          />
                        </q-td>
                      </template>
                      <template #body-cell-actions="props">
                        <q-td :props="props">
                          <q-btn
                            v-if="props.row.status === 'active'"
                            flat
                            round
                            dense
                            icon="block"
                            color="negative"
                            size="xs"
                            @click="writeOffAdvance(props.row)"
                          >
                            <q-tooltip>Write Off Remaining Balance</q-tooltip>
                          </q-btn>
                        </q-td>
                      </template>
                    </q-table>

                    <div
                      v-if="!loadingAdvances && !empAdvances.length"
                      :class="[
                        'text-center q-pa-lg',
                        $q.dark.isActive ? 'text-grey-5' : 'text-grey-7',
                      ]"
                    >
                      No salary advances recorded for this employee.
                    </div>
                  </q-tab-panel>
                </q-tab-panels>
              </q-card>
            </div>
          </div>
        </q-scroll-area>
      </q-card>
    </q-dialog>

    <!-- ══ UPLOAD DOCUMENT DIALOG ══════════════════════════════════════════ -->
    <q-dialog v-model="showUploadDoc" persistent>
      <q-card style="min-width: 460px; background: #111827; color: #fff">
        <q-card-section class="row items-center">
          <q-icon name="upload_file" size="24px" color="amber-6" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">Upload Document</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section class="q-gutter-md">
          <q-select
            :dark="$q.dark.isActive"
            outlined
            v-model="uploadDocForm.doc_type"
            :options="docTypeOptions"
            label="Document Type *"
            emit-value
            map-options
          />
          <q-input
            :dark="$q.dark.isActive"
            outlined
            v-model="uploadDocForm.doc_name"
            label="Document Name / Label"
            hint="e.g. NIC Front Side, Contract 2025"
          />
          <q-file
            :dark="$q.dark.isActive"
            outlined
            v-model="uploadDocForm.file"
            label="Select File (PDF / Image)"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            max-file-size="10485760"
          >
            <template #prepend><q-icon name="attach_file" /></template>
          </q-file>
          <q-input
            :dark="$q.dark.isActive"
            outlined
            v-model="uploadDocForm.expiry_date"
            type="date"
            label="Expiry Date (optional)"
            stack-label
          />
          <q-input
            :dark="$q.dark.isActive"
            outlined
            v-model="uploadDocForm.notes"
            label="Notes"
            type="textarea"
            rows="2"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="amber-8"
            text-color="dark"
            icon="upload"
            label="Upload"
            no-caps
            :loading="uploadingDoc"
            @click="uploadDocument"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ DOCUMENT PREVIEW DIALOG ══════════════════════════════════════════ -->
    <q-dialog v-model="showDocPreview" maximized>
      <q-card
        style="
          background: #0f172a;
          color: #fff;
          display: flex;
          flex-direction: column;
          position: relative;
        "
      >
        <!-- Header -->
        <q-card-section
          class="row items-center q-py-sm q-px-md"
          style="background: #1e293b; flex-shrink: 0"
        >
          <q-icon name="description" color="amber-6" size="22px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold col ellipsis">
            {{ previewDocMeta?.doc_name || 'Document Preview' }}
          </div>
          <q-space />
          <q-btn
            v-if="previewUrl"
            unelevated
            color="amber-8"
            text-color="dark"
            icon="download"
            label="Download"
            size="sm"
            no-caps
            class="q-mr-sm"
            :href="previewUrl"
            target="_blank"
            type="a"
          />
          <q-btn flat round dense icon="close" color="grey-4" v-close-popup />
        </q-card-section>
        <q-separator dark />

        <!-- Unified loading/content overlay -->
        <div class="col" style="position: relative; overflow: hidden; min-height: 0">
          <!-- Spinner overlay — shown while fetching URL OR while content renders -->
          <div
            v-if="previewLoading || previewContentLoading"
            style="
              position: absolute;
              inset: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background: #0f172a;
              z-index: 10;
            "
          >
            <q-spinner-orbit color="amber" size="64px" />
            <div class="text-grey-4 q-mt-lg text-subtitle2">
              {{ previewLoading ? 'Preparing document…' : 'Rendering…' }}
            </div>
          </div>

          <!-- Error -->
          <div
            v-if="!previewLoading && previewError"
            class="column items-center justify-center q-pa-xl text-center"
            style="height: 100%"
          >
            <q-icon name="error_outline" color="red-4" size="64px" />
            <div class="text-grey-4 text-subtitle1 q-mt-md">{{ previewError }}</div>
            <q-btn
              unelevated
              color="amber-8"
              text-color="dark"
              label="Try Download Instead"
              icon="download"
              no-caps
              class="q-mt-lg"
              :href="previewUrl"
              target="_blank"
              type="a"
            />
          </div>

          <!-- Image preview -->
          <div
            v-if="!previewLoading && !previewError && previewIsImage && previewUrl"
            class="column items-center justify-center q-pa-md"
            style="height: 100%; overflow: auto"
          >
            <img
              :src="previewUrl"
              style="
                max-width: 100%;
                max-height: calc(100vh - 120px);
                object-fit: contain;
                border-radius: 8px;
              "
              alt="Document preview"
              @load="previewContentLoading = false"
              @error="
                () => {
                  previewContentLoading = false
                  previewError = 'Image could not be displayed. Try downloading.'
                }
              "
            />
          </div>

          <!-- PDF / iframe preview -->
          <iframe
            v-if="!previewLoading && !previewError && !previewIsImage && previewUrl"
            :src="previewUrl"
            style="border: none; width: 100%; height: 100%; display: block"
            @load="previewContentLoading = false"
          />
        </div>
      </q-card>
    </q-dialog>

    <!-- ══ NEW SALARY ADVANCE DIALOG ══════════════════════════════════════════ -->
    <q-dialog v-model="showNewAdvance" persistent>
      <q-card style="min-width: 480px; background: #111827; color: #fff">
        <q-card-section class="row items-center">
          <q-icon name="account_balance_wallet" size="24px" color="amber-6" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">New Salary Advance</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section class="q-gutter-md">
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <q-input
                :dark="$q.dark.isActive"
                outlined
                v-model.number="advanceForm.amount"
                label="Advance Amount (LKR) *"
                type="number"
                prefix="LKR"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                :dark="$q.dark.isActive"
                outlined
                v-model.number="advanceForm.installments"
                label="Recovery Installments *"
                type="number"
                hint="Number of months to recover"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                :dark="$q.dark.isActive"
                outlined
                v-model="advanceForm.advance_date"
                type="date"
                label="Advance Date"
                stack-label
              />
            </div>
            <div
              class="col-12 col-sm-6"
              v-if="advanceForm.amount > 0 && advanceForm.installments >= 1"
            >
              <q-card
                flat
                style="
                  background: rgba(251, 191, 36, 0.08);
                  border: 1px solid rgba(251, 191, 36, 0.25);
                "
                class="q-pa-sm"
              >
                <div :class="['text-caption', $q.dark.isActive ? 'text-grey-5' : 'text-grey-7']">
                  Monthly Deduction
                </div>
                <div class="text-subtitle1 text-weight-bold text-amber">
                  LKR {{ (advanceForm.amount / advanceForm.installments).toFixed(2) }}
                </div>
                <div :class="['text-caption', $q.dark.isActive ? 'text-grey-6' : 'text-grey-7']">
                  × {{ advanceForm.installments }} installment(s)
                </div>
              </q-card>
            </div>
            <div class="col-12">
              <q-input
                :dark="$q.dark.isActive"
                outlined
                v-model="advanceForm.reason"
                label="Reason"
                type="textarea"
                rows="2"
              />
            </div>
            <div class="col-12">
              <q-input
                :dark="$q.dark.isActive"
                outlined
                v-model="advanceForm.notes"
                label="Notes"
                type="textarea"
                rows="2"
              />
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="amber-8"
            text-color="dark"
            icon="save"
            label="Record Advance"
            no-caps
            :loading="savingAdvance"
            @click="addAdvance"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══════════ ADD DEDUCTION DIALOG ══════════ -->
    <q-dialog v-model="showDeductionDialog" persistent>
      <q-card
        class="full-width rounded-borders"
        style="max-width: 440px"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
      >
        <q-card-section class="row items-center">
          <q-icon name="remove_circle_outline" size="24px" color="red-5" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">Add Deduction</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator :dark="$q.dark.isActive" />
        <q-card-section class="q-gutter-sm">
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
              Deduction Type *
            </div>
            <q-select
              :dark="$q.dark.isActive"
              outlined
              dense
              v-model="deductionForm.deduction_type"
              :options="deductionTypeOptions"
              color="amber-8"
              placeholder="Select type"
            />
          </div>
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
              Amount (LKR) *
            </div>
            <q-input
              :dark="$q.dark.isActive"
              outlined
              dense
              v-model.number="deductionForm.amount"
              type="number"
              min="0"
              color="amber-8"
            />
          </div>
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
              Effective Date
            </div>
            <q-input
              :dark="$q.dark.isActive"
              outlined
              dense
              type="date"
              v-model="deductionForm.effective_date"
              color="amber-8"
            />
          </div>
          <div>
            <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
              Notes
            </div>
            <q-input
              :dark="$q.dark.isActive"
              outlined
              dense
              v-model="deductionForm.notes"
              type="textarea"
              rows="2"
              color="amber-8"
            />
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="red-6"
            text-color="white"
            icon="save"
            label="Save Deduction"
            no-caps
            :loading="savingDeduction"
            @click="saveDeduction"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══════════ ADD DESIGNATION DIALOG ══════════ -->
    <q-dialog v-model="showDesigDialog" persistent>
      <q-card
        class="full-width rounded-borders"
        style="max-width: 480px"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
      >
        <q-card-section class="row items-center">
          <q-icon name="badge" size="24px" color="amber-6" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">
            {{ editingDesig ? 'Edit Designation' : 'New Designation' }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator :dark="$q.dark.isActive" />
        <q-card-section class="q-gutter-md">
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Designation Title *
            </div>
            <q-input
              :dark="$q.dark.isActive"
              outlined
              dense
              v-model="desigForm.title"
              :rules="[r.req]"
              @keyup.enter="saveDesig"
            />
          </div>
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Department (optional)
            </div>
            <q-select
              :dark="$q.dark.isActive"
              outlined
              dense
              v-model="desigForm.department_id"
              :options="departmentOptions"
              emit-value
              map-options
              clearable
            />
          </div>
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Description
            </div>
            <q-input
              :dark="$q.dark.isActive"
              outlined
              dense
              v-model="desigForm.description"
              type="textarea"
              rows="3"
            />
          </div>
          <q-toggle
            :dark="$q.dark.isActive"
            v-model="desigForm.is_active"
            label="Active"
            color="primary"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            no-caps
            :label="editingDesig ? 'Update' : 'Create Designation'"
            color="amber-8"
            text-color="dark"
            :loading="savingDesig"
            @click="saveDesig"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══════════ ADD DEPARTMENT DIALOG ══════════ -->
    <q-dialog v-model="showDeptDialog" persistent>
      <q-card
        class="full-width rounded-borders"
        style="max-width: 480px"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
      >
        <q-card-section class="row items-center">
          <q-icon name="account_tree" size="24px" color="indigo" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">
            {{ editingDept ? 'Edit Department' : 'New Department' }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator :dark="$q.dark.isActive" />
        <q-card-section class="q-gutter-md">
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Department Name *
            </div>
            <q-input
              :dark="$q.dark.isActive"
              outlined
              dense
              v-model="deptForm.name"
              :rules="[r.req]"
              @keyup.enter="saveDept"
            />
          </div>
          <div>
            <div
              :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']"
            >
              Description
            </div>
            <q-input
              :dark="$q.dark.isActive"
              outlined
              dense
              v-model="deptForm.description"
              type="textarea"
              rows="3"
            />
          </div>
          <q-toggle
            :dark="$q.dark.isActive"
            v-model="deptForm.is_active"
            label="Active"
            color="indigo"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            no-caps
            :label="editingDept ? 'Update' : 'Create Department'"
            color="indigo"
            :loading="savingDept"
            @click="saveDept"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ ADD DROPDOWN OPTION DIALOG ════════════════════════════════════════ -->
    <q-dialog v-model="addOptDialog.show" persistent>
      <q-card
        style="min-width: 380px; border-radius: 12px; border: 1px solid rgba(99, 102, 241, 0.3)"
        :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
      >
        <q-card-section class="row items-center">
          <q-icon name="add_circle" size="24px" color="indigo-4" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">Add New Option</div>
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
        <q-separator :dark="$q.dark.isActive" />
        <q-card-section class="q-pt-md">
          <div :class="['text-caption q-mb-xs', $q.dark.isActive ? 'text-grey-4' : 'text-grey-9']">
            New Option Value
          </div>
          <q-input
            :dark="$q.dark.isActive"
            outlined
            dense
            autofocus
            v-model="addOptDialog.label"
            placeholder="e.g. Sales Manager"
            hint="This will be added to the dropdown list"
            @keyup.enter="confirmAddOption"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey" no-caps v-close-popup />
          <q-btn
            unelevated
            color="indigo"
            icon="add"
            label="Add Option"
            no-caps
            :disable="!addOptDialog.label.trim()"
            @click="confirmAddOption"
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
import { useAuthStore } from 'stores/auth'
import { validateFileSecurity, IMAGE_UPLOAD_OPTIONS, DOCUMENT_UPLOAD_OPTIONS } from 'src/utils/security'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as xlsx from 'xlsx'

const $q = useQuasar()
const authStore = useAuthStore()

const loading = ref(false)
const savingProfile = ref(false)
const employees = ref([])
const search = ref('')
const statusFilter = ref('All')
const deptFilter = ref('all')
const desigFilter = ref('all')
const showForm = ref(false)
const showDetail = ref(false)
const isEditing = ref(false)
const viewEmp = ref(null)
const viewEmpPhotoUrl = ref('')
const viewEmpSalary = ref(null)

const viewEmpTotalAllowance = computed(() => {
  if (!viewEmpSalary.value) return 0
  const s = viewEmpSalary.value
  return (
    Number(s.housing_allowance || 0) +
    Number(s.transport_allowance || 0) +
    Number(s.meal_allowance || 0) +
    Number(s.other_allowances || 0)
  )
})

const stats = ref({ total: 0, active: 0, probation: 0, contract: 0 })

async function compressToWebp(file, maxWidth = 400, quality = 0.80) {
  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width)
    width = maxWidth
  }
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/webp', quality })
}

async function uploadEmployeePhoto(empId, file) {
  try {
    const check = validateFileSecurity(file, IMAGE_UPLOAD_OPTIONS)
    if (!check.valid) {
      $q.notify({ type: 'negative', message: check.error || 'Invalid photo file' })
      return
    }
    // Compress to WebP before uploading to save storage & egress
    const blob = await compressToWebp(file)
    const path = `${empId}/photo.webp`
    const { error: uploadErr } = await supabase.storage
      .from('employee-photos')
      .upload(path, blob, { contentType: 'image/webp', upsert: true })
    if (uploadErr) throw uploadErr

    const { data: urlData } = supabase.storage.from('employee-photos').getPublicUrl(path)

    const photoUrl = urlData.publicUrl
    await supabase.from('employees').update({ photo_url: photoUrl }).eq('id', empId)
  } catch (err) {
    console.warn('[HR] Photo upload failed:', err.message)
    $q.notify({
      type: 'warning',
      message: 'Employee saved, but photo upload failed: ' + err.message,
    })
  }
}

const r = { req: (v) => (v !== null && v !== undefined && v !== '') || 'Required' }

const departmentOptions = ref([])
const designationOptions = ref([])
const saving = ref(false)

const salaryMethodOptions = [
  { label: 'Basic Salary', value: 'basic_salary' },
  { label: 'Day Salary', value: 'day_salary' },
  { label: 'Unit Salary', value: 'unit_salary' },
  { label: 'Commission (Sales)', value: 'commission_sales' },
  { label: 'Commission (Recovery)', value: 'commission_recovery' },
]

// ── Dynamic Dropdown Options (Add Employee form) ──────────────────────────────
const BASE_OPTIONS = {
  gender: ['Male', 'Female', 'Other'],
  title: ['Mr.', 'Mrs.', 'Miss', 'Rev.'],
  civil_status: ['Single', 'Married', 'Divorced', 'Widowed'],
  salary_type: ['Weekly', 'Monthly', 'Daily'],
  ot: ['Eligible', 'Not Eligible'],
  shift: ['Day Shift', 'Night Shift'],
  internal_company: ['SEVEN WAVES (PVT) LTD'],
  payment_type: ['Bank', 'Cash', 'Cheque'],
}

const dynOptions = reactive({
  gender: [],
  title: [],
  civil_status: [],
  salary_type: [],
  ot: [],
  shift: [],
  internal_company: [],
  payment_type: [],
  salary_method: [], // { label, value }[]
})

function getDynOptions(key) {
  return [...(BASE_OPTIONS[key] || []), ...(dynOptions[key] || [])]
}

function getDynSalaryMethods() {
  return [...salaryMethodOptions, ...dynOptions.salary_method]
}

function removeDynOption(key, val) {
  dynOptions[key] = dynOptions[key].filter((v) => v !== val)
  // clear form field if selected value was removed
  const fieldMap = { salary_type: 'pay_type', payment_type: 'pay_type' }
  const field = fieldMap[key] ?? key
  if (form[field] === val) form[field] = ''
}

function removeDynSalaryMethod(value) {
  dynOptions.salary_method = dynOptions.salary_method.filter((o) => o.value !== value)
  if (form.salary_method === value) form.salary_method = 'basic_salary'
}

const addOptDialog = reactive({ show: false, key: '', label: '' })

function openAddOption(key) {
  addOptDialog.key = key
  addOptDialog.label = ''
  addOptDialog.show = true
}

function confirmAddOption() {
  const label = addOptDialog.label.trim()
  if (!label) return
  const key = addOptDialog.key
  if (key === 'salary_method') {
    const value = label.toLowerCase().replace(/\s+/g, '_')
    if (!dynOptions.salary_method.some((o) => o.value === value)) {
      dynOptions.salary_method.push({ label, value })
      form.salary_method = value
    }
  } else {
    if (!getDynOptions(key).includes(label)) {
      dynOptions[key].push(label)
      // auto-select the newly added option
      const fieldMap = { salary_type: 'pay_type', payment_type: 'pay_type' }
      const field = fieldMap[key] ?? key
      form[field] = label
    }
  }
  addOptDialog.show = false
}

// ── Sri Lankan Banks ─────────────────────────────────────────────────
const SRI_LANKAN_BANKS = {
  'Bank of Ceylon': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Anuradhapura',
    'Jaffna',
    'Ratnapura',
    'Badulla',
    'Trincomalee',
    'Batticaloa',
    'Negombo',
    'Panadura',
    'Kalutara',
    'Gampaha',
    'Kegalle',
    'Polonnaruwa',
    'Hambantota',
    'Ampara',
    'Monaragala',
    'Nuwara Eliya',
    'Puttalam',
    'Chilaw',
    'Embilipitiya',
    'Hatton',
    'Bandarawela',
    'Kaduwela',
    'Horana',
    'Dehiwala',
    'Mount Lavinia',
    'Moratuwa',
    'Piliyandala',
    'Maharagama',
    'Kadawatha',
    'Wattala',
    'Ja-Ela',
    'Borella',
    'Pettah',
    'Fort',
    'Bambalapitiya',
    'Wellawatte',
    'Kollupitiya',
    'Nugegoda',
    'Kottawa',
    'Avissawella',
    'Matale',
    'Dambulla',
  ],
  "People's Bank": [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Anuradhapura',
    'Jaffna',
    'Ratnapura',
    'Badulla',
    'Trincomalee',
    'Batticaloa',
    'Negombo',
    'Panadura',
    'Kalutara',
    'Gampaha',
    'Kegalle',
    'Polonnaruwa',
    'Hambantota',
    'Ampara',
    'Monaragala',
    'Nuwara Eliya',
    'Puttalam',
    'Chilaw',
    'Embilipitiya',
    'Hatton',
    'Bandarawela',
    'Kaduwela',
    'Horana',
    'Dehiwala',
    'Moratuwa',
    'Piliyandala',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Pettah',
    'Borella',
    'Wellawatte',
    'Kottawa',
    'Kadawatha',
    'Wattala',
    'Matale',
    'Dambulla',
  ],
  'Commercial Bank of Ceylon': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Anuradhapura',
    'Jaffna',
    'Ratnapura',
    'Badulla',
    'Negombo',
    'Panadura',
    'Kalutara',
    'Gampaha',
    'Kegalle',
    'Hambantota',
    'Nuwara Eliya',
    'Puttalam',
    'Chilaw',
    'Hatton',
    'Bandarawela',
    'Kaduwela',
    'Dehiwala',
    'Moratuwa',
    'Piliyandala',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Pettah',
    'Borella',
    'Wellawatte',
    'Kollupitiya',
    'Bambalapitiya',
    'Kottawa',
    'Wattala',
    'Ja-Ela',
    'Matale',
    'Dambulla',
    'Embilipitiya',
  ],
  'Hatton National Bank (HNB)': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Anuradhapura',
    'Jaffna',
    'Ratnapura',
    'Badulla',
    'Negombo',
    'Panadura',
    'Kalutara',
    'Gampaha',
    'Kegalle',
    'Hambantota',
    'Nuwara Eliya',
    'Puttalam',
    'Hatton',
    'Bandarawela',
    'Kaduwela',
    'Dehiwala',
    'Moratuwa',
    'Piliyandala',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Borella',
    'Wellawatte',
    'Kollupitiya',
    'Kottawa',
    'Wattala',
    'Matale',
  ],
  'Sampath Bank': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Anuradhapura',
    'Jaffna',
    'Ratnapura',
    'Badulla',
    'Negombo',
    'Panadura',
    'Kalutara',
    'Gampaha',
    'Kegalle',
    'Hambantota',
    'Nuwara Eliya',
    'Puttalam',
    'Kaduwela',
    'Dehiwala',
    'Moratuwa',
    'Piliyandala',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Borella',
    'Wellawatte',
    'Kottawa',
    'Wattala',
    'Matale',
    'Chilaw',
  ],
  'Seylan Bank': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Anuradhapura',
    'Jaffna',
    'Ratnapura',
    'Badulla',
    'Negombo',
    'Panadura',
    'Kalutara',
    'Gampaha',
    'Kegalle',
    'Hambantota',
    'Nuwara Eliya',
    'Kaduwela',
    'Dehiwala',
    'Moratuwa',
    'Piliyandala',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Borella',
    'Wellawatte',
    'Kottawa',
    'Wattala',
    'Matale',
  ],
  'National Savings Bank (NSB)': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Anuradhapura',
    'Jaffna',
    'Ratnapura',
    'Badulla',
    'Negombo',
    'Panadura',
    'Kalutara',
    'Gampaha',
    'Kegalle',
    'Polonnaruwa',
    'Hambantota',
    'Ampara',
    'Monaragala',
    'Nuwara Eliya',
    'Puttalam',
    'Chilaw',
    'Hatton',
    'Bandarawela',
    'Dehiwala',
    'Moratuwa',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Borella',
    'Kottawa',
    'Matale',
  ],
  'Nations Trust Bank (NTB)': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Negombo',
    'Gampaha',
    'Kaduwela',
    'Dehiwala',
    'Moratuwa',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Borella',
    'Wellawatte',
    'Kottawa',
    'Wattala',
  ],
  'DFCC Bank': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Negombo',
    'Gampaha',
    'Kaduwela',
    'Dehiwala',
    'Moratuwa',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Borella',
    'Kottawa',
    'Wattala',
  ],
  'Pan Asia Banking Corporation (PABC)': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Kurunegala',
    'Negombo',
    'Gampaha',
    'Dehiwala',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Borella',
    'Kottawa',
    'Wattala',
  ],
  'Union Bank': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Kurunegala',
    'Negombo',
    'Dehiwala',
    'Nugegoda',
    'Fort',
    'Borella',
    'Kottawa',
  ],
  'Amana Bank': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Kurunegala',
    'Negombo',
    'Kattankudy',
    'Akurana',
    'Dehiwala',
    'Fort',
    'Pettah',
  ],
  'National Development Bank (NDB)': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Negombo',
    'Gampaha',
    'Kaduwela',
    'Dehiwala',
    'Moratuwa',
    'Maharagama',
    'Nugegoda',
    'Fort',
    'Borella',
    'Kottawa',
    'Wattala',
  ],
  'Cargills Bank': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Kurunegala',
    'Negombo',
    'Maharagama',
    'Fort',
    'Borella',
    'Mawathagama',
    'Old Moor Street',
  ],
  'Regional Development Bank (RDB/Sanasa)': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Anuradhapura',
    'Ratnapura',
    'Badulla',
    'Kegalle',
    'Polonnaruwa',
    'Hambantota',
    'Ampara',
    'Monaragala',
    'Nuwara Eliya',
    'Puttalam',
  ],
  'Housing Development Finance Corporation (HDFC)': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Anuradhapura',
    'Ratnapura',
    'Badulla',
    'Negombo',
    'Gampaha',
  ],
  'State Mortgage & Investment Bank (SMIB)': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Kurunegala',
    'Anuradhapura',
    'Ratnapura',
    'Negombo',
  ],
  'Lanka Orix Finance (LOLC)': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Matara',
    'Kurunegala',
    'Negombo',
    'Gampaha',
    'Dehiwala',
    'Maharagama',
  ],
  'Sanasa Development Bank': [
    'Head Office - Colombo',
    'Kandy',
    'Galle',
    'Kurunegala',
    'Anuradhapura',
    'Ratnapura',
    'Badulla',
    'Kegalle',
    'Matale',
  ],
}

const bankOptions = Object.keys(SRI_LANKAN_BANKS).map((b) => ({ label: b, value: b }))
const bankFilteredOptions = ref([...bankOptions])
const bankFilteredOptionsView = ref([...bankOptions])

function filterBanks(val, update) {
  update(() => {
    const q = (val || '').toLowerCase()
    bankFilteredOptions.value = q
      ? bankOptions.filter((b) => b.label.toLowerCase().includes(q))
      : [...bankOptions]
  })
}

function filterBanksView(val, update) {
  update(() => {
    const q = (val || '').toLowerCase()
    bankFilteredOptionsView.value = q
      ? bankOptions.filter((b) => b.label.toLowerCase().includes(q))
      : [...bankOptions]
  })
}

function getBranchOptions(bankName) {
  if (!bankName || !SRI_LANKAN_BANKS[bankName]) return []
  return SRI_LANKAN_BANKS[bankName].map((b) => ({ label: b, value: b }))
}

function filterBranches(val, update) {
  update(() => {
    // The options are already computed by getBranchOptions
    // The q-select's use-input handles the visual filtering
  })
}

function onBankChange(formObj) {
  // Clear branch when bank changes
  formObj.bank_branch = ''
}

const defaultForm = {
  id: null,
  employee_code: '',
  first_name: '',
  last_name: '',
  address_line1: '',
  nic_number: '',
  date_of_birth: '',
  user_pic: null,
  gender: 'Male',
  title: 'Mr.',
  civil_status: 'Married',
  mobile: '',
  email: '',
  hire_date: new Date().toISOString().split('T')[0],
  designation_id: null,
  salary: '', // Basic Salary (kept for display in profile)
  pay_type: 'Monthly',
  ot: 'Eligible',
  shift: null,
  probation_period: '',
  epf_no: '',
  epf_amount: '',
  welfare_amount: '',
  internal_company: 'SEVEN WAVES (PVT) LTD',
  epf_etf_eligible: false,
  morning_ot: false,
  late_deduct: false,
  no_pay_deduct: false,
  etf_allowed: false,
  name_with_initials: '',
  nationality: 'Sri Lankan',
  passport_no: '',
  driving_license_no: '',
  residence_phone: '',
  address_line2: '',
  address_line3: '',
  road_map: '',
  department_id: null,
  employment_status: 'probation',
  education_level: null,
  ol_results: '',
  al_results: '',
  is_graduate: false,
  welfare_active: false,
  bank_name: '',
  bank_branch: '',
  bank_code: '',
  bank_account_name: '',
  bank_account_number: '',
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_phone: '',
  // ── Salary Structure fields ───────────────────────────────────────
  salary_method: 'basic_salary',
  basic_salary: 0,
  hourly_rate: 0,
  day_rate: 0,
  unit_rate: 0,
  housing_allowance: 0,
  transport_allowance: 0,
  meal_allowance: 0,
  overtime_rate_multiplier: 1.5,
  holiday_ot_multiplier: 2.0,
  epf_employee_pct: 8,
}

const form = reactive({ ...defaultForm })

// ── Custom extra allowances (dynamic) ────────────────────────────────────────
const extraAllowances = ref([])
function addExtraAllowance() {
  extraAllowances.value.push({ label: '', amount: 0 })
}

// ── EPF auto-calculation (Add Form) ──────────────────────────────────────────
// Formula: (basic_salary / 26) * 26 * EPF% = basic_salary * EPF%
// Simplified: full-month EPF = basic_salary × epf_employee_pct%
function recalcEpf(basicSalary, pct) {
  if (!basicSalary || !pct || isNaN(basicSalary) || isNaN(pct)) {
    return '0.00'
  }
  return ((Number(basicSalary) * Number(pct)) / 100).toFixed(2)
}

watch(
  () => [form.basic_salary, form.epf_employee_pct, form.epf_etf_eligible],
  ([basic, pct, eligible]) => {
    if (eligible) {
      form.epf_amount = recalcEpf(basic, pct || 8)
    }
  },
  { immediate: true },
)

// ── OT Hourly Rate auto-calculation ──────────────────────────────────────────
// Formula: hourly_rate = basic_salary / 26 / 8
// OT Rate  = hourly_rate × overtime_rate_multiplier
watch(
  () => form.basic_salary,
  (basic) => {
    if (basic && !isNaN(basic) && Number(basic) > 0) {
      form.hourly_rate = Number((Number(basic) / 26 / 8).toFixed(2))
    } else {
      form.hourly_rate = 0
    }
  },
  { immediate: true },
)

const otRateDisplay = computed(() => {
  const h = Number(form.hourly_rate) || 0
  const m = Number(form.overtime_rate_multiplier) || 1.5
  return (h * m).toFixed(2)
})

const columns = [
  { name: 'view_id', label: 'EMP_CODE', align: 'left', field: 'employee_code', sortable: true },
  { name: 'name', label: 'FULL NAME', align: 'left', field: 'first_name', sortable: true },
  { name: 'epf_no', label: 'EPF_NO', align: 'left', field: 'epf_no', sortable: true },
  { name: 'nic_number', label: 'NIC_NO', align: 'left', field: 'nic_number', sortable: true },
  {
    name: 'hire_date',
    label: 'JOIN DATE',
    align: 'left',
    field: (r) => (r.hire_date ? String(r.hire_date).slice(0, 10) : '—'),
    sortable: true,
  },
  {
    name: 'basic_salary',
    label: 'BASIC SALARY',
    align: 'right',
    field: (r) => {
      const ss = Array.isArray(r.salary_structures)
        ? r.salary_structures.find((s) => s.is_current) || r.salary_structures[0]
        : r.salary_structures
      return ss?.basic_salary ? `LKR ${Number(ss.basic_salary).toLocaleString()}` : '—'
    },
    sortable: true,
  },
  {
    name: 'designation',
    label: 'DESIGNATION',
    align: 'left',
    field: (r) => r.designations?.title || '—',
    sortable: true,
  },
  {
    name: 'department',
    label: 'DEPARTMENT',
    align: 'left',
    field: (r) => r.departments?.name || '—',
    sortable: true,
  },
  { name: 'actions', label: 'Actions', align: 'center' },
]

const viewTab = ref('settings')
const viewEmpSystemApp = ref(false)

// ── Add-Employee inline document entries ──────────────────────────────────────
const FORM_DOC_TYPES = [
  { key: 'nic_front', label: 'NIC Front' },
  { key: 'nic_back', label: 'NIC Back' },
  { key: 'photo', label: 'Photograph' },
  { key: 'birth_certificate', label: 'Birth Certificate' },
  { key: 'contract_letter', label: 'Contract Letter' },
  { key: 'gs_letter', label: 'GS Letter' },
  { key: 'police_report', label: 'Police Report' },
  { key: 'driving_license', label: 'Driving License' },
  { key: 'cv', label: 'CV / Resume' },
  { key: 'educational_cert', label: 'Educational Certificate' },
  { key: 'experience_letter', label: 'Experience Letter' },
  { key: 'bank_statement', label: 'Bank Statement' },
]

function makeFormDocEntries() {
  return FORM_DOC_TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    enabled: false,
    doc_name: '',
    file: null,
  }))
}

const formDocEntries = reactive(makeFormDocEntries())
const customDocEntry = reactive({ doc_name: '', file: null })
const extraDocEntries = ref([])

function addCustomDocEntry() {
  if (!customDocEntry.doc_name || !customDocEntry.file) return
  extraDocEntries.value.push({ doc_name: customDocEntry.doc_name, file: customDocEntry.file })
  customDocEntry.doc_name = ''
  customDocEntry.file = null
}

async function uploadFormDocuments(empId) {
  const toUpload = [
    ...Array.from(formDocEntries)
      .filter((e) => e.enabled && e.file)
      .map((e) => ({ doc_type: e.key, doc_name: e.doc_name || e.label, file: e.file })),
    ...extraDocEntries.value.map((e) => ({
      doc_type: 'other',
      doc_name: e.doc_name,
      file: e.file,
    })),
  ]
  if (!toUpload.length) return
  const errors = []
  const companyId =
    authStore.currentBranch?.company_id ||
    authStore.profile?.company_id ||
    form.company_id

  for (const entry of toUpload) {
    try {
      const isImage = entry.file.type.startsWith('image/')
      const check = validateFileSecurity(entry.file, isImage ? IMAGE_UPLOAD_OPTIONS : DOCUMENT_UPLOAD_OPTIONS)
      if (!check.valid) {
        errors.push(`${entry.doc_name}: ${check.error}`)
        continue
      }
      let fileToUpload = entry.file
      let pathExt = entry.file.name.split('.').pop()
      let mimeType = entry.file.type
      let fileSize = entry.file.size

      if (isImage) {
        fileToUpload = await compressToWebp(entry.file)
        pathExt = 'webp'
        mimeType = 'image/webp'
        fileSize = fileToUpload.size
      }

      const path = `${empId}/${entry.doc_type}_${Date.now()}_${Math.random().toString(36).slice(2)}.${pathExt}`
      const { error: uploadErr } = await supabase.storage
        .from('employee-documents')
        .upload(path, fileToUpload, { contentType: mimeType, upsert: true })
      if (uploadErr) throw uploadErr
      const { error: dbErr } = await supabase.from('employee_documents').insert({
        company_id: companyId,
        employee_id: empId,
        doc_type: entry.doc_type,
        doc_name: entry.doc_name,
        file_path: path,
        file_size: fileSize,
        mime_type: mimeType,
      })
      if (dbErr) throw dbErr
    } catch (err) {
      errors.push(`${entry.doc_name}: ${err.message}`)
    }
  }
  if (errors.length) {
    $q.notify({ type: 'warning', message: 'Some documents failed to upload: ' + errors.join(', ') })
  } else if (toUpload.length > 0) {
    $q.notify({ type: 'positive', message: `${toUpload.length} document(s) uploaded successfully` })
  }
}

// ── Documents ─────────────────────────────────────────────────────────────────
const empDocuments = ref([])
const loadingDocs = ref(false)
const showUploadDoc = ref(false)
const uploadingDoc = ref(false)

const uploadDocForm = reactive({
  doc_type: null,
  doc_name: '',
  file: null,
  expiry_date: '',
  notes: '',
})

// ── All known doc type metadata ────────────────────────────────────────────────
const DOC_TYPE_META = {
  nic_front: { label: 'NIC Front', icon: 'badge', color: 'cyan' },
  nic_back: { label: 'NIC Back', icon: 'badge', color: 'cyan' },
  photo: { label: 'Photograph', icon: 'photo_camera', color: 'amber' },
  contract_letter: { label: 'Contract Letter', icon: 'description', color: 'green' },
  gs_letter: { label: 'GS Letter', icon: 'article', color: 'indigo' },
  birth_certificate: { label: 'Birth Certificate', icon: 'child_care', color: 'purple' },
  police_report: { label: 'Police Report', icon: 'local_police', color: 'blue' },
  driving_license: { label: 'Driving License', icon: 'drive_eta', color: 'teal' },
  passport: { label: 'Passport', icon: 'travel_explore', color: 'blue' },
  educational_cert: { label: 'Educational Cert', icon: 'school', color: 'orange' },
  experience_letter: { label: 'Experience Letter', icon: 'work', color: 'brown' },
  bank_statement: { label: 'Bank Statement', icon: 'account_balance', color: 'green' },
  cv: { label: 'CV / Resume', icon: 'person_pin', color: 'deep-purple' },
  other: { label: 'Other', icon: 'folder', color: 'grey' },
}

// Base types always shown; plus any types existing in employee's actual docs
const BASE_DOC_TYPES = [
  'nic_front',
  'nic_back',
  'photo',
  'contract_letter',
  'gs_letter',
  'birth_certificate',
]

const docTypeGroups = computed(() => {
  const existing = new Set(empDocuments.value.map((d) => d.doc_type))
  const allKeys = [...new Set([...BASE_DOC_TYPES, ...existing])]
  return allKeys.map((key) => ({
    key,
    ...(DOC_TYPE_META[key] || { label: key, icon: 'folder', color: 'grey' }),
  }))
})

const docTypeOptions = [
  { label: 'NIC Front', value: 'nic_front' },
  { label: 'NIC Back', value: 'nic_back' },
  { label: 'Photograph', value: 'photo' },
  { label: 'Contract Letter', value: 'contract_letter' },
  { label: 'GS Letter', value: 'gs_letter' },
  { label: 'Police Report', value: 'police_report' },
  { label: 'Driving License', value: 'driving_license' },
  { label: 'Passport', value: 'passport' },
  { label: 'Birth Certificate', value: 'birth_certificate' },
  { label: 'CV / Resume', value: 'cv' },
  { label: 'Educational Cert', value: 'educational_cert' },
  { label: 'Experience Letter', value: 'experience_letter' },
  { label: 'Bank Statement', value: 'bank_statement' },
  { label: 'Other', value: 'other' },
]

const empDocsByType = computed(() => {
  const map = {}
  for (const d of empDocuments.value) {
    if (!map[d.doc_type]) map[d.doc_type] = []
    map[d.doc_type].push(d)
  }
  return map
})

async function loadEmpDocuments(empId) {
  loadingDocs.value = true
  try {
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', empId)
      .order('created_at', { ascending: false })
    if (error) throw error
    empDocuments.value = data || []
    // Pre-fetch signed URLs in background for instant preview
    prefetchDocUrls(data || [])
  } catch (err) {
    console.error('[HR-Docs] Failed to load:', err.message)
  } finally {
    loadingDocs.value = false
  }
}

// ── Document Preview & Delete ──────────────────────────────────────────────────
const showDocPreview = ref(false)
const previewUrl = ref('')
const previewIsImage = ref(false)
const previewLoading = ref(false)
const previewContentLoading = ref(false)
const previewError = ref('')
const previewDocMeta = ref(null)
const previewDocId = ref(null)

// Signed URL cache: { [doc.id]: signedUrl }
const docSignedUrls = ref({})

// Pre-fetch signed URLs for all docs in background (1-hr expiry)
async function prefetchDocUrls(docs) {
  if (!docs?.length) return
  const pending = docs.filter((d) => !docSignedUrls.value[d.id])
  if (!pending.length) return
  await Promise.all(
    pending.map(async (doc) => {
      try {
        const { data } = await supabase.storage
          .from('employee-documents')
          .createSignedUrl(doc.file_path, 3600)
        if (data?.signedUrl) docSignedUrls.value[doc.id] = data.signedUrl
      } catch {
        /* silent */
      }
    }),
  )
}

async function previewDoc(doc) {
  previewDocId.value = doc.id
  previewDocMeta.value = doc
  previewError.value = ''
  previewIsImage.value = (doc.mime_type || '').startsWith('image')
  previewContentLoading.value = true // keep spinner until img/iframe @load
  showDocPreview.value = true

  // Use cached URL immediately if available
  if (docSignedUrls.value[doc.id]) {
    previewUrl.value = docSignedUrls.value[doc.id]
    previewLoading.value = false
    previewDocId.value = null
    return
  }

  // Otherwise fetch now
  previewLoading.value = true
  previewUrl.value = ''
  try {
    const { data, error } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(doc.file_path, 3600)
    if (error) throw error
    docSignedUrls.value[doc.id] = data.signedUrl
    previewUrl.value = data.signedUrl
  } catch (err) {
    previewError.value = 'Could not load document: ' + err.message
    previewContentLoading.value = false
  } finally {
    previewLoading.value = false
    previewDocId.value = null
  }
}

function confirmDeleteDoc(doc) {
  $q.dialog({
    title: 'Delete Document',
    message: `Delete "${doc.doc_name || 'this document'}"? This cannot be undone.`,
    ok: { label: 'Delete', color: 'negative', unelevated: true },
    cancel: { label: 'Cancel', flat: true, color: 'grey' },
    persistent: true,
  }).onOk(() => deleteDoc(doc))
}

async function deleteDoc(doc) {
  try {
    // 1. Remove from storage
    const { error: storageErr } = await supabase.storage
      .from('employee-documents')
      .remove([doc.file_path])
    if (storageErr) throw storageErr

    // 2. Remove DB record
    const { error: dbErr } = await supabase.from('employee_documents').delete().eq('id', doc.id)
    if (dbErr) throw dbErr

    // 3. Update local list
    empDocuments.value = empDocuments.value.filter((d) => d.id !== doc.id)
    $q.notify({ type: 'positive', message: 'Document deleted' })
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Delete failed: ' + err.message })
  }
}

async function downloadDoc(doc) {
  try {
    let url = docSignedUrls.value[doc.id]
    if (!url) {
      const { data, error } = await supabase.storage
        .from('employee-documents')
        .createSignedUrl(doc.file_path, 3600)
      if (error) throw error
      url = data.signedUrl
      docSignedUrls.value[doc.id] = url
    }

    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    const fileName = doc.doc_name || doc.file_path?.split('/').pop() || 'document'
    const ext = doc.file_path?.split('.').pop() || 'file'
    a.download = fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)

    $q.notify({ type: 'positive', message: 'Downloading document...' })
  } catch (err) {
    console.error('Download failed:', err)
    $q.notify({ type: 'negative', message: 'Download failed: ' + err.message })
  }
}

function openUploadDoc(docTypeKey = null) {
  Object.assign(uploadDocForm, {
    doc_type: typeof docTypeKey === 'string' ? docTypeKey : null,
    doc_name: '',
    file: null,
    expiry_date: '',
    notes: '',
  })
  showUploadDoc.value = true
}

async function uploadDocument() {
  if (!uploadDocForm.doc_type || !uploadDocForm.file) {
    $q.notify({ type: 'warning', message: 'Document type and file are required' })
    return
  }
  uploadingDoc.value = true
  try {
    const empId = viewEmp.value?.id
    if (!empId) throw new Error('Employee ID is missing')

    const file = uploadDocForm.file
    const check = validateFileSecurity(file, DOCUMENT_UPLOAD_OPTIONS)
    if (!check.valid) {
      $q.notify({ type: 'negative', message: check.error || 'Invalid document file' })
      return
    }
    const ext = file.name.split('.').pop()
    const path = `${empId}/${uploadDocForm.doc_type}_${Date.now()}.${ext}`

    const companyId =
      authStore.currentBranch?.company_id ||
      viewEmp.value?.company_id ||
      authStore.profile?.company_id

    if (!companyId) throw new Error('Company ID is missing')

    const { error: uploadErr } = await supabase.storage
      .from('employee-documents')
      .upload(path, file, { contentType: file.type, upsert: true })
    if (uploadErr) throw uploadErr

    const { error: dbErr } = await supabase.from('employee_documents').insert({
      company_id: companyId,
      employee_id: empId,
      doc_type: uploadDocForm.doc_type,
      doc_name: uploadDocForm.doc_name || file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
      expiry_date: uploadDocForm.expiry_date || null,
      notes: uploadDocForm.notes || null,
    })
    if (dbErr) throw dbErr

    $q.notify({ type: 'positive', message: 'Document uploaded successfully' })
    showUploadDoc.value = false
    loadEmpDocuments(empId)
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Upload failed: ' + err.message })
  } finally {
    uploadingDoc.value = false
  }
}

// ── Leave Balances (per-employee, in View Profile) ────────────────────────────
const empLeaveBalances = ref([])
const loadingLeave = ref(false)

// ── Salary Advances ────────────────────────────────────────────────────────────
const empAdvances = ref([])
const loadingAdvances = ref(false)
const showNewAdvance = ref(false)
const savingAdvance = ref(false)

const advanceForm = reactive({
  amount: 0,
  installments: 1,
  reason: '',
  advance_date: new Date().toISOString().split('T')[0],
  notes: '',
})

const fmtAdv = (v) => Number(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })

const advanceColumns = [
  { name: 'advance_date', label: 'Date', align: 'left', field: 'advance_date' },
  {
    name: 'amount',
    label: 'Amount (LKR)',
    align: 'right',
    field: 'amount',
    format: (v) => fmtAdv(v),
  },
  { name: 'installments', label: 'Installments', align: 'center', field: 'installments' },
  {
    name: 'per_installment',
    label: 'Per Month',
    align: 'right',
    field: 'amount_per_installment',
    format: (v) => fmtAdv(v),
  },
  {
    name: 'recovered',
    label: 'Recovered',
    align: 'right',
    field: 'recovered_amount',
    format: (v) => fmtAdv(v),
  },
  {
    name: 'remaining',
    label: 'Remaining',
    align: 'right',
    field: 'remaining_amount',
    format: (v) => fmtAdv(v),
  },
  { name: 'status', label: 'Status', align: 'center', field: 'status' },
  { name: 'reason', label: 'Reason', align: 'left', field: 'reason' },
  { name: 'actions', label: '', align: 'center', field: 'actions' },
]

async function loadEmpLeaveBalances(empId) {
  loadingLeave.value = true
  try {
    const { data, error } = await supabase.rpc('get_employee_leave_summary', {
      p_employee_id: empId,
    })
    if (error) throw error
    empLeaveBalances.value = data || []
  } catch (err) {
    console.error('[HR-Leave] Failed to load leave summary:', err.message)
    empLeaveBalances.value = []
  } finally {
    loadingLeave.value = false
  }
}

async function loadEmpAdvances(empId) {
  loadingAdvances.value = true
  try {
    const { data, error } = await supabase
      .from('salary_advances')
      .select('*')
      .eq('employee_id', empId)
      .order('advance_date', { ascending: false })
    if (error) throw error
    empAdvances.value = data || []
  } catch (err) {
    console.error('[HR-Advances] Failed to load:', err.message)
    empAdvances.value = []
  } finally {
    loadingAdvances.value = false
  }
}

async function addAdvance() {
  if (!advanceForm.amount || advanceForm.amount <= 0) {
    $q.notify({ type: 'warning', message: 'Enter a valid advance amount' })
    return
  }
  if (!advanceForm.installments || advanceForm.installments < 1) {
    $q.notify({ type: 'warning', message: 'Installments must be at least 1' })
    return
  }
  savingAdvance.value = true
  try {
    const { error } = await supabase.from('salary_advances').insert({
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
      employee_id: viewEmp.value?.id,
      amount: advanceForm.amount,
      installments: advanceForm.installments,
      reason: advanceForm.reason || null,
      advance_date: advanceForm.advance_date,
      notes: advanceForm.notes || null,
      approved_by: authStore.user?.id,
      approved_at: new Date().toISOString(),
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Salary advance recorded successfully' })
    showNewAdvance.value = false
    loadEmpAdvances(viewEmp.value?.id)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    savingAdvance.value = false
  }
}

async function writeOffAdvance(advance) {
  $q.dialog({
    title: 'Write Off Advance',
    message: `Write off remaining LKR ${Number(advance.remaining_amount).toFixed(2)} for this advance? This cannot be undone.`,
    cancel: true,
    persistent: true,
    dark: true,
  }).onOk(async () => {
    try {
      const { error } = await supabase
        .from('salary_advances')
        .update({ status: 'written_off' })
        .eq('id', advance.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Advance written off' })
      loadEmpAdvances(viewEmp.value?.id)
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

// ── Employee Deductions ────────────────────────────────────────────────────────
const empDeductions = ref([])
const loadingDeductions = ref(false)
const showDeductionDialog = ref(false)
const savingDeduction = ref(false)
const deductionForm = reactive({
  deduction_type: '',
  amount: 0,
  notes: '',
  effective_date: new Date().toISOString().split('T')[0],
})

const deductionTypeOptions = [
  'Loan Recovery',
  'Advance Recovery',
  'Damage',
  'Absence',
  'Other',
]

async function loadEmpDeductions(empId) {
  if (!empId) return
  loadingDeductions.value = true
  try {
    const { data, error } = await supabase
      .from('employee_deductions')
      .select('*')
      .eq('employee_id', empId)
      .order('effective_date', { ascending: false })
    if (error) throw error
    empDeductions.value = data || []
  } catch (err) {
    console.error('Failed to load deductions:', err)
    empDeductions.value = []
  } finally {
    loadingDeductions.value = false
  }
}

async function saveDeduction() {
  if (!deductionForm.deduction_type) {
    $q.notify({ type: 'warning', message: 'Please select a deduction type' })
    return
  }
  if (!deductionForm.amount || Number(deductionForm.amount) <= 0) {
    $q.notify({ type: 'warning', message: 'Please enter a valid amount' })
    return
  }
  savingDeduction.value = true
  try {
    const { error } = await supabase.from('employee_deductions').insert({
      employee_id: viewEmp.value?.id,
      deduction_type: deductionForm.deduction_type,
      amount: Number(deductionForm.amount),
      notes: deductionForm.notes || null,
      effective_date: deductionForm.effective_date,
      branch_id: authStore.currentBranch?.id,
      company_id: authStore.currentBranch?.company_id,
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Deduction added successfully' })
    showDeductionDialog.value = false
    Object.assign(deductionForm, {
      deduction_type: '',
      amount: 0,
      notes: '',
      effective_date: new Date().toISOString().split('T')[0],
    })
    loadEmpDeductions(viewEmp.value?.id)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to save deduction' })
  } finally {
    savingDeduction.value = false
  }
}

// ── Employee Officer Areas ─────────────────────────────────────────────────────
const empAreas = ref([])
const loadingAreas = ref(false)
const savingArea = ref(false)
const newAreaName = ref('')
const newAreaCode = ref('')

async function loadEmpAreas(empId) {
  if (!empId) return
  loadingAreas.value = true
  try {
    const { data, error } = await supabase
      .from('employee_areas')
      .select('*')
      .eq('employee_id', empId)
      .order('created_at')
    if (error) throw error
    empAreas.value = data || []
  } catch (err) {
    console.error('Failed to load officer areas:', err)
    empAreas.value = []
  } finally {
    loadingAreas.value = false
  }
}

async function addOfficerArea() {
  if (!newAreaName.value.trim()) {
    $q.notify({ type: 'warning', message: 'Please enter an area name' })
    return
  }
  empAreas.value.push({
    id: null,
    area_name: newAreaName.value.trim(),
    area_code: newAreaCode.value.trim() || null,
    is_primary: empAreas.value.length === 0,
  })
  newAreaName.value = ''
  newAreaCode.value = ''
}

async function saveOfficerAreas() {
  const empId = viewEmp.value?.id
  if (!empId) return
  savingArea.value = true
  try {
    // Delete existing and re-insert for simplicity
    await supabase.from('employee_areas').delete().eq('employee_id', empId)
    const rows = empAreas.value.map((a) => ({
      employee_id: empId,
      area_name: a.area_name,
      area_code: a.area_code || null,
      is_primary: a.is_primary || false,
    }))
    if (rows.length > 0) {
      const { error } = await supabase.from('employee_areas').insert(rows)
      if (error) throw error
    }
    $q.notify({ type: 'positive', message: 'Officer areas saved successfully' })
    loadEmpAreas(empId)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to save areas' })
  } finally {
    savingArea.value = false
  }
}

function removeArea(idx) {
  empAreas.value.splice(idx, 1)
}

const viewForm = reactive({
  first_name: '',
  last_name: '',
  title: 'Mr.',
  gender: 'Male',
  civil_status: 'Single',
  date_of_birth: '',
  mobile: '',
  residence_phone: '',
  nic_number: '',
  email: '',
  address_line1: '',
  internal_company: 'Select Internal',
  designation_id: null,
  probation_period: '',
  salary: '',
  epf_no: '',
  epf_amount: '',
  welfare_amount: '',
  ot: 'Eligible',
  confirm_date: '',
  resign_date: '',
  pay_type: 'Cash',
  bank_name: '',
  bank_branch: '',
  bank_account_name: '',
  bank_account_number: '',
  hire_date: '',
  shift_rate: '',
  shift: null,
  epf_etf_eligible: false,
  basic_salary: 0,
  epf_employee_pct: 8,
  morning_ot: false,
  late_deduct: false,
  no_pay_deduct: false,
  epf_attend: false,
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_phone: '',
  user_pic: null,
})

// ── EPF auto-calculation (Edit/View Form) ─────────────────────────────────────
watch(
  () => [viewForm.basic_salary, viewForm.epf_employee_pct, viewForm.epf_etf_eligible],
  ([basic, pct, eligible]) => {
    if (eligible) {
      viewForm.epf_amount = recalcEpf(basic, pct || 8)
    }
  },
  { immediate: true },
)

function customFilter(rows, terms, cols, getCellValue) {
  const t = (terms || '').toLowerCase()
  if (!t) return rows
  return rows.filter((row) => {
    // Check main columns defined
    const colMatch = cols.some((col) => {
      const val = getCellValue(col, row)
      return val && String(val).toLowerCase().includes(t)
    })
    if (colMatch) return true

    // Fallback: deep scan row for safety against misaligned typing
    return Object.values(row).some((val) => {
      if (val && typeof val === 'object') {
        return Object.values(val).some((v) => v && String(v).toLowerCase().includes(t))
      }
      return val && String(val).toLowerCase().includes(t)
    })
  })
}

const filteredEmployees = computed(() => {
  let result = employees.value
  if (statusFilter.value !== 'All') {
    const status = statusFilter.value.toLowerCase().replace(' ', '_')
    result = result.filter(
      (e) => e.employment_status === status || (status === 'active' && e.is_active),
    )
  }
  if (deptFilter.value && deptFilter.value !== 'all') {
    result = result.filter((e) => e.department_id === deptFilter.value)
  }
  if (desigFilter.value && desigFilter.value !== 'all') {
    result = result.filter((e) => e.designation_id === desigFilter.value)
  }
  return result
})

const deptFilterOptions = computed(() => [
  { label: 'All Departments', value: 'all' },
  ...departmentOptions.value,
])

const desigFilterOptions = computed(() => [
  { label: 'All Designations', value: 'all' },
  ...designationOptions.value,
])

async function loadEmployees() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return
    const { data, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name, full_name, employee_code, employment_status, mobile, email, photo_url, nic_number, epf_no, hire_date, departments(name), designations(title), salary_structures(basic_salary, is_current)')
      .eq('branch_id', branchId)
      .order('employee_code')
    if (error) throw error
    employees.value = data || []
    stats.value.total = employees.value.length
    stats.value.permanent = employees.value.filter(
      (e) => e.employment_status === 'permanent',
    ).length
    stats.value.probation = employees.value.filter(
      (e) => e.employment_status === 'probation',
    ).length
    stats.value.contract = employees.value.filter((e) => e.employment_status === 'contract').length
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  const { data: depts } = await supabase
    .from('departments')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  departmentOptions.value = (depts || []).map((d) => ({ label: d.name, value: d.id }))

  const { data: desigs } = await supabase
    .from('designations')
    .select('id, title')
    .eq('is_active', true)
    .order('title')
  designationOptions.value = (desigs || []).map((d) => ({ label: d.title, value: d.id }))
}

async function generateCode() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  const { data } = await supabase
    .from('employees')
    .select('employee_code')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (data?.length) {
    const match = data[0].employee_code.match(/\d+$/)
    if (match) {
      const prefix = data[0].employee_code.slice(0, match.index)
      form.employee_code = prefix + String(parseInt(match[0]) + 1).padStart(match[0].length, '0')
    } else {
      form.employee_code = 'EMP001'
    }
  } else {
    form.employee_code = 'EMP001'
  }
}

async function openForm(emp) {
  if (emp) {
    isEditing.value = true

    // ── Fetch the FULL employee record from DB so all fields are populated ──
    // IMPORTANT: if this fetch fails, we must NOT fall back to the sparse list
    // row — doing so would silently reset every field not in the list query
    // (NIC, address, bank details, etc.) back to defaultForm's blank values,
    // and the user's next Save would overwrite the real DB data with blanks.
    const { data: fullEmp, error: fetchErr } = await supabase
      .from('employees')
      .select('*, departments(name), designations(title)')
      .eq('id', emp.id)
      .single()

    if (fetchErr || !fullEmp) {
      console.error('[HR] Could not fetch full employee record for edit:', fetchErr)
      $q.notify({
        type: 'negative',
        message: 'Could not load full employee details. Please try again — editing was cancelled to avoid overwriting saved data.',
      })
      isEditing.value = false
      return
    }

    Object.keys(defaultForm).forEach((k) => {
      form[k] = fullEmp[k] ?? defaultForm[k]
    })
    form.id = fullEmp.id

    // ── Also load current salary structure into form ──
    try {
      const { data: salData } = await supabase
        .from('salary_structures')
        .select('*')
        .eq('employee_id', fullEmp.id)
        .eq('is_current', true)
        .limit(1)
        .single()
      if (salData) {
        form.salary_method = salData.salary_method ?? 'basic_salary'
        form.basic_salary = salData.basic_salary ?? 0
        form.hourly_rate = salData.hourly_rate ?? 0
        form.day_rate = salData.day_rate ?? 0
        form.unit_rate = salData.unit_rate ?? 0
        form.housing_allowance = salData.housing_allowance ?? 0
        form.transport_allowance = salData.transport_allowance ?? 0
        form.meal_allowance = salData.meal_allowance ?? 0
        form.overtime_rate_multiplier = salData.overtime_rate_multiplier ?? 1.5
        form.holiday_ot_multiplier = salData.holiday_ot_multiplier ?? 2.0
        form.epf_employee_pct = salData.epf_employee_pct ?? 8
      }
    } catch (e) {
      console.warn('[HR] Could not fetch salary structure for edit:', e)
    }

    extraAllowances.value = []
  } else {
    isEditing.value = false
    Object.assign(form, { ...defaultForm })
    generateCode()
    const fresh = makeFormDocEntries()
    fresh.forEach((e, i) => Object.assign(formDocEntries[i], e))
    extraDocEntries.value = []
    customDocEntry.doc_name = ''
    customDocEntry.file = null
    extraAllowances.value = []
  }
  showForm.value = true
}

function populateViewForm(emp) {
  viewEmp.value = emp

  viewForm.first_name = emp.first_name || ''
  viewForm.last_name = emp.last_name || ''
  viewForm.title = emp.title || 'Mr.'
  viewForm.gender = emp.gender || 'Male'
  viewForm.civil_status = emp.civil_status || 'Single'
  viewForm.date_of_birth = emp.date_of_birth || ''
  viewForm.mobile = emp.mobile || ''
  viewForm.residence_phone = emp.residence_phone || ''
  viewForm.nic_number = emp.nic_number || ''
  viewForm.email = emp.email || ''
  viewForm.address_line1 = emp.address_line1 || ''
  viewForm.designation_id = emp.designation_id || null
  viewForm.epf_no = emp.epf_no || ''
  viewForm.bank_name = emp.bank_name || ''
  viewForm.bank_branch = emp.bank_branch || ''
  viewForm.bank_account_name = emp.bank_account_name || ''
  viewForm.bank_account_number = emp.bank_account_number || ''
  viewForm.hire_date = emp.hire_date || ''
  viewForm.emergency_contact_name = emp.emergency_contact_name || ''
  viewForm.emergency_contact_relationship = emp.emergency_contact_relationship || ''
  viewForm.emergency_contact_phone = emp.emergency_contact_phone || ''

  // Load photo URL
  viewEmpPhotoUrl.value = emp.photo_url || ''
}

async function viewEmployee(emp) {
  // Open the dialog instantly so the UI doesn't hang waiting for the DB queries!
  viewTab.value = 'settings'
  showDetail.value = true

  // The table row (emp) only carries the light columns from loadEmployees()'s
  // list query — it never has nic_number, address_line1, bank_*, etc. Populate
  // with what we have first so the dialog isn't blank, then replace with the
  // full record once it arrives so NIC and other fields actually show up.
  populateViewForm(emp)

  supabase
    .from('employees')
    .select('*, departments(name), designations(title)')
    .eq('id', emp.id)
    .single()
    .then(({ data, error }) => {
      if (!error && data) populateViewForm(data)
      else console.error('[HR] Could not fetch full employee record for view:', error)
    })

  // Clear previous data while loading
  viewEmpSalary.value = null

  // Run heavy extra DB queries as non-blocking background tasks
  const fetchSalary = async () => {
    try {
      const { data } = await supabase
        .from('salary_structures')
        .select('*')
        .eq('employee_id', emp.id)
        .eq('is_current', true)
        .limit(1)
        .single()
      viewEmpSalary.value = data || null
      // populate viewForm for EPF auto-calc
      if (data) {
        viewForm.basic_salary = data.basic_salary ?? 0
        viewForm.epf_employee_pct = data.epf_employee_pct ?? 8
        viewForm.epf_etf_eligible = emp.epf_etf_eligible ?? false
      }
    } catch {
      viewEmpSalary.value = null
    }
  }

  // Fire and forget all at once so the dialog doesn't block the user
  Promise.all([
    fetchSalary(),
    loadEmpDocuments(emp.id).catch(console.error),
    loadEmpLeaveBalances(emp.id).catch(console.error),
    loadEmpAdvances(emp.id).catch(console.error),
    loadEmpDeductions(emp.id).catch(console.error),
    loadEmpAreas(emp.id).catch(console.error),
  ])

  // Start realtime sync for this employee's leave & advances
  subscribeProfileRealtime(emp.id)
}

// ── Realtime subscriptions for Leave & Advances in the profile view ──────────
let profileRealtimeChannel = null

function subscribeProfileRealtime(empId) {
  // Clean up any previous subscription
  if (profileRealtimeChannel) {
    supabase.removeChannel(profileRealtimeChannel)
    profileRealtimeChannel = null
  }

  profileRealtimeChannel = supabase
    .channel(`profile-realtime-${empId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'leave_balances',
        filter: `employee_id=eq.${empId}`,
      },
      () => {
        loadEmpLeaveBalances(empId)
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'leave_requests',
        filter: `employee_id=eq.${empId}`,
      },
      () => {
        loadEmpLeaveBalances(empId)
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'salary_advances',
        filter: `employee_id=eq.${empId}`,
      },
      () => {
        loadEmpAdvances(empId)
      },
    )
    .subscribe()
}

function unsubscribeProfileRealtime() {
  if (profileRealtimeChannel) {
    supabase.removeChannel(profileRealtimeChannel)
    profileRealtimeChannel = null
  }
}

function cleanEmployeePayload(rawPayload) {
  const payload = { ...rawPayload }

  // Prototype pollution defense
  delete payload['__proto__']
  delete payload['constructor']
  delete payload['prototype']

  // 1. Remove database-managed / read-only / generated / relational columns
  delete payload.id
  delete payload.full_name
  delete payload.created_at
  delete payload.updated_at
  delete payload.departments
  delete payload.designations

  // 2. Remove keys that exist only on the form / salary_structures table (NOT on employees)
  const uiOnlyKeys = [
    // Salary structure fields (saved to salary_structures table, not employees)
    'salary_method',
    'basic_salary',
    'hourly_rate',
    'day_rate',
    'unit_rate',
    'housing_allowance',
    'transport_allowance',
    'meal_allowance',
    'overtime_rate_multiplier',
    'holiday_ot_multiplier',
    'epf_employee_pct',
    'salary',
    // File upload handle (not a DB column)
    'user_pic',
    // Legacy/unused
    'shift_rate',
  ]
  uiOnlyKeys.forEach((k) => delete payload[k])

  // 3. Convert empty strings to null for nullable DATE / UUID fields
  const nullableKeys = [
    'date_of_birth',
    'termination_date',
    'salary_hold_date',
    'department_id',
    'designation_id',
    'profile_id',
    'salary_hold_by',
    'education_level',
  ]
  nullableKeys.forEach((k) => {
    if (payload[k] === '' || payload[k] === undefined) {
      payload[k] = null
    }
  })

  // 4. Ensure NOT NULL columns have valid fallbacks
  if (!payload.hire_date || payload.hire_date === '') {
    payload.hire_date = new Date().toISOString().split('T')[0]
  }

  if (payload.mobile && !payload.phone) {
    payload.phone = payload.mobile
  }

  return payload
}

async function saveEmployee() {
  saving.value = true
  try {
    const rawPayload = { ...form }
    const empId = rawPayload.id
    const userPicFile = rawPayload.user_pic

    // Salary structure fields — extracted before employee insert
    const salaryPayload = {
      salary_method: rawPayload.salary_method ?? 'basic_salary',
      basic_salary: rawPayload.basic_salary ?? 0,
      hourly_rate: rawPayload.hourly_rate ?? 0,
      day_rate: rawPayload.day_rate ?? 0,
      unit_rate: rawPayload.unit_rate ?? 0,
      housing_allowance: rawPayload.housing_allowance ?? 0,
      transport_allowance: rawPayload.transport_allowance ?? 0,
      meal_allowance: rawPayload.meal_allowance ?? 0,
      overtime_rate_multiplier: rawPayload.overtime_rate_multiplier ?? 1.5,
      holiday_ot_multiplier: rawPayload.holiday_ot_multiplier ?? 2.0,
      epf_employee_pct: rawPayload.epf_employee_pct ?? 8,
      epf_employer_pct: 12,
      etf_employer_pct: 3,
      other_allowances: extraAllowances.value.reduce((s, a) => s + (Number(a.amount) || 0), 0),
      salary_type: 'monthly',
      is_current: true,
      effective_from: new Date().toISOString().split('T')[0],
      company_id: authStore.currentBranch?.company_id,
    }

    const payload = cleanEmployeePayload(rawPayload)
    payload.company_id = authStore.currentBranch?.company_id
    payload.branch_id = authStore.currentBranch?.id
    payload.created_by = authStore.user?.id

    let targetEmpId = empId

    if (isEditing.value) {
      const { error } = await supabase.from('employees').update(payload).eq('id', empId)
      if (error) throw error

      // ── Optimistic update: patch the existing card instantly ──────
      const idx = employees.value.findIndex((e) => e.id === empId)
      if (idx !== -1) {
        employees.value[idx] = {
          ...employees.value[idx],
          ...payload,
          id: empId,
        }
      }
      $q.notify({ type: 'positive', message: 'Employee updated successfully' })
    } else {
      const { data, error } = await supabase.from('employees').insert(payload).select('id').single()
      if (error) throw error
      targetEmpId = data.id

      // ── Optimistic insert: show new card immediately ──────────────
      employees.value = [
        {
          ...payload,
          id: targetEmpId,
          departments: departmentOptions.value.find((d) => d.value === payload.department_id)
            ? { name: departmentOptions.value.find((d) => d.value === payload.department_id).label }
            : null,
          designations: designationOptions.value.find((d) => d.value === payload.designation_id)
            ? {
                title: designationOptions.value.find((d) => d.value === payload.designation_id)
                  .label,
              }
            : null,
        },
        ...employees.value,
      ]
      stats.value.total = employees.value.length
      $q.notify({ type: 'positive', message: 'Employee added successfully' })
    }

    // ── Close dialog immediately — don't wait for uploads ────────────
    showForm.value = false
    Object.assign(form, { ...defaultForm })
    extraAllowances.value = []
    isEditing.value = false

    // ── Upload photo if provided ─────────────────────────────────────
    if (userPicFile && targetEmpId) {
      await uploadEmployeePhoto(targetEmpId, userPicFile)
    }

    // ── Auto-save salary structure ──────────────────────────────────
    if (targetEmpId) {
      salaryPayload.employee_id = targetEmpId
      // Mark any existing current salary record as not current
      await supabase
        .from('salary_structures')
        .update({ is_current: false })
        .eq('employee_id', targetEmpId)
        .eq('is_current', true)

      const { error: salErr } = await supabase.from('salary_structures').insert(salaryPayload)
      if (salErr) {
        console.warn('[HR] Salary structure insert failed:', salErr.message)
        // Don't throw — employee was saved OK; show a warning instead
        $q.notify({
          type: 'warning',
          message: 'Employee saved, but salary config failed: ' + salErr.message,
        })
      }
    }

    // ── Upload inline form documents ────────────────────────────────
    if (targetEmpId) {
      await uploadFormDocuments(targetEmpId)
    }
    // Reset form doc entries
    const fresh2 = makeFormDocEntries()
    fresh2.forEach((e, i) => Object.assign(formDocEntries[i], e))
    extraDocEntries.value = []
    customDocEntry.doc_name = ''
    customDocEntry.file = null

    // ── Background refresh to get full relational data ───────────────
    loadEmployees()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

async function updateProfile() {
  if (!viewEmp.value?.id) return
  savingProfile.value = true
  try {
    const rawPayload = {
      first_name: viewForm.first_name || '',
      last_name: viewForm.last_name || '',
      name_with_initials: viewForm.last_name
        ? `${viewForm.first_name} ${viewForm.last_name}`
        : viewForm.first_name,
      gender: viewForm.gender || null,
      civil_status: viewForm.civil_status || null,
      date_of_birth: viewForm.date_of_birth || null,
      mobile: viewForm.mobile || '',
      residence_phone: viewForm.residence_phone || '',
      nic_number: viewForm.nic_number || '',
      email: viewForm.email || '',
      address_line1: viewForm.address_line1 || '',
      designation_id: viewForm.designation_id || null,
      bank_name: viewForm.bank_name || '',
      bank_branch: viewForm.bank_branch || '',
      bank_account_name: viewForm.bank_account_name || '',
      bank_account_number: viewForm.bank_account_number || '',
      hire_date: viewForm.hire_date || null,
      epf_no: viewForm.epf_no || '',
      emergency_contact_name: viewForm.emergency_contact_name || '',
      emergency_contact_relationship: viewForm.emergency_contact_relationship || '',
      emergency_contact_phone: viewForm.emergency_contact_phone || '',
    }

    const payload = cleanEmployeePayload(rawPayload)

    const { error } = await supabase.from('employees').update(payload).eq('id', viewEmp.value.id)
    if (error) throw error

    // Upload photo if a new file was selected
    if (viewForm.user_pic && viewForm.user_pic instanceof File) {
      await uploadEmployeePhoto(viewEmp.value.id, viewForm.user_pic)
      // Refresh photo URL
      const { data: empData } = await supabase
        .from('employees')
        .select('photo_url')
        .eq('id', viewEmp.value.id)
        .single()
      if (empData?.photo_url) viewEmpPhotoUrl.value = empData.photo_url
      viewForm.user_pic = null
    }

    $q.notify({ type: 'positive', message: 'Employee profile updated successfully' })
    Object.assign(viewEmp.value, payload)

    loadEmployees()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to update profile' })
  } finally {
    savingProfile.value = false
  }
}

function confirmDelete(emp) {
  $q.dialog({
    title: 'Confirm Deletion',
    message: `Are you sure you want to delete ${emp.full_name}? This action cannot be undone.`,
    cancel: true,
    persistent: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      loading.value = true
      const { error } = await supabase.from('employees').delete().eq('id', emp.id)
      if (error) throw error

      $q.notify({ type: 'positive', message: 'Employee deleted successfully' })
      loadEmployees()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Failed to delete' })
    } finally {
      loading.value = false
    }
  })
}

// ── Designation Dialog ──────────────────────────────────────────────
const showDesigDialog = ref(false)
const savingDesig = ref(false)
const editingDesig = ref(null)
const desigForm = reactive({ title: '', description: '', department_id: null, is_active: true })

function openDesigDialog(desig = null) {
  editingDesig.value = desig
  if (desig) {
    Object.assign(desigForm, {
      title: desig.title,
      description: desig.description || '',
      department_id: desig.department_id,
      is_active: desig.is_active,
    })
  } else {
    Object.assign(desigForm, { title: '', description: '', department_id: null, is_active: true })
  }
  showDesigDialog.value = true
}

async function saveDesig() {
  if (!desigForm.title.trim()) {
    $q.notify({ type: 'warning', message: 'Title is required' })
    return
  }
  savingDesig.value = true
  try {
    const payload = {
      title: desigForm.title.trim(),
      description: desigForm.description?.trim() || null,
      department_id: desigForm.department_id || null,
      is_active: desigForm.is_active,
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
    }
    if (editingDesig.value) {
      const { error } = await supabase
        .from('designations')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingDesig.value.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Designation updated' })
    } else {
      const { error } = await supabase.from('designations').insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Designation created' })
    }
    showDesigDialog.value = false
    await loadOptions()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    savingDesig.value = false
  }
}

// ── Department Dialog ───────────────────────────────────────────────
const showDeptDialog = ref(false)
const savingDept = ref(false)
const editingDept = ref(null)
const deptForm = reactive({ name: '', description: '', is_active: true })

function openDeptDialog(dept = null) {
  editingDept.value = dept
  if (dept) {
    Object.assign(deptForm, {
      name: dept.name,
      description: dept.description || '',
      is_active: dept.is_active,
    })
  } else {
    Object.assign(deptForm, { name: '', description: '', is_active: true })
  }
  showDeptDialog.value = true
}

async function saveDept() {
  if (!deptForm.name.trim()) {
    $q.notify({ type: 'warning', message: 'Name is required' })
    return
  }
  savingDept.value = true
  try {
    const payload = {
      name: deptForm.name.trim(),
      description: deptForm.description?.trim() || null,
      is_active: deptForm.is_active,
      company_id: authStore.currentBranch?.company_id,
      branch_id: authStore.currentBranch?.id,
    }
    if (editingDept.value) {
      const { error } = await supabase
        .from('departments')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingDept.value.id)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Department updated' })
    } else {
      const { error } = await supabase.from('departments').insert(payload)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Department created' })
    }
    showDeptDialog.value = false
    await loadOptions()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    savingDept.value = false
  }
}

function exportPDF() {
  if (!filteredEmployees.value || filteredEmployees.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No employees to export.' })
    return
  }

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Employee List', 14, 15)

  doc.setFontSize(10)
  doc.setTextColor(100)
  let filterText = `Status: ${statusFilter.value}`
  if (deptFilter.value && deptFilter.value !== 'all') {
    const dept =
      departmentOptions.value.find((d) => d.value === deptFilter.value)?.label || deptFilter.value
    filterText += ` | Department: ${dept}`
  }
  if (desigFilter.value && desigFilter.value !== 'all') {
    const desig =
      designationOptions.value.find((d) => d.value === desigFilter.value)?.label ||
      desigFilter.value
    filterText += ` | Designation: ${desig}`
  }
  if (search.value) {
    filterText += ` | Search: ${search.value}`
  }
  doc.text(filterText, 14, 22)
  doc.text(`Total Employees: ${filteredEmployees.value.length}`, 14, 27)

  const head = [['#', 'Name', 'Phone No', 'NIC', 'EPF No', 'Designation', 'Department']]
  const body = filteredEmployees.value.map((emp, index) => [
    index + 1,
    emp.full_name || emp.first_name + ' ' + (emp.last_name || ''),
    emp.mobile || '—',
    emp.nic_number || '—',
    emp.epf_no || '—',
    emp.designations?.title || '—',
    emp.departments?.name || '—',
  ])

  autoTable(doc, {
    startY: 32,
    head,
    body,
    theme: 'grid',
    headStyles: { fillColor: [33, 150, 243] },
    styles: { fontSize: 8 },
  })

  doc.save('employees_list.pdf')
}

function exportExcel() {
  if (!filteredEmployees.value || filteredEmployees.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No employees to export.' })
    return
  }

  const exportData = filteredEmployees.value.map((emp, index) => ({
    '#': index + 1,
    'Employee Code': emp.employee_code || '',
    'Full Name': emp.full_name || emp.first_name + ' ' + (emp.last_name || ''),
    Department: emp.departments?.name || '',
    Designation: emp.designations?.title || '',
    Status: emp.employment_status || '',
    'Phone No': emp.mobile || '',
    NIC: emp.nic_number || '',
    Gender: emp.gender || '',
    'Civil Status': emp.civil_status || '',
    'Bank Name': emp.bank_name || '',
    'Bank Branch': emp.bank_branch || '',
    'Account Name': emp.bank_account_name || '',
    'Account No': emp.bank_account_number || '',
    'EPF No': emp.epf_no || '',
    'Basic Salary': emp.basic_salary || '0',
    'Hire Date': emp.hire_date || '',
  }))

  const ws = xlsx.utils.json_to_sheet(exportData)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws, 'Employees')
  xlsx.writeFile(wb, 'employees_list.xlsx')
}

watch(statusFilter, () => loadEmployees())

onMounted(() => {
  loadEmployees()
  loadOptions()
})
</script>

<style scoped lang="scss">
// Gradient KPI cards — matches DashboardCard.vue
.sys-kpi-card {
  border-radius: 12px;
  padding: 16px 18px 14px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  position: relative;
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  min-height: 88px;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  }
  &--blue {
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--green {
    background: linear-gradient(135deg, #065f46 0%, #059669 100%);
    box-shadow: 0 4px 14px rgba(5, 150, 105, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--amber {
    background: linear-gradient(135deg, #78350f 0%, #d97706 100%);
    box-shadow: 0 4px 14px rgba(217, 119, 6, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--teal {
    background: linear-gradient(135deg, #134e4a 0%, #0d9488 100%);
    box-shadow: 0 4px 14px rgba(13, 148, 136, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
}
.sys-kpi-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sys-kpi-body {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}
.sys-kpi-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sys-kpi-value {
  font-size: 24px;
  font-weight: 900;
  color: #ffffff;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.sys-kpi-watermark {
  position: absolute;
  right: -12px;
  bottom: -12px;
  opacity: 0.08;
  pointer-events: none;
  color: white !important;
}

.erp-stat-card {
  background: var(--erp-bg-form-card, #111827);
  border: 1px solid var(--erp-input-border, #374151);
  border-radius: 12px;
}
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
