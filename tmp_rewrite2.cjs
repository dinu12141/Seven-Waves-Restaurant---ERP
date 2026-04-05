const fs = require('fs');

const posPagePath = 'src/pages/POSPage.vue';
const content = fs.readFileSync(posPagePath, 'utf8');

// Extract script
const scriptStartIdx = content.indexOf('<script setup>');
const scriptEndIdx = content.indexOf('</script>') + '</script>'.length;
const scriptContent = content.substring(scriptStartIdx, scriptEndIdx);

const newTemplate = `<template>
  <q-page class="pos-terminal classic-industrial">
    <!-- TOP STATUS BAR -->
    <div class="pos-top-bar-thin">
      <div class="top-title">SEVEN WAVES &bull; RestPOS v5.0.437 - R.D.07.27.24</div>
      <div class="top-cashier">{{ userName }}</div>
    </div>
    
    <div class="pos-top-bar-info">
      <!-- Left side: Customer/Credit Info -->
      <div class="info-section customer-info">
        <div class="info-row">
          <span class="lbl w-name">NEW</span>
          <span class="val txt-green">NEW</span>
        </div>
        <div class="info-row">
          <span class="lbl">Select By</span>
          <input v-model="store.customerName" class="classic-input flex-1" placeholder="Prate" />
        </div>
        <div class="info-row">
          <span class="lbl">Fre</span>
          <span class="lbl mx-2">Cust Bar</span>
          <span class="lbl ml-auto mr-2">Credit Limit</span>
          <span class="val txt-white">0</span>
        </div>
      </div>
      
      <!-- Middle side: Summary -->
      <div class="info-section summary-info">
        <div class="summary-line"><span class="slbl">sTotal</span><span class="sval">{{ fmtCurrency(store.subtotal) }}</span></div>
        <div class="summary-line"><span class="slbl">Discount</span><span class="sval">{{ fmtCurrency(store.discountAmount) }}</span></div>
        <div class="summary-line"><span class="slbl">sCharge</span><span class="sval">{{ fmtCurrency(store.serviceChargeAmount) }}</span></div>
        <div class="summary-line"><span class="slbl">DCharge</span><span class="sval">0.00</span></div>
        <div class="summary-line"><span class="slbl">TAX</span><span class="sval">{{ fmtCurrency(store.taxAmount) }}</span></div>
      </div>
      <div class="info-section summary-boxes">
        <div class="sum-box">
          <span class="box-lbl">Paid</span>
          <span class="box-val text-green">{{ fmtCurrency(paidAmount) }}</span>
        </div>
        <div class="sum-box">
          <span class="box-lbl">Balance</span>
          <span class="box-val text-green">{{ fmtCurrency(balanceAmount) }}</span>
        </div>
      </div>
      
      <!-- Right side: Total -->
      <div class="info-section total-info">
        <div class="total-label-top">Total</div>
        <div class="total-value-top text-green">{{ fmtCurrency(store.total) }}</div>
      </div>
    </div>

    <!-- MAIN BODY -->
    <div class="pos-body">
      <!-- LEFT: Receipt -->
      <div class="pos-panel pos-left-panel">
        <table class="classic-table">
          <thead>
            <tr>
              <th>NEW</th>
              <th>Amount</th>
              <th>Description</th>
              <th class="right">Qty</th>
              <th class="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, index) in store.cartItems"
              :key="item.id"
              :class="{ selected: selectedItemIndex === index }"
              @click="selectItem(index)"
            >
              <td></td>
              <td>{{ fmtCurrency(item.price) }}</td>
              <td>{{ item.name }}<span v-if="item.variant"> ({{ item.variant }})</span></td>
              <td class="right">{{ item.qty }}</td>
              <td class="right">{{ fmtCurrency(item.price * item.qty) }}</td>
            </tr>
            <tr v-for="n in emptyRows" :key="'empty-' + n">
              <td colspan="5">&nbsp;</td>
            </tr>
          </tbody>
        </table>
        
        <div class="search-bar-classic">
          <button class="arrow-btn" @click="scrollCategoriesUp">▲</button>
          <input v-model="itemSearchQuery" class="classic-input search-input" @keyup="onSearchInput" placeholder="Search..." />
          <button class="arrow-btn" @click="scrollCategoriesDown">▼</button>
          <button class="arrow-btn">&lt;&lt;</button>
        </div>
      </div>

      <!-- CENTER: Function Grid -->
      <div class="pos-panel pos-center-panel">
        <div class="center-top-grid">
          <!-- Categories Column -->
          <div class="categories-area">
            <button class="cbtn scroll-btn" @click="scrollCategoriesUp">▲</button>
            <div class="cat-grid">
              <template v-if="itemSearchQuery">
                <button
                  v-for="item in filteredSearchItems"
                  :key="'search-' + item.id"
                  class="cbtn c-yellow"
                  @click="handleSearchResultClick(item)"
                >
                  {{ item.name }}
                </button>
              </template>
              <template v-else>
                <button
                  v-for="cat in categories"
                  :key="cat.id"
                  class="cbtn c-yellow"
                  :class="{ 'border-active': selectedCategory === cat.name }"
                  @click="selectCategory(cat.name)"
                >
                  {{ cat.name }}
                </button>
              </template>
            </div>
            <button class="cbtn c-yellow full-w mt-auto">FUNCTION MENU</button>
            <button class="cbtn scroll-btn" @click="scrollCategoriesDown">▼</button>
          </div>
          
          <!-- Actions Grid -->
          <div class="actions-wrapper">
             <div class="actions-grid">
                <button class="abtn a-blue" @click="handleVoid">VOID</button>
                <button class="abtn a-blue" @click="handleClearOrder">Clear Order</button>
                <button class="abtn a-blue" @click="handleBack">Back</button>

                <button class="abtn a-blue" @click="handlePrint">PRINT</button>
                <button class="abtn a-blue" @click="handleOther">Other</button>
                <button class="abtn a-blue" @click="handleEdit">Edit</button>

                <button class="abtn a-blue" @click="setOrderType('dine-in')">Table Order</button>
                <button class="abtn a-blue" @click="handleModifier">Modifier</button>
                <button class="abtn a-blue" @click="handleDivider">Divider</button>

                <button class="abtn a-blue" @click="setOrderType('dine-in')">Table Order</button>
                <button class="abtn a-blue" @click="setOrderType('takeaway')">Take Away</button>
                <button class="abtn a-blue" @click="setOrderType('delivery')">Delivery</button>

                <button class="abtn a-blue" @click="handleNewOrder">Order</button>
                <button class="abtn a-blue" @click="handleOrderLookup">Order Lookup</button>
                <button class="abtn a-blue" @click="handleClear">Clear</button>
            </div>
            <div class="actions-bottom">
              <button class="abtn a-blue" @click="handleSave" style="flex:1;">SAVE</button>
              <button class="abtn a-blue" @click="handlePayment" style="flex:1;">PAYMENT</button>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT: Keypad -->
      <div class="pos-panel pos-right-panel">
        <div class="keypad-layout">
          <div class="keypad-grid">
            <button class="kbtn" @click="numInput('7')">7</button>
            <button class="kbtn" @click="numInput('8')">8</button>
            <button class="kbtn" @click="numInput('9')">9</button>
            <button class="kbtn" @click="numInput('4')">4</button>
            <button class="kbtn" @click="numInput('5')">5</button>
            <button class="kbtn" @click="numInput('6')">6</button>
            <button class="kbtn" @click="numInput('1')">1</button>
            <button class="kbtn" @click="numInput('2')">2</button>
            <button class="kbtn" @click="numInput('3')">3</button>
            <button class="kbtn" @click="numInput('0')">0</button>
            <button class="kbtn" @click="numInput('.')">●</button>
            <button class="kbtn" @click="numClear">x</button>
          </div>
          <button class="kbtn-enter mt-1" @click="numEnter">ENTER</button>
          <button class="kbtn-subtotal mt-1" @click="handleSubtotal">Subtotal</button>
        </div>
      </div>
    </div>

    <!-- BOTTOM SHORTCUTS & SIDEBAR -->
    <div class="pos-bottom-container">
      <div class="bottom-shortcuts-grid">
        <button
          v-for="(sub, idx) in subCategories"
          :key="sub.id || idx"
          class="sbtn"
          :class="{ active: selectedSubCategory === sub.name }"
          @click="selectSubCategory(sub)"
        >
          {{ sub.label }}
        </button>
        <button v-for="i in Math.max(0, 18 - subCategories.length)" :key="'empty-bottom-' + i" class="sbtn"></button>
      </div>

      <div class="bottom-sidebar">
        <button class="side-btn arrow-btn">▲</button>
        <button class="side-btn white-btn" @click="handleLogout">Log Out</button>
        <button class="side-btn red-btn" @click="handleLogout">Exit</button>
        <button class="side-btn arrow-btn">▼</button>
      </div>
    </div>

    <!-- DIALOGS AND OVERLAYS -->
    <q-dialog v-model="itemPickerOpen" position="bottom" maximized>
      <q-card class="item-picker-card" dark style="background: #111; color: #fff; border-radius: 0;">
        <q-card-section class="row items-center q-pb-sm">
          <q-icon name="restaurant_menu" color="yellow" size="20px" class="q-mr-sm" />
          <span class="text-subtitle1 text-yellow text-weight-bold" style="text-transform:uppercase;">
            {{ selectedSubCategoryLabel }}
          </span>
          <q-space />
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>
        <q-separator color="white" />
        <q-card-section class="item-picker-grid-section" style="background:#222;">
          <div class="item-picker-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 6px;">
            <button
              v-for="item in subCategoryItems"
              :key="item.id"
              class="cbtn c-yellow"
              style="height: 80px; display:flex; flex-direction:column; padding:4px;"
              @click="addItemToOrder(item)"
            >
              <div style="font-size:11px; font-weight:bold; flex:1;">{{ item.name }}</div>
              <div style="font-size:10px; color:#000;">LKR {{ item.price.toFixed(0) }}</div>
            </button>
          </div>
          <div v-if="subCategoryItems.length === 0" class="text-white text-center q-pa-xl">
            No items in this category
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-drawer v-model="queueDrawer" side="left" overlay behavior="mobile" :width="380">
      <BillingQueue @select="openBilling" @merge-table="openMergedBilling" />
    </q-drawer>

    <PaymentDialog
      ref="paymentDialogRef"
      v-model="paymentDialog"
      :total-amount="store.total"
      :subtotal-amount="store.subtotal"
      :discount-percent="store.discount"
      :discount-value="store.discountAmount"
      :tax-value="store.taxAmount"
      :service-charge="store.serviceChargeAmount"
      :item-count="store.itemCount"
      :order-type="store.orderType"
      :cart-items="store.cartItems"
      :customer-name="store.customerName"
      :order-number="store.orderNumber"
      :loading="isProcessingPayment"
      :queue-order="selectedQueueOrder"
      :merged-orders="mergedTableOrders"
      @confirm="handleConfirmPayment"
      @new-order="handleNewOrderAfterPayment"
      @paid="onOrderPaid"
    />
    <POSLockScreen
      v-model="posLocked"
      :previous-cashier="previousCashierName"
      @signed-in="onCashierSignedIn"
    />
  </q-page>
</template>
`;

