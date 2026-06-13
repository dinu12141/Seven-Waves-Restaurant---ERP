<template>
  <q-card flat bordered class="q-pa-md">
    <div class="text-h6 q-mb-md"><q-icon name="article" class="q-mr-sm" />{{ report.title || 'Financial Statement' }}</div>
    <div class="text-caption text-grey-6 q-mb-md">{{ report.period || report.as_of_date || '' }}</div>

    <!-- Sections -->
    <template v-for="section in report.sections" :key="section.label">
      <div class="text-subtitle1 text-weight-bold q-mt-md q-mb-sm" style="border-bottom:2px solid var(--q-primary)">{{ section.label }}</div>
      <q-list dense separator>
        <q-item v-for="item in section.items" :key="item.name" class="q-px-none">
          <q-item-section>{{ item.name }}</q-item-section>
          <q-item-section side class="text-weight-medium" :class="item.amount >= 0 ? 'text-green-8' : 'text-red-8'">
            LKR {{ Math.abs(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
          </q-item-section>
        </q-item>
      </q-list>
      <div class="text-right text-weight-bold q-mt-sm" style="border-top:1px solid #ddd; padding-top:8px">
        Total: LKR {{ Math.abs(section.total).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
      </div>
    </template>

    <!-- Summary line -->
    <div v-if="report.summary_line" class="q-mt-lg q-pa-md bg-grey-2" style="border-radius:8px">
      <div class="text-subtitle1 text-weight-bold text-center">{{ report.summary_line.label }}: LKR {{ Number(report.summary_line.value).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</div>
    </div>

    <!-- Balance check -->
    <q-banner v-if="report.is_balanced === false" class="bg-red-1 text-red-8 q-mt-md" rounded>
      <q-icon name="warning" /> Statement is NOT balanced — please review ledger entries
    </q-banner>
    <q-banner v-else-if="report.is_balanced === true" class="bg-green-1 text-green-8 q-mt-md" rounded>
      <q-icon name="check_circle" /> Statement is balanced ✓
    </q-banner>

    <div class="text-caption text-grey-5 q-mt-md text-right">Generated: {{ report.generated_at }}</div>
  </q-card>
</template>

<script setup>
defineProps({ report: { type: Object, default: () => ({ sections: [] }) } })
</script>
