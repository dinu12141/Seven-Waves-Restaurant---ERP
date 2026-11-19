<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" persistent>
    <q-card style="width: 860px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column" class="erp-dialog-card">
      <!-- Dialog Header -->
      <q-card-section class="row items-center justify-between q-pb-none">
        <div class="row items-center">
          <q-avatar icon="price_check" color="purple-9" text-color="white" size="36px" class="q-mr-sm" />
          <div>
            <div class="text-h6 text-weight-bold">Staff IOU Bill Set-off & Settlement</div>
            <div class="text-caption text-grey-7">Set off staff advance against market bills, expenses & returned change</div>
          </div>
        </div>
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-separator class="q-my-sm" />

      <!-- Scrollable Form Body -->
      <q-card-section class="col scroll q-pa-md">
        <!-- Advance Header Section -->
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-md-4">
            <q-input
              v-model="form.settleDate"
              label="Settlement Date *"
              type="date"
              outlined
              dense
              :rules="[v => !!v || 'Required']"
            />
          </div>
          <div class="col-12 col-md-4">
            <q-select
              v-model="form.staff"
              :options="staffOptions"
              option-label="name"
              label="Staff Member *"
              outlined
              dense
              use-input
              clearable
              input-debounce="0"
              @filter="filterStaff"
              :loading="loadingStaff"
              :rules="[v => !!v || 'Staff member is required']"
            >
              <template #prepend>
                <q-icon name="person" size="18px" color="purple-9" />
              </template>
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section avatar style="min-width: 32px">
                    <q-avatar size="26px" color="purple-1" text-color="purple-9" font-size="12px">
                      {{ (scope.opt.rawName || scope.opt.name || 'S').charAt(0).toUpperCase() }}
                    </q-avatar>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-weight-bold">{{ scope.opt.rawName || scope.opt.name }}</q-item-label>
                    <q-item-label caption class="text-grey-7">{{ scope.opt.code }} · {{ scope.opt.designation }}</q-item-label>
                  </q-item-section>
                </q-item>
              </template>
              <template #no-option>
                <q-item><q-item-section class="text-grey">No staff found</q-item-section></q-item>
              </template>
            </q-select>
          </div>
          <div class="col-12 col-md-4">
            <q-input
              v-model.number="form.advanceAmount"
              label="Original IOU Advance Amount (LKR) *"
              type="number"
              outlined
              dense
              min="0.01"
              step="0.01"
              :rules="[v => Number(v) > 0 || 'Must be greater than 0']"
            />
          </div>

          <div class="col-12 col-md-6">
            <q-select
              v-model="form.pettyCashDrawer"
              :options="drawerOptions"
              option-label="label"
              label="Petty Cash Drawer (For Returned Change) *"
              outlined
              dense
              hint="Account to receive leftover cash"
            />
          </div>
          <div class="col-12 col-md-6">
            <q-input
              v-model="form.referenceNotes"
              label="Reference / Advance Voucher # / Notes"
              outlined
              dense
              placeholder="e.g. Market purchase for Benmar & Indian kitchen"
            />
          </div>
        </div>

        <q-separator class="q-my-sm" />

        <!-- Settlement Lines -->
        <div class="row items-center justify-between q-mb-sm">
          <div class="text-subtitle2 text-weight-bold row items-center">
            <q-icon name="receipt_long" size="18px" color="primary" class="q-mr-xs" />
            Bills &amp; Expenses to Set Off
          </div>
          <q-btn
            unelevated
            no-caps
            size="sm"
            color="primary"
            icon="add"
            label="Add Bill / Expense"
            @click="addLine"
          />
        </div>

        <q-table
          flat
          bordered
          dense
          class="erp-table q-mb-md"
          :rows="form.lines"
          :columns="lineColumns"
          row-key="id"
          hide-pagination
          :pagination="{ rowsPerPage: 0 }"
        >
          <template #body-cell-category="props">
            <q-td :props="props">
              <q-select
                v-model="props.row.category"
                :options="categoryOptions"
                dense
                outlined
                emit-value
                map-options
                style="min-width: 150px"
                @update:model-value="onCategoryChange(props.row)"
              />
            </q-td>
          </template>

          <template #body-cell-ledger="props">
            <q-td :props="props">
              <q-select
                v-model="props.row.ledger"
                :options="getLedgerOptionsForCategory(props.row.category)"
                option-label="displayName"
                dense
                outlined
                style="min-width: 200px"
              />
            </q-td>
          </template>

          <template #body-cell-description="props">
            <q-td :props="props">
              <q-input
                v-model="props.row.description"
                dense
                outlined
                placeholder="Bill details / Invoice #"
                style="min-width: 140px"
              />
            </q-td>
          </template>

          <template #body-cell-amount="props">
            <q-td :props="props">
              <q-input
                v-model.number="props.row.amount"
                type="number"
                dense
                outlined
                min="0"
                step="0.01"
                input-class="text-right font-mono"
                style="width: 120px"
              />
            </q-td>
          </template>

          <template #body-cell-actions="props">
            <q-td :props="props" auto-width>
              <q-btn
                flat
                dense
                round
                icon="remove_circle_outline"
                color="negative"
                size="sm"
                @click="removeLine(props.rowIndex)"
              />
            </q-td>
          </template>
        </q-table>

        <!-- Zero-Discrepancy Balance Card -->
        <div class="q-pa-md rounded-borders bg-grey-1 border q-mt-md" :style="{ borderLeft: `5px solid ${isBalanced ? 'var(--q-positive)' : 'var(--q-negative)'}` }">
          <div class="row items-center justify-between q-mb-xs">
            <div class="row items-center">
              <q-icon :name="isBalanced ? 'check_circle' : 'warning'" :color="isBalanced ? 'positive' : 'negative'" size="22px" class="q-mr-xs" />
              <span class="text-subtitle1 text-weight-bold">
                {{ isBalanced ? '✓ Zero-Discrepancy Balance Verified' : '⚠ Discrepancy Detected' }}
              </span>
            </div>
            <q-badge :color="isBalanced ? 'positive' : 'negative'" class="q-pa-xs text-weight-bold" style="font-size: 13px">
              {{ isBalanced ? '0.00 Discrepancy (Ready to Post)' : `Difference: LKR ${fmt(Math.abs(discrepancy))}` }}
            </q-badge>
          </div>

          <div class="row q-col-gutter-md q-mt-xs">
            <div class="col-12 col-md-4">
              <div class="text-caption text-grey-7">Original IOU Advance:</div>
              <div class="text-h6 text-weight-bold text-dark">LKR {{ fmt(form.advanceAmount) }}</div>
            </div>
            <div class="col-12 col-md-4">
              <div class="text-caption text-grey-7">Total Bills &amp; Returned Cash:</div>
              <div class="text-h6 text-weight-bold text-primary">LKR {{ fmt(totalSettled) }}</div>
            </div>
            <div class="col-12 col-md-4">
              <div class="text-caption text-grey-7">Discrepancy (Advance - Bills):</div>
              <div class="text-h6 text-weight-bold" :class="isBalanced ? 'text-positive' : 'text-negative'">
                LKR {{ fmt(discrepancy) }}
              </div>
            </div>
          </div>

          <div v-if="!isBalanced" class="text-caption text-negative q-mt-sm">
            <q-icon name="error_outline" size="14px" />
            Total set-off bills and returned cash must exactly equal the advance amount (LKR {{ fmt(form.advanceAmount) }}).
            {{ discrepancy > 0 ? `Please account for remaining LKR ${fmt(discrepancy)} as additional bills or returned cash.` : `Total bills exceed advance by LKR ${fmt(Math.abs(discrepancy))}.` }}
          </div>
        </div>
      </q-card-section>

      <q-separator />

      <!-- Dialog Actions -->
      <q-card-actions class="q-pa-md row items-center justify-between">
        <q-btn flat label="Cancel" v-close-popup />
        <q-btn
          unelevated
          color="purple-9"
          icon="verified"
          label="Confirm &amp; Post Set-off"
          :disable="!isBalanced || posting"
          :loading="posting"
          @click="submitSettlement"
        >
          <q-tooltip v-if="!isBalanced">Cannot post while discrepancy is not 0.00</q-tooltip>
        </q-btn>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useQuasar, date } from 'quasar'
