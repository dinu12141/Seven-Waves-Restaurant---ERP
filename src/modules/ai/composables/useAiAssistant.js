// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — useAiAssistant Composable
// ═══════════════════════════════════════════════════════════════════════════════
import { computed, ref } from 'vue'
import { useAiStore } from '../stores/ai.store'
import { useAuthStore } from 'src/stores/auth'

export function useAiAssistant() {
  const aiStore = useAiStore()
  const authStore = useAuthStore()

  const branchId = computed(() => authStore.currentBranch?.id)
  const isTyping = computed(() => aiStore.loading.chat)
  const messages = computed(() => aiStore.chatMessages)
  const currentInput = ref('')

  async function send(message, moduleContext) {
    if (!message?.trim()) return
    currentInput.value = ''
    return aiStore.sendMessage(message.trim(), branchId.value, moduleContext)
  }

  function clear() {
    aiStore.clearChat()
  }

  return {
    messages,
    isTyping,
    currentInput,
    send,
    clear,
  }
}
