<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5">Suppliers</div>
      <q-btn class="erp-btn-primary" icon="add" label="Add Supplier" @click="openDialog" />
    </div>

    <!-- Search & Filter -->
    <div class="row q-mb-md">
      <q-input
        dense
        outlined
        v-model="filter"
        placeholder="Search suppliers..."
        class="col-12 col-md-4"
      >
        <template v-slot:append>
          <q-icon name="search" />
        </template>
      </q-input>
    </div>

    <!-- Suppliers Table -->
    <q-table
      :rows="suppliers"
      :columns="columns"
      row-key="id"
      :filter="filter"
      :loading="loading"
      flat
      bordered
    >
      <template v-slot:body-cell-credit_limit="props">
        <q-td :props="props" align="right">
          {{ formatCurrency(props.row.credit_limit) }}
        </q-td>
      </template>

      <template v-slot:body-cell-balance="props">
        <q-td
          :props="props"
          align="right"
          class="text-weight-bold"
          :class="props.row.balance > 0 ? 'text-negative' : 'text-green'"
        >
          {{ formatCurrency(props.row.balance) }}
        </q-td>
      </template>

      <template v-slot:body-cell-payment_terms_days="props">
        <q-td :props="props" align="right"> {{ props.row.payment_terms_days }} Days </q-td>
      </template>

      <template v-slot:body-cell-actions="props">
        <q-td :props="props" align="right">
          <q-btn
            flat
            round
            color="primary"
            icon="edit"
            size="sm"
            @click="editSupplier(props.row)"
          >
            <q-tooltip>Edit</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            color="negative"
            icon="delete"
            size="sm"
            @click="deleteSupplierAction(props.row)"
            class="q-ml-sm"
          >
            <q-tooltip>Delete</q-tooltip>
          </q-btn>
        </q-td>
      </template>

      <template v-slot:body-cell-is_active="props">
        <q-td :props="props">
          <q-chip
            :color="props.row.is_active ? 'green' : 'grey'"
            text-color="white"
            dense
            size="sm"
          >
            {{ props.row.is_active ? 'Active' : 'Inactive' }}
          </q-chip>
        </q-td>
      </template>
    </q-table>

    <!-- Add/Edit Dialog using ERPFormCard -->
    <q-dialog v-model="dialogVisible" persistent full-height position="right">
      <div
        style="width: 500px; max-width: 100vw; height: 100vh; background-color: var(--erp-bg-main)"
      >
        <q-scroll-area class="fit">
          <div class="q-pa-lg">
            <ERPFormCard
              :title="isEditing ? 'Edit Supplier' : 'New Supplier'"
              :subtitle="
                isEditing ? `Editing ${form.name}` : 'Register a new supplier for procurement'
              "
              :loading="saving"
              submit-label="Save Supplier"
              @submit="saveSupplier"
              @cancel="dialogVisible = false"
              ref="erpForm"
            >
              <ERPFormSection title="General Information" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <ERPFormField label="Code" helper="Leave empty to auto-generate">
                      <q-input v-model="form.code" dense outlined placeholder="SUP-XXXX" readonly />
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <ERPFormField label="Supplier Name" required :error="vErrors.name">
                      <q-input
                        v-model="form.name"
                        dense
                        outlined
                        placeholder="Enter business name"
                        @update:model-value="vErrors.name = ''"
                      />
                    </ERPFormField>
                  </div>
                </div>
              </ERPFormSection>

              <ERPFormSection title="Contact Details" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <ERPFormField label="Contact Person">
                      <q-input
                        v-model="form.contact_person"
                        dense
                        outlined
                        placeholder="e.g. John Doe"
                      />
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-6">
                    <ERPFormField label="Phone">
                      <q-input
                        v-model="form.phone"
                        type="tel"
                        dense
                        outlined
                        placeholder="+1 234 567 8900"
                      />
                    </ERPFormField>
                  </div>
                  <div class="col-6">
                    <ERPFormField label="Email" :error="vErrors.email">
                      <q-input
                        v-model="form.email"
                        type="email"
                        dense
                        outlined
                        placeholder="email@example.com"
                        @update:model-value="vErrors.email = ''"
                      />
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md">
                  <div class="col-12">
                    <ERPFormField label="Address">
                      <q-input v-model="form.address" type="textarea" dense outlined autogrow />
                    </ERPFormField>
                  </div>
                </div>
              </ERPFormSection>

              <ERPFormSection title="Finance & Terms" collapsible>
                <div class="row q-col-gutter-md">
                  <div class="col-6">
                    <ERPFormField label="Tax ID / VAT No">
                      <q-input v-model="form.tax_id" dense outlined placeholder="TAX-12345" />
                    </ERPFormField>
                  </div>
                  <div class="col-6">
                    <ERPFormField label="Payment Terms">
                      <q-input
                        v-model.number="form.payment_terms_days"
                        type="number"
                        dense
                        outlined
                        placeholder="30"
                      >
                        <template #append><span style="font-size: 11px">Days</span></template>
                      </q-input>
                    </ERPFormField>
                  </div>
                </div>
                <div class="row q-col-gutter-md q-mt-sm">
                  <div class="col-12">
                    <ERPStyledToggle label="Active Supplier" v-model="form.is_active" />
                  </div>
                </div>
              </ERPFormSection>
            </ERPFormCard>
          </div>
        </q-scroll-area>
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { listSuppliers, upsertSupplier, deleteSupplier } from 'src/services/procurementService'
import ERPFormCard from 'components/erp/ERPFormCard.vue'
import ERPFormSection from 'components/erp/ERPFormSection.vue'
import ERPFormField from 'components/erp/ERPFormField.vue'
import ERPStyledToggle from 'components/erp/ERPStyledToggle.vue'