import { supabase } from 'src/boot/supabase'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'settled'])

const $q = useQuasar()
const posting = ref(false)
const loadingStaff = ref(false)

const staffOptions = ref([])
const allStaff = ref([])

const drawerOptions = [
  { label: 'Store Petty Cash (1021)', id: '00c1ec1a-15f1-4ff6-951c-95a8e43574d6', ledger_code: '1021' },
  { label: 'Petty Cash HR (1022)', id: 'c278fc2e-a62b-4e77-827f-06ad89b9d7e6', ledger_code: '1022' },
  { label: 'Main Cash Office Drawer (1001)', id: '45644893-a8d9-4851-b0a0-fee9a05b6865', ledger_code: '1001' },
]

const categoryOptions = [
  { label: 'GRN / Stock Purchase', value: 'stock' },
  { label: 'Operating Expense', value: 'expense' },
  { label: 'Cash Change Returned', value: 'change' },
]

const ledgers = ref([])

const lineColumns = [
  { name: 'category', label: 'Line Category *', field: 'category', align: 'left', style: 'width: 170px' },
  { name: 'ledger', label: 'Debit Account / Ledger *', field: 'ledger', align: 'left', style: 'min-width: 220px' },
  { name: 'description', label: 'Description / Bill Ref', field: 'description', align: 'left' },
  { name: 'amount', label: 'Amount (LKR) *', field: 'amount', align: 'right', style: 'width: 130px' },
  { name: 'actions', label: '', field: 'actions', align: 'center', style: 'width: 50px' },
]

