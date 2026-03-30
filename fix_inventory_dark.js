/**
 * Fix all hardcoded `dark` attributes in inventory .vue files.
 * Replaces:
 *   - standalone `dark` attr on q-input/q-select/q-table → :dark="$q.dark.isActive"
 *   - class="bg-grey-9 text-white" on q-card → :class="[$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black']"
 *   - dark on q-table → :dark="$q.dark.isActive"
 *   - q-separator dark → :dark="$q.dark.isActive"
 */

const fs = require('fs')
const path = require('path')
const dir = path.join(__dirname, 'src/components/inventory')

const files = fs.readdirSync(dir).filter(f => f.endsWith('.vue'))

files.forEach(file => {
  const filePath = path.join(dir, file)
  let content = fs.readFileSync(filePath, 'utf8')
  const original = content

  // Fix standalone `dark` word on its own line (standalone attribute, not part of :dark= or "dark")
  // Pattern: lines that are JUST whitespace + "dark" with possible \r
  content = content.replace(/^(\s+)dark(\r?\n)/gm, '$1:dark="$q.dark.isActive"$2')

  // Fix class="bg-grey-9 text-white" → dynamic :class
  content = content.replace(
    /class="bg-grey-9 text-white"/g,
    ':class="$q.dark.isActive ? \'bg-grey-9 text-white\' : \'bg-white text-black\'"'
  )
  // Same but with q-mt-md appended
  content = content.replace(
    /class="bg-grey-9 text-white q-mt-md"/g,
    ':class="[$q.dark.isActive ? \'bg-grey-9 text-white\' : \'bg-white text-black\', \'q-mt-md\']"'
  )

  // Fix already-broken patterns from previous script run: :dark=" $q.dark.isActive\
  content = content.replace(/:dark=" \$q\.dark\.isActive\\/g, ':dark="$q.dark.isActive"')

  if (content !== original) {
    fs.writeFileSync(filePath, content)
    console.log('Fixed:', file)
  } else {
    console.log('No changes:', file)
  }
})

console.log('\nDone! All inventory components processed.')
