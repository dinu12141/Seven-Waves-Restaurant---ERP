<template>
  <q-chip
    :color="getColor(status)"
    :text-color="getTextColor(status)"
    :icon="getIcon(status)"
    dense
    class="text-weight-bold text-uppercase q-ma-none text-caption"
  >
    {{ status }}
  </q-chip>
</template>

<script setup>
defineProps({
  status: {
    type: String,
    required: true,
  },
})

function getColor(status) {
  const s = status.toLowerCase()
  if (['completed', 'paid', 'delivered', 'ready', 'good'].includes(s)) return 'green-9'
  if (['pending', 'processing', 'cooking', 'low'].includes(s)) return 'orange-9'
  if (['cancelled', 'void', 'failed', 'critical'].includes(s)) return 'red-9'
  return 'grey-8'
}

function getTextColor(status) {
  const s = status.toLowerCase()
  if (['completed', 'paid', 'delivered', 'ready', 'good'].includes(s)) return 'green-1'
  if (['pending', 'processing', 'cooking', 'low'].includes(s)) return 'orange-1'
  if (['cancelled', 'void', 'failed', 'critical'].includes(s)) return 'red-1'
  return 'grey-3'
}

function getIcon(status) {
  const s = status.toLowerCase()
  if (['completed', 'paid'].includes(s)) return 'check_circle'
  if (['pending', 'processing'].includes(s)) return 'hourglass_empty'
  if (['cooking'].includes(s)) return 'soup_kitchen'
  if (['ready', 'delivered'].includes(s)) return 'local_shipping'
  if (['cancelled', 'void'].includes(s)) return 'cancel'
  if (['low', 'critical'].includes(s)) return 'warning'
  return 'info'
}
</script>
