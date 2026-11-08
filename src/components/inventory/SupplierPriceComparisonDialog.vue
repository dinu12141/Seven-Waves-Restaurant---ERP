<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    transition-show="scale"
    transition-hide="fade"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-card style="min-width: 680px; max-width: 850px; width: 100%; border-radius: 12px">
      <!-- Header -->
      <q-card-section class="row items-center q-pb-none bg-primary text-white">
        <div>
          <div class="row items-center">
            <q-icon name="compare_arrows" size="22px" class="q-mr-sm" />
            <span class="text-h6 text-weight-bold">Supplier Price Analysis & History</span>
          </div>
          <div class="text-caption text-blue-1">
            Multi-vendor purchase price comparison & moving weighted average valuation
          </div>
        </div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup text-color="white" />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <!-- Loading State -->
        <div v-if="loading" class="text-center q-pa-xl">
          <q-spinner-dots color="primary" size="40px" />
          <div class="text-caption text-grey-7 q-mt-sm">Loading multi-supplier price matrix...</div>
        </div>

        <div v-else>
          <!-- Item Identification Header -->
          <div class="q-pa-sm q-mb-md bg-grey-2 rounded-borders row items-center justify-between">
            <div>
              <div class="text-subtitle1 text-weight-bold text-dark">
                {{ analysis?.item?.name }}
                <q-badge color="grey-7" class="q-ml-xs text-caption">{{
                  analysis?.item?.code
                }}</q-badge>
              </div>
              <div class="text-caption text-grey-7">
                Category: <strong>{{ analysis?.item?.category_name }}</strong> · Base UOM:
                <strong>{{ analysis?.item?.uom_code }}</strong>
              </div>
            </div>
            <div class="text-right">
              <div class="text-caption text-grey-7">Current Moving Avg Cost:</div>
              <div class="text-h6 text-weight-bolder text-primary">
                LKR {{ fmt(analysis?.item?.avg_cost || analysis?.item?.last_purchase_price) }}
              </div>
            </div>
          </div>

          <!-- KPI Cards -->
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-12 col-sm-3">
              <div class="q-pa-sm rounded-borders bg-positive text-white text-center">
                <div class="text-caption" style="font-size: 11px">Lowest / Best Price</div>
                <div class="text-subtitle1 text-weight-bolder">
                  LKR {{ fmt(analysis?.overallMin) }}
                </div>
                <div class="text-caption ellipsis" style="font-size: 10px">
                  {{ analysis?.bestSupplier?.supplierName || 'N/A' }}
                </div>
              </div>
            </div>

            <div class="col-12 col-sm-3">
              <div class="q-pa-sm rounded-borders bg-primary text-white text-center">
                <div class="text-caption" style="font-size: 11px">Moving Avg Cost (MAC)</div>
                <div class="text-subtitle1 text-weight-bolder">
                  LKR {{ fmt(analysis?.overallAvg) }}
                </div>
                <div class="text-caption" style="font-size: 10px">Weighted inventory cost</div>
              </div>
            </div>

            <div class="col-12 col-sm-3">
              <div class="q-pa-sm rounded-borders bg-negative text-white text-center">
                <div class="text-caption" style="font-size: 11px">Highest Price Paid</div>
                <div class="text-subtitle1 text-weight-bolder">
                  LKR {{ fmt(analysis?.overallMax) }}
                </div>
                <div class="text-caption" style="font-size: 10px">Top recorded price</div>
              </div>
            </div>

            <div class="col-12 col-sm-3">
              <div class="q-pa-sm rounded-borders bg-amber-9 text-white text-center">
                <div class="text-caption" style="font-size: 11px">Price Spread Variance</div>
                <div class="text-subtitle1 text-weight-bolder">
                  LKR {{ fmt(analysis?.priceSpread) }}
                </div>
                <div class="text-caption" style="font-size: 10px">
                  {{
                    analysis?.overallMin > 0
                      ? ((analysis?.priceSpread / analysis?.overallMin) * 100).toFixed(1) +
                        '% variance'
                      : '0%'
                  }}
                </div>
              </div>
            </div>
          </div>

          <!-- Tabs -->
          <q-tabs
            v-model="tab"
            dense
            class="text-grey-8"
            active-color="primary"
            indicator-color="primary"
            align="justify"
          >
            <q-tab name="suppliers" label="Supplier Comparison" icon="store" />
            <q-tab
              name="history"
              :label="`GRN Purchase History (${analysis?.history?.length || 0})`"
              icon="receipt_long"
            />
          </q-tabs>
          <q-separator />

          <q-tab-panels v-model="tab" animated class="q-mt-xs">
            <!-- Suppliers Matrix Tab -->
            <q-tab-panel name="suppliers" class="q-pa-none">
              <div
                v-if="!analysis?.suppliers || analysis?.suppliers.length === 0"
                class="text-center q-pa-lg text-grey-6"
              >
                <q-icon name="info" size="32px" class="q-mb-xs" />
                <div>No multi-vendor GRNs posted for this item yet.</div>
                <div class="text-caption">
                  Cost is currently defaulting to standard unit cost (LKR
                  {{ fmt(analysis?.item?.avg_cost) }}).
                </div>
              </div>

              <q-table
                v-else
                :rows="analysis.suppliers"
                :columns="supplierCols"
                row-key="supplierId"
                flat
                dense
                hide-bottom
                :rows-per-page-options="[0]"
              >
                <template #body-cell-supplierName="props">
                  <q-td :props="props">
                    <div class="row items-center">
                      <span class="text-weight-bold">{{ props.row.supplierName }}</span>
                      <q-badge
                        v-if="props.row.isLowestPrice"
                        color="positive"
                        text-color="white"
                        label="Lowest Price"
                        class="q-ml-sm text-caption"
                        style="font-size: 10px"
                      />
                    </div>
                    <div class="text-caption text-grey-6" style="font-size: 11px">
                      Last purchased: {{ props.row.lastDate || 'N/A' }} · GRN:
                      {{ props.row.lastDocNumber || '—' }}
                    </div>
                  </q-td>
                </template>

                <template #body-cell-minUnitPrice="props">
                  <q-td
                    :props="props"
                    :class="props.row.isLowestPrice ? 'text-positive text-weight-bold' : ''"
                  >
                    LKR {{ fmt(props.row.minUnitPrice) }}
                  </q-td>
                </template>

                <template #body-cell-maxUnitPrice="props">
                  <q-td :props="props"> LKR {{ fmt(props.row.maxUnitPrice) }} </q-td>
                </template>

                <template #body-cell-avgUnitPrice="props">
                  <q-td :props="props" class="text-weight-medium">
                    LKR {{ fmt(props.row.avgUnitPrice) }}
                  </q-td>
                </template>

                <template #body-cell-totalSpend="props">
                  <q-td :props="props"> LKR {{ fmt(props.row.totalSpend) }} </q-td>
                </template>
              </q-table>
            </q-tab-panel>

            <!-- Purchase History Tab -->
            <q-tab-panel name="history" class="q-pa-none">
              <div
                v-if="!analysis?.history || analysis?.history.length === 0"
                class="text-center q-pa-lg text-grey-6"
              >
                <q-icon name="history" size="32px" class="q-mb-xs" />
                <div>No purchase history found for this item.</div>
              </div>

              <q-table
                v-else
                :rows="analysis.history"
                :columns="historyCols"
                row-key="id"
                flat
                dense
                :pagination="{ rowsPerPage: 10 }"
              >
                <template #body-cell-unit_cost="props">
                  <q-td :props="props" class="text-weight-bold">
                    LKR {{ fmt(props.row.unit_cost) }}
                  </q-td>
                </template>
                <template #body-cell-total_cost="props">
                  <q-td :props="props"> LKR {{ fmt(props.row.total_cost) }} </q-td>
                </template>
              </q-table>
            </q-tab-panel>
          </q-tab-panels>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Close" color="primary" v-close-popup no-caps />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { inventoryCostingService } from 'src/services/inventory/inventoryCostingService'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  itemId: { type: String, default: '' },
})

