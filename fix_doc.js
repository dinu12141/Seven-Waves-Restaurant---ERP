const fs = require('fs');

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');

  // Add Dynamic Card Class
  content = content.replace(/class="bg-grey-9 text-white"(?!( :class))/g, ':class="$q.dark.isActive ? \\'bg-grey-9 text-white\\' : \\'bg-white text-black\\'"');

  // Change <q-input to <BaseInput and </q-input> to </BaseInput>
  content = content.replace(/<q-input/g, '<BaseInput');
  content = content.replace(/<\/q-input>/g, '</BaseInput>');

  // Change <q-select to <BaseSelect and </q-select> to </BaseSelect>
  content = content.replace(/<q-select/g, '<BaseSelect');
  content = content.replace(/<\/q-select>/g, '</BaseSelect>');

  // Remove `dark` and `dense` and `outlined` from BaseInput and BaseSelect because BaseInput/Select have them by default, 
  // and having `dark\n` causes issues! 
  // Wait, BaseInput doesn't have outlined dense by default, it does inside its template!
  // So we can just remove `dark`, `outlined`, `dense` safely.
  content = content.replace(/^\s*dark\r?\n/gm, '');
  content = content.replace(/^\s*outlined\r?\n/gm, '');
  content = content.replace(/^\s*dense\r?\n/gm, '');
  // Also clean up inline ones
  content = content.replace(/ dark outlined dense/g, '');
  content = content.replace(/ dark/g, '');

  fs.writeFileSync(file, content);
  console.log('Fixed ' + file);
}

fixFile('src/components/inventory/DocumentHeader.vue');
// fixFile('src/components/inventory/DocumentCreateTab.vue'); // I'll do this one manually or cautiously 

