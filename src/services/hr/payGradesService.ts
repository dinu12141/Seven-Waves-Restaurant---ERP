// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — HR Pay Grades & Fixed Additions Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase as defaultClient } from '../../boot/supabase'

export interface PayGradeAddition {
  id: string
  code: string // Fixed_All_Code (e.g. '0004')
  additionCode: string // Fixed_All_Addition_code (e.g. '01', '02', '05', '06')
  gradeCode: string // Fixed_All_Grades (e.g. 'CR 02')
  additionName: string // Fixed_All_Addition (e.g. 'VARIABLE ALLOWANCE')
  amount: number // Fixed_All_Amount (e.g. 9000.00)
}

export interface PayGrade {
  code: string // e.g. 'CR 02'
  name: string // e.g. 'Cashier Grade 02'
  department: string // e.g. 'CASHIER'
  templateCode?: string // default '0004'
  additions: PayGradeAddition[]
}

export interface StandardAdditionType {
  code: string
  name: string
  description?: string
}

// ── Standard Master Additions / Allowances ──────────────────────────────────
export const STANDARD_ADDITIONS: StandardAdditionType[] = [
  { code: '01', name: 'VARIABLE ALLOWANCE', description: 'Monthly variable allowance' },
  { code: '02', name: 'SERVICE CHARGE', description: 'Restaurant service charge distribution' },
  { code: '03', name: 'HOUSING ALLOWANCE', description: 'Fixed accommodation allowance' },
  { code: '04', name: 'TRANSPORT ALLOWANCE', description: 'Fixed travel/fuel allowance' },
  { code: '05', name: 'ATTENDANCE ALLOW', description: 'Full attendance incentive' },
  { code: '06', name: 'EXTRA DAYS', description: 'Extra working days / special shift allowance' },
  { code: '07', name: 'MEAL ALLOWANCE', description: 'Staff meal allowance' },
  { code: '08', name: 'SPECIAL ALLOWANCE', description: 'Special duties allowance' }
]

