<template>
  <q-page class="report-page">
    <!-- ── Toolbar ───────────────────────────────────────────────────── -->
    <div class="report-toolbar">
      <div class="report-toolbar__left">
        <div class="report-toolbar__breadcrumb">
          <span class="report-toolbar__breadcrumb-item">REPORTS</span>
          <span class="report-toolbar__breadcrumb-sep">/</span>
          <span class="report-toolbar__breadcrumb-item report-toolbar__breadcrumb-item--active">{{
            title
          }}</span>
        </div>
        <h1 class="report-toolbar__title">{{ title }}</h1>
        <p v-if="subtitle" class="report-toolbar__subtitle">{{ subtitle }}</p>
      </div>
      <div class="report-toolbar__right">
        <!-- SAP B1-style Icon Toolbar Strip -->
        <div class="sap-icon-strip">
          <!-- Filter toggle -->
          <q-btn
            flat
            dense
            round
            :icon="filtersOpen ? 'filter_list_off' : 'filter_list'"
            class="sap-icon-strip__btn"
            :class="{ 'sap-icon-strip__btn--active': filtersOpen }"
            @click="filtersOpen = !filtersOpen"
          >
            <q-badge
              v-if="activeFilterCount > 0 && !filtersOpen"
              floating
              color="primary"
              :label="activeFilterCount"
              class="sap-icon-strip__badge"
            />
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle">
              {{ filtersOpen ? 'Hide Filters' : 'Show Filters' }}
            </q-tooltip>
          </q-btn>

          <!-- Refresh -->
          <q-btn flat dense round icon="refresh" class="sap-icon-strip__btn" @click="handleRefresh">
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle"
              >Refresh Data</q-tooltip
            >
          </q-btn>

          <!-- Separator -->
          <div class="sap-icon-strip__sep" />

          <!-- Print -->
          <q-btn flat dense round icon="print" class="sap-icon-strip__btn" @click="handlePrint">
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle"
              >Print Report</q-tooltip
            >
          </q-btn>

          <!-- Export PDF -->
          <q-btn
            flat
            dense
            round
            icon="picture_as_pdf"
            class="sap-icon-strip__btn"
            @click="handleExportPDF"
          >
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle"
              >Download PDF</q-tooltip
            >
          </q-btn>

          <!-- Export Excel -->
          <q-btn
            flat
            dense
            round
            icon="grid_on"
            class="sap-icon-strip__btn"
            @click="handleExportExcel"
          >
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle"
              >Export Excel</q-tooltip
            >
          </q-btn>

          <!-- Separator -->
          <div class="sap-icon-strip__sep" />

          <!-- Fullscreen -->
          <q-btn
            flat
            dense
            round
            :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'"
            class="sap-icon-strip__btn"
            @click="toggleFullscreen"
          >
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle">
              {{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
            </q-tooltip>
          </q-btn>
        </div>
      </div>
    </div>

    <!-- ── Filter Panel ──────────────────────────────────────────────── -->
    <q-slide-transition>
      <div v-show="filtersOpen" class="report-filter-panel">
        <div class="report-filter-panel__grid">
          <!-- Date Range -->
          <div class="report-filter-group">
            <label class="report-filter-label">Date Range</label>
            <div class="report-filter-date-row">
              <q-input
                v-model="filters.dateFrom"
                dense
                outlined
                type="date"
                class="report-filter-input"
                @update:model-value="onFilterChange"
              />
              <span class="report-filter-date-sep">to</span>
              <q-input
                v-model="filters.dateTo"
                dense
                outlined
                type="date"
                class="report-filter-input"
                @update:model-value="onFilterChange"
              />
            </div>
            <div class="report-date-presets">
              <button
                v-for="preset in datePresets"
                :key="preset.label"
                class="report-date-preset"
                :class="{ active: activePreset === preset.label }"
                @click="applyPreset(preset)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <!-- Branch (admins only — non-admins are locked to their branch by applyBranchSecurity) -->
          <div v-if="branchSelectOptions.length > 2" class="report-filter-group">
            <label class="report-filter-label">Branch</label>
            <q-select
              v-model="filters.branch"
              :options="branchSelectOptions"
              dense
              outlined
              emit-value
              map-options
              clearable
              placeholder="All Branches"
              class="report-filter-input"
              @update:model-value="onFilterChange"
            />
          </div>

          <!-- Kitchen (emitted as filters.kitchen — NOT a branch id) -->
          <div v-if="showKitchenFilter" class="report-filter-group">
            <label class="report-filter-label">Kitchen</label>
            <q-select
              v-model="filters.kitchen"
              :options="branchOptions"
              dense
              outlined
              emit-value
              map-options
              clearable
              placeholder="All Kitchens"
              class="report-filter-input"
              @update:model-value="onFilterChange"
            />
          </div>

          <!-- Dynamic slot for extra filters -->
          <slot name="extra-filters" :filters="filters" />
        </div>

        <!-- Advanced Toggle -->
        <div v-if="$slots['advanced-filters']" class="report-filter-advanced-toggle">
          <button class="report-filter-advanced-btn" @click="advancedOpen = !advancedOpen">
            <q-icon :name="advancedOpen ? 'expand_less' : 'expand_more'" size="16px" />
            {{ advancedOpen ? 'Hide' : 'Show' }} Advanced Filters
          </button>
        </div>
        <q-slide-transition>
          <div v-show="advancedOpen" class="report-filter-advanced">
            <slot name="advanced-filters" :filters="filters" />
          </div>
        </q-slide-transition>

        <div class="report-filter-actions">
          <q-btn
            no-caps
            dense
            label="Apply Filters"
            color="primary"
            class="report-btn report-btn--primary"
            @click="applyFilters"
          />
          <q-btn
            no-caps
            dense
            flat
            label="Clear"
            class="report-btn report-btn--ghost q-ml-sm"
            @click="clearFilters"
          />
        </div>
      </div>
    </q-slide-transition>

    <!-- ── Active Filter Summary Bar ─────────────────────────────────── -->
    <div v-if="appliedFilters && activeFilterCount > 0" class="report-filter-bar">
      <q-icon name="filter_list" size="14px" class="q-mr-xs" />
      <span class="report-filter-bar__label">Active filters:</span>
      <template v-if="appliedFilters.dateFrom && appliedFilters.dateTo">
        <span class="report-filter-chip">
          {{ formatDate(appliedFilters.dateFrom) }} → {{ formatDate(appliedFilters.dateTo) }}
          <q-icon
            name="close"
            size="12px"
            class="cursor-pointer q-ml-xs"
            @click="clearDateFilter"
          />
        </span>
      </template>
      <template v-if="appliedFilters.branch">
        <span class="report-filter-chip">
          Branch: {{ selectedBranchName }}
          <q-icon
            name="close"
            size="12px"
            class="cursor-pointer q-ml-xs"
            @click="clearBranchFilter"
          />
        </span>
      </template>
      <template v-if="appliedFilters.kitchen">
        <span class="report-filter-chip">
          Kitchen: {{ selectedKitchenName }}
          <q-icon
            name="close"
            size="12px"
            class="cursor-pointer q-ml-xs"
            @click="clearKitchenFilter"
          />
        </span>
      </template>
      <slot name="filter-chips" :applied="appliedFilters" />
      <button class="report-filter-bar__clear" @click="clearFilters">Clear all</button>
    </div>

    <!-- ── KPI Summary Row ─────────────────────────────────────────── -->
    <div v-if="kpis && kpis.length" class="report-kpi-row">
      <div
        v-for="kpi in kpis"
        :key="kpi.label"
        class="report-kpi-card"
        :class="`report-kpi-card--${kpi.color || 'blue'}`"
      >
        <!-- Watermark -->
        <q-icon :name="kpi.icon" size="64px" class="report-kpi-card__watermark" />
        <!-- Frosted icon wrap -->
        <div class="report-kpi-card__icon-wrap">
          <q-icon :name="kpi.icon" size="20px" color="white" />
        </div>
        <!-- Body -->
        <div class="report-kpi-card__body">
          <div class="report-kpi-card__label">{{ kpi.label }}</div>
          <div v-fit-text="{ min: 11, max: 22 }" class="report-kpi-card__value">{{ kpi.value }}</div>
          <div v-if="kpi.sub" class="report-kpi-card__sub">{{ kpi.sub }}</div>
        </div>
      </div>
    </div>

    <!-- ── Content Slot ──────────────────────────────────────────────── -->
    <div class="report-content">
      <!-- SAP B1 Company Header (built-in for all reports) -->
      <div v-if="!hideSapHeader" class="sap-header">
        <div class="sap-header__left">
          <div class="sap-header__company">SEVEN WAVES RESTAURANT (PVT) LTD</div>
          <div class="sap-header__trn">TRN :</div>
          <div class="sap-header__title sap-header__title--underline">{{ title }}</div>
          <div class="sap-header__meta">
            <span
              >Location : <strong>{{ branchLabel }}</strong></span
            >
            <span class="sap-header__meta-sep">|</span>
            <span>Date : {{ reportDateLabel }}</span>
          </div>
        </div>
        <div class="sap-header__right">
          <img
            src="~assets/seven-waves-logo-transparent.png"
            alt="Seven Waves"
            class="sap-header__logo"
            @error="(e) => (e.target.style.display = 'none')"
          />
        </div>
      </div>
      <slot :filters="appliedFilters || filters" />
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import { supabase } from 'src/boot/supabase'
import { exportTableToPDF } from 'src/services/exportService'
import ExcelJS from 'exceljs'
import { businessDateStr, addDays, monthStart, monthEnd, dayOfWeek } from 'src/services/reportFilters'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  kpis: { type: Array, default: () => [] },
  branches: { type: Array, default: () => [] },
  autoRefreshInterval: { type: Number, default: 600000 },  // 10 min default (was 60s)
  hideSapHeader: { type: Boolean, default: false },
  exportColumns: { type: Array, default: null },
  exportRows: { type: Array, default: null },
  // Kitchen filter only makes sense for item/KOT-level reports that read filters.kitchen
  showKitchenFilter: { type: Boolean, default: false },
})

