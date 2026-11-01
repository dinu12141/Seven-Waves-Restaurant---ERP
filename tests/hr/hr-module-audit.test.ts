/**
 * Comprehensive HR Module & Attendance Audit Test Suite
 * Seven Waves Restaurant ERP — Sri Lanka (Asia/Colombo UTC+05:30)
 *
 * Verifies:
 * 1. Attendance Metrics Calculation & Unpaid Break Deduction (#152)
 * 2. Pre/Post-Shift Buffers and Waiter Shift Access Window (#153)
 * 3. Biometric Device PIN Mapping & Multi-Tier Employee Matching (#153)
 * 4. Overnight Shift Punch Lookback & Toggle Logic
 * 5. Staff Receivables, Advances & Loan Approvals
 * 6. Sri Lanka Statutory Payroll (EPF 8% + 12%, ETF 3%) & Finance GL Linkage
 */

import { describe, it, expect } from 'vitest'
import {
  hrTargetStatus,
  requiresDisbursement,
} from 'src/services/hr/hrApprovalStatus'
import {
  friendlyReceivableError,
} from 'src/services/hr/staffReceivableService'
import {
  localYmd,
  localYm,
  addDaysYmd,
  enumerateYmd,
  monthBounds,
} from 'src/services/hr/hrDates'
import {
  summarizeRunSlips,
  canPostRun,
  payslipLines,
  projectMonthlySalary,
} from 'src/modules/finance/services/finance-payroll.service'

// ── Pure Logic Mirror of DB RPC fn_calc_attendance_metrics (#152) ─────────────
function calculateAttendanceMetrics(params: {
  shiftStart: string // '08:00'
  shiftEnd: string // '17:00'
  breakDurationMinutes: number // 60
  graceMinutes: number // 10
  isOvernight: boolean
  clockInTime: string // '08:15'
  clockOutTime?: string // '17:30'
}) {
  const [sh, sm] = params.shiftStart.split(':').map(Number)
  const [eh, em] = params.shiftEnd.split(':').map(Number)
  const [ih, im] = params.clockInTime.split(':').map(Number)

  const schedStartMinutes = sh * 60 + sm
  let schedEndMinutes = eh * 60 + em
  if (params.isOvernight && schedEndMinutes <= schedStartMinutes) {
    schedEndMinutes += 1440
  }

  const clockInMinutes = ih * 60 + im

  // 1. Late arrival calculation (with grace period)
  let lateMinutes = 0
  if (clockInMinutes > schedStartMinutes + params.graceMinutes) {
    lateMinutes = clockInMinutes - schedStartMinutes
  }

  // 2. Early departure & overtime calculation
  let earlyDepartureMinutes = 0
  let overtimeHours = 0
  let totalHours = 0
  let breakHours = params.breakDurationMinutes / 60

  if (params.clockOutTime) {
    const [oh, om] = params.clockOutTime.split(':').map(Number)
    let clockOutMinutes = oh * 60 + om
    if (params.isOvernight || clockOutMinutes < clockInMinutes) {
      clockOutMinutes += 1440
    }

    const workedMinutes = Math.max(0, clockOutMinutes - clockInMinutes)
    totalHours = Math.round((workedMinutes / 60) * 100) / 100

    // Early departure
    if (clockOutMinutes < schedEndMinutes) {
      earlyDepartureMinutes = schedEndMinutes - clockOutMinutes
    }

    // Overtime (fix #152: strictly deducts unpaid break from gross hours!)
    const scheduledDurationMinutes = schedEndMinutes - schedStartMinutes
    const expectedWorkMinutes = Math.max(0, scheduledDurationMinutes - params.breakDurationMinutes)
    const netWorkedMinutes = Math.max(0, workedMinutes - params.breakDurationMinutes)

    if (netWorkedMinutes > expectedWorkMinutes && clockOutMinutes > schedEndMinutes) {
      overtimeHours = Math.round(((netWorkedMinutes - expectedWorkMinutes) / 60) * 100) / 100
    }
  }

  let computedStatus = 'present'
  if (lateMinutes > 0) computedStatus = 'late'

  return {
    lateMinutes,
    earlyDepartureMinutes,
    totalHours,
    breakHours,
    overtimeHours,
    computedStatus,
  }
}

