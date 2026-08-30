import { describe, it, expect, beforeEach } from 'vitest'
import { parkedOrderService } from '../../../services/pos/parkedOrderService'

describe('Parked / Held Orders Service QA', () => {
  const memoryStorage = new Map<string, string>()

  beforeEach(() => {
    memoryStorage.clear()
    globalThis.localStorage = {
      getItem: (k: string) => memoryStorage.get(k) ?? null,
      setItem: (k: string, v: string) => memoryStorage.set(k, String(v)),
      removeItem: (k: string) => memoryStorage.delete(k),
      clear: () => memoryStorage.clear(),
      key: (idx: number) => Array.from(memoryStorage.keys())[idx] ?? null,
      length: memoryStorage.size,
    } as Storage
    parkedOrderService.clearAll()
  })

  it('should park an active order with cart items and generate a unique park ID', () => {
    const parked = parkedOrderService.parkOrder({
      orderNumber: 'ORD-101',
      customerName: 'Nimal Perera',
      customerPhone: '0771234567',
      tableNumber: 'T04',
      orderType: 'dine_in',
      tag: 'Customer stepped out',
      items: [
        { id: 'item-1', name: 'Chicken Fried Rice', price: 1200, qty: 2 },
        { id: 'item-2', name: 'Fresh Lime Juice', price: 450, qty: 2 },
      ],
      subtotal: 3300,
      discount: 0,
      discountAmount: 0,
      serviceChargeAmount: 330,
      deliveryCharge: 0,
      taxAmount: 0,
      total: 3630,
    })

    expect(parked.id).toBeDefined()
    expect(parked.id.startsWith('park_')).toBe(true)
    expect(parked.parkedAt).toBeDefined()
    expect(parked.items.length).toBe(2)
    expect(parked.total).toBe(3630)
    expect(parkedOrderService.getCount()).toBe(1)
  })

  it('should list parked orders sorted by newest first', () => {
    parkedOrderService.parkOrder({
      orderNumber: 'ORD-101',
      orderType: 'takeaway',
      items: [{ id: '1', name: 'Tea', price: 150, qty: 1 }],
      subtotal: 150,
      discount: 0,
      discountAmount: 0,
      serviceChargeAmount: 0,
      deliveryCharge: 0,
      taxAmount: 0,
      total: 150,
    })

    parkedOrderService.parkOrder({
      orderNumber: 'ORD-102',
      orderType: 'dine_in',
      items: [{ id: '2', name: 'Coffee', price: 300, qty: 1 }],
      subtotal: 300,
      discount: 0,
      discountAmount: 0,
      serviceChargeAmount: 0,
      deliveryCharge: 0,
      taxAmount: 0,
      total: 300,
    })

    const list = parkedOrderService.getParkedOrders()
    expect(list.length).toBe(2)
    expect(list[0].orderNumber).toBe('ORD-102') // newest first
    expect(list[1].orderNumber).toBe('ORD-101')
  })

  it('should recall a parked order, remove it from queue, and restore all cart data', () => {
    const original = parkedOrderService.parkOrder({
      orderNumber: 'ORD-999',
      customerName: 'Sunil',
      tableNumber: 'T02',
      orderType: 'dine_in',
      items: [{ id: 'item-10', name: 'Devilled Chicken', price: 1800, qty: 1 }],
      subtotal: 1800,
      discount: 10,
      discountAmount: 180,
      serviceChargeAmount: 162,
      deliveryCharge: 0,
      taxAmount: 0,
      total: 1782,
    })

    expect(parkedOrderService.getCount()).toBe(1)

    const recalled = parkedOrderService.recallOrder(original.id)
    expect(recalled).not.toBeNull()
    expect(recalled?.orderNumber).toBe('ORD-999')
    expect(recalled?.items[0].name).toBe('Devilled Chicken')
    expect(recalled?.total).toBe(1782)

    // Ensure it is removed from parked list after recall
    expect(parkedOrderService.getCount()).toBe(0)
    expect(parkedOrderService.getParkedOrders().length).toBe(0)
  })

  it('should void/delete a parked order without recalling it', () => {
    const order = parkedOrderService.parkOrder({
      orderNumber: 'ORD-303',
      orderType: 'takeaway',
      items: [],
      subtotal: 0,
      discount: 0,
      discountAmount: 0,
      serviceChargeAmount: 0,
      deliveryCharge: 0,
      taxAmount: 0,
      total: 0,
    })

    expect(parkedOrderService.getCount()).toBe(1)
    const deleted = parkedOrderService.deleteParkedOrder(order.id)
    expect(deleted).toBe(true)
    expect(parkedOrderService.getCount()).toBe(0)
  })
})
