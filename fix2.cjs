const fs = require('fs');
let content = fs.readFileSync('src/pages/hr/EmployeesPage.vue', 'utf8');

// The faulty string is literally `<q-input :="$q.dark.isActive"` because inside Node the $q WAS literal since the script execution actually got $q.
// Wait, if it is literal, let's just do a string replace, no regex.
content = content.split(':="$q.dark.isActive"').join(':dark="$q.dark.isActive"');

fs.writeFileSync('src/pages/hr/EmployeesPage.vue', content);
console.log("Fixed faulty syntax");
