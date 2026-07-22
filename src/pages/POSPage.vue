<template>
  <q-page class="pos-terminal classic-industrial">
    <!-- TOP STATUS BAR -->
    <div class="pos-top-bar-thin">
      <div class="top-title">{{ branchName }} &bull; EchoMePOS v5.0.437 - R.D.07.27.24</div>
      <ShiftStatusIndicator />
      <div class="top-cashier">{{ userName }}</div>
    </div>
    
    <div class="pos-top-bar-info">
      <!-- Left side: Customer/Credit Info -->
      <div class="info-section customer-info">
        <div class="info-row">
          <span class="lbl">ORDER STATUS</span>
          <span class="val order-status-val" :class="selectedQueueOrder ? 'txt-yellow' : 'txt-green'">
            {{ selectedQueueOrder ? `#${String(selectedQueueOrder.order_number || '').replace('ORD-', '')} - ${(selectedQueueOrder.status || 'LOADED').toUpperCase()}` : 'NEW ORDER' }}
          </span>
        </div>
        <div class="info-row" style="position: relative;">
          <span class="lbl">CUSTOMER</span>
          <input 
            v-model="customerSearchText" 
            @input="onCustomerInput" 
            @focus="showCustomerDropdown = true" 
            @blur="hideCustomerDropdownDelay"
            class="classic-input flex-1 customer-input" 
            placeholder="Search name / phone / ID no..." 
            autocomplete="off"
          />
          <!-- Enhanced Autocomplete Dropdown -->
          <ul v-show="showCustomerDropdown && (customerOptions.length > 0 || customerSearchText.length >= 2)" class="autocomplete-list">
            <li v-for="c in customerOptions" :key="c.id" @mousedown.prevent="selectCustomer(c)" class="customer-result-row">
              <div class="cr-left">
                <span class="cr-name">{{ c.full_name }}</span>
                <span class="cr-details">
                  <span v-if="c.phone">📞 {{ c.phone }}</span>
                  <span v-if="c.national_id"> · 🆔 {{ c.national_id }}</span>
                </span>
              </div>
              <div class="cr-right">
                <span class="cr-coins" :style="{ color: c.tier_color || '#9ca3af' }">
                  🪙 {{ c.loyalty_coins ?? 0 }}
                </span>
                <span class="cr-tier" :style="{ background: c.tier_color || '#9ca3af' }">
                  {{ c.tier_name || 'Standard' }}
                </span>
              </div>
            </li>
            <!-- Add New Customer option -->
            <li v-if="customerSearchText.length >= 2" @mousedown.prevent="openNewCustomerDialog" class="customer-add-row">
              <span class="cr-add-icon">➕</span>
              <span class="cr-add-text">Add New Customer "{{ customerSearchText }}"</span>
            </li>
          </ul>
        </div>
        <div class="info-row">
          <div class="flex-row-half" style="display: flex; align-items: center; gap: 6px;">
            <span class="lbl">LOYALTY PTS</span>
            <span class="val txt-white">{{ store.selectedCustomer ? (store.selectedCustomer.loyalty_coins ?? store.selectedCustomer.points_balance ?? 0) : 0 }}</span>
            <button 
              v-if="store.selectedCustomer && (store.selectedCustomer.loyalty_coins || store.selectedCustomer.points_balance) > 0"
              class="btn-redeem"
              @click="openRedeemDialog"
              title="Redeem loyalty coins as discount"
            >REDEEM</button>
          </div>
          <div class="flex-row-half text-right">
            <span class="lbl mr-2">CREDIT LIMIT</span>
            <span class="val txt-white border-val">LKR {{ store.selectedCustomer?.credit_limit ? store.selectedCustomer.credit_limit.toFixed(2) : '0.00' }}</span>
          </div>
        </div>

      </div>
      
      <!-- Middle side: Summary -->
      <div class="info-section summary-info">
        <div class="summary-line"><span class="slbl">Sub Total</span><span class="sval">{{ fmtCurrency(store.subtotal) }}</span></div>
        <div class="summary-line"><span class="slbl">Discount</span><span class="sval txt-red">-{{ fmtCurrency(store.discountAmount) }}</span></div>
        <div class="summary-line"><span class="slbl">S. Charge</span><span class="sval">{{ fmtCurrency(store.serviceChargeAmount) }}</span></div>
        <div class="summary-line">
          <span class="slbl">D. Charge</span>
          <input
            v-model.number="store.deliveryCharge"
            type="number"
            min="0"
            step="0.01"
            class="sval delivery-charge-input"
            placeholder="0.00"
          />
        </div>
        <div class="summary-line"><span class="slbl">Tax</span><span class="sval">{{ fmtCurrency(store.taxAmount) }}</span></div>
      </div>
      <div class="info-section summary-boxes">
        <div class="sum-box">
          <span class="box-lbl">Paid</span>
          <span class="box-val text-green">{{ isPaymentMode ? fmtCurrency(paymentAmount) : '0.00' }}</span>
        </div>
        <div class="sum-box">
          <span class="box-lbl">{{ isPaymentMode && paymentAmount > store.total ? 'Change' : 'Balance' }}</span>
          <span class="box-val text-green">{{ isPaymentMode ? fmtCurrency(Math.abs(store.total - paymentAmount)) : fmtCurrency(store.total) }}</span>
        </div>
      </div>
      
      <!-- Right side: Total -->
      <div class="info-section total-info">
        <div class="total-label-top">Total</div>
        <div class="total-value-top text-green">{{ fmtCurrency(store.total) }}</div>
      </div>
    </div>

    <!-- MAIN BODY -->
    <div class="pos-body" style="position: relative;">
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
          <tbody ref="receiptTableRef">
            <tr
              v-for="(item, index) in store.cartItems"
              :key="item.id"
              :class="{ selected: selectedItemIndex === index }"
              @click="selectItem(index)"
            >
              <td></td>
              <td>{{ fmtCurrency(item.price) }}</td>
              <td>{{ item.name }}<span v-if="item.variant"> ({{ item.variant }})</span></td>
              <td class="right">
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                  <button @click.stop="store.updateQuantity(index, item.qty - 1)" style="width:24px; height:24px; border:1px solid #444; background:#ccc; color:#000; cursor:pointer; font-weight:bold; padding:0; display:flex; align-items:center; justify-content:center; border-radius:3px !important; font-size:16px;">-</button>
                  <span style="font-size: 14px; font-weight: bold; width: 24px; text-align: center;">{{ item.qty }}</span>
                  <button @click.stop="store.updateQuantity(index, item.qty + 1)" style="width:24px; height:24px; border:1px solid #444; background:#ff9900; color:#000; cursor:pointer; font-weight:bold; padding:0; display:flex; align-items:center; justify-content:center; border-radius:3px !important; font-size:16px;">+</button>
                </div>
              </td>
              <td class="right">{{ fmtCurrency(item.price * item.qty) }}</td>
            </tr>
            <tr v-for="n in emptyRows" :key="'empty-' + n">
              <td colspan="5">&nbsp;</td>
            </tr>
          </tbody>
        </table>
        
        <div class="search-bar-classic">
          <button class="arrow-btn" @click="scrollReceiptUp" :disabled="isPaymentMode">▲</button>
          
          <template v-if="!isPaymentMode">
            <input v-model="itemSearchQuery" class="classic-input search-input" @keyup="onSearchInput" placeholder="Search..." />
          </template>
          <template v-else>
            <div class="classic-input search-input" style="display:flex; justify-content:space-between; align-items:center; background:#111; color:#fff; border: 2px solid #555; padding: 0 10px;">
              <span style="font-size:10px; color:#aaa; font-weight: bold; text-transform: uppercase;">Amount Recvd</span>
              <input 
                type="text" 
                v-model="numBuffer" 
                @input="showQuickCash = false"
                style="background: transparent; border: none; color: #ffeb3b; font-weight: bold; font-size: 16px; text-align: right; width: 100%; outline: none;" 
                placeholder="0.00" 
              />
            </div>
          </template>

          <button class="arrow-btn" @click="scrollReceiptDown" :disabled="isPaymentMode">▼</button>
          <button class="arrow-btn" :disabled="isPaymentMode">&lt;&lt;</button>
        </div>
      </div>

      <!-- CENTER: Function Grid -->
      <div class="pos-panel pos-center-panel">
        <div class="center-top-grid">
          <!-- Categories Column -->
          <div class="categories-area">
            <template v-if="!isPaymentMode">
              <button class="cbtn scroll-btn" @click="scrollCategoriesUp">▲</button>
              <div class="cat-grid" ref="categoryGridRef">
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
              <button class="cbtn c-yellow full-w mt-auto" @click="toggleFunctionMenu">FUNCTION MENU</button>
              <button class="cbtn scroll-btn" @click="scrollCategoriesDown">▼</button>
            </template>
            <template v-else>
              <div style="background: var(--yellow); padding: 12px; color: #000; font-weight: 800; text-align: center; font-size: 14px; text-transform: uppercase;">Payment Method</div>
              <div class="cat-grid" style="grid-template-columns: 1fr; margin-top: 10px; gap: 10px;">
                <!-- CASH -->
                <button
                  class="cbtn c-yellow"
                  :class="{ 'payment-active': selectedPaymentMethod === 'CASH' }"
                  @click="selectPaymentGroup('CASH')"
                  style="font-size: 16px; font-weight: bold; padding: 15px 0; border-width: 3px;"
                >CASH</button>

                <!-- CARD + sub-options -->
                <button
                  class="cbtn c-yellow"
                  :class="{ 'payment-active': selectedPaymentMethod === 'CARD' }"
                  @click="selectPaymentGroup('CARD')"
                  style="font-size: 16px; font-weight: bold; padding: 15px 0; border-width: 3px;"
                >CARD</button>
                <div v-if="selectedPaymentMethod === 'CARD'" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: -4px;">
                  <button
                    class="cbtn"
                    :class="{ 'payment-active': selectedCardType === 'MASTER' }"
                    @click="selectedCardType = 'MASTER'"
                    style="font-size: 13px; font-weight: 700; padding: 10px 0; background: #1a237e; color: #fff; border: 2px solid transparent;"
                    :style="selectedCardType === 'MASTER' ? 'border-color: #ffeb3b;' : ''"
                  >MASTER</button>
                  <button
                    class="cbtn"
                    :class="{ 'payment-active': selectedCardType === 'VISA' }"
                    @click="selectedCardType = 'VISA'"
                    style="font-size: 13px; font-weight: 700; padding: 10px 0; background: #1565c0; color: #fff; border: 2px solid transparent;"
                    :style="selectedCardType === 'VISA' ? 'border-color: #ffeb3b;' : ''"
                  >VISA</button>
                </div>

                <!-- OTHER + sub-options -->
                <button
                  class="cbtn c-yellow"
                  :class="{ 'payment-active': selectedPaymentMethod === 'OTHER' }"
                  @click="selectPaymentGroup('OTHER')"
                  style="font-size: 16px; font-weight: bold; padding: 15px 0; border-width: 3px;"
                >OTHER</button>
                <div v-if="selectedPaymentMethod === 'OTHER'" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: -4px;">
                  <button
                    class="cbtn"
                    :class="{ 'payment-active': selectedOtherType === 'UBER' }"
                    @click="selectedOtherType = 'UBER'"
                    style="font-size: 12px; font-weight: 700; padding: 10px 0; background: #1b5e20; color: #fff; border: 2px solid transparent;"
                    :style="selectedOtherType === 'UBER' ? 'border-color: #ffeb3b;' : ''"
                  >UBER</button>
                  <button
                    class="cbtn"
                    :class="{ 'payment-active': selectedOtherType === 'PICKME' }"
                    @click="selectedOtherType = 'PICKME'"
                    style="font-size: 12px; font-weight: 700; padding: 10px 0; background: #b71c1c; color: #fff; border: 2px solid transparent;"
                    :style="selectedOtherType === 'PICKME' ? 'border-color: #ffeb3b;' : ''"
                  >PICKME</button>
                  <button
                    class="cbtn"
                    :class="{ 'payment-active': selectedOtherType === 'WEBSITE' }"
                    @click="selectedOtherType = 'WEBSITE'"
                    style="font-size: 12px; font-weight: 700; padding: 10px 0; background: #006064; color: #fff; border: 2px solid transparent;"
                    :style="selectedOtherType === 'WEBSITE' ? 'border-color: #ffeb3b;' : ''"
                  >WEBSITE</button>
                </div>
              </div>
              
              <!-- Quick Cash Buttons -->
              <div v-if="selectedPaymentMethod === 'CASH' && quickCashOptions.length > 0 && showQuickCash" style="margin-top: 15px;">
                <div style="font-size:10px; color:#aaa; margin-bottom: 8px; text-align: center; text-transform: uppercase;">Quick Cash Options</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  <button 
                    v-for="amt in quickCashOptions" 
                    :key="amt"
                    class="cbtn c-yellow" 
                    @click="numBuffer = amt.toString(); showQuickCash = false"
                    style="font-size: 15px; font-weight: bold; padding: 10px 0; background: #333; color: #ffeb3b;"
                  >
                    {{ amt.toFixed(2) }}
                  </button>
                </div>
              </div>

              <button class="cbtn scroll-btn mt-auto" style="background:#d32f2f; color:#fff;" @click="cancelPaymentMode">CANCEL</button>
            </template>
          </div>
          
          <!-- Actions Grid -->
          <div class="actions-wrapper">
             <div class="actions-grid">
                <button class="abtn a-blue" @click="handleVoid">VOID</button>
                <button class="abtn a-blue" @click="handleFOC">FOC</button>
                <button class="abtn a-blue" @click="handleBack">Back</button>

                <button class="abtn a-blue" @click="handlePrint">PRINT</button>
                <button class="abtn a-blue" @click="handleOther">Other</button>
                <button class="abtn a-blue" @click="handleEdit">Edit</button>

                <button 
                  class="abtn a-blue" 
                  @click="openLiveTable"
                >Live Table</button>
                <button class="abtn a-blue" @click="handleModifier">Modifier</button>
                <button class="abtn a-blue" @click="handleDivider">Divider</button>

                <button 
                  class="abtn a-blue" 
                  :class="{ 'type-active': store.orderType === 'dine-in' }"
                  @click="setOrderType('dine-in')"
                >Table Order</button>
                <button 
                  class="abtn a-blue" 
                  :class="{ 'type-active': store.orderType === 'takeaway' }"
                  @click="setOrderType('takeaway')"
                >Take Away</button>
                <button 
                  class="abtn a-blue" 
                  :class="{ 'type-active': store.orderType === 'delivery' }"
                  @click="setOrderType('delivery')"
                >Delivery</button>

                <!-- Delivery Source Options -->
                <template v-if="store.orderType === 'delivery'">
                  <button 
                    class="abtn a-green" 
                    :class="{ 'type-active': store.deliverySource === 'uber' }"
                    @click="setDeliverySource('uber')"
                  >UBER</button>
                  <button 
                    class="abtn a-green" 
                    :class="{ 'type-active': store.deliverySource === 'pickme' }"
                    @click="setDeliverySource('pickme')"
                  >PICKME</button>
                  <button 
                    class="abtn a-green" 
                    :class="{ 'type-active': store.deliverySource === 'website' }"
                    @click="setDeliverySource('website')"
                  >WEBSITE</button>
                </template>

                <button class="abtn a-blue" @click="handleNewOrder">Order</button>
                <button class="abtn a-blue" @click="handleOrderLookup">Order Lookup</button>
                <button class="abtn a-blue" @click="handleClear">Clear</button>
            </div>
            <div class="actions-bottom">
              <button class="abtn a-blue" @click="handleSave" style="flex:1;">SAVE</button>
              <button
                class="abtn a-blue"
                :class="{ 'dimmed-action': isAlreadyPaid }"
                :disabled="isAlreadyPaid"
                @click="handlePayment"
                style="flex:1;"
              >PAYMENT</button>
              <button
                class="abtn a-purple"
                :class="{ 'dimmed-action': isAlreadyPaid }"
                :disabled="isAlreadyPaid"
                @click="handleSplitPayment"
                style="flex:1;"
              >SPLIT</button>
            </div>
            <div class="actions-bottom" style="height: 44px;">
              <button class="abtn a-orange" @click="handleParkOrder" style="flex:1;">⏸ PARK ORDER</button>
              <button class="abtn a-teal" @click="handleRecallOrder" style="flex:1;">▶ RECALL</button>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT: Keypad -->
      <div class="pos-panel pos-right-panel">
        <div class="keypad-layout">
          <div class="keypad-display">
             <span class="display-label">INPUT</span>
             <span class="display-value" :class="{ 'has-val': numBuffer }">{{ numBuffer || '_' }}</span>
          </div>
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
      <div class="bottom-shortcuts-grid" ref="shortcutsGridRef">
        <template v-if="!store.isEmpty && store.orderType === 'dine-in'">
          <div v-for="table in restaurantTables" :key="table.id" style="position: relative; display: flex;">
            <button
              class="sbtn text-bold"
              :class="{ 
                'active-table': store.selectedTable === table.id,
                'locked-table': lockedTables.has(table.id) && store.selectedTable !== table.id
              }"
              @click="handleTableClick(table)"
              style="width: 100%; margin: 0;"
            >
              {{ table.table_number }}
            </button>
            <button
              v-if="lockedTables.has(table.id) && store.selectedTable !== table.id"
              @click.stop="store.selectedTable = table.id; store.tableNumber = table.table_number"
              title="Add another order to this table"
              style="position: absolute; top: -5px; right: -5px; background: #4caf50; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 2;"
            >
              +
            </button>
          </div>
        </template>
        <template v-else>
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
        </template>
      </div>

      <div class="bottom-sidebar">
        <button class="side-btn arrow-btn" @click="scrollShortcutsUp">▲</button>
        <button class="side-btn white-btn" @click="handleLogout">Log Out</button>
        <button class="side-btn red-btn" @click="handleExit">Exit</button>
        <button class="side-btn arrow-btn" @click="scrollShortcutsDown">▼</button>
      </div>
    </div>

    <!-- DIALOGS AND OVERLAYS -->
    <q-dialog 
      v-model="itemPickerOpen" 
      position="right" 
      transition-show="slide-left" 
      transition-hide="slide-right"
    >
      <q-card 
        class="item-picker-card" 
        dark 
        style="width: calc(100vw - 400px); max-width: 100vw; height: 100vh; background: #111; color: #fff; border-radius: 0; display: flex; flex-direction: column;"
      >
        <q-card-section class="row items-center q-pb-xs" style="background: #111;">
          <q-icon name="restaurant_menu" color="yellow" size="20px" class="q-mr-sm" />
          <span class="text-subtitle1 text-yellow text-weight-bold" style="text-transform:uppercase;">
            {{ selectedSubCategoryLabel }}
          </span>
          <q-space />
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>
        
        <q-card-section class="q-pt-none q-pb-sm" style="background: #111;">
          <q-input 
            v-model="dialogSearchQuery" 
            dense 
            outlined 
            dark 
            placeholder="Search items..." 
            class="full-width" 
            bg-color="grey-9"
          >
            <template v-slot:append>
              <q-icon name="search" color="white" />
              <q-icon v-if="dialogSearchQuery" name="cancel" @click.stop="dialogSearchQuery = ''" class="cursor-pointer" color="white" />
            </template>
          </q-input>
        </q-card-section>
        
        <q-separator color="white" />
        <q-card-section class="item-picker-grid-section" style="background:#222; flex: 1; overflow-y: auto;">
          <div class="item-picker-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 6px;">
            <button
              v-for="item in subCategoryItems"
              :key="item.id"
              class="pos-item-btn"
              @click="addItemToOrder(item)"
            >
              <div class="item-img-wrapper">
                <img v-if="item.image" :src="item.image" loading="lazy" />
                <q-icon v-else name="restaurant" class="fallback-icon" />
              </div>
              <div class="item-info">
                <div class="item-name">{{ item.name }}</div>
                <div class="item-price">LKR {{ item.price.toFixed(0) }}</div>
              </div>
            </button>
          </div>
          <div v-if="subCategoryItems.length === 0" class="text-white text-center q-pa-xl">
            No items in this category
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <OrderLookupDialog
      v-model="queueDrawer"
      @select="openBilling"
    />

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
      :order-number="String(store.orderNumber)"
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

    <!-- Hidden print template for direct PRINT button -->
    <div style="position: absolute; left: -9999px; top: -9999px;">
      <BillPrintTemplate
        v-if="directPrintInvoice"
        ref="directPrintRef"
        :invoice="directPrintInvoice"
        :branch-name="authStore.currentBranch?.name || 'Restaurant'"
        :cashier-name="authStore.profile?.full_name || 'Cashier'"
      />
    </div>

    <!-- Live Table Chart Dialog -->
    <q-dialog v-model="showLiveTable" transition-show="scale" transition-hide="scale">
      <q-card class="bg-blue-grey-1 text-dark" style="width: 620px; max-width: 95vw; max-height: 85vh; border-radius: 12px;">
        <!-- Header -->
        <q-card-section class="row items-center q-py-sm q-px-md bg-white" style="border-bottom: 1px solid #e0e0e0;">
          <q-icon name="grid_view" size="20px" color="primary" class="q-mr-xs" />
          <div class="text-subtitle1 text-weight-bolder">Live Table Chart</div>
          <q-space />

          <div class="row q-gutter-x-md q-mr-sm items-center">
            <div class="row items-center q-gutter-x-xs">
              <div class="bg-positive" style="width: 10px; height: 10px; border-radius: 3px"></div>
              <span style="font-size: 10px; font-weight: 600;">Available</span>
            </div>
            <div class="row items-center q-gutter-x-xs">
              <div class="bg-orange" style="width: 10px; height: 10px; border-radius: 3px"></div>
              <span style="font-size: 10px; font-weight: 600;">Occupied</span>
            </div>
          </div>

          <q-btn flat round dense icon="close" size="sm" v-close-popup />
        </q-card-section>

        <!-- Body -->
        <q-card-section class="q-pa-sm" style="overflow-y: auto; max-height: calc(85vh - 50px);">
          <div style="display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; padding: 4px;">
            <div v-for="table in liveTablesList" :key="table.id">
              <div
                class="pos-floor-plan-box shadow-1 cursor-pointer transition-transform"
                :class="table.status === 'available' ? 'bg-positive text-white' : 'bg-orange text-white'"
                @click="selectLiveTable(table)"
              >
                <div class="text-center">
                  <div class="text-weight-bolder" style="font-size: 11px; line-height: 1">
                    {{ (table.table_number || '').replace('Table', '').trim() }}
                  </div>
                  <div class="row items-center justify-center" style="font-size: 7px; opacity: 0.85; margin-top: 2px;">
                    <q-icon name="people" size="7px" class="q-mr-xs" /> {{ table.capacity }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- ═══ SHIFT MANAGEMENT DIALOGS ═══ -->
    <OpenShiftDialog
      v-model="showOpenShiftDialog"
      :force-open="forceOpenShift"
      @opened="onShiftOpened"
    />
    <FunctionMenuDialog
      v-model="showFunctionMenu"
      @action="handleFunctionMenuAction"
    />
    <CashMovementDialog
      v-model="showCashMovement"
      :movement-type="cashMovementType"
    />
    <ShiftSummaryDialog v-model="showShiftSummary" />
    <CloseShiftDialog
      v-model="showCloseShift"
      @closed="onShiftClosed"
    />
    <!-- ═══ NEW CUSTOMER DIALOG ═══ -->
    <q-dialog v-model="showNewCustomerDialog" persistent>
      <q-card class="pos-dark-dialog" style="min-width: 420px;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6" style="color: #4ade80; font-weight: 700;">➕ Add New Customer</div>
          <q-space />
          <q-btn icon="close" flat round dense @click="showNewCustomerDialog = false" style="color: #888;" />
        </q-card-section>
        <q-card-section class="q-pt-md">
          <q-input 
            v-model="newCustName" 
            label="Full Name *" 
            dark filled dense 
            class="q-mb-md"
            label-color="green-4"
            input-class="text-white"
            :rules="[v => !!v || 'Name is required']"
          />
          <q-input 
            v-model="newCustPhone" 
            label="Phone Number *" 
            dark filled dense 
            class="q-mb-md"
            label-color="green-4"
            input-class="text-white"
            mask="### ### ####"
            :rules="[v => !!v || 'Phone is required']"
          />
          <q-input 
            v-model="newCustNationalId" 
            label="National ID (optional)" 
            dark filled dense 
            class="q-mb-md"
            label-color="grey-6"
            input-class="text-white"
          />
          <q-input 
            v-model="newCustEmail" 
            label="Email (optional)" 
            dark filled dense 
            type="email"
            label-color="grey-6"
            input-class="text-white"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Cancel" style="color: #888;" @click="showNewCustomerDialog = false" />
          <q-btn 
            label="Add Customer" 
            unelevated
            style="background: #4ade80; color: #000; font-weight: 700;"
            :loading="isAddingCustomer" 
            @click="addNewCustomer" 
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ═══ REDEEM LOYALTY DIALOG ═══ -->
    <q-dialog v-model="showRedeemDialog">
      <q-card class="pos-dark-dialog" style="min-width: 400px;">
        <q-card-section class="q-pb-none">
          <div class="text-h6" style="color: #f59e0b; font-weight: 700;">🪙 Redeem Loyalty Coins</div>
          <div class="q-mt-xs" style="font-size: 12px; color: #888;">
            {{ store.selectedCustomer?.full_name }} — Available: <strong style="color: #4ade80;">{{ availableLoyaltyCoins }}</strong> coins
          </div>
        </q-card-section>
        <q-card-section class="q-pt-md">
          <q-input 
            v-model.number="redeemCoinsInput" 
            label="Coins to Redeem" 
            dark filled dense type="number" 
            label-color="amber-4"
            input-class="text-white"
            :max="availableLoyaltyCoins"
            :min="1"
            :rules="[v => v > 0 || 'Enter at least 1', v => v <= availableLoyaltyCoins || 'Exceeds available coins']"
            class="q-mb-md"
          />
          <div class="redeem-preview" v-if="redeemCoinsInput > 0">
            <div class="rp-row"><span>Coins to redeem:</span><span style="color:#f59e0b; font-weight:bold;">{{ redeemCoinsInput }}</span></div>
            <div class="rp-row"><span>Discount amount:</span><span style="color:#4ade80; font-weight:bold;">LKR {{ (redeemCoinsInput * 500).toLocaleString() }}</span></div>
            <div class="rp-row" style="font-size:11px; color:#666;"><span>Rate: 1 coin = LKR 500</span></div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Cancel" style="color: #888;" @click="showRedeemDialog = false" />
          <q-btn flat label="Use All" style="color: #f59e0b; font-weight: 600;" @click="redeemCoinsInput = availableLoyaltyCoins" />
          <q-btn 
            label="Apply Discount" 
            unelevated
            style="background: #4ade80; color: #000; font-weight: 700;"
            :loading="isRedeeming" 
            @click="redeemLoyaltyCoins" 
            :disable="redeemCoinsInput <= 0 || redeemCoinsInput > availableLoyaltyCoins" 
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- RECALL PARKED ORDER DIALOG -->
    <q-dialog v-model="showRecallDialog" transition-show="scale" transition-hide="scale">
      <q-card dark style="width: 520px; max-width: 96vw; max-height: 80vh; background: #1a1a1a; border: 2px solid #444; display: flex; flex-direction: column;">
        <q-card-section class="row items-center q-py-sm q-px-md" style="background: #111; border-bottom: 1px solid #333; flex-shrink: 0;">
          <q-icon name="play_circle" color="teal" size="22px" class="q-mr-sm" />
          <div style="font-size: 15px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 1px;">Recall Parked Order</div>
          <q-space />
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>
        <q-card-section style="flex: 1; overflow-y: auto; padding: 0;">
          <div v-if="isLoadingParked" class="text-center q-pa-xl" style="color: #aaa;">
            <q-spinner color="teal" size="32px" />
            <div style="margin-top: 8px; font-size: 13px;">Loading parked orders...</div>
          </div>
          <div v-else-if="store.parkedOrders.length === 0" class="text-center q-pa-xl" style="color: #666; font-size: 14px;">
            No parked orders found for this branch.
          </div>
          <table v-else class="recall-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Time</th>
                <th>Type</th>
                <th>Items</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="po in store.parkedOrders" :key="po.id">
                <td style="font-weight: bold; color: #ffeb3b;">{{ po.label }}</td>
                <td style="color: #aaa; font-size: 11px;">{{ new Date(po.created_at).toLocaleTimeString() }}</td>
                <td style="color: #fff; text-transform: uppercase; font-size: 11px;">{{ (po.order_type || '–').replace('_', ' ') }}</td>
                <td style="color: #4ade80; font-weight: bold; text-align: center;">{{ (po.cart_items || []).length }}</td>
                <td>
                  <button class="recall-load-btn" @click="loadParkedOrder(po)">LOAD</button>
                </td>
              </tr>
            </tbody>
          </table>
        </q-card-section>
        <q-card-actions align="right" style="border-top: 1px solid #333; padding: 8px 12px; flex-shrink: 0;">
          <button class="abtn a-blue" @click="showRecallDialog = false" style="padding: 6px 20px;">CLOSE</button>
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Split Payment Dialog -->
    <q-dialog v-model="showSplitPaymentDialog" persistent>
      <q-card class="split-pay-dialog">
        <q-toolbar class="bg-deep-purple text-white">
          <q-icon name="call_split" class="q-mr-sm" />
          <q-toolbar-title>SPLIT PAYMENT</q-toolbar-title>
          <q-btn flat round icon="close" v-close-popup />
        </q-toolbar>

        <q-card-section>
          <div class="split-order-total">Order Total: <strong>LKR {{ store.total.toFixed(2) }}</strong></div>

          <div v-for="(line, idx) in splitPaymentLines" :key="idx" class="split-line">
            <q-select
              v-model="line.method"
              :options="['cash','mastercard','visa','uber_eats','pickme','website','bank_transfer']"
              dense outlined label="Method"
              class="split-method"
              dark
            />
            <q-input
              v-model.number="line.amount"
              type="number"
              dense outlined label="Amount"
              class="split-amount"
              min="0"
              dark
            />
            <q-btn
              v-if="splitPaymentLines.length > 1"
              flat round icon="remove_circle"
              color="negative"
              @click="splitPaymentLines.splice(idx, 1)"
            />
          </div>

          <q-btn
            flat icon="add" label="Add Payment Line"
            @click="splitPaymentLines.push({ method: 'cash', amount: 0 })"
            color="primary"
            class="q-mt-sm"
          />

          <div
            class="split-balance"
            :class="splitPaymentBalance < 0 ? 'txt-red' : splitPaymentBalance === 0 ? 'txt-green' : 'txt-yellow'"
          >
            {{ splitPaymentBalance > 0
              ? `Remaining: LKR ${splitPaymentBalance.toFixed(2)}`
              : splitPaymentBalance < 0
                ? `Overpaid: LKR ${Math.abs(splitPaymentBalance).toFixed(2)}`
                : 'BALANCED ✓' }}
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup color="grey" />
          <q-btn
            unelevated color="deep-purple" label="PROCESS SPLIT PAYMENT"
            :disable="Math.abs(splitPaymentBalance) > 0.01"
            :loading="isProcessingPayment"
            @click="processSplitPayment"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useQuasar, Loading, Notify } from 'quasar'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from 'src/boot/supabase'
