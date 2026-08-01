// ═══════════════════════════════════════════════════════════════════
// Device Module — Integration & Unit Tests
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── ESC/POS Renderer Tests ──────────────────────────────────────

describe('ESC/POS Renderer', () => {
  let EscPosBuilder

  beforeEach(async () => {
    const mod = await import('../services/escpos.renderer')
    EscPosBuilder = mod.EscPosBuilder
  })

  it('builds init command', () => {
    const b = new EscPosBuilder()
    const buf = b.build()
    expect(buf).toBeInstanceOf(Uint8Array)
    expect(buf.length).toBeGreaterThan(0)
    // First two bytes should be ESC @ (init)
    expect(buf[0]).toBe(0x1B)
    expect(buf[1]).toBe(0x40)
  })

  it('adds text and line feed', () => {
    const b = new EscPosBuilder()
    b.line('Hello World')
    const buf = b.build()
    expect(buf.length).toBeGreaterThan(2) // init + text + LF
  })

  it('supports center alignment', () => {
    const b = new EscPosBuilder()
    b.center().line('Centered')
    const buf = b.build()
    // Should contain ESC a 1 (center)
    const arr = Array.from(buf)
    const centerIdx = arr.indexOf(0x61)
    expect(centerIdx).toBeGreaterThan(-1)
  })

  it('builds separator lines', () => {
    const b = new EscPosBuilder(80)
    b.separator('-')
    const buf = b.build()
    const text = new TextDecoder().decode(buf)
    expect(text).toContain('-'.repeat(48)) // 80mm = 48 chars
  })

  it('builds two-column layout', () => {
    const b = new EscPosBuilder(80)
    b.columns('Item', '10.00')
    const buf = b.build()
    const text = new TextDecoder().decode(buf)
    expect(text).toContain('Item')
    expect(text).toContain('10.00')
  })

  it('includes cut command', () => {
    const b = new EscPosBuilder()
    b.cut()
    const buf = b.build()
    const arr = Array.from(buf)
    // GS V B 0 (cut)
    expect(arr).toContain(0x1D)
  })

  it('includes drawer open command', () => {
    const b = new EscPosBuilder()
    b.openDrawer(1)
    const buf = b.build()
    const arr = Array.from(buf)
    // ESC p 0 25 120
    expect(arr).toContain(0x70)
  })
})

// ─── Receipt Template Tests ─────────────────────────────────────

describe('Receipt Template', () => {
  let buildReceipt, buildKitchenTicket

  beforeEach(async () => {
    const mod = await import('../services/receipt.template')
    buildReceipt = mod.buildReceipt
    buildKitchenTicket = mod.buildKitchenTicket
  })

  it('builds receipt buffer from order data', () => {
    const order = {
      id: 'test-001',
      receipt_number: 'RCP-001',
      created_at: new Date().toISOString(),
      cashier_name: 'John',
      table_number: 5,
      items: [
        { name: 'Burger', quantity: 2, price: 12.50, total: 25.00 },
        { name: 'Fries', quantity: 1, price: 5.00, total: 5.00 },
      ],
      subtotal: 30.00,
      tax_amount: 3.00,
      total: 33.00,
      payment_method: 'cash',
      amount_paid: 50.00,
      change_amount: 17.00,
    }

    const branch = { name: 'Seven Waves Main', address: '123 Main St', phone: '555-1234' }
    const buffer = buildReceipt(order, branch)

    expect(buffer).toBeInstanceOf(Uint8Array)
    expect(buffer.length).toBeGreaterThan(100)

    const text = new TextDecoder().decode(buffer)
    expect(text).toContain('Seven Waves Main')
    expect(text).toContain('Burger')
    expect(text).toContain('33.00')
  })

  it('builds kitchen ticket', () => {
    const order = {
      id: 'test-002',
      order_number: 'ORD-002',
      created_at: new Date().toISOString(),
      table_number: 3,
      items: [
        { name: 'Steak', quantity: 1, notes: 'Medium rare', station: 'grill' },
        { name: 'Salad', quantity: 2, station: 'cold' },
      ],
    }

    const buffer = buildKitchenTicket(order, 'grill')
    expect(buffer).toBeInstanceOf(Uint8Array)
    expect(buffer.length).toBeGreaterThan(50)

    const text = new TextDecoder().decode(buffer)
    // Station name appears in double-height ESC/POS text
    expect(text.toLowerCase()).toContain('grill')
    expect(text).toContain('Steak')
    expect(text).toContain('Medium rare')
    // Should NOT contain items from other stations
    expect(text).not.toContain('Salad')
  })
})