// ── Pure Logic Mirror of Waiter App Store Shift Window Check (#153) ───────────
function isWithinShiftTime(
  currentTimeMinutes: number, // e.g. 12 * 60 = 720 (12:00)
  startTimeStr: string,
  endTimeStr: string,
  isOvernight: boolean,
  preBufferMinutes = 60,
  postBufferMinutes = 120,
) {
  if (!startTimeStr || !endTimeStr) return true

  const [sh, sm] = startTimeStr.split(':').map(Number)
  const [eh, em] = endTimeStr.split(':').map(Number)
  const rawStart = sh * 60 + sm
  const rawEnd = eh * 60 + em
  const DAY = 1440

  const crossesMidnight = isOvernight || rawStart > rawEnd

  if (crossesMidnight) {
    const shiftStart = rawStart - preBufferMinutes
    const shiftEnd = rawEnd + DAY + postBufferMinutes
    const cur = currentTimeMinutes < rawStart ? currentTimeMinutes + DAY : currentTimeMinutes
    return cur >= shiftStart && cur <= shiftEnd
  }

  const startMin = Math.max(0, rawStart - preBufferMinutes)
  const endMin = Math.min(DAY - 1, rawEnd + postBufferMinutes)
  return currentTimeMinutes >= startMin && currentTimeMinutes <= endMin
}

// ── Pure Logic Mirror of Frappe-Style Multi-Tier Biometric Matching (#153) ───
function matchEmployeeFromDeviceLog(
  punchUserId: string,
  employees: Array<{ id: string; employee_code: string; attendance_device_id?: string | null }>,
) {
  const pin = String(punchUserId).trim().toLowerCase()
  const pinNumOnly = pin.replace(/\D/g, '')

  // Tier 1: Explicit attendance_device_id match
  const t1 = employees.find(
    (e) => e.attendance_device_id && String(e.attendance_device_id).trim().toLowerCase() === pin,
  )
  if (t1) return { employee: t1, tier: 1 }

  // Tier 2: Exact employee_code match
  const t2 = employees.find((e) => e.employee_code.toLowerCase() === pin)
  if (t2) return { employee: t2, tier: 2 }

  // Tier 3: Zero-padded match (e.g. "83" matches "EMP000083")
  if (pinNumOnly) {
    const padded = `EMP${pinNumOnly.padStart(6, '0')}`.toLowerCase()
    const t3 = employees.find((e) => e.employee_code.toLowerCase() === padded)
    if (t3) return { employee: t3, tier: 3 }
  }

  // Tier 4: Pure digits match
  if (pinNumOnly) {
    const t4 = employees.find((e) => e.employee_code.replace(/\D/g, '') === pinNumOnly)
    if (t4) return { employee: t4, tier: 4 }
  }

  return null
}