import { useOrderStore } from 'src/stores/orderStore'
import { useCashierStore } from 'src/stores/cashierStore'
import { useAuthStore } from 'src/stores/auth'
import { usePermission } from 'src/core/rbac/usePermission'
import OrderLookupDialog from 'src/components/pos/OrderLookupDialog.vue'
import PaymentDialog from 'src/components/pos/PaymentDialog.vue'
import POSLockScreen from 'src/components/pos/POSLockScreen.vue'
import BillPrintTemplate from 'src/components/cashier/BillPrintTemplate.vue'
import { useShiftStore } from 'src/stores/shiftStore'
import ShiftStatusIndicator from 'src/components/pos/ShiftStatusIndicator.vue'
import OpenShiftDialog from 'src/components/pos/OpenShiftDialog.vue'
import FunctionMenuDialog from 'src/components/pos/FunctionMenuDialog.vue'
import CashMovementDialog from 'src/components/pos/CashMovementDialog.vue'
import CloseShiftDialog from 'src/components/pos/CloseShiftDialog.vue'
import ShiftSummaryDialog from 'src/components/pos/ShiftSummaryDialog.vue'
import ManagerAuthDialog from 'src/components/pos/ManagerAuthDialog.vue'

const $q = useQuasar()
const router = useRouter()
const route = useRoute()
const store = useOrderStore()
const cashierStore = useCashierStore()
const authStore = useAuthStore()
const { can } = usePermission()
const shiftStore = useShiftStore()

