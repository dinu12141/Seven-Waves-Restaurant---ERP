<template>
  <div class="device-nav-header q-mb-md">
    <div class="row items-center justify-between q-mb-sm">
      <div class="row items-center">
        <q-icon name="memory" color="primary" size="32px" class="q-mr-sm" />
        <div>
          <div class="text-h5 text-weight-bolder text-primary">Device & Hardware Management</div>
          <div class="text-caption text-grey-7">Unified controller for thermal printers, cash drawers, KDS, barcode scanners, and biometrics</div>
        </div>
      </div>

      <div class="row items-center q-gutter-sm">
        <q-btn
          outline
          color="purple"
          icon="inbox"
          label="Open Drawer"
          no-caps
          dense
          class="q-px-sm"
          @click="openDrawer"
        />
        <q-btn
          outline
          color="teal"
          icon="print"
          label="Test Print & Cut"
          no-caps
          dense
          class="q-px-sm"
          @click="testPrint"
        />
      </div>
    </div>

    <!-- Tab Bar -->
    <div class="device-tabs-bar">
      <q-tabs
        :model-value="currentRoute"
        dense
        no-caps
        align="left"
        class="text-grey-8"
        active-color="primary"
        indicator-color="primary"
      >
        <q-route-tab
          to="/devices"
          exact
          name="/devices"
          icon="devices"
          label="Device Hub & Overview"
        />
        <q-route-tab
          to="/devices/printers"
          name="/devices/printers"
          icon="print"
          label="Printers & Cash Drawers"
        />
        <q-route-tab
          to="/devices/scanners"
          name="/devices/scanners"
          icon="qr_code_scanner"
          label="Barcode & QR Scanners"
        />
        <q-route-tab
          to="/devices/biometrics"
          name="/devices/biometrics"
          icon="fingerprint"
          label="Biometric Devices"
        />
        <q-route-tab
          to="/devices/health"
          name="/devices/health"
          icon="monitor_heart"
          label="Device Health & Diagnostics"
        />
      </q-tabs>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { escposPrintService } from 'src/services/escposPrintService'
import { useQuasar } from 'quasar'

const route = useRoute()
const $q = useQuasar()

const currentRoute = computed(() => route.path)

function openDrawer() {
  escposPrintService.openCashDrawer()
  $q.notify({
    message: 'Cash Drawer Pulse Sent',
    color: 'positive',
    icon: 'inbox',
    position: 'top',
    timeout: 1500,
  })
}

function testPrint() {
  escposPrintService.printTestReceipt()
  $q.notify({
    message: 'Test Receipt Sent to Thermal Printer',
    caption: 'Triggered auto cash drawer kick and paper cut',
    color: 'info',
    icon: 'print',
    position: 'top',
    timeout: 2000,
  })
}
</script>

<style scoped>
.device-nav-header {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px 20px 0 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.device-tabs-bar {
  border-top: 1px solid #f0f0f0;
  margin-top: 8px;
}
</style>