const $q = useQuasar()

const suppliers = ref([])
const loading = ref(false)
const filter = ref('')
const dialogVisible = ref(false)
const saving = ref(false)
const isEditing = ref(false)
const erpForm = ref(null)

// Form State
const defaultForm = {
  id: undefined,
  code: '',
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  tax_id: '',
  payment_terms_days: 30,
  is_active: true,
}

const form = ref({ ...defaultForm })
const vErrors = reactive({ name: '', email: '' })

const columns = [
  { name: 'code', label: 'Code', field: 'code', sortable: true, align: 'left' },
  { name: 'name', label: 'Name', field: 'name', sortable: true, align: 'left' },
  { name: 'contact_person', label: 'Contact', field: 'contact_person', align: 'left' },
  { name: 'phone', label: 'Phone', field: 'phone', align: 'left' },
  {
    name: 'credit_limit',
    label: 'Credit Limit',
    field: 'credit_limit',
    align: 'right',
    sortable: true,
  },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', sortable: true },
  { name: 'is_active', label: 'Status', field: 'is_active', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'right' },
]

onMounted(() => {
  fetchSuppliers()
})

async function fetchSuppliers() {
  loading.value = true
  try {
    suppliers.value = await listSuppliers()
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'Failed to fetch suppliers',
      caption: err.message,
    })
  } finally {
    loading.value = false
  }
}

function formatCurrency(val) {
  return (val || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })
}

function clearErrors() {
  vErrors.name = ''
  vErrors.email = ''
}

function openDialog() {
  isEditing.value = false
  form.value = { ...defaultForm }
  clearErrors()
  dialogVisible.value = true
}

function editSupplier(row) {
  isEditing.value = true
  form.value = { ...row }
  clearErrors()
  dialogVisible.value = true
}

function validateForm() {
  let isValid = true
  clearErrors()

  if (!form.value.name || form.value.name.trim() === '') {
    vErrors.name = 'Name is required'
    isValid = false
  }

  if (form.value.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.value.email)) {
      vErrors.email = 'Invalid email format'
      isValid = false
    }
  }

  return isValid
}

async function saveSupplier() {
  if (!validateForm()) {
    erpForm.value?.validationError()
    return
  }

  saving.value = true
  try {
    if (isEditing.value && form.value.id) {
      await upsertSupplier({ ...form.value, name: form.value.name.trim(), code: form.value.code })
      $q.notify({ type: 'positive', message: 'Supplier updated' })
    } else {
      await upsertSupplier({ ...form.value, name: form.value.name.trim(), code: form.value.code })
      $q.notify({ type: 'positive', message: 'Supplier created' })
    }
    dialogVisible.value = false
    fetchSuppliers()
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: 'Failed to save supplier',
      caption: err.message,
    })
  } finally {
    saving.value = false
  }
}

function deleteSupplierAction(row) {
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete supplier "${row.name}"?`,
    cancel: true,
    persistent: true,
    color: 'negative'
  }).onOk(async () => {
    try {
      await deleteSupplier(row.id)
      $q.notify({ type: 'positive', message: 'Supplier deleted successfully' })
      fetchSuppliers()
    } catch (err) {
      $q.notify({
        type: 'negative',
        message: 'Failed to delete supplier',
        caption: err.message,
      })
    }
  })
}
</script>
