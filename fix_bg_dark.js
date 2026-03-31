/**
 * Fix remaining hardcoded bg-dark references in inventory .vue files.
 */
const fs = require('fs')
const path = require('path')
const dir = path.join(__dirname, 'src/components/inventory')
const files = [
  'WarehousesTab.vue',
  'RecipesTab.vue',
  'MenuBookTab.vue',
  'CategoryManagementTab.vue',
]

files.forEach((file) => {
  const filePath = path.join(dir, file)
  let content = fs.readFileSync(filePath, 'utf8')
  const original = content

  // Fix: class="bg-dark text-white border-subtle erp-card"
  content = content.replace(
    /class="bg-dark text-white border-subtle erp-card"/g,
    ":class=\"$q.dark.isActive ? 'bg-grey-9 text-white border-subtle erp-card' : 'bg-white text-black erp-card'\"",
  )
  // Fix: class="bg-dark text-white border-subtle erp-card" (inline attr version with class before)
  content = content.replace(
    /class="bg-dark text-white border-subtle erp-card"/g,
    ":class=\"$q.dark.isActive ? 'bg-grey-9 text-white border-subtle erp-card' : 'bg-white text-black erp-card'\"",
  )

  // Fix: <q-card dark class="bg-dark border-subtle" ...>
  content = content.replace(
    /<q-card dark class="bg-dark border-subtle"/g,
    '<q-card :dark="$q.dark.isActive" :class="$q.dark.isActive ? \'bg-grey-9 text-white\' : \'bg-white text-black\'"',
  )

  // Fix: <q-list :dark="$q.dark.isActive" class="bg-dark text-white">
  content = content.replace(
    /class="bg-dark text-white"/g,
    ":class=\"$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black'\"",
  )

  // Fix: class="bg-dark" (without text)
  content = content.replace(
    /class="rounded-borders bg-dark"/g,
    ":class=\"$q.dark.isActive ? 'rounded-borders bg-grey-9' : 'rounded-borders bg-grey-2'\"",
  )
  content = content.replace(
    /class="bg-dark"/g,
    ":class=\"$q.dark.isActive ? 'bg-grey-9' : 'bg-grey-2'\"",
  )

  // Fix: class="bg-dark text-white border-subtle erp-card" that was on its own line (attr-style)
  content = content.replace(
    /class="bg-dark text-white border-subtle erp-card"\n/g,
    ":class=\"$q.dark.isActive ? 'bg-grey-9 text-white border-subtle erp-card' : 'bg-white text-black erp-card'\"\n",
  )

  if (content !== original) {
    fs.writeFileSync(filePath, content)
    console.log('Fixed:', file)
  } else {
    console.log('No changes:', file)
  }
})
console.log('Done!')
