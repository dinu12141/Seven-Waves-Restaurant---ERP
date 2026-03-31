const fs = require('fs');

let content = fs.readFileSync('src/pages/reports/ElectronicJournal.vue', 'utf8');

// 1. the q-td replacement
const qtdTarget = `<q-td key="pos" :props="props">{{ props.row.pos }}</q-td>
            <q-td key="clerk" :props="props">{{ props.row.clerk }}</q-td>
            <q-td key="waiter" :props="props">{{ props.row.waiter }}</q-td>
            <q-td key="kot_no" :props="props">{{ props.row.kot_no }}</q-td>
            <q-td key="cust" :props="props">{{ props.row.cust }}</q-td>
            <q-td key="item_code" :props="props" class="sap-table__td--mono">{{
              props.row.item_code
            }}</q-td>
            <q-td key="dept" :props="props">{{ props.row.dept }}</q-td>
            <q-td key="prod_ref" :props="props" class="sap-table__td--mono">{{
              props.row.prod_ref
            }}</q-td>
            <q-td key="description" :props="props">
              <span :class="props.row.__type === 'payment' ? 'text-weight-bold' : ''">{{
                props.row.description
              }}</span>
            </q-td>
            <q-td key="disc_amt" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.disc_amt)
            }}</q-td>
            <q-td key="tax_amt" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.tax_amt)
            }}</q-td>
            <q-td key="sales_price" :props="props" class="sap-table__td--num text-weight-bold">{{
              fmtN(props.row.sales_price)
            }}</q-td>
            <q-td key="qty" :props="props" class="sap-table__td--num">{{
              props.row.qty !== '' ? fmtQty(props.row.qty) : ''
            }}</q-td>
            <q-td key="time" :props="props">{{ props.row.time }}</q-td>
            <q-td key="type" :props="props">
              <span
                v-if="props.row.type"
                class="sap-type-badge"
                :class="\`sap-type-badge--\${(props.row.type || '').toLowerCase()}\`"
                >{{ props.row.type }}</span
              >
            </q-td>
            <q-td key="bill_ref" :props="props" class="sap-table__td--mono">{{
              props.row.bill_ref
            }}</q-td>`;

const qtdReplacement = `<q-td key="date" :props="props">{{ props.row.date }}</q-td>
            <q-td key="order_type" :props="props">
              <q-badge :color="String(props.row.order_type).includes('Dine') ? 'blue-8' : 'orange-8'" rounded class="q-px-sm" v-if="props.row.order_type">
                {{ props.row.order_type }}
              </q-badge>
            </q-td>
            <q-td key="time_in" :props="props">{{ props.row.time_in }}</q-td>
            <q-td key="pay_time" :props="props">{{ props.row.pay_time }}</q-td>
            <q-td key="waiter" :props="props">{{ props.row.waiter }}</q-td>
            <q-td key="cashier" :props="props">{{ props.row.cashier }}</q-td>
            <q-td key="item_code" :props="props" class="sap-table__td--mono">{{
              props.row.item_code
            }}</q-td>
            <q-td key="description" :props="props">
              <span :class="props.row.__type === 'payment' ? 'text-weight-bold' : ''">{{
                props.row.description
              }}</span>
            </q-td>
            <q-td key="qty" :props="props" class="sap-table__td--num">{{
              props.row.qty !== '' ? fmtQty(props.row.qty) : ''
            }}</q-td>
            <q-td key="disc_amt" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.disc_amt)
            }}</q-td>
            <q-td key="tax_amt" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.tax_amt)
            }}</q-td>
            <q-td key="sales_price" :props="props" class="sap-table__td--num text-weight-bold">{{
              fmtN(props.row.sales_price)
            }}</q-td>`;

