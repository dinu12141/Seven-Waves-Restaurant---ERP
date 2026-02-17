<template>
  <q-page class="q-pa-md">
    <PageHeader title="System Settings" subtitle="Configure application preferences" />

    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12 col-md-8">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-h6">General Settings</div>
          </q-card-section>

          <q-separator />

          <q-card-section class="q-gutter-md">
            <q-input v-model="settings.appName" label="Application Name" outlined dense />
            <q-select
              v-model="settings.timezone"
              label="Timezone"
              :options="['UTC', 'EST', 'PST', 'IST']"
              outlined
              dense
            />
            <q-select
              v-model="settings.currency"
              label="Currency"
              :options="['USD', 'EUR', 'INR', 'GBP']"
              outlined
              dense
            />

            <q-toggle v-model="settings.maintenanceMode" label="Maintenance Mode" color="red" />
          </q-card-section>
        </q-card>

        <q-card flat bordered class="q-mt-md">
          <q-card-section>
            <div class="text-h6">Branding</div>
          </q-card-section>
          <q-separator />
          <q-card-section class="q-gutter-md">
            <q-input v-model="settings.logoUrl" label="Logo URL" outlined dense />
            <q-color
              v-model="settings.primaryColor"
              label="Primary Color"
              outlined
              dense
              class="my-input"
            />
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-md-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-h6">Actions</div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <q-btn color="primary" label="Save Changes" class="full-width" @click="saveSettings" />
            <q-btn flat color="grey" label="Reset Defaults" class="full-width q-mt-sm" />
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { reactive } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()

const settings = reactive({
  appName: 'Restaurant ERP',
  timezone: 'UTC',
  currency: 'USD',
  maintenanceMode: false,
  logoUrl: '',
  primaryColor: '#1976D2',
})

const saveSettings = () => {
  $q.loading.show()
  setTimeout(() => {
    $q.loading.hide()
    $q.notify({ type: 'positive', message: 'Settings saved successfully' })
  }, 1000)
}
</script>
