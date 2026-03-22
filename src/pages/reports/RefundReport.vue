<template>
  <ReportLayout title="Refund Report" subtitle="All refund transactions with original bill reference" :kpis="kpiData" @filter-change="loadData" @export-csv="exportCSV" @export-excel="exportExcel" @refresh="loadData">
    <template #default>
      <q-table :rows="rows" :columns="columns" row-key="id" flat class="report-table" :loading="loading" :rows-per-page-options="[25,50,100]" :pagination="{rowsPerPage:50}" binary-state-sort>
        <template #header="props"><q-tr :props="props" class="report-table__header-row"><q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">{{col.label}}</q-th></q-tr></template>
        <template #body="props"><q-tr :props="props" class="report-table__row">
          <q-td key="bill_number" :props="props" class="report-table__td--mono">{{props.row.bill_number}}</q-td>
          <q-td key="date" :props="props">{{fmtDateTime(props.row.date)}}</q-td>
          <q-td key="branch" :props="props">{{props.row.branch}}</q-td>
          <q-td key="total" :props="props" class="report-table__td--num text-red text-weight-bold">{{fmtLKR(props.row.total)}}</q-td>
          <q-td key="status" :props="props"><span class="report-badge report-badge--refunded">Refunded</span></q-td>
          <q-td key="cashier" :props="props">{{props.row.cashier}}</q-td>
        </q-tr></template>
        <template #bottom-row><q-tr class="report-table__total-row">
          <q-td colspan="3" class="report-table__td--bold">TOTAL ({{rows.length}} refunds)</q-td>
          <q-td class="report-table__td--bold report-table__td--num text-red">{{fmtLKR(totals.total)}}</q-td>
          <q-td colspan="2"/>
        </q-tr></template>
        <template #no-data><div class="report-empty"><q-icon name="undo" size="40px" class="q-mb-sm"/><div>No refunds for this period</div></div></template>
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtDateTime, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name:'bill_number',label:'Bill #',field:'bill_number',align:'left',sortable:true },
  { name:'date',label:'Date',field:'date',align:'left',sortable:true },
  { name:'branch',label:'Branch',field:'branch',align:'left',sortable:true },
  { name:'total',label:'Refund Amount',field:'total',align:'right',sortable:true },
  { name:'status',label:'Status',field:'status',align:'left' },
  { name:'cashier',label:'Processed By',field:'cashier',align:'left' },
]
const totals = computed(()=>({total:rows.value.reduce((s,r)=>s+r.total,0)}))
const kpiData = computed(()=>[
  {label:'Total Refunds',value:rows.value.length,icon:'undo',color:'red'},
  {label:'Refund Amount',value:fmtLKR(totals.value.total),icon:'money_off',color:'red'},
  {label:'Avg Refund',value:rows.value.length>0?fmtLKR(totals.value.total/rows.value.length):'—',icon:'trending_down',color:'amber'},
])
async function loadData(filters={}){
  loading.value=true
  try{
    let query=supabase.from('orders').select('id,order_number,created_at,total_amount,status,branches(name),waiter:profiles!orders_waiter_id_fkey(full_name)').eq('status','refunded')
    if(filters.dateFrom)query=query.gte('created_at',filters.dateFrom+'T00:00:00')
    if(filters.dateTo)query=query.lte('created_at',filters.dateTo+'T23:59:59')
    if(filters.branch)query=query.eq('branch_id',filters.branch)
    query=applyBranchSecurity(query)
    const{data,error}=await query.order('created_at',{ascending:false}).limit(1000)
    if(error)throw error
    rows.value=(data||[]).map(r=>({id:r.id,bill_number:r.order_number||`#${r.id?.slice(0,8)}`,date:r.created_at,branch:r.branches?.name||'—',total:Number(r.total_amount||0),status:'refunded',cashier:r.waiter?.full_name||'—'}))
  }catch(e){console.error('[RefundReport]',e)}finally{loading.value=false}
}
function exportCSV(){exportTableToCSV(columns,rows.value,'refund_report')}
function exportExcel(){exportTableToExcel(columns,rows.value,'refund_report')}
</script>
<style scoped lang="scss">@import 'src/pages/reports/report-common.scss';</style>
