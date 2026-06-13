<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="inventory"
      title="Inventory Management"
      breadcrumbs="Supply Chain / Inventory"
      showSearch
      showBranchSelector
      showExport
      primaryAction
      primaryActionLabel="New Document"
      @primary-action="openCreateDocument"
      @export-csv="handleExport('csv')"
      @export-excel="handleExport('excel')"
      @export-pdf="handleExport('pdf')"
    />

    <!-- Main content card -->
    <q-card class="bg-dark text-white q-mt-md">
      <q-tab-panels v-model="tab" animated class="bg-dark text-white">
        <!-- Dashboard -->
        <q-tab-panel name="dashboard" class="q-pa-none">
          <DashboardTab ref="tabRef" />
        </q-tab-panel>

        <!-- Items Master -->
        <q-tab-panel name="items" class="q-pa-none">
          <ItemsTab ref="tabRef" />
        </q-tab-panel>

        <!-- Menu Master -->
        <q-tab-panel name="menu_items" class="q-pa-none">
          <MenuItemsTab ref="tabRef" />
        </q-tab-panel>

        <!-- Category Management -->
        <q-tab-panel name="menu_categories" class="q-pa-none">
          <CategoryManagementTab ref="tabRef" />
        </q-tab-panel>

        <!-- Menu Book -->
        <q-tab-panel name="menu_book" class="q-pa-none">
          <MenuBookTab ref="tabRef" />
        </q-tab-panel>

        <!-- Kitchen Mapping -->
        <q-tab-panel name="kitchen_mapping" class="q-pa-none">
          <KitchenMappingTab ref="tabRef" />
        </q-tab-panel>

        <!-- Recipes / BOM -->
        <q-tab-panel name="recipes" class="q-pa-none">
          <RecipesTab ref="tabRef" />
        </q-tab-panel>

        <!-- Stock Levels -->
        <q-tab-panel name="stock" class="q-pa-none">
          <StockLevelsTab ref="tabRef" />
        </q-tab-panel>

        <!-- Warehouses -->
        <q-tab-panel name="warehouses" class="q-pa-none">
          <WarehousesTab ref="tabRef" />
        </q-tab-panel>

        <!-- Suppliers -->
        <q-tab-panel name="suppliers" class="q-pa-none">
          <SuppliersTab ref="tabRef" />
        </q-tab-panel>

        <!-- Documents List -->
        <q-tab-panel name="documents" class="q-pa-none">
          <DocumentsTab
            ref="tabRef"
            @create-document="openCreateDocument"
            @view-document="viewDocument"
            @edit-document="editDocument"
          />
        </q-tab-panel>

        <!-- Create / Edit Document -->
        <q-tab-panel name="doc-create" class="q-pa-none">
          <DocumentCreateTab
            :document="editingDocument"
            :prefill-item-id="prefillItemId"
            @back="tab = 'documents'"
            @saved="onDocumentSaved"
          />
        </q-tab-panel>

        <!-- Stock Ledger -->
        <q-tab-panel name="ledger" class="q-pa-none">
          <StockLedgerTab ref="tabRef" />
        </q-tab-panel>

        <!-- Wastage Management -->
        <q-tab-panel name="wastage" class="q-pa-none">
          <WastageTab ref="tabRef" />
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { usePermission } from 'src/core/rbac/usePermission'
import { exportTableToCSV, exportTableToExcel, exportTableToPDF } from 'src/services/exportService'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardTab from 'components/inventory/DashboardTab.vue'
import ItemsTab from 'components/inventory/ItemsTab.vue'
import WarehousesTab from 'components/inventory/WarehousesTab.vue'
import DocumentsTab from 'components/inventory/DocumentsTab.vue'
import DocumentCreateTab from 'components/inventory/DocumentCreateTab.vue'
import StockLevelsTab from 'components/inventory/StockLevelsTab.vue'
import StockLedgerTab from 'components/inventory/StockLedgerTab.vue'
import SuppliersTab from 'components/inventory/SuppliersTab.vue'
import RecipesTab from 'components/inventory/RecipesTab.vue'
import MenuItemsTab from 'components/inventory/MenuItemsTab.vue'
import CategoryManagementTab from 'components/inventory/CategoryManagementTab.vue'
import MenuBookTab from 'components/inventory/MenuBookTab.vue'
import KitchenMappingTab from 'components/inventory/KitchenMappingTab.vue'
import WastageTab from 'components/inventory/WastageTab.vue'

const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const { can } = usePermission()

const tab = ref('dashboard')
const tabRef = ref(null)
const editingDocument = ref(null)
const prefillItemId = ref(null)

// Watch tab query param
watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab) {
      tab.value = newTab
    } else {
      tab.value = 'dashboard'
    }
  },
  { immediate: true },
)

// Watch for deep-link from ItemsTab "Add Stock (GRN)" button
// URL: /inventory?tab=documents&newDoc=GRN&item_id=UUID
watch(
  () => route.query,
  (q) => {
    if (q.newDoc && q.tab === 'documents') {
      prefillItemId.value = q.item_id || null
      editingDocument.value = {
        doc_type: q.newDoc,
        warehouse_id: '',
        status: 'draft',
      }
      tab.value = 'doc-create'
      // Clean query params without navigation
      router.replace({ path: '/inventory', query: { tab: 'doc-create' } })
    }
  },
  { immediate: true },
)

function handleExport(format) {
  if (!tabRef.value) return

  const { columns, rows } = tabRef.value
  if (!columns || !rows) {
    console.warn('Tab does not support export or has no data.')
    return
  }

  const customTitle = tabRef.value.exportTitle
  let reportTitle =
    typeof customTitle === 'string' ? customTitle : customTitle ? customTitle.value : null

  if (!reportTitle) {
    const titleMap = {
      items: 'Inventory Items',
      warehouses: 'Warehouses',
      'stock-levels': 'Stock Levels',
      suppliers: 'Suppliers',
      recipes: 'Recipes',
      'menu-items': 'Menu Items',
      'category-management': 'Categories',
      'menu-book': 'Menu Book',
      'kitchen-mapping': 'Kitchen Mapping',
      'doc-create': 'Inventory Document',
      'doc-view': 'Inventory Document',
    }
    const baseName = titleMap[tab.value] || `Inventory ${tab.value}`
    reportTitle = baseName.includes('Document') ? baseName : `${baseName} Report`
  }

  const cleanTitleForFile = reportTitle.replace(/ /g, '_').toLowerCase()
  const filename = `${cleanTitleForFile}_${new Date().toISOString().slice(0, 10)}`

  if (format === 'csv') {
    exportTableToCSV(columns, rows, filename)
  } else if (format === 'excel') {
    exportTableToExcel(columns, rows, filename)
  } else if (format === 'pdf') {
    exportTableToPDF(columns, rows, reportTitle)
  }
}

function openCreateDocument() {
  // RBAC: inventory.stock.adjust required to create GRN/adjustment docs
  if (!can('inventory.stock.adjust')) {
    $q.notify({ type: 'negative', message: 'Access Denied', caption: 'You do not have permission to create inventory documents' })
    return
  }
  editingDocument.value = null
  router.push({ path: '/inventory', query: { tab: 'doc-create' } })
}

function viewDocument(doc) {
  editingDocument.value = { ...doc, lines: [] }
  router.push({ path: '/inventory', query: { tab: 'doc-create' } })
}

function editDocument(doc) {
  editingDocument.value = { ...doc, lines: [] }
  router.push({ path: '/inventory', query: { tab: 'doc-create' } })
}

function onDocumentSaved() {
  router.push({ path: '/inventory', query: { tab: 'documents' } })
}
</script>
