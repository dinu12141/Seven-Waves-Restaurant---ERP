// ═══════════════════════════════════════════════════════════════════
// Seven Waves ERP — Core TypeScript Types (Step 02)
// ═══════════════════════════════════════════════════════════════════

// ─── Common ─────────────────────────────────────────────────────
export type UUID = string
export type ISO8601 = string

export interface BaseEntity {
  id: UUID
  created_at: ISO8601
  updated_at?: ISO8601
  deleted_at?: ISO8601 | null
}

export interface BranchScoped {
  company_id: UUID
  branch_id: UUID
}

// ─── POS Module ─────────────────────────────────────────────────
export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'qr'
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'paid' | 'voided' | 'cancelled' | 'refunded'
export type PaymentMethod = 'cash' | 'card' | 'credit_card' | 'debit_card' | 'mobile' | 'online' | 'voucher' | 'loyalty'
export type DiscountType = 'percentage' | 'fixed'

export interface PosOrder extends BaseEntity, BranchScoped {
  order_type: OrderType
  status: OrderStatus
  table_id?: UUID | null
  customer_id?: UUID | null
  cashier_session_id?: UUID | null
  subtotal: number
  discount_type?: DiscountType | null
  discount_value: number
  discount_amount: number
  tax_amount: number
  service_charge: number
  total_amount: number
  notes?: string | null
  void_reason?: string | null
  voided_by?: UUID | null
  voided_at?: ISO8601 | null
  order_items?: PosOrderItem[]
}

export interface PosOrderItem extends BaseEntity {
  order_id: UUID
  menu_item_id: UUID
  name?: string
  quantity: number
  unit_price: number
  discount_amount: number
  status: string
  notes?: string | null
  void_reason?: string | null
}

export interface Payment extends BaseEntity {
  order_id: UUID
  company_id?: UUID
  branch_id?: UUID
  payment_method: PaymentMethod
  amount: number
  payment_type: 'sale' | 'refund' | 'void'
  reference_no?: string | null
  tip_amount: number
  change_amount: number
  tendered_amount: number
  is_refund: boolean
  refund_of?: UUID | null
  cashier_session_id?: UUID | null
}

export interface CashierSession extends BaseEntity, BranchScoped {
  till_id?: UUID | null
  cashier_id: UUID
  status: 'open' | 'closed' | 'suspended'
  opening_amount: number
  closing_amount?: number | null
  expected_amount?: number | null
  variance?: number | null
  cash_sales: number
  card_sales: number
  other_sales: number
  total_orders: number
  total_refunds: number
  total_voids: number
  opened_at?: ISO8601
  closed_at?: ISO8601 | null
}

export interface PosCreateOrderPayload {
  branch_id: UUID
  items: Array<{ menu_item_id: UUID; qty: number; notes?: string }>
  order_type?: OrderType
  table_id?: UUID | null
  customer_id?: UUID | null
  notes?: string
  discount_type?: DiscountType
  discount_value?: number
}

export interface PosPaymentPayload {
  method: PaymentMethod
  amount: number
  reference_no?: string
}

// ─── Kitchen / KDS Module ───────────────────────────────────────
export type KotStatus = 'pending' | 'accepted' | 'cooking' | 'ready' | 'served' | 'delayed' | 'cancelled'

export interface KotTicket extends BaseEntity {
  order_id: UUID
  kitchen_id: UUID
  status: KotStatus
  kot_items?: KotItem[]
}

export interface KotItem extends BaseEntity {
  kot_id: UUID
  order_item_id: UUID
  status: KotStatus
  notes?: string | null
}

export interface KitchenStation extends BaseEntity, BranchScoped {
  kitchen_id: UUID
  name: string
  station_type: string
  max_concurrent: number
  is_active: boolean
}

// ─── Inventory Module ───────────────────────────────────────────
export type MovementType = 'purchase' | 'sale' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'wastage' | 'return' | 'bom_deduction' | 'opening' | 'count' | 'correction'

export interface StockLevel {
  ingredient_id: UUID
  store_id: UUID
  quantity: number
}

export interface StockLedgerEntry extends BaseEntity {
  company_id: UUID
  branch_id: UUID
  ingredient_id: UUID
  movement_type: MovementType
  quantity: number
  balance_after: number
  unit_cost?: number | null
  total_cost?: number | null
  reference_type?: string | null
  reference_id?: UUID | null
  batch_no?: string | null
  expiry_date?: string | null
  reason?: string | null
  notes?: string | null
}

export interface StockAdjustPayload {
  branch_id: UUID
  ingredient_id: UUID
  quantity: number
  reason: string
  movement_type?: MovementType
  unit_cost?: number
  batch_no?: string
  notes?: string
}

// ─── Finance Module ─────────────────────────────────────────────
export interface JournalEntry extends BaseEntity {
  company_id: UUID
  branch_id?: UUID
  entry_number: string
  entry_date: string
  description?: string
  reference_type?: string
  reference_id?: UUID
  total_debit: number
  total_credit: number
  status: 'draft' | 'posted' | 'reversed' | 'cancelled'
  is_reversed: boolean
  journal_lines?: JournalLine[]
}

