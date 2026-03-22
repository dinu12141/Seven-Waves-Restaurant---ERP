<template>
  <ReportLayout title="Order Status Report" subtitle="Orders breakdown by current status" :kpis="kpiData" @filter-change="loadData" @export-csv="exportCSV" @export-excel="exportExcel" @refresh="loadData">
    <template #default>
      <q-table :rows="rows" :columns="columns" row-key="status" flat class="report-table" :loading="loading" :rows-per-page-options="[25]" hide-pagination>
        <template #header="props"><q-tr :props="props" class="report-table__header-row"><q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">{{col.label}}</q-th></q-tr></template>
        <template #body="props"><q-tr :props="props" class="report-table__row">
          <q-td key="status" :props="props"><span class="report-badge" :class="`report-badge--${props.row.status}`">{{props.row.status}}</span></q-td>
          <q-td key="count" :props="props" class="report-table__td--num text-weight-bold">{{props.row.count}}</q-td>
          <q-td key="total" :props="props" class="report-table__td--num text-weight-bolder text-green">{{fmtLKR(props.row.total)}}</q-td>
          <q-td key="avg" :props="props" class="report-table__td--num">{{fmtLKR(props.row.avg)}}</q-td>
          <q-td key="share" :props="props" class="report-table__td--num">{{fmtPercent(props.row.share)}}</q-td>
        </q-tr></template>
        <template #bottom-row><q-tr class="report-table__total-row">
          <q-td class="report-table__td--bold">TOTAL</q-td>
          <q-td class="report-table__td--bold report-table__td--num">{{totals.count}}</q-td>
          <q-td class="report-table__td--bold report-table__td--num text-green">{{fmtLKR(totals.total)}}</q-td>
          <q-td class="report-table__td--bold report-table__td--num">{{totals.count>0?fmtLKR(totals.total/totals.count):'—'}}</q-td>
          <q-td class="report-table__td--bold report-table__td--num">100%</q-td>
        </q-tr></template>
        <template #no-data><div class="report-empty"><q-icon name="fact_check" size="40px" class="q-mb-sm"/><div>No order data</div></div></template>
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtPercent, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name:'status',label:'Status',field:'status',align:'left',sortable:true },
  { name:'count',label:'Orders',field:'count',align:'right',sortable:true },
  { name:'total',label:'Total Amount',field:'total',align:'right',sortable:true },
  { name:'avg',label:'Avg Order',field:'avg',align:'right',sortable:true },
  { name:'share',label:'% Share',field:'share',align:'right',sortable:true },
]
const totals = computed(()=>({count:rows.value.reduce((s,r)=>s+r.count,0),total:rows.value.reduce((s,r)=>s+r.total,0)}))
const kpiData = computed(()=>[
  {label:'Total Orders',value:totals.value.count,icon:'receipt_long',color:'blue'},
  {label:'Total Revenue',value:fmtLKR(totals.value.total),icon:'payments',color:'green'},
  {label:'Status Types',value:rows.value.length,icon:'fact_check',color:'purple'},
])
async function loadData(filters={}){
  loading.value=true
  try{
    let query=supabase.from('orders').select('status,total_amount')
    if(filters.dateFrom)query=query.gte('created_at',filters.dateFrom+'T00:00:00')
    if(filters.dateTo)query=query.lte('created_at',filters.dateTo+'T23:59:59')
    if(filters.branch)query=query.eq('branch_id',filters.branch)
    query=applyBranchSecurity(query)
    const{data,error}=await query.limit(5000)
    if(error)throw error
    const sMap={};let gt=0
    ;(data||[]).forEach(b=>{const s=b.status||'unknown';if(!sMap[s])sMap[s]={status:s,count:0,total:0};sMap[s].count++;sMap[s].total+=Number(b.total_amount||0);gt+=Number(b.total_amount||0)})
    rows.value=Object.values(sMap).map(s=>({...s,avg:s.count>0?s.total/s.count:0,share:gt>0?(s.total/gt)*100:0})).sort((a,b)=>b.count-a.count)
  }catch(e){console.error('[OrderStatus]',e)}finally{loading.value=false}
}
function exportCSV(){exportTableToCSV(columns,rows.value,'order_status')}
function exportExcel(){exportTableToExcel(columns,rows.value,'order_status')}
</script>
<style scoped lang="scss">@import 'src/pages/reports/report-common.scss';</style>
