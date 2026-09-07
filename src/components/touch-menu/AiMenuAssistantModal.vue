<template>
  <div>
    <!-- ── Floating AI Chef Assistant Trigger ────────────────────────── -->
    <div class="ai-chef-fab-wrapper">
      <q-btn
        round
        unelevated
        class="ai-chef-fab-btn glow-pulse"
        @click="isOpen = true"
        aria-label="Ask AI Chef"
      >
        <span class="fab-emoji">👨‍🍳</span>
        <div class="fab-badge">AI</div>
        <q-tooltip anchor="top middle" self="bottom middle" class="bg-dark text-amber text-weight-bold">
          {{ lang === 'si' ? 'සූපවේදී AI සහයකගෙන් අසන්න' : 'Ask AI Chef & Sommelier' }}
        </q-tooltip>
      </q-btn>
    </div>

    <!-- ── AI Chef Chat Dialog / Drawer ─────────────────────────────── -->
    <q-dialog
      v-model="isOpen"
      position="bottom"
      class="ai-chef-dialog"
      :maximized="$q.screen.lt.sm"
      transition-show="slide-up"
      transition-hide="slide-down"
    >
      <q-card class="ai-chef-card text-white">
        <!-- Header -->
        <q-card-section class="row items-center justify-between q-py-sm q-px-md header-glass">
          <div class="row items-center no-wrap">
            <q-avatar size="42px" class="ai-chef-avatar q-mr-sm">
              <span style="font-size: 24px">👨‍🍳</span>
            </q-avatar>
            <div>
              <div class="text-subtitle1 text-weight-bolder text-amber-4 row items-center">
                Seven Waves AI Chef
                <q-badge color="green-6" rounded class="q-ml-sm text-caption text-weight-bold">
                  LIVE
                </q-badge>
              </div>
              <div class="text-caption text-grey-4">
                {{ lang === 'si' ? 'ඔබගේ පෞද්ගලික සූපවේදී උපදේශක' : 'Your Personal Culinary Assistant' }}
              </div>
            </div>
          </div>

          <div class="row items-center no-wrap q-gutter-xs">
            <!-- Language switch -->
            <q-btn
              dense
              unelevated
              no-caps
              size="sm"
              class="lang-pill-btn"
              @click="toggleLanguage"
            >
              <span class="q-mr-xs">{{ lang === 'si' ? '🇱🇰 සිංහල' : '🇬🇧 English' }}</span>
              <q-icon name="swap_horiz" size="14px" />
            </q-btn>

            <q-btn flat round dense icon="close" color="grey-4" v-close-popup />
          </div>
        </q-card-section>

        <q-separator dark class="separator-glow" />

        <!-- Quick Prompt Chips -->
        <div class="chips-container q-py-xs q-px-sm">
          <q-scroll-area horizontal style="height: 38px" :thumb-style="{ display: 'none' }">
            <div class="row no-wrap q-gutter-xs">
              <button
                v-for="(prompt, idx) in activeQuickPrompts"
                :key="idx"
                class="ai-quick-chip"
                @click="sendQuickPrompt(prompt.query)"
                :disabled="isLoading"
              >
                <span class="chip-icon">{{ prompt.icon }}</span>
                <span>{{ prompt.label }}</span>
              </button>
            </div>
          </q-scroll-area>
        </div>

        <!-- Chat Conversation Area -->
        <q-card-section class="chat-body-area q-px-sm q-py-xs" ref="chatScrollRef">
          <div v-for="(msg, mIdx) in messages" :key="mIdx" class="q-mb-md">
            <!-- Customer Bubble -->
            <div v-if="msg.sender === 'user'" class="row justify-end q-mb-sm">
              <div class="user-bubble">
                {{ msg.text }}
              </div>
            </div>

            <!-- AI Chef Bubble -->
            <div v-else class="row justify-start items-start no-wrap q-mb-sm">
              <q-avatar size="28px" class="q-mr-xs q-mt-xs bg-amber-9 text-white">
                <span style="font-size: 16px">👨‍🍳</span>
              </q-avatar>
              <div class="ai-bubble-container">
                <div class="ai-bubble">
                  <p class="q-mb-xs">{{ msg.text }}</p>

                  <!-- Dish Recommendations Cards -->
                  <div
                    v-if="msg.items && msg.items.length > 0"
                    class="recommended-dishes-grid q-mt-sm"
                  >
                    <div
                      v-for="dish in msg.items"
                      :key="dish.id"
                      class="ai-dish-card"
                    >
                      <div class="ai-dish-thumb-wrap">
                        <img
                          :src="dish.image_url || defaultDishImg"
                          class="ai-dish-thumb"
                          loading="lazy"
                          alt="Dish"
                        />
                      </div>
                      <div class="ai-dish-details">
                        <div class="ai-dish-name text-weight-bold text-white">{{ dish.name }}</div>
                        <div class="ai-dish-reason text-grey-4 text-caption">{{ dish.reason }}</div>
                        <div class="row items-center justify-between q-mt-xs">
                          <span class="ai-dish-price text-amber-4 text-weight-bolder">
                            LKR {{ Number(dish.price).toLocaleString() }}
                          </span>
                          <q-btn
                            dense
                            unelevated
                            no-caps
                            size="sm"
                            class="add-dish-btn"
                            @click="handleAddToCart(dish)"
                          >
                            <q-icon name="add_shopping_cart" size="14px" class="q-mr-xs" />
                            + Add
                          </q-btn>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Follow-up suggestion chips -->
                  <div v-if="msg.chips && msg.chips.length > 0" class="row wrap q-gutter-xs q-mt-sm">
                    <button
                      v-for="(chip, cIdx) in msg.chips"
                      :key="cIdx"
                      class="followup-chip"
                      @click="sendQuickPrompt(chip)"
                      :disabled="isLoading"
                    >
                      💬 {{ chip }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="isLoading" class="row items-center q-my-sm text-grey-4 q-pl-md">
            <q-spinner-dots color="amber-4" size="24px" class="q-mr-sm" />
            <span class="text-caption">
              {{ lang === 'si' ? 'සූපවේදී AI කල්පනා කරමින් නිර්දේශ පිළියෙළ කරයි...' : 'Chef AI is curating recommendations...' }}
            </span>
          </div>
        </q-card-section>

        <!-- Input Bar -->
        <q-card-actions class="chat-input-bar q-pa-sm">
          <q-input
            v-model="inputQuery"
            dense
            outlined
            dark
            rounded
            class="full-width chat-input-field"
            :placeholder="lang === 'si' ? 'කෑම, රසය, සැර ප්‍රමාණය හෝ බීම ගැන අසන්න...' : 'Ask about flavors, spicy levels, or specials...'"
            @keyup.enter="handleSend"
            :disable="isLoading"
          >
            <template #prepend>
              <q-icon name="auto_awesome" color="amber-4" size="18px" />
            </template>
            <template #append>
              <q-btn
                round
                dense
                flat
                icon="send"
                color="amber-4"
                :disable="!inputQuery.trim() || isLoading"
                @click="handleSend"
              />
            </template>
          </q-input>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useQuasar } from 'quasar'
