<template>
  <ReportLayout title="User Activity Log" subtitle="System audit trail — user actions, logins, and changes" :kpis="kpiData" @filter-change="loadData" @export-csv="exportCSV" @export-excel="exportExcel" @refresh="loadData">
    <template #extra-filters>
      <div class="report-filter-group"><label class="report-filter-label">Search User</label>
        <q-input v-model="search" dense outlined clearable placeholder="User name..." class="report-filter-input"><template #prepend><q-icon name="search" size="16px"/></template></q-input>
      </div>
    </template>
    <template #default>
      <q-table :rows="filteredRows" :columns="columns" row-key="id" flat class="report-table" :loading="loading" :rows-per-page-options="[25,50,100]" :pagination="{rowsPerPage:50}" binary-state-sort>
        <template #header="props"><q-tr :props="props" class="report-table__header-row"><q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">{{col.label}}</q-th></q-tr></template>
        <template #body="props"><q-tr :props="props" class="report-table__row">
          <q-td key="timestamp" :props="props" class="report-table__td--mono">{{fmtDateTime(props.row.timestamp)}}</q-td>
          <q-td key="user" :props="props" class="text-weight-bold">{{props.row.user}}</q-td>
          <q-td key="action" :props="props"><span class="report-badge">{{props.row.action}}</span></q-td>
          <q-td key="module" :props="props">{{props.row.module}}</q-td>
          <q-td key="details" :props="props" class="report-table__td--muted" style="max-width:250px"><span class="report-truncate">{{props.row.details||'—'}}</span></q-td>
        </q-tr></template>
        <template #no-data><div class="report-empty"><q-icon name="manage_accounts" size="40px" class="q-mb-sm"/><div>No activity log data available</div></div></template>
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtDateTime } from 'src/services/reportService'
const loading = ref(false), rows = ref([]), search = ref('')
const columns = [
  { name:'timestamp',label:'Timestamp',field:'timestamp',align:'left',sortable:true },
  { name:'user',label:'User',field:'user',align:'left',sortable:true },
  { name:'action',label:'Action',field:'action',align:'left',sortable:true },
  { name:'module',label:'Module',field:'module',align:'left',sortable:true },
  { name:'details',label:'Details',field:'details',align:'left' },
]
const filteredRows = computed(()=>{if(!search.value)return rows.value;const q=search.value.toLowerCase();return rows.value.filter(r=>r.user?.toLowerCase().includes(q))})
const kpiData = computed(()=>[
  {label:'Total Actions',value:filteredRows.value.length,icon:'manage_accounts',color:'blue'},
  {label:'Unique Users',value:new Set(rows.value.map(r=>r.user)).size,icon:'people',color:'green'},
])
async function loadData(filters={}){
  loading.value=true
  try{
    let query=supabase.from('audit_logs').select('id,created_at,action,module,details,profiles(full_name)')
    if(filters.dateFrom)query=query.gte('created_at',filters.dateFrom+'T00:00:00')
    if(filters.dateTo)query=query.lte('created_at',filters.dateTo+'T23:59:59')
    const{data,error}=await query.order('created_at',{ascending:false}).limit(500)
    if(error)throw error
    rows.value=(data||[]).map(r=>({id:r.id,timestamp:r.created_at,user:r.profiles?.full_name||'System',action:r.action||'—',module:r.module||'—',details:typeof r.details==='object'?JSON.stringify(r.details):r.details||'—'}))
  }catch(e){console.error('[UserActivity]',e);rows.value=[]}finally{loading.value=false}
}
function exportCSV(){exportTableToCSV(columns,filteredRows.value,'user_activity_log')}
function exportExcel(){exportTableToExcel(columns,filteredRows.value,'user_activity_log')}
</script>
<style scoped lang="scss">@import 'src/pages/reports/report-common.scss';.report-truncate{display:block;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>