// 2. columns array
const columnsTarget = `const columns = [
  {
    name: 'bill_no',
    label: 'Bill No',
    field: 'bill_no',
    align: 'left',
    sortable: true,
    style: 'width:70px',
  },
  { name: 'pos', label: 'POS', field: 'pos', align: 'center', style: 'width:35px' },
  { name: 'clerk', label: 'Clerk', field: 'clerk', align: 'left', style: 'width:50px' },
  { name: 'waiter', label: 'Waiter', field: 'waiter', align: 'left', style: 'width:50px' },
  { name: 'kot_no', label: 'Kot No', field: 'kot_no', align: 'left', style: 'width:50px' },
  { name: 'cust', label: 'Cust', field: 'cust', align: 'center', style: 'width:35px' },
  { name: 'item_code', label: 'Item Code', field: 'item_code', align: 'left', style: 'width:60px' },
  { name: 'dept', label: 'Dept', field: 'dept', align: 'left', style: 'width:50px' },
  { name: 'prod_ref', label: 'Prod.ref', field: 'prod_ref', align: 'left', style: 'width:40px' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'disc_amt', label: 'Disc Amt', field: 'disc_amt', align: 'right', style: 'width:70px' },
  { name: 'tax_amt', label: 'Tax Amt', field: 'tax_amt', align: 'right', style: 'width:70px' },
  {
    name: 'sales_price',
    label: 'Sales Price',
    field: 'sales_price',
    align: 'right',
    style: 'width:80px',
  },
  { name: 'qty', label: 'Qty', field: 'qty', align: 'right', style: 'width:35px' },
  { name: 'time', label: 'Time', field: 'time', align: 'center', style: 'width:70px' },
  { name: 'type', label: 'Type', field: 'type', align: 'center', style: 'width:35px' },
  { name: 'bill_ref', label: 'Bill Ref', field: 'bill_ref', align: 'left', style: 'width:70px' },
  { name: 'void_marked', label: 'V', field: 'void_marked', align: 'center', style: 'width:25px' },
]`;

const columnsReplacement = `const columns = [
  { name: 'bill_no', label: 'Bill No', field: 'bill_no', align: 'left', sortable: true, style: 'width:60px' },
  { name: 'date', label: 'Date', field: 'date', align: 'center', sortable: true, style: 'width:85px' },
  { name: 'order_type', label: 'Order Type', field: 'order_type', align: 'center', sortable: true, style: 'width:85px' },
  { name: 'time_in', label: 'Entry Time', field: 'time_in', align: 'center', style: 'width:75px' },
  { name: 'pay_time', label: 'Pay Time', field: 'pay_time', align: 'center', style: 'width:75px' },
  { name: 'waiter', label: 'Steward Name', field: 'waiter', align: 'left', style: 'width:120px' },
  { name: 'cashier', label: 'Cashier Name', field: 'cashier', align: 'left', style: 'width:120px' },
  { name: 'item_code', label: 'Item Code', field: 'item_code', align: 'left', style: 'width:70px' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'qty', label: 'Qty', field: 'qty', align: 'right', style: 'width:40px' },
  { name: 'disc_amt', label: 'Discount', field: 'disc_amt', align: 'right', style: 'width:70px' },
  { name: 'tax_amt', label: 'Tax', field: 'tax_amt', align: 'right', style: 'width:70px' },
  { name: 'sales_price', label: 'Sales Price', field: 'sales_price', align: 'right', style: 'width:85px' },
  { name: 'void_marked', label: 'Void', field: 'void_marked', align: 'center', style: 'width:35px' },
]`;

// 3. fetcher loop mapping
const mapTarget = `    const items = order.order_items || []
    const clerkCode = order.waiter?.id ? String(order.waiter.id).slice(-3) : '—'
    const waiterCode = clerkCode
    const kotNos = (order.kot_tickets || []).map((k) => k.kot_number).filter(Boolean)
    const isVoid = order.status === 'cancelled' || order.status === 'void'
    const orderTime = fmtTime(order.created_at)
    const custCount = order.guest_count || (order.customer_name ? 1 : 0)
    const orderDisc = Number(order.discount_amount || 0)
    const orderTax = Number(order.tax_amount || 0)
    const serviceChargeAmt = Number(order.service_charge_amount || 0)
    const orderTotal = items.reduce(
      (s, i) => s + Number(i.total_price || i.quantity * i.unit_price || 0),
      0,
    )
    const typeCode = orderTypeCode(order.order_type)

    let billSubDisc = 0
    let billSubTax = 0
    let billSubSales = 0
    let billSubQty = 0

    // ── Regular Item Rows (Type = S) ────────────────────────────
    items.forEach((item, idx) => {
      const itemTotal = Number(item.total_price || item.quantity * item.unit_price || 0)
      const ratio = orderTotal > 0 ? itemTotal / orderTotal : 0
      const itemDisc = orderDisc * ratio
      const itemTax = orderTax * ratio
      const kotNo = kotNos[idx] || kotNos[0] || ''
      const menuItem = item.menu_items || {}
      const catName = menuItem.categories?.name || ''
      const itemId = menuItem.id || item.menu_item_id || ''
      const shortCode = typeof itemId === 'string' ? itemId.slice(0, 6).toUpperCase() : ''
      const isItemVoid = isVoid || item.status === 'cancelled' || item.status === 'void'
      const qty = Number(item.quantity || 0)

      billSubDisc += itemDisc
      billSubTax += itemTax
      billSubSales += itemTotal
      billSubQty += qty

      result.push({
        __type: 'item',
        __rowKey: \`\${order.id}-\${idx}\`,
        __billSeq: billSeq,
        bill_no: idx === 0 ? billSeq : '',
        pos: idx === 0 ? '1' : '',
        clerk: idx === 0 ? clerkCode : '',
        waiter: idx === 0 ? waiterCode : '',
        kot_no: kotNo,
        cust: idx === 0 ? String(custCount) : '',
        item_code: shortCode,
        dept: catName,
        prod_ref: shortCode.slice(0, 4),
        description: menuItem.name || 'Item',
        disc_amt: itemDisc,
        tax_amt: itemTax,
        sales_price: itemTotal,
        qty,
        time: orderTime,
        type: 'S',
        bill_ref: typeCode,
        void_marked: isItemVoid ? 'V' : '',`;

