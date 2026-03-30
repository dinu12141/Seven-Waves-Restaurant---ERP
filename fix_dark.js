const fs = require('fs')
const path = require('path')
const dir = './src/components/inventory'

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.vue'))
let replacedCount = 0

for (const file of files) {
  const filePath = path.join(dir, file)
  let content = fs.readFileSync(filePath, 'utf8')
  let original = content

  // Replace dark with :dark="$q.dark.isActive"
  content = content.replace(
    /(<(?:q-input|q-select|q-card|q-list|q-toggle|q-separator|q-banner|ERPFormField))([^>]*?)(?:\s+dark\s+|\s+dark>|\s+dark\r?\n)/g,
    (match, tag, rest) => {
      const isEnd = match.endsWith('>')
      const replacement = ' :dark="$q.dark.isActive"' + (isEnd ? '>' : ' ')
      return tag + rest + replacement
    },
  )

  content = content.replace(/\s+dark(\s+[a-zA-Z-:]+=|\s+\w+)/g, ' :dark="$q.dark.isActive"$1')

  // Specific fix for bg-dark or bg-grey-9 on cards
  content = content.replace(
    /class="bg-grey-9 text-white/g,
    ":class=\"[$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black']\"",
  )
  content = content.replace(
    /class="bg-dark (text-white )?border-subtle/g,
    ":class=\"[$q.dark.isActive ? 'bg-dark text-white border-subtle' : 'bg-white text-black border-subtle']\"",
  )

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8')
    replacedCount++
    console.log('Fixed ' + file)
  }
}
console.log('Total files fixed: ' + replacedCount)
