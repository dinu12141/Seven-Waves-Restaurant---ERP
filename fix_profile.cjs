const fs = require('fs');

let content = fs.readFileSync('src/pages/hr/EmployeesPage.vue', 'utf8');

// The modal starts around line 820 (<q-dialog v-model="showDetail">)
// and ends around line 2200.
let startIndex = content.indexOf('v-model="showDetail"');
let modalContent = content.substring(startIndex);
let endMatch = modalContent.match(/<\/q-dialog>/);
let endIndex = startIndex + endMatch.index + endMatch[0].length;

let before = content.substring(0, startIndex);
let modalChunk = content.substring(startIndex, endIndex);
let after = content.substring(endIndex);

// 1. Remove color: #fff; and color: #e2e8f0; and color: #fff
modalChunk = modalChunk.replace(/color:\s*#(fff|e2e8f0|ffffff);?/gi, '');

// 2. Fix the q-card background
modalChunk = modalChunk.replace(
  /background:\s*var\(--erp-bg-page,\s*#0b0f19\);/g,
  ""
);
modalChunk = modalChunk.replace(
  /background:\s*var\(--erp-bg-form-card,\s*#111827\);/g,
  ""
);

// Add dynamic classes to replacing background
modalChunk = modalChunk.replace(
  /class="full-width"/g,
  `class="full-width" :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"`
);

// 3. Fix text-white
modalChunk = modalChunk.replace(/class="([^"]*)text-white([^"]*)"/g, (match, p1, p2) => {
  return `:class="['${p1}'.trim(), '${p2}'.trim(), $q.dark.isActive ? 'text-white' : 'text-dark']"`;
});

// Since some have static and dynamic classes mixed now, Quasar allows it, but watch out for duplicates.
// The script above makes `<span class="text-white text-weight-medium">` into `<span :class="['', 'text-weight-medium', $q.dark.isActive ? 'text-white' : 'text-dark']">`

// 4. Fix borders with rgba(255, 255, 255, 0.05) or 0.07 or 0.04
modalChunk = modalChunk.replace(/border(-color|-bottom|-top)?:[^;]+rgba\(255,\s*255,\s*255,\s*0\.\d+\)[^;]*;?/g, '');
modalChunk = modalChunk.replace(/background:\s*rgba\(255,\s*255,\s*255,\s*0\.\d+\);?/g, '');

// 5. Fix <q-tabs dark>
modalChunk = modalChunk.replace(/<q-tabs\s*(v-model="viewTab")\s*dark/g, '<q-tabs $1 :dark="$q.dark.isActive"');
modalChunk = modalChunk.replace(/<q-markup-table\s*dark/g, '<q-markup-table :dark="$q.dark.isActive"');

// 6. Fix text-grey-3 to be text-grey-9 on light mode and vice versa
// Actually the previous script already set some to `$q.dark.isActive ? 'text-grey-3' : 'text-grey-9'`
// But what about the ones that are raw?
modalChunk = modalChunk.replace(/color="grey-4"/g, `:color="$q.dark.isActive ? 'grey-4' : 'grey-8'"`);

// Write it back
fs.writeFileSync('src/pages/hr/EmployeesPage.vue', before + modalChunk + after);
console.log("Profile dialog cleaned up!");