const mapReplacement = `    const items = order.order_items || []
    const isVoid = order.status === 'cancelled' || order.status === 'void'
    const orderTimeIn = fmtTime(order.created_at)
    const paymentTime = extractPaymentTime(order) || orderTimeIn
    
    // Steward & Cashier Names
    const stewardName = order.waiter?.full_name || order.waiter_id?.slice(-4) || '—'
    const cashierName = order.cashier?.full_name || order.cashier_id?.slice(-4) || '—'
    
    // Formatting Order type
    const orderTypeFormat = order.order_type ? order.order_type.charAt(0).toUpperCase() + order.order_type.slice(1).replace('_', '-') : 'Dine-In'
    
    const orderDisc = Number(order.discount_amount || 0)
    const orderTax = Number(order.tax_amount || 0)
    const serviceChargeAmt = Number(order.service_charge_amount || 0)
    const orderTotal = items.reduce((s, i) => s + Number(i.total_price || i.quantity * i.unit_price || 0), 0)

    let billSubDisc = 0
    let billSubTax = 0
    let billSubSales = 0
    let billSubQty = 0

    // ── Regular Item Rows (Type = S) ────────────────────────────
    items.forEach((item, idx) => {
      const itemTotal = Number(item.total_price || item.quantity * item.unit_price || 0)
      const ratio = orderTotal > 0 ? itemTotal / orderTotal : 0
      const itemDisc = orderDisc * ratio
      const itemTax = orderTax * ratio
      const menuItem = item.menu_items || {}
      const itemId = menuItem.id || item.menu_item_id || ''
      const shortCode = typeof itemId === 'string' ? itemId.slice(0, 6).toUpperCase() : ''
      const isItemVoid = isVoid || item.status === 'cancelled' || item.status === 'void'
      const qty = Number(item.quantity || 0)

      billSubDisc += itemDisc
      billSubTax += itemTax
      billSubSales += itemTotal
      billSubQty += qty

      result.push({
        __type: 'item',
        __rowKey: \`\${order.id}-\${idx}\`,
        __billSeq: billSeq,
        bill_no: idx === 0 ? billSeq : '',
        date: idx === 0 ? dateKey : '',
        time_in: idx === 0 ? orderTimeIn : '',
        pay_time: idx === 0 ? paymentTime : '',
        order_type: idx === 0 ? orderTypeFormat : '',
        waiter: idx === 0 ? stewardName : '',
        cashier: idx === 0 ? cashierName : '',
        item_code: shortCode,
        description: menuItem.name || 'Item',
        disc_amt: itemDisc,
        tax_amt: itemTax,
        sales_price: itemTotal,
        qty,
        void_marked: isItemVoid ? 'V' : '',`;

// 4. Missing fields for empty items & service charge
const emptyTarget = `        pos: '1',
        clerk: clerkCode,
        waiter: waiterCode,
        kot_no: '',
        cust: String(custCount),
        item_code: '',
        dept: '',
        prod_ref: '',
        description: '(No items)',
        disc_amt: 0,
        tax_amt: orderTax,
        sales_price: Number(order.total_amount || 0),
        qty: 0,
        time: orderTime,
        type: 'S',
        bill_ref: typeCode,
        void_marked: isVoid ? 'V' : '',`;

const emptyReplacement = `        date: dateKey,
        time_in: orderTimeIn,
        pay_time: paymentTime,
        order_type: orderTypeFormat,
        waiter: stewardName,
        cashier: cashierName,
        item_code: '',
        description: '(No items)',
        disc_amt: 0,
        tax_amt: orderTax,
        sales_price: Number(order.total_amount || 0),
        qty: 0,
        void_marked: isVoid ? 'V' : '',`;

