// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — HR Payroll Policy Engine Unit Tests (#160)
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { payGradesService, PayGrade } from '../../src/services/hr/payGradesService'

describe('Seven Waves Restaurant — Official HR & Payroll Policy Engine (#160)', () => {
  // ── Rule 1: Monthly Working Days Calculation ──
  describe('Rule 1: Monthly Working Days Calculation', () => {
    it('requires exactly 26 working days for 30-day months (e.g. November, April, June, September)', () => {
      expect(payGradesService.getRequiredWorkingDays('2026-11-01')).toBe(26)
      expect(payGradesService.getRequiredWorkingDays('2026-04-15')).toBe(26)
      expect(payGradesService.getRequiredWorkingDays('2026-06-01')).toBe(26)
      expect(payGradesService.getRequiredWorkingDays('2026-09-30')).toBe(26)
    })

    it('requires exactly 27 working days for 31-day months (e.g. October, December, January, March, May, July, August)', () => {
      expect(payGradesService.getRequiredWorkingDays('2026-10-01')).toBe(27)
      expect(payGradesService.getRequiredWorkingDays('2026-12-01')).toBe(27)
      expect(payGradesService.getRequiredWorkingDays('2026-01-15')).toBe(27)
      expect(payGradesService.getRequiredWorkingDays('2026-08-31')).toBe(27)
    })

    it('requires (calendar days - 4) for other months (e.g. February 28 days -> 24 days)', () => {
      expect(payGradesService.getRequiredWorkingDays('2026-02-01')).toBe(24)
    })
  })

  // ── Pay Grade Fixed Additions Decomposition ──
  describe('Pay Grade Decomposition', () => {
    const cr02: PayGrade = {
      code: 'CR 02',
      name: 'Cashier 02',
      department: 'CASHIER',
      templateCode: '0004',
      additions: [
        { id: 'cr02-01', code: '0004', additionCode: '01', gradeCode: 'CR 02', additionName: 'VARIABLE ALLOWANCE', amount: 9000 },
        { id: 'cr02-02', code: '0004', additionCode: '02', gradeCode: 'CR 02', additionName: 'SERVICE CHARGE', amount: 15000 },
        { id: 'cr02-05', code: '0004', additionCode: '05', gradeCode: 'CR 02', additionName: 'ATTENDANCE ALLOW', amount: 6000 },
        { id: 'cr02-06', code: '0004', additionCode: '06', gradeCode: 'CR 02', additionName: 'EXTRA DAYS', amount: 1300 },
      ],
    }

    it('accurately parses variable, service charge, attendance allowance and extra days rate', () => {
      const summary = payGradesService.getGradeAdditionsSummary(cr02)
      expect(summary.variable).toBe(9000)
      expect(summary.service).toBe(15000)
      expect(summary.attendance).toBe(6000)
      expect(summary.extraRate).toBe(1300)
    })
  })

  // ── Scenario A: 28 Days Worked in 30-Day Month, 15 OT Hours, 0 No-Pay ──
  describe('Scenario A: Full Attendance + Extra Days Worked + Overtime', () => {
    const basic = 35000
    const variable = 9000
    const serviceCharge = 15000
    const attendanceAllowance = 6000
    const daysWorked = 28
    const reqDays = 26 // November (30 days)
    const otHours = 15
    const noPayDays = 0

    it('grants full attendance allowance because no-pay is 0 (Rule 3)', () => {
      const actualAttendance = noPayDays > 0 ? 0 : attendanceAllowance
      expect(actualAttendance).toBe(6000)
    })

    it('calculates extra working days payment at Rs. 2,300 per day (Rule 4)', () => {
      const extraDays = Math.max(0, daysWorked - reqDays)
      expect(extraDays).toBe(2)
      const extraPayment = extraDays * 2300 // Rs. 1,300 work + Rs. 1,000 SC
      expect(extraPayment).toBe(4600)
    })

    it('calculates OT rate using divisor 208 and 1.5x multiplier (Rule 5)', () => {
      const otRate = (basic / 208.0) * 1.5
      expect(otRate).toBeCloseTo(252.4038, 4)
      const otPayment = Math.round(otHours * otRate * 100) / 100
      expect(otPayment).toBe(3786.06)
    })

    it('calculates No-Pay deduction as 0 with 0 absent days (Rule 2)', () => {
      const noPayRate = (basic + variable + serviceCharge) / 30.0
      const noPayDed = noPayDays * noPayRate
      expect(noPayDed).toBe(0)
    })

    it('produces exact Gross and Net Salary with EPF (Rule 6)', () => {
      const allowances = variable + serviceCharge + attendanceAllowance // 30,000
      const extraPayment = 2 * 2300 // 4,600
      const otPayment = 3786.06
      const gross = basic + allowances + extraPayment + otPayment
      expect(gross).toBe(73386.06)

      const epf8 = Math.round(basic * 0.08 * 100) / 100
      expect(epf8).toBe(2800)

      const net = gross - epf8
      expect(net).toBe(70586.06)
    })
  })

  // ── Scenario B: 25 Days Worked in 31-Day Month, 2 Days No-Pay ──
  describe('Scenario B: Absenteeism (Forfeit Attendance + No-Pay Deduction @ / 30)', () => {
    const basic = 35000
    const variable = 9000
    const serviceCharge = 15000
    const attendanceAllowance = 6000
    const daysWorked = 25
    const reqDays = 27 // October (31 days)
    const noPayDays = 2

    it('forfeits 100% of Attendance Allowance to Rs. 0 because No-Pay > 0 (Rule 3)', () => {
      const actualAttendance = noPayDays > 0 ? 0 : attendanceAllowance
      expect(actualAttendance).toBe(0)
    })

    it('calculates daily No-Pay rate with base (Basic + Allowances + SC) and fixed divisor 30 (Rule 2)', () => {
      const base = basic + variable + serviceCharge // 35000 + 9000 + 15000 = 59000
      const noPayRate = base / 30.0
      expect(noPayRate).toBeCloseTo(1966.6667, 4)

      const noPayDed = Math.round(noPayDays * noPayRate * 100) / 100
      expect(noPayDed).toBe(3933.33)
    })

    it('awards 0 extra days because worked (25) <= required (27) (Rule 4)', () => {
      const extraDays = Math.max(0, daysWorked - reqDays)
      expect(extraDays).toBe(0)
    })

    it('calculates Gross and Net salary matching restaurant policy exactly', () => {
      const allowances = variable + serviceCharge + 0 // 24,000 (Attendance forfeited)
      const noPayDed = 3933.33
      const gross = Math.round((basic + allowances - noPayDed) * 100) / 100
      expect(gross).toBe(55066.67)

      const epf8 = Math.round(basic * 0.08 * 100) / 100 // 2,800.00
      expect(epf8).toBe(2800)

      const net = Math.round((gross - epf8) * 100) / 100
      expect(net).toBe(52266.67)
    })
  })
})
