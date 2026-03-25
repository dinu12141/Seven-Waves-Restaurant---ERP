<template>
  <q-page class="mgr-waiter-detail" padding>
    <!-- Back -->
    <q-btn
      flat
      dense
      no-caps
      icon="arrow_back"
      label="Back"
      color="grey-5"
      class="q-mb-md"
      @click="$router.back()"
    />

    <div v-if="!waiter" class="text-grey-6 text-center q-pa-xl text-caption">Waiter not found.</div>

    <template v-else>
      <!-- Profile Header -->
      <div class="profile-header q-mb-lg">
        <q-avatar size="56px" class="profile-avatar text-weight-bold text-white">
          {{ initials(waiter.display_name || waiter.employee_name) }}
        </q-avatar>
        <div class="q-ml-md col">
          <div class="text-h6 text-white text-weight-bold">
            {{ waiter.display_name || waiter.employee_name }}
          </div>
          <div class="text-caption text-grey-5">
            {{ waiter.waiter_code }} · {{ waiter.employee_code }}
          </div>
        </div>
        <q-btn round flat icon="mail" color="cyan-4" @click="msgOpen = true">
          <q-tooltip>Send Message</q-tooltip>
        </q-btn>
      </div>

      <!-- Stats -->
      <div class="row q-col-gutter-sm q-mb-lg">
        <div class="col-4">
          <div class="mini-kpi">
            <span class="mini-val text-cyan">{{ waiter.active_orders }}</span
            ><span class="mini-lbl">Active</span>
          </div>
        </div>
        <div class="col-4">
          <div class="mini-kpi">
            <span class="mini-val text-green">{{ waiter.served_count }}</span
            ><span class="mini-lbl">Served</span>
          </div>
        </div>
        <div class="col-4">
          <div class="mini-kpi">
            <span class="mini-val text-amber">{{ waiter.current_points }}</span
            ><span class="mini-lbl">Points</span>
          </div>
        </div>
      </div>

      <!-- Points Ledger -->
      <div class="section-title q-mb-sm">RECENT POINTS</div>
      <div v-if="ledger.length === 0" class="text-grey-6 text-caption text-center q-pa-md">
        No points history.
      </div>
      <div v-else>
        <div v-for="entry in ledger" :key="entry.id" class="ledger-row row items-center q-mb-xs">
          <q-icon
            :name="ptIcon(entry.point_type)"
            :color="entry.points >= 0 ? 'green-5' : 'red-5'"
            size="14px"
            class="q-mr-sm"
          />
          <div class="col">
            <span class="text-white text-caption">{{ ptLabel(entry.point_type) }}</span>
            <span v-if="entry.note" class="text-grey-6 text-caption q-ml-sm"
              >— {{ entry.note }}</span
            >
          </div>
          <span
            :class="entry.points >= 0 ? 'text-green-5' : 'text-red-5'"
            class="text-caption text-weight-bold"
          >
            {{ entry.points >= 0 ? '+' : '' }}{{ entry.points }}
          </span>
        </div>
      </div>
    </template>

    <!-- Message Dialog -->
    <q-dialog v-model="msgOpen" position="bottom">
      <q-card class="msg-card">
        <q-bar class="msg-bar">
          <q-icon name="mail" />
          <span class="q-ml-sm text-weight-bold">Message {{ waiter?.display_name }}</span>
          <q-space /> <q-btn flat dense icon="close" v-close-popup />
        </q-bar>
        <q-card-section>
          <q-input v-model="msgSubject" dark filled dense label="Subject" class="q-mb-md" />
          <q-input
            v-model="msgBody"
            dark
            filled
            label="Message"
            type="textarea"
            rows="3"
            class="q-mb-md"
          />
          <q-btn-toggle
            v-model="msgPriority"
            toggle-color="cyan"
            :options="[
              { label: 'Normal', value: 'normal' },
              { label: '🚨 Urgent', value: 'urgent' },
            ]"
            no-caps
            dense
            spread
            flat
            text-color="grey-5"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Send"
            color="cyan-8"
            icon="send"
            :loading="sending"
            :disable="!msgBody.trim()"
            @click="send"
            no-caps
            style="border-radius: 8px; font-weight: 700"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { supabase } from 'src/boot/supabase'
import { useQuasar } from 'quasar'

const route = useRoute()
const store = useManagerAppStore()
const $q = useQuasar()

const waiter = computed(() => store.onShiftWaiters.find((w) => w.id === route.params.id))
const ledger = ref([])

const msgOpen = ref(false)
const msgSubject = ref('')
const msgBody = ref('')
const msgPriority = ref('normal')
const sending = ref(false)

onMounted(async () => {
  if (!route.params.id) return
  const { data } = await supabase
    .from('waiter_points_ledger')
    .select('id, point_type, points, note, created_at')
    .eq('waiter_profile_id', route.params.id)
    .order('created_at', { ascending: false })
    .limit(20)
  ledger.value = data || []
})

async function send() {
  if (!waiter.value?.employee_id || !msgBody.value.trim()) return
  sending.value = true
  try {
    await store.sendMessage(
      waiter.value.employee_id,
      msgSubject.value,
      msgBody.value,
      msgPriority.value,
    )
    $q.notify({
      type: 'positive',
      message: `✅ Message sent to ${waiter.value.display_name}`,
      position: 'top',
    })
    msgOpen.value = false
    msgSubject.value = ''
    msgBody.value = ''
    msgPriority.value = 'normal'
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message, position: 'top' })
  } finally {
    sending.value = false
  }
}

function initials(name) {
  return name
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')
    : '?'
}
function ptIcon(type) {
  return (
    {
      served_order: 'restaurant',
      bonus: 'card_giftcard',
      adjustment: 'tune',
      penalty: 'warning',
      tip_received: 'payments',
      customer_rating: 'star',
    }[type] || 'stars'
  )
}
function ptLabel(type) {
  return (
    {
      served_order: 'Served',
      bonus: 'Bonus',
      adjustment: 'Adjust',
      penalty: 'Penalty',
      tip_received: 'Tip',
      customer_rating: 'Rating',
    }[type] || type
  )
}
</script>

<style lang="scss" scoped>
.mgr-waiter-detail {
  background: #090c14;
  min-height: 100vh;
}
.section-title {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #4b5563;
}
.profile-header {
  display: flex;
  align-items: center;
}
.profile-avatar {
  background: linear-gradient(135deg, #06b6d4, #8b5cf6) !important;
  font-size: 18px !important;
}
.mini-kpi {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 10px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mini-val {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1;
}
.mini-lbl {
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
}
.ledger-row {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  &:last-child {
    border-bottom: none;
  }
}
.msg-card {
  width: 100%;
  max-width: 480px;
  background: #111827 !important;
  color: #fff !important;
  border-radius: 16px 16px 0 0 !important;
}
.msg-bar {
  background: #1f2937;
}
</style>
