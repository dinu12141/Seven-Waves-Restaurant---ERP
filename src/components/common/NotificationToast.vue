<template>
  <Teleport to="body">
    <transition-group name="toast-slide" tag="div" class="toast-container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-card"
        :class="[`toast-${toast.type || 'info'}`]"
        @click="removeToast(toast.id)"
      >
        <!-- Icon -->
        <div class="toast-icon-wrap">
          <q-icon :name="getToastIcon(toast.type)" size="18px" />
        </div>

        <!-- Content -->
        <div class="toast-content">
          <div class="toast-message">{{ toast.message }}</div>
        </div>

        <!-- Close -->
        <q-btn
          flat
          dense
          round
          icon="close"
          size="xs"
          class="toast-close"
          @click.stop="removeToast(toast.id)"
        />

        <!-- Progress bar -->
        <div class="toast-progress" :style="{ animationDuration: '4s' }" />
      </div>
    </transition-group>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { useNotificationStore } from 'src/stores/notifications'

const store = useNotificationStore()
const toasts = computed(() => store.toasts)

function removeToast(id) {
  store.removeToast(id)
}

function getToastIcon(type) {
  const icons = {
    info: 'info_outline',
    positive: 'check_circle_outline',
    warning: 'warning_amber',
    negative: 'error_outline',
  }
  return icons[type] || icons.info
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 64px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: 360px;
  width: 100%;
}

.toast-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.02) inset;
  backdrop-filter: blur(12px);
  cursor: pointer;
  pointer-events: auto;
  position: relative;
  overflow: hidden;
}

.toast-icon-wrap {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  :deep(.q-icon) {
    font-size: 14px !important;
  }
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-message {
  font-size: 0.72rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toast-close {
  color: rgba(255, 255, 255, 0.3) !important;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.toast-card:hover .toast-close {
  opacity: 1;
}

/* ── Progress Bar ── */
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 100%;
  animation: progress-shrink linear forwards;
  transform-origin: left;
}

@keyframes progress-shrink {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

/* ── Type Variants ── */
.toast-info .toast-icon-wrap {
  background: rgba(33, 150, 243, 0.15);
  color: #42a5f5;
}
.toast-info .toast-progress {
  background: linear-gradient(to right, #2196f3, transparent);
}

.toast-positive .toast-icon-wrap {
  background: rgba(76, 175, 80, 0.15);
  color: #66bb6a;
}
.toast-positive .toast-progress {
  background: linear-gradient(to right, #4caf50, transparent);
}

.toast-warning .toast-icon-wrap {
  background: rgba(255, 193, 7, 0.15);
  color: #ffd54f;
}
.toast-warning .toast-progress {
  background: linear-gradient(to right, #ffc107, transparent);
}

.toast-negative .toast-icon-wrap {
  background: rgba(244, 67, 54, 0.15);
  color: #ef5350;
}
.toast-negative .toast-progress {
  background: linear-gradient(to right, #f44336, transparent);
}

/* ── Slide Transitions ── */
.toast-slide-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast-slide-leave-active {
  transition: all 0.25s ease-in;
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateX(100px);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(80px) scale(0.95);
}
</style>