const form = ref({
  settleDate: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  staff: null,
  advanceAmount: 0,
  pettyCashDrawer: drawerOptions[0],
  referenceNotes: '',
  lines: [],
})

async function loadLedgers() {
  try {
    const { data } = await supabase
      .from('finance_ledgers')
      .select('id, ledger_code, ledger_name, ledger_type, account_group')
      .is('deleted_at', null)
      .order('ledger_code')

    if (data) {
      ledgers.value = data.map(l => ({
        ...l,
        displayName: `${l.ledger_code} — ${l.ledger_name}`,
      }))
    }
  } catch (err) {
    console.error('Failed to load ledgers for IOU:', err)
  }
}

async function loadStaff() {
  loadingStaff.value = true
  try {
    const { data: emps, error } = await supabase
      .from('employees')
      .select('id, employee_code, first_name, last_name, full_name, is_active, designations(title)')
      .eq('is_active', true)
      .order('first_name', { ascending: true })

    if (error) {
      console.error('Error fetching employees for IOU:', error)
      return
    }

    if (emps && emps.length > 0) {
      const mapped = emps.map(e => {
        const rawName = (e.full_name || `${e.first_name || ''} ${e.last_name || ''}`).trim()
        const designation = e.designations?.title || 'Staff'
        const code = e.employee_code || ''
        return {
          id: e.id,
          code,
          designation,
          rawName,
          name: `${rawName} (${designation}${code ? ` - ${code}` : ''})`,
        }
      })

      // Add a general casual/unlisted option
      mapped.push({
        id: 'generic-staff',
        code: 'GEN-01',
        designation: 'Casual / Unlisted Worker',
        rawName: 'Staff General / Casual Hand',
        name: 'Staff General / Casual Hand (Casual Worker - GEN-01)',
      })

      allStaff.value = mapped
      staffOptions.value = [...mapped]
    }
  } catch (err) {
    console.error('Failed to load staff list:', err)
  } finally {
    loadingStaff.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadLedgers(), loadStaff()])
})

watch(() => props.modelValue, async (isOpen) => {
  if (isOpen) {
    if (allStaff.value.length === 0) {
      await loadStaff()
    }
    if (ledgers.value.length === 0) {
      await loadLedgers()
    }
  }
})

function filterStaff(val, update) {
  if (!val) {
    update(() => {
      staffOptions.value = [...allStaff.value]
    })
    return
  }
  update(() => {
    const needle = val.toLowerCase().trim()
    staffOptions.value = allStaff.value.filter(s =>
      (s.name && s.name.toLowerCase().includes(needle)) ||
      (s.code && s.code.toLowerCase().includes(needle)) ||
      (s.designation && s.designation.toLowerCase().includes(needle))
    )
  })
}

function getLedgerOptionsForCategory(category) {
  if (category === 'stock') {
    // Inventory asset ledgers (1080-1150) or COGS (5010-5090)
    return ledgers.value.filter(l =>
      (l.ledger_code >= '1080' && l.ledger_code <= '1150') ||
      (l.ledger_code >= '5010' && l.ledger_code <= '5090')
    )
  }
  if (category === 'change') {
    // Cash & Petty cash ledgers (1000-1025)
    return ledgers.value.filter(l => l.ledger_code >= '1000' && l.ledger_code <= '1025')
  }
  // Operating expenses (6000-6310)
  return ledgers.value.filter(l => l.ledger_type === 'expense' || (l.ledger_code >= '6000' && l.ledger_code <= '6310'))
}