// ── Real-time Clock ─────────────────────────────────────
const currentTime = ref(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
let clockInterval
onMounted(() => {
  clockInterval = setInterval(() => {
    currentTime.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, 10000)
})
onUnmounted(() => clearInterval(clockInterval))

// ── State ───────────────────────────────────────────────
const selectedCategory = ref('All')
const selectedSubCategory = ref('')
const selectedSubCategoryLabel = ref('')
const selectedItemIndex = ref(-1)
const numBuffer = ref('')
const itemPickerOpen = ref(false)
const dialogSearchQuery = ref('')
const showQuickCash = ref(false)

watch(selectedSubCategory, () => {
  dialogSearchQuery.value = ''
})

const categoryGridRef = ref(null)
const receiptTableRef = ref(null)
const shortcutsGridRef = ref(null)

// Menu data
const menuProducts = ref([])
const categories = ref([])
const menuLoading = ref(false)
const restaurantTables = ref([])

// Payment
const paymentDialog = ref(false)
const isProcessingPayment = ref(false)

// Billing Queue
const queueDrawer = ref(false)
const selectedQueueOrder = ref(null)
const paymentDialogRef = ref(null)

// POS Lock Screen (cashier switch)
const posLocked = ref(!authStore.isAuthenticated)
const previousCashierName = ref('')

// Merged table billing
const mergedTableOrders = ref([])

// Direct print
const directPrintRef = ref(null)
const directPrintInvoice = ref(null)

// Customer Autocomplete state
const customerSearchText = ref('')
const showCustomerDropdown = ref(false)
const customerOptions = ref([])
let searchTimeout = null

// New Customer Dialog state
const showNewCustomerDialog = ref(false)
const newCustName = ref('')
const newCustPhone = ref('')
const newCustNationalId = ref('')
const newCustEmail = ref('')
const isAddingCustomer = ref(false)

// Loyalty Redeem Dialog state
const showRedeemDialog = ref(false)
const redeemCoinsInput = ref(0)
const isRedeeming = ref(false)
const availableLoyaltyCoins = computed(() => {
  if (!store.selectedCustomer) return 0
  return store.selectedCustomer.loyalty_coins ?? store.selectedCustomer.points_balance ?? 0
})

const userName = computed(() => {
  return authStore.userDisplayName || cashierStore.cashierName || authStore.profile?.full_name || authStore.user?.email || 'Cashier'
})
const branchName = computed(() => authStore.currentBranch?.name || 'Main Branch')

const isAlreadyPaid = computed(() => {
  if (!selectedQueueOrder.value) return false
  const s = (selectedQueueOrder.value.status || '').toLowerCase()
  const ps = (selectedQueueOrder.value.payment_status || '').toLowerCase()
  return s === 'paid' || s === 'completed' || ps === 'paid'
})

// Search
const itemSearchQuery = ref('')
const filteredSearchItems = computed(() => {
  if (!itemSearchQuery.value) return []
  const q = itemSearchQuery.value.toLowerCase()
  return menuProducts.value.filter(
    (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
  )
})

// Payment Mode
const isPaymentMode = ref(false)
const selectedPaymentMethod = ref('CASH')
const selectedCardType = ref(null)    // 'MASTER' | 'VISA'
const selectedOtherType = ref(null)   // 'UBER' | 'PICKME' | 'WEBSITE'

function selectPaymentGroup(group) {
  selectedPaymentMethod.value = group
  selectedCardType.value = null
  selectedOtherType.value = null
  showQuickCash.value = (group === 'CASH')
}

function getPaymentMethodName() {
  if (selectedPaymentMethod.value === 'CASH') return 'cash'
  if (selectedPaymentMethod.value === 'CARD') {
    if (selectedCardType.value === 'MASTER') return 'mastercard'
    if (selectedCardType.value === 'VISA') return 'visa'
    return 'card'
  }
  if (selectedPaymentMethod.value === 'OTHER') {
    if (selectedOtherType.value === 'UBER') return 'uber_eats'
    if (selectedOtherType.value === 'PICKME') return 'pickme'
    if (selectedOtherType.value === 'WEBSITE') return 'website'
    return 'other'
  }
  return 'cash'
}

// Split Payment
const showSplitPaymentDialog = ref(false)
const splitPaymentLines = ref([])
const splitPaymentTotal = computed(() => splitPaymentLines.value.reduce((sum, l) => sum + (l.amount || 0), 0))
const splitPaymentBalance = computed(() => store.total - splitPaymentTotal.value)

// Live Table
const showLiveTable = ref(false)
const liveTablesList = ref([])

// ── Shift Management ────────────────────────────────────
const showOpenShiftDialog = ref(false)
const forceOpenShift = ref(false)
const showFunctionMenu = ref(false)
const showCashMovement = ref(false)
const cashMovementType = ref('cash_drop')
const showShiftSummary = ref(false)
const showCloseShift = ref(false)

// Park / Recall state
const showRecallDialog = ref(false)
const isLoadingParked = ref(false)

async function openLiveTable() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  try {
    const { data } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, capacity, status')
      .eq('branch_id', branchId)
      .order('table_number', { ascending: true })

    liveTablesList.value = data || []
    showLiveTable.value = true
  } catch (err) {
    console.error('Failed to load live tables:', err)
  }
}

async function handleTableClick(table) {
  if (lockedTables.value.has(table.id)) {
    // Open billing for this occupied table
    await selectLiveTable(table)
  } else {
    // Select the table for a new order
    store.selectedTable = table.id
    store.tableNumber = table.table_number
  }
}

async function selectLiveTable(table) {
  // Only allow interacting with occupied/locked tables
  if (table.status === 'available' && !lockedTables.value.has(table.id)) {
    return
  }

  Loading.show({ message: 'Fetching table order...' })
  try {
    await cashierStore.fetchBillingQueue()
    const activeOrders = cashierStore.billingOrders.filter(o => 
      o.table_id === table.id && 
      o.status !== 'completed' && o.status !== 'cancelled' && 
      o.payment_status !== 'paid' && o.status !== 'paid'
    )
    
    if (activeOrders.length > 0) {
      showLiveTable.value = false
      if (activeOrders.length > 1) {
        mergedTableOrders.value = activeOrders
      } else {
        mergedTableOrders.value = []
      }
      openBilling(activeOrders[0])
    } else {
      Notify.create({
        message: 'No active order found for this table in POS queue',
        color: 'warning',
        position: 'top'
      })
    }
  } catch (err) {
    console.error('Error fetching table order:', err)
  } finally {
    Loading.hide()
  }
}

const paymentAmount = computed(() => {
  if (selectedPaymentMethod.value !== 'CASH') return store.total
  return parseFloat(numBuffer.value) || 0
})

const quickCashOptions = computed(() => {
  const total = store.total
  if (total <= 0) return []
  
  const options = new Set()
  
  // Exact amount
  options.add(total)
  
  // Nearest 100 up
  const nearest100 = Math.ceil(total / 100) * 100
  if (nearest100 >= total) options.add(nearest100)
  
  // Nearest 500 up
  const nearest500 = Math.ceil(total / 500) * 500
  if (nearest500 >= total) options.add(nearest500)
  
  // Nearest 1000 up
  const nearest1000 = Math.ceil(total / 1000) * 1000
  if (nearest1000 >= total) options.add(nearest1000)
  
  // 5000 note
  if (total < 5000) options.add(5000)
  
  return Array.from(options).sort((a,b) => a - b)
})

function cancelPaymentMode() {
  isPaymentMode.value = false
  selectedPaymentMethod.value = 'CASH'
  selectedCardType.value = null
  selectedOtherType.value = null
  numBuffer.value = ''
  showQuickCash.value = false
}

const emptyRows = computed(() => {
  const maxRows = 10
  const used = store.cartItems.length
  return Math.max(0, maxRows - used)
})

const subCategories = computed(() => {
  // Always show Categories as the bottom layout to maintain structural consistency
  // Previously this was switching to raw text items which broke the layout.
  const seen = new Set()
  const tabs = []
  let idx = 1
  for (const item of menuProducts.value) {
    if (!seen.has(item.category)) {
      seen.add(item.category)
      tabs.push({
        id: item.category,
        name: item.category,
        label: `${String(idx).padStart(2, '0')}-${item.category.toUpperCase()}`,
      })
      idx++
    }
  }
  return tabs
})

const lockedTables = computed(() => {
  const locked = new Set()
  for (const order of cashierStore.billingOrders) {
    if (order.table_id && 
       (order.order_type === 'dine-in' || order.order_type === 'dine_in') && 
       order.payment_status !== 'paid' && 
       !['cancelled', 'completed'].includes(order.status)) {
      locked.add(order.table_id)
    }
  }
  return locked
})

const subCategoryItems = computed(() => {
  if (!selectedSubCategory.value) return []
  
  let items = menuProducts.value
  if (selectedSubCategory.value !== 'All') {
    items = items.filter((p) => p.category === selectedSubCategory.value)
  }
  
  if (dialogSearchQuery.value) {
    const q = dialogSearchQuery.value.toLowerCase()
    items = items.filter((p) => p.name.toLowerCase().includes(q))
  }
  
  return items
})

// ── Fetch Menu ──────────────────────────────────────────
async function fetchMenuItems() {
  menuLoading.value = true
  try {
    let products = []

    // Step 1: Try to load from default menu book for this branch
    const branchId = authStore.currentBranch?.id
    let usedMenuBook = false

    if (branchId) {
      const { data: bookData } = await supabase
        .from('menu_books')
        .select('id, name')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle()

      if (bookData) {
        // Load items through the menu book
        const { data: bookItems, error: bookError } = await supabase
          .from('menu_book_items')
          .select(
            `
            id, override_price, is_available, sort_order,
            menu_items(id, name, base_price, image_url, is_available, kitchen_id, sub_category_id, categories(id, name), item_variants(id, name, price, is_active))
          `,
          )
          .eq('menu_book_id', bookData.id)
          .eq('is_available', true)
          .order('sort_order')

        if (!bookError && bookItems && bookItems.length > 0) {
          products = bookItems
            .filter((bi) => bi.menu_items && bi.menu_items.is_available)
            .map((bi) => ({
              id: bi.menu_items.id,
              name: bi.menu_items.name,
              price: parseFloat(bi.override_price || bi.menu_items.base_price || 0),
              kitchen_id: bi.menu_items.kitchen_id,
              sub_category_id: bi.menu_items.sub_category_id,
              image: bi.menu_items.image_url || '',
              category: bi.menu_items.categories?.name || 'Other',
              variants: bi.menu_items.item_variants ? bi.menu_items.item_variants.filter(v => v.is_active).map(v => ({
                id: v.id,
                name: v.name,
                price: parseFloat(v.price)
              })) : [],
            }))
          usedMenuBook = true
          console.log(`[POS] Loaded ${products.length} items from menu book: ${bookData.name}`)
        }
      }
    }

    // Step 2: Fallback — load all menu items directly (backward compatible)
    if (!usedMenuBook) {
      const { data, error } = await supabase
        .from('menu_items')
        .select(
          `id, name, base_price, image_url, is_available, kitchen_id, sub_category_id, categories(id, name), item_variants(id, name, price, is_active)`,
        )
        .eq('is_available', true)
        .order('name')

      if (error) throw error

      products = (data || []).map((item) => ({
        id: item.id,
        name: item.name,
        price: parseFloat(item.base_price || 0),
        kitchen_id: item.kitchen_id,
        sub_category_id: item.sub_category_id,
        image: item.image_url || '',
        category: item.categories?.name || 'Other',
        variants: item.item_variants ? item.item_variants.filter(v => v.is_active).map(v => ({
          id: v.id,
          name: v.name,
          price: parseFloat(v.price)
        })) : [],
      }))
    }

    menuProducts.value = products

    // Build categories
    const seen = new Set()
    const cats = [{ id: 'all', name: 'All', icon: 'store' }]
    for (const item of menuProducts.value) {
      if (!seen.has(item.category)) {
        seen.add(item.category)
        cats.push({ id: item.category, name: item.category })
      }
    }
    categories.value = cats
  } catch (err) {
    console.error('[POS] Failed to load menu:', err)
    Notify.create({ message: 'Failed to load menu', caption: err.message, color: 'red' })
  } finally {
    menuLoading.value = false
  }
}

async function fetchRestaurantTables() {
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, section')
      .eq('branch_id', branchId)
      .order('table_number')
    if (data && !error) {
      restaurantTables.value = data
    }
  } catch (err) {
    console.error('Failed to load tables', err)
  }
}

onMounted(async () => {
  if (authStore.isAuthenticated) {
    fetchMenuItems()
    fetchRestaurantTables()
    store.loadServiceChargeRate()
    await cashierStore.initialize()

    // ── Shift Check ─────────────────────────────────────────
    const hasShift = await shiftStore.checkActiveShift()
    if (!hasShift) {
      // Force open shift dialog — cannot proceed without an active shift
      forceOpenShift.value = true
      showOpenShiftDialog.value = true
    }
  } else {
    posLocked.value = true
  }

  // ── Auto-open billing from notification click ─────────────
  // When navigated via notification with ?order_id=xxx, auto-open the billing dialog
  const notifOrderId = route.query.order_id
  if (notifOrderId) {
    autoOpenBillingForOrder(notifOrderId)
  }
})

// Watch for same-page navigation (user already on POS, clicks another notification)
watch(
  () => route.query.order_id,
  (newOrderId) => {
    if (newOrderId) {
      autoOpenBillingForOrder(newOrderId)
    }
  },
)

/**
 * Auto-open billing dialog for an order from notification click.
 * 1st: looks in cashierStore.billingOrders (fast, works for recent orders)
 * 2nd: if not found, fetches the specific order directly from DB (covers old orders)
 */
async function autoOpenBillingForOrder(orderId, attempt = 0) {
  const MAX_ATTEMPTS = 3

  // Try to find in the already-loaded queue first
  let order = cashierStore.billingOrders.find((o) => o.id === orderId)

  if (!order && attempt < MAX_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, 800))
    if (attempt === 0) await cashierStore.fetchBillingQueue(true)
    return autoOpenBillingForOrder(orderId, attempt + 1)
  }

  // Final fallback: fetch this specific order directly from DB
  // (handles orders older than today that might not be in the queue)
  if (!order) {
    try {
      const { data: rawOrder, error } = await supabase
        .from('orders')
        .select(
          `
          id, order_number, order_type, order_source, status, payment_status,
          customer_name, customer_phone, subtotal, tax_amount, discount_amount,
          total_amount, delivery_charge, notes, created_at, updated_at, accepted_at, waiter_id,
          table_id, table_number, branch_id,
          restaurant_tables ( table_number, section ),
          waiter:profiles!orders_waiter_id_fkey ( full_name ),
          order_items (
            id, quantity, unit_price, total_price, notes, status,
            menu_items ( id, name )
          ),
          kot_tickets (
            id, kot_number, status, kitchen_id,
            kot_items ( id, order_item_id, quantity, status )
          ),
          invoices ( id, invoice_number, total, payment_status, status )
        `,
        )
        .eq('id', orderId)
        .single()

      if (!error && rawOrder) {
        // Normalize using the store's canonical normalizer
        const normalized = cashierStore._normalizeEntry(rawOrder)

        // Inject into the queue if not already there
        if (!cashierStore.billingOrders.find((o) => o.id === orderId)) {
          cashierStore.billingOrders.unshift(normalized)
        }
        order = normalized
      }
    } catch (fetchErr) {
      console.warn('[POS] Direct order fetch failed:', fetchErr)
    }
  }

  // Clear the query param so reloads don't re-trigger
  router.replace({ query: {} }).catch(() => {})

  if (order) {
    await nextTick()
    selectedQueueOrder.value = order
    paymentDialog.value = true

    Notify.create({
      message: `Billing opened for Order #${order.order_number}`,
      caption:
        order.order_type === 'delivery'
          ? '🛵 Delivery Order'
          : order.order_type === 'takeaway'
            ? '🥡 Takeaway'
            : '🍽️ Dine-in',
      color: 'deep-orange',
      icon: 'receipt_long',
      position: 'top',
      timeout: 3000,
    })

    // Auto-print bill after dialog fully renders
    setTimeout(async () => {
      if (paymentDialogRef.value?.printBill) {
        await paymentDialogRef.value.printBill()
      }
    }, 350)
  } else {
    Notify.create({
      message: 'Order not found',
      caption: 'It may have already been fully completed or cancelled.',
      color: 'orange-8',
      icon: 'info',
      position: 'top',
      timeout: 5000,
    })
  }
}

