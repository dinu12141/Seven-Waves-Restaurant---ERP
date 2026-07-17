# Hardware UX Design — Seven Waves Restaurant ERP

> UX design for all physical hardware integrations. Designed for high-stress, high-speed food service environments: greasy fingers, dim kitchens, loud environments, time pressure.

---

## 1. POS Terminal Screen Layout

**Hardware:** 15"–24" touchscreen monitor at cashier counter  
**Orientation:** Landscape  
**Resolution:** 1280×800 minimum, 1920×1080 recommended  
**Distance:** ~60–90cm (arm's length)

### Design Principles for POS
- Minimum tap target: **56px** (`--erp-touch-pos`) — larger than WCAG minimum
- Color contrast critical — cashier works under bright shop lighting
- Visual feedback within **100ms** of tap
- No hover states (touch-only device)
- No right-click menus
- Keyboard entry for quick search / barcode scan input

### POS Layout Spec

```
FULL SCREEN — 1920×1080 — LANDSCAPE
═══════════════════════════════════════════════════════════════════════════
[ CATEGORY TABS — 48px height — horizontal scroll ]
  [🍔 Mains] [🥗 Salads] [🍹 Drinks] [🍰 Desserts] [⭐ Today's Special]
═══════════════════════════════════════════════════════════════════════════
│                           │                                            │
│  MENU ITEM GRID           │  ORDER CART                               │
│  Left: 58% width          │  Right: 42% width                        │
│                           │                                            │
│  ┌──────────┐ ┌────────┐  │  Header: Table 5 · Dine In              │
│  │  [IMG]   │ │  [IMG] │  │  ─────────────────────────────          │
│  │          │ │        │  │  Wagyu Burger    ×1      SAR 55         │
│  │ Wagyu    │ │ Caesar │  │     [─]  1  [+]  🗑                     │
│  │ Burger   │ │ Salad  │  │  ─────────────────────────────          │
│  │ SAR 55   │ │ SAR 28 │  │  Caesar Salad    ×2      SAR 56         │
│  │ [ADD 56px│ │ [ADD]  │  │     [─]  2  [+]  🗑                     │
│  └──────────┘ └────────┘  │  ─────────────────────────────          │
│  ┌──────────┐ ┌────────┐  │  Pepsi           ×1      SAR 10         │
│  │  [IMG]   │ │  [IMG] │  │     [─]  1  [+]  🗑                     │
│  │ Ribeye   │ │ Grilled│  │  ─────────────────────────────          │
│  │ Steak    │ │ Chicken│  │  Subtotal:             SAR 121          │
│  │ SAR 95   │ │ SAR 35 │  │  VAT (15%):             SAR 18          │
│  │ [ADD]    │ │ [ADD]  │  │  ─────────────────────────────          │
│  └──────────┘ └────────┘  │  TOTAL:                SAR 139          │
│                           │  ─────────────────────────────          │
│  [🔍 Search — 48px]       │  [🗑 Clear All]  [💾 Hold Order]        │
│                           │                                            │
│                           │  ┌────────────────────────────────┐      │
│                           │  │  💳 CHARGE SAR 139.00 — 64px  │      │
│                           │  └────────────────────────────────┘      │
═══════════════════════════════════════════════════════════════════════════
```

### POS Color Coding
- **Item card background:** `var(--erp-bg-card)` (white/dark)
- **ADD button:** `#f97316` orange — high visibility, food energy color
- **CHARGE button:** `#16a34a` green — money/go
- **CLEAR button:** `#dc2626` red — danger/destructive
- **Cart item row hover:** subtle blue highlight to show selection

### POS Barcode Scanner Integration
When cashier scans a barcode:
1. Focus is on hidden `<input type="text" />` field listening for rapid keystrokes
2. Barcode scanners type at ~1000 chars/sec (much faster than humans)
3. On `Enter` keystroke within 100ms of scan complete: look up item by SKU
4. Visual feedback: item flashes in cart + audio "beep" (Web Audio API)
5. If item not found: red flash + error sound

---

## 2. Customer-Facing Display (CFD)

**Hardware:** Small screen (7"–10") facing the customer at the counter  
**Orientation:** Portrait or Landscape  
**Distance:** ~1m from customer

### Design Spec
- Large font (min 24px for item names)
- Show: current order items + prices + total
- Clear branding (logo top)
- Loyalty points earned preview (bottom)

```
CUSTOMER DISPLAY — PORTRAIT 480×800
┌────────────────────┐
│  🌊 SEVEN WAVES    │
│  Thank you, Ahmed! │
├────────────────────┤
│ YOUR ORDER:        │
│                    │
│ Wagyu Burger  ×1   │
│           SAR 55   │
│                    │
│ Caesar Salad  ×2   │
│           SAR 56   │
│                    │
│ Pepsi         ×1   │
│           SAR 10   │
├────────────────────┤
│ TOTAL:  SAR 139    │
│ VAT:    SAR 18     │
│ GRAND:  SAR 157    │
├────────────────────┤
│ ⭐ You earn        │
│    157 points!     │
│ Total: 2,847 pts   │
└────────────────────┘
```

---

## 3. Receipt Template Design (Thermal Printer)

**Hardware:** 58mm or 80mm thermal printer (Epson, Star, etc.)  
**Connection:** USB, Bluetooth, or Network (managed via `src/modules/devices/`)  
**Format:** Plain text + ESC/POS commands OR HTML print via `BillPrintTemplate.vue`

### 80mm Receipt Template

```
════════════════════════════
      🌊 SEVEN WAVES
    Restaurant & Lounge
  123 King Fahd St, Riyadh
   Tel: +966 11 234 5678
════════════════════════════
 Invoice #:  INV-2026-1042
 Date:       15 Jan 2026
 Time:       14:32:10
 Table:      5
 Waiter:     Ahmed Hassan
════════════════════════════
 ITEM             QTY  PRICE
 ─────────────── ─── ──────
 Wagyu Burger      1   55.00
 Caesar Salad      2   56.00
 Pepsi             1   10.00
 ─────────────── ─── ──────
 Subtotal:            121.00
 VAT (15%):            18.15
 ─────────────────────────
 TOTAL:         SAR 139.15
═══════════════════════════
 Payment: Cash
 Tendered:  SAR 150.00
 Change:     SAR  10.85
════════════════════════════
 Loyalty Points: +139
 Your Balance:  2,986 pts
════════════════════════════
  Thank you for dining with
      Seven Waves! 🌊
  ★ Rate us on Google ★
════════════════════════════
   [QR CODE — Receipt URL]
════════════════════════════
```

### UX Rules for Receipts
- Font size: 10pt (thermal standard)
- Bold for totals and header
- Separator lines use `═` (double) for sections, `─` (single) for items
- VAT breakdown required (Saudi VAT regulations)
- QR code at bottom for digital receipt
- Loyalty summary only if customer identified
- Kitchen copy: items only (no prices), large font 14pt

---

## 4. Kitchen Display (KDS) Screen Layout

**Hardware:** 24"–43" commercial display (wall-mounted), often TV  
**Orientation:** Landscape  
**Distance:** 1.5–3m (staff standing at prep station)  
**Environment:** Dim kitchen, hot, greasy, noisy

### KDS Design Principles
- **Dark mode ONLY** — white backgrounds in kitchens cause eye strain
- **Font size minimum 18px for item names**, 24px for order numbers
- **Color = Status:** Red=New, Amber=In Progress, Green=Ready
- **Large buttons (64px):** `--erp-touch-kds` — must work with gloved hands
- **Timer is critical** — shows elapsed time since order placed
- **Audio alerts** for new orders — visual isn't enough in noisy kitchen
- **No scroll if possible** — all tickets visible on screen

### KDS Layout

```
FULLSCREEN — 1920×1080 — DARK MODE ONLY
─────────────────────────────────────────────────────────────
 🍳 KITCHEN  ·  MAIN KITCHEN  ·  14:32:10    [🔇 Mute] [⚙]
─────────────────────────────────────────────────────────────
│   🆕 NEW (2)        │  🍳 IN PROGRESS (1)  │  ✅ READY (1) │
│   ─────────────── │  ─────────────────  │  ─────────── │
│ ┌──────────────┐  │ ┌───────────────┐  │ ┌──────────┐ │
│ │ KOT-1042 T-5 │  │ │ KOT-1040 T-2  │  │ │KOT-1038  │ │
│ │ 🔴 02:45     │  │ │ 🔴 09:12 LATE │  │ │ READY ✅ │ │
│ │──────────────│  │ │───────────────│  │ │──────────│ │
│ │ ×2 Burger    │  │ │ ×1 Ribeye Med │  │ │×3 Fish   │ │
│ │ ×1 Fish+Chip │  │ │ ×2 Chicken    │  │ │×1 Pasta  │ │
│ │ ×3 Pepsi     │  │ │ NOTE: no onion│  │ └──────────┘ │
│ │              │  │ │               │  │              │
│ │ [▶ 64px btn] │  │ │ [✓ 64px btn]  │  │              │
│ └──────────────┘  │ └───────────────┘  │              │
│                    │                   │              │
│ ┌──────────────┐  │                   │              │
│ │ KOT-1043 T-10│  │                   │              │
│ │ 🟡 00:30     │  │                   │              │
│ │ ×1 Sushi Plt │  │                   │              │
│ │ [▶ START]    │  │                   │              │
│ └──────────────┘  │                   │              │
─────────────────────────────────────────────────────────────
```

### KDS Timer Color Rules
| Elapsed Time | Color | Meaning |
|-------------|-------|---------|
| 0–5 min | `#22c55e` Green | Normal |
| 5–8 min | `#f59e0b` Amber | Getting slow |
| 8+ min | `#ef4444` Red + pulse | OVERDUE |

### KDS Audio UX
- New order: 2-tone chime (high-low)
- Order getting late (8min): urgent beep ×3
- Mark ready: soft confirmation tone
- Mute toggle in header — persisted per device (localStorage)
- Volume controlled by hardware (no software volume control needed)

---

## 5. Barcode Scan Feedback UX

**Hardware:** USB or Bluetooth barcode scanner  
**Contexts:** Inventory receiving (GRN), POS item lookup, inventory stocktake

### Scan Feedback States

```
SUCCESSFUL SCAN:
┌─────────────────────────────────────┐
│  ✅  Item Found                     │
│                                     │
│  [BARCODE ANIMATION — green flash]  │
│                                     │
│  Wagyu Beef Patty 200g             │
│  SKU: WBP-200 · Stock: 45 units    │
│                                     │
│  [Quantity input auto-focused: 1_]  │
└─────────────────────────────────────┘
+ Audio: short beep ✓

ITEM NOT FOUND:
┌─────────────────────────────────────┐
│  ❌  Barcode Not Found              │
│  123456789012                       │
│                                     │
│  [Add New Item?] [Try Again]        │
└─────────────────────────────────────┘
+ Audio: low error buzz

DUPLICATE SCAN (already in cart/GRN):
┌─────────────────────────────────────┐
│  ⚠️  Already Added                  │
│  Wagyu Beef Patty — Qty updated    │
│  New Qty: 2                         │
└─────────────────────────────────────┘
+ Audio: double click
```

### Implementation Notes
- Use `<input type="text" ref="barcodeInput" style="opacity:0; position:absolute" />` as the scanner sink
- Detect scanner vs. human input by keypress timing (scanner fires chars in <50ms intervals)
- After successful scan, return focus to barcode input automatically
- On GRN document: tab order goes Barcode → Quantity → Barcode

---

## 6. Fingerprint Scan UX Flow

**Hardware:** Fingerprint reader (USB biometric scanner, managed in `src/modules/devices/`)  
**Contexts:** HR Attendance check-in/check-out

### Fingerprint UX States

```
IDLE STATE:
┌──────────────────────────────┐
│                              │
│    [ 👆 FINGER ICON ]        │
│                              │
│  Place finger to clock in    │
│                              │
│  ─── OR ───                  │
│  [Enter Employee ID]         │
│                              │
└──────────────────────────────┘

SCANNING:
┌──────────────────────────────┐
│  ⟳ Scanning...               │
│                              │
│    [ PULSE ANIMATION ]       │
│    [ Blue ring animation ]   │
│                              │
└──────────────────────────────┘

SUCCESS:
┌──────────────────────────────┐
│  ✅ CLOCKED IN               │
│                              │
│  Ahmed Hassan                │
│  ID: EMP-0042               │
│  Time: 14:32:10             │
│  Shift: Morning (07:00–15:00)│
│                              │
│  [Dismiss in 3s...]         │
└──────────────────────────────┘
+ Audio: pleasant chime

FAILURE / NOT REGISTERED:
┌──────────────────────────────┐
│  ❌ Not Recognized           │
│                              │
│  Fingerprint not found.      │
│  Try again or see Manager.   │
│                              │
│  [Try Again] [Manual Entry]  │
└──────────────────────────────┘
+ Audio: error tone
```

---

## 7. QR Code Display UX

**Contexts:** Table QR codes (customer self-order), Receipt QR (digital receipt), Menu QR

### Table QR Card Design

```
TABLE QR CARD — Print/Display Design
┌─────────────────────────────────────┐
│                                     │
│         🌊  SEVEN WAVES            │
│                                     │
│    ┌─────────────────────────┐     │
│    │                         │     │
│    │   [QR CODE — 200×200]  │     │
│    │                         │     │
│    └─────────────────────────┘     │
│                                     │
│           TABLE  5                 │
│                                     │
│  Scan to order from your phone!    │
│                                     │
│  🍽️ Menu · 🛒 Cart · 📋 Track      │
│                                     │
└─────────────────────────────────────┘
```

### QR Code Generation (from TablesManagementPage.vue)
- URL format: `{VITE_APP_PUBLIC_URL}/c/{qrToken}`
- Fallback: `window.location.origin` (always correct for current deployment)
- Admin can override base URL via `localStorage.setItem('sw_qr_base_url', '...')`
- QR code library: Should use `qrcode.vue` or `vue-qrcode-component`
- Print size recommendation: 80mm × 80mm table card, laminated

---

## 8. Payment Terminal UX Flow

**Hardware:** mPOS terminal (STC Pay, MyFatoorah, Foodics Pay integration)  
**Flow integration:** `src/services/payment.service.ts` → PaymentDialog.vue

### Payment UX States

```
STEP 1 — SELECT PAYMENT METHOD:
┌───────────────────────────────────────┐
│  💳 Payment — SAR 157.00             │
│  ─────────────────────────────────── │
│                                       │
│  [💵 CASH]    [💳 CARD]  [📱 MADA]  │
│                                       │
│  [🎁 Loyalty Points (2,847)]         │
│  [🔖 Split Bill]                     │
└───────────────────────────────────────┘

STEP 2 — CASH PAYMENT:
┌───────────────────────────────────────┐
│  💵 Cash Payment                     │
│  Total Due:  SAR 157.00             │
│                                       │
│  Tendered:  [     150    ] SAR       │
│  [100] [150] [200] [500] [exact]    │
│                                       │
│  Change:     SAR 0.00               │
│                                       │
│  [✓ CONFIRM PAYMENT]                │
└───────────────────────────────────────┘

STEP 3 — CARD/MADA (terminal):
┌───────────────────────────────────────┐
│  💳 Card Payment                     │
│  Total:  SAR 157.00                 │
│                                       │
│  ⏳ Waiting for terminal...          │
│  [Payment terminal animation]        │
│                                       │
│  Insert/tap card on terminal         │
│                                       │
│  [✗ Cancel]                          │
└───────────────────────────────────────┘

SUCCESS:
┌───────────────────────────────────────┐
│  ✅ Payment Successful!              │
│  SAR 157.00 — Card                  │
│                                       │
│  [🖨 Print Receipt]                  │
│  [📱 WhatsApp Receipt]               │
│  [✓ Done — New Order]               │
└───────────────────────────────────────┘
```

---

## 9. Label Printer Output Design

**Hardware:** Label printer (Zebra, Brother) for inventory labels, price tags, kitchen labels  
**Format:** ZPL (Zebra) or ESC/Label

### Kitchen Prep Label (small, 2"×1")
```
┌──────────────────────┐
│ ALLERGEN: GLUTEN     │
│ Wagyu Burger Patty   │
│ 200g · Exp: 16/01/26 │
│ Prep: Ahmed  14:32   │
└──────────────────────┘
```

### Price Tag Label (retail/takeaway)
```
┌────────────────────────┐
│  🌊 SEVEN WAVES        │
│  Wagyu Burger          │
│                        │
│  SAR 55.00             │
│  Incl. VAT             │
│                        │
│  [Barcode: 6281234567] │
└────────────────────────┘
```

---

## 10. General Hardware UX Principles

### Environment-Aware Design

| Environment | Key Considerations | Design Response |
|------------|-------------------|-----------------|
| POS Counter | Bright lighting, speed | Large buttons, high contrast, quick feedback |
| Kitchen | Dim, hot, noisy, gloved hands | Dark mode, large touch targets (64px), audio alerts |
| Table (customer) | Variable lighting, consumer phone | Consumer-grade UI, patience for slower interactions |
| Manager tablet | Mobile, walking around | Bottom nav, quick summaries, minimal data entry |
| Delivery (riding) | Sunlight, moving, gloved | Huge text, minimal interaction required while riding |
| Office (HR/Finance) | Desktop, desk | Compact dense ERP layout, keyboard shortcuts |

### One-Hand Operation (Mobile PWA)
- Bottom navigation bar places primary actions in thumb reach (bottom 80px)
- Destructive actions require confirmation dialog (two taps)
- No critical actions in top 1/3 of screen (thumb dead zone on tall phones)

### Feedback Latency Budget
| Action | Max Feedback Time |
|--------|------------------|
| Button tap (visual) | 100ms |
| Form submission (spinner) | 200ms |
| Data load (skeleton) | 300ms |
| Toast notification | 500ms |
| Print dialog | 1000ms |
| Payment processing | Up to 30s (with live status) |
