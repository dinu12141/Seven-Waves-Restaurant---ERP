<template>
  <q-page class="q-pa-md ai-assistant-page">
    <PageHeader
      title="AI Assistant"
      subtitle="Ask questions about your business data, get explanations, and receive guidance"
      show-back
      back-route="/ai"
    />

    <div class="row q-col-gutter-md">
      <!-- Chat Panel -->
      <div class="col-12 col-lg-8">
        <AiChatPanel :module-context="selectedModule" />
      </div>

      <!-- Context Panel -->
      <div class="col-12 col-lg-4">
        <q-card flat bordered class="context-card q-mb-md">
          <q-card-section>
            <div class="text-subtitle2 text-weight-bold q-mb-sm">Module Context</div>
            <q-select
              v-model="selectedModule"
              :options="moduleOptions"
              dense
              outlined
              emit-value
              map-options
              label="Focus Area"
            />
          </q-card-section>
        </q-card>

        <q-card flat bordered class="context-card q-mb-md">
          <q-card-section>
            <div class="text-subtitle2 text-weight-bold q-mb-sm">
              <q-icon name="lightbulb" size="18px" color="amber" class="q-mr-xs" />Example Questions
            </div>
            <q-list dense>
              <q-item v-for="q in exampleQuestions" :key="q" clickable v-ripple class="rounded-borders" @click="askQuestion(q)">
                <q-item-section avatar><q-icon name="chat_bubble_outline" size="xs" color="primary" /></q-item-section>
                <q-item-section class="text-body2">{{ q }}</q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>

        <q-card flat bordered class="context-card">
          <q-card-section>
            <div class="text-subtitle2 text-weight-bold q-mb-sm">
              <q-icon name="warning" size="18px" color="warning" class="q-mr-xs" />Limitations
            </div>
            <q-list dense class="text-caption text-grey-5">
              <q-item v-for="l in limitations" :key="l" dense>
                <q-item-section avatar><q-icon name="block" size="xs" color="negative" /></q-item-section>
                <q-item-section>{{ l }}</q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import AiChatPanel from '../components/AiChatPanel.vue'
import { useAiAssistant } from '../composables/useAiAssistant'

const assistant = useAiAssistant()
const selectedModule = ref(null)

const moduleOptions = [
  { label: 'General', value: null },
  { label: 'Sales & Revenue', value: 'sales' },
  { label: 'Inventory', value: 'inventory' },
  { label: 'Kitchen Operations', value: 'kitchen' },
  { label: 'Procurement', value: 'procurement' },
  { label: 'Finance', value: 'finance' },
  { label: 'Human Resources', value: 'hr' },
  { label: 'Customer Analytics', value: 'customer' },
  { label: 'Security', value: 'security' },
]

const exampleQuestions = [
  "What were today's total sales?",
  'Which items are running low on stock?',
  'How is the kitchen performing today?',
  'Show me revenue trends this week',
  'Are there any suspicious transactions?',
  'Recommend staffing for tomorrow',
]

const limitations = [
  'Cannot execute database changes',
  'Cannot approve financial transactions',
  'Cannot modify user permissions',
  'Cannot access raw personal data',
  'May produce inaccurate analysis',
]

function askQuestion(question) {
  assistant.send(question, selectedModule.value)
}
</script>

<style lang="scss" scoped>
.ai-assistant-page { max-width: 1400px; margin: 0 auto; }
.context-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
}
</style>
