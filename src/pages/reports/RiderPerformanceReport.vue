<template>
  <ReportLayout title="Rider Performance Report" subtitle="Per-rider delivery metrics and performance ranking" :kpis="kpiData" @filter-change="loadData" @export-csv="exportCSV" @export-excel="exportExcel" @refresh="loadData">
    <template #default>
      <q-table :rows="rows" :columns="columns" row-key="rider" flat class="report-table" :loading="loading" :rows-per-page-options="[25,50]" :pagination="{rowsPerPage:25,sortBy:'deliveries',descending:true}">
        <template #header="props"><q-tr :props="props" class="report-table__header-row"><q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">{{col.label}}</q-th></q-tr></template>
        <template #body="props"><q-tr :props="props" class="report-table__row">
          <q-td key="rider" :props="props" class="text-weight-bold">{{props.row.rider}}</q-td>
          <q-td key="deliveries" :props="props" class="report-table__td--num text-weight-bold">{{props.row.deliveries}}</q-td>
          <q-td key="avg_time" :props="props" class="report-table__td--num"><q-badge :color="props.row.avg_time>35?'red':props.row.avg_time>25?'orange':'green'">{{props.row.avg_time}} min</q-badge></q-td>
          <q-td key="on_time_pct" :props="props" class="report-table__td--num"><q-badge :color="props.row.on_time_pct>=90?'green':props.row.on_time_pct>=70?'orange':'red'">{{fmtPercent(props.row.on_time_pct)}}</q-badge></q-td>
          <q-td key="total_value" :props="props" class="report-table__td--num text-green">{{fmtLKR(props.row.total_value)}}</q-td>
        </q-tr></template>
        <template #no-data><div class="report-empty"><q-icon name="two_wheeler" size="40px" class="q-mb-sm"/><div>No rider data</div></div></template>
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtPercent } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name:'rider',label:'Rider',field:'rider',align:'left',sortable:true },
  { name:'deliveries',label:'Deliveries',field:'deliveries',align:'right',sortable:true },
  { name:'avg_time',label:'Avg Time',field:'avg_time',align:'right',sortable:true },
  { name:'on_time_pct',label:'On-Time %',field:'on_time_pct',align:'right',sortable:true },
  { name:'total_value',label:'Total Value',field:'total_value',align:'right',sortable:true },
]
const kpiData = computed(()=>[
  {label:'Active Riders',value:rows.value.length,icon:'two_wheeler',color:'blue'},
  {label:'Total Deliveries',value:rows.value.reduce((s,r)=>s+r.deliveries,0),icon:'local_shipping',color:'green'},
  {label:'Best Rider',value:rows.value[0]?.rider||'—',icon:'emoji_events',color:'amber'},
])
async function loadData(filters={}){
  loading.value=true
  try{
    let query=supabase.from('delivery_assignments').select('id,created_at,delivered_at,status,rider_id,orders(total_amount),profiles(full_name)')
    if(filters.dateFrom)query=query.gte('created_at',filters.dateFrom+'T00:00:00')
    if(filters.dateTo)query=query.lte('created_at',filters.dateTo+'T23:59:59')
    const{data,error}=await query.limit(2000)
    if(error)throw error
    const rMap={}
    ;(data||[]).forEach(d=>{const name=d.profiles?.full_name||'Unknown';if(!rMap[name])rMap[name]={rider:name,deliveries:0,total_time:0,on_time:0,total_value:0}
    rMap[name].deliveries++;const created=new Date(d.created_at);const delivered=d.delivered_at?new Date(d.delivered_at):new Date();const t=Math.round((delivered-created)/60000)
    rMap[name].total_time+=t;if(t<=30)rMap[name].on_time++;rMap[name].total_value+=Number(d.orders?.total_amount||0)})
    rows.value=Object.values(rMap).map(r=>({...r,avg_time:r.deliveries>0?Math.round(r.total_time/r.deliveries):0,on_time_pct:r.deliveries>0?(r.on_time/r.deliveries)*100:0})).sort((a,b)=>b.deliveries-a.deliveries)
  }catch(e){console.error('[RiderPerf]',e)}finally{loading.value=false}
}
function exportCSV(){exportTableToCSV(columns,rows.value,'rider_performance')}
function exportExcel(){exportTableToExcel(columns,rows.value,'rider_performance')}
</script>
<style scoped lang="scss">@import 'src/pages/reports/report-common.scss';</style>
