import { computed, ref, unref } from 'vue'
import { filterOptions } from '../utils/finance-dates'

/**
 * Make a q-select searchable:
 *   const { options, onFilter } = useSelectFilter(ledgerOptions)
 *   <q-select :options="options" use-input input-debounce="0" @filter="onFilter" … />
 * The selected value keeps its label because `options` is a filtered view of
 * the full list, not a separate copy.
 */
export function useSelectFilter(source) {
  const needle = ref('')
  const options = computed(() => filterOptions(unref(source), needle.value))
  function onFilter(val, update) {
    update(() => {
      needle.value = val || ''
    })
  }
  return { options, onFilter, needle }
}
