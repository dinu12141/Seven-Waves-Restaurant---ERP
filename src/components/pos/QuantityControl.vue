<template>
  <div class="quantity-control row items-center no-wrap">
    <q-btn flat dense round icon="remove" size="xs" class="qty-btn decrease" @click="decrease" />
    <div class="qty-value text-weight-bold">{{ modelValue }}</div>
    <q-btn flat dense round icon="add" size="xs" class="qty-btn increase" @click="increase" />
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Number,
    default: 1,
  },
  min: {
    type: Number,
    default: 0,
  },
  max: {
    type: Number,
    default: 99,
  },
})

const emit = defineEmits(['update:modelValue'])

function decrease() {
  if (props.modelValue > props.min) {
    emit('update:modelValue', props.modelValue - 1)
  }
}

function increase() {
  if (props.modelValue < props.max) {
    emit('update:modelValue', props.modelValue + 1)
  }
}
</script>

<style scoped lang="scss">
.quantity-control {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  padding: 2px;
  gap: 0;
}

.qty-btn {
  width: 26px;
  height: 26px;
  min-height: 26px;

  &.decrease {
    color: #ef5350;
  }

  &.increase {
    color: #66bb6a;
  }
}

.qty-value {
  color: #fff;
  font-size: 0.85rem;
  min-width: 24px;
  text-align: center;
  user-select: none;
}
</style>
