const fs = require('fs');

let content = fs.readFileSync('src/pages/hr/EmployeesPage.vue', 'utf8');

// The modal starts around line 820 (<q-dialog v-model="showDetail">)
let startIndex = content.indexOf('v-model="showDetail"');
let modalContent = content.substring(startIndex);
let endMatch = modalContent.match(/<\/q-dialog>/);
let endIndex = startIndex + endMatch.index + endMatch[0].length;

let before = content.substring(0, startIndex);
let modalChunk = content.substring(startIndex, endIndex);
let after = content.substring(endIndex);

// clean up my previous dirty script classes
modalChunk = modalChunk.split(`:class="[''.trim(), ' text-weight-medium'.trim(), $q.dark.isActive ? 'text-white' : 'text-dark']"`).join(`:class="['text-weight-medium', $q.dark.isActive ? 'text-white' : 'text-dark']"`);
modalChunk = modalChunk.split(`:class="['text-right '.trim(), ''.trim(), $q.dark.isActive ? 'text-white' : 'text-dark']"`).join(`:class="['text-right', $q.dark.isActive ? 'text-white' : 'text-dark']"`);

// also text-white for inputs inside right side Settings Tab
// wait, the inputs in Settings tab were NOT white text, but they might have had 'text-white' which was replaced by my script:
modalChunk = modalChunk.split(`:class="[''.trim(), ''.trim(), $q.dark.isActive ? 'text-white' : 'text-dark']"`).join(`:class="$q.dark.isActive ? 'text-white' : 'text-dark'"`);

// some inputs in Settings tab
modalChunk = modalChunk.replace(/class="text-amber-4"/g, `:class="$q.dark.isActive ? 'text-amber-4' : 'text-orange-9'"`);
modalChunk = modalChunk.replace(/class="text-right text-amber-4"/g, `:class="['text-right', $q.dark.isActive ? 'text-amber-4' : 'text-orange-9']"`);

fs.writeFileSync('src/pages/hr/EmployeesPage.vue', before + modalChunk + after);