// ── Item Selection ──────────────────────────────────────
function onSearchInput() {
  // Logic if needed
}

function handleSearchResultClick(item) {
  addItemToOrder(item)
  itemSearchQuery.value = ''
}

function selectItem(index) {
  selectedItemIndex.value = index
}

function selectCategory(catName) {
  selectedCategory.value = catName
  selectedSubCategory.value = catName
  selectedSubCategoryLabel.value = catName === 'All' ? 'ALL ITEMS' : catName.toUpperCase()
  itemPickerOpen.value = true
}

function selectSubCategory(sub) {
  if (sub.isItem && sub.item) {
    // Direct item add
    addItemToOrder(sub.item)
  } else {
    // It's a category → show items as item picker
    selectedSubCategory.value = sub.name
    selectedSubCategoryLabel.value = sub.label || sub.name
    itemPickerOpen.value = true
  }
}

function addItemToOrder(product) {
  if (product.variants && product.variants.length > 0) {
    $q.dialog({
      title: '🍕 Select Size',
      message: `Choose a size for ${product.name}:`,
      options: {
        type: 'radio',
        model: product.variants[0].id,
        items: product.variants.map((v) => ({
          label: `${v.name} - LKR ${v.price.toLocaleString()}`,
          value: v.id,
        })),
      },
      cancel: { flat: true, color: 'grey-5', noCaps: true },
      ok: { color: 'primary', unelevated: true, noCaps: true, label: 'Add Item' },
      persistent: true,
      dark: true,
      class: 'pos-dark-dialog',
    }).onOk((selectedVariantId) => {
      const variant = product.variants.find((v) => v.id === selectedVariantId)
      if (variant) {
        const qty = parseInt(numBuffer.value) || 1
        for (let i = 0; i < qty; i++) {
          store.addItem(product, variant)
        }
        numBuffer.value = ''
        Notify.create({
          message: `${product.name} (${variant.name}) × ${qty} added`,
          color: 'positive',
          icon: 'check_circle',
          position: 'top',
          timeout: 600,
        })
      }
    })
  } else {
    const qty = parseInt(numBuffer.value) || 1
    for (let i = 0; i < qty; i++) {
      store.addItem(product)
    }
    numBuffer.value = ''
    Notify.create({
      message: `${product.name} × ${qty} added`,
      color: 'positive',
      icon: 'check_circle',
      position: 'top',
      timeout: 600,
    })
  }
}

// ── Customer Search Handlers ────────────────────────────
watch(() => store.customerName, (val) => {
  if (!val) {
    customerSearchText.value = ''
  } else if (customerSearchText.value !== val) {
    customerSearchText.value = val
  }
})

function onCustomerInput() {
  store.customerName = customerSearchText.value // keep store in sync for name
  if (!customerSearchText.value) {
    store.selectedCustomer = null
    customerOptions.value = []
    showCustomerDropdown.value = false
    return
  }
  
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(async () => {
    const searchVal = customerSearchText.value.trim()
    if (!searchVal) return

    try {
      // Try pos_search_customers RPC first (returns loyalty data inline)
      const { data, error } = await supabase.rpc('pos_search_customers', { 
        p_search: searchVal, 
        p_limit: 10 
      })
      if (!error && data?.success) {
        customerOptions.value = data.data || []
        showCustomerDropdown.value = true
        return
      }
    } catch {
      // RPC not deployed yet — fall through to direct query
    }

    // Fallback: direct table query with correct column names
    try {
      const likeVal = `%${searchVal}%`
      const { data: rows, error: qErr } = await supabase
        .from('customers')
        .select('id, first_name, last_name, phone, email, national_id, credit_limit')
        .or(`first_name.ilike.${likeVal},last_name.ilike.${likeVal},phone.ilike.${likeVal},email.ilike.${likeVal},national_id.ilike.${likeVal}`)
        .limit(10)

      if (!qErr && rows) {
        // Map to expected format with full_name
        customerOptions.value = rows.map(r => ({
          id: r.id,
          customer_id: r.id,
          full_name: [r.first_name, r.last_name].filter(Boolean).join(' '),
          first_name: r.first_name,
          last_name: r.last_name,
          phone: r.phone,
          email: r.email,
          national_id: r.national_id,
          credit_limit: r.credit_limit || 0,
          loyalty_coins: 0,
          points_balance: 0,
          loyalty_tier: 'STANDARD',
          tier_name: 'Standard',
          tier_color: '#9ca3af',
        }))
        showCustomerDropdown.value = true
      }
    } catch (e) {
      console.error('Customer search failed', e)
    }
  }, 300)
}

