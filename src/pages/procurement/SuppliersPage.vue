<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5">Suppliers</div>
      <q-btn color="primary" icon="add" label="Add Supplier" @click="openDialog" />
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
          />
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

    <!-- Add/Edit Dialog -->
    <q-dialog v-model="dialogVisible" persistent>
      <q-card style="min-width: 500px">
        <q-card-section>
          <div class="text-h6">{{ isEditing ? 'Edit Supplier' : 'New Supplier' }}</div>
        </q-card-section>

        <q-card-section>
          <q-form @submit="saveSupplier" class="q-gutter-md">
            <div class="row q-col-gutter-sm">
              <q-input
                v-model="form.code"
                label="Code *"
                hint="Auto-generated if empty"
                outlined
                dense
                class="col-6"
                readonly
              />
              <q-input
                v-model="form.name"
                label="Supplier Name *"
                outlined
                dense
                class="col-6"
                :rules="[(val) => !!val || 'Name is required']"
              />
            </div>

            <div class="row q-col-gutter-sm">
              <q-input
                v-model="form.contact_person"
                label="Contact Person"
                outlined
                dense
                class="col-6"
              />
              <q-input v-model="form.phone" label="Phone" outlined dense class="col-6" />
            </div>

            <div class="row q-col-gutter-sm">
              <q-input
                v-model="form.email"
                label="Email"
                type="email"
                outlined
                dense
                class="col-6"
              />
              <q-input v-model="form.tax_id" label="Tax ID / VAT No" outlined dense class="col-6" />
            </div>

            <q-input
              v-model="form.address"
              label="Address"
              type="textarea"
              outlined
              dense
              rows="2"
            />

            <div class="row q-col-gutter-sm">
              <q-input
                v-model.number="form.payment_terms_days"
                label="Payment Terms (Days)"
                type="number"
                outlined
                dense
                class="col-6"
              />
            </div>

            <q-toggle v-model="form.is_active" label="Active" />

            <div class="row justify-end q-mt-lg">
              <q-btn label="Cancel" flat color="grey" v-close-popup class="q-mr-sm" />
              <q-btn
                :label="isEditing ? 'Update' : 'Save'"
                type="submit"
                color="primary"
                :loading="saving"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { listSuppliers, upsertSupplier } from 'src/services/procurementService'

const $q = useQuasar()

const suppliers = ref([])
const loading = ref(false)
const filter = ref('')
const dialogVisible = ref(false)
const saving = ref(false)
const isEditing = ref(false)

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

function openDialog() {
  isEditing.value = false
  form.value = { ...defaultForm }
  dialogVisible.value = true
}

function editSupplier(row) {
  isEditing.value = true
  form.value = { ...row }
  dialogVisible.value = true
}

async function saveSupplier() {
  saving.value = true
  try {
    if (isEditing.value && form.value.id) {
      await upsertSupplier({ ...form.value, name: form.value.name, code: form.value.code })
      $q.notify({ type: 'positive', message: 'Supplier updated' })
    } else {
      await upsertSupplier({ ...form.value, name: form.value.name, code: form.value.code })
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
</script>
