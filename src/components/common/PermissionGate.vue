<template>
  <component :is="tag" v-if="hasPermission" v-bind="$attrs">
    <slot />
  </component>
  <slot v-else name="fallback">
    <div v-if="showFallback" class="permission-gate-fallback" role="alert">
      <q-icon name="lock" size="20px" color="grey-6" />
      <span class="permission-gate-fallback__text">{{ fallbackText }}</span>
    </div>
  </slot>
</template>

<script setup>
/**
 * PermissionGate — Conditionally renders content based on RBAC permissions.
 *
 * Usage:
 *   <PermissionGate permission="orders.void">
 *     <q-btn label="Void Order" />
 *   </PermissionGate>
 */
import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth'

const props = defineProps({
  permission: { type: String, default: '' },
  permissions: { type: Array, default: () => [] },
  match: { type: String, default: 'all' },
  role: { type: String, default: '' },
  roles: { type: Array, default: () => [] },
  tag: { type: String, default: 'div' },
  showFallback: { type: Boolean, default: false },
  fallbackText: { type: String, default: 'You do not have permission to view this.' },
})

const authStore = useAuthStore()

const hasPermission = computed(() => {
  if (authStore.roles?.includes('super_admin') || authStore.roles?.includes('admin')) return true
  if (authStore.permissions?.includes('*')) return true
  if (props.role) return authStore.roles?.includes(props.role) ?? false
  if (props.roles.length > 0) return props.roles.some((r) => authStore.roles?.includes(r))
  const permsToCheck = props.permission ? [props.permission] : props.permissions
  if (permsToCheck.length === 0) return true
  if (props.match === 'any') return permsToCheck.some((p) => authStore.permissions?.includes(p))
  return permsToCheck.every((p) => authStore.permissions?.includes(p))
})
</script>

<style scoped>
.permission-gate-fallback {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.08);
  font-size: 12px;
  color: var(--erp-text-muted, #94a3b8);
}
</style>
