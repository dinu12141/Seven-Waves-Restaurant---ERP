<template>
  <div class="gs-wrap" ref="wrapRef">
    <!-- Search Input -->
    <div class="gs-input-box" :class="{ 'gs-input-box--focused': isFocused || showDropdown }">
      <q-icon name="search" size="16px" class="gs-icon" />
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="gs-input"
        placeholder="Search anything… (Ctrl+K)"
        autocomplete="off"
        spellcheck="false"
        @focus="handleFocus"
        @blur="handleBlur"
        @input="handleInput"
        @keydown="handleKeydown"
      />
      <transition name="gs-fade">
        <span v-if="isLoading" class="gs-spinner">
          <q-spinner size="14px" color="primary" />
        </span>
        <kbd v-else-if="!isFocused && !query" class="gs-kbd">⌃K</kbd>
        <button v-else-if="query" class="gs-clear" @mousedown.prevent="clearSearch">
          <q-icon name="close" size="14px" />
        </button>
      </transition>
    </div>

    <!-- Dropdown Results -->
    <transition name="gs-dropdown">
      <div v-if="showDropdown" class="gs-dropdown" ref="dropdownRef">

        <!-- Empty state -->
        <div v-if="!isLoading && !hasResults && query.length >= 2" class="gs-empty">
          <q-icon name="search_off" size="32px" class="gs-empty__icon" />
          <p class="gs-empty__title">No results for "{{ query }}"</p>
          <p class="gs-empty__sub">Try a different term or check your spelling</p>
        </div>

        <!-- Hint before typing -->
        <div v-if="query.length < 2 && !isLoading" class="gs-hint">
          <div class="gs-hint__row" v-for="tip in searchTips" :key="tip.label">
            <q-icon :name="tip.icon" size="16px" class="gs-hint__icon" />
            <span>{{ tip.label }}</span>
          </div>
        </div>

        <!-- Grouped Results -->
        <template v-if="hasResults">
          <div
            v-for="(group, category) in groupedResults"
            :key="category"
            class="gs-group"
          >
            <!-- Category header -->
            <div class="gs-group__header">
              <q-icon :name="categoryIcon(category)" size="13px" class="gs-group__icon" />
              <span class="gs-group__label">{{ category }}</span>
              <span class="gs-group__count">{{ group.length }}</span>
            </div>

            <!-- Items -->
            <div
              v-for="item in group"
              :key="item.id"
              class="gs-item"
              :class="{
                'gs-item--active': isActive(item),
              }"
              @mousedown.prevent="navigateTo(item)"
              @mouseover="activeId = item.id"
            >
              <div class="gs-item__avatar" :class="`gs-item__avatar--${categoryColor(category)}`">
                <q-icon :name="categoryIcon(category)" size="14px" />
              </div>
              <div class="gs-item__body">
                <span class="gs-item__title" v-html="highlight(item.title)" />
                <span v-if="item.subtitle" class="gs-item__sub">{{ item.subtitle }}</span>
              </div>
              <span
                class="gs-item__badge"
                :class="`gs-badge--${badgeColor(item.badge)}`"
              >{{ item.badge }}</span>
              <q-icon name="arrow_forward_ios" size="11px" class="gs-item__arrow" />
            </div>
          </div>

          <!-- Footer -->
          <div class="gs-footer">
            <span><kbd class="gs-key">↑↓</kbd> navigate</span>
            <span><kbd class="gs-key">↵</kbd> open</span>
            <span><kbd class="gs-key">Esc</kbd> close</span>
          </div>
        </template>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from 'src/boot/supabase'

const router = useRouter()

// ─── State ───────────────────────────────────────────────────────────────────
const query       = ref('')
const results     = ref([])
const isLoading   = ref(false)
const isFocused   = ref(false)
const showDropdown = ref(false)
const activeId    = ref(null)
const wrapRef     = ref(null)
const inputRef    = ref(null)
const dropdownRef = ref(null)

let debounceTimer = null

// ─── Computed ─────────────────────────────────────────────────────────────────
const hasResults = computed(() => results.value.length > 0)

