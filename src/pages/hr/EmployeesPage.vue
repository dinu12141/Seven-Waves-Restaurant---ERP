<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="Employees" breadcrumbs="Human Resources / Employees" />

    <!-- KPI Row -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="people" size="36px" color="blue" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Total Employees</div>
              <div class="text-h5 text-weight-bold">{{ stats.total }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="check_circle" size="36px" color="green" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Permanent</div>
              <div class="text-h5 text-weight-bold">{{ stats.permanent }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="schedule" size="36px" color="orange" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Probation</div>
              <div class="text-h5 text-weight-bold">{{ stats.probation }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card class="erp-stat-card" flat>
          <q-card-section class="row items-center no-wrap q-pa-md">
            <q-icon name="description" size="36px" color="cyan" class="q-mr-md" />
            <div>
              <div class="text-caption text-grey-5">Contract</div>
              <div class="text-h5 text-weight-bold">{{ stats.contract }}</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="row items-center q-mb-md q-gutter-sm">
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
      <q-space />
      <q-input
        dark
        dense
        outlined
        v-model="search"
        placeholder="Search employees..."
        class="col-12 col-sm-4"
        clearable
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>
      <q-select
        dark
        dense
        outlined
        v-model="statusFilter"
        :options="['All', 'Active', 'Permanent', 'Probation', 'Contract', 'Part Time', 'Resigned']"
        label="Status"
        style="width: 160px"
      />
      <q-select
        dark
        dense
        outlined
        v-model="deptFilter"
        :options="deptFilterOptions"
        label="Department"
        emit-value
        map-options
        style="width: 180px"
      />
      <q-select
        dark
        dense
        outlined
        v-model="desigFilter"
        :options="desigFilterOptions"
        label="Designation"
        emit-value
        map-options
        style="width: 180px"
      />
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
          {{ props.rowIndex + 1 }}
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

            <div class="row q-col-gutter-x-lg q-col-gutter-y-md text-grey-4">
              <div class="col-12">
                <div class="text-caption">Employee ID:</div>
                <q-input dark outlined dense v-model="form.employee_code" readonly />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Full Name</div>
                <q-input dark outlined dense v-model="form.first_name" />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Address</div>
                <q-input dark outlined dense v-model="form.address_line1" />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">NIC:</div>
                <q-input dark outlined dense v-model="form.nic_number" />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Date of Birth:</div>
                <q-input dark outlined dense type="date" v-model="form.date_of_birth" stack-label />
              </div>

              <div class="col-12">
                <div class="row items-center q-gutter-x-sm">
                  <div class="col-auto">
                    <div class="text-caption text-grey-8">
                      <q-icon name="cloud_upload" size="xs" /> Upload Image
                    </div>
                  </div>
                </div>
                <q-file
                  dark
                  outlined
                  dense
                  v-model="form.user_pic"
                  class="q-mt-xs"
                  label="Choose File"
                >
                  <template v-slot:append>
                    <span class="text-caption text-grey-6" style="margin-left: 10px">{{
                      form.user_pic ? form.user_pic.name : 'No file chosen'
                    }}</span>
                  </template>
                </q-file>
              </div>

              <div class="col-12 col-md-4">
                <div class="text-caption">Gender:</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.gender"
                  :options="['Male', 'Female', 'Other']"
                />
              </div>
              <div class="col-12 col-md-4">
                <div class="text-caption">Title:</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.title"
                  :options="['Mr.', 'Mrs.', 'Miss', 'Rev.']"
                />
              </div>
              <div class="col-12 col-md-4">
                <div class="text-caption">Civil Status:</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.civil_status"
                  :options="['Single', 'Married', 'Divorced', 'Widowed']"
                />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Personal Phone No:</div>
                <q-input dark outlined dense v-model="form.mobile" />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Email:</div>
                <q-input dark outlined dense v-model="form.email" type="email" />
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

            <div class="row q-col-gutter-x-lg q-col-gutter-y-md text-grey-4">
              <div class="col-12 col-md-6">
                <div class="text-caption">Short Name</div>
                <q-input dark outlined dense v-model="form.last_name" />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Join Date</div>
                <q-input dark outlined dense type="date" v-model="form.hire_date" stack-label />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Designation:</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.designation_id"
                  :options="designationOptions"
                  emit-value
                  map-options
                />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Basic Salary</div>
                <q-input dark outlined dense v-model="form.salary" />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Salary Type:</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.pay_type"
                  :options="['Shift Base', 'Monthly', 'Daily']"
                />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">OT Eligibility:</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.ot"
                  :options="['Eligible', 'Not Eligible']"
                />
              </div>

              <div class="col-12 col-md-6">
                <div class="text-caption">Shift:</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.shift"
                  :options="['Select Shift', 'Day Shift', 'Night Shift']"
                />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Promotion Period:</div>
                <q-input
                  dark
                  outlined
                  dense
                  v-model="form.probation_period"
                  placeholder="Select Promotion Date"
                />
              </div>

              <div class="col-12 col-md-6">
                <q-checkbox
                  dark
                  v-model="form.epf_etf_eligible"
                  label="EPF / ETF Eligible"
                  dense
                  color="amber-8"
                  class="text-grey-3 q-mt-sm"
                />
              </div>
              <div class="col-12 col-md-6"></div>

              <template v-if="form.epf_etf_eligible">
                <div class="col-12 col-md-6">
                  <div class="text-caption">EPF No</div>
                  <q-input dark outlined dense v-model="form.epf_no" />
                </div>
                <div class="col-12 col-md-6">
                  <div class="text-caption">EPF Amount</div>
                  <q-input dark outlined dense v-model="form.epf_amount" />
                </div>
              </template>

              <div class="col-12 col-md-6">
                <div class="text-caption">Welfare Amount</div>
                <q-input dark outlined dense v-model="form.welfare_amount" />
              </div>
              <div class="col-12 col-md-6"></div>

              <div class="col-12 col-md-6">
                <div class="text-caption text-grey-5">Company Name:</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.internal_company"
                  :options="['SEVEN WAVES (PVT) LTD']"
                />
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

            <div class="row q-col-gutter-x-lg q-col-gutter-y-md text-grey-4">
              <div class="col-12 col-md-6">
                <div class="text-caption">Salary Method *</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.salary_method"
                  :options="salaryMethodOptions"
                  emit-value
                  map-options
                />
              </div>
              <div class="col-12 col-md-6">
                <div class="text-caption">Basic Salary (LKR)</div>
                <q-input
                  dark
                  outlined
                  dense
                  v-model.number="form.basic_salary"
                  type="number"
                  prefix="LKR"
                />
              </div>

              <div class="col-12 col-md-6" v-if="form.salary_method === 'day_salary'">
                <div class="text-caption">Day Rate (LKR)</div>
                <q-input
                  dark
                  outlined
                  dense
                  v-model.number="form.day_rate"
                  type="number"
                  prefix="LKR"
                />
              </div>
              <div class="col-12 col-md-6" v-if="form.salary_method === 'unit_salary'">
                <div class="text-caption">Unit Rate (LKR)</div>
                <q-input
                  dark
                  outlined
                  dense
                  v-model.number="form.unit_rate"
                  type="number"
                  prefix="LKR"
                />
              </div>

              <template v-if="form.ot === 'Eligible'">
                <div class="col-12 col-md-4">
                  <div class="text-caption">Hourly Rate (LKR)</div>
                  <q-input dark outlined dense v-model.number="form.hourly_rate" type="number" />
                </div>
                <div class="col-12 col-md-4">
                  <div class="text-caption">OT Multiplier</div>
                  <q-input
                    dark
                    outlined
                    dense
                    v-model.number="form.overtime_rate_multiplier"
                    type="number"
                    hint="Default: 1.5×"
                  />
                </div>
                <div class="col-12 col-md-4">
                  <div class="text-caption">Holiday OT Multiplier</div>
                  <q-input
                    dark
                    outlined
                    dense
                    v-model.number="form.holiday_ot_multiplier"
                    type="number"
                    hint="Default: 2.0× (public holidays)"
                  />
                </div>
              </template>
              <div class="col-12 col-md-4" v-if="form.epf_etf_eligible">
                <div class="text-caption">EPF % (Employee)</div>
                <q-input
                  dark
                  outlined
                  dense
                  v-model.number="form.epf_employee_pct"
                  type="number"
                  suffix="%"
                />
              </div>

              <div class="col-12">
                <div class="text-caption text-grey-5 q-mb-xs">Allowances (LKR)</div>
                <div class="row q-col-gutter-md">
                  <div class="col-4">
                    <q-input
                      dark
                      outlined
                      dense
                      v-model.number="form.housing_allowance"
                      type="number"
                      label="Housing"
                      prefix="LKR"
                    />
                  </div>
                  <div class="col-4">
                    <q-input
                      dark
                      outlined
                      dense
                      v-model.number="form.transport_allowance"
                      type="number"
                      label="Transport"
                      prefix="LKR"
                    />
                  </div>
                  <div class="col-4">
                    <q-input
                      dark
                      outlined
                      dense
                      v-model.number="form.meal_allowance"
                      type="number"
                      label="Meals"
                      prefix="LKR"
                    />
                  </div>
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

            <div class="row q-col-gutter-x-lg q-col-gutter-y-md text-grey-4">
              <div class="col-12">
                <div class="text-caption">Payment Type:</div>
                <q-select
                  dark
                  outlined
                  dense
                  v-model="form.pay_type"
                  :options="['Bank', 'Cash', 'Cheque']"
                  color="amber-8"
                />
              </div>

              <div class="col-12">
                <div class="text-caption">Bank:</div>
                <q-select
                  dark
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
                  dark
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
                  dark
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
                  dark
                  outlined
                  dense
                  v-model="form.bank_account_number"
                  color="amber-8"
                  placeholder="Enter account number"
                />
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
    >
      <q-card
        class="full-width"
        style="
          background: var(--erp-bg-page, #0b0f19);
          color: #fff;
          font-family: Roboto, sans-serif;
        "
      >
        <!-- layout -->
        <q-toolbar
          class="shadow-1"
          style="
            background: var(--erp-bg-form-card, #111827);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            height: 60px;
          "
        >
          <q-toolbar-title class="text-weight-bold" style="font-size: 20px; color: #e2e8f0">
            Profile
            <span class="text-grey-5 text-caption text-weight-regular" style="font-size: 14px"
              >Preview</span
            >
          </q-toolbar-title>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup color="grey-4" />
        </q-toolbar>

        <q-scroll-area style="height: calc(100vh - 60px)">
          <div class="row q-pa-lg q-col-gutter-lg" style="margin: 0 auto; max-width: 1600px">
            <!-- Left Side -->
            <div class="col-12 col-md-4 col-lg-3">
              <q-card
                flat
                bordered
                style="
                  background: var(--erp-bg-form-card, #111827);
                  border-color: rgba(255, 255, 255, 0.07);
                "
                class="q-mb-md"
              >
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

                  <div class="text-subtitle1 text-weight-bold q-mb-sm text-grey-3">About Me</div>

                  <div class="q-gutter-y-sm">
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      Name:
                      <span class="text-white text-weight-medium">{{
                        viewEmp?.full_name || viewEmp?.first_name
                      }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      EMP NO:
                      <span class="text-white text-weight-medium">{{
                        viewEmp?.employee_code
                      }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      Basic Salary:
                      <span class="text-white text-weight-medium">{{
                        viewEmpSalary?.basic_salary || '0.00'
                      }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      NIC:
                      <span class="text-white text-weight-medium">{{ viewEmp?.nic_number }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      Address:
                      <span class="text-white text-weight-medium">{{
                        viewEmp?.address_line1 || 'No Address'
                      }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      Personal Contact:
                      <span class="text-white text-weight-medium">{{ viewEmp?.mobile || '' }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      Office Contact:
                      <span class="text-white text-weight-medium">{{
                        viewEmp?.residence_phone || ''
                      }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      Designation:
                      <span class="text-white text-weight-medium">{{
                        viewEmp?.designations?.title || 'None'
                      }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      Hour Rate:
                      <span class="text-white text-weight-medium">{{
                        viewEmpSalary?.hourly_rate || '0.00'
                      }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      EPF No:
                      <span class="text-white text-weight-medium">{{ viewEmp?.epf_no || '' }}</span>
                    </div>
                    <div
                      class="q-pa-sm text-caption rounded-borders text-grey-3 q-mb-md"
                      style="
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                      "
                    >
                      Company Name:
                      <span class="text-white text-weight-medium">SEVEN WAVES (PVT) LTD</span>
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
                    color="amber-8"
                    text-color="dark"
                    label="Back"
                    unelevated
                    v-close-popup
                    style="border-radius: 6px; font-weight: 600"
                  />
                </q-card-section>
              </q-card>

              <q-card
                flat
                bordered
                style="
                  background: var(--erp-bg-form-card, #111827);
                  border-color: rgba(255, 255, 255, 0.07);
                "
                class="q-mb-md"
              >
                <q-card-section class="q-pa-sm q-px-md">
                  <div class="row items-center justify-between">
                    <span class="text-subtitle2 text-grey-4">Officer Areas</span>
                    <div class="q-gutter-sm">
                      <q-btn color="amber-8" outline size="sm" label="Save Area" no-caps />
                      <q-btn
                        color="amber-8"
                        text-color="dark"
                        size="sm"
                        label="Add Area"
                        unelevated
                        no-caps
                      />
                    </div>
                  </div>
                </q-card-section>
              </q-card>

              <q-card
                flat
                bordered
                style="
                  background: var(--erp-bg-form-card, #111827);
                  border-color: rgba(255, 255, 255, 0.07);
                "
                class="q-mb-md"
              >
                <q-card-section class="q-pa-sm q-px-md">
                  <div class="row items-center justify-between q-mb-sm">
                    <span class="text-subtitle2 text-grey-4">HR Allowance</span>
                  </div>
                  <q-markup-table
                    dark
                    flat
                    bordered
                    dense
                    class="text-caption shadow-0"
                    separator="cell"
                    style="background: rgba(255, 255, 255, 0.02)"
                  >
                    <thead>
                      <tr>
                        <th class="text-left text-weight-medium text-grey-4">Allowance Type</th>
                        <th class="text-right text-weight-medium text-grey-4">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="viewEmpSalary?.housing_allowance > 0">
                        <td class="text-grey-3">Housing Allowance</td>
                        <td class="text-right text-white">
                          {{ Number(viewEmpSalary.housing_allowance).toFixed(2) }}
                        </td>
                      </tr>
                      <tr v-if="viewEmpSalary?.transport_allowance > 0">
                        <td class="text-grey-3">Transport Allowance</td>
                        <td class="text-right text-white">
                          {{ Number(viewEmpSalary.transport_allowance).toFixed(2) }}
                        </td>
                      </tr>
                      <tr v-if="viewEmpSalary?.meal_allowance > 0">
                        <td class="text-grey-3">Meal Allowance</td>
                        <td class="text-right text-white">
                          {{ Number(viewEmpSalary.meal_allowance).toFixed(2) }}
                        </td>
                      </tr>
                      <tr v-if="viewEmpSalary?.other_allowances > 0">
                        <td class="text-grey-3">Other Allowances</td>
                        <td class="text-right text-white">
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
                        <td colspan="2" class="text-center text-grey-5">
                          No allowances configured
                        </td>
                      </tr>
                      <tr>
                        <td class="text-grey-3">Total Allowances :</td>
                        <td class="text-right text-white">
                          {{ viewEmpTotalAllowance.toFixed(2) }}
                        </td>
                      </tr>
                      <tr>
                        <td class="text-grey-3">Basic Salary :</td>
                        <td class="text-right text-white">
                          {{ Number(viewEmpSalary?.basic_salary || 0).toFixed(2) }}
                        </td>
                      </tr>
                      <tr class="text-weight-bold">
                        <td class="text-amber-4">Total :</td>
                        <td class="text-right text-amber-4">
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

              <q-card
                flat
                bordered
                style="
                  background: var(--erp-bg-form-card, #111827);
                  border-color: rgba(255, 255, 255, 0.07);
                "
                class="q-mb-md"
              >
                <q-card-section class="q-pa-sm q-px-md">
                  <div class="row items-center justify-between q-mb-sm">
                    <span class="text-subtitle2 text-grey-4">HR Deduction</span>
                    <q-btn color="amber-8" outline size="sm" label="Add Deduction" no-caps />
                  </div>
                  <q-markup-table
                    dark
                    flat
                    bordered
                    dense
                    class="text-caption shadow-0"
                    separator="cell"
                    style="background: rgba(255, 255, 255, 0.02)"
                  >
                    <thead>
                      <tr>
                        <th class="text-left text-weight-medium text-grey-4">Deduction</th>
                        <th class="text-right text-weight-medium text-grey-4">Amount</th>
                        <th class="text-center text-weight-medium text-grey-4">#</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colspan="3" class="text-center text-grey-5">No records</td>
                      </tr>
                    </tbody>
                  </q-markup-table>
                </q-card-section>
              </q-card>

              <q-card
                flat
                bordered
                style="
                  background: var(--erp-bg-form-card, #111827);
                  border-color: rgba(255, 255, 255, 0.07);
                "
                class="q-mb-xl"
              >
                <q-card-section class="q-pa-sm q-px-md">
                  <span class="text-subtitle2 text-grey-4">Complains</span>
                </q-card-section>
              </q-card>
            </div>

            <!-- Right Side Form -->
            <div class="col-12 col-md-8 col-lg-9">
              <q-card
                flat
                bordered
                style="
                  background: var(--erp-bg-form-card, #111827);
                  border-color: rgba(255, 255, 255, 0.07);
                  min-height: 100%;
                  border-top: 4px solid #f9a825;
                "
                class="q-mb-xl"
              >
                <q-tabs
                  v-model="viewTab"
                  dark
                  align="left"
                  dense
                  active-color="amber-4"
                  indicator-color="amber-4"
                  style="border-bottom: 1px solid rgba(255, 255, 255, 0.08)"
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
                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4"></div>
                      <div class="col-9">
                        <q-checkbox
                          dark
                          v-model="viewEmpSystemApp"
                          label="System App Allowed"
                          dense
                          size="sm"
                          color="amber-8"
                          class="text-grey-3"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Name
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.first_name" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Title
                      </div>
                      <div class="col-9">
                        <q-select
                          dark
                          outlined
                          dense
                          v-model="viewForm.title"
                          :options="['Mr.', 'Mrs.', 'Miss', 'Rev.']"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Gender
                      </div>
                      <div class="col-9">
                        <q-select
                          dark
                          outlined
                          dense
                          v-model="viewForm.gender"
                          :options="['Male', 'Female', 'Other']"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Civil Status
                      </div>
                      <div class="col-9">
                        <q-select
                          dark
                          outlined
                          dense
                          v-model="viewForm.civil_status"
                          :options="['Single', 'Married', 'Divorced', 'Widowed']"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Date Of Birth
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense type="date" v-model="viewForm.date_of_birth" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Short Name
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.last_name" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Personal Contact (whatsapp)
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.mobile" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Office Contact
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.residence_phone" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">NIC</div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.nic_number" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Email Address
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.email" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Address
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.address_line1" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Internal Company
                      </div>
                      <div class="col-9">
                        <q-select
                          dark
                          outlined
                          dense
                          v-model="viewForm.internal_company"
                          :options="['Select Internal', 'Yes', 'No']"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Designation
                      </div>
                      <div class="col-9">
                        <q-select
                          dark
                          outlined
                          dense
                          v-model="viewForm.designation_id"
                          :options="designationOptions"
                          emit-value
                          map-options
                          clearable
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Probation Period
                      </div>
                      <div class="col-9">
                        <q-input
                          dark
                          outlined
                          dense
                          type="date"
                          v-model="viewForm.probation_period"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Salary
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.salary" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4"></div>
                      <div class="col-9">
                        <q-checkbox
                          dark
                          v-model="viewForm.epf_etf_eligible"
                          label="EPF / ETF Eligible"
                          dense
                          color="amber-8"
                          class="text-grey-3"
                        />
                      </div>

                      <template v-if="viewForm.epf_etf_eligible">
                        <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                          EPF NO
                        </div>
                        <div class="col-9">
                          <q-input dark outlined dense v-model="viewForm.epf_no" />
                        </div>

                        <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                          EPF Amount
                        </div>
                        <div class="col-9">
                          <q-input dark outlined dense v-model="viewForm.epf_amount" />
                        </div>
                      </template>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Welfare Amount
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.welfare_amount" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">OT</div>
                      <div class="col-9">
                        <q-select
                          dark
                          outlined
                          dense
                          v-model="viewForm.ot"
                          :options="['Eligible', 'Not Eligible']"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Confirm Date
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense type="date" v-model="viewForm.confirm_date" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Resign Date
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense type="date" v-model="viewForm.resign_date" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Pay Type
                      </div>
                      <div class="col-9">
                        <q-select
                          dark
                          outlined
                          dense
                          v-model="viewForm.pay_type"
                          :options="['Cash', 'Bank', 'Cheque']"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Bank
                      </div>
                      <div class="col-9">
                        <q-select
                          dark
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

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Branch
                      </div>
                      <div class="col-9">
                        <q-select
                          dark
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

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Account Name
                      </div>
                      <div class="col-9">
                        <q-input
                          dark
                          outlined
                          dense
                          v-model="viewForm.bank_account_name"
                          placeholder="Account holder name"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Account No
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.bank_account_number" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Join Date
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense type="date" v-model="viewForm.hire_date" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Salary / Shift Rate
                      </div>
                      <div class="col-9">
                        <q-input dark outlined dense v-model="viewForm.shift_rate" />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium text-grey-4">
                        Shift
                      </div>
                      <div class="col-9">
                        <q-select
                          dark
                          outlined
                          dense
                          v-model="viewForm.shift"
                          :options="['Select Shift']"
                        />
                      </div>

                      <div class="col-3"></div>
                      <div class="col-9 column q-gutter-y-xs q-mt-sm">
                        <q-checkbox
                          dark
                          v-if="viewForm.ot === 'Eligible'"
                          v-model="viewForm.morning_ot"
                          label="Morning OT Pay"
                          dense
                          size="sm"
                          color="amber-8"
                          class="text-grey-3"
                        />
                        <q-checkbox
                          dark
                          v-model="viewForm.late_deduct"
                          label="Late Pay Deduct"
                          dense
                          size="sm"
                          color="amber-8"
                          class="text-grey-3"
                        />
                        <q-checkbox
                          dark
                          v-model="viewForm.no_pay_deduct"
                          label="No Pay Deduct"
                          dense
                          size="sm"
                          color="amber-8"
                          class="text-grey-3"
                        />
                        <q-checkbox
                          dark
                          v-if="viewForm.epf_etf_eligible"
                          v-model="viewForm.epf_attend"
                          label="EPF Attend"
                          dense
                          size="sm"
                          color="amber-8"
                          class="text-grey-3"
                        />
                      </div>

                      <div class="col-3 text-right q-pr-md text-weight-medium q-mt-md text-grey-4">
                        User Pic
                      </div>
                      <div class="col-9 q-mt-md">
                        <q-file
                          dark
                          outlined
                          dense
                          v-model="viewForm.user_pic"
                          label="Image Upload"
                        >
                          <template v-slot:prepend><q-icon name="image" size="xs" /></template>
                        </q-file>
                      </div>

                      <div class="col-12 text-right q-mt-lg">
                        <q-separator
                          dark
                          class="q-mb-md"
                          style="background: rgba(255, 255, 255, 0.05)"
                        />
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
                    <div class="row items-center q-mb-md">
                      <div class="text-subtitle1 text-weight-bold text-grey-3">
                        Employee Documents
                      </div>
                      <q-space />
                      <q-btn
                        color="amber-8"
                        text-color="dark"
                        icon="upload"
                        label="Upload Document"
                        unelevated
                        no-caps
                        size="sm"
                        @click="openUploadDoc"
                      />
                    </div>

                    <!-- Document Type Grid -->
                    <div class="row q-col-gutter-md q-mb-lg">
                      <div
                        v-for="docType in docTypeGroups"
                        :key="docType.key"
                        class="col-12 col-sm-6 col-md-4"
                      >
                        <q-card
                          flat
                          bordered
                          style="
                            background: rgba(255, 255, 255, 0.03);
                            border-color: rgba(255, 255, 255, 0.08);
                          "
                        >
                          <q-card-section class="q-pa-sm">
                            <div class="row items-center q-mb-xs">
                              <q-icon
                                :name="docType.icon"
                                :color="docType.color"
                                size="18px"
                                class="q-mr-xs"
                              />
                              <span class="text-caption text-weight-bold text-grey-3">{{
                                docType.label
                              }}</span>
                            </div>
                            <div
                              v-if="empDocsByType[docType.key] && empDocsByType[docType.key].length"
                            >
                              <div
                                v-for="doc in empDocsByType[docType.key]"
                                :key="doc.id"
                                class="row items-center q-py-xs"
                                style="border-top: 1px solid rgba(255, 255, 255, 0.05)"
                              >
                                <q-icon
                                  name="description"
                                  size="14px"
                                  color="blue-3"
                                  class="q-mr-xs"
                                />
                                <span
                                  class="text-caption text-grey-4 ellipsis"
                                  style="max-width: 120px"
                                  >{{ doc.doc_name }}</span
                                >
                                <q-space />
                                <q-btn
                                  flat
                                  round
                                  dense
                                  icon="open_in_new"
                                  color="blue"
                                  size="xs"
                                  @click="viewDoc(doc)"
                                >
                                  <q-tooltip>View</q-tooltip>
                                </q-btn>
                                <q-btn
                                  flat
                                  round
                                  dense
                                  icon="delete"
                                  color="negative"
                                  size="xs"
                                  @click="deleteDoc(doc)"
                                >
                                  <q-tooltip>Delete</q-tooltip>
                                </q-btn>
                              </div>
                            </div>
                            <div v-else class="text-caption text-grey-6 q-pt-xs">Not uploaded</div>
                          </q-card-section>
                        </q-card>
                      </div>
                    </div>

                    <!-- All Documents Table -->
                    <q-table
                      dark
                      flat
                      bordered
                      dense
                      :rows="empDocuments"
                      :columns="docColumns"
                      row-key="id"
                      :loading="loadingDocs"
                      :pagination="{ rowsPerPage: 10 }"
                      class="bg-grey-9"
                    >
                      <template #body-cell-verified="props">
                        <q-td :props="props">
                          <q-badge
                            :color="props.row.verified ? 'green' : 'grey'"
                            :label="props.row.verified ? 'Verified' : 'Pending'"
                          />
                        </q-td>
                      </template>
                      <template #body-cell-actions="props">
                        <q-td :props="props" class="q-gutter-xs">
                          <q-btn
                            flat
                            round
                            dense
                            icon="open_in_new"
                            color="blue"
                            size="xs"
                            @click="viewDoc(props.row)"
                          >
                            <q-tooltip>View</q-tooltip>
                          </q-btn>
                          <q-btn
                            flat
                            round
                            dense
                            icon="verified_user"
                            color="green"
                            size="xs"
                            v-if="!props.row.verified"
                            @click="verifyDoc(props.row)"
                          >
                            <q-tooltip>Mark Verified</q-tooltip>
                          </q-btn>
                          <q-btn
                            flat
                            round
                            dense
                            icon="delete"
                            color="negative"
                            size="xs"
                            @click="deleteDoc(props.row)"
                          >
                            <q-tooltip>Delete</q-tooltip>
                          </q-btn>
                        </q-td>
                      </template>
                    </q-table>
                  </q-tab-panel>

                  <!-- ══ LEAVE TAB ══════════════════════════════════════════ -->
                  <q-tab-panel name="leave" class="q-pa-md">
                    <div class="text-subtitle1 text-weight-bold text-grey-3 q-mb-md">
                      Leave Entitlements — {{ new Date().getFullYear() }}
                    </div>

                    <!-- Balance Cards -->
                    <div class="row q-col-gutter-md q-mb-lg">
                      <div
                        v-for="bal in empLeaveBalances"
                        :key="bal.leave_type_id"
                        class="col-12 col-sm-6 col-md-4"
                      >
                        <q-card
                          flat
                          bordered
                          :style="{
                            background: 'rgba(255,255,255,0.03)',
                            borderColor: 'rgba(255,255,255,0.08)',
                            borderTop: '3px solid ' + leaveTypeColor(bal.leave_type_name),
                          }"
                        >
                          <q-card-section class="q-pa-md">
                            <div class="row items-center q-mb-sm">
                              <q-badge
                                :color="bal.is_paid ? 'green' : 'orange'"
                                :label="bal.is_paid ? 'Paid' : 'Unpaid'"
                                class="q-mr-sm"
                              />
                              <span class="text-subtitle2 text-weight-bold text-grey-3">{{
                                bal.leave_type_name
                              }}</span>
                            </div>
                            <div class="row q-col-gutter-sm text-caption">
                              <div class="col-4 text-center">
                                <div class="text-grey-5">Entitled</div>
                                <div class="text-h6 text-weight-bold text-white">
                                  {{ bal.total_entitlement }}
                                </div>
                              </div>
                              <div class="col-4 text-center">
                                <div class="text-grey-5">Used</div>
                                <div class="text-h6 text-weight-bold text-orange">
                                  {{ bal.used_days }}
                                </div>
                              </div>
                              <div class="col-4 text-center">
                                <div class="text-grey-5">Remaining</div>
                                <div
                                  class="text-h6 text-weight-bold"
                                  :class="bal.remaining_days > 0 ? 'text-green' : 'text-red'"
                                >
                                  {{ bal.remaining_days }}
                                </div>
                              </div>
                            </div>
                            <q-linear-progress
                              :value="
                                bal.total_entitlement > 0
                                  ? bal.used_days / bal.total_entitlement
                                  : 0
                              "
                              :color="bal.remaining_days > 0 ? 'amber' : 'red'"
                              track-color="grey-8"
                              class="q-mt-sm"
                              rounded
                              size="6px"
                            />
                            <div
                              v-if="bal.pending_days > 0"
                              class="text-caption text-amber q-mt-xs"
                            >
                              {{ bal.pending_days }} day(s) pending approval
                            </div>
                          </q-card-section>
                        </q-card>
                      </div>
                    </div>

                    <div v-if="loadingLeave" class="text-center text-grey-5 q-pa-md">
                      <q-spinner size="24px" /> Loading leave balances…
                    </div>
                    <div
                      v-if="!loadingLeave && !empLeaveBalances.length"
                      class="text-grey-5 text-center q-pa-md"
                    >
                      No leave types configured. Set up leave types in the Leave Management tab.
                    </div>

                    <!-- Initialize Balances Button -->
                    <div class="row justify-end q-mt-md">
                      <q-btn
                        outline
                        color="amber-8"
                        size="sm"
                        no-caps
                        icon="refresh"
                        label="Refresh / Initialize Balances for Current Year"
                        :loading="initializingLeave"
                        @click="initLeaveBalances"
                      />
                    </div>
                  </q-tab-panel>

                  <!-- ══ ADVANCES TAB ═══════════════════════════════════════════════ -->
                  <q-tab-panel name="advances" class="q-pa-md">
                    <div class="row items-center q-mb-md">
                      <div>
                        <div class="text-subtitle1 text-weight-bold text-grey-3">
                          Salary Advances
                        </div>
                        <div class="text-caption text-grey-5">
                          Advances are auto-deducted from payroll in installments
                        </div>
                      </div>
                      <q-space />
                      <q-btn
                        color="amber-8"
                        text-color="dark"
                        icon="add"
                        label="New Advance"
                        unelevated
                        no-caps
                        size="sm"
                        @click="openNewAdvance"
                      />
                    </div>

                    <!-- Summary strip -->
                    <div v-if="empAdvances.length" class="row q-col-gutter-md q-mb-md">
                      <div class="col-4">
                        <q-card
                          flat
                          style="
                            background: rgba(251, 191, 36, 0.08);
                            border: 1px solid rgba(251, 191, 36, 0.2);
                          "
                          class="q-pa-sm text-center"
                        >
                          <div class="text-caption text-grey-5">Total Advanced</div>
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
                          <div class="text-caption text-grey-5">Recovered</div>
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
                          <div class="text-caption text-grey-5">Outstanding</div>
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
                      class="text-grey-5 text-center q-pa-lg"
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
            dark
            outlined
            v-model="uploadDocForm.doc_type"
            :options="docTypeOptions"
            label="Document Type *"
            emit-value
            map-options
          />
          <q-input
            dark
            outlined
            v-model="uploadDocForm.doc_name"
            label="Document Name / Label"
            hint="e.g. NIC Front Side, Contract 2025"
          />
          <q-file
            dark
            outlined
            v-model="uploadDocForm.file"
            label="Select File (PDF / Image)"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            max-file-size="10485760"
          >
            <template #prepend><q-icon name="attach_file" /></template>
          </q-file>
          <q-input
            dark
            outlined
            v-model="uploadDocForm.expiry_date"
            type="date"
            label="Expiry Date (optional)"
            stack-label
          />
          <q-input
            dark
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
                dark
                outlined
                v-model.number="advanceForm.amount"
                label="Advance Amount (LKR) *"
                type="number"
                prefix="LKR"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                dark
                outlined
                v-model.number="advanceForm.installments"
                label="Recovery Installments *"
                type="number"
                hint="Number of months to recover"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                dark
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
                <div class="text-caption text-grey-5">Monthly Deduction</div>
                <div class="text-subtitle1 text-weight-bold text-amber">
                  LKR {{ (advanceForm.amount / advanceForm.installments).toFixed(2) }}
                </div>
                <div class="text-caption text-grey-6">
                  × {{ advanceForm.installments }} installment(s)
                </div>
              </q-card>
            </div>
            <div class="col-12">
              <q-input
                dark
                outlined
                v-model="advanceForm.reason"
                label="Reason"
                type="textarea"
                rows="2"
              />
            </div>
            <div class="col-12">
              <q-input
                dark
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

    <!-- ══════════ ADD DESIGNATION DIALOG ══════════ -->
    <q-dialog v-model="showDesigDialog" persistent>
      <q-card
        class="full-width"
        style="max-width: 480px; background: var(--erp-bg-form-card, #111827); color: #fff"
      >
        <q-card-section class="row items-center">
          <q-icon name="badge" size="24px" color="amber-6" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">
            {{ editingDesig ? 'Edit Designation' : 'New Designation' }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section class="q-gutter-md">
          <q-input
            dark
            outlined
            v-model="desigForm.title"
            label="Designation Title *"
            :rules="[r.req]"
            @keyup.enter="saveDesig"
          />
          <q-select
            dark
            outlined
            v-model="desigForm.department_id"
            :options="departmentOptions"
            label="Department (optional)"
            emit-value
            map-options
            clearable
          />
          <q-input
            dark
            outlined
            v-model="desigForm.description"
            label="Description"
            type="textarea"
            rows="2"
          />
          <q-toggle dark v-model="desigForm.is_active" label="Active" color="primary" />
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
        class="full-width"
        style="max-width: 480px; background: var(--erp-bg-form-card, #111827); color: #fff"
      >
        <q-card-section class="row items-center">
          <q-icon name="account_tree" size="24px" color="indigo" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold">
            {{ editingDept ? 'Edit Department' : 'New Department' }}
          </div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-separator dark />
        <q-card-section class="q-gutter-md">
          <q-input
            dark
            outlined
            v-model="deptForm.name"
            label="Department Name *"
            :rules="[r.req]"
            @keyup.enter="saveDept"
          />
          <q-input
            dark
            outlined
            v-model="deptForm.description"
            label="Description"
            type="textarea"
            rows="2"
          />
          <q-toggle dark v-model="deptForm.is_active" label="Active" color="primary" />
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
  </q-page>
</template>

<script setup>
import ERPToolbar from 'src/components/erp/ERPToolbar.vue'
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

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

async function uploadEmployeePhoto(empId, file) {
  try {
    const ext = file.name.split('.').pop()
    const path = `${empId}/photo.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('employee-photos')
      .upload(path, file, { upsert: true })
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
  pay_type: 'Shift Base',
  ot: 'Eligible',
  shift: 'Select Shift',
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

const columns = [
  { name: 'view_id', label: 'ID', align: 'left' },
  { name: 'name', label: 'Name', align: 'left', field: 'full_name', sortable: true },
  { name: 'mobile', label: 'Phone_NO', align: 'left', field: 'mobile', sortable: true },
  { name: 'nic_number', label: 'NIC', align: 'left', field: 'nic_number', sortable: true },
  { name: 'epf_no', label: 'EPF_No', align: 'left', field: 'epf_no', sortable: true },
  {
    name: 'designation',
    label: 'Designation',
    align: 'left',
    field: (r) => r.designations?.title || '—',
    sortable: true,
  },
  { name: 'actions', label: 'Actions', align: 'center' },
]

const viewTab = ref('settings')
const viewEmpSystemApp = ref(false)

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

const docTypeGroups = [
  { key: 'nic_front', label: 'NIC Front', icon: 'badge', color: 'cyan' },
  { key: 'nic_back', label: 'NIC Back', icon: 'badge', color: 'cyan' },
  { key: 'photo', label: 'Photograph', icon: 'photo_camera', color: 'amber' },
  { key: 'contract_letter', label: 'Contract Letter', icon: 'description', color: 'green' },
  { key: 'gs_letter', label: 'GS Letter', icon: 'article', color: 'indigo' },
  { key: 'birth_certificate', label: 'Birth Certificate', icon: 'child_care', color: 'purple' },
]

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

const docColumns = [
  { name: 'doc_type', label: 'Type', align: 'left', field: 'doc_type' },
  { name: 'doc_name', label: 'Name', align: 'left', field: 'doc_name' },
  { name: 'verified', label: 'Status', align: 'center', field: 'verified' },
  { name: 'expiry_date', label: 'Expiry', align: 'left', field: 'expiry_date' },
  { name: 'actions', label: '', align: 'center', field: 'actions' },
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
  } catch (err) {
    console.error('[HR-Docs] Failed to load:', err.message)
  } finally {
    loadingDocs.value = false
  }
}

function openUploadDoc() {
  Object.assign(uploadDocForm, {
    doc_type: null,
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
    const file = uploadDocForm.file
    const ext = file.name.split('.').pop()
    const path = `${empId}/${uploadDocForm.doc_type}_${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('employee-documents')
      .upload(path, file, { upsert: false })
    if (uploadErr) throw uploadErr

    const { error: dbErr } = await supabase.from('employee_documents').insert({
      company_id: authStore.currentBranch?.company_id,
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

async function viewDoc(doc) {
  try {
    const { data } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(doc.file_path, 60 * 10) // 10-minute signed URL
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else $q.notify({ type: 'warning', message: 'Could not generate view URL' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
}

async function verifyDoc(doc) {
  try {
    const { error } = await supabase
      .from('employee_documents')
      .update({
        verified: true,
        verified_by: authStore.user?.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', doc.id)
    if (error) throw error
    $q.notify({ type: 'positive', message: 'Document marked as verified' })
    loadEmpDocuments(viewEmp.value?.id)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  }
}

async function deleteDoc(doc) {
  $q.dialog({
    title: 'Delete Document',
    message: `Delete "${doc.doc_name}"?`,
    cancel: true,
    color: 'negative',
  }).onOk(async () => {
    try {
      await supabase.storage.from('employee-documents').remove([doc.file_path])
      await supabase.from('employee_documents').delete().eq('id', doc.id)
      $q.notify({ type: 'positive', message: 'Document deleted' })
      loadEmpDocuments(viewEmp.value?.id)
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message })
    }
  })
}

// ── Leave Balances (per-employee, in View Profile) ────────────────────────────
const empLeaveBalances = ref([])
const loadingLeave = ref(false)
const initializingLeave = ref(false)

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

function leaveTypeColor(name) {
  if (!name) return '#6366f1'
  const n = name.toLowerCase()
  if (n.includes('annual')) return '#22c55e'
  if (n.includes('casual')) return '#3b82f6'
  if (n.includes('sick')) return '#ef4444'
  return '#f59e0b'
}

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

async function initLeaveBalances() {
  initializingLeave.value = true
  try {
    const year = new Date().getFullYear()
    const { error } = await supabase.rpc('initialize_leave_balances', {
      p_year: year,
      p_employee_id: viewEmp.value?.id,
    })
    if (error) throw error
    $q.notify({ type: 'positive', message: `Leave balances initialized for ${year}` })
    loadEmpLeaveBalances(viewEmp.value?.id)
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    initializingLeave.value = false
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

function openNewAdvance() {
  Object.assign(advanceForm, {
    amount: 0,
    installments: 1,
    reason: '',
    advance_date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  showNewAdvance.value = true
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
  shift: 'Select Shift',
  epf_etf_eligible: false,
  morning_ot: false,
  late_deduct: false,
  no_pay_deduct: false,
  epf_attend: false,
  user_pic: null,
})

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
      .select('*, departments(name), designations(title)')
      .eq('branch_id', branchId)
      .order('first_name')
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

function openForm(emp) {
  if (emp) {
    isEditing.value = true
    Object.keys(defaultForm).forEach((k) => {
      form[k] = emp[k] ?? defaultForm[k]
    })
    form.id = emp.id
  } else {
    isEditing.value = false
    Object.assign(form, { ...defaultForm })
    generateCode()
  }
  showForm.value = true
}

async function viewEmployee(emp) {
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

  // Load photo URL
  viewEmpPhotoUrl.value = emp.photo_url || ''

  // Load salary structure
  try {
    const { data } = await supabase
      .from('salary_structures')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('is_current', true)
      .limit(1)
      .single()
    viewEmpSalary.value = data || null
  } catch {
    viewEmpSalary.value = null
  }

  // Load documents, leave balances, and advances in parallel
  await Promise.all([
    loadEmpDocuments(emp.id),
    loadEmpLeaveBalances(emp.id),
    loadEmpAdvances(emp.id),
  ])

  viewTab.value = 'settings'
  showDetail.value = true
}

async function saveEmployee() {
  saving.value = true
  try {
    const payload = { ...form }
    const empId = payload.id
    delete payload.id

    // Salary structure fields — extracted before employee insert
    const salaryPayload = {
      salary_method: payload.salary_method ?? 'basic_salary',
      basic_salary: payload.basic_salary ?? 0,
      hourly_rate: payload.hourly_rate ?? 0,
      day_rate: payload.day_rate ?? 0,
      unit_rate: payload.unit_rate ?? 0,
      housing_allowance: payload.housing_allowance ?? 0,
      transport_allowance: payload.transport_allowance ?? 0,
      meal_allowance: payload.meal_allowance ?? 0,
      overtime_rate_multiplier: payload.overtime_rate_multiplier ?? 1.5,
      holiday_ot_multiplier: payload.holiday_ot_multiplier ?? 2.0,
      epf_employee_pct: payload.epf_employee_pct ?? 8,
      epf_employer_pct: 12,
      etf_employer_pct: 3,
      other_allowances: 0,
      salary_type: 'monthly',
      is_current: true,
      effective_from: new Date().toISOString().split('T')[0],
      company_id: authStore.currentBranch?.company_id,
    }

    // Remove salary-structure-only keys from employee payload
    const salaryKeys = [
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
    ]
    salaryKeys.forEach((k) => delete payload[k])

    // Strip UI-only fields that do NOT exist in the employees table
    delete payload.salary
    delete payload.title
    delete payload.pay_type
    delete payload.ot
    delete payload.shift
    delete payload.probation_period
    delete payload.epf_amount
    delete payload.welfare_amount
    delete payload.internal_company
    delete payload.morning_ot
    delete payload.late_deduct
    delete payload.no_pay_deduct
    delete payload.etf_allowed
    // Extract user_pic File before deleting from payload
    const userPicFile = payload.user_pic
    delete payload.user_pic
    delete payload.epf_etf_eligible
    delete payload.shift_rate

    // Map phone field
    if (payload.mobile && !payload.phone) {
      payload.phone = payload.mobile
    }

    payload.company_id = authStore.currentBranch?.company_id
    payload.branch_id = authStore.currentBranch?.id
    payload.created_by = authStore.user?.id

    let targetEmpId = empId

    if (isEditing.value) {
      const { error } = await supabase.from('employees').update(payload).eq('id', empId)
      if (error) throw error
      $q.notify({ type: 'positive', message: 'Employee updated successfully' })
    } else {
      const { data, error } = await supabase.from('employees').insert(payload).select('id').single()
      if (error) throw error
      targetEmpId = data.id
      $q.notify({ type: 'positive', message: 'Employee added successfully' })
    }

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

    showForm.value = false
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
    const payload = {
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
    }

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

watch(statusFilter, () => loadEmployees())

onMounted(() => {
  loadEmployees()
  loadOptions()
})
</script>

<style scoped lang="scss">
.erp-stat-card {
  background: var(--erp-bg-form-card, #111827);
  border: 1px solid var(--erp-input-border, #374151);
  border-radius: 12px;
}
.erp-data-grid {
  background: var(--erp-bg-form-card, #111827);
  border-radius: 12px;
}
</style>
