import { describe, it, expect, vi, beforeEach } from 'vitest'
import { call } from '../helpers/supabaseMock'
import { ROLE_ROUTE_ACCESS, ROLE_LANDING, NAV_ITEMS } from '../../src/config/roles'
import routes from '../../src/router/routes.js'
import { evaluateRouteAccess } from '../../src/core/rbac/routeAccess'
import type { UserRole } from '../../src/stores/auth'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})

const auth = vi.hoisted(() => ({
  state: {
    currentBranch: { id: 'br-stores-1', company_id: 'co-stores-1' } as any,
    user: { id: 'user-stores-1' } as any,
  },
}))
vi.mock('src/stores/auth', () => ({ useAuthStore: () => auth.state }))
vi.mock('src/services/inventoryService', () => ({ fetchDocumentById: vi.fn() }))

import {
  createStoresPO,
  approveStoresPO,
  rejectStoresPO,
  listStoresPOs,
} from 'src/services/procurementService'

beforeEach(() => {
  sb.mock.reset()
})

describe('Stores PO Workflow & Service', () => {
  it('throws an error if no item lines are provided when creating Stores PO', async () => {
    await expect(
      createStoresPO(
        {
          doc_date: '2026-11-17',
          supplier_id: 'sup-1',
        },
        [],
        true,
      ),
    ).rejects.toThrow('At least one item line is required.')
  })

  it('createStoresPO successfully inserts header with source=stores and status=pending_approval', async () => {
    sb.mock.queue('uom', { data: { id: 'uom-kg' } })
    sb.mock.queue('purchase_orders', {
      data: {
        id: 'po-store-123',
        doc_number: 'PO-STORES-123',
        source: 'stores',
        status: 'pending_approval',
      },
    })
    sb.mock.queue('purchase_order_lines', { data: [] })
    sb.mock.queue('purchase_orders', { data: { id: 'po-store-123' } })

    const res = await createStoresPO(
      {
        doc_date: '2026-11-17',
        expected_date: '2026-11-24',
        supplier_id: 'sup-1',
        warehouse_id: 'wh-main',
        remarks: 'Urgent restocking',
      },
      [
        {
          line_number: 1,
          item_id: 'item-rice',
          uom_id: 'uom-kg',
          quantity: 25,
          unit_price: 240,
        },
      ],
      true,
    )

    expect(res).toBeDefined()
    expect(res.id).toBe('po-store-123')
    expect(res.status).toBe('pending_approval')
    expect(res.subtotal).toBe(6000)

    const insertPo = sb.mock.on('purchase_orders').find((q: any) => call(q, 'insert'))
    const insertArgs: any = call(insertPo, 'insert')?.args[0]
    expect(insertArgs.source).toBe('stores')
    expect(insertArgs.status).toBe('pending_approval')
    expect(insertArgs.supplier_id).toBe('sup-1')
  })

  it('createStoresPO with submitForApproval=false saves as draft', async () => {
    sb.mock.queue('uom', { data: { id: 'uom-kg' } })
    sb.mock.queue('purchase_orders', {
      data: {
        id: 'po-draft-1',
        doc_number: 'PO-STORES-DRAFT',
        source: 'stores',
        status: 'draft',
      },
    })
    sb.mock.queue('purchase_order_lines', { data: [] })
    sb.mock.queue('purchase_orders', { data: { id: 'po-draft-1' } })

    const res = await createStoresPO(
      {
        doc_date: '2026-11-17',
        supplier_id: 'sup-1',
      },
      [
        {
          line_number: 1,
          item_id: 'item-oil',
          uom_id: 'uom-liter',
          quantity: 10,
          unit_price: 550,
        },
      ],
      false,
    )

    expect(res.status).toBe('draft')
    expect(res.total_amount).toBe(5500)
  })

  it('approveStoresPO sets status=approved and timestamps approved_at', async () => {
    sb.mock.queue('purchase_orders', {
      data: [{ id: 'po-store-123', status: 'approved' }],
    })

    const result = await approveStoresPO('po-store-123')
    expect(result.success).toBe(true)
    expect(result.status).toBe('approved')

    const updateQuery = sb.mock.on('purchase_orders').find((q: any) => call(q, 'update'))
    const updateArgs: any = call(updateQuery, 'update')?.args[0]
    expect(updateArgs.status).toBe('approved')
    expect(updateArgs.approved_by).toBe('user-stores-1')
    expect(updateArgs.approved_at).toBeDefined()
  })

  it('rejectStoresPO sets status=rejected, reject_reason, and cancelled_at', async () => {
    sb.mock.queue('purchase_orders', {
      data: [{ id: 'po-store-123', status: 'rejected', reject_reason: 'Too expensive' }],
    })

    const result = await rejectStoresPO('po-store-123', 'Price too high')
    expect(result.success).toBe(true)
    expect(result.status).toBe('rejected')

    const updateQuery = sb.mock.on('purchase_orders').find((q: any) => call(q, 'update'))
    const updateArgs: any = call(updateQuery, 'update')?.args[0]
    expect(updateArgs.status).toBe('rejected')
    expect(updateArgs.reject_reason).toBe('Price too high')
    expect(updateArgs.cancelled_at).toBeDefined()
  })

  it('listStoresPOs queries purchase_orders filtering for source=stores', async () => {
    sb.mock.queue('purchase_orders', {
      data: [
        {
          id: 'po-s1',
          doc_number: 'PO-001',
          source: 'stores',
          status: 'pending_approval',
        },
      ],
    })

    const pos = await listStoresPOs()
    expect(pos).toHaveLength(1)
    expect(pos[0].id).toBe('po-s1')

    const selectQuery = sb.mock.on('purchase_orders').find((q: any) => call(q, 'select'))
    expect(selectQuery).toBeDefined()
  })
})

