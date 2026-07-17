# UML Diagrams
## Seven Waves Restaurant ERP
**Version:** 1.0 | **Date:** 2026-07-16 | **Author:** Analyst Agent

All diagrams use Mermaid syntax. Render at https://mermaid.live or in any Mermaid-compatible viewer.

---

## 1. Use Case Diagram — All Actors & Use Cases

```mermaid
graph TD
    %% Actors
    Admin(["👤 Admin"])
    Manager(["👤 Manager"])
    Cashier(["👤 Cashier"])
    Waiter(["👤 Waiter"])
    Kitchen(["👤 Kitchen Staff"])
    Rider(["👤 Delivery Rider"])
    HROfficer(["👤 HR Officer"])
    Finance(["👤 Finance Officer"])
    Inventory(["👤 Inventory Manager"])
    Procurement(["👤 Procurement Officer"])
    Customer(["👤 Customer"])

    %% POS Use Cases
    subgraph POS["POS Module"]
        UC_AddItem["Add Items to Cart"]
        UC_Discount["Apply Discount"]
        UC_QuickPay["Quick Pay"]
        UC_ParkOrder["Park Order"]
        UC_VoidOrder["Void Order"]
    end

    %% Kitchen Use Cases
    subgraph KDS["Kitchen Display"]
        UC_StartKOT["Start KOT"]
        UC_MarkReady["Mark KOT Ready"]
        UC_PrintKOT["Print KOT"]
    end

    %% Waiter Use Cases
    subgraph WaiterApp["Waiter App"]
        UC_AcceptOrder["Accept Order"]
        UC_MarkUnavail["Mark Item Unavailable"]
        UC_ReadyAlert["Receive Ready Alert"]
    end

    %% Online Ordering
    subgraph QR["QR / Kiosk"]
        UC_ScanQR["Scan QR Code"]
        UC_KioskOrder["Place Kiosk Order"]
        UC_TrackOrder["Track Order"]
    end

    %% Finance
    subgraph Fin["Finance"]
        UC_Voucher["Create Voucher"]
        UC_Approve["Approve Voucher"]
        UC_Reports["Generate Financial Statements"]
        UC_Payroll["Run Payroll"]
    end

    %% HR
    subgraph HR["HR Module"]
        UC_Attendance["Record Attendance"]
        UC_Leave["Apply for Leave"]
        UC_ApproveLeave["Approve Leave"]
    end

    %% Inventory
    subgraph Inv["Inventory"]
        UC_GRN["Post GRN"]
        UC_StockAdj["Adjust Stock"]
        UC_StockTake["Perform Stock Take"]
    end

    %% Delivery
    subgraph Del["Delivery"]
        UC_AssignRider["Assign Rider"]
        UC_AcceptDel["Accept Delivery"]
        UC_MarkDelivered["Mark Delivered"]
    end

    %% Admin
    subgraph Adm["Administration"]
        UC_ManageUsers["Manage Users"]
        UC_ManageBranch["Manage Branches"]
        UC_ManageRoles["Manage Roles"]
    end

    Admin --> UC_ManageUsers
    Admin --> UC_ManageBranch
    Admin --> UC_ManageRoles
    Admin --> UC_Reports

    Manager --> UC_Discount
    Manager --> UC_VoidOrder
    Manager --> UC_AssignRider
    Manager --> UC_ApproveLeave
    Manager --> UC_Reports

    Cashier --> UC_AddItem
    Cashier --> UC_Discount
    Cashier --> UC_QuickPay
    Cashier --> UC_ParkOrder
    Cashier --> UC_VoidOrder

    Waiter --> UC_AcceptOrder
    Waiter --> UC_MarkUnavail
    Waiter --> UC_ReadyAlert
    Waiter --> UC_AddItem

    Kitchen --> UC_StartKOT
    Kitchen --> UC_MarkReady
    Kitchen --> UC_PrintKOT

    Rider --> UC_AcceptDel
    Rider --> UC_MarkDelivered

    HROfficer --> UC_Attendance
    HROfficer --> UC_ApproveLeave
    HROfficer --> UC_Payroll

    Finance --> UC_Voucher
    Finance --> UC_Approve
    Finance --> UC_Reports

    Inventory --> UC_GRN
    Inventory --> UC_StockAdj
    Inventory --> UC_StockTake

    Procurement --> UC_GRN

    Customer --> UC_ScanQR
    Customer --> UC_KioskOrder
    Customer --> UC_TrackOrder
    Customer --> UC_Leave
```

---

