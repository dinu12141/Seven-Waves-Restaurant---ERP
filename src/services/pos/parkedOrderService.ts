/**
 * Parked / Held Orders Service for POS
 * Allows parking active orders in memory / localStorage / Supabase and recalling them
 */

export interface ParkedOrderItem {
  id: string | number
  name: string
  price: number
  qty: number
  variant?: string
  notes?: string
  category?: string
  image?: string
  menu_item_id?: string
}

export interface ParkedOrder {
  id: string
  orderNumber: string | number
  parkedAt: string
  tag?: string
  customerName?: string
  customerPhone?: string
  tableNumber?: string | number
  orderType: string
  items: ParkedOrderItem[]
  subtotal: number
  discount: number
  discountAmount: number
  serviceChargeAmount: number
  deliveryCharge: number
  taxAmount: number
  total: number
  notes?: string
  cashierName?: string
}

const STORAGE_KEY = 'erp_pos_parked_orders'

class ParkedOrderService {
  private parkedOrders: ParkedOrder[] = []

  constructor() {
    this.loadFromStorage()
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem(STORAGE_KEY)
        if (data) {
          this.parkedOrders = JSON.parse(data)
        }
      }
    } catch (e) {
      console.warn('[ParkedOrderService] Failed to load parked orders:', e)
      this.parkedOrders = []
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.parkedOrders))
      }
    } catch (e) {
      console.error('[ParkedOrderService] Failed to save parked orders:', e)
    }
  }

  /**
   * Get all parked orders (newest first)
   */
  getParkedOrders(): ParkedOrder[] {
    return [...this.parkedOrders]
  }

  /**
   * Get count of currently parked orders
   */
  getCount(): number {
    return this.parkedOrders.length
  }

  /**
   * Park / Hold an active order
   */
  parkOrder(orderData: Omit<ParkedOrder, 'id' | 'parkedAt'> & { tag?: string }): ParkedOrder {
    const newParked: ParkedOrder = {
      ...orderData,
      id: 'park_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      parkedAt: new Date().toISOString(),
    }

    this.parkedOrders.unshift(newParked)
    this.saveToStorage()
    return newParked
  }

  /**
   * Recall a parked order by ID and remove it from parked list
   */
  recallOrder(id: string): ParkedOrder | null {
    const index = this.parkedOrders.findIndex((p) => p.id === id)
    if (index === -1) return null

    const [order] = this.parkedOrders.splice(index, 1)
    this.saveToStorage()
    return order
  }

  /**
   * Delete / Void a parked order without recalling
   */
  deleteParkedOrder(id: string): boolean {
    const index = this.parkedOrders.findIndex((p) => p.id === id)
    if (index === -1) return false

    this.parkedOrders.splice(index, 1)
    this.saveToStorage()
    return true
  }

  /**
   * Clear all parked orders
   */
  clearAll(): void {
    this.parkedOrders = []
    this.saveToStorage()
  }
}

export const parkedOrderService = new ParkedOrderService()