function selectCustomer(cust) {
  // Map the result to store format (ensure both id formats & full_name work)
  const fullName = cust.full_name || [cust.first_name, cust.last_name].filter(Boolean).join(' ') || ''
  store.selectedCustomer = {
    ...cust,
    id: cust.id || cust.customer_id,
    customer_id: cust.customer_id || cust.id,
    full_name: fullName,
  }
  store.customerName = fullName
  customerSearchText.value = fullName
  showCustomerDropdown.value = false
}

function hideCustomerDropdownDelay() {
  setTimeout(() => {
    showCustomerDropdown.value = false
  }, 200)
}

// ── New Customer Dialog ─────────────────────────────────
function openNewCustomerDialog() {
  newCustName.value = customerSearchText.value || ''
  newCustPhone.value = ''
  newCustNationalId.value = ''
  newCustEmail.value = ''
  showCustomerDropdown.value = false
  showNewCustomerDialog.value = true
}

async function addNewCustomer() {
  if (!newCustName.value?.trim() || !newCustPhone.value?.trim()) {
    Notify.create({ message: 'Name and Phone are required', color: 'red', position: 'top' })
    return
  }

  isAddingCustomer.value = true
  try {
    // Parse name into first_name + last_name
    const fullName = newCustName.value.trim()
    const nameParts = fullName.split(/\s+/)
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ') || ''
    const phone = newCustPhone.value.replace(/\s/g, '').trim()

    // Check if customer already exists by phone
    const { data: existing } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email, national_id')
      .eq('phone', phone)
      .maybeSingle()

    let customerId
    let isNew = false

    if (existing) {
      customerId = existing.id
    } else {
      // Direct insert into customers table with correct columns
      const branchId = authStore.currentBranch?.id
      const companyId = authStore.currentBranch?.company_id

      const { data: inserted, error: insertErr } = await supabase
        .from('customers')
        .insert({
          first_name: firstName,
          last_name: lastName || null,
          phone: phone,
          email: newCustEmail.value?.trim() || null,
          national_id: newCustNationalId.value?.trim() || null,
          branch_id: branchId || null,
          company_id: companyId || null,
          source: 'walk_in',
        })
        .select('id, first_name, last_name, phone, email, national_id')
        .single()

      if (insertErr) throw new Error(insertErr.message)
      customerId = inserted.id
      isNew = true
    }

    // Auto-select the new/found customer
    const newCust = {
      id: customerId,
      customer_id: customerId,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      phone: phone,
      national_id: newCustNationalId.value?.trim() || null,
      email: newCustEmail.value?.trim() || null,
      loyalty_coins: 0,
      points_balance: 0,
      loyalty_tier: 'STANDARD',
      tier_name: 'Standard',
      tier_color: '#9ca3af',
      credit_limit: 0,
    }

    selectCustomer(newCust)
    showNewCustomerDialog.value = false

    Notify.create({ 
      message: isNew ? '✅ New customer created!' : '✅ Existing customer found!', 
      caption: fullName, 
      color: 'positive', 
      position: 'top',
      icon: 'person_add'
    })
  } catch (err) {
    console.error('Add customer error:', err)
    Notify.create({ message: 'Failed to add customer', caption: err.message, color: 'red', position: 'top' })
  } finally {
    isAddingCustomer.value = false
  }
}

// ── Loyalty Redemption ──────────────────────────────────
function openRedeemDialog() {
  if (!store.selectedCustomer) return
  redeemCoinsInput.value = 0
  showRedeemDialog.value = true
}

async function redeemLoyaltyCoins() {
  if (!store.selectedCustomer || redeemCoinsInput.value <= 0) return

  isRedeeming.value = true
  try {
    const customerId = store.selectedCustomer.id || store.selectedCustomer.customer_id
    const { data, error } = await supabase.rpc('pos_redeem_loyalty_coins', {
      p_customer_id: customerId,
      p_coins_to_redeem: redeemCoinsInput.value,
      p_order_id: store._loadedOrderId || null,
    })

    if (error) throw new Error(error.message)
    if (!data?.success) throw new Error(data?.error || 'Redemption failed')

    // Apply discount to the order (convert LKR discount to percentage of subtotal)
    const discountLKR = data.discount_amount || (redeemCoinsInput.value * 500)
    const discountPct = store.subtotal > 0 ? Math.min((discountLKR / store.subtotal) * 100, 100) : 0
    
    // Add loyalty discount — set discount percentage
    store.discount = Math.round(discountPct * 100) / 100

    // Update customer's coin balance in UI
    if (store.selectedCustomer) {
      store.selectedCustomer = {
        ...store.selectedCustomer,
        loyalty_coins: data.new_coin_balance ?? (availableLoyaltyCoins.value - redeemCoinsInput.value),
        points_balance: data.new_coin_balance ?? (availableLoyaltyCoins.value - redeemCoinsInput.value),
      }
    }

    showRedeemDialog.value = false

    Notify.create({
      message: `🪙 ${redeemCoinsInput.value} coins redeemed!`,
      caption: `Discount: LKR ${discountLKR.toLocaleString()} applied`,
      color: 'amber-8',
      textColor: 'white',
      position: 'top',
      icon: 'redeem',
      timeout: 3000,
    })
  } catch (err) {
    console.error('Redeem error:', err)
    Notify.create({ message: 'Redemption failed', caption: err.message, color: 'red', position: 'top' })
  } finally {
    isRedeeming.value = false
  }
}

// ── Numeric Keypad ──────────────────────────────────────
function numInput(char) {
  if (isPaymentMode.value && showQuickCash.value) {
    numBuffer.value = char
    showQuickCash.value = false
  } else {
    numBuffer.value += char
  }
}

function numClear() {
  numBuffer.value = ''
  if (isPaymentMode.value) {
    showQuickCash.value = true
  }
}

function numEnter() {
  if (selectedItemIndex.value >= 0 && numBuffer.value) {
    const qty = parseInt(numBuffer.value) || 1
    store.updateQuantity(selectedItemIndex.value, qty)
    numBuffer.value = ''
  }
}

// ── Function Button Handlers ────────────────────────────
function handleVoid() {
  // RBAC: only roles with pos.order.void permission can void items
  if (!can('pos.order.void')) {
    Notify.create({ message: 'Access Denied', caption: 'You do not have permission to void items', color: 'red', icon: 'block', position: 'top' })
    return
  }

  if (selectedItemIndex.value < 0) {
    Notify.create({
      message: 'Select an item to void',
      color: 'grey-8',
      position: 'top',
      timeout: 800,
    })
    return
  }

  const authStore = useAuthStore()

  $q.dialog({
    component: ManagerAuthDialog,
    componentProps: { actionName: 'VOID' }
  }).onOk((authResult) => {
    if (!authResult || !authResult.managerId) return
    const managerUserId = authResult.managerId

    // Manager verified. Ask for reason.
      $q.dialog({
        title: 'VOID Reason',
        message: 'Enter reason for voiding this item:',
        prompt: {
          model: '',
          type: 'text',
        },
        cancel: true,
        persistent: true,
      }).onOk(async (reason) => {
        if (!reason || !reason.trim()) {
          Notify.create({ message: 'Reason is required', color: 'orange', position: 'top' })
          return
        }

        Loading.show({ message: 'Processing VOID...' })
        try {
          const item = store.cartItems[selectedItemIndex.value]

          // 1. Check if the item is already in DB (loaded order)
          const isDbItem = Boolean(store._loadedOrderId && typeof item.id === 'string' && item.id.length > 20)
          
          if (isDbItem) {
            // Update order_items to mark it void
            const { error: voidError } = await supabase
              .from('order_items')
              .update({
                status: 'void',
                void_reason: reason.trim(),
                void_authorized_by: managerUserId,
              })
              .eq('id', item.id)

            if (voidError) throw new Error(`Failed to update DB: ${voidError.message}`)

            // Optional: Recalculate order totals if strict syncing is needed. 
            // In POS, the recalculation usually happens at Checkout, but for safety:
            const { data: ord } = await supabase.from('orders').select('subtotal, total_amount').eq('id', store._loadedOrderId).single()
            if (ord) {
              const itemTotal = item.price * item.qty
              const newSub = Math.max(0, ord.subtotal - itemTotal)
              const newTot = Math.max(0, ord.total_amount - itemTotal)
              await supabase.from('orders').update({ subtotal: newSub, total_amount: newTot }).eq('id', store._loadedOrderId)
            }
          }

          // 2. Prepare fake invoice for VOID ticket print
          const orderTypeMap = { 'dine-in': 'dine_in', takeaway: 'takeaway', delivery: 'delivery' }
          const effectiveOrderType = orderTypeMap[store.orderType] || 'dine_in'

          directPrintInvoice.value = {
            __voidReason: reason.trim(),
            invoice_number: selectedQueueOrder.value?.order_number || store.orderNumber || 'VOID',
            created_at: new Date().toISOString(),
            subtotal: 0,
            grand_total: 0,
            delivery_charge: 0,
            service_charge: 0,
            customer_name: store.customerName || '',
            customer_phone: selectedQueueOrder.value?.customer_phone || '',
            invoice_items: [
              {
                id: item.id || 1,
                menu_item_name: item.name + (item.variant ? ` (${item.variant})` : ''),
                quantity: item.qty,
                unit_price: item.price,
                total_price: item.price * item.qty,
              },
            ],
            payments: [],
            orders: {
              order_type: effectiveOrderType,
              order_number: selectedQueueOrder.value?.order_number || store.orderNumber,
              customer_name: store.customerName || '',
              customer_phone: '',
              delivery_address: '',
              pax: 1,
              waiter: { full_name: authStore.profile?.full_name || 'Cashier' },
              kot_tickets: [],
              restaurant_tables: store.tableNumber ? { table_number: store.tableNumber } : null,
            },
          }

          // Trigger print
          await nextTick()
          await new Promise((r) => setTimeout(r, 300))
          if (directPrintRef.value?.printReceipt) {
            directPrintRef.value.printReceipt()
          }

          // 3. Remove item from POS memory
          store.removeItem(selectedItemIndex.value)
          selectedItemIndex.value = -1

          Notify.create({
            message: 'Item voided successfully',
            color: 'positive',
            icon: 'check_circle',
            position: 'top',
            timeout: 2000,
          })
        } catch (err) {
          console.error('VOID Error:', err)
          Notify.create({ message: 'VOID processing error', caption: err.message, color: 'red', position: 'top' })
        } finally {
          Loading.hide()
        }
      })
  })
}

function handleClear() {
  store.clearCart()
  selectedItemIndex.value = -1
  numBuffer.value = ''
  selectedQueueOrder.value = null
  mergedTableOrders.value = []
  customerSearchText.value = ''
  directPrintInvoice.value = null
  cancelPaymentMode()
  Notify.create({
    message: 'All cleared',
    color: 'info',
    icon: 'delete_sweep',
    position: 'top',
    timeout: 800,
  })
}

// ── FOC (Free of Charge) Workflow ───────────────────────
async function handleFOC() {
  if (!store.orderType) {
    Notify.create({
      message: 'Please select an Order Type (Table Order, Take Away, or Delivery) first!',
      color: 'red',
      icon: 'warning',
      position: 'top',
      timeout: 2500,
    })
    return
  }

  // 1. Must have items in cart or a loaded queue order
  if (store.isEmpty && !selectedQueueOrder.value) {
    Notify.create({ message: 'No order to process as FOC', color: 'orange', icon: 'warning', position: 'top', timeout: 1200 })
    return
  }

  // 2. Step 1: Manager Authorization
  $q.dialog({
    component: ManagerAuthDialog,
    componentProps: { actionName: 'FOC' }
  }).onOk((authResult) => {
    if (!authResult || !authResult.managerId) return
    const managerUserId = authResult.managerId

    try {
        // Step 3: FOC Reason input
        $q.dialog({
          title: '📝 FOC Reason',
          message: 'Enter the reason for this Free of Charge order:',
          dark: true,
          prompt: {
            model: '',
            type: 'textarea',
            label: 'Reason (required)',
            outlined: true,
          },
          cancel: { flat: true, color: 'grey-5', noCaps: true },
          ok: { color: 'green', unelevated: true, noCaps: true, label: 'Submit FOC' },
          persistent: true,
        }).onOk(async (focReason) => {
          if (!focReason || !focReason.trim()) {
            Notify.create({ message: 'FOC reason is required', color: 'red', position: 'top' })
            return
          }

          await processFOCOrder(managerUserId, focReason.trim())
        })
      } catch (err) {
        Loading.hide()
        console.error('FOC processing error:', err)
        Notify.create({ message: 'Processing error', caption: err.message, color: 'red', position: 'top' })
      }
  })
}

