<template>
  <ReportLayout title="Staff Sales Performance" subtitle="Staff productivity metrics — orders handled, revenue generated, average order value" :kpis="kpiData" @filter-change="loadData" @export-csv="exportCSV" @export-excel="exportExcel" @refresh="loadData">
    <template #default>
      <q-table :rows="rows" :columns="columns" row-key="staff" flat class="report-table" :loading="loading" :rows-per-page-options="[25,50]" :pagination="{rowsPerPage:25,sortBy:'total',descending:true}" binary-state-sort>
        <template #header="props"><q-tr :props="props" class="report-table__header-row"><q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">{{col.label}}</q-th></q-tr></template>
        <template #body="props"><q-tr :props="props" class="report-table__row">
          <q-td key="staff" :props="props" class="text-weight-bold">{{props.row.staff}}</q-td>
          <q-td key="orders" :props="props" class="report-table__td--num text-weight-bold">{{props.row.orders}}</q-td>
          <q-td key="total" :props="props" class="report-table__td--num text-weight-bolder text-green">{{fmtLKR(props.row.total)}}</q-td>
          <q-td key="avg_order" :props="props" class="report-table__td--num">{{fmtLKR(props.row.avg_order)}}</q-td>
          <q-td key="share" :props="props" class="report-table__td--num"><q-badge :color="props.row.share>20?'blue':'grey'">{{fmtPercent(props.row.share)}}</q-badge></q-td>
        </q-tr></template>
        <template #bottom-row><q-tr class="report-table__total-row">
          <q-td class="report-table__td--bold">TOTAL</q-td>
          <q-td class="report-table__td--bold report-table__td--num">{{totals.orders}}</q-td>
          <q-td class="report-table__td--bold report-table__td--num text-green">{{fmtLKR(totals.total)}}</q-td>
          <q-td class="report-table__td--bold report-table__td--num">{{totals.orders>0?fmtLKR(totals.total/totals.orders):'—'}}</q-td>
          <q-td class="report-table__td--bold report-table__td--num">100%</q-td>
        </q-tr></template>
        <template #no-data><div class="report-empty"><q-icon name="emoji_events" size="40px" class="q-mb-sm"/><div>No staff performance data</div></div></template>
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
const loading = ref(false), rows = ref([])
const columns = [
  { name:'staff',label:'Staff Member',field:'staff',align:'left',sortable:true },
  { name:'orders',label:'Orders',field:'orders',align:'right',sortable:true },
  { name:'total',label:'Total Revenue',field:'total',align:'right',sortable:true },
  { name:'avg_order',label:'Avg Order',field:'avg_order',align:'right',sortable:true },
  { name:'share',label:'% Share',field:'share',align:'right',sortable:true },
]
const totals = computed(()=>({orders:rows.value.reduce((s,r)=>s+r.orders,0),total:rows.value.reduce((s,r)=>s+r.total,0)}))
const kpiData = computed(()=>[
  {label:'Staff Members',value:rows.value.length,icon:'badge',color:'blue'},
  {label:'Total Revenue',value:fmtLKR(totals.value.total),icon:'payments',color:'green'},
  {label:'Top Performer',value:rows.value[0]?.staff||'—',icon:'emoji_events',color:'amber'},
  {label:'Total Orders',value:totals.value.orders,icon:'receipt_long',color:'purple'},
])
async function loadData(filters={}){
  loading.value=true
  try{
    let query=supabase.from('orders').select('total_amount,status,waiter:profiles!orders_waiter_id_fkey(full_name)').neq('status','cancelled').neq('status','void')
    if(filters.dateFrom)query=query.gte('created_at',filters.dateFrom+'T00:00:00')
    if(filters.dateTo)query=query.lte('created_at',filters.dateTo+'T23:59:59')
    if(filters.branch)query=query.eq('branch_id',filters.branch)
    query=applyBranchSecurity(query)
    const{data,error}=await query.limit(5000)
    if(error)throw error
    const sMap={};let gt=0
    ;(data||[]).forEach(b=>{const n=b.waiter?.full_name||'Unknown';if(!sMap[n])sMap[n]={staff:n,orders:0,total:0};sMap[n].orders++;sMap[n].total+=Number(b.total_amount||0);gt+=Number(b.total_amount||0)})
    rows.value=Object.values(sMap).map(s=>({...s,avg_order:s.orders>0?s.total/s.orders:0,share:gt>0?(s.total/gt)*100:0})).sort((a,b)=>b.total-a.total)
  }catch(e){console.error('[StaffPerformance]',e)}finally{loading.value=false}
}
function exportCSV(){exportTableToCSV(columns,rows.value,'staff_performance')}
function exportExcel(){exportTableToExcel(columns,rows.value,'staff_performance')}
</script>
<style scoped lang="scss">@import 'src/pages/reports/report-common.scss';</style>