import { askCustomerMenuAssistant } from 'src/modules/ai/services/ai.service'

const props = defineProps({
  branchId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['add-to-cart'])

const $q = useQuasar()

const isOpen = ref(false)
const isLoading = ref(false)
const inputQuery = ref('')
const lang = ref('si') // default Sinhala as requested by user
const chatScrollRef = ref(null)

const defaultDishImg =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600&h=450&fit=crop'

const quickPromptsSi = [
  { icon: '🌶️', label: 'සැර නැති කෑම', query: 'සැර නැති mild කෑම මොනවද තියෙන්නේ?' },
  { icon: '⭐', label: 'Chef Specials', query: 'අද දවසේ Chef ගේ Special කෑම මොනවද?' },
  { icon: '🥤', label: 'බීම & Shake', query: 'නැවුම් Fruit Juices සහ Milkshakes මොනවද?' },
  { icon: '🍲', label: 'Soup & Starters', query: 'හොඳ Soup වර්ග සහ Starters මොනවද?' },
  { icon: '🍰', label: 'Desserts', query: 'Dessert සහ පැණිරස කෑම මොනවද?' },
]

const quickPromptsEn = [
  { icon: '🌶️', label: 'Mild & Kids', query: 'What are the mild and kids friendly dishes?' },
  { icon: '⭐', label: "Chef's Specials", query: "What are today's Chef Signature Specials?" },
  { icon: '🥤', label: 'Juices & Shakes', query: 'What fresh juices and shakes do you have?' },
  { icon: '🍲', label: 'Soups & Starters', query: 'Recommend great soups and starters' },
  { icon: '🍰', label: 'Desserts', query: 'What sweet desserts are available?' },
]

const activeQuickPrompts = computed(() => {
  return lang.value === 'si' ? quickPromptsSi : quickPromptsEn
})

// Initial messages
const messages = ref([
  {
    sender: 'assistant',
    text:
      'ආයුබෝවන්! Seven Waves සූපවේදී AI සහයක වෙත සාදරයෙන් පිළිගනිමු! ඔබ අද කැමති කුමන ආකාරයේ රසයකටද? (සැර අඩු කෑම, රසවත් බීම, හෝ Chef Special)',
    items: [],
    chips: ['සැර නැති කෑම', 'Chef Specials', 'Fresh Fruit Juices'],
  },
])

function toggleLanguage() {
  lang.value = lang.value === 'si' ? 'en' : 'si'
  if (lang.value === 'en') {
    messages.value.push({
      sender: 'assistant',
      text: 'Switched to English! How may I assist you with our menu today? Let me know your taste preferences or dietary needs.',
      items: [],
      chips: ['Mild & Kids Friendly', "Chef's Specials", 'Fresh Juices & Shakes'],
    })
  } else {
    messages.value.push({
      sender: 'assistant',
      text: 'භාෂාව සිංහලට මාරු කරන ලදී! ඔබට ගැලපෙන රසවත් කෑම තෝරාගැනීමට මම සූදානම්.',
      items: [],
      chips: ['සැර නැති කෑම', 'Chef Specials', 'බීම & Shakes'],
    })
  }
  scrollToBottom()
}

async function handleSend() {
  const query = inputQuery.value.trim()
  if (!query || isLoading.value) return

  inputQuery.value = ''
  messages.value.push({
    sender: 'user',
    text: query,
  })

  scrollToBottom()
  await executeQuery(query)
}

async function sendQuickPrompt(promptText) {
  if (isLoading.value) return
  messages.value.push({
    sender: 'user',
    text: promptText,
  })
  scrollToBottom()
  await executeQuery(promptText)
}

async function executeQuery(query) {
  isLoading.value = true
  try {
    const res = await askCustomerMenuAssistant(query, lang.value, props.branchId)
    if (res.success && res.data) {
      messages.value.push({
        sender: 'assistant',
        text: res.data.message,
        items: res.data.recommended_items || [],
        chips: res.data.suggested_chips || [],
      })
    } else {
      messages.value.push({
        sender: 'assistant',
        text:
          lang.value === 'si'
            ? 'සමාවන්න, මෙනුව පරීක්ෂා කිරීමේදී ගැටළුවක් ඇතිවිය. කරුණාකර නැවත උත්සාහ කරන්න.'
            : 'Sorry, I encountered an issue fetching recommendations. Please try again.',
        items: [],
        chips: [],
      })
    }
  } catch (err) {
    console.error('[AiMenuAssistant] error:', err)
    messages.value.push({
      sender: 'assistant',
      text:
        lang.value === 'si'
          ? 'සමාවන්න, සන්නිවේදන දෝෂයක් සිදුවිය.'
          : 'Sorry, a communication error occurred.',
      items: [],
    })
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

function handleAddToCart(dish) {
  emit('add-to-cart', {
    id: dish.id,
    name: dish.name,
    price: dish.price,
    unitPrice: dish.price,
  })

  $q.notify({
    type: 'positive',
    icon: 'restaurant_menu',
    message: `${dish.name} added to your cart! 🍽️`,
    position: 'top',
    timeout: 2500,
  })
}

function scrollToBottom() {
  nextTick(() => {
    if (chatScrollRef.value?.$el) {
      chatScrollRef.value.$el.scrollTop = chatScrollRef.value.$el.scrollHeight
    }
  })
}
</script>

<style scoped>
/* ── Floating FAB Button ── */
.ai-chef-fab-wrapper {
  position: fixed;
  bottom: 84px;
  right: 20px;
  z-index: 999;
}

.ai-chef-fab-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
  color: #fff;
  width: 58px;
  height: 58px;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.3);
  position: relative;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ai-chef-fab-btn:hover {
  transform: scale(1.08);
}

.fab-emoji {
  font-size: 28px;
}

.fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #10b981;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 10px;
  border: 1.5px solid #1e293b;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.glow-pulse {
  animation: pulseAura 2.5s infinite;
}

@keyframes pulseAura {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6);
  }
  70% {
    box-shadow: 0 0 0 16px rgba(245, 158, 11, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
  }
}