async function processFOCOrder(managerUserId, focReason) {
  Loading.show({ message: 'Processing FOC order...' })
  try {
    let finalOrderId = null

    if (store._loadedOrderId && selectedQueueOrder.value) {
      // ── QUEUE ORDER: mark existing order as FOC ──
      finalOrderId = store._loadedOrderId

      // Accept if still pending
      if (selectedQueueOrder.value.status === 'pending_waiter') {
        const { error: acceptError } = await supabase.rpc('process_waiter_accept', { p_order_id: finalOrderId })
        if (acceptError) throw new Error(acceptError.message)
      }

      // Create invoice if not invoiced
      const status = selectedQueueOrder.value.status
      if (status !== 'invoiced' && status !== 'paid') {
        const { error: invError } = await supabase.rpc('process_cashier_invoice', { p_order_id: finalOrderId })
        if (invError) throw new Error(invError.message)
      }

      // Update series: mark order as FOC with reason
      const { error: focError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_status: 'paid',
          payment_method: 'foc',
          foc_reason: focReason,
          foc_authorized_by: managerUserId,
          total_amount: 0,
          paid_at: new Date().toISOString(),
        })
        .eq('id', finalOrderId)
      if (focError) throw new Error(focError.message)

      // Also update invoice to reflect FOC
      await supabase
        .from('invoices')
        .update({ payment_status: 'paid', total: 0 })
        .eq('order_id', finalOrderId)

    } else {
      // ── MANUAL POS: create new order as FOC ──
      const companyId = authStore.currentBranch?.company_id
      const branchId = authStore.currentBranch?.id
      const userId = authStore.user?.id

      if (!companyId) {
        throw new Error('Company information not loaded. Please refresh the page and try again.')
      }

      const orderPayload = {
        company_id: companyId,
        branch_id: branchId,
        waiter_id: userId || null,
        order_type: store.orderType === 'dine-in' ? 'dine_in' : 'takeaway',
        order_source: 'pos',
        status: 'paid',
        payment_status: 'paid',
        payment_method: 'foc',
        table_id: null,
        table_number: store.tableNumber ? (parseInt(String(store.tableNumber).replace(/\D/g, '')) || null) : null,
        total_amount: 0,
        subtotal: parseFloat(store.subtotal.toFixed(2)),
        tax_amount: 0,
        service_charge: 0,
        discount_amount: 0,
        customer_name: store.customerName || null,
        foc_reason: focReason,
        foc_authorized_by: managerUserId,
        paid_at: new Date().toISOString(),
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id, order_number')
        .single()
      if (orderError) throw new Error(`Failed to create FOC order: ${orderError.message}`)

      finalOrderId = order.id

      // Insert order items
      const itemsPayload = store.cartItems.map((item) => {
        const qty = parseInt(item.qty) || 1
        const price = parseFloat(item.price) || 0
        return {
          order_id: order.id,
          menu_item_id: item.productId,
          kitchen_id: item.kitchenId || null,
          quantity: qty,
          unit_price: price,
          total_price: parseFloat((qty * price).toFixed(2)),
          notes: item.notes || null,
          status: 'queued',
        }
      })

      const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload)
      if (itemsError) throw new Error(`Failed to save FOC items: ${itemsError.message}`)

      // Create invoice for FOC
      await supabase.from('invoices').insert({
        order_id: order.id,
        branch_id: branchId,
        cashier_id: userId,
        total: 0,
        subtotal: parseFloat(store.subtotal.toFixed(2)),
        payment_status: 'paid',
      })
    }

    // ── Print FOC Receipt ──
    const items = store.cartItems.map((item, idx) => ({
      id: idx,
      menu_item_name: item.name + (item.variant ? ` (${item.variant})` : ''),
      quantity: item.qty,
      unit_price: item.price,
      total_price: item.price * item.qty,
    }))

    const orderTypeMap = { 'dine-in': 'dine_in', takeaway: 'takeaway', delivery: 'delivery' }
    const effectiveOrderType = orderTypeMap[store.orderType] || 'dine_in'

    directPrintInvoice.value = {
      invoice_number: selectedQueueOrder.value?.order_number || store.orderNumber || 'FOC',
      created_at: new Date().toISOString(),
      subtotal: store.subtotal,
      grand_total: 0,
      delivery_charge: 0,
      service_charge: 0,
      customer_name: store.customerName || '',
      customer_phone: selectedQueueOrder.value?.customer_phone || '',
      invoice_items: items,
      payments: [{ payment_methods: { name: 'FOC' }, amount: 0 }],
      orders: {
        order_type: effectiveOrderType,
        order_number: selectedQueueOrder.value?.order_number || store.orderNumber,
        customer_name: store.customerName || '',
        customer_phone: '',
        delivery_address: '',
        pax: 1,
        waiter: { full_name: authStore.profile?.full_name || 'Cashier' },
        kot_tickets: [],
        restaurant_tables: store.tableNumber ? { table_number: store.tableNumber } : null,
      },
      __focReason: focReason,
    }

    await nextTick()
    await new Promise(r => setTimeout(r, 300))

    if (directPrintRef.value?.printReceipt) {
      directPrintRef.value.printReceipt()
    }

    Notify.create({
      message: 'FOC Order Saved & Printed',
      caption: `Reason: ${focReason}`,
      color: 'positive',
      icon: 'check_circle',
      position: 'top',
      timeout: 3000,
    })

    // Reset UI
    handleNewOrderAfterPayment()
    cancelPaymentMode()

  } catch (err) {
    console.error('FOC Error:', err)
    Notify.create({ message: 'FOC processing error', caption: err.message, color: 'red', position: 'top' })
  } finally {
    Loading.hide()
  }
}

function handleBack() {
  selectedItemIndex.value = -1
  numBuffer.value = ''
}

async function handlePrint() {
  if (!store.orderType) {
    Notify.create({
      message: 'Please select an Order Type (Table Order, Take Away, or Delivery) first!',
      color: 'red',
      icon: 'warning',
      position: 'top',
      timeout: 2500,
    })
    return
  }

  if (store.isEmpty) {
    Notify.create({ message: 'No items in order to print', color: 'orange', position: 'top', timeout: 800 })
    return
  }

  // ── IN-SCREEN PAYMENT PRE-REQUISITE ──
  if (isPaymentMode.value) {
     if (selectedPaymentMethod.value === 'CASH' && paymentAmount.value < store.total) {
       Notify.create({ message: 'Insufficient amount received for Cash payment', color: 'red', position: 'top' })
       return
     }
     if (selectedPaymentMethod.value === 'CARD' && !selectedCardType.value) {
       Notify.create({ message: 'Select MASTER or VISA for card payment', color: 'orange', position: 'top' })
       return
     }
     if (selectedPaymentMethod.value === 'OTHER' && !selectedOtherType.value) {
       Notify.create({ message: 'Select UBER, PICKME or WEBSITE for other payment', color: 'orange', position: 'top' })
       return
     }
     await processInlinePayment()
     return
  }

  // Build a simulated invoice for standard printing (before payment)
  const items = store.cartItems.map((item, idx) => ({
    id: idx,
    menu_item_name: item.name + (item.variant ? ` (${item.variant})` : ''),
    quantity: item.qty,
    unit_price: item.price,
    total_price: item.price * item.qty,
  }))

  const orderTypeMap = { 'dine-in': 'dine_in', takeaway: 'takeaway', delivery: 'delivery' }
  const effectiveOrderType = orderTypeMap[store.orderType] || 'dine_in'

  directPrintInvoice.value = {
    invoice_number: selectedQueueOrder.value?.order_number || store.orderNumber || 'PENDING',
    created_at: selectedQueueOrder.value?.created_at || new Date().toISOString(),
    subtotal: store.subtotal,
    grand_total: store.total,
    delivery_charge: 0,
    service_charge: store.serviceChargeAmount,
    customer_name: store.customerName || '',
    customer_phone: selectedQueueOrder.value?.customer_phone || '',
    invoice_items: items,
    payments: [],
    orders: {
      order_type: effectiveOrderType,
      order_number: selectedQueueOrder.value?.order_number || store.orderNumber,
      customer_name: store.customerName || '',
      customer_phone: selectedQueueOrder.value?.customer_phone || '',
      delivery_address: '',
      pax: 1,
      waiter: {
        full_name: selectedQueueOrder.value?.waiterName || authStore.profile?.full_name || 'Cashier',
      },
      kot_tickets: selectedQueueOrder.value?.kot_tickets || [],
      restaurant_tables: store.tableNumber 
        ? { table_number: store.tableNumber }
        : selectedQueueOrder.value?.restaurant_tables || null,
    },
  }

  // Wait for the template to render, then print
  await nextTick()
  await new Promise(r => setTimeout(r, 200))
  
  if (directPrintRef.value?.printReceipt) {
    directPrintRef.value.printReceipt()
  }
}

// ── ACTUAL PAYMENT LOGIC FOR IN-SCREEN FLOW ──
async function processInlinePayment() {
  if (isProcessingPayment.value) return
  isProcessingPayment.value = true
  Loading.show({ message: 'Processing Payment & Printing...' })
  
  const methodName = getPaymentMethodName()

  try {
    let finalOrderId = null
    let createdInvoiceId = null

    if (mergedTableOrders.value && mergedTableOrders.value.length > 1) {
      // ── MERGED TABLE ORDERS FLOW (Multiple KOTs) ──
      const orderIds = mergedTableOrders.value.map(o => o.id)
      const { data: mergeData, error: mergeError } = await supabase.rpc('merge_table_orders_and_pay', {
        p_order_ids: orderIds,
        p_payment_method: methodName.toLowerCase(),
        p_amount_paid: store.total
      })
      if (mergeError) throw new Error(mergeError.message)
      if (!mergeData?.success) throw new Error(mergeData?.error || 'Merge payment failed')
      
      finalOrderId = orderIds[0] // for shift logging
      createdInvoiceId = mergeData.invoice_id

    } else if (store._loadedOrderId && selectedQueueOrder.value) {
      // ── QUEUE ORDER FLOW (From Order Lookup) ──
      finalOrderId = store._loadedOrderId
      
      // 1. If still pending_waiter, accept it
      if (selectedQueueOrder.value.status === 'pending_waiter') {
        const { error: acceptError } = await supabase.rpc('process_waiter_accept', { p_order_id: finalOrderId })
        if (acceptError) throw new Error(acceptError.message)
      }
      
      // 2. Mark as invoiced if not already
      const status = selectedQueueOrder.value.status
      if (status !== 'invoiced' && status !== 'paid') {
        const { error: invError } = await supabase.rpc('process_cashier_invoice', { p_order_id: finalOrderId })
        if (invError) throw new Error(invError.message)
      }

      // 3. Record payment
      const { data: payData, error: payError } = await supabase.rpc('process_cashier_payment', {
        p_order_id: finalOrderId,
        p_payment_method: methodName.toLowerCase(),
        p_amount_paid: store.total
      })
      if (payError) throw new Error(payError.message)
      if (!payData?.success && payData?.message !== 'Already paid.') throw new Error(payData?.error || 'Payment failed')
      
    } else {
      // ── MANUAL POS FLOW (unsaved items) ──
      const res = await store.processPayment(methodName.toLowerCase())
      if (!res.success) throw new Error(res.reason || 'Manual payment failed')
      finalOrderId = res.orderId
    }

    // Prepare real invoice for printing
    let targetInvoiceId = createdInvoiceId
    
    if (!targetInvoiceId && finalOrderId) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id')
        .eq('order_id', finalOrderId)
        .order('created_at', { ascending: false })
        .limit(1)
      if (invoices?.length > 0) {
        targetInvoiceId = invoices[0].id
      }
    }
      
    if (targetInvoiceId) {
      const realInvoice = await cashierStore.fetchInvoiceDetails(targetInvoiceId)
      
      // Enrich with ALL KOT tickets if merged
      if (mergedTableOrders.value && mergedTableOrders.value.length > 1 && realInvoice?.orders) {
        const allKots = mergedTableOrders.value.flatMap((o) => o.kot_tickets || [])
        const kotMap = new Map()
        for (const k of allKots) kotMap.set(k.id, k)
        for (const k of realInvoice.orders.kot_tickets || []) kotMap.set(k.id, k)
        realInvoice.orders.kot_tickets = Array.from(kotMap.values())
      }

      directPrintInvoice.value = realInvoice
      
      await nextTick()
      await new Promise(r => setTimeout(r, 200))
      
      if (directPrintRef.value?.printReceipt) {
        directPrintRef.value.printReceipt()
      }
    }

    Notify.create({ message: 'Payment Successful', color: 'positive', position: 'top', icon: 'check_circle' })

    // ── Record payment against active shift ────────────
    if (shiftStore.hasActiveShift && finalOrderId) {
      shiftStore.recordPayment(finalOrderId, methodName.toLowerCase(), store.total)
    }

    handleNewOrderAfterPayment()
    cancelPaymentMode()
    
  } catch (err) {
    console.error('Payment Error:', err)
    Notify.create({ message: 'Payment error', caption: err.message, color: 'red', position: 'top' })
  } finally {
    Loading.hide()
    isProcessingPayment.value = false
  }
}

function handleOther() {
  if (store.isEmpty) {
    Notify.create({ message: 'No items in order', color: 'orange', position: 'top', timeout: 800 })
    return
  }
  // Apply a custom discount to the order
  $q.dialog({
    title: 'Order Discount',
    message: 'Enter discount percentage (0-100):',
    prompt: {
      model: store.discount.toString(),
      type: 'number',
    },
    cancel: true,
    persistent: true,
  }).onOk((data) => {
    const val = parseFloat(data)
    if (!isNaN(val) && val >= 0 && val <= 100) {
      store.discount = val
      Notify.create({ message: `Discount set to ${val}%`, color: 'positive', position: 'top' })
    }
  })
}

function handleEdit() {
  if (selectedItemIndex.value < 0) {
    Notify.create({
      message: 'Select an item to edit',
      color: 'orange',
      position: 'top',
      timeout: 800,
    })
    return
  }
  const item = store.cartItems[selectedItemIndex.value]
  $q.dialog({
    title: 'Edit Item Price',
    message: `Enter new price for ${item.name}:`,
    prompt: {
      model: item.price.toString(),
      type: 'number',
    },
    cancel: true,
    persistent: true,
  }).onOk((data) => {
    const val = parseFloat(data)
    if (!isNaN(val) && val >= 0) {
      item.price = val
      Notify.create({ message: 'Price updated', color: 'positive', position: 'top' })
    }
  })
}

