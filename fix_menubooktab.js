const fs = require('fs')
const filePath = 'src/components/inventory/MenuBookTab.vue'
let c = fs.readFileSync(filePath, 'utf8')

// Fix 1: merge duplicate :class on the right panel q-card (two consecutive :class attrs)
// Pattern: :class="...theme..." \n          :class="{ 'disabled-overlay': !selectedBookId }"
c = c.replace(
  /:class="(\$q\.dark\.isActive \? 'bg-grey-9 text-white border-subtle erp-card' : 'bg-white text-black erp-card')"\s*\r?\n(\s+):class="\{ 'disabled-overlay': !selectedBookId \}"/,
  ':class="[$1, { \'disabled-overlay\': !selectedBookId }]"',
)

// Fix 2: replace hardcoded bg-dark cards
c = c.replace(
  /class="bg-dark text-white border-subtle erp-card"/g,
  ":class=\"$q.dark.isActive ? 'bg-grey-9 text-white border-subtle erp-card' : 'bg-white text-black erp-card'\"",
)

// Fix 3: <q-card dark class="bg-dark border-subtle" ...>
c = c.replace(
  /<q-card dark class="bg-dark border-subtle"/g,
  '<q-card :dark="$q.dark.isActive" :class="$q.dark.isActive ? \'bg-grey-9 text-white\' : \'bg-white text-black\'"',
)

// Fix 4: standalone dark attr on its own line
c = c.replace(/^(\s+)dark(\r?\n)/gm, '$1:dark="$q.dark.isActive"$2')

fs.writeFileSync(filePath, c)
console.log('Fixed MenuBookTab.vue, len:', c.length)