const groupedResults = computed(() => {
  const groups = {}
  for (const r of results.value) {
    if (!groups[r.category]) groups[r.category] = []
    groups[r.category].push(r)
  }
  return groups
})

const flatResults = computed(() => {
  // Flatten grouped results in order for keyboard nav
  return Object.values(groupedResults.value).flat()
})

// ─── Search Tips (shown before typing) ───────────────────────────────────────
const searchTips = [
  { icon: 'receipt_long', label: 'Search invoices, orders, bills…' },
  { icon: 'people',       label: 'Find customers & suppliers…' },
  { icon: 'inventory_2',  label: 'Look up inventory items…' },
  { icon: 'account_balance', label: 'Search GL accounts & journals…' },
  { icon: 'badge',        label: 'Find employees by name or code…' },
]

// ─── Category metadata ────────────────────────────────────────────────────────
const CATEGORY_META = {
  'Order':          { icon: 'shopping_bag',     color: 'blue'   },
  'Customer':       { icon: 'person',           color: 'teal'   },
  'Invoice':        { icon: 'receipt_long',     color: 'purple' },
  'Supplier':       { icon: 'local_shipping',   color: 'orange' },
  'Purchase Order': { icon: 'shopping_cart',    color: 'amber'  },
  'AP Invoice':     { icon: 'request_quote',    color: 'red'    },
  'Inventory Item': { icon: 'inventory_2',      color: 'green'  },
  'GL Account':     { icon: 'account_balance',  color: 'indigo' },
  'Journal Entry':  { icon: 'book',             color: 'cyan'   },
  'Employee':       { icon: 'badge',            color: 'pink'   },
}

function categoryIcon(cat)  { return CATEGORY_META[cat]?.icon  || 'circle' }
function categoryColor(cat) { return CATEGORY_META[cat]?.color || 'grey'   }

// ─── Badge coloring ───────────────────────────────────────────────────────────
function badgeColor(badge) {
  if (!badge) return 'grey'
  const b = badge.toLowerCase()
  if (['active', 'posted', 'paid', 'approved', 'completed', 'delivered'].includes(b)) return 'green'
  if (['pending', 'draft', 'open', 'partial'].includes(b))  return 'amber'
  if (['cancelled', 'reversed', 'void', 'inactive'].includes(b)) return 'red'
  if (['unknown'].includes(b)) return 'grey'
  return 'blue'
}