function handleModifier() {
  if (selectedItemIndex.value < 0) {
    Notify.create({
      message: 'Select an item to add notes/modifiers',
      color: 'orange',
      position: 'top',
      timeout: 800,
    })
    return
  }
  const item = store.cartItems[selectedItemIndex.value]
  $q.dialog({
    title: 'Item Note / Modifier',
    message: `Enter note for ${item.name}:`,
    prompt: {
      model: item.notes || '',
      type: 'text',
    },
    cancel: true,
    persistent: true,
  }).onOk((data) => {
    store.setItemNotes(selectedItemIndex.value, data)
    Notify.create({ message: 'Note updated', color: 'positive', position: 'top' })
  })
}

function handleDivider() {
  // Can be used to open the cash drawer if integrated, for now just a generic action
  Notify.create({
    message: 'Open Cash Drawer signal sent',
    color: 'teal',
    icon: 'point_of_sale',
    position: 'top',
  })
}

// ── Shift Management Handlers ─────────────────────────────
function toggleFunctionMenu() {
  showFunctionMenu.value = true
}

function handleFunctionMenuAction(action) {
  switch (action) {
    case 'open_shift':
      forceOpenShift.value = false
      showOpenShiftDialog.value = true
      break
    case 'cash_drop':
      cashMovementType.value = 'cash_drop'
      showCashMovement.value = true
      break
    case 'cash_in':
      cashMovementType.value = 'cash_in'
      showCashMovement.value = true
      break
    case 'cash_out':
      cashMovementType.value = 'cash_out'
      showCashMovement.value = true
      break
    case 'shift_summary':
      showShiftSummary.value = true
      break
    case 'close_shift':
      showCloseShift.value = true
      break
  }
}

function onShiftOpened() {
  forceOpenShift.value = false
}

async function onShiftClosed() {
  // After close, auto-open a new shift dialog
  forceOpenShift.value = true
  showOpenShiftDialog.value = true
}



function setOrderType(type) {
  store.orderType = type
  if (type !== 'dine-in') {
    store.selectedTable = null
    store.tableNumber = null
  }
  if (type !== 'delivery') {
    store.deliverySource = null
  }
  Notify.create({
    message: `Order type: ${type === 'dine-in' ? 'Table Order' : type === 'takeaway' ? 'Take Away' : 'Delivery'}`,
    color: 'primary',
    position: 'top',
    timeout: 600,
  })
}

function setDeliverySource(source) {
  store.deliverySource = source
  Notify.create({
    message: `Source: ${source.toUpperCase()}`,
    color: 'positive',
    position: 'top',
    timeout: 600,
  })
}

function handleNewOrder() {
  store.clearCart()
  selectedItemIndex.value = -1
  numBuffer.value = ''
  selectedQueueOrder.value = null
  customerSearchText.value = ''
  directPrintInvoice.value = null
}

function handleOrderLookup() {
  queueDrawer.value = true
}

/**
 * Called when user selects an order from OrderLookupDialog and clicks OK.
 * Loads the order details into the POS cart so the cashier can view items,
 * process payment, print bill, etc.
 */
function openBilling(order) {
  if (!order) return

  // Check if this order is part of a multi-order table
  let mergedOrders = []
  if (order.table_id && cashierStore.billingOrders) {
    const tableOrders = cashierStore.billingOrders.filter(o => 
      o.table_id === order.table_id &&
      o.status !== 'completed' && o.status !== 'cancelled' &&
      o.payment_status !== 'paid' && o.status !== 'paid'
    )
    if (tableOrders.length > 1) {
      mergedOrders = tableOrders
      mergedTableOrders.value = tableOrders
      // Use the actual selected order as anchor, or the first one if not matched
      order = tableOrders.find(o => o.id === order.id) || tableOrders[0]
    } else {
      mergedTableOrders.value = []
    }
  } else {
    mergedTableOrders.value = []
  }

  // Load order into POS cart (items, customer, table, etc.)
  store.loadOrderFromQueue(order, mergedOrders)

  // Set the queue order reference for PaymentDialog
  selectedQueueOrder.value = order

  // Update customer search field to show selected customer
  customerSearchText.value = order.customer_name || ''

  // Reset selection
  selectedItemIndex.value = -1
  numBuffer.value = ''

  Notify.create({
    message: `Order #${String(order.order_number || '').replace('ORD-', '')} loaded`,
    caption: `${order.order_items?.length || 0} items • ${order.customer_name || 'Walk-in'} • LKR ${order.total_amount?.toFixed(2) || '0.00'}`,
    color: 'teal',
    icon: 'receipt',
    position: 'top',
    timeout: 2500,
  })
}


// Removed duplicate handleClear
async function handleSave() {
  if (!store.orderType) {
    Notify.create({
      message: 'Please select an Order Type (Table Order, Take Away, or Delivery) first!',
      color: 'red',
      icon: 'warning',
      position: 'top',
      timeout: 2500,
    })
    return
  }

  if (store.isEmpty) {
    Notify.create({ message: 'No items in order', color: 'orange', position: 'top', timeout: 800 })
    return
  }

  Loading.show({ message: 'Sending to kitchen...' })
  try {
    const result = await store.sendToKitchen()
    if (result && result.success) {
      Loading.hide()
      // Update store state with the saved order info so payment knows this order is already in the DB
      store._loadedOrderId = result.order.id
      store.orderNumber = result.order.order_number
      
      // Also update selectedQueueOrder so processInlinePayment knows its status
      selectedQueueOrder.value = {
        id: result.order.id,
        order_number: result.order.order_number,
        status: result.order.status // use actual status from DB (auto-accepted via RPC)
      }
      Notify.create({
        message: `Order #${String(result.order.order_number || '').replace('ORD-', '')} saved!`,
        color: 'teal',
        icon: 'check_circle',
        position: 'top',
        timeout: 3000,
      })
      // store.clearCart() // User wants items to stay on screen until payment
      selectedItemIndex.value = -1
    }
  } catch (err) {
    Loading.hide()
    Notify.create({
      message: 'Failed to save',
      caption: err.message,
      color: 'red',
      position: 'top',
    })
  }
}

function handlePayment() {
  if (!store.orderType) {
    Notify.create({
      message: 'Please select an Order Type (Table Order, Take Away, or Delivery) first!',
      color: 'red',
      icon: 'warning',
      position: 'top',
      timeout: 2500,
    })
    return
  }

  if (store.isEmpty) {
    Notify.create({ message: 'No items in order', color: 'orange', position: 'top', timeout: 800 })
    return
  }

  if (isAlreadyPaid.value) {
    Notify.create({ message: 'This bill is already paid.', color: 'negative', position: 'top' })
    return
  }
  // Guard: require active shift
  if (!shiftStore.hasActiveShift) {
    Notify.create({ message: 'No active shift. Open a shift before processing payments.', color: 'red', icon: 'lock', position: 'top' })
    forceOpenShift.value = true
    showOpenShiftDialog.value = true
    return
  }
  // Keep selectedQueueOrder if loaded from Order Lookup (for queue payment flow)
  // Only null it out if no order was loaded (manual POS mode)
  if (!store._loadedOrderId) {
    selectedQueueOrder.value = null
  }
  
  // Enter IN-SCREEN Payment Mode
  isPaymentMode.value = true
  // Default selection: If it's a Delivery from Uber/PickMe/Website, select CREDIT CARD (ONLINE)
  if (store.deliverySource && ['uber', 'pickme', 'website'].includes(store.deliverySource)) {
    selectedPaymentMethod.value = 'ONLINE'
    showQuickCash.value = false
  } else {
    selectedPaymentMethod.value = 'CASH'
    showQuickCash.value = true // Default to true for Cash
  }
  
  numBuffer.value = store.total.toString()
}

function handleSplitPayment() {
  if (!store.orderType) {
    Notify.create({ message: 'Please select an Order Type first!', color: 'red', icon: 'warning', position: 'top', timeout: 2500 })
    return
  }
  if (store.isEmpty) {
    Notify.create({ message: 'No items in order', color: 'orange', position: 'top', timeout: 800 })
    return
  }
  if (isAlreadyPaid.value) {
    Notify.create({ message: 'This bill is already paid.', color: 'negative', position: 'top' })
    return
  }
  if (!shiftStore.hasActiveShift) {
    Notify.create({ message: 'No active shift. Open a shift before processing payments.', color: 'red', icon: 'lock', position: 'top' })
    forceOpenShift.value = true
    showOpenShiftDialog.value = true
    return
  }
  splitPaymentLines.value = [{ method: 'cash', amount: store.total }]
  showSplitPaymentDialog.value = true
}