const emit = defineEmits([
  'filter-change',
  'export-csv',
  'export-excel',
  'export-pdf',
  'print',
  'refresh',
])

const authStore = useAuthStore()

const filtersOpen = ref(false)
const advancedOpen = ref(false)
const activePreset = ref('Today')
const appliedFilters = ref(null)

// Business-local (Asia/Colombo) calendar day, evaluated on every call so a page
// left open past midnight (or used between 00:00–05:30) never reports "yesterday".
const todayStr = () => businessDateStr()

const filters = ref({
  dateFrom: todayStr(),
  dateTo: todayStr(),
  branch: null,
  kitchen: null,
})

// ── SAP Header computed values ──────────────────────────────────────
const branchSelectOptions = computed(() => {
  if (!authStore.isAdmin) return []
  const opts = [{ label: 'All Branches', value: null }]
  for (const ub of authStore.branches || []) {
    const b = ub?.branches
    if (b?.id && !opts.some((o) => o.value === b.id)) opts.push({ label: b.name, value: b.id })
  }
  return opts
})
const selectedBranchName = computed(() => {
  const id = (appliedFilters.value || filters.value)?.branch
  return branchSelectOptions.value.find((o) => o.value === id)?.label || id || ''
})
const selectedKitchenName = computed(() => {
  const id = (appliedFilters.value || filters.value)?.kitchen
  return branchOptions.value.find((o) => o.value === id)?.label || id || ''
})
const branchLabel = computed(() => {
  if ((appliedFilters.value || filters.value)?.branch) return selectedBranchName.value
  return authStore.isAdmin ? 'All Branches' : authStore.currentBranch?.name || 'All Branches'
})
const reportDateLabel = computed(() => {
  const f = appliedFilters.value || filters.value
  if (f.dateFrom && f.dateTo) {
    const from = new Date(f.dateFrom).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    const to = new Date(f.dateTo).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    return `${from} To ${to}`
  }
  return new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
})