// ─── Highlight matching text ──────────────────────────────────────────────────
function highlight(text) {
  if (!query.value || !text) return text
  const escaped = query.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped})`, 'gi')
  return text.replace(re, '<mark class="gs-mark">$1</mark>')
}

// ─── Active item ──────────────────────────────────────────────────────────────
function isActive(item) { return activeId.value === item.id }

// ─── Focus / Blur ─────────────────────────────────────────────────────────────
function handleFocus() {
  isFocused.value = true
  showDropdown.value = true
}

function handleBlur() {
  // Delay to allow mousedown on dropdown items to fire first
  setTimeout(() => {
    isFocused.value = false
    showDropdown.value = false
    activeId.value = null
  }, 200)
}

// ─── Input + debounce ─────────────────────────────────────────────────────────
function handleInput() {
  clearTimeout(debounceTimer)
  showDropdown.value = true

  if (query.value.length < 2) {
    results.value = []
    isLoading.value = false
    return
  }

  isLoading.value = true
  debounceTimer = setTimeout(() => doSearch(), 280)
}

// ─── Supabase RPC call ────────────────────────────────────────────────────────
async function doSearch() {
  if (query.value.length < 2) return

  isLoading.value = true
  try {
    const { data, error } = await supabase.rpc('global_search', {
      search_term: query.value.trim(),
    })

    if (error) throw error
    results.value = data || []
    // Auto-focus first result
    activeId.value = results.value[0]?.id || null
  } catch (err) {
    console.error('[GlobalSearch] RPC error:', err)
    results.value = []
  } finally {
    isLoading.value = false
  }
}

// ─── Keyboard navigation ──────────────────────────────────────────────────────
function handleKeydown(e) {
  const flat = flatResults.value
  const currentIdx = flat.findIndex((r) => r.id === activeId.value)

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = flat[currentIdx + 1] || flat[0]
    activeId.value = next?.id || null
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = flat[currentIdx - 1] || flat[flat.length - 1]
    activeId.value = prev?.id || null
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const active = flat.find((r) => r.id === activeId.value)
    if (active) navigateTo(active)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeSearch()
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = dropdownRef.value?.querySelector('.gs-item--active')
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigateTo(item) {
  closeSearch()
  router.push(item.route)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clearSearch() {
  query.value = ''
  results.value = []
  showDropdown.value = true
  nextTick(() => inputRef.value?.focus())
}

function closeSearch() {
  showDropdown.value = false
  isFocused.value = false
  activeId.value = null
  inputRef.value?.blur()
}

// ─── Global Ctrl+K shortcut ───────────────────────────────────────────────────
function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    inputRef.value?.focus()
    showDropdown.value = true
  }
}

// ─── Click outside to close ───────────────────────────────────────────────────
function onClickOutside(e) {
  if (wrapRef.value && !wrapRef.value.contains(e.target)) {
    closeSearch()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  document.addEventListener('mousedown', onClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  document.removeEventListener('mousedown', onClickOutside)
})

// ─── Expose focus for parent ──────────────────────────────────────────────────
defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<style scoped lang="scss">
// ─── Wrapper ──────────────────────────────────────────────────────────────────
.gs-wrap {
  position: relative;
  flex: 0 1 320px;
  transition: flex 0.3s ease;

  &:focus-within {
    flex: 0 1 440px;
  }
}

// ─── Input box ────────────────────────────────────────────────────────────────
.gs-input-box {
  display: flex;
  align-items: center;
  height: 30px;
  background: var(--erp-bg-active);
  border: 1px solid var(--erp-border-hover);
  border-radius: 7px;
  padding: 0 8px;
  gap: 6px;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  cursor: text;

  &--focused {
    border-color: var(--erp-primary) !important;
    background: rgba(67, 133, 245, 0.06) !important;
    box-shadow: 0 0 0 2px rgba(67, 133, 245, 0.15);
  }
}

.gs-icon {
  color: var(--erp-text-tertiary);
  flex-shrink: 0;
}

.gs-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--erp-text-primary);
  font-family: var(--erp-font-family, 'Inter');
  min-width: 0;

  &::placeholder {
    color: var(--erp-text-tertiary);
  }
}

.gs-kbd {
  font-size: 10px;
  font-family: inherit;
  color: var(--erp-text-tertiary);
  background: var(--erp-bg-hover);
  border: 1px solid var(--erp-border-hover);
  border-radius: 4px;
  padding: 1px 5px;
  height: 18px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  flex-shrink: 0;
}

.gs-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--erp-text-tertiary);
  display: flex;
  align-items: center;
  padding: 0;
  border-radius: 3px;
  transition: color 0.15s;
  flex-shrink: 0;

  &:hover { color: var(--erp-text-primary); }
}

.gs-spinner {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────
.gs-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  min-width: 420px;
  max-height: 480px;
  overflow-y: auto;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 9999;
  scroll-behavior: smooth;

  // Custom scrollbar
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: var(--erp-border);
    border-radius: 2px;
  }
}

// ─── Category group ───────────────────────────────────────────────────────────
.gs-group {
  & + .gs-group {
    border-top: 1px solid var(--erp-border);
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px 4px;
  }

  &__icon { color: var(--erp-text-tertiary); }

  &__label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--erp-text-tertiary);
    flex: 1;
  }

  &__count {
    font-size: 10px;
    color: var(--erp-text-tertiary);
    background: var(--erp-bg-hover);
    border-radius: 10px;
    padding: 0 6px;
    min-width: 18px;
    text-align: center;
  }
}

// ─── Result item ──────────────────────────────────────────────────────────────
.gs-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.12s;

  &:hover, &--active {
    background: var(--erp-bg-hover);

    .gs-item__arrow { opacity: 1; transform: translateX(2px); }
  }

  &__avatar {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0.85;

    // Color variants
    &--blue   { background: rgba(66, 133, 244, 0.15); color: #4285f4; }
    &--teal   { background: rgba(0, 178, 167, 0.15);  color: #00b2a7; }
    &--purple { background: rgba(142, 68, 194, 0.15); color: #8e44c2; }
    &--orange { background: rgba(255, 143, 0, 0.15);  color: #ff8f00; }
    &--amber  { background: rgba(255, 179, 0, 0.15);  color: #ffb300; }
    &--red    { background: rgba(220, 53, 69, 0.15);  color: #dc3545; }
    &--green  { background: rgba(40, 167, 69, 0.15);  color: #28a745; }
    &--indigo { background: rgba(63, 81, 181, 0.15);  color: #3f51b5; }
    &--cyan   { background: rgba(0, 188, 212, 0.15);  color: #00bcd4; }
    &--pink   { background: rgba(233, 30, 99, 0.15);  color: #e91e63; }
    &--grey   { background: rgba(128, 128, 128, 0.15); color: #808080; }
  }

  &__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  &__title {
    font-size: 13px;
    font-weight: 500;
    color: var(--erp-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    :deep(.gs-mark) {
      background: rgba(67, 133, 245, 0.18);
      color: var(--erp-primary);
      border-radius: 2px;
      padding: 0 1px;
      font-weight: 600;
    }
  }

  &__sub {
    font-size: 11px;
    color: var(--erp-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: capitalize;
    border-radius: 4px;
    padding: 2px 7px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  &__arrow {
    color: var(--erp-text-tertiary);
    opacity: 0;
    transition: opacity 0.15s, transform 0.15s;
    flex-shrink: 0;
  }
}

// Badge variants
.gs-badge--green  { background: rgba(40, 167, 69, 0.12);  color: #28a745; }
.gs-badge--amber  { background: rgba(255, 193, 7, 0.15);  color: #c98700; }
.gs-badge--red    { background: rgba(220, 53, 69, 0.12);  color: #dc3545; }
.gs-badge--blue   { background: rgba(67, 133, 245, 0.12); color: #4285f4; }
.gs-badge--grey   { background: rgba(128, 128, 128, 0.1); color: var(--erp-text-tertiary); }

// ─── Footer ───────────────────────────────────────────────────────────────────
.gs-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  border-top: 1px solid var(--erp-border);
  font-size: 11px;
  color: var(--erp-text-tertiary);
}

.gs-key {
  background: var(--erp-bg-hover);
  border: 1px solid var(--erp-border);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: inherit;
  margin-right: 3px;
}

// ─── Empty state ──────────────────────────────────────────────────────────────
.gs-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 24px;
  text-align: center;

  &__icon { color: var(--erp-text-tertiary); margin-bottom: 8px; }
  &__title { font-size: 14px; font-weight: 600; color: var(--erp-text-primary); margin: 0 0 4px; }
  &__sub   { font-size: 12px; color: var(--erp-text-tertiary); margin: 0; }
}

// ─── Hints ────────────────────────────────────────────────────────────────────
.gs-hint {
  padding: 10px 14px;

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    font-size: 12px;
    color: var(--erp-text-secondary);
  }
  &__icon { color: var(--erp-text-tertiary); flex-shrink: 0; }
}

// ─── Transitions ──────────────────────────────────────────────────────────────
.gs-dropdown-enter-active { transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1); }
.gs-dropdown-leave-active { transition: all 0.12s ease; }
.gs-dropdown-enter-from   { opacity: 0; transform: translateY(-6px) scale(0.98); }
.gs-dropdown-leave-to     { opacity: 0; transform: translateY(-4px) scale(0.99); }

.gs-fade-enter-active, .gs-fade-leave-active { transition: opacity 0.15s; }
.gs-fade-enter-from, .gs-fade-leave-to { opacity: 0; }
</style>