const newStyle = `
<style scoped>
/* ══════════════════════════════════════════════════════════
   POS Terminal — Classic Industrial High Contrast Pattern
   ══════════════════════════════════════════════════════════ */
* {
  border-radius: 0 !important;
  box-shadow: none !important;
  text-shadow: none !important;
}

.classic-industrial {
  padding: 0;
  height: calc(100vh - 52px);
  max-height: calc(100vh - 52px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #111;
  font-family: 'Arial', sans-serif;
  user-select: none;
  border-top: 1px solid #ccc;
}

/* TOP BARS */
.pos-top-bar-thin {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #3b5998;
  padding: 2px 8px;
  color: #fff;
  font-size: 14px;
  font-weight: bold;
}
.top-cashier {
  text-transform: uppercase;
  color: #fff;
}

.pos-top-bar-info {
  display: flex;
  background: #000;
  color: #fff;
  border-bottom: 2px solid white;
  padding: 0;
  height: 90px;
}

.info-section {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #fff;
  padding: 4px 8px;
}
.info-section:last-child {
  border-right: none;
}
.customer-info {
  flex: 1;
  gap: 4px;
}
.info-row {
  display: flex;
  align-items: center;
  font-size: 12px;
}
.lbl {
  color: #ccc;
  width: 60px;
}
.w-name {
  width: 100px;
  font-size: 18px;
  color: #fff;
}
.val {
  color: #fff;
  font-weight: bold;
}
.txt-yellow { color: #ffff00; }
.txt-green { color: #00ff00; }
.txt-white { color: #ffffff; }
.mx-2 { margin-left: 8px; margin-right: 8px; }
.ml-auto { margin-left: auto; }
.mr-2 { margin-right: 8px; }

.classic-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid #fff;
  color: #fff;
  outline: none;
  font-size: 12px;
  padding: 0 4px;
}
.flex-1 { flex: 1; }

.summary-info {
  width: 300px;
  flex-direction: row;
  justify-content: space-between;
}
.summary-grid {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  font-size: 11px;
}
.summary-line {
  display: flex;
  justify-content: space-between;
  width: 120px;
}
.slbl { color: #aaa; text-transform: uppercase;}
.sval { color: #ff9900; font-weight: bold; text-align: right; width: 60px; }

.summary-boxes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  justify-content: center;
  width: 150px;
}
.sum-box {
  display: flex;
  justify-content: space-between;
  border: 1px solid #fff;
  padding: 4px 8px;
  align-items: center;
}
.box-lbl { font-size: 14px; font-weight: bold; color: #ff99cc; }
.box-val { font-size: 18px; font-weight: bold; }
.text-green { color: #00ff00; }

.total-info {
  align-items: flex-end;
  justify-content: flex-start;
  width: 180px;
  padding: 4px 20px;
}
.total-label-top {
  color: #ff3333;
  font-size: 24px;
  font-weight: bold;
}
.total-value-top {
  font-size: 32px;
  font-weight: bold;
  margin-top: -4px;
}

/* MAIN BODY */
.pos-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: #333;
}

.pos-panel {
  display: flex;
  flex-direction: column;
  padding: 4px;
}

/* LEFT */
.pos-left-panel {
  width: 400px;
  background: #222;
}
.classic-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  color: #000;
  flex: 1;
  overflow-y: auto;
  display: block;
}
.classic-table thead, .classic-table tbody tr {
  display: table;
  width: 100%;
  table-layout: fixed;
}
.classic-table th {
  background: #fff;
  border: 1px solid #000;
  font-size: 11px;
  padding: 4px;
  text-align: left;
  border-top: none;
  font-weight: bold;
}
.classic-table td {
  border: 1px solid #000;
  font-size: 11px;
  padding: 4px;
  background: #fff;
}
.classic-table .right { text-align: right; }
.classic-table tbody {
  display: block;
  overflow-y: auto;
  height: calc(100vh - 260px);
}
.classic-table tr.selected td {
  background: #ffff00;
}

.search-bar-classic {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.arrow-btn {
  background: #adc2e6;
  border: 1px solid #000;
  color: #000;
  font-weight: bold;
  padding: 4px 12px;
  cursor: pointer;
}
.search-input {
  background: #adc2e6;
  border: 1px solid #000;
  flex: 1;
  color: #000;
  font-weight: bold;
}
.search-input::placeholder { color: #444; }

/* CENTER */
.pos-center-panel {
  flex: 1;
  background: #333;
}
.center-top-grid {
  display: flex;
  height: 100%;
  gap: 4px;
}
.categories-area {
  display: flex;
  flex-direction: column;
  width: 180px;
  gap: 4px;
}
.cat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 40px;
  gap: 4px;
  flex: 1;
  overflow-y: auto;
}
.scroll-btn {
  height: 40px;
  background: #adc2e6;
  font-size: 16px;
}
.cbtn {
  border: 2px solid #000;
  font-weight: bold;
  font-size: 11px;
  cursor: pointer;
  text-align: center;
  padding: 4px;
  min-height: 40px;
}
.cbtn:active { filter: brightness(0.8); }
.border-active { border: 2px solid #fff; }
.c-yellow {
  background: #ffff00;
  color: #000;
}
.full-w { width: 100%; }

.actions-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.actions-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 4px;
  flex: 1;
}
.actions-bottom {
  display: flex;
  gap: 4px;
  height: 70px;
}
.abtn {
  border: 2px solid #000;
  font-weight: bold;
  font-size: 13px;
  cursor: pointer;
}
.abtn:active { filter: brightness(0.8); }
.a-blue {
  background: #3a62ae;
  color: #fff;
}

/* RIGHT */
.pos-right-panel {
  width: 240px;
  background: #2a2a2a;
  border-left: 1px solid #000;
}
.keypad-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.keypad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.kbtn {
  background: #fffa86;
  border: 2px solid #000;
  color: #000;
  font-weight: bold;
  font-size: 20px;
  height: 60px;
  cursor: pointer;
}
.kbtn:active { background: #e0db76; }
.kbtn-enter {
  background: #ffff00;
  border: 2px solid #000;
  color: #000;
  font-weight: bold;
  font-size: 18px;
  height: 65px;
  cursor: pointer;
  margin-top: 4px;
}
.kbtn-enter:active { background: #e6e600; }
.kbtn-subtotal {
  background: #adc2e6;
  border: 2px solid #000;
  color: #000;
  font-weight: bold;
  font-size: 16px;
  height: 50px;
  cursor: pointer;
  margin-top: auto;
}

/* BOTTOM AREA */
.pos-bottom-container {
  display: flex;
  background: #000;
  padding: 4px;
  gap: 4px;
  height: 140px;
  border-top: 2px solid #fff;
}

.bottom-shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
  flex: 1;
}

.sbtn {
  background: #ffff00;
  border: 1px solid #000;
  color: #000;
  font-size: 11px;
  font-weight: bold;
  cursor: pointer;
}
.sbtn.active {
  border: 2px solid #fff;
}

.bottom-sidebar {
  display: flex;
  flex-direction: column;
  width: 80px;
  gap: 4px;
}
.side-btn {
  flex: 1;
  border: 1px solid #000;
  font-weight: bold;
  font-size: 12px;
  cursor: pointer;
}
.white-btn { background: #fff; color: #000; }
.red-btn { background: #cc0000; color: #fff; }

.mt-1 { margin-top: 4px; }
.mt-auto { margin-top: auto; }
</style>
`;

const finalFileContent = newTemplate + "\n" + scriptContent + "\n" + newStyle;

fs.writeFileSync(posPagePath, finalFileContent);
console.log('Successfully updated POSPage.vue!');