const branchOptions = ref([{ label: 'All Kitchens', value: null }])

async function loadBranches() {
  try {
    const branchId = authStore.currentBranch?.id

    // Kitchens to exclude from the filter (non-selling stations)
    const excludeNames = [
      'CHINEESE',
      'FUNCTION MENU',
      'Main Kitchen',
      'Main Store',
      'OTHERS',
      'SRI LANKAN',
      'WESTERN',
    ]

    // Fetch kitchens only (BENMAR, CASHIER, INDIAN, ITALIAN, JUICE BAR)
    let kitchenQuery = supabase
      .from('kitchens')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
    if (branchId) kitchenQuery = kitchenQuery.eq('branch_id', branchId)
    const { data: kitchenData } = await kitchenQuery

    const opts = [{ label: 'All Kitchens', value: null }]
    if (kitchenData && kitchenData.length) {
      kitchenData
        .filter((k) => !excludeNames.includes(k.name))
        .forEach((k) => {
          opts.push({ label: k.name, value: k.id })
        })
    }

    branchOptions.value = opts
  } catch {
    branchOptions.value = [{ label: 'All Kitchens', value: null }]
  }
}

const datePresets = [
  { label: 'Today', from: () => todayStr(), to: () => todayStr() },
  { label: 'Yesterday', from: () => addDays(todayStr(), -1), to: () => addDays(todayStr(), -1) },
  {
    label: 'This Week',
    from: () => addDays(todayStr(), -dayOfWeek(todayStr())),
    to: () => todayStr(),
  },
  { label: 'Last 30 Days', from: () => addDays(todayStr(), -30), to: () => todayStr() },
  { label: 'This Month', from: () => monthStart(todayStr()), to: () => todayStr() },
  { label: 'Last Month', from: () => monthStart(todayStr(), -1), to: () => monthEnd(todayStr(), -1) },
  { label: 'Last 3 Months', from: () => addDays(todayStr(), -91), to: () => todayStr() },
  { label: 'This Year', from: () => `${todayStr().slice(0, 4)}-01-01`, to: () => todayStr() },
  { label: 'All Time', from: () => '2020-01-01', to: () => todayStr() },
]