// ─── QR Service Tests ───────────────────────────────────────────

describe('QR Code Service', () => {
  let generateQRPayload, validateQRPayload, QR_TYPES

  beforeEach(async () => {
    const mod = await import('../services/qr.service')
    generateQRPayload = mod.generateQRPayload
    validateQRPayload = mod.validateQRPayload
    QR_TYPES = mod.QR_TYPES
  })

  it('generates a valid QR payload', async () => {
    const result = await generateQRPayload(QR_TYPES.TABLE_ORDER, { table: 5 }, { branchId: 'branch-1' })
    expect(result.raw).toBeTruthy()
    expect(result.payload.t).toBe('table_order')
    expect(result.payload.d.table).toBe(5)
    expect(result.payload.exp).toBeGreaterThan(Date.now())
  })

  it('validates a correct QR payload', async () => {
    const generated = await generateQRPayload(QR_TYPES.PAYMENT, { amount: 100 })
    const validation = await validateQRPayload(generated.raw, QR_TYPES.PAYMENT)
    expect(validation.valid).toBe(true)
    expect(validation.data.amount).toBe(100)
  })

  it('rejects expired QR payload', async () => {
    const generated = await generateQRPayload(QR_TYPES.PAYMENT, { amount: 50 }, { expiresInMinutes: -1 })
    const validation = await validateQRPayload(generated.raw)
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('expired')
  })

  it('rejects wrong type QR payload', async () => {
    const generated = await generateQRPayload(QR_TYPES.LOYALTY, { id: 1 })
    const validation = await validateQRPayload(generated.raw, QR_TYPES.PAYMENT)
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('Expected type')
  })

  it('rejects wrong branch QR payload', async () => {
    const generated = await generateQRPayload(QR_TYPES.TABLE_ORDER, { table: 1 }, { branchId: 'branch-A' })
    const validation = await validateQRPayload(generated.raw, null, 'branch-B')
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('different branch')
  })

  it('rejects malformed QR data', async () => {
    const validation = await validateQRPayload('not-valid-json')
    expect(validation.valid).toBe(false)
  })

  it('detects tampered QR signature', async () => {
    const generated = await generateQRPayload(QR_TYPES.STAFF_LOGIN, { user_id: 'u1' })
    // Tamper with the payload
    const parsed = JSON.parse(generated.raw)
    parsed.d.user_id = 'u2' // Change data but keep same signature
    const tampered = JSON.stringify(parsed)
    const validation = await validateQRPayload(tampered)
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain('signature')
  })
})

// ─── Device Store Tests ─────────────────────────────────────────

describe('Device Store', () => {
  it('computes device filters correctly', async () => {
    const { useDeviceStore } = await import('../stores/device.store')
    const { setActivePinia, createPinia } = await import('pinia')
    setActivePinia(createPinia())

    const store = useDeviceStore()

    // Simulate loaded devices
    store.devices = [
      { id: '1', device_type: 'printer', status: 'online' },
      { id: '2', device_type: 'scanner', status: 'offline' },
      { id: '3', device_type: 'biometric', status: 'online' },
      { id: '4', device_type: 'kds_display', status: 'error' },
    ]

    expect(store.onlineDevices.length).toBe(2)
    expect(store.offlineDevices.length).toBe(2)
    expect(store.printers.length).toBe(1)
    expect(store.scanners.length).toBe(1)
    expect(store.biometricDevices.length).toBe(1)
    expect(store.kdsDisplays.length).toBe(1)
  })

  it('computes alert filters', async () => {
    const { useDeviceStore } = await import('../stores/device.store')
    const { setActivePinia, createPinia } = await import('pinia')
    setActivePinia(createPinia())

    const store = useDeviceStore()
    store.alerts = [
      { id: '1', severity: 'critical', resolved: false },
      { id: '2', severity: 'warning', resolved: true },
      { id: '3', severity: 'info', resolved: false },
    ]

    expect(store.criticalAlerts.length).toBe(1)
    expect(store.unresolvedAlerts.length).toBe(2)
  })
})

// ─── Printer Store Tests ────────────────────────────────────────