## 2. Activity Diagram — QR Order Flow

```mermaid
flowchart TD
    A([Customer scans QR code]) --> B[Browser opens /c/token]
    B --> C{Token valid?}
    C -->|No| D[Show error page]
    C -->|Yes| E[RPC: get_or_create_session_by_qr]
    E --> F[Save session to localStorage]
    F --> G[Redirect to /customer/register]
    G --> H{Skip registration?}
    H -->|Yes| I[Redirect to /touch]
    H -->|No| J[Customer enters name/phone]
    J --> I
    I --> K[Load menu for branch]
    K --> L[Customer browses & adds items]
    L --> M{Cart empty?}
    M -->|Yes| L
    M -->|No| N[Customer taps Place Order]
    N --> O[RPC: create_kiosk_order]
    O --> P{Success?}
    P -->|No| Q[Show error, retry]
    Q --> N
    P -->|Yes| R[Order in DB: pending_waiter]
    R --> S[Waiter receives notification]
    S --> T[Customer sees confirmation]
    T --> U[Customer tracks order at /order-tracking]
    U --> V([End])
```

---

## 3. Activity Diagram — POS Payment Flow

```mermaid
flowchart TD
    A([Cashier opens POS]) --> B[Browse menu by category]
    B --> C[Add items to cart]
    C --> D{More items?}
    D -->|Yes| C
    D -->|No| E[Select order type]
    E --> F{Loyalty customer?}
    F -->|Yes| G[Look up customer, load points]
    G --> H
    F -->|No| H[Apply discount if any]
    H --> I{Quick Pay or Send to Kitchen?}
    I -->|Send to Kitchen| J[sendToKitchen - pending_waiter]
    J --> K([Waiter picks up flow - UC-002])
    I -->|Quick Pay| L[processPayment called]
    L --> L1[INSERT orders + order_items]
    L1 --> L2[RPC: process_waiter_accept]
    L2 --> L3[RPC: process_cashier_invoice]
    L3 --> L4[RPC: process_cashier_payment]
    L4 --> M{Payment success?}
    M -->|No| N[Show error, order in limbo]
    M -->|Yes| O[Print receipt]
    O --> P[Clear cart]
    P --> Q[Finance journal auto-posted]
    Q --> R[Stock deducted via BOM]
    R --> S([End])
```

---

## 4. Sequence Diagram — QR Order Flow (End-to-End)

```mermaid
sequenceDiagram
    participant C as Customer (Browser)
    participant App as Vue App
    participant Supa as Supabase DB
    participant W as Waiter PWA
    participant KDS as Kitchen Display

    C->>App: Scan QR → GET /c/{token}
    App->>Supa: RPC get_or_create_session_by_qr(token)
    Supa-->>App: { session_token, table_id, branch_id }
    App->>App: Save to tableSessionStore + localStorage
    App->>C: Redirect → /customer/register
    C->>App: Enter name/phone (or skip)
    App->>C: Redirect → /touch
    App->>Supa: SELECT menu_items WHERE branch_id = ?
    Supa-->>App: Menu items []
    C->>App: Add items, tap Place Order
    App->>Supa: RPC create_kiosk_order(cart, session_token)
    Supa->>Supa: INSERT orders (status=pending_waiter)
    Supa->>Supa: INSERT order_items
    Supa->>Supa: trg_notify_waiters_new_order fires
    Supa-->>App: { order_id, order_number }
    App->>C: Show confirmation screen
    Supa-->>W: Realtime: new order event
    W->>W: Order appears in ShiftInboxPage
    W->>Supa: RPC accept_order_as_waiter(order_id)
    Supa->>Supa: UPDATE order_items SET kitchen_id
    Supa->>Supa: UPDATE orders SET status=accepted
    Supa->>Supa: trg_generate_kot fires → INSERT kot_tickets
    Supa-->>KDS: Realtime: new KOT event
    KDS->>KDS: KOT displayed on kitchen screen
    KDS->>Supa: kitchenMarkReady(kot_id)
    Supa->>Supa: UPDATE kot_tickets SET status=ready
    Supa-->>W: Realtime: KOT ready alert
    Supa-->>C: Realtime: order status → ready
```

---

## 5. Sequence Diagram — POS Payment Flow