const activeFilterCount = computed(() => {
  if (!appliedFilters.value) return 0
  let count = 0
  if (appliedFilters.value.dateFrom || appliedFilters.value.dateTo) count++
  if (appliedFilters.value.branch) count++
  if (appliedFilters.value.kitchen) count++
  return count
})

function applyPreset(preset) {
  activePreset.value = preset.label
  filters.value.dateFrom = preset.from()
  filters.value.dateTo = preset.to()
}

function onFilterChange() {
  activePreset.value = ''
}

function applyFilters() {
  appliedFilters.value = { ...filters.value }
  emit('filter-change', appliedFilters.value)
  filtersOpen.value = false
}

// Reset returns to the same default the page opens with (Today), keeping any
// page-specific extra filter keys but clearing their values.
function clearFilters() {
  const extra = Object.fromEntries(
    Object.keys(filters.value)
      .filter((k) => !['dateFrom', 'dateTo', 'branch', 'kitchen'].includes(k))
      .map((k) => [k, null]),
  )
  filters.value = { ...extra, dateFrom: todayStr(), dateTo: todayStr(), branch: null, kitchen: null }
  appliedFilters.value = { ...filters.value }
  activePreset.value = 'Today'
  emit('filter-change', appliedFilters.value)
}

// Removing a chip must actually re-run the report (previously it only mutated the
// chip state, leaving stale data on screen).
function reapply(patch) {
  filters.value = { ...filters.value, ...patch }
  appliedFilters.value = { ...(appliedFilters.value || {}), ...patch }
  emit('filter-change', appliedFilters.value)
}

function clearDateFilter() {
  activePreset.value = ''
  reapply({ dateFrom: null, dateTo: null })
}

function clearBranchFilter() {
  reapply({ branch: null })
}

