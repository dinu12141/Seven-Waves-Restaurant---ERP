<template>
  <q-dialog v-model="visible">
    <q-card style="min-width: 650px; max-width: 95vw" :class="$q.dark.isActive ? 'bg-grey-9 text-white' : ''">
      <q-card-section class="row items-center q-pb-none">
        <div>
          <div class="text-h6 text-weight-bold">
            <q-icon name="menu_book" color="primary" class="q-mr-xs" />
            Journal Entry Breakdown
          </div>
          <div class="text-caption text-grey-6" v-if="entry">
            Date: {{ entry.doc_date }} | Ref: {{ entry.reference_id || entry.id?.slice(0, 8) }}
          </div>
        </div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-sm">
        <div class="text-body2 text-weight-medium q-mb-md bg-grey-2 q-pa-sm rounded-borders" :class="$q.dark.isActive ? 'bg-grey-8' : ''">
          <span class="text-grey-7">Narration:</span> {{ entry?.description }}
        </div>

        <q-table
          flat
          bordered
          dense
          :rows="entry?.lines || []"
          :columns="columns"
          row-key="id"
          hide-bottom
          :pagination="{ rowsPerPage: 0 }"
        >
          <template #body-cell-dr_amount="props">
            <q-td :props="props" class="text-weight-bold text-primary">
              {{ props.value > 0 ? 'LKR ' + Number(props.value).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-' }}
            </q-td>
          </template>
          <template #body-cell-cr_amount="props">
            <q-td :props="props" class="text-weight-bold text-purple">
              {{ props.value > 0 ? 'LKR ' + Number(props.value).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-' }}
            </q-td>
          </template>
        </q-table>

        <div class="row justify-between items-center q-mt-md q-pa-sm bg-grey-1 rounded-borders" :class="$q.dark.isActive ? 'bg-grey-8' : ''">
          <div class="text-subtitle2">
            Status:
            <q-badge :color="entry?.is_reversed ? 'red' : 'green'" class="q-ml-xs">
              {{ entry?.is_reversed ? 'REVERSED' : 'POSTED' }}
            </q-badge>
          </div>
          <div class="row q-gutter-x-lg text-subtitle2">
            <div>
              Total DR: <span class="text-primary text-weight-bold">LKR {{ Number(entry?.total_dr || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</span>
            </div>
            <div>
              Total CR: <span class="text-purple text-weight-bold">LKR {{ Number(entry?.total_cr || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</span>
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Close" color="primary" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  entry: Object,
})
const emit = defineEmits(['update:modelValue'])

const visible = ref(props.modelValue)

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
  }
)
watch(
  visible,
  (val) => {
    emit('update:modelValue', val)
  }
)

const columns = [
  { name: 'line_number', label: '#', field: 'line_number', align: 'center', style: 'width: 40px' },
  { name: 'account_code', label: 'Code', field: 'account_code', align: 'left', style: 'width: 90px' },
  { name: 'account_name', label: 'Ledger Account', field: 'account_name', align: 'left' },
  { name: 'memo', label: 'Memo', field: 'memo', align: 'left' },
  { name: 'dr_amount', label: 'Debit (DR)', field: 'dr_amount', align: 'right' },
  { name: 'cr_amount', label: 'Credit (CR)', field: 'cr_amount', align: 'right' },
]
</script>