```mermaid
sequenceDiagram
    participant P as POS (Browser)
    participant OS as orderStore.js
    participant Supa as Supabase DB
    participant Fin as Finance Engine
    participant Stk as Stock Engine
    participant KDS as Kitchen Display

    P->>OS: processPayment("cash")
    OS->>Supa: INSERT orders (status=pending_waiter)
    Supa-->>OS: { order_id }
    OS->>Supa: INSERT order_items
    Supa-->>OS: OK
    OS->>Supa: RPC process_waiter_accept(order_id)
    Supa->>Supa: UPDATE order_items SET kitchen_id
    Supa->>Supa: UPDATE orders SET status=accepted
    Supa->>Supa: trg_generate_kot → INSERT kot_tickets
    Supa-->>KDS: Realtime: new KOT
    Supa-->>OS: { success, kot_count }
    OS->>Supa: RPC process_cashier_invoice(order_id)
    Supa->>Supa: UPDATE orders SET status=invoiced
    Supa-->>OS: { success }
    OS->>Supa: RPC process_cashier_payment(order_id, method, amount)
    Supa->>Fin: INSERT finance entries (debit cash, credit revenue)
    Supa->>Stk: INSERT stock_queue (deduct BOM items)
    Supa->>Supa: UPDATE orders SET status=paid, payment_status=paid
    Supa-->>OS: { success }
    OS->>P: clearCart()
    P->>P: Show success + print receipt
```

---

## 6. Sequence Diagram — Waiter Accept Order + KOT Generation

```mermaid
sequenceDiagram
    participant W as Waiter PWA
    participant WOS as waiterOrderStore
    participant KDS as kotDispatchService
    participant Supa as Supabase DB
    participant K as Kitchen Display

    W->>WOS: initialize()
    WOS->>Supa: RPC auth_get_shift_branches()
    Supa-->>WOS: [{ branch_id }]
    WOS->>Supa: Subscribe 'waiter-orders-rt' channel
    Supa-->>WOS: Realtime: INSERT orders event
    WOS->>W: Order appears in inbox
    W->>W: Waiter reviews order
    W->>KDS: acceptOrder(order_id, unavailable_ids)
    KDS->>Supa: RPC accept_order_as_waiter(order_id, [])
    Note over Supa: Step 1: UPDATE order_items kitchen_id
    Note over Supa: Step 2: UPDATE orders status=accepted
    Note over Supa: Trigger: trg_generate_kot fires
    Supa->>Supa: INSERT kot_tickets per kitchen
    Supa->>Supa: INSERT kot_items
    Note over Supa: Trigger: trg_z_dispatch_on_accept fires
    Supa->>Supa: INSERT kot_dispatches (KITCHEN, CASHIER, INVENTORY, FINANCE)
    Supa-->>K: Realtime: kot_tickets INSERT event
    K->>K: Display new KOT
    Supa-->>WOS: Realtime: orders UPDATE (assigned_waiter_id set)
    WOS->>W: Order removed from inbox
```

---

## 7. Sequence Diagram — Kitchen Mark Ready + Serve

```mermaid
sequenceDiagram
    participant K as Kitchen Staff (KDS)
    participant KS as kitchenDisplayStore
    participant Supa as Supabase DB
    participant W as Waiter PWA
    participant C as Customer Tracker

    K->>KS: startKot(ticket_id)
    KS->>Supa: RPC kitchen_start_kot(ticket_id)
    Supa->>Supa: UPDATE kot_tickets SET status=preparing
    Supa-->>KS: Realtime: UPDATE event
    KS->>K: Move KOT to Preparing column

    K->>KS: markReady(ticket_id)
    KS->>Supa: RPC kitchen_mark_ready(ticket_id)
    Supa->>Supa: UPDATE kot_tickets SET status=ready
    Supa-->>W: Realtime: KOT ready (ReadyAlertsPage)
    Supa-->>C: Realtime: order status update
    KS->>K: Move KOT to Ready column

    W->>Supa: Waiter picks up and serves
    Supa->>Supa: UPDATE orders SET status=served (manual or auto)
```

---

## 8. Sequence Diagram — Online Order + Delivery Assignment

```mermaid
sequenceDiagram
    participant C as Customer
    participant App as Kiosk/Web App
    participant Supa as Supabase DB
    participant Mgr as Manager/Cashier
    participant R as Rider PWA

    C->>App: Place delivery order
    App->>Supa: RPC create_kiosk_order (order_type=delivery)
    Supa-->>App: order_id
    Mgr->>Supa: Assign rider to order
    Supa->>Supa: INSERT delivery_assignments (status=pending_rider)
    Supa-->>R: Realtime: new assignment
    R->>R: View assignment on DeliveryHomePage
    R->>Supa: Accept assignment
    Supa->>Supa: UPDATE delivery_assignments SET status=accepted
    R->>Supa: Mark picked up
    Supa->>Supa: UPDATE delivery_assignments SET status=picked_up
    Supa-->>C: Realtime: "Your order is on the way"
    R->>Supa: Mark delivered
    Supa->>Supa: UPDATE delivery_assignments SET status=delivered
    Supa-->>C: Realtime: "Order delivered"
```