function clearKitchenFilter() {
  reapply({ kitchen: null })
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ── Build subtitle for exports ──────────────────────────────────────
function getExportSubtitle() {
  const f = appliedFilters.value || filters.value
  const branch = branchLabel.value
  if (f.dateFrom && f.dateTo) {
    const from = new Date(f.dateFrom).toLocaleDateString('en-GB')
    const to = new Date(f.dateTo).toLocaleDateString('en-GB')
    return `Location: ${branch} | ${from} To ${to}`
  }
  return `Location: ${branch}`
}

function handlePrint() {
  // Set print metadata for the footer
  const page = document.querySelector('.report-page')
  if (page) {
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    page.setAttribute('data-print-date', `${dateStr} ${timeStr}`)
  }
  const origTitle = document.title
  const dateStr = todayStr()
  document.title = `${props.title.replace(/\s+/g, '_')}_${dateStr}`

  // ── Force all rows visible for print ───────────────────────────────
  // Find all hidden table rows (pagination hides rows beyond current page)
  // and temporarily remove the inline display:none style
  const hiddenRows = document.querySelectorAll('.q-table tbody tr[style*="display: none"]')
  hiddenRows.forEach((tr) => {
    tr.dataset.wasHidden = 'true'
    tr.style.removeProperty('display')
  })

  // Trigger print after a short delay to allow DOM update
  setTimeout(() => {
    window.print()
    document.title = origTitle

    // Restore hidden rows
    document.querySelectorAll('.q-table tbody tr[data-was-hidden="true"]').forEach((tr) => {
      tr.style.display = 'none'
      delete tr.dataset.wasHidden
    })
  }, 200)
}

// ── PDF Export ──────────────────────────────────────────────────────
async function handleExportPDF() {
  // If exportColumns & exportRows are provided, use jsPDF+autoTable (clean PDF)
  if (props.exportColumns && props.exportRows) {
    await exportTableToPDF(props.exportColumns, props.exportRows, props.title, getExportSubtitle())
    return
  }
  // Otherwise fall back to html2canvas or emit
  const sapContent = document.querySelector('.report-content')
  if (!sapContent) {
    emit('export-pdf')
    return
  }

  try {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    // Force ALL elements to white bg + dark text for capture
    sapContent.classList.add('pdf-export-mode')
    const allElements = sapContent.querySelectorAll('*')
    const origStyles = []
    allElements.forEach((el) => {
      const s = el.style
      origStyles.push({
        bg: s.backgroundColor,
        color: s.color,
      })
      // Only force bg on non-header elements (keep navy headers)
      const cs = getComputedStyle(el)
      const bgR = parseInt(cs.backgroundColor?.match(/\d+/)?.[0] || '255')
      if (bgR < 50) {
        // Dark element — likely table header, keep it
      } else {
        s.backgroundColor = '#ffffff'
      }
      // Force dark text for readability
      const colR = parseInt(cs.color?.match(/\d+/)?.[0] || '0')
      if (colR > 200) {
        s.color = '#1a1a1a'
      }
    })
    sapContent.style.backgroundColor = '#ffffff'

    const canvas = await html2canvas(sapContent, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 1200,
    })

    // Restore ALL styles
    allElements.forEach((el, i) => {
      el.style.backgroundColor = origStyles[i].bg
      el.style.color = origStyles[i].color
    })
    sapContent.style.backgroundColor = ''
    sapContent.classList.remove('pdf-export-mode')

    const imgData = canvas.toDataURL('image/png')
    const imgWidth = canvas.width
    const imgHeight = canvas.height

    const ratio = imgWidth / imgHeight
    const orientation = ratio >= 1 ? 'landscape' : 'portrait'
    const pageW = orientation === 'landscape' ? 297 : 210
    const pageH = orientation === 'landscape' ? 210 : 297

    const pdf = new jsPDF(orientation, 'mm', 'a4')
    const margin = 10
    const usableW = pageW - margin * 2
    const scaledH = (imgHeight * usableW) / imgWidth
    const usableH = pageH - margin * 2

    let yOffset = 0
    while (yOffset < scaledH) {
      if (yOffset > 0) pdf.addPage()
      pdf.addImage(imgData, 'PNG', margin, margin - yOffset, usableW, scaledH)
      yOffset += usableH
    }

    const fileDate = todayStr()
    pdf.save(`${props.title.replace(/\s+/g, '_')}_${fileDate}.pdf`)
  } catch (err) {
    console.error('[ReportLayout] PDF export error:', err)
    emit('export-pdf')
  }
}

// ── Excel Export ────────────────────────────────────────────────────
async function handleExportExcel() {
  // If exportColumns & exportRows are provided, use ExcelJS (styled Excel)
  if (props.exportColumns && props.exportRows) {
    const cols = props.exportColumns
    const rows = props.exportRows
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Seven Waves Restaurant ERP'
    const ws = wb.addWorksheet(props.title)

    const navyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } }
    const lightFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FC' } }
    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    }

    // Auto-size columns
    ws.columns = cols.map(() => ({ width: 20 }))

    // Row 1: Company Name
    const r1 = ws.addRow(['SEVEN WAVES RESTAURANT (PVT) LTD'])
    ws.mergeCells(`A1:${String.fromCharCode(64 + cols.length)}1`)
    r1.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1A1A2E' } }
    r1.height = 24

    // Row 2: Report Title
    const r2 = ws.addRow([props.title])
    ws.mergeCells(`A2:${String.fromCharCode(64 + cols.length)}2`)
    r2.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF333333' } }

    // Row 3: Subtitle / Date
    const r3 = ws.addRow([getExportSubtitle()])
    ws.mergeCells(`A3:${String.fromCharCode(64 + cols.length)}3`)
    r3.getCell(1).font = { size: 10, color: { argb: 'FF666666' } }

    // Row 4: Spacer
    ws.addRow([])

    // Row 5: Column Headers
    const headerRow = ws.addRow(cols.map((c) => c.label))
    headerRow.height = 22
    headerRow.eachCell((cell) => {
      cell.fill = navyFill
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = thinBorder
    })

    // Data Rows
    rows.forEach((r, idx) => {
      const rowData = cols.map((c) => (typeof c.field === 'function' ? c.field(r) : r[c.field]))
      const row = ws.addRow(rowData)
      row.eachCell((cell, colNumber) => {
        cell.border = thinBorder
        cell.font = { size: 10, color: { argb: 'FF1A1A1A' } }
        const colDef = cols[colNumber - 1]
        cell.alignment = {
          horizontal:
            colDef?.align === 'right' ? 'right' : colDef?.align === 'center' ? 'center' : 'left',
          vertical: 'middle',
        }
        if (idx % 2 === 1) cell.fill = lightFill
      })
    })

    // Footer
    ws.addRow([])
    const lastCol = String.fromCharCode(64 + cols.length)
    const footerRow = ws.addRow([
      `Generated: ${new Date().toLocaleString()} • Seven Waves Restaurant ERP • Confidential`,
    ])
    ws.mergeCells(`A${footerRow.number}:${lastCol}${footerRow.number}`)
    footerRow.getCell(1).font = { italic: true, size: 8, color: { argb: 'FF999999' } }
    footerRow.getCell(1).alignment = { horizontal: 'center' }

    // Write & Download
    const buffer = await wb.xlsx.writeBuffer()
    const dateStr = todayStr()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.title.replace(/\s+/g, '_')}_${dateStr}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return
  }
  // Fallback: emit for individual report handling
  emit('export-excel')
}

