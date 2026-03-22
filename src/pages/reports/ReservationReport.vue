<template>
  <ReportLayout title="Reservation Report" subtitle="Reservation statistics and occupancy tracking" :kpis="kpiData" @filter-change="loadData" @export-csv="exportCSV" @export-excel="exportExcel" @refresh="loadData">
    <template #default>
      <q-table :rows="rows" :columns="columns" row-key="id" flat class="report-table" :loading="loading" :rows-per-page-options="[25,50,100]" :pagination="{rowsPerPage:50}" binary-state-sort>
        <template #header="props"><q-tr :props="props" class="report-table__header-row"><q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">{{col.label}}</q-th></q-tr></template>
        <template #body="props"><q-tr :props="props" class="report-table__row">
          <q-td key="date" :props="props">{{fmtDate(props.row.date)}}</q-td>
          <q-td key="time" :props="props">{{props.row.time}}</q-td>
          <q-td key="name" :props="props" class="text-weight-bold">{{props.row.name}}</q-td>
          <q-td key="guests" :props="props" class="report-table__td--num">{{props.row.guests}}</q-td>
          <q-td key="table_no" :props="props">{{props.row.table_no||'—'}}</q-td>
          <q-td key="status" :props="props"><span class="report-badge" :class="`report-badge--${props.row.status}`">{{props.row.status}}</span></q-td>
          <q-td key="phone" :props="props" class="report-table__td--mono">{{props.row.phone||'—'}}</q-td>
        </q-tr></template>
        <template #no-data><div class="report-empty"><q-icon name="event_seat" size="40px" class="q-mb-sm"/><div>No reservation data available</div></div></template>
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtDate, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name:'date',label:'Date',field:'date',align:'left',sortable:true },
  { name:'time',label:'Time',field:'time',align:'left' },
  { name:'name',label:'Guest Name',field:'name',align:'left',sortable:true },
  { name:'guests',label:'Guests',field:'guests',align:'right',sortable:true },
  { name:'table_no',label:'Table',field:'table_no',align:'left' },
  { name:'status',label:'Status',field:'status',align:'left',sortable:true },
  { name:'phone',label:'Phone',field:'phone',align:'left' },
]
const kpiData = computed(()=>[
  {label:'Total Reservations',value:rows.value.length,icon:'event_seat',color:'blue'},
  {label:'Total Guests',value:rows.value.reduce((s,r)=>s+(r.guests||0),0),icon:'groups',color:'green'},
  {label:'Confirmed',value:rows.value.filter(r=>r.status==='confirmed').length,icon:'check_circle',color:'green'},
  {label:'No-Shows',value:rows.value.filter(r=>r.status==='no_show').length,icon:'person_off',color:'red'},
])
async function loadData(filters={}){
  loading.value=true
  try{
    let query=supabase.from('reservations').select('*')
    if(filters.dateFrom)query=query.gte('reservation_date',filters.dateFrom)
    if(filters.dateTo)query=query.lte('reservation_date',filters.dateTo)
    if(filters.branch)query=query.eq('branch_id',filters.branch)
    query=applyBranchSecurity(query)
    const{data,error}=await query.order('reservation_date',{ascending:false}).limit(500)
    if(error)throw error
    rows.value=(data||[]).map(r=>({id:r.id,date:r.reservation_date,time:r.reservation_time||'—',name:r.guest_name||r.customer_name||'—',guests:r.guest_count||r.party_size||0,table_no:r.table_number,status:r.status||'pending',phone:r.phone||r.contact_number||'—'}))
  }catch(e){console.error('[Reservation]',e);rows.value=[]}finally{loading.value=false}
}
function exportCSV(){exportTableToCSV(columns,rows.value,'reservations')}
function exportExcel(){exportTableToExcel(columns,rows.value,'reservations')}
</script>
<style scoped lang="scss">@import 'src/pages/reports/report-common.scss';</style>
