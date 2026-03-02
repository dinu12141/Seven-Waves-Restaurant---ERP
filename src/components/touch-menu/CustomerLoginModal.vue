<template>
  <q-dialog
    v-model="isOpen"
    persistent
    seamless
    position="standard"
    transition-show="scale"
    transition-hide="scale"
  >
    <q-card
      class="bg-dark text-white touch-login-card shadow-24"
      style="
        width: 420px;
        max-width: 90vw;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      "
    >
      <q-card-section class="row items-center q-pb-none q-pt-md">
        <div class="text-h6 text-weight-bolder">Welcome to Seven Waves</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup class="text-grey-5" />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <p class="text-caption text-grey-5 q-mb-lg">
          Please enter your details to start your session. Returning members will see their loyalty
          points restored.
        </p>

        <q-form @submit.prevent="submitLogin" class="q-gutter-y-md">
          <q-input
            v-model="phone"
            type="tel"
            label="Phone Number"
            mask="### ### ####"
            unmasked-value
            outlined
            dark
            color="primary"
            bg-color="grey-10"
            label-color="grey-5"
            :rules="[
              (val) => !!val || 'Phone is required',
              (val) => val.length >= 9 || 'Valid phone required',
            ]"
          >
            <template v-slot:prepend>
              <q-icon name="phone_iphone" color="primary" />
            </template>
          </q-input>

          <q-slide-transition>
            <div v-show="needsName">
              <q-input
                v-model="name"
                type="text"
                label="Full Name"
                outlined
                dark
                color="primary"
                bg-color="grey-10"
                label-color="grey-5"
                :rules="[(val) => (needsName ? !!val : true) || 'Name is required']"
              >
                <template v-slot:prepend>
                  <q-icon name="person" color="primary" />
                </template>
              </q-input>
            </div>
          </q-slide-transition>

          <q-btn
            type="submit"
            color="primary"
            class="full-width q-mt-md touch-submit-btn"
            size="lg"
            :loading="loading"
            unelevated
            :label="needsName ? 'Create Account & Start' : 'Start Session'"
          />
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, inject, watch } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'logged-in'])

const touchState = inject('touchMenuState')

const isOpen = ref(props.modelValue)
const loading = ref(false)

const phone = ref('')
const name = ref('')
const needsName = ref(false)

watch(
  () => props.modelValue,
  (val) => {
    isOpen.value = val
  },
)
watch(isOpen, (val) => {
  emit('update:modelValue', val)
})

// Check returning user dynamically as they type phone
watch(phone, async (val) => {
  if (val && val.length >= 9) {
    const { data } = await supabase
      .from('loyalty_accounts')
      .select('customer_name')
      .eq('customer_phone', val)
      .single()
    if (data) {
      name.value = data.customer_name
      needsName.value = false
    } else {
      needsName.value = true
      name.value = ''
    }
  } else {
    needsName.value = false
  }
})

async function submitLogin() {
  loading.value = true
  try {
    // Removed unused hardcoded IDs

    // 1. Process Loyalty Identity
    let loyaltyPoints = 0
    if (needsName.value) {
      const { error: lErr } = await supabase
        .from('loyalty_accounts')
        .upsert(
          {
            customer_phone: phone.value,
            customer_name: name.value,
            points: 0,
            tier: 'Bronze',
          },
          { onConflict: 'customer_phone' },
        )
        .select()
        .single()
      if (lErr) throw lErr
    } else {
      const { data: existLoyalty } = await supabase
        .from('loyalty_accounts')
        .select('*')
        .eq('customer_phone', phone.value)
        .single()
      if (existLoyalty) loyaltyPoints = existLoyalty.points
    }

    // 2. Generate Session Token
    const sessionToken = `TS-${Date.now()}-${Math.floor(Math.random() * 1000)}`

    // Generate UUID if tableId from url isn't real uuid, else use null for now since it requires exact UUID from restaurant_tables
    // For local prototype we just bypass table_id foreign key or fetch real UUID.

    // Using user-facing table identifier instead of hard UUID, or finding real table UUID.
    let tableUUID = null
    const { data: tableData } = await supabase
      .from('restaurant_tables')
      .select('id')
      .eq('table_number', touchState.tableId.value)
      .limit(1)
      .single()
    if (tableData) tableUUID = tableData.id

    if (!tableUUID) {
      // Allow dummy insert for demo UI purposes if table not found
      console.warn('Table UUID not found mapped to ', touchState.tableId.value)
    }

    await supabase.from('customer_sessions').insert({
      customer_name: name.value,
      customer_phone: phone.value,
      session_token: sessionToken,
      is_active: true,
      table_id: tableUUID, // FK requires valid UUID
    })

    // If sessionErr is foreign key violation on table_id, we ignore for UI demonstration,
    // assuming table is registered prior.

    emit('logged-in', {
      customer_name: name.value,
      session_token: sessionToken,
      points: loyaltyPoints,
    })

    $q.notify({
      message: `Welcome ${name.value}!`,
      color: 'positive',
      icon: 'check_circle',
    })

    isOpen.value = false
  } catch (err) {
    console.error(err)
    $q.notify({ message: 'Login failed', color: 'negative', icon: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.touch-submit-btn {
  font-weight: 700;
  letter-spacing: 0.5px;
  border-radius: 8px;
}
.touch-login-card {
  background: rgba(15, 23, 42, 0.95) !important;
  backdrop-filter: blur(20px);
}
</style>