// ── SAP Toolbar actions ─────────────────────────────────────────────
function currentFilters() {
  return { ...(appliedFilters.value || filters.value) }
}

function handleRefresh() {
  // Single reload with the CURRENT filters. Pages bind @refresh="loadData", so the
  // filters must be passed — a bare emit('refresh') called loadData(undefined) and
  // silently reloaded the report UNFILTERED (all branches, all dates).
  emit('refresh', currentFilters())
}

const isFullscreen = ref(false)

function toggleFullscreen() {
  const el = document.querySelector('.report-page')
  if (!el) return

  if (!document.fullscreenElement) {
    el.requestFullscreen()
      .then(() => {
        isFullscreen.value = true
      })
      .catch(() => {})
  } else {
    document
      .exitFullscreen()
      .then(() => {
        isFullscreen.value = false
      })
      .catch(() => {})
  }
}

// Listen for fullscreen exit via Escape key
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

// ── Auto-refresh ────────────────────────────────────────────────────
let autoRefreshTimer = null

onMounted(() => {
  appliedFilters.value = { ...filters.value }
  emit('filter-change', appliedFilters.value)

  // Load all branches for the filter dropdown
  loadBranches()

  document.addEventListener('fullscreenchange', onFullscreenChange)

  // Silently auto-refresh report data in background
  if (props.autoRefreshInterval > 0) {
    autoRefreshTimer = setInterval(() => {
      emit('refresh', currentFilters())
    }, props.autoRefreshInterval)
  }
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
})
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