describe('Stores Role & Navigation RBAC Access', () => {
  it('stores role is registered in ROLE_ROUTE_ACCESS and ROLE_LANDING', () => {
    expect(ROLE_ROUTE_ACCESS.stores).toBeDefined()
    expect(ROLE_ROUTE_ACCESS.stores).toContain('/inventory/purchase-orders')
    expect(ROLE_LANDING.stores).toBe('/inventory/purchase-orders')
  })

  it('NAV_ITEMS contains Purchase Orders under INVENTORY with stores role', () => {
    const invPO = NAV_ITEMS.find((n) => n.to === '/inventory/purchase-orders')
    expect(invPO).toBeDefined()
    expect(invPO?.roles).toContain('stores')
    expect(invPO?.permission).toBe('inventory.purchase_orders.view')
  })

  it('NAV_ITEMS contains Stores PO under PROCUREMENT with procurement role', () => {
    const procStoresPO = NAV_ITEMS.find((n) => n.to === '/procurement/stores-po')
    expect(procStoresPO).toBeDefined()
    expect(procStoresPO?.roles).toContain('procurement')
    expect(procStoresPO?.permission).toBe('procurement.stores_po.view')
  })

  it('evaluates route access correctly for stores role', () => {
    type R = { path: string; meta?: Record<string, unknown>; children?: R[]; redirect?: unknown }
    function flatten(rs: R[], parents: R[] = [], base = ''): { path: string; matched: R[] }[] {
      const out: { path: string; matched: R[] }[] = []
      for (const r of rs) {
        const p = r.path.startsWith('/') ? r.path : `${base.endsWith('/') ? base : base + '/'}${r.path}`
        const chain = [...parents, r]
        if (r.children) out.push(...flatten(r.children, chain, p))
        else if (!r.redirect) out.push({ path: p.replace(/\/$/, '') || '/', matched: chain })
      }
      return out
    }

    const all = flatten(routes as unknown as R[])
    const canAccess = (rolesList: UserRole[], path: string, perms: string[] = []) => {
      const hit = all.find((r) => r.path === path)
      if (!hit) throw new Error(`Route ${path} not found in routes.js`)
      return evaluateRouteAccess(rolesList, perms, hit.matched, path).allowed
    }

    // Stores role CAN access inventory purchase orders ONLY
    expect(canAccess(['stores'], '/inventory/purchase-orders')).toBe(true)
    // Stores role CANNOT access general inventory items, stocktake, admin or finance
    expect(canAccess(['stores'], '/inventory/items')).toBe(false)
    expect(canAccess(['stores'], '/inventory/stocktake')).toBe(false)
    expect(canAccess(['stores'], '/admin/users')).toBe(false)
    expect(canAccess(['stores'], '/finance/dashboard')).toBe(false)

    // Procurement role CAN access procurement stores-po
    expect(canAccess(['procurement'], '/procurement/stores-po')).toBe(true)
  })
})