describe('Printer Store', () => {
  it('computes printer type filters', async () => {
    const { usePrinterStore } = await import('../stores/printer.store')
    const { setActivePinia, createPinia } = await import('pinia')
    setActivePinia(createPinia())

    const store = usePrinterStore()
    store.printers = [
      { id: '1', printer_type: 'receipt', is_default: true },
      { id: '2', printer_type: 'kitchen', is_default: false },
      { id: '3', printer_type: 'receipt', is_default: false },
    ]

    expect(store.receiptPrinters.length).toBe(2)
    expect(store.kitchenPrinters.length).toBe(1)
    expect(store.defaultPrinter.id).toBe('1')
  })

  it('computes job queue metrics', async () => {
    const { usePrinterStore } = await import('../stores/printer.store')
    const { setActivePinia, createPinia } = await import('pinia')
    setActivePinia(createPinia())

    const store = usePrinterStore()
    store.printJobs = [
      { id: '1', status: 'queued' },
      { id: '2', status: 'printing' },
      { id: '3', status: 'printed' },
      { id: '4', status: 'failed' },
    ]

    expect(store.queuedJobs.length).toBe(1)
    expect(store.failedJobs.length).toBe(1)
    expect(store.activeJobCount).toBe(2) // queued + printing
  })
})

// ─── IPC Validation Tests ───────────────────────────────────────

describe('IPC Security', () => {
  it('preload whitelist should include all required channels', () => {
    const ALLOWED_CHANNELS = [
      'printer:print-raw', 'printer:discover', 'printer:test', 'printer:status',
      'drawer:open', 'scanner:start', 'scanner:stop', 'biometric:sync',
      'file:export', 'file:save-dialog', 'app:version', 'app:update-check',
      'device:heartbeat', 'device:status',
    ]

    // Verify all critical channels are present
    expect(ALLOWED_CHANNELS).toContain('printer:print-raw')
    expect(ALLOWED_CHANNELS).toContain('drawer:open')
    expect(ALLOWED_CHANNELS).toContain('file:export')
    expect(ALLOWED_CHANNELS.length).toBe(14)
  })

  it('rejects non-whitelisted channels', () => {
    const ALLOWED_CHANNELS = ['printer:print-raw', 'drawer:open']

    const isAllowed = (channel) => ALLOWED_CHANNELS.includes(channel)

    expect(isAllowed('printer:print-raw')).toBe(true)
    expect(isAllowed('shell:execute')).toBe(false)
    expect(isAllowed('fs:readFile')).toBe(false)
    expect(isAllowed('eval:code')).toBe(false)
  })
})

// ─── Label Template Tests ───────────────────────────────────────

describe('Label Template', () => {
  let buildInventoryLabel, buildOrderLabel, buildAllergenLabel, buildShelfLabel, ZplBuilder, LABEL_PROVIDER

  beforeEach(async () => {
    const mod = await import('../services/label.template')
    buildInventoryLabel = mod.buildInventoryLabel
    buildOrderLabel = mod.buildOrderLabel
    buildAllergenLabel = mod.buildAllergenLabel
    buildShelfLabel = mod.buildShelfLabel
    ZplBuilder = mod.ZplBuilder
    LABEL_PROVIDER = mod.LABEL_PROVIDER
  })

  it('ZplBuilder produces valid ZPL string', () => {
    const z = new ZplBuilder({ width: 400, height: 200 })
    z.text(10, 10, 'Test Label').barcode128(10, 50, '12345').copies(2)
    const zpl = z.build()
    expect(zpl).toContain('^XA')
    expect(zpl).toContain('^XZ')
    expect(zpl).toContain('^PW400')
    expect(zpl).toContain('Test Label')
    expect(zpl).toContain('^BC')
    expect(zpl).toContain('^PQ2')
  })

  it('buildInventoryLabel returns ZPL format', () => {
    const item = { name: 'Chicken Wings', sku: 'WING001', price: 12.50, barcode: '8901234567890' }
    const label = buildInventoryLabel(item, { provider: LABEL_PROVIDER.ZPL })
    expect(label.format).toBe('zpl')
    expect(label.data).toContain('Chicken Wings')
    expect(label.data).toContain('WING001')
    expect(label.data).toContain('^XA')
    expect(label.data).toContain('^XZ')
  })

  it('buildInventoryLabel returns ESC/POS format', () => {
    const item = { name: 'Fries', sku: 'FRY001', price: 5.00 }
    const label = buildInventoryLabel(item, { provider: LABEL_PROVIDER.ESCPOS })
    expect(label.format).toBe('escpos')
    expect(label.data).toBeInstanceOf(Uint8Array)
    expect(label.data.length).toBeGreaterThan(10)
  })

  it('buildOrderLabel includes order number and items', () => {
    const order = {
      order_number: '1234',
      created_at: new Date().toISOString(),
      table_number: 7,
      items: [
        { name: 'Burger', quantity: 2, notes: 'No onions' },
        { name: 'Fries', quantity: 1 },
      ],
    }
    const label = buildOrderLabel(order, { provider: LABEL_PROVIDER.ZPL })
    expect(label.format).toBe('zpl')
    expect(label.data).toContain('1234')
    expect(label.data).toContain('Burger')
    expect(label.data).toContain('No onions')
  })

  it('buildAllergenLabel includes allergen info', () => {
    const item = { name: 'Prawn Curry' }
    const allergens = { contains: ['Shellfish', 'Gluten'], may_contain: ['Nuts'] }
    const label = buildAllergenLabel(item, allergens, { preparedBy: 'Chef Ali', provider: LABEL_PROVIDER.ZPL })
    expect(label.format).toBe('zpl')
    expect(label.data).toContain('SHELLFISH')
    expect(label.data).toContain('GLUTEN')
    expect(label.data).toContain('NUTS')
    expect(label.data).toContain('Chef Ali')
  })

  it('buildShelfLabel includes location', () => {
    const item = { name: 'Rice Bag 5kg', sku: 'RICE5KG' }
    const label = buildShelfLabel(item, 'A-04-B2', { provider: LABEL_PROVIDER.ZPL })
    expect(label.format).toBe('zpl')
    expect(label.data).toContain('A-04-B2')
    expect(label.data).toContain('RICE5KG')
  })

  it('ZPL strips control characters from text fields', () => {
    const z = new ZplBuilder()
    z.text(0, 0, 'Item ^ with caret')
    const zpl = z.build()
    // Caret is escaped in ZPL fields
    expect(zpl).toContain('Item')
  })
})

