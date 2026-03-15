import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const root = 'c:/Users/ROG STRIX/Desktop/Restaurant ERP new/src/pages/hr'

// Pages needing q-page wrapper + ERPToolbar, with their titles/breadcrumbs
const pages = [
  { file: 'EmployeesPage.vue',   title: 'Employees',        breadcrumbs: 'Human Resources / Employees' },
  { file: 'PayrollPage.vue',     title: 'Payroll',          breadcrumbs: 'Human Resources / Payroll' },
  { file: 'CommissionPage.vue',  title: 'Commission',       breadcrumbs: 'Human Resources / Commission Packages' },
  { file: 'SalaryAuditPage.vue', title: 'Salary Audit',     breadcrumbs: 'Human Resources / Salary Audit' },
  { file: 'PerformancePage.vue', title: 'Performance',      breadcrumbs: 'Human Resources / Performance' },
  { file: 'ResignationPage.vue', title: 'Resignations',     breadcrumbs: 'Human Resources / Resignations' },
  { file: 'WaiterSetupPage.vue', title: 'Waiter Setup',     breadcrumbs: 'Human Resources / Waiter Setup' },
]

const TOOLBAR_IMPORT = `import ERPToolbar from 'src/components/erp/ERPToolbar.vue'`

for (const { file, title, breadcrumbs } of pages) {
  const path = resolve(root, file)
  let content = readFileSync(path, 'utf8')

  // 1. Check if already wrapped
  if (content.includes('<q-page')) {
    console.log(`⏭  ${file} already has <q-page>, skipping.`)
    continue
  }

  // 2. Replace opening <div> root element
  if (!content.startsWith('<template>\n  <div>')) {
    console.warn(`⚠  ${file}: unexpected root, skipping.`)
    continue
  }

  const toolbar = `<ERPToolbar\n      moduleName="hr"\n      title="${title}"\n      breadcrumbs="${breadcrumbs}"\n    />\n\n    `

  // Replace <template>\n  <div> with <template>\n  <q-page class="q-pa-md">\n    <ERPToolbar .../>
  content = content.replace(
    '<template>\n  <div>',
    `<template>\n  <q-page class="q-pa-md">\n    ${toolbar}`
  )

  // Replace closing </div>\n</template> → </q-page>\n</template>
  // Find the LAST occurrence of </div>\n</template>
  const closingIdx = content.lastIndexOf('</div>\n</template>')
  if (closingIdx === -1) {
    console.warn(`⚠  ${file}: closing </div> not found, skipping close replacement.`)
  } else {
    content = content.substring(0, closingIdx) + '</q-page>\n</template>' + content.substring(closingIdx + '</div>\n</template>'.length)
  }

  // 3. Add ERPToolbar import after the first import line in <script setup>
  if (!content.includes(TOOLBAR_IMPORT)) {
    content = content.replace(
      /(<script setup>[\s\S]*?)(import \{)/,
      (m, scriptTag, importKw) => `${scriptTag}${TOOLBAR_IMPORT}\n${importKw}`
    )
  }

  writeFileSync(path, content, 'utf8')
  console.log(`✅ Fixed ${file}`)
}

console.log('\n🎉 Done! All HR pages wrapped with <q-page>.')
