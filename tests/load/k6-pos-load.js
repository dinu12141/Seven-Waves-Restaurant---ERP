// ═══════════════════════════════════════════════════════════════════
// K6 LOAD TEST — POS & API Performance
// Seven Waves ERP — Step 07 Production Hardening
// Run: k6 run tests/load/k6-pos-load.js
// ═══════════════════════════════════════════════════════════════════

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import ws from 'k6/ws'

// ─── Configuration ──────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'https://your-project.supabase.co'
const ANON_KEY = __ENV.ANON_KEY || 'your-anon-key'

export const options = {
  scenarios: {
    // Scenario 1: POS order submission (peak lunch rush)
    pos_orders: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '1m', target: 100 },   // Ramp to 100 POS terminals
        { duration: '5m', target: 500 },   // Peak: 500 concurrent orders
        { duration: '2m', target: 500 },   // Sustain peak
        { duration: '1m', target: 0 },     // Cool down
      ],
      exec: 'posOrderFlow',
    },

    // Scenario 2: KDS realtime updates
    kds_updates: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m',
      exec: 'kdsRealtimeFlow',
    },

    // Scenario 3: Dashboard & reports
    dashboard_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      exec: 'dashboardFlow',
    },

    // Scenario 4: Finance operations
    finance_ops: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
      exec: 'financeFlow',
    },
  },

  thresholds: {
    'http_req_duration{scenario:pos_orders}':  ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{scenario:kds_updates}': ['p(95)<1000'],
    'http_req_duration{scenario:dashboard_load}': ['p(95)<2000'],
    'http_req_duration{scenario:finance_ops}': ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],           // <1% error rate
    pos_submit_duration: ['p(95)<500'],
    kds_update_duration: ['p(95)<1000'],
    report_generation_duration: ['p(95)<10000'],
  },
}

// ─── Custom Metrics ─────────────────────────────────────────────

const posSubmitDuration = new Trend('pos_submit_duration')
const kdsUpdateDuration = new Trend('kds_update_duration')
const reportGenDuration = new Trend('report_generation_duration')
const orderCounter = new Counter('orders_created')
const errorRate = new Rate('error_rate')

// ─── Headers ────────────────────────────────────────────────────

function getHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${token || ANON_KEY}`,
  }
}

// ─── Scenario: POS Order Flow ───────────────────────────────────

export function posOrderFlow() {
  group('POS Order Submission', () => {
    const startTime = Date.now()

    // 1. Create order
    const orderPayload = JSON.stringify({
      branch_id: 'test-branch-001',
      table_id: `table-${Math.floor(Math.random() * 50) + 1}`,
      order_type: 'dine_in',
      items: [
        { menu_item_id: 'item-001', quantity: Math.floor(Math.random() * 3) + 1, price: 12.50 },
        { menu_item_id: 'item-002', quantity: 1, price: 8.00 },
        { menu_item_id: 'item-003', quantity: Math.floor(Math.random() * 2) + 1, price: 15.00 },
      ],
      customer_notes: 'Load test order',
    })

    const res = http.post(
      `${BASE_URL}/rest/v1/rpc/create_pos_order`,
      orderPayload,
      { headers: getHeaders(), tags: { scenario: 'pos_orders' } }
    )

    const submitTime = Date.now() - startTime
    posSubmitDuration.add(submitTime)

    const success = check(res, {
      'POS order created': (r) => r.status === 200,
      'POS response time < 500ms': (r) => r.timings.duration < 500,
      'No duplicate order': (r) => r.status !== 409,
    })

    if (success) orderCounter.add(1)
    errorRate.add(!success)

    sleep(Math.random() * 2 + 0.5) // 0.5-2.5s between orders
  })
}

// ─── Scenario: KDS Realtime ─────────────────────────────────────

export function kdsRealtimeFlow() {
  group('KDS Realtime Updates', () => {
    const startTime = Date.now()

    // Poll for active orders (simulates KDS display refresh)
    const res = http.get(
      `${BASE_URL}/rest/v1/orders?status=in.preparing,ready&branch_id=eq.test-branch-001&select=*,order_items(*)&order=created_at.desc&limit=50`,
      { headers: getHeaders(), tags: { scenario: 'kds_updates' } }
    )

    const updateTime = Date.now() - startTime
    kdsUpdateDuration.add(updateTime)

    check(res, {
      'KDS data loaded': (r) => r.status === 200,
      'KDS response < 1s': (r) => r.timings.duration < 1000,
    })

    // Simulate order status update
    if (Math.random() > 0.7) {
      http.patch(
        `${BASE_URL}/rest/v1/rpc/update_order_status`,
        JSON.stringify({
          order_id: `order-${Math.floor(Math.random() * 1000)}`,
          status: 'ready',
        }),
        { headers: getHeaders(), tags: { scenario: 'kds_updates' } }
      )
    }

    sleep(2) // KDS refreshes every 2s
  })
}

// ─── Scenario: Dashboard ────────────────────────────────────────

export function dashboardFlow() {
  group('Dashboard Load', () => {
    // Dashboard summary
    const res1 = http.get(
      `${BASE_URL}/rest/v1/rpc/get_dashboard_summary`,
      { headers: getHeaders(), tags: { scenario: 'dashboard_load' } }
    )

    check(res1, {
      'Dashboard loaded': (r) => r.status === 200,
      'Dashboard < 2s': (r) => r.timings.duration < 2000,
    })

    // Report generation
    if (Math.random() > 0.8) {
      const startTime = Date.now()
      const res2 = http.post(
        `${BASE_URL}/rest/v1/rpc/generate_sales_report`,
        JSON.stringify({ branch_id: 'test-branch-001', period: '7d' }),
        { headers: getHeaders(), tags: { scenario: 'dashboard_load' } }
      )

      reportGenDuration.add(Date.now() - startTime)

      check(res2, {
        'Report generated': (r) => r.status === 200,
        'Report < 10s': (r) => r.timings.duration < 10000,
      })
    }

    sleep(5) // Dashboard refresh every 5s
  })
}

// ─── Scenario: Finance ──────────────────────────────────────────

export function financeFlow() {
  group('Finance Operations', () => {
    // Voucher listing
    const res1 = http.get(
      `${BASE_URL}/rest/v1/vouchers?company_id=eq.test-company&order=voucher_date.desc&limit=20`,
      { headers: getHeaders(), tags: { scenario: 'finance_ops' } }
    )

    check(res1, {
      'Vouchers loaded': (r) => r.status === 200,
    })

    // Trial balance
    const res2 = http.post(
      `${BASE_URL}/rest/v1/rpc/get_trial_balance`,
      JSON.stringify({ company_id: 'test-company', as_of_date: '2026-05-18' }),
      { headers: getHeaders(), tags: { scenario: 'finance_ops' } }
    )

    check(res2, {
      'Trial balance loaded': (r) => r.status === 200,
      'Trial balance < 3s': (r) => r.timings.duration < 3000,
    })

    sleep(3)
  })
}
