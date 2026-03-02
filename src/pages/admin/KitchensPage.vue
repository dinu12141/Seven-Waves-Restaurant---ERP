<template>
  <q-page class="q-pa-md">
    <PageHeader
      title="Kitchen Management"
      subtitle="Configure kitchen stations and displays"
      show-back
      back-route="/admin"
    />

    <q-card flat bordered class="q-mt-md">
      <q-card-section>
        <div class="row q-col-gutter-md items-center">
          <div class="col-12 col-md-4">
            <q-input
              dense
              outlined
              v-model="search"
              placeholder="Search kitchens..."
              class="bg-white"
            >
              <template v-slot:append>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>
          <div class="col-12 col-md-8 text-right">
            <q-btn color="primary" icon="add" label="Add Kitchen" @click="openDialog" />
          </div>
        </div>
      </q-card-section>

      <q-table :rows="kitchens" :columns="columns" row-key="id" :filter="search" flat>
        <template v-slot:body-cell-type="props">
          <q-td :props="props">
            <q-badge :color="getTypeColor(props.row.type)">
              {{ props.row.type.toUpperCase() }}
            </q-badge>
          </q-td>
        </template>
        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="q-gutter-sm">
            <q-btn
              flat
              round
              color="primary"
              icon="edit"
              size="sm"
              @click="editKitchen(props.row)"
            />
            <q-btn
              flat
              round
              color="negative"
              icon="delete"
              size="sm"
              @click="deleteKitchen(props.row)"
            />
          </q-td>
        </template>
      </q-table>
    </q-card>

    <!-- Add/Edit Kitchen Dialog -->
    <q-dialog v-model="dialogVisible">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">{{ isEditing ? 'Edit Kitchen' : 'Add New Kitchen' }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-form @submit="saveKitchen" class="q-gutter-md">
            <q-input
              v-model="form.name"
              label="Kitchen Name"
              outlined
              dense
              :rules="[(val) => !!val || 'Name is required']"
            />

            <q-select
              v-model="form.branch"
              label="Branch"
              :options="['Main Branch', 'Downtown', 'Airport']"
              outlined
              dense
              :rules="[(val) => !!val || 'Branch is required']"
            />

            <q-select
              v-model="form.type"
              label="Kitchen Type"
              :options="['main', 'grill', 'bar', 'dessert']"
              outlined
              dense
            />

            <q-toggle v-model="form.active" label="Active" />

            <div class="row justify-end q-mt-lg">
              <q-btn label="Cancel" color="grey" flat v-close-popup />
              <q-btn
                :label="isEditing ? 'Update' : 'Save'"
                type="submit"
                color="primary"
                class="q-ml-sm"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, reactive } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const search = ref('')
const dialogVisible = ref(false)
const isEditing = ref(false)

const columns = [
  { name: 'name', label: 'Kitchen Name', align: 'left', field: 'name', sortable: true },
  { name: 'branch', label: 'Branch', align: 'left', field: 'branch', sortable: true },
  { name: 'type', label: 'Type', align: 'center', field: 'type', sortable: true },
  {
    name: 'active',
    label: 'Active',
    align: 'center',
    field: 'active',
    format: (val) => (val ? 'Yes' : 'No'),
  },
  { name: 'actions', label: 'Actions', align: 'center', field: 'actions' },
]

const kitchens = ref([
  { id: 1, name: 'Main Kitchen', branch: 'Main Branch', type: 'main', active: true },
  { id: 2, name: 'Bar Counter', branch: 'Main Branch', type: 'bar', active: true },
  { id: 3, name: 'Grill Station', branch: 'Downtown', type: 'grill', active: true },
])

const form = reactive({
  id: null,
  name: '',
  branch: '',
  type: 'main',
  active: true,
})

const getTypeColor = (type) => {
  switch (type) {
    case 'main':
      return 'primary'
    case 'bar':
      return 'purple'
    case 'grill':
      return 'orange'
    case 'dessert':
      return 'pink'
    default:
      return 'grey'
  }
}

const openDialog = () => {
  isEditing.value = false
  Object.assign(form, { id: null, name: '', branch: '', type: 'main', active: true })
  dialogVisible.value = true
}

const editKitchen = (kitchen) => {
  isEditing.value = true
  Object.assign(form, kitchen)
  dialogVisible.value = true
}

const saveKitchen = () => {
  if (isEditing.value) {
    const index = kitchens.value.findIndex((k) => k.id === form.id)
    if (index !== -1) kitchens.value[index] = { ...form }
    $q.notify({ type: 'positive', message: 'Kitchen updated successfully' })
  } else {
    kitchens.value.push({ ...form, id: Date.now() })
    $q.notify({ type: 'positive', message: 'Kitchen created successfully' })
  }
  dialogVisible.value = false
}

const deleteKitchen = (kitchen) => {
  $q.dialog({
    title: 'Confirm',
    message: `Are you sure you want to delete ${kitchen.name}?`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    kitchens.value = kitchens.value.filter((k) => k.id !== kitchen.id)
    $q.notify({ type: 'info', message: 'Kitchen deleted' })
  })
}
</script>