async function processSplitPayment() {
  if (Math.abs(splitPaymentBalance.value) > 0.01) {
    Notify.create({ type: 'negative', message: 'Payment lines must equal order total', position: 'top' })
    return
  }
  if (isProcessingPayment.value) return

  isProcessingPayment.value = true
  Loading.show({ message: 'Processing Split Payment...' })

  // Primary method is the first line; combined label for receipts
  const primaryMethod = splitPaymentLines.value[0]?.method || 'split'

  try {
    let finalOrderId = null

    if (store._loadedOrderId && selectedQueueOrder.value) {
      // Queue order flow
      finalOrderId = store._loadedOrderId

      if (selectedQueueOrder.value.status === 'pending_waiter') {
        const { error: acceptError } = await supabase.rpc('process_waiter_accept', { p_order_id: finalOrderId })
        if (acceptError) throw new Error(acceptError.message)
      }

      const status = selectedQueueOrder.value.status
      if (status !== 'invoiced' && status !== 'paid') {
        const { error: invError } = await supabase.rpc('process_cashier_invoice', { p_order_id: finalOrderId })
        if (invError) throw new Error(invError.message)
      }

      const { data: payData, error: payError } = await supabase.rpc('process_cashier_payment', {
        p_order_id: finalOrderId,
        p_payment_method: 'split',
        p_amount_paid: store.total
      })
      if (payError) throw new Error(payError.message)
      if (!payData?.success && payData?.message !== 'Already paid.') throw new Error(payData?.error || 'Payment failed')

    } else {
      // Manual POS flow
      const res = await store.processPayment(primaryMethod)
      if (!res.success) throw new Error(res.reason || 'Split payment failed')
      finalOrderId = res.orderId
    }

    // Print receipt
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('order_id', finalOrderId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (invoices?.length > 0) {
      const realInvoice = await cashierStore.fetchInvoiceDetails(invoices[0].id)
      directPrintInvoice.value = realInvoice
      await nextTick()
      await new Promise(r => setTimeout(r, 200))
      if (directPrintRef.value?.printReceipt) {
        directPrintRef.value.printReceipt()
      }
    }

    Notify.create({ message: 'Split Payment Successful', color: 'positive', position: 'top', icon: 'check_circle' })

    if (shiftStore.hasActiveShift && finalOrderId) {
      shiftStore.recordPayment(finalOrderId, 'split', store.total)
    }

    showSplitPaymentDialog.value = false
    handleNewOrderAfterPayment()

  } catch (err) {
    console.error('Split Payment Error:', err)
    Notify.create({ message: 'Split payment error', caption: err.message, color: 'red', position: 'top' })
  } finally {
    Loading.hide()
    isProcessingPayment.value = false
  }
}

function handleSubtotal() {
  // Open bill preview — same dialog but user can print before paying
  if (store.isEmpty) {
    Notify.create({ message: 'No items in order', color: 'orange', position: 'top', timeout: 800 })
    return
  }
  selectedQueueOrder.value = null // ensure manual POS mode
  paymentDialog.value = true
}

async function handleConfirmPayment(payload) {
  isProcessingPayment.value = true
  try {
    const method = typeof payload === 'string' ? payload : payload.method
    const methodName = method === 'cash' ? 'Cash' : method === 'card' ? 'Card' : 'Online'
    const result = await store.processPayment(methodName)
    if (result && result.success) {
      // Mark the dialog as paid (shows success state + real invoice receipt)
      if (paymentDialogRef.value) {
        paymentDialogRef.value.markAsPaid(result.orderId).then(() => {
          paymentDialogRef.value.printBill()
        })
      }

      // Record payment against active shift
      if (shiftStore.hasActiveShift && result.orderId) {
        shiftStore.recordPayment(result.orderId, methodName.toLowerCase(), result.total || store.total)
      }

      Notify.create({
        message: `Payment Successful!`,
        caption: `Order paid via ${methodName}`,
        color: 'positive',
        icon: 'verified',
        position: 'top',
        timeout: 2000,
      })
    }
  } catch (err) {
    Notify.create({
      message: 'Payment Failed',
      caption: err.message,
      color: 'red',
      position: 'top',
    })
  } finally {
    isProcessingPayment.value = false
  }
}

function handleNewOrderAfterPayment() {
  store.clearCart()
  selectedItemIndex.value = -1
  numBuffer.value = ''
  selectedQueueOrder.value = null
  mergedTableOrders.value = []
  customerSearchText.value = ''
  directPrintInvoice.value = null
}

// ── Billing Queue ───────────────────────────────────────

function onOrderPaid() {
  // Called when a queue order or merged payment completes inside PaymentDialog
  selectedQueueOrder.value = null
  mergedTableOrders.value = []
  cashierStore.fetchBillingOrders()
}

// ── Park / Recall ────────────────────────────────────────

async function handleParkOrder() {
  if (store.isEmpty) {
    Notify.create({ message: 'No items to park', color: 'orange', position: 'top', timeout: 800 })
    return
  }
  try {
    const label = store.customerName
      ? `${store.customerName} – ${new Date().toLocaleTimeString()}`
      : `Parked ${new Date().toLocaleTimeString()}`
    await store.parkOrder({ label })
    store.clearCart()
    selectedItemIndex.value = -1
    selectedQueueOrder.value = null
    customerSearchText.value = ''
    Notify.create({
      message: 'Order parked',
      caption: label,
      color: 'warning',
      icon: 'pause_circle',
      position: 'top',
      timeout: 2500,
    })
  } catch (err) {
    Notify.create({
      message: 'Failed to park order',
      caption: err.message,
      color: 'red',
      position: 'top',
    })
  }
}

async function handleRecallOrder() {
  showRecallDialog.value = true
  isLoadingParked.value = true
  try {
    await store.fetchParkedOrders()
  } catch (err) {
    Notify.create({ message: 'Failed to load parked orders', caption: err.message, color: 'red', position: 'top' })
  } finally {
    isLoadingParked.value = false
  }
}

async function loadParkedOrder(po) {
  try {
    const recalled = await store.recallParkedOrder(po.id)
    // Restore cart state
    store.clearCart()
    store.orderType = recalled.order_type || null
    store.tableNumber = recalled.table_number || null
    store.selectedTable = recalled.selected_table || null
    store.customerName = recalled.customer_name || ''
    if (recalled.customer_name) {
      store.selectedCustomer = { full_name: recalled.customer_name }
    }
    store.deliveryCharge = recalled.delivery_charge || 0
    const items = recalled.cart_items || []
    items.forEach(item => {
      store.cartItems.push({ ...item })
    })
    selectedQueueOrder.value = null
    customerSearchText.value = recalled.customer_name || ''
    selectedItemIndex.value = -1
    showRecallDialog.value = false
    Notify.create({
      message: 'Order recalled',
      caption: `${items.length} items restored`,
      color: 'teal',
      icon: 'play_circle',
      position: 'top',
      timeout: 2000,
    })
  } catch (err) {
    Notify.create({ message: 'Failed to recall order', caption: err.message, color: 'red', position: 'top' })
  }
}

async function handleLogout() {
  // Lock UI instantly so they can't click anything else
  posLocked.value = true

  // Remember who was logged in
  previousCashierName.value = authStore.profile?.full_name || authStore.user?.email || 'Previous Cashier'

  // THEN sign out the current user and wait for it fully
  try {
    await authStore.signOut()
  } catch (e) {
    console.error('Sign out error:', e)
  }

  // Once fully signed out, clean up local cache
  cashierStore.cleanup()
}

function handleExit() {
  // Exit POS and go back to the main dashboard
  router.push('/dashboard')
}

/**
 * Called by POSLockScreen after a new cashier successfully signs in.
 * Reinitializes all POS stores for the new user.
 */
async function onCashierSignedIn() {
  // Re-initialize cashier store for the new user
  await cashierStore.initialize()
  // Reload menu in case branch changed
  fetchMenuItems()
  // Clear any leftover cart from previous session
  store.clearCart()
  selectedItemIndex.value = -1
  selectedQueueOrder.value = null
}

function scrollCategoriesUp() {
  if (categoryGridRef.value) {
    categoryGridRef.value.scrollTop -= 100
  }
}

function scrollCategoriesDown() {
  if (categoryGridRef.value) {
    categoryGridRef.value.scrollTop += 100
  }
}

function scrollReceiptUp() {
  if (receiptTableRef.value) {
    receiptTableRef.value.scrollTop -= 100
  }
}

function scrollReceiptDown() {
  if (receiptTableRef.value) {
    receiptTableRef.value.scrollTop += 100
  }
}

function scrollShortcutsUp() {
  if (shortcutsGridRef.value) {
    shortcutsGridRef.value.scrollTop -= 60
  }
}

function scrollShortcutsDown() {
  if (shortcutsGridRef.value) {
    shortcutsGridRef.value.scrollTop += 60
  }
}

// ── Helpers ─────────────────────────────────────────────
function fmtCurrency(val) {
  return parseFloat(val || 0).toFixed(2)
}
</script>

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
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  padding: 6px 12px;
}
.info-row {
  display: flex;
  align-items: center;
  font-size: 13px;
  width: 100%;
}
.lbl {
  color: #aaa;
  width: 100px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.customer-input {
  background: #1a1a1a;
  border: 1px solid #444;
  padding: 4px 8px;
  font-size: 13px;
  margin-left: 0;
}
.customer-input:focus {
  border-color: #3b5998;
  background: #222;
}
.flex-row-half {
  flex: 1;
  display: flex;
  align-items: center;
}
.text-right {
  justify-content: flex-end;
}
.order-status-val {
  font-size: 16px;
  letter-spacing: 1px;
}
.border-val {
  background: #333;
  padding: 2px 6px;
  border: 1px solid #555;
  border-radius: 2px !important;
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
  width: 320px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: repeat(3, 1fr);
  grid-auto-flow: column;
  column-gap: 16px;
  row-gap: 2px;
  padding: 6px 16px;
}
.summary-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.slbl { 
  color: #aaa; 
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.sval { 
  color: #ff9900; 
  font-weight: bold; 
  font-size: 13px;
  text-align: right; 
}
.txt-red {
  color: #ff4d4d;
}

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
.payment-active {
  background: #000 !important;
  color: #ffff00 !important;
  border: 3px solid #ffff00 !important;
}
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
.a-green {
  background: #2e7d32;
  color: #fff;
}
.a-orange {
  background: #e65100;
  color: #fff;
}
.a-teal {
  background: #00695c;
  color: #fff;
}
.a-purple {
  background: #4a1c6b;
  color: #e0b3ff;
}

/* Delivery Charge editable input */
.delivery-charge-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid #666;
  color: #ff9900;
  font-weight: bold;
  font-size: 13px;
  text-align: right;
  width: 80px;
  outline: none;
  padding: 0 2px;
}
.delivery-charge-input:focus {
  border-bottom-color: #ffeb3b;
  color: #ffeb3b;
}

/* Recall parked orders table */
.recall-table {
  width: 100%;
  border-collapse: collapse;
  background: #111;
  color: #fff;
  font-size: 13px;
}
.recall-table th {
  background: #222;
  border-bottom: 1px solid #333;
  padding: 8px 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #aaa;
  text-align: left;
}
.recall-table td {
  border-bottom: 1px solid #222;
  padding: 10px 10px;
}
.recall-table tr:hover td {
  background: #1e1e1e;
}
.recall-load-btn {
  background: #00695c;
  color: #fff;
  border: 1px solid #00897b;
  font-weight: bold;
  font-size: 12px;
  padding: 4px 14px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.recall-load-btn:hover {
  background: #00897b;
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
  grid-auto-rows: 40px;
  align-content: start;
  gap: 4px;
  flex: 1;
  overflow-y: auto;
  /* hide scrollbar for sleek touch UI */
  scrollbar-width: none;
}
.bottom-shortcuts-grid::-webkit-scrollbar {
  display: none;
}

.sbtn {
  background: #ffff00;
  border: 3px solid #000;
  color: #000;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}
.sbtn.active-table {
  background: #ffb300 !important;
  border: 3px solid #fff !important;
  color: #000 !important;
  font-weight: 900;
}
.sbtn.locked-table {
  background: #cc0000 !important;
  border: 3px solid #666 !important;
  color: #fff !important;
  cursor: not-allowed;
  opacity: 0.9;
}
.sbtn.active {
  border: 3px solid #fff;
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

/* POS ITEM BUTTON WITH IMAGE */
.pos-item-btn {
  height: 120px;
  display: flex !important;
  flex-direction: column;
  padding: 0 !important;
  overflow: hidden;
  border: 2px solid #000;
  background: #fff;
  transition: transform 0.1s;
  cursor: pointer;
  border-radius: 4px !important;
}
.pos-item-btn:active {
  transform: scale(0.96);
}
.item-img-wrapper {
  width: 100%;
  height: 70px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 2px solid #000;
}
.item-img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fallback-icon {
  font-size: 24px;
  display: block;
}

/* CUSTOMER AUTOCOMPLETE — Enhanced with Loyalty */
.autocomplete-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #1a1a2e;
  border: 1px solid #333;
  list-style: none;
  padding: 0;
  margin: 0;
  z-index: 1000;
  color: #fff;
  max-height: 280px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  border-radius: 0 0 6px 6px;
}
.autocomplete-list li {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #2a2a40;
  display: flex;
  align-items: center;
}
.autocomplete-list li:hover {
  background: #2a2a40;
}

/* Customer result row layout */
.customer-result-row {
  display: flex !important;
  justify-content: space-between;
  gap: 8px;
}
.cr-left {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.cr-name {
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cr-details {
  font-size: 11px;
  color: #888;
  margin-top: 1px;
}
.cr-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.cr-coins {
  font-weight: 700;
  font-size: 12px;
}
.cr-tier {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  color: #fff;
  letter-spacing: 0.5px;
}

/* Add New Customer row */
.customer-add-row {
  background: #0d1b2a !important;
  border-top: 2px solid #333 !important;
  color: #4ade80 !important;
  font-weight: 600;
  display: flex !important;
  align-items: center;
  gap: 8px;
}
.customer-add-row:hover {
  background: #1a2e3e !important;
}
.cr-add-icon { font-size: 16px; }
.cr-add-text { font-size: 12px; }

/* Redeem Button */
.btn-redeem {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #000;
  border: none;
  padding: 2px 10px;
  font-size: 10px;
  font-weight: 800;
  border-radius: 3px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: all 0.15s ease;
}
.btn-redeem:hover {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  transform: scale(1.05);
}

.item-info {
  flex: 1;
  width: 100%;
  background: #ffff00;
  display: flex;
  flex-direction: column;
  padding: 6px;
  justify-content: space-between;
}
.item-name {
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-transform: uppercase;
  color: #000;
}
.item-price {
  font-size: 11px;
  color: #000;
  font-weight: 900;
  align-self: center;
}

/* KEYPAD DISPLAY */
.keypad-display-wrapper {
  background: #333;
  padding: 4px;
;
}

/* LIVE TABLE CHART CSS */
.pos-floor-plan-box {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.transition-transform {
  transition: transform 0.2s;
}
.transition-transform:hover {
  transform: scale(1.05);
}

.keypad-display {
  background: #000;
  border: 2px solid #555;
  margin-bottom: 6px;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
}
.display-label {
  color: #888;
  font-size: 11px;
  font-weight: bold;
}
.display-value {
  color: #444;
  font-size: 24px;
  font-weight: bold;
}
.display-value.has-val {
  color: #00ff00;
}
.type-active {
  background: #ffeb3b !important;
  color: #000 !important;
  font-weight: 800 !important;
  border: 3px solid #fff !important;
}
.dimmed-action {
  opacity: 0.5;
  cursor: not-allowed !important;
  background: #444 !important;
  color: #888 !important;
  border-color: #555 !important;
}
</style>

<!-- Unscoped: Quasar q-dialog content renders in a teleported portal, outside scoped CSS scope -->
<style>
/* Dark Dialog Card — overrides Quasar defaults (must be unscoped for teleported dialogs) */
.pos-dark-dialog {
  background: #0f1120 !important;
  color: #e0e0e0 !important;
  border: 1px solid #2a2a40 !important;
  border-radius: 8px !important;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6) !important;
}
.pos-dark-dialog .q-dialog__title {
  color: #ffffff !important;
  font-weight: 700 !important;
}
.pos-dark-dialog .q-dialog__message {
  color: #b0b3c6 !important;
}
.pos-dark-dialog .q-radio {
  color: #ffffff !important;
}
.pos-dark-dialog .q-radio__label {
  color: #ffffff !important;
}
.pos-dark-dialog .q-radio__inner {
  color: #ffeb3b !important; /* gold/yellow active radio circle */
}
.pos-dark-dialog .q-radio__inner--unchecked {
  color: rgba(255, 255, 255, 0.4) !important; /* unselected circle outline */
}
.pos-dark-dialog .q-card__section {
  color: #e0e0e0 !important;
}
.pos-dark-dialog .q-field--filled .q-field__control {
  background: rgba(255,255,255,0.08) !important;
}
.pos-dark-dialog .q-field--filled .q-field__control:before {
  border-bottom-color: #444 !important;
}
.pos-dark-dialog .q-field__label {
  color: #999 !important;
}
.pos-dark-dialog .q-field__native,
.pos-dark-dialog .q-field__input {
  color: #fff !important;
}
.pos-dark-dialog .q-card__actions {
  border-top: 1px solid #2a2a40;
}

/* Redeem Preview (inside teleported dialog) */
.redeem-preview {
  background: rgba(255,255,255,0.04);
  border: 1px solid #2a2a40;
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
}
.rp-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
  color: #ccc;
}

/* Split Payment dialog (teleported outside scoped CSS) */
.split-pay-dialog {
  width: 480px;
  background: #1a1a2e;
  color: #e0e0f0;
}
.split-line {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.split-method { flex: 1; }
.split-amount { width: 160px; }
.split-order-total {
  font-size: 1.1rem;
  margin-bottom: 16px;
  padding: 8px;
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
}
.split-balance {
  font-size: 1.2rem;
  font-weight: 700;
  margin-top: 16px;
  padding: 10px;
  text-align: center;
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
}
.txt-red   { color: #ff5252; }
.txt-green { color: #69f0ae; }
.txt-yellow { color: #ffeb3b; }
</style>