export interface JournalLine {
  id: UUID
  journal_id: UUID
  account_code: string
  account_name?: string
  description?: string
  dr_amount: number
  cr_amount: number
}

export interface ChartOfAccount {
  id: UUID
  code: string
  name: string
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
  parent_id?: UUID | null
  is_active: boolean
}

export interface PostJournalPayload {
  company_id: UUID
  branch_id?: UUID
  description: string
  lines: Array<{ account_code: string; description?: string; dr_amount: number; cr_amount: number }>
  reference_type?: string
  reference_id?: UUID
  entry_date?: string
}

export interface TrialBalanceRow {
  code: string
  name: string
  account_type: string
  debit_total: number
  credit_total: number
  balance: number
}

// ─── HR & Payroll Module ────────────────────────────────────────
export interface Employee extends BaseEntity, BranchScoped {
  profile_id?: UUID
  employee_code: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  department_id?: UUID
  designation_id?: UUID
  employment_status: 'active' | 'inactive' | 'terminated' | 'probation'
  hire_date: string
  is_active: boolean
}

export interface SalaryStructure extends BaseEntity {
  company_id: UUID
  employee_id: UUID
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  meal_allowance: number
  other_allowances: number
  other_deductions: number
  epf_employee_pct: number
  epf_employer_pct: number
  etf_employer_pct: number
  is_current: boolean
  effective_from: string
}

export interface PayrollRun extends BaseEntity {
  company_id: UUID
  branch_id: UUID
  period_start: string
  period_end: string
  status: 'draft' | 'processing' | 'processed' | 'approved' | 'paid' | 'cancelled'
  employee_count: number
  total_gross: number
  total_deductions: number
  total_net: number
}

export interface Payslip extends BaseEntity {
  payroll_run_id: UUID
  employee_id: UUID
  basic_salary: number
  gross_salary: number
  net_salary: number
  total_allowances: number
  total_deductions: number
  epf_employee: number
  epf_employer: number
  etf_employer: number
  payment_status: 'pending' | 'paid' | 'on_hold' | 'cancelled'
}

export interface AttendanceRecord extends BaseEntity {
  employee_id: UUID
  attendance_date: string
  clock_in?: ISO8601
  clock_out?: ISO8601
  status: 'present' | 'absent' | 'late' | 'half_day' | 'on_leave' | 'holiday'
  work_hours?: number
  overtime_hours?: number
}

export interface LeaveRequest extends BaseEntity {
  employee_id: UUID
  leave_type: 'annual' | 'casual' | 'sick' | 'maternity' | 'paternity' | 'unpaid' | 'special'
  start_date: string
  end_date: string
  days_count: number
  reason?: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
}

// ─── CRM & Loyalty Module ───────────────────────────────────────
export interface Customer extends BaseEntity, BranchScoped {
  first_name: string
  last_name?: string
  email?: string
  phone?: string
  source: string
  total_orders: number
  total_spent: number
  avg_order_value: number
  last_order_at?: ISO8601
}

export interface LoyaltyAccount extends BaseEntity {
  customer_id: UUID
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
  points_balance: number
  lifetime_points: number
  is_active: boolean
}

// ─── Delivery Module ────────────────────────────────────────────
export type DeliveryStatus = 'pending' | 'assigned' | 'picked_up' | 'on_the_way' | 'delivered' | 'failed' | 'cancelled'

export interface DeliveryOrder extends BaseEntity, BranchScoped {
  order_id: UUID
  rider_id?: UUID
  zone_id?: UUID
  customer_id?: UUID
  delivery_address: string
  status: DeliveryStatus
  delivery_fee: number
  actual_time?: number
  rating?: number
}

export interface Rider extends BaseEntity, BranchScoped {
  name: string
  phone: string
  vehicle_type: string
  status: 'online' | 'offline' | 'busy'
}

// ─── Notifications ──────────────────────────────────────────────
export type NotificationType = 'new_kot' | 'order_ready' | 'low_stock' | 'reorder_alert' | 'payment_received' | 'refund_issued' | 'po_approved' | 'grn_posted' | 'payroll_approved' | 'security_alert' | 'delivery_assigned' | 'feedback_received' | 'order_cancelled' | 'shift_assigned' | 'leave_approved' | 'system' | 'other'

export interface Notification extends BaseEntity {
  user_id: UUID
  branch_id?: UUID
  title: string
  body?: string
  notification_type: NotificationType
  severity: 'info' | 'warning' | 'critical' | 'success'
  entity_type?: string
  entity_id?: UUID
  action_url?: string
  is_read: boolean
  read_at?: ISO8601
}

// ─── Reporting ──────────────────────────────────────────────────
export interface DailySalesReport {
  branch_id: UUID
  sale_date: string
  total_orders: number
  paid_orders: number
  voided_orders: number
  gross_sales: number
  total_discounts: number
  net_sales: number
  avg_order_value: number
}

export interface ItemSalesReport {
  branch_id: UUID
  sale_date: string
  menu_item_id: UUID
  item_name: string
  qty_sold: number
  revenue: number
  order_count: number
}

// ─── RPC Result ─────────────────────────────────────────────────
export interface RpcResult<T = undefined> {
  success: boolean
  error?: string
  data?: T
}