---

## 9. State Diagram — Order Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending_waiter : INSERT orders

    pending_waiter --> accepted : accept_order_as_waiter RPC\n(triggers KOT generation)
    pending_waiter --> cancelled : Manager cancels

    accepted --> cooking : Kitchen starts KOT
    accepted --> cancelled : Manager cancels

    cooking --> ready : All KOTs marked ready
    ready --> served : Waiter serves customer
    ready --> invoiced : Cashier processes

    served --> invoiced : Cashier processes

    invoiced --> paid : process_cashier_payment RPC
    invoiced --> refunded : Refund issued

    paid --> refunded : Refund issued
    paid --> [*]
    refunded --> [*]
    cancelled --> [*]
```

---

## 10. State Diagram — Table Lifecycle

```mermaid
stateDiagram-v2
    [*] --> available : Table created

    available --> occupied : Order placed on table\n(QR scan or POS)
    available --> reserved : Reservation confirmed

    reserved --> occupied : Customer arrives
    reserved --> available : Reservation cancelled

    occupied --> available : Order paid + customer leaves
    occupied --> maintenance : Reported as damaged

    maintenance --> available : Maintenance completed
```

---

## 11. State Diagram — Delivery Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending_rider : Order assigned to rider pool

    pending_rider --> accepted : Rider accepts assignment
    pending_rider --> reassigned : Rider declines / timeout

    reassigned --> accepted : Another rider accepts
    accepted --> picked_up : Rider picks up food
    picked_up --> delivered : Rider delivers to customer
    picked_up --> failed : Delivery failed (no answer)

    delivered --> [*]
    failed --> reassigned : Retry with new rider
```

---

## 12. Data Flow Diagram — Level 0 (Context Diagram)

```mermaid
graph LR
    Customer(["Customer"]) -->|Order / QR scan| System[/"Seven Waves ERP"\]
    System -->|Order confirmation / tracking| Customer

    Staff(["Restaurant Staff"]) -->|Manage operations| System
    System -->|Orders / KOTs / Reports| Staff

    Suppliers(["Suppliers"]) -->|GRN / Invoices| System
    System -->|POs / Payments| Suppliers

    PayGateway(["Payment Gateway"]) <-->|Payment auth / confirm| System

    BiometricDev(["Biometric Devices"]) -->|Attendance data| System
    Printers(["Printers"]) <--|ESC/POS commands| System

    Supabase(["Supabase DB"]) <-->|All persistence| System
```

---

## 13. Data Flow Diagram — Level 1 (Main Processes)

```mermaid
flowchart TD
    subgraph Customer Flow
        C1[QR Scan] --> P1[Session Auth]
        P1 --> P2[Menu Browse]
        P2 --> P3[Order Creation]
    end

    subgraph Staff Operations
        P3 --> P4[Waiter Inbox]
        P4 --> P5[KOT Dispatch]
        P5 --> P6[Kitchen Preparation]
        P6 --> P7[Cashier Payment]
    end

    subgraph Backend Processing
        P7 --> P8[Finance Posting]
        P7 --> P9[Stock Deduction]
        P8 --> DS1[(Finance Ledger)]
        P9 --> DS2[(Inventory Stock)]
    end

    subgraph Reporting
        DS1 --> P10[Financial Reports]
        DS2 --> P11[Inventory Reports]
        P4 & P5 & P6 & P7 --> DS3[(Orders / KOTs)]
        DS3 --> P12[Operations Reports]
    end
```

---

## 14. Data Flow Diagram — Level 2 (Order Subsystem)

