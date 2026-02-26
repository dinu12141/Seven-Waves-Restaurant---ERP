<template>
  <q-page padding>
    <div class="q-mb-lg">
      <div class="text-h4 text-weight-bold">Procurement Settings</div>
      <div class="text-subtitle1 text-grey-7">
        Configure approval workflows, defaults, and stock policies
      </div>
    </div>

    <!-- Loading -->
    <q-inner-loading :showing="loading" />

    <div v-if="!loading" class="row q-col-gutter-md">
      <!-- ─────────────────────── APPROVAL WORKFLOWS ─────────────────────── -->
      <div class="col-12 col-md-6">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-h6 q-mb-sm">
              <q-icon name="approval" class="q-mr-sm" color="primary" />
              Approval Workflows
            </div>
            <div class="text-caption text-grey-7 q-mb-md">
              When enabled, documents must be approved before they can be posted.
            </div>
          </q-card-section>

          <q-separator />

          <q-card-section>
            <q-list>
              <q-item>
                <q-item-section>
                  <q-item-label>Purchase Order Approval</q-item-label>
                  <q-item-label caption>
                    Require PO approval before it can be opened for goods receipt
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle
                    v-model="settings.po_approval_required"
                    color="primary"
                    @update:model-value="save('po_approval_required', $event)"
                  />
                </q-item-section>
              </q-item>

              <q-item>
                <q-item-section>
                  <q-item-label>GRN Approval</q-item-label>
                  <q-item-label caption>
                    Require Goods Receipt approval before posting to inventory
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle
                    v-model="settings.grn_approval_required"
                    color="primary"
                    @update:model-value="save('grn_approval_required', $event)"
                  />
                </q-item-section>
              </q-item>

              <q-item>
                <q-item-section>
                  <q-item-label>AP Invoice Approval</q-item-label>
                  <q-item-label caption>
                    Require invoice approval before posting to accounts payable ledger
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle
                    v-model="settings.invoice_approval_required"
                    color="primary"
                    @update:model-value="save('invoice_approval_required', $event)"
                  />
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>
      </div>

      <!-- ─────────────────────── DEFAULTS & POLICIES ─────────────────────── -->
      <div class="col-12 col-md-6">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-h6 q-mb-sm">
              <q-icon name="tune" class="q-mr-sm" color="teal" />
              Defaults &amp; Policies
            </div>
            <div class="text-caption text-grey-7 q-mb-md">
              Set default values and stock control policies for the procurement module.
            </div>
          </q-card-section>

          <q-separator />

          <q-card-section>
            <q-list>
              <!-- Default Payment Term -->
              <q-item>
                <q-item-section>
                  <q-item-label>Default Payment Term</q-item-label>
                  <q-item-label caption>
                    Applied to new POs/invoices when the supplier has no payment term set
                  </q-item-label>
                  <q-select
                    v-model="settings.default_payment_term_id"
                    :options="paymentTermOptions"
                    option-value="id"
                    option-label="label"
                    emit-value
                    map-options
                    clearable
                    dense
                    outlined
                    class="q-mt-sm"
                    style="max-width: 320px"
                    @update:model-value="save('default_payment_term_id', $event)"
                  />
                </q-item-section>
              </q-item>

              <q-separator spaced />

              <!-- Allow negative stock on returns -->
              <q-item>
                <q-item-section>
                  <q-item-label>Allow Negative Stock on Returns</q-item-label>
                  <q-item-label caption>
                    When enabled, purchase returns can be posted even if the warehouse has
                    insufficient stock for the returned items
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle
                    v-model="settings.allow_negative_stock_returns"
                    color="orange"
                    @update:model-value="save('allow_negative_stock_returns', $event)"
                  />
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>
      </div>

      <!-- ─────────────────────── STATUS INFO ─────────────────────── -->
      <div class="col-12">
        <q-banner rounded class="bg-blue-1 text-blue-9">
          <template v-slot:avatar>
            <q-icon name="info" color="blue" />
          </template>
          <strong>Default Warehouse:</strong> Each branch uses the warehouse marked as
          <em>is_default</em> in the Warehouses page. To change the default warehouse, go to
          <strong>Inventory → Warehouses</strong> and toggle the default flag.
        </q-banner>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import {
  getProcurementSettings,
  saveProcurementSetting,
  listPaymentTerms,
} from 'src/services/procurementService'

const $q = useQuasar()
const loading = ref(true)

const settings = reactive({
  po_approval_required: false,
  grn_approval_required: false,
  invoice_approval_required: false,
  default_payment_term_id: null,
  allow_negative_stock_returns: false,
})

const paymentTermOptions = ref([])

onMounted(async () => {
  try {
    const [settingsRows, terms] = await Promise.all([getProcurementSettings(), listPaymentTerms()])

    // Map setting rows to reactive object
    settingsRows.forEach((row) => {
      const key = row.setting_key
      let val = row.setting_value

      // Unwrap JSON strings: "true" → true, "null" → null, etc.
      if (typeof val === 'string') {
        try {
          val = JSON.parse(val)
        } catch {
          // keep string as-is
        }
      }

      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        const s = settings
        if (typeof s[key] === 'boolean') {
          s[key] = val === true || val === 'true'
        } else {
          s[key] = val
        }
      }
    })

    // Build payment term options
    paymentTermOptions.value = terms.map((t) => ({
      id: t.id,
      label: `${t.name} (Net ${t.net_days} days)`,
    }))
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to load settings' })
  } finally {
    loading.value = false
  }
})

async function save(key, value) {
  try {
    await saveProcurementSetting(key, value)
    $q.notify({ type: 'positive', message: 'Setting saved', timeout: 1500 })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Failed to save setting' })
  }
}
</script>
