<template>
  <!-- Petty Cash Book = the GL cash book scoped to the petty cash ledgers
       (Petty Cash -HR, Store Petty Cash, Change Fund …). The legacy
       finance_petty_cash_entries table is not part of the GL. -->
  <CashbookPage petty />
</template>

<script setup>
import CashbookPage from './CashbookPage.vue'
</script>