/* ── Page ─────────────────────────────────────────────────────────────── */
.report-page {
  padding: 16px;
  background: var(--erp-bg-main, #0f172a);
  min-height: 100vh;
}

/* ── Toolbar ─────────────────────────────────────────────────────────── */
.report-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;

  &__left {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
  }

  &__breadcrumb {
    display: flex !important;
    align-items: center !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
    margin-bottom: 6px;
  }

  &__breadcrumb-item,
  &__breadcrumb-sep {
    font-size: 11px;
    font-weight: 700;
    color: var(--erp-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 1px;
    line-height: 1;
    white-space: nowrap;
  }

  &__breadcrumb-item--active {
    color: var(--erp-text-secondary, #94a3b8);
    font-weight: 800;
  }

  &__title {
    font-size: 22px;
    font-weight: 800;
    color: var(--erp-text-primary, #f8fafc);
    margin: 0;
    line-height: 1.1;
    letter-spacing: -0.5px;
  }

  &__subtitle {
    font-size: 13px;
    color: var(--erp-text-muted, #64748b);
    margin: 6px 0 0;
    line-height: 1.4;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    align-self: flex-start;
  }
}

/* ── SAP B1-style Icon Toolbar Strip ──────────────────────────────── */
.sap-icon-strip {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--erp-bg-card, #1e293b);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  padding: 3px 4px;

  &__btn {
    width: 30px !important;
    height: 30px !important;
    min-width: 30px !important;
    min-height: 30px !important;
    font-size: 16px;
    color: var(--erp-text-muted, #64748b);
    border-radius: 6px;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--erp-text-primary, #f8fafc);
    }

    &--active {
      background: rgba(37, 99, 235, 0.15) !important;
      color: var(--erp-primary, #2563eb) !important;
    }
  }

  &__sep {
    width: 1px;
    height: 20px;
    background: var(--erp-border, rgba(255, 255, 255, 0.08));
    margin: 0 3px;
    flex-shrink: 0;
  }

  &__badge {
    font-size: 9px;
    min-height: 14px;
    padding: 0 4px;
  }
}

/* ── Buttons ─────────────────────────────────────────────────────────── */
.report-btn {
  height: 32px;
  min-height: 32px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;

  &--primary {
    background: var(--erp-primary, #2563eb);
    color: #fff;
    padding: 0 14px;
  }

  &--ghost {
    background: transparent;
    border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
    color: var(--erp-text-secondary, #94a3b8);
    padding: 0 12px;

    &:hover {
      background: rgba(255, 255, 255, 0.04);
      color: var(--erp-text-primary, #f8fafc);
    }
  }

  &--icon {
    width: 32px;
    padding: 0;
    border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
    color: var(--erp-text-secondary, #94a3b8);

    &:hover {
      background: rgba(255, 255, 255, 0.04);
      color: var(--erp-text-primary, #f8fafc);
    }
  }
}

/* ── Filter Panel ──────────────────────────────────────────────────── */
.report-filter-panel {
  background: var(--erp-bg-card, #1e293b);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;

  &__grid {
    display: grid;
    grid-template-columns: 320px 200px repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
    align-items: start;
  }
}

.report-filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.report-filter-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--erp-text-muted, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.report-filter-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-filter-date-sep {
  font-size: 11px;
  color: var(--erp-text-muted, #64748b);
  white-space: nowrap;
}

.report-filter-input {
  font-size: 13px;
}

.report-date-presets {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.report-date-preset {
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  background: transparent;
  color: var(--erp-text-secondary, #94a3b8);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover,
  &.active {
    background: var(--erp-primary, #2563eb);
    color: #fff;
    border-color: var(--erp-primary, #2563eb);
  }
}

.report-filter-advanced-toggle {
  margin-top: 12px;
}

.report-filter-advanced-btn {
  background: transparent;
  border: none;
  color: var(--erp-text-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;

  &:hover {
    color: var(--erp-text-primary, #f8fafc);
  }
}

.report-filter-advanced {
  padding-top: 12px;
  border-top: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  margin-top: 12px;
}

.report-filter-actions {
  display: flex;
  align-items: center;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
}

/* ── Filter Summary Bar ─────────────────────────────────────────────── */
.report-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.2);
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--erp-text-secondary, #94a3b8);
  flex-wrap: wrap;

  &__label {
    font-weight: 600;
  }

  &__clear {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--erp-danger, #dc2626);
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    &:hover {
      text-decoration: underline;
    }
  }
}

.report-filter-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(37, 99, 235, 0.15);
  color: var(--erp-primary, #2563eb);
  border: 1px solid rgba(37, 99, 235, 0.25);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

/* ── KPI Row ─────────────────────────────────────────────────────────── */
.report-kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(185px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.report-kpi-card {
  border-radius: 14px;
  padding: 16px 18px 14px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  min-height: 88px;
  cursor: default;

  // Shimmer overlay
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%);
    pointer-events: none;
    z-index: 0;
  }

  // Top accent line
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: rgba(255, 255, 255, 0.35);
    border-radius: 14px 14px 0 0;
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45) !important;
  }

  // ── Gradient Variants (always colorful, overrides light mode) ──────
  &--blue {
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%) !important;
    box-shadow: 0 4px 20px rgba(37, 99, 235, 0.4) !important;
  }
  &--green {
    background: linear-gradient(135deg, #065f46 0%, #059669 100%) !important;
    box-shadow: 0 4px 20px rgba(5, 150, 105, 0.4) !important;
  }
  &--amber, &--orange {
    background: linear-gradient(135deg, #92400e 0%, #d97706 100%) !important;
    box-shadow: 0 4px 20px rgba(217, 119, 6, 0.4) !important;
  }
  &--red {
    background: linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%) !important;
    box-shadow: 0 4px 20px rgba(220, 38, 38, 0.4) !important;
  }
  &--purple {
    background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%) !important;
    box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4) !important;
  }
  &--teal {
    background: linear-gradient(135deg, #134e4a 0%, #0d9488 100%) !important;
    box-shadow: 0 4px 20px rgba(13, 148, 136, 0.4) !important;
  }
  &--indigo {
    background: linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%) !important;
    box-shadow: 0 4px 20px rgba(67, 56, 202, 0.4) !important;
  }
  &--pink {
    background: linear-gradient(135deg, #831843 0%, #db2777 100%) !important;
    box-shadow: 0 4px 20px rgba(219, 39, 119, 0.4) !important;
  }
  &--cyan {
    background: linear-gradient(135deg, #164e63 0%, #0891b2 100%) !important;
    box-shadow: 0 4px 20px rgba(8, 145, 178, 0.4) !important;
  }
  &--rose {
    background: linear-gradient(135deg, #881337 0%, #e11d48 100%) !important;
    box-shadow: 0 4px 20px rgba(225, 29, 72, 0.4) !important;
  }
  &--default {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35) !important;
  }

  // ── Frosted icon wrap ─────────────────────────────────────
  &__icon-wrap {
    width: 42px;
    height: 42px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.22) !important;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    backdrop-filter: blur(6px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    position: relative;
    z-index: 1;
  }

  // ── Body ──────────────────────────────────────────────────
  &__body {
    flex: 1;
    min-width: 0;
    position: relative;
    z-index: 1;
  }

  // ── Label ─────────────────────────────────────────────────
  &__label {
    font-size: 10px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.8) !important;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  // ── Value ─────────────────────────────────────────────────
  &__value {
    font-size: 20px;
    font-weight: 900;
    color: #ffffff !important;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: visible;
    text-shadow: 0 1px 4px rgba(0,0,0,0.25);
    display: block;
    width: 100%;
  }

  // ── Sub ───────────────────────────────────────────────────
  &__sub {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 4px;
  }

  // ── Watermark ─────────────────────────────────────────────
  &__watermark {
    position: absolute;
    right: -12px;
    bottom: -12px;
    opacity: 0.08;
    pointer-events: none;
    color: white !important;
  }
}

/* ── Content ─────────────────────────────────────────────────────────── */
.report-content {
  background: var(--erp-bg-card, #1e293b);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  overflow: hidden;
}

/* ── Export Menu ─────────────────────────────────────────────────────── */
.report-export-menu {
  background: var(--erp-bg-card, #1e293b) !important;
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08));
  min-width: 160px;

  .q-item {
    font-size: 13px;
    color: var(--erp-text-primary, #f8fafc);
    min-height: 36px;
    &:hover {
      background: rgba(255, 255, 255, 0.04);
    }
  }
}

/* ── Print Styles ─────────────────────────────────────────────────────── */
/* NOTE: All print styles are in src/css/report-print.css (global) */

/* ── PDF Export Mode (applied temporarily during html2canvas capture) ── */
:deep(.pdf-export-mode) {
  background: #ffffff !important;
  color: #1a1a1a !important;
  border-color: #dee2e6 !important;
  border-radius: 0 !important;

  .sap-header {
    background: #ffffff !important;
    color: #1a1a1a !important;
    border-bottom: 2px solid #1a1a2e !important;

    &__company {
      color: #1a1a2e !important;
      font-weight: 800 !important;
    }
    &__title {
      color: #333 !important;
    }
    &__meta {
      color: #555 !important;
    }
    &__logo {
      opacity: 1 !important;
      height: 44px !important;
    }
  }

  .report-table,
  .q-table {
    background: #ffffff !important;
    color: #1a1a1a !important;
  }

  /* Keep dark navy table headers — matches print CSS */
  .report-table__header-row,
  .q-table thead tr {
    background: #1a1a2e !important;
  }

  .report-table__th,
  .q-table th {
    color: #fff !important;
    background: #1a1a2e !important;
    border: none !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
    font-weight: 700 !important;
    font-size: 11px !important;
  }

  .report-table__row,
  .report-table__td,
  .q-table td {
    color: #1a1a1a !important;
    border-bottom: 1px solid #e0e0e0 !important;
    background: #ffffff !important;
  }

  .report-table__row:nth-child(even),
  .q-table tbody tr:nth-child(even) {
    background: #f8f9fc !important;
  }

  .report-table__total-row,
  .report-table__total-row td {
    background: #e8edf3 !important;
    color: #1a1a2e !important;
    border-top: 2px solid #1a1a2e !important;
    font-weight: 700 !important;
  }

  .report-empty {
    color: #666 !important;
  }

  .q-badge {
    color: #333 !important;
    background: #e8edf3 !important;
    border: 1px solid #ccc !important;
  }

  .text-red {
    color: #c62828 !important;
  }
  .text-weight-bold,
  .text-weight-bolder {
    color: #1a1a1a !important;
  }

  /* Hide pagination and controls in PDF */
  .q-table__bottom,
  .q-table__control {
    display: none !important;
  }
}
</style>