```mermaid
flowchart TD
    subgraph Order Input
        POS[POS] -->|cart| D1[Order Validator]
        QR[QR/Kiosk] -->|cart| D1
        Web[Website] -->|cart| D1
    end

    D1 -->|valid order| D2[Order Store\norders + order_items]
    D2 -->|pending_waiter| D3[Waiter Notification\ntrg_notify_waiters]
    D3 -->|realtime event| D4[Waiter PWA\nShiftInboxPage]
    D4 -->|accept_order_as_waiter| D5[KOT Orchestration Engine]

    D5 -->|kitchen assignments| D6[KOT Tickets\nkot_tickets + kot_items]
    D5 -->|cashier dispatch| D7[Cashier Queue\nkot_dispatches CASHIER]
    D5 -->|inventory dispatch| D8[Inventory Queue\nkot_dispatches INVENTORY]
    D5 -->|finance dispatch| D9[Finance Queue\nkot_dispatches FINANCE]

    D6 -->|realtime| D10[Kitchen Display]
    D7 -->|realtime| D11[Cashier Page]
    D8 --> D12[Stock Engine\nBOM deduction]
    D9 --> D13[Finance Integration\njournal entries]
```

---

## 15. Data Flow Diagram — Level 2 (Finance Subsystem)

```mermaid
flowchart TD
    subgraph Inputs
        Ord[POS Payment] -->|trigger| FI1[process_cashier_payment]
        GRN[GRN Posting] -->|trigger| FI2[fix_grn_posting]
        Payroll[Payroll Run] -->|trigger| FI3[fix_payroll_finance_post]
        Manual[Manual Voucher] -->|form| FI4[VoucherApprovalPage]
    end

    subgraph Finance Engine
        FI1 & FI2 & FI3 & FI4 -->|journal entries| DS1[(vouchers\nledger_entries)]
        DS1 -->|read| RPT1[Trial Balance]
        DS1 -->|read| RPT2[P & L Statement]
        DS1 -->|read| RPT3[Balance Sheet]
        DS1 -->|read| RPT4[Cashbook]
    end

    subgraph Outputs
        RPT1 & RPT2 & RPT3 & RPT4 --> EXP[Export / View]
    end
```

---

## 16. Business Process Flow — Main Restaurant Workflow (BPMN-style)

```mermaid
flowchart LR
    subgraph Customer Lane
        C1([Customer Arrives]) --> C2{QR or Walk-in?}
        C2 -->|QR| C3[Scan QR Code]
        C2 -->|Walk-in| C4[Seated by Staff]
        C3 --> C5[Browse Menu on Tablet]
        C4 --> C5
        C5 --> C6[Place Order]
        C6 --> C7[Receive Food]
        C7 --> C8[Request Bill]
        C8 --> C9[Make Payment]
        C9 --> C10([Customer Leaves])
    end

    subgraph Waiter Lane
        W1[Receive Order Alert] --> W2[Review Order]
        W2 --> W3[Accept / Flag Unavailable]
        W3 --> W4[Serve Food when Ready]
        W4 --> W5[Print / Send Bill]
    end

    subgraph Kitchen Lane
        K1[See New KOT] --> K2[Start Preparing]
        K2 --> K3[Mark Ready]
    end

    subgraph Cashier Lane
        CA1[See Order in Queue] --> CA2[Process Payment]
        CA2 --> CA3[Issue Receipt]
    end

    C6 --> W1
    W3 --> K1
    K3 --> W4
    C8 --> CA1
    CA3 --> C9
```

---

## 17. Component Interaction Diagram

```mermaid
graph TD
    subgraph Client SPA
        Boot[Boot: supabase.ts / auth.ts / core.ts / realtime.ts]
        AuthStore[authStore]
        OrderStore[orderStore]
        WaiterStore[waiterOrderStore]
        KDSStore[kitchenDisplayStore]
        DelivStore[deliveryStore]
        RealtimeEngine[RealtimeEngine / RealtimeManager]
        OfflineSync[OfflineSyncEngine]
    end

    subgraph Supabase
        AuthSvc[auth.users]
        DB[(PostgreSQL 17)]
        Realtime[Realtime Engine]
        EdgeFn[Edge Functions\nlogin-with-code]
    end

    Boot --> AuthStore
    Boot --> RealtimeEngine
    AuthStore -->|signInWithPassword| AuthSvc
    AuthStore -->|signInWithCode| EdgeFn
    EdgeFn --> AuthSvc
    AuthStore -->|fetchRoles / fetchBranches| DB
    OrderStore -->|INSERT orders, order_items| DB
    OrderStore -->|RPC process_waiter_accept| DB
    WaiterStore -->|RPC auth_get_shift_branches| DB
    WaiterStore -->|RPC accept_order_as_waiter| DB
    KDSStore -->|subscribe kot_tickets| Realtime
    DelivStore -->|subscribe delivery_assignments| Realtime
    RealtimeEngine -->|subscribeUserChannels| Realtime
    OfflineSync -->|IndexedDB| OfflineSync
    OfflineSync -.->|sync when online| DB
```