const scTarget = `        pos: '',
        clerk: '',
        waiter: '',
        kot_no: '',
        cust: '0',
        item_code: 'Serv.',
        dept: 'SC',
        prod_ref: '',
        description: \`SCharge(\${scPct}%\`,
        disc_amt: 0,
        tax_amt: 0,
        sales_price: serviceChargeAmt,
        qty: '',
        time: orderTime,
        type: 'L',
        bill_ref: 'SC',
        void_marked: '',`;

const scReplacement = `        date: '',
        time_in: '',
        pay_time: '',
        order_type: '',
        waiter: '',
        cashier: '',
        item_code: 'Serv.',
        description: \`Service Charge (\${scPct}%)\`,
        disc_amt: 0,
        tax_amt: 0,
        sales_price: serviceChargeAmt,
        qty: '',
        void_marked: '',`;

const paymentTarget = `        pos: '',
        clerk: '',
        waiter: '',
        kot_no: '',
        cust: '0',
        item_code: paymentName,
        dept: '',
        prod_ref: '',
        description: paymentName,
        disc_amt: 0,
        tax_amt: 0,
        sales_price: paymentTotal,
        qty: '',
        time: paymentTime,
        type: 'P',
        bill_ref: 'MM',
        void_marked: '',`;
        
const paymentReplacement = `        date: '',
        time_in: '',
        pay_time: '',
        order_type: '',
        waiter: '',
        cashier: '',
        item_code: paymentName,
        description: paymentName,
        disc_amt: 0,
        tax_amt: 0,
        sales_price: paymentTotal,
        qty: '',
        void_marked: '',`;
        
// 5. Excel Columns config
const excelTarget = `  ws.columns = [
    { key: 'bill_no', width: 10 },
    { key: 'pos', width: 6 },
    { key: 'clerk', width: 14 },
    { key: 'waiter', width: 14 },
    { key: 'kot_no', width: 10 },
    { key: 'cust', width: 6 },
    { key: 'item_code', width: 14 },
    { key: 'dept', width: 12 },
    { key: 'prod_ref', width: 10 },
    { key: 'description', width: 28 },
    { key: 'disc_amt', width: 12 },
    { key: 'tax_amt', width: 12 },
    { key: 'sales_price', width: 14 },
    { key: 'qty', width: 7 },
    { key: 'time', width: 10 },
    { key: 'type', width: 7 },
    { key: 'bill_ref', width: 10 },
    { key: 'void_marked', width: 5 },
  ]`;

const excelReplacement = `  ws.columns = [
    { key: 'bill_no', width: 10 },
    { key: 'date', width: 12 },
    { key: 'order_type', width: 14 },
    { key: 'time_in', width: 12 },
    { key: 'pay_time', width: 12 },
    { key: 'waiter', width: 22 },
    { key: 'cashier', width: 22 },
    { key: 'item_code', width: 14 },
    { key: 'description', width: 33 },
    { key: 'qty', width: 8 },
    { key: 'disc_amt', width: 12 },
    { key: 'tax_amt', width: 12 },
    { key: 'sales_price', width: 14 },
    { key: 'void_marked', width: 8 },
  ]`;

// 6. SQL Query changes
const queryTarget = `        branch_id,
        waiter_id,
        waiter:profiles!orders_waiter_id_fkey ( full_name ),
        branches ( name ),`;

const queryReplacement = `        branch_id,
        waiter_id,
        cashier_id,
        waiter:profiles!orders_waiter_id_fkey ( full_name ),
        cashier:profiles!orders_cashier_id_fkey ( full_name ),
        branches ( name ),`;

// Do replacement
function tryReplace(target, repl, name) {
    if (content.includes(target)) {
        content = content.replace(target, repl);
        console.log("Replaced:", name);
    } else {
        console.log("NOT FOUND:", name);
    }
}

tryReplace(qtdTarget, qtdReplacement, 'q-tds');
tryReplace(columnsTarget, columnsReplacement, 'columns');
tryReplace(mapTarget, mapReplacement, 'mapper');
tryReplace(emptyTarget, emptyReplacement, 'emptyItems');
tryReplace(scTarget, scReplacement, 'scItem');
tryReplace(paymentTarget, paymentReplacement, 'paymentItem');
tryReplace(excelTarget, excelReplacement, 'excelCols');
tryReplace(queryTarget, queryReplacement, 'queryCols');

fs.writeFileSync('src/pages/reports/ElectronicJournal.vue', content, 'utf8');
console.log('ALL DONE');
