<template>
  <div class="erp-card stock-alert-card q-pa-md">
    <div class="row items-center no-wrap q-mb-md">
      <q-icon :name="alertIcon" :color="alertColor" size="24px" class="q-mr-sm" />
      <div>
        <div style="font-size: 14px; font-weight: 600; color: var(--erp-text-primary)">
          {{ item.item_name }}
        </div>
        <div class="text-caption" style="color: var(--erp-text-secondary)">
          {{ item.item_code }} · {{ item.category_name || 'Uncategorized' }}
        </div>
      </div>
      <q-space />
      <div
        class="erp-badge"
        :class="
          item.stock_status === 'out_of_stock' ? 'erp-badge--cancelled' : 'erp-badge--pending'
        "
      >
        {{ item.stock_status === 'out_of_stock' ? 'OUT OF STOCK' : 'LOW STOCK' }}
      </div>
    </div>

    <div>
      <div class="row items-center q-gutter-md">
        <!-- Progress bar -->
        <div class="col">
          <div
            class="row justify-between text-caption q-mb-xs"
            style="color: var(--erp-text-secondary)"
          >
            <span class="erp-num" style="color: var(--erp-text-primary); font-weight: 500"
              >{{ item.qty_on_hand }} {{ item.uom_code }}</span
            >
            <span>Reorder: {{ item.reorder_level }} {{ item.uom_code }}</span>
          </div>
          <q-linear-progress
            :value="progressValue"
            :color="alertColor"
            track-color="grey-9"
            rounded
            size="6px"
            class="q-mb-xs"
          />
          <div
            class="row justify-between text-caption"
            style="color: var(--erp-text-tertiary); font-size: 10px"
          >
            <span>Min: {{ item.min_stock }}</span>
            <span v-if="item.max_stock">Max: {{ item.max_stock }}</span>
          </div>
        </div>

        <!-- Warehouse tag -->
        <div class="col-auto">
          <div class="erp-badge erp-badge--default row items-center no-wrap">
            <q-icon :name="whIcon" size="12px" class="q-mr-xs" style="color: inherit" />
            <span>{{ item.warehouse_name }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="row justify-end q-mt-md" v-if="showActions">
      <q-btn
        flat
        dense
        icon="add_shopping_cart"
        label="Create GRN"
        class="erp-btn-ghost q-mr-sm text-primary"
        size="sm"
        @click="$emit('reorder', item)"
      />
      <q-btn
        flat
        dense
        icon="swap_horiz"
        label="Transfer"
        class="erp-btn-ghost text-info"
        size="sm"
        @click="$emit('transfer', item)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  item: { type: Object, required: true },
  showActions: { type: Boolean, default: true },
})

defineEmits(['reorder', 'transfer'])

const alertColor = computed(() =>
  props.item.stock_status === 'out_of_stock' ? 'negative' : 'warning',
)

const alertIcon = computed(() => (props.item.stock_status === 'out_of_stock' ? 'error' : 'warning'))

const progressValue = computed(() => {
  const max = props.item.max_stock || props.item.reorder_level * 3 || 100
  return Math.min(Math.max((props.item.qty_on_hand || 0) / max, 0), 1)
})

const whIcon = computed(() => {
  const map = { main_store: 'warehouse', kitchen: 'soup_kitchen', bar: 'local_bar' }
  return map[props.item.warehouse_type] || 'store'
})
</script>

<style scoped>
.stock-alert-card {
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}
.stock-alert-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}
</style>
