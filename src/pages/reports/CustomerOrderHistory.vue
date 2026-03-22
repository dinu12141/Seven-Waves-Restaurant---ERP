<template>
  <ReportLayout title="Customer Order History" subtitle="Customer-centric order history with spend analysis" :kpis="kpiData" @filter-change="loadData" @export-csv="exportCSV" @export-excel="exportExcel" @refresh="loadData">
    <template #default>
      <q-table :rows="rows" :columns="columns" row-key="customer" flat class="report-table" :loading="loading" :rows-per-page-options="[25,50,100]" :pagination="{rowsPerPage:50,sortBy:'total_spent',descending:true}" binary-state-sort>
        <template #header="props"><q-tr :props="props" class="report-table__header-row"><q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">{{col.label}}</q-th></q-tr></template>
        <template #body="props"><q-tr :props="props" class="report-table__row">
          <q-td key="customer" :props="props" class="text-weight-bold">{{props.row.customer}}</q-td>
          <q-td key="phone" :props="props" class="report-table__td--mono">{{props.row.phone}}</q-td>
          <q-td key="order_count" :props="props" class="report-table__td--num text-weight-bold">{{props.row.order_count}}</q-td>
          <q-td key="total_spent" :props="props" class="report-table__td--num text-weight-bolder text-green">{{fmtLKR(props.row.total_spent)}}</q-td>
          <q-td key="avg_order" :props="props" class="report-table__td--num">{{fmtLKR(props.row.avg_order)}}</q-td>
          <q-td key="last_order" :props="props">{{fmtDate(props.row.last_order)}}</q-td>
        </q-tr></template>
        <template #no-data><div class="report-empty"><q-icon name="history" size="40px" class="q-mb-sm"/><div>No customer order data</div></div></template>
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtDate, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name:'customer',label:'Customer',field:'customer',align:'left',sortable:true },
  { name:'phone',label:'Phone',field:'phone',align:'left' },
  { name:'order_count',label:'Orders',field:'order_count',align:'right',sortable:true },
  { name:'total_spent',label:'Total Spent',field:'total_spent',align:'right',sortable:true },
  { name:'avg_order',label:'Avg Order',field:'avg_order',align:'right',sortable:true },
  { name:'last_order',label:'Last Order',field:'last_order',align:'left',sortable:true },
]
const kpiData = computed(()=>[
  {label:'Total Customers',value:rows.value.length,icon:'people',color:'blue'},
  {label:'Total Revenue',value:fmtLKR(rows.value.reduce((s,r)=>s+r.total_spent,0)),icon:'payments',color:'green'},
  {label:'Top Spender',value:rows.value[0]?.customer||'—',icon:'emoji_events',color:'amber'},
  {label:'Repeat Customers',value:rows.value.filter(r=>r.order_count>1).length,icon:'loyalty',color:'purple'},
])
async function loadData(filters={}){
  loading.value=true
  try{
    let query=supabase.from('orders').select('customer_name,customer_phone,total_amount,created_at,status').neq('status','cancelled')
    if(filters.dateFrom)query=query.gte('created_at',filters.dateFrom+'T00:00:00')
    if(filters.dateTo)query=query.lte('created_at',filters.dateTo+'T23:59:59')
    if(filters.branch)query=query.eq('branch_id',filters.branch)
    query=applyBranchSecurity(query)
    const{data,error}=await query.limit(5000)
    if(error)throw error
    const cMap={}
    ;(data||[]).forEach(o=>{const name=o.customer_name||o.customer_phone||'Walk-in';if(!cMap[name])cMap[name]={customer:name,phone:o.customer_phone||'—',order_count:0,total_spent:0,last_order:null}
    cMap[name].order_count++;cMap[name].total_spent+=Number(o.total_amount||0);if(!cMap[name].last_order||o.created_at>cMap[name].last_order)cMap[name].last_order=o.created_at})
    rows.value=Object.values(cMap).map(c=>({...c,avg_order:c.order_count>0?c.total_spent/c.order_count:0})).sort((a,b)=>b.total_spent-a.total_spent)
  }catch(e){console.error('[CustomerHistory]',e)}finally{loading.value=false}
}
function exportCSV(){exportTableToCSV(columns,rows.value,'customer_order_history')}
function exportExcel(){exportTableToExcel(columns,rows.value,'customer_order_history')}
</script>
<style scoped lang="scss">@import 'src/pages/reports/report-common.scss';</style>
