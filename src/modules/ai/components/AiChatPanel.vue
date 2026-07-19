<template>
  <q-card flat bordered class="ai-chat-panel">
    <q-card-section class="row items-center q-pb-sm bg-dark-page">
      <q-icon name="smart_toy" color="primary" size="sm" class="q-mr-sm" />
      <div class="text-subtitle1 text-weight-bold">AI Assistant</div>
      <q-space />
      <q-btn flat dense size="sm" icon="delete_sweep" @click="assistant.clear()" :disable="!messages.length">
        <q-tooltip>Clear conversation</q-tooltip>
      </q-btn>
    </q-card-section>
    <q-separator color="white-opacity-10" />

    <!-- Message area -->
    <q-scroll-area ref="scrollArea" class="chat-messages" style="height: 400px;">
      <div class="q-pa-md">
        <!-- Welcome message -->
        <div v-if="!messages.length" class="text-center q-pa-xl text-grey-6">
          <q-icon name="auto_awesome" size="64px" class="q-mb-md" color="primary" />
          <div class="text-h6 text-weight-bold q-mb-sm">Seven Waves AI Assistant</div>
          <div class="text-body2 q-mb-md">Ask me about your business performance, operations, or ERP features.</div>
          <div class="row q-gutter-sm justify-center">
            <q-chip
              v-for="suggestion in quickActions"
              :key="suggestion"
              clickable
              outline
              color="primary"
              size="sm"
              @click="sendQuick(suggestion)"
            >
              {{ suggestion }}
            </q-chip>
          </div>
        </div>

        <!-- Messages -->
        <div v-for="msg in messages" :key="msg.timestamp + msg.role" class="chat-message q-mb-md" :class="msg.role">
          <div class="message-bubble" :class="msg.role">
            <div class="text-body2" style="white-space: pre-wrap;">{{ msg.content }}</div>
            <div v-if="msg.metadata?.suggestions" class="q-mt-sm">
              <q-chip
                v-for="s in msg.metadata.suggestions"
                :key="s"
                clickable
                outline
                size="xs"
                color="primary"
                @click="sendQuick(s)"
              >
                {{ s }}
              </q-chip>
            </div>
          </div>
          <div class="text-caption text-grey-7 q-mt-xs" :class="msg.role === 'user' ? 'text-right' : ''">
            {{ formatTime(msg.timestamp) }}
            <span v-if="msg.metadata?.confidence" class="q-ml-sm">
              · confidence: {{ (msg.metadata.confidence * 100).toFixed(0) }}%
            </span>
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-if="isTyping" class="chat-message assistant">
          <div class="message-bubble assistant">
            <q-spinner-dots color="primary" size="24px" />
          </div>
        </div>
      </div>
    </q-scroll-area>

    <!-- Disclaimer -->
    <div class="text-center text-caption text-grey-7 q-pa-xs" style="background: rgba(255,165,0,0.05); border-top: 1px solid rgba(255,255,255,0.06);">
      ⚠️ AI suggestions may be inaccurate — always verify before taking action.
    </div>

    <!-- Input area -->
    <q-card-section class="q-pa-sm" style="background: rgba(255,255,255,0.03); border-top: 1px solid rgba(255,255,255,0.06);">
      <div class="row q-gutter-sm items-end">
        <q-input
          v-model="assistant.currentInput.value"
          class="col"
          dense
          outlined
          placeholder="Ask a question about your business..."
          @keyup.enter="handleSend"
          :disable="isTyping"
          autofocus
        >
          <template #prepend>
            <q-icon name="chat" color="grey-6" />
          </template>
        </q-input>
        <q-btn
          round
          unelevated
          color="primary"
          icon="send"
          size="sm"
          :loading="isTyping"
          :disable="!assistant.currentInput.value?.trim()"
          @click="handleSend"
        />
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup>
import { computed, ref, nextTick, watch, onMounted } from 'vue'
import { date } from 'quasar'
import { useAiAssistant } from '../composables/useAiAssistant'
import { useAiStore } from '../stores/ai.store'

const props = defineProps({
  moduleContext: { type: String, default: null },
})

const assistant = useAiAssistant()
const aiStore = useAiStore()
const scrollArea = ref(null)

const messages = computed(() => assistant.messages.value)
const isTyping = computed(() => assistant.isTyping.value)

onMounted(() => {
  aiStore.loadChatHistory()
  nextTick(scrollToBottom)
})

const quickActions = [
  "Today's sales summary",
  'Show kitchen performance',
  'Inventory alerts',
  'Staff schedule today',
]

function sendQuick(text) {
  assistant.currentInput.value = text
  handleSend()
}

async function handleSend() {
  const msg = assistant.currentInput.value?.trim()
  if (!msg) return
  await assistant.send(msg, props.moduleContext)
  await nextTick()
  scrollToBottom()
}

function scrollToBottom() {
  if (scrollArea.value) {
    scrollArea.value.setScrollPercentage('vertical', 1, 300)
  }
}

function formatTime(val) {
  if (!val) return ''
  return date.formatDate(val, 'HH:mm')
}

watch(messages, () => {
  nextTick(scrollToBottom)
}, { deep: true })
</script>

<style lang="scss" scoped>
.ai-chat-panel {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.chat-message {
  &.user { display: flex; flex-direction: column; align-items: flex-end; }
  &.assistant { display: flex; flex-direction: column; align-items: flex-start; }
}

.message-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  line-height: 1.5;

  &.user {
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-bottom-right-radius: 4px;
    color: #e5e7eb;
  }

  &.assistant {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-bottom-left-radius: 4px;
    color: #d1d5db;
  }
}
</style>
