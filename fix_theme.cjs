const fs = require('fs');
let content = fs.readFileSync('src/pages/hr/EmployeesPage.vue', 'utf8');

// 1. Replace `<q-something dark` with `<q-something :dark="$q.dark.isActive"` (matches standard spacing)
content = content.replace(/<(q-input|q-select|q-file|q-checkbox|q-toggle|q-date|q-time)\s+dark\b/g, '<$1 :dark="$q.dark.isActive"');

// 2. Catch it if `dark` is inside other props like `<q-input outlined dark`
content = content.replace(/<(q-input|q-select|q-file|q-checkbox|q-toggle|q-date|q-time)([^>]+?)\bdark\b/g, (match, tag, rest) => {
    if (rest.includes(':dark')) return match; 
    return '<' + tag + rest.replace(/\bdark\b/, ':dark="$q.dark.isActive"');
});

// 3. Fix text-grey classes that are hardcoded.
content = content.replace(/class="([^"]*?)(text-grey-[345689])([^"]*)"/g, (match, before, greyClass, after) => {
    let newClasses = (before + after).replace(/\s+/g, ' ').trim();
    let darkClass = greyClass;
    let lightClass = ['text-grey-5', 'text-grey-6', 'text-grey-8'].includes(greyClass) ? 'text-grey-7' : 'text-grey-9';
    if (newClasses) {
        return `:class="['${newClasses}', $q.dark.isActive ? '${darkClass}' : '${lightClass}']"`;
    }
    return `:class="$q.dark.isActive ? '${darkClass}' : '${lightClass}'"`;
});

// 4. Overwrite file
fs.writeFileSync('src/pages/hr/EmployeesPage.vue', content);
console.log("Transformation completed.");
