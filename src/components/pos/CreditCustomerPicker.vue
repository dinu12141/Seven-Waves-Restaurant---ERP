<template>
  <div class="ccp">
    <q-select
      :model-value="modelValue"
      :options="options"
      :option-label="customerDisplayName"
      option-value="id"
      label="Registered customer (required for CREDIT) *"
      outlined
      dense
      dark
      use-input
      clearable
      input-debounce="300"
      :loading="searching"
      @filter="onFilter"
      @update:model-value="onPick"
    >
      <template v-slot:prepend>
        <q-icon name="person_search" color="amber-5" />
      </template>
      <template v-slot:option="scope">
        <q-item v-bind="scope.itemProps">
          <q-item-section>
            <q-item-label>{{ customerDisplayName(scope.opt) }}</q-item-label>
            <q-item-label caption>
              {{ [scope.opt.customer_code, scope.opt.phone].filter(Boolean).join(' • ') }}
              <template v-if="Number(scope.opt.credit_limit) > 0"> • Limit LKR {{ fmt(scope.opt.credit_limit) }}</template>
            </q-item-label>
          </q-item-section>
        </q-item>
      </template>
      <template v-slot:no-option>
        <q-item>
          <q-item-section class="text-grey">
            {{ searchError || 'Type 2+ letters — only registered customers can take credit.' }}
          </q-item-section>
        </q-item>
      </template>
    </q-select>
    <div v-if="modelValue && check.exceeds" class="ccp-warn">
      <q-icon name="warning" size="14px" class="q-mr-xs" />
      Over credit limit by LKR {{ fmt(check.overBy) }} (limit LKR {{ fmt(check.limit) }}) — continue only if approved.
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { supabase } from 'src/boot/supabase'
import {
  customerDisplayName,
  normalizeCustomerSearch,
  checkCreditLimit,
  sumOpenBalance,
  OPEN_RECEIVABLE_STATUSES,
} from 'src/modules/pos/creditCustomer'

const props = defineProps({
  modelValue: { type: Object, default: null },
  creditAmount: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue'])

const options = ref([])
const searching = ref(false)
const searchError = ref('')
const openBalance = ref(0)
let seq = 0

const fmt = (v) => (Number(v) || 0).toFixed(2)

const check = computed(() => checkCreditLimit(props.modelValue?.credit_limit, openBalance.value, props.creditAmount))

function onFilter(val, update, abort) {
  const q = (val || '').trim()
  if (q.length < 2) {
    update(() => {
      options.value = []
    })
    return
  }
  const my = ++seq
  searching.value = true
  searchError.value = ''
  supabase
    .rpc('pos_search_customers', { p_search: q, p_limit: 10 })
    .then(({ data, error }) => {
      if (my !== seq) return abort()
      if (error || data?.success === false) {
        searchError.value = 'Customer search failed: ' + (error?.message || data?.error || 'unknown error')
      }
      update(() => {
        options.value = error ? [] : normalizeCustomerSearch(data).filter((c) => c.is_active !== false)
      })
    })
    .catch((err) => {
      searchError.value = 'Customer search failed: ' + (err?.message || err)
      update(() => {
        options.value = []
      })
    })
    .finally(() => {
      if (my === seq) searching.value = false
    })
}

function onPick(c) {
  emit('update:modelValue', c || null)
}

watch(
  () => props.modelValue?.id,
  async (id) => {
    openBalance.value = 0
    if (!id) return
    const { data, error } = await supabase
      .from('customer_receivables')
      .select('total_amount, paid_amount, status')
      .eq('customer_id', id)
      .in('status', [...OPEN_RECEIVABLE_STATUSES])
    if (!error && props.modelValue?.id === id) openBalance.value = sumOpenBalance(data)
  },
  { immediate: true },
)
</script>

<style scoped>
.ccp-warn {
  font-size: 11px;
  color: #ffb74d;
  margin-top: 4px;
  display: flex;
  align-items: center;
}
</style>