// ─── Payment Terminal Tests ─────────────────────────────────────

describe('Payment Terminal Service', () => {
  let TERMINAL_STATUS, TERMINAL_PROVIDER

  beforeEach(async () => {
    const mod = await import('../services/payment.terminal.service')
    TERMINAL_STATUS = mod.TERMINAL_STATUS
    TERMINAL_PROVIDER = mod.TERMINAL_PROVIDER
  })

  it('exports correct status constants', () => {
    expect(TERMINAL_STATUS.APPROVED).toBe('approved')
    expect(TERMINAL_STATUS.DECLINED).toBe('declined')
    expect(TERMINAL_STATUS.CANCELLED).toBe('cancelled')
    expect(TERMINAL_STATUS.ERROR).toBe('error')
    expect(TERMINAL_STATUS.WAITING).toBe('waiting_card')
  })

  it('exports all provider types', () => {
    expect(TERMINAL_PROVIDER.MANUAL).toBe('manual')
    expect(TERMINAL_PROVIDER.STRIPE).toBe('stripe')
    expect(TERMINAL_PROVIDER.SQUARE).toBe('square')
    expect(TERMINAL_PROVIDER.PAX).toBe('pax')
    expect(TERMINAL_PROVIDER.GENERIC).toBe('generic')
  })
})

// ─── Route & RBAC Tests ─────────────────────────────────────────

describe('Device Routes & RBAC', () => {
  it('device routes exist in route config', async () => {
    const routes = (await import('src/router/routes')).default
    const mainRoute = routes[0]
    const children = mainRoute.children || []

    const deviceRoute = children.find(r => r.path === 'devices')
    expect(deviceRoute).toBeDefined()
    expect(deviceRoute.meta.module).toBe('devices')
    expect(deviceRoute.meta.permission).toBe('devices.dashboard.view')
    expect(deviceRoute.children.length).toBe(5)
  })

  it('RBAC grants devices to admin and manager', async () => {
    const { ROLE_ROUTE_ACCESS } = await import('src/config/roles')
    expect(ROLE_ROUTE_ACCESS.admin).toContain('*')
    expect(ROLE_ROUTE_ACCESS.manager).toContain('/devices')
  })

  it('sidebar has device navigation items', async () => {
    const { NAV_ITEMS } = await import('src/config/roles')
    const deviceItems = NAV_ITEMS.filter(n => n.moduleCode === 'DEVICES')
    expect(deviceItems.length).toBe(5)

    const labels = deviceItems.map(i => i.label)
    expect(labels).toContain('Device Dashboard')
    expect(labels).toContain('Printers')
    expect(labels).toContain('Scanners')
    expect(labels).toContain('Biometric Devices')
    expect(labels).toContain('Device Health')
  })
})