/* ── AI Chef Dialog ── */
.ai-chef-dialog :deep(.q-dialog__inner--bottom) {
  padding: 0;
}

.ai-chef-card {
  background: rgba(15, 23, 42, 0.96) !important;
  backdrop-filter: blur(20px);
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  border-top: 1px solid rgba(245, 158, 11, 0.3);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.6);
}

.header-glass {
  background: rgba(30, 41, 59, 0.7);
}

.ai-chef-avatar {
  background: radial-gradient(circle, #f59e0b 0%, #b45309 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
}

.lang-pill-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fbbf24;
  border-radius: 12px;
  padding: 4px 8px;
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.separator-glow {
  background: linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.5), transparent);
}

/* ── Chips ── */
.chips-container {
  background: rgba(15, 23, 42, 0.85);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.ai-quick-chip {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
  border-radius: 16px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.ai-quick-chip:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.2);
  border-color: #f59e0b;
  color: #fbbf24;
}

.chip-icon {
  margin-right: 4px;
}

/* ── Chat Body ── */
.chat-body-area {
  max-height: 52vh;
  min-height: 280px;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.user-bubble {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: #fff;
  padding: 8px 14px;
  border-radius: 16px 16px 4px 16px;
  font-size: 13.5px;
  max-width: 82%;
  box-shadow: 0 4px 12px rgba(29, 78, 216, 0.25);
  word-break: break-word;
}

.ai-bubble-container {
  max-width: 88%;
}

.ai-bubble {
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px 16px 16px 16px;
  padding: 10px 14px;
  font-size: 13.5px;
  line-height: 1.45;
  color: #f1f5f9;
}

/* ── Recommended Dish Card ── */
.recommended-dishes-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-dish-card {
  display: flex;
  align-items: center;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 12px;
  padding: 8px;
  gap: 10px;
  transition: border-color 0.15s ease;
}

.ai-dish-card:hover {
  border-color: rgba(245, 158, 11, 0.6);
}

.ai-dish-thumb-wrap {
  width: 58px;
  height: 58px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: #1e293b;
}

.ai-dish-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ai-dish-details {
  flex: 1;
  min-width: 0;
}

.ai-dish-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-dish-reason {
  font-size: 11px;
  line-height: 1.2;
}

.ai-dish-price {
  font-size: 13px;
}

.add-dish-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
  color: #fff;
  border-radius: 8px;
  font-weight: 700;
  padding: 2px 8px;
}

/* ── Follow-up chips ── */
.followup-chip {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fde68a;
  border-radius: 12px;
  padding: 3px 10px;
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.followup-chip:hover {
  background: rgba(245, 158, 11, 0.25);
}

/* ── Input Bar ── */
.chat-input-bar {
  background: rgba(30, 41, 59, 0.9);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.chat-input-field :deep(.q-field__control) {
  background: rgba(15, 23, 42, 0.8) !important;
  border-radius: 24px;
}
</style>