defineEmits(['update:modelValue'])

const loading = ref(false)
const tab = ref('suppliers')
const analysis = ref(null)

const supplierCols = [
  { name: 'supplierName', label: 'Supplier', field: 'supplierName', align: 'left' },
  { name: 'minUnitPrice', label: 'Lowest Price', field: 'minUnitPrice', align: 'right' },
  { name: 'maxUnitPrice', label: 'Highest Price', field: 'maxUnitPrice', align: 'right' },
  { name: 'avgUnitPrice', label: 'Avg Price', field: 'avgUnitPrice', align: 'right' },
  {
    name: 'totalQty',
    label: 'Total Qty',
    field: 'totalQty',
    align: 'right',
    format: (v) => Number(v || 0).toLocaleString(),
  },
  { name: 'totalSpend', label: 'Total Spend', field: 'totalSpend', align: 'right' },
  { name: 'receiptCount', label: 'GRNs', field: 'receiptCount', align: 'center' },
]

const historyCols = [
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'doc_number', label: 'GRN Number', field: 'doc_number', align: 'left' },
  { name: 'supplier_name', label: 'Supplier', field: 'supplier_name', align: 'left' },
  {
    name: 'quantity',
    label: 'Quantity',
    field: 'quantity',
    align: 'right',
    format: (v) => Number(v || 0).toLocaleString(),
  },
  { name: 'unit_cost', label: 'Unit Price', field: 'unit_cost', align: 'right', sortable: true },
  { name: 'total_cost', label: 'Total Cost', field: 'total_cost', align: 'right', sortable: true },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

async function loadAnalysis() {
  if (!props.itemId) return
  loading.value = true
  try {
    analysis.value = await inventoryCostingService.fetchItemSupplierPrices(props.itemId)
  } catch (err) {
    console.error('[SupplierPriceComparison] load error:', err)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.itemId) {
      loadAnalysis()
    }
  },
  { immediate: true },
)

watch(
  () => props.itemId,
  (newId) => {
    if (props.modelValue && newId) {
      loadAnalysis()
    }
  },
)
</script>
