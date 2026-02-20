<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Procurement Reports</div>

    <div class="row q-col-gutter-md">
      <!-- 1. Supplier Statement -->
      <div class="col-12 col-md-6">
        <q-card>
          <q-card-section>
            <div class="text-h6">Supplier Statement</div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <q-select
              v-model="statementSupplier"
              :options="supplierOptions"
              option-label="name"
              label="Select Supplier"
              outlined
              dense
              class="q-mb-md"
            />
            <div class="row q-col-gutter-sm">
              <q-input
                v-model="statementFrom"
                type="date"
                label="From"
                outlined
                dense
                class="col-6"
              />
              <q-input v-model="statementTo" type="date" label="To" outlined dense class="col-6" />
            </div>
            <div class="q-mt-md text-center">
              <q-btn
                color="primary"
                label="Generate Statement"
                @click="generateStatement"
                :disable="!statementSupplier"
                icon="description"
              />
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- 2. Aging Report -->
      <div class="col-12 col-md-6">
        <q-card>
          <q-card-section>
            <div class="text-h6">AP Aging Summary</div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="text-caption text-grey q-mb-md">
              View outstanding balances categorized by age (0-30, 31-60, 61-90, 90+ days).
            </div>
            <div class="text-center">
              <q-btn
                color="secondary"
                label="View Aging Report"
                @click="generateAging"
                icon="access_time"
              />
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- 3. Variance Analysis -->
      <div class="col-12 col-md-6">
        <q-card>
          <q-card-section>
            <div class="text-h6">PO vs GRN vs Invoice Variance</div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="text-caption text-grey q-mb-md">
              Analyze discrepancies between ordered, received, and invoiced quantities/amounts.
            </div>
            <div class="text-center">
              <q-btn
                color="purple"
                label="Run Analysis"
                @click="generateVariance"
                icon="analytics"
              />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Report Output Dialog (Placeholder for actual report view) -->
    <q-dialog v-model="reportDialog" full-width full-height>
      <q-card>
        <q-bar class="bg-primary text-white">
          <div>{{ reportTitle }}</div>
          <q-space />
          <q-btn dense flat icon="close" v-close-popup />
        </q-bar>
        <q-card-section class="q-pa-none fit">
          <!-- Placeholder for PDF viewer or Data Table -->
          <div class="full-height row justify-center items-center text-grey">
            <div class="text-center">
              <q-icon name="print" size="xl" />
              <div class="text-h6 q-mt-md">Report Generated Visualization</div>
              <div>(Mock Data Display)</div>
              <div class="q-mt-md" v-if="reportData">
                {{ reportData.summary }}
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  listSuppliers,
  getSupplierStatement,
  getAPAging,
  getPOVarianceReport,
} from 'src/services/procurementService'
import { date } from 'quasar'

// const $q = useQuasar()
const supplierOptions = ref([])
const statementSupplier = ref(null)
const statementFrom = ref(
  date.formatDate(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'YYYY-MM-DD'),
)
const statementTo = ref(date.formatDate(new Date(), 'YYYY-MM-DD'))

const reportDialog = ref(false)
const reportTitle = ref('')
const reportData = ref(null)

onMounted(async () => {
  supplierOptions.value = await listSuppliers()
})

async function generateStatement() {
  if (!statementSupplier.value) return
  reportTitle.value = `Supplier Statement: ${statementSupplier.value?.name}`
  try {
    const result = await getSupplierStatement(
      statementSupplier.value.id,
      statementFrom.value,
      statementTo.value,
    )
    reportData.value = {
      summary: `${result.rows.length} entries | Total Debit: ${result.totalDebit.toFixed(2)} | Total Credit: ${result.totalCredit.toFixed(2)} | Balance: ${result.balance.toFixed(2)}`,
      rows: result.rows,
    }
  } catch (e) {
    reportData.value = { summary: `Error: ${e.message}` }
  }
  reportDialog.value = true
}

async function generateAging() {
  reportTitle.value = 'AP Aging Summary'
  try {
    const rows = await getAPAging()
    const buckets = {
      current: 0,
      '1-30': 0,
      '31-60': 0,
      '61-90': 0,
      '90+': 0,
    }
    rows.forEach((r) => {
      buckets[r.bucket] = (buckets[r.bucket] || 0) + (r.balance_due || 0)
    })
    reportData.value = {
      summary: `Current: ${buckets['current'].toFixed(2)} | 1-30: ${buckets['1-30'].toFixed(2)} | 31-60: ${buckets['31-60'].toFixed(2)} | 61-90: ${buckets['61-90'].toFixed(2)} | 90+: ${buckets['90+'].toFixed(2)}`,
    }
  } catch (e) {
    reportData.value = { summary: `Error: ${e.message}` }
  }
  reportDialog.value = true
}

async function generateVariance() {
  reportTitle.value = 'Procurement Variance Analysis'
  try {
    const rows = await getPOVarianceReport({})
    reportData.value = {
      summary: `${rows.length} PO lines analysed. Check items with open_qty > 0 for pending receipts.`,
    }
  } catch (e) {
    reportData.value = { summary: `Error: ${e.message}` }
  }
  reportDialog.value = true
}
</script>