// ── Default Pay Grades matching legacy system ──────────────────────────────
export const DEFAULT_PAY_GRADES: PayGrade[] = [
  {
    code: 'CR 01',
    name: 'Cashier 01',
    department: 'CASHIER',
    templateCode: '0004',
    additions: [
      { id: 'cr01-01', code: '0004', additionCode: '01', gradeCode: 'CR 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'cr01-02', code: '0004', additionCode: '02', gradeCode: 'CR 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'cr01-05', code: '0004', additionCode: '05', gradeCode: 'CR 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'cr01-06', code: '0004', additionCode: '06', gradeCode: 'CR 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CR 02',
    name: 'Cashier 02',
    department: 'CASHIER',
    templateCode: '0004',
    additions: [
      { id: 'cr02-01', code: '0004', additionCode: '01', gradeCode: 'CR 02', additionName: 'VARIABLE ALLOWANCE', amount: 9000 },
      { id: 'cr02-02', code: '0004', additionCode: '02', gradeCode: 'CR 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'cr02-05', code: '0004', additionCode: '05', gradeCode: 'CR 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'cr02-06', code: '0004', additionCode: '06', gradeCode: 'CR 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CR 03',
    name: 'Cashier 03',
    department: 'CASHIER',
    templateCode: '0004',
    additions: [
      { id: 'cr03-01', code: '0004', additionCode: '01', gradeCode: 'CR 03', additionName: 'VARIABLE ALLOWANCE', amount: 10000 },
      { id: 'cr03-02', code: '0004', additionCode: '02', gradeCode: 'CR 03', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'cr03-05', code: '0004', additionCode: '05', gradeCode: 'CR 03', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'cr03-06', code: '0004', additionCode: '06', gradeCode: 'CR 03', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'BNMRY 01',
    name: 'Benmary / Buffet 01',
    department: 'BENMARY',
    templateCode: '0004',
    additions: [
      { id: 'bnmry01-01', code: '0004', additionCode: '01', gradeCode: 'BNMRY 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'bnmry01-02', code: '0004', additionCode: '02', gradeCode: 'BNMRY 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'bnmry01-05', code: '0004', additionCode: '05', gradeCode: 'BNMRY 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'bnmry01-06', code: '0004', additionCode: '06', gradeCode: 'BNMRY 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'BNMRY 02',
    name: 'Benmary / Buffet 02',
    department: 'BENMARY',
    templateCode: '0004',
    additions: [
      { id: 'bnmry02-01', code: '0004', additionCode: '01', gradeCode: 'BNMRY 02', additionName: 'VARIABLE ALLOWANCE', amount: 9000 },
      { id: 'bnmry02-02', code: '0004', additionCode: '02', gradeCode: 'BNMRY 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'bnmry02-05', code: '0004', additionCode: '05', gradeCode: 'BNMRY 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'bnmry02-06', code: '0004', additionCode: '06', gradeCode: 'BNMRY 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'JC BR 01',
    name: 'Juice Bar 01',
    department: 'JUICE BAR',
    templateCode: '0004',
    additions: [
      { id: 'jcbr01-01', code: '0004', additionCode: '01', gradeCode: 'JC BR 01', additionName: 'VARIABLE ALLOWANCE', amount: 8500 },
      { id: 'jcbr01-02', code: '0004', additionCode: '02', gradeCode: 'JC BR 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'jcbr01-05', code: '0004', additionCode: '05', gradeCode: 'JC BR 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'jcbr01-06', code: '0004', additionCode: '06', gradeCode: 'JC BR 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'P&B 01',
    name: 'Pastry & Bakery 01',
    department: 'PASTRY AND BAKERY',
    templateCode: '0004',
    additions: [
      { id: 'pb01-01', code: '0004', additionCode: '01', gradeCode: 'P&B 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'pb01-02', code: '0004', additionCode: '02', gradeCode: 'P&B 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'pb01-05', code: '0004', additionCode: '05', gradeCode: 'P&B 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'pb01-06', code: '0004', additionCode: '06', gradeCode: 'P&B 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'P&B 02',
    name: 'Pastry & Bakery 02',
    department: 'PASTRY AND BAKERY',
    templateCode: '0004',
    additions: [
      { id: 'pb02-01', code: '0004', additionCode: '01', gradeCode: 'P&B 02', additionName: 'VARIABLE ALLOWANCE', amount: 9500 },
      { id: 'pb02-02', code: '0004', additionCode: '02', gradeCode: 'P&B 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'pb02-05', code: '0004', additionCode: '05', gradeCode: 'P&B 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'pb02-06', code: '0004', additionCode: '06', gradeCode: 'P&B 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'P&B 03',
    name: 'Pastry & Bakery 03',
    department: 'PASTRY AND BAKERY',
    templateCode: '0004',
    additions: [
      { id: 'pb03-01', code: '0004', additionCode: '01', gradeCode: 'P&B 03', additionName: 'VARIABLE ALLOWANCE', amount: 11000 },
      { id: 'pb03-02', code: '0004', additionCode: '02', gradeCode: 'P&B 03', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'pb03-05', code: '0004', additionCode: '05', gradeCode: 'P&B 03', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'pb03-06', code: '0004', additionCode: '06', gradeCode: 'P&B 03', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 01',
    name: 'Chinese Kitchen 01',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse01-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'chnse01-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse01-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse01-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 02',
    name: 'Chinese Kitchen 02',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse02-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 02', additionName: 'VARIABLE ALLOWANCE', amount: 9000 },
      { id: 'chnse02-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse02-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse02-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 03',
    name: 'Chinese Kitchen 03',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse03-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 03', additionName: 'VARIABLE ALLOWANCE', amount: 10500 },
      { id: 'chnse03-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 03', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse03-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 03', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse03-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 03', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 04',
    name: 'Chinese Kitchen 04',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse04-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 04', additionName: 'VARIABLE ALLOWANCE', amount: 12000 },
      { id: 'chnse04-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 04', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse04-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 04', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse04-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 04', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CHNSE 05',
    name: 'Chinese Kitchen 05',
    department: 'CHINESE',
    templateCode: '0004',
    additions: [
      { id: 'chnse05-01', code: '0004', additionCode: '01', gradeCode: 'CHNSE 05', additionName: 'VARIABLE ALLOWANCE', amount: 14000 },
      { id: 'chnse05-02', code: '0004', additionCode: '02', gradeCode: 'CHNSE 05', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'chnse05-05', code: '0004', additionCode: '05', gradeCode: 'CHNSE 05', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'chnse05-06', code: '0004', additionCode: '06', gradeCode: 'CHNSE 05', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'RCE CRY 01',
    name: 'Rice & Curry 01',
    department: 'RICE AND CURRY',
    templateCode: '0004',
    additions: [
      { id: 'rce01-01', code: '0004', additionCode: '01', gradeCode: 'RCE CRY 01', additionName: 'VARIABLE ALLOWANCE', amount: 8000 },
      { id: 'rce01-02', code: '0004', additionCode: '02', gradeCode: 'RCE CRY 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'rce01-05', code: '0004', additionCode: '05', gradeCode: 'RCE CRY 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'rce01-06', code: '0004', additionCode: '06', gradeCode: 'RCE CRY 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'RCE CRY 02',
    name: 'Rice & Curry 02',
    department: 'RICE AND CURRY',
    templateCode: '0004',
    additions: [
      { id: 'rce02-01', code: '0004', additionCode: '01', gradeCode: 'RCE CRY 02', additionName: 'VARIABLE ALLOWANCE', amount: 9500 },
      { id: 'rce02-02', code: '0004', additionCode: '02', gradeCode: 'RCE CRY 02', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'rce02-05', code: '0004', additionCode: '05', gradeCode: 'RCE CRY 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'rce02-06', code: '0004', additionCode: '06', gradeCode: 'RCE CRY 02', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'CLEANING 01',
    name: 'Cleaning Staff 01',
    department: 'CLEANING',
    templateCode: '0004',
    additions: [
      { id: 'cln01-01', code: '0004', additionCode: '01', gradeCode: 'CLEANING 01', additionName: 'VARIABLE ALLOWANCE', amount: 7000 },
      { id: 'cln01-02', code: '0004', additionCode: '02', gradeCode: 'CLEANING 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'cln01-05', code: '0004', additionCode: '05', gradeCode: 'CLEANING 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'cln01-06', code: '0004', additionCode: '06', gradeCode: 'CLEANING 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'WASH UP 01',
    name: 'Wash Up / Steward 01',
    department: 'STEWARD',
    templateCode: '0004',
    additions: [
      { id: 'wu01-01', code: '0004', additionCode: '01', gradeCode: 'WASH UP 01', additionName: 'VARIABLE ALLOWANCE', amount: 7000 },
      { id: 'wu01-02', code: '0004', additionCode: '02', gradeCode: 'WASH UP 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'wu01-05', code: '0004', additionCode: '05', gradeCode: 'WASH UP 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'wu01-06', code: '0004', additionCode: '06', gradeCode: 'WASH UP 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  },
  {
    code: 'MANAGMENT 01',
    name: 'Management 01',
    department: 'MANAGMENT',
    templateCode: '0004',
    additions: [
      { id: 'mgmt01-01', code: '0004', additionCode: '01', gradeCode: 'MANAGMENT 01', additionName: 'VARIABLE ALLOWANCE', amount: 18000 },
      { id: 'mgmt01-02', code: '0004', additionCode: '02', gradeCode: 'MANAGMENT 01', additionName: 'SERVICE CHARGE', amount: 15000 },
      { id: 'mgmt01-05', code: '0004', additionCode: '05', gradeCode: 'MANAGMENT 01', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
      { id: 'mgmt01-06', code: '0004', additionCode: '06', gradeCode: 'MANAGMENT 01', additionName: 'EXTRA DAYS', amount: 1300 }
    ]
  }
]

export const SETTING_KEY_PAY_GRADES = 'hr_pay_grades_data'
export const SETTING_KEY_EMPLOYEE_GRADES = 'hr_employee_pay_grade_assignments'

class PayGradesService {
  private cachedGrades: PayGrade[] | null = null
  private cachedEmployeeGrades: Record<string, string> | null = null

  /**
   * Fetch all Pay Grades with their fixed additions.
   */
  async getPayGrades(customClient?: any): Promise<PayGrade[]> {
    const client = customClient || defaultClient
    try {
      const { data, error } = await client
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', SETTING_KEY_PAY_GRADES)
        .maybeSingle()

      if (error) {
        console.warn('[PayGradesService] Error loading grades:', error.message)
      }

      if (data && data.setting_value && Array.isArray(data.setting_value.grades)) {
        this.cachedGrades = data.setting_value.grades
        return this.cachedGrades!
      }

      // If not yet persisted in database, seed defaults
      await this.savePayGrades(DEFAULT_PAY_GRADES, client)
      this.cachedGrades = DEFAULT_PAY_GRADES
      return DEFAULT_PAY_GRADES
    } catch (err: any) {
      console.warn('[PayGradesService] Fallback to default grades:', err?.message)
      return DEFAULT_PAY_GRADES
    }
  }

  /**
   * Save Pay Grades back to database and immediately synchronize all assigned employees' salary profiles.
   */
  async savePayGrades(grades: PayGrade[], customClient?: any): Promise<boolean> {
    const client = customClient || defaultClient
    try {
      this.cachedGrades = grades

      // Ensure company_id
      const { data: comp } = await client.from('companies').select('id').limit(1).single()
      const companyId = comp?.id || '5c7ff29c-418a-461a-9624-3667375c2af4'

      const { data: existing } = await client
        .from('system_settings')
        .select('id')
        .eq('setting_key', SETTING_KEY_PAY_GRADES)
        .maybeSingle()

      const payload = {
        grades,
        updatedAt: new Date().toISOString()
      }

      if (existing) {
        await client
          .from('system_settings')
          .update({ setting_value: payload, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await client.from('system_settings').insert({
          company_id: companyId,
          setting_key: SETTING_KEY_PAY_GRADES,
          setting_value: payload
        })
      }

      // ── Real-Time Sync: Cascade updated pay grade additions to all assigned employees ──
      const assignments = await this.getEmployeeGradeAssignments(client)
      const empIds = Object.keys(assignments)
      for (const empId of empIds) {
        const gradeCode = assignments[empId]
        if (gradeCode) {
          await this.syncGradeAllowancesToEmployee(empId, gradeCode, client)
        }
      }

      // Dispatch UI Event for real-time reactivity in open windows / tabs
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hr-pay-grades-updated', { detail: { grades } }))
      }

      return true
    } catch (err: any) {
      console.error('[PayGradesService] Error saving grades:', err)
      return false
    }
  }

  /**
   * Fetch employee-to-pay-grade assignments mapping: { [employeeId]: gradeCode }
   */
  async getEmployeeGradeAssignments(customClient?: any): Promise<Record<string, string>> {
    const client = customClient || defaultClient
    try {
      const { data } = await client
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', SETTING_KEY_EMPLOYEE_GRADES)
        .maybeSingle()

      if (data && data.setting_value && typeof data.setting_value.assignments === 'object') {
        this.cachedEmployeeGrades = data.setting_value.assignments
        return this.cachedEmployeeGrades!
      }
      return {}
    } catch (err) {
      return {}
    }
  }

  /**
   * Assign an employee to a pay grade and immediately synchronize their salary structure & allowances in real time.
   */
  async assignEmployeeToGrade(
    employeeId: string,
    gradeCode: string,
    syncToPayroll: boolean = true,
    customClient?: any
  ): Promise<boolean> {
    const client = customClient || defaultClient
    try {
      const assignments = await this.getEmployeeGradeAssignments(client)
      if (gradeCode) {
        assignments[employeeId] = gradeCode
      } else {
        delete assignments[employeeId]
      }

      const { data: comp } = await client.from('companies').select('id').limit(1).single()
      const companyId = comp?.id || '5c7ff29c-418a-461a-9624-3667375c2af4'

      const { data: existing } = await client
        .from('system_settings')
        .select('id')
        .eq('setting_key', SETTING_KEY_EMPLOYEE_GRADES)
        .maybeSingle()

      const payload = {
        assignments,
        updatedAt: new Date().toISOString()
      }

      if (existing) {
        await client
          .from('system_settings')
          .update({ setting_value: payload, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await client.from('system_settings').insert({
          company_id: companyId,
          setting_key: SETTING_KEY_EMPLOYEE_GRADES,
          setting_value: payload
        })
      }

      if (syncToPayroll && gradeCode) {
        await this.syncGradeAllowancesToEmployee(employeeId, gradeCode, client)
      }

      // Dispatch UI Event for real-time reactivity
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('hr-employee-grade-assigned', {
            detail: { employeeId, gradeCode }
          })
        )
      }

      return true
    } catch (err) {
      console.error('[PayGradesService] Error assigning employee:', err)
      return false
    }
  }

  /**
   * Sync a Pay Grade's fixed additions directly to employee's salary structure in the database in real-time
   */
  async syncGradeAllowancesToEmployee(employeeId: string, gradeCode: string, customClient?: any): Promise<boolean> {
    const client = customClient || defaultClient
    try {
      const grades = await this.getPayGrades(client)
      const grade = grades.find(g => g.code === gradeCode)
      if (!grade) return false

      // Calculate totals
      let variable = 0
      let service = 0
      let attendance = 0
      let extraDays = 0
      let housing = 0
      let transport = 0
      let meal = 0
      let otherTotal = 0

      for (const a of grade.additions) {
        const name = (a.additionName || '').toUpperCase()
        const amt = Number(a.amount || 0)
        if (name.includes('HOUSING')) housing += amt
        else if (name.includes('TRANSPORT')) transport += amt
        else if (name.includes('MEAL')) meal += amt
        else {
          otherTotal += amt
          if (name.includes('VARIABLE')) variable += amt
          else if (name.includes('SERVICE')) service += amt
          else if (name.includes('ATTENDANCE')) attendance += amt
          else if (name.includes('EXTRA')) extraDays += amt
        }
      }

      // Update employee's salary_structures row
      const { data: existingSal } = await client
        .from('salary_structures')
        .select('id, basic_salary')
        .eq('employee_id', employeeId)
        .order('is_current', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingSal) {
        await client
          .from('salary_structures')
          .update({
            housing_allowance: housing,
            transport_allowance: transport,
            meal_allowance: meal,
            other_allowances: otherTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSal.id)
      } else {
        // Insert new current salary structure for employee
        const { data: comp } = await client.from('companies').select('id').limit(1).single()
        await client.from('salary_structures').insert({
          company_id: comp?.id || '5c7ff29c-418a-461a-9624-3667375c2af4',
          employee_id: employeeId,
          salary_type: 'monthly',
          salary_method: 'basic_salary',
          basic_salary: 35000,
          housing_allowance: housing,
          transport_allowance: transport,
          meal_allowance: meal,
          other_allowances: otherTotal,
          is_current: true,
          effective_from: new Date().toISOString().slice(0, 10)
        })
      }

      return true
    } catch (err) {
      console.error('[PayGradesService] Sync allowances note:', err)
      return false
    }
  }
}

export const payGradesService = new PayGradesService()
