<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="inventory"
      title="Inventory Management"
      breadcrumbs="Supply Chain / Inventory"
      showSearch
      showBranchSelector
      showExport
      showRefresh
      primaryAction
      primaryActionLabel="New Document"
      @primary-action="openCreateDocument"
      @export="() => {}"
    />

    <!-- Main tabs card -->
    <q-card class="bg-dark text-white q-mt-md">
      <q-tabs
        v-model="tab"
        dense
        class="text-grey"
        active-color="primary"
        indicator-color="primary"
        align="left"
        narrow-indicator
      >
        <q-tab v-for="t in tabs" :key="t.name" :name="t.name" :label="t.label" :icon="t.icon" />
      </q-tabs>

      <q-separator dark />

      <q-tab-panels v-model="tab" animated class="bg-dark text-white">
        <!-- Dashboard -->
        <q-tab-panel name="dashboard" class="q-pa-none">
          <DashboardTab />
        </q-tab-panel>

        <!-- Items Master -->
        <q-tab-panel name="items" class="q-pa-none">
          <ItemsTab />
        </q-tab-panel>

        <!-- Menu Master -->
        <q-tab-panel name="menu_items" class="q-pa-none">
          <MenuItemsTab />
        </q-tab-panel>

        <!-- Recipes / BOM -->
        <q-tab-panel name="recipes" class="q-pa-none">
          <RecipesTab />
        </q-tab-panel>

        <!-- Stock Levels -->
        <q-tab-panel name="stock" class="q-pa-none">
          <StockLevelsTab />
        </q-tab-panel>

        <!-- Warehouses -->
        <q-tab-panel name="warehouses" class="q-pa-none">
          <WarehousesTab />
        </q-tab-panel>

        <!-- Suppliers -->
        <q-tab-panel name="suppliers" class="q-pa-none">
          <SuppliersTab />
        </q-tab-panel>

        <!-- Documents List -->
        <q-tab-panel name="documents" class="q-pa-none">
          <DocumentsTab
            @create-document="openCreateDocument"
            @view-document="viewDocument"
            @edit-document="editDocument"
          />
        </q-tab-panel>

        <!-- Create / Edit Document -->
        <q-tab-panel name="doc-create" class="q-pa-none">
          <DocumentCreateTab
            :document="editingDocument"
            @back="tab = 'documents'"
            @saved="onDocumentSaved"
          />
        </q-tab-panel>

        <!-- Stock Ledger -->
        <q-tab-panel name="ledger" class="q-pa-none">
          <StockLedgerTab />
        </q-tab-panel>
      </q-tab-panels>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
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

const tab = ref('dashboard')
const editingDocument = ref(null)

const tabs = [
  { name: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { name: 'items', label: 'Inventory Items', icon: 'category' },
  { name: 'menu_items', label: 'Menu Items', icon: 'restaurant' },
  { name: 'recipes', label: 'Recipes / BOM', icon: 'restaurant_menu' },
  { name: 'stock', label: 'Stock Levels', icon: 'inventory_2' },
  { name: 'warehouses', label: 'Warehouses', icon: 'warehouse' },
  { name: 'suppliers', label: 'Suppliers', icon: 'local_shipping' },
  { name: 'documents', label: 'Documents', icon: 'description' },
  { name: 'ledger', label: 'Stock Ledger', icon: 'menu_book' },
]

function openCreateDocument() {
  editingDocument.value = null
  tab.value = 'doc-create'
}

function viewDocument(doc) {
  editingDocument.value = { ...doc, lines: [] }
  tab.value = 'doc-create'
}

function editDocument(doc) {
  editingDocument.value = { ...doc, lines: [] }
  tab.value = 'doc-create'
}

function onDocumentSaved() {
  tab.value = 'documents'
}
</script>
