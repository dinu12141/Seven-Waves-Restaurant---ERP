const fs = require('fs');

const path = 'c:\\Users\\ROG STRIX\\Desktop\\Restaurant ERP new\\src\\components\\inventory\\MenuBookTab.vue';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove Price Dialog UI
content = content.replace(
/    <!-- Override Price Dialog -->[\s\S]*?<\/q-dialog>/g, 
''
);

// 2. Remove Override Price Button
content = content.replace(
/                  <q-btn\s+flat\s+dense\s+round\s+icon="attach_money"[\s\S]*?<\/q-btn>/g,
''
);

// 3. Remove Single Item and Batch Override Price Input Sections
content = content.replace(
/              <q-separator dark \/>\s+<q-card-section class="q-pa-md q-pt-sm">\s+<q-input\s+:dark="\$q\.dark\.isActive"\s+outlined\s+dense\s+v-model\.number="overridePrice"[\s\S]*?<\/q-input>\s+<\/q-card-section>/g,
''
);

// 4. Update the Price Display Column
const priceCellOld = `              <template #body-cell-price="props">
                <q-td :props="props">
                  <span class="text-weight-bold">
                    LKR
                    {{
                      Number(
                        props.row.override_price || props.row.menu_items?.base_price || 0,
                      ).toFixed(2)
                    }}
                  </span>
                  <q-badge
                    v-if="props.row.override_price"
                    color="amber-8"
                    text-color="white"
                    class="q-ml-xs"
                    label="Custom"
                  />
                </q-td>
              </template>`;
const priceCellNew = `              <template #body-cell-price="props">
                <q-td :props="props">
                  <span class="text-weight-bold">
                    LKR
                    {{
                      Number(
                        props.row.menu_items?.base_price || 0,
                      ).toFixed(2)
                    }}
                  </span>
                </q-td>
              </template>`;
content = content.replace(priceCellOld, priceCellNew);

// 5. Remove override_price from payload
content = content.replace(/      override_price: overridePrice.value \|\| null,\n/g, '');

// 6. Remove reactive state and functions for priceDialog
content = content.replace(/const priceDialog = reactive\(\{[\s\S]*?\}\)\n/g, '');
content = content.replace(/function editBookItem\(row\) \{[\s\S]*?\}\n/g, '');
content = content.replace(/async function savePriceOverride\(\) \{[\s\S]*?\}\n/g, '');

// 7. Remove overridePrice references
content = content.replace(/const overridePrice = ref\(null\)\n/g, '');
content = content.replace(/  overridePrice\.value = null\n/g, '');

fs.writeFileSync(path, content);
console.log('Removed Override Price UI successfully.');