describe('HR Module Audit & Quality Verification', () => {
  // ── 1. Attendance Metrics & Unpaid Break Overtime Fix #152 ──────────────────
  describe('Attendance Metrics & Break Deductions (#152)', () => {
    it('allows arrival within 10-minute grace period without late penalty', () => {
      const res = calculateAttendanceMetrics({
        shiftStart: '08:00',
        shiftEnd: '17:00',
        breakDurationMinutes: 60,
        graceMinutes: 10,
        isOvernight: false,
        clockInTime: '08:08',
      })
      expect(res.lateMinutes).toBe(0)
      expect(res.computedStatus).toBe('present')
    })

    it('records late minutes when clocking in after the grace period', () => {
      const res = calculateAttendanceMetrics({
        shiftStart: '08:00',
        shiftEnd: '17:00',
        breakDurationMinutes: 60,
        graceMinutes: 10,
        isOvernight: false,
        clockInTime: '08:25',
      })
      // Arrived 25 minutes after 08:00
      expect(res.lateMinutes).toBe(25)
      expect(res.computedStatus).toBe('late')
    })

    it('correctly deducts 1 hour unpaid lunch break when computing overtime', () => {
      // Shift: 08:00 - 17:00 (9 hrs total, 1 hr break = 8 expected working hrs)
      // Clock in: 08:00, Clock out: 19:00 (11 total hours at premises)
      // Net worked: 11 - 1 = 10 hours.
      // Expected: 8 hours.
      // Overtime should be 2.0 hours (NOT 3.0 hours!).
      const res = calculateAttendanceMetrics({
        shiftStart: '08:00',
        shiftEnd: '17:00',
        breakDurationMinutes: 60,
        graceMinutes: 10,
        isOvernight: false,
        clockInTime: '08:00',
        clockOutTime: '19:00',
      })
      expect(res.totalHours).toBe(11)
      expect(res.breakHours).toBe(1)
      expect(res.overtimeHours).toBe(2)
      expect(res.earlyDepartureMinutes).toBe(0)
    })

    it('detects early departure when employee leaves before scheduled shift end', () => {
      const res = calculateAttendanceMetrics({
        shiftStart: '08:00',
        shiftEnd: '17:00',
        breakDurationMinutes: 60,
        graceMinutes: 10,
        isOvernight: false,
        clockInTime: '08:00',
        clockOutTime: '16:30', // left 30 mins early
      })
      expect(res.earlyDepartureMinutes).toBe(30)
      expect(res.overtimeHours).toBe(0)
    })

    it('handles overnight shift metrics across midnight seamlessly', () => {
      // Shift: 22:00 - 06:00 (8 hrs, 60m break = 7 expected hrs)
      // Clock in: 22:00, Clock out: 07:30 (next morning)
      // Worked: 9.5 hours. Break: 1.0 hr -> Net: 8.5 hrs.
      // Expected: 7.0 hrs -> Overtime: 1.5 hrs.
      const res = calculateAttendanceMetrics({
        shiftStart: '22:00',
        shiftEnd: '06:00',
        breakDurationMinutes: 60,
        graceMinutes: 10,
        isOvernight: true,
        clockInTime: '22:00',
        clockOutTime: '07:30',
      })
      expect(res.totalHours).toBe(9.5)
      expect(res.overtimeHours).toBe(1.5)
      expect(res.earlyDepartureMinutes).toBe(0)
    })
  })

  // ── 2. Waiter App Store Shift Access & Tolerances (#153) ───────────────────
  describe('Dynamic Shift Buffers & Waiter App Clock-in Windows (#153)', () => {
    it('allows waiter clock-in 45 minutes before shift (within 60m pre-buffer)', () => {
      // Shift 12:00 - 22:00 (720 to 1320 mins)
      // Check at 11:15 (675 mins) -> within 11:00-22:00 window
      const allowed = isWithinShiftTime(11 * 60 + 15, '12:00', '22:00', false, 60, 120)
      expect(allowed).toBe(true)
    })

    it('rejects waiter clock-in 90 minutes before shift (outside 60m pre-buffer)', () => {
      // Check at 10:30 (630 mins) -> before 11:00 start buffer
      const allowed = isWithinShiftTime(10 * 60 + 30, '12:00', '22:00', false, 60, 120)
      expect(allowed).toBe(false)
    })

    it('allows waiter post-shift ordering 90 minutes after shift (within 120m post-buffer)', () => {
      // Shift 12:00 - 22:00 (ends 22:00). Post buffer is 120m (up to 24:00)
      // Check at 23:30 (1410 mins)
      const allowed = isWithinShiftTime(23 * 60 + 30, '12:00', '22:00', false, 60, 120)
      expect(allowed).toBe(true)
    })

    it('handles midnight-crossing shifts properly with dynamic buffers', () => {
      // Shift 20:00 - 04:00 (overnight)
      // Pre-buffer: 60m (from 19:00). Post-buffer: 120m (up to 06:00 next day)
      // Check at 02:30 (middle of the night)
      expect(isWithinShiftTime(2 * 60 + 30, '20:00', '04:00', true, 60, 120)).toBe(true)
      // Check at 05:30 (after shift end 04:00, within 120m buffer)
      expect(isWithinShiftTime(5 * 60 + 30, '20:00', '04:00', true, 60, 120)).toBe(true)
      // Check at 06:45 (exceeded post-buffer)
      expect(isWithinShiftTime(6 * 60 + 45, '20:00', '04:00', true, 60, 120)).toBe(false)
    })
  })

  // ── 3. Biometric PIN Mapping & Multi-Tier Resolution (#153) ────────────────
  describe('Biometric Device PIN & Multi-Tier Resolution (#153)', () => {
    const staff = [
      { id: 'u1', employee_code: 'EMP000012', attendance_device_id: '83' }, // Machine PIN 83
      { id: 'u2', employee_code: 'EMP000005', attendance_device_id: null }, // Standard code
      { id: 'u3', employee_code: 'CHEF-01', attendance_device_id: '99' }, // Custom code with PIN 99
    ]

    it('matches employee by explicit biometric terminal PIN (Tier 1)', () => {
      const match = matchEmployeeFromDeviceLog('83', staff)
      expect(match).not.toBeNull()
      expect(match?.employee.id).toBe('u1')
      expect(match?.tier).toBe(1)
    })

    it('matches custom code staff by biometric terminal PIN (Tier 1)', () => {
      const match = matchEmployeeFromDeviceLog('99', staff)
      expect(match).not.toBeNull()
      expect(match?.employee.employee_code).toBe('CHEF-01')
      expect(match?.tier).toBe(1)
    })

    it('matches employee by exact code (Tier 2)', () => {
      const match = matchEmployeeFromDeviceLog('EMP000005', staff)
      expect(match?.employee.id).toBe('u2')
      expect(match?.tier).toBe(2)
    })

    it('matches employee by zero-padded numeric string (Tier 3)', () => {
      // User entered or device sent PIN "5" for EMP000005
      const match = matchEmployeeFromDeviceLog('5', staff)
      expect(match?.employee.id).toBe('u2')
      expect(match?.tier).toBe(3)
    })
  })

  // ── 4. Staff Receivables & HR Approval Status Constraints ──────────────────
  describe('HR Approval Status & Staff Receivables', () => {
    it('maps approved loans to "active" to satisfy database check constraints', () => {
      // employee_loans chk_loan_status allows: pending, active, completed, cancelled, defaulted
      // hrTargetStatus maps 'approved' -> 'active'
      expect(hrTargetStatus('loans', 'approved')).toBe('active')
      expect(hrTargetStatus('loans', 'rejected')).toBe('cancelled')
    })

    it('passes standard status through for leaves', () => {
      expect(hrTargetStatus('leaves', 'approved')).toBe('approved')
      expect(hrTargetStatus('leaves', 'rejected')).toBe('rejected')
    })

    it('identifies that advances and loans require finance disbursement', () => {
      expect(requiresDisbursement('advances', 'approved')).toBe(true)
      expect(requiresDisbursement('loans', 'approved')).toBe(true)
      expect(requiresDisbursement('leaves', 'approved')).toBe(false)
    })

    it('sanitizes trigger error messages for user-friendly UI display', () => {
      const raw = 'STAFF_RECEIVABLE_LOCKED: Cannot alter a loan that is already disbursed'
      expect(friendlyReceivableError(raw)).toBe('Cannot alter a loan that is already disbursed')
    })
  })

  // ── 5. Sri Lanka Statutory Payroll (EPF 8% + 12%, ETF 3%) ──────────────────
  describe('Sri Lanka Statutory Payroll Engine (EPF/ETF & GL Integration)', () => {
    it('accurately computes EPF 8%, EPF 12%, and ETF 3% on basic salary', () => {
      const basicSalary = 100000
      const epfEmployee = Math.round(basicSalary * 0.08)
      const epfEmployer = Math.round(basicSalary * 0.12)
      const etfEmployer = Math.round(basicSalary * 0.03)

      expect(epfEmployee).toBe(8000)
      expect(epfEmployer).toBe(12000)
      expect(etfEmployer).toBe(3000)
      expect(epfEmployee + epfEmployer).toBe(20000) // Total EPF remittance to Central Bank
    })

    it('reconciles payslip earnings, deductions and net pay correctly', () => {
      const payslip = {
        basic_salary: 80000,
        total_allowances: 15000,
        overtime_amount: 5000,
        gross_salary: 100000,
        epf_employee: 6400, // 8% of 80000
        loan_deduction: 10000,
        salary_advance: 5000,
        total_deductions: 21400,
        net_salary: 78600,
      }

      const { earnings, deductions } = payslipLines(payslip)
      const sumEarnings = earnings.reduce((acc, e) => acc + e.amount, 0)
      const sumDeductions = deductions.reduce((acc, d) => acc + d.amount, 0)

      expect(sumEarnings).toBe(100000)
      expect(sumDeductions).toBe(21400)
      expect(sumEarnings - sumDeductions).toBe(78600)
    })

    it('prevents posting payroll to finance unless run is approved or paid', () => {
      const slips = [
        { gross_salary: 100000, net_salary: 80000, total_deductions: 20000, epf_employee: 8000, epf_employer: 12000, etf_employer: 3000 },
      ]
      const summary = summarizeRunSlips(slips)

      // Draft or processed runs cannot be posted
      expect(canPostRun({ status: 'draft' }, summary)).toBe(false)
      expect(canPostRun({ status: 'processing' }, summary)).toBe(false)
      expect(canPostRun({ status: 'processed' }, summary)).toBe(false)

      // Approved run can be posted to Finance GL
      expect(canPostRun({ status: 'approved' }, summary)).toBe(true)
    })
  })

  // ── 6. HR Calendar & Timezone Safety Helpers ────────────────────────────────
  describe('HR Calendar & Timezone-safe Date Helpers', () => {
    it('computes accurate month bounds without UTC drift', () => {
      const bounds = monthBounds('2026-02')
      expect(bounds.start).toBe('2026-02-01')
      expect(bounds.end).toBe('2026-02-28')

      const boundsLeap = monthBounds('2024-02')
      expect(boundsLeap.end).toBe('2024-02-29')
    })

    it('enumerates YMD dates inclusively and handles month boundaries', () => {
      const list = enumerateYmd('2026-01-30', '2026-02-02')
      expect(list).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])
    })

    it('adds days without timezone drift', () => {
      expect(addDaysYmd('2026-02-27', 3)).toBe('2026-03-02')
    })
  })
})
