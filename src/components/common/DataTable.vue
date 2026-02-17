<template>
  <q-card class="bg-grey-9 text-white" flat bordered>
    <q-card-section class="row items-center q-pb-none">
      <div class="text-h6">{{ title }}</div>
      <q-space />
      <div class="row q-gutter-sm">
        <slot name="top-right"></slot>
      </div>
    </q-card-section>

    <q-card-section>
      <q-table
        :rows="rows"
        :columns="columns"
        :filter="filter"
        row-key="id"
        dark
        flat
        bordered
        :loading="loading"
        class="bg-transparent"
        card-class="bg-transparent text-white"
        table-header-class="text-grey-5 text-uppercase"
      >
        <!-- Pass through all slots dynamically -->
        <template v-for="(_, name) in $slots" v-slot:[name]="slotData">
          <slot :name="name" v-bind="slotData" />
        </template>

        <template v-slot:loading>
          <q-inner-loading showing color="primary" />
        </template>

        <template v-slot:no-data>
          <slot name="no-data">
            <div class="full-width row flex-center text-grey-5 q-pa-md">
              <q-icon size="2em" name="sentiment_dissatisfied" />
              <span class="q-ml-sm">No data available</span>
            </div>
          </slot>
        </template>
      </q-table>
    </q-card-section>
  </q-card>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: 'Data Table',
  },
  rows: {
    type: Array,
    required: true,
  },
  columns: {
    type: Array,
    required: true,
  },
  filter: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
})
</script>

<style scoped>
:deep(.q-table__card) {
  box-shadow: none;
}
:deep(.q-table th) {
  font-weight: bold;
}
</style>