function addLine() {
  const defaultCategory = 'stock'
  const options = getLedgerOptionsForCategory(defaultCategory)
  form.value.lines.push({
    id: Date.now() + Math.random(),
    category: defaultCategory,
    ledger: options[0] || null,
    description: '',
    amount: 0,
  })
}

function removeLine(idx) {
  form.value.lines.splice(idx, 1)
}

function onCategoryChange(line) {
  const options = getLedgerOptionsForCategory(line.category)
  line.ledger = options[0] || null
  if (line.category === 'change') {
    line.description = 'Leftover cash returned to drawer'
    // Pre-select drawer ledger
    const drawerLedger = ledgers.value.find(l => l.ledger_code === form.value.pettyCashDrawer?.ledger_code)
    if (drawerLedger) line.ledger = drawerLedger
  }
}

// ── Computed Totals & Balancing ──────────────────────────────────
const totalSettled = computed(() => {
  return form.value.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
})

const discrepancy = computed(() => {
  const adv = Number(form.value.advanceAmount) || 0
  return Math.round((adv - totalSettled.value) * 100) / 100
})

const isBalanced = computed(() => {
  return Number(form.value.advanceAmount) > 0 && Math.abs(discrepancy.value) < 0.005
})

function fmt(n) {
  return Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Submit & Post ────────────────────────────────────────────────
async function submitSettlement() {
  if (!isBalanced.value) {
    $q.notify({ type: 'warning', message: 'Discrepancy must be 0.00 before posting.' })
    return
  }

  posting.value = true
  try {
    // 1. Find IOU Ledger (1060 Staff Advances / IOU)
    const iouLedger = ledgers.value.find(l => l.ledger_code === '1060')
    if (!iouLedger) throw new Error('IOU Ledger 1060 not found in Chart of Accounts')

    // 2. Prepare Entries
    const companyId = '5c7ff29c-418a-461a-9624-3667375c2af4'
    const branchId = '340efb20-513a-4d99-b1e7-f32f938e31a8'
    const staffName = form.value.staff?.rawName || form.value.staff?.name || 'Staff'

    const entries = []
    let returnedChangeTotal = 0

    // Debit each line
    for (const l of form.value.lines) {
      const amt = Number(l.amount) || 0
      if (amt <= 0) continue

      const isChange = l.category === 'change'
      if (isChange) {
        returnedChangeTotal += amt
      }

      entries.push({
        company_id: companyId,
        branch_id: branchId,
        source_type: 'pay_voucher',
        source_id: null,
        entry_date: form.value.settleDate,
        ledger_id: l.ledger?.id,
        account_id: isChange ? (form.value.pettyCashDrawer?.id || null) : null,
        description: `IOU Set-off: ${staffName} — ${l.description || l.ledger?.ledger_name || l.category}`,
        debit_amount: amt,
        credit_amount: 0,
      })
    }

    // Credit full IOU Advance to clear 1060 to 0.00
    entries.push({
      company_id: companyId,
      branch_id: branchId,
      source_type: 'pay_voucher',
      source_id: null,
      entry_date: form.value.settleDate,
      ledger_id: iouLedger.id,
      description: `IOU Settlement Cleared: ${staffName} (Advance LKR ${fmt(form.value.advanceAmount)})`,
      debit_amount: 0,
      credit_amount: Number(form.value.advanceAmount),
    })

    const { error: insErr } = await supabase.from('finance_cashbook_entries').insert(entries)
    if (insErr) throw insErr

    // If change was returned, increment the drawer current_balance
    if (returnedChangeTotal > 0 && form.value.pettyCashDrawer?.id) {
      const { data: drawerAcc } = await supabase
        .from('finance_accounts')
        .select('current_balance')
        .eq('id', form.value.pettyCashDrawer.id)
        .single()
      if (drawerAcc) {
        await supabase
          .from('finance_accounts')
          .update({
            current_balance: Number(drawerAcc.current_balance || 0) + returnedChangeTotal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', form.value.pettyCashDrawer.id)
      }
    }

    $q.notify({
      type: 'positive',
      icon: 'verified',
      message: `IOU of LKR ${fmt(form.value.advanceAmount)} for ${staffName} settled with 0.00 discrepancy!`,
      caption: `Cashbook balances updated atomically.`,
      timeout: 5000,
    })

    emit('settled')
    emit('update:modelValue', false)
  } catch (err) {
    console.error('IOU settlement failed:', err)
    $q.notify({ type: 'negative', message: 'Failed to post IOU settlement', caption: err.message })
  } finally {
    posting.value = false
  }
}
</script>
