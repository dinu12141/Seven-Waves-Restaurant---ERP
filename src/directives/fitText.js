/**
 * v-fit-text directive
 * Automatically scales font-size down so the text always fits within its container.
 *
 * Usage:
 *   <div v-fit-text>{{ longValue }}</div>
 *   <div v-fit-text="{ min: 10, max: 22 }">{{ longValue }}</div>
 *
 * Works with ResizeObserver — reacts to container size changes in real time.
 */

function measure(el, binding) {
  const opts = binding.value || {}
  const minSize = opts.min ?? 10
  const maxSize = opts.max ?? 22

  if (!el._fitMaxSize) el._fitMaxSize = maxSize

  // Reset to max so we can check if it overflows
  el.style.fontSize = `${el._fitMaxSize}px`
  el.style.whiteSpace = 'nowrap'

  const parent = el.parentElement
  if (!parent) return

  // Available width = parent width (body flex column, no icon offset needed here —
  // the body already starts after the icon due to flex layout on the card)
  const available = parent.clientWidth - 4 // tiny breathing room

  let size = el._fitMaxSize
  while (el.scrollWidth > available && size > minSize) {
    size -= 0.5
    el.style.fontSize = `${size}px`
  }
}

export const vFitText = {
  mounted(el, binding) {
    el.style.display = 'block'
    // Defer so DOM is fully laid out
    requestAnimationFrame(() => {
      measure(el, binding)
      // Watch for container resize
      el._fitObs = new ResizeObserver(() => measure(el, binding))
      if (el.parentElement) el._fitObs.observe(el.parentElement)
    })
  },

  updated(el, binding) {
    // Re-measure when value changes
    requestAnimationFrame(() => measure(el, binding))
  },

  beforeUnmount(el) {
    if (el._fitObs) {
      el._fitObs.disconnect()
      el._fitObs = null
    }
  },
}
