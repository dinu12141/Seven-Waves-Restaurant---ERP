import { describe, it, expect } from 'vitest'
import routes from '../../router/routes.js'
import { evaluateRouteAccess, getRequiredRoleSets } from '../rbac/routeAccess'
import type { UserRole } from '../../stores/auth'
import { NAV_ITEMS } from '../../config/roles'

type R = { path: string; meta?: Record<string, unknown>; children?: R[]; redirect?: unknown }

/** Flatten the route tree into leaf paths + their matched chain (like router.resolve().matched). */
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

const ALL = flatten(routes as unknown as R[])
const find = (path: string) => {
  const hit = ALL.find((r) => r.path === path)
  if (!hit) throw new Error(`route ${path} not found`)
  return hit
}
const can = (roles: string[], path: string, perms: string[] = []) => {
  const r = find(path)
  return evaluateRouteAccess(roles as UserRole[], perms, r.matched, path.replace(':id', 'x')).allowed
}

const NON_ADMIN: UserRole[] = [
  'manager', 'waiter', 'cashier', 'kitchen', 'delivery', 'inventory', 'finance', 'hr', 'procurement',
] as UserRole[]

describe('evaluateRouteAccess — shared router guard / sidebar decision', () => {
  it('admin is always allowed', () => {
    expect(can(['admin'], '/admin/users')).toBe(true)
    expect(can(['admin'], '/admin/backup')).toBe(true)
  })

  it('admin-only routes deny every non-admin role without explicit grants', () => {
    const adminOnly = ALL.filter((r) => {
      const sets = getRequiredRoleSets(r.matched)
      return sets.length && sets.some((s) => s.length === 1 && s[0] === 'admin')
    })
    expect(adminOnly.length).toBeGreaterThan(5)
    for (const r of adminOnly) {
      for (const role of NON_ADMIN) {
        expect(evaluateRouteAccess([role], [], r.matched, r.path).allowed, `${role} -> ${r.path}`).toBe(false)
      }
    }
  })

  it('cashier can open Loyalty Members (route + nav grant it) but not Earning Rules', () => {
    expect(can(['cashier'], '/admin/loyalty')).toBe(true)
    expect(can(['cashier'], '/admin/loyalty/:id')).toBe(true)
    expect(can(['cashier'], '/admin/loyalty/earning-rules')).toBe(false)
  })

  it('waiter / kitchen cannot reach admin, finance or HR', () => {
    for (const p of ['/admin/users', '/admin/settings', '/finance/dashboard', '/hr/employees', '/audit']) {
      expect(can(['waiter'], p)).toBe(false)
      expect(can(['kitchen'], p)).toBe(false)
    }
  })

  it('a matching custom grant substitutes for a missing role', () => {
    // waiter with an explicit finance.dashboard.view + finance module grant
    expect(can(['waiter'], '/finance/dashboard', ['finance.view', 'finance.dashboard.view'])).toBe(true)
    // ...but an unrelated grant does not
    expect(can(['waiter'], '/finance/dashboard', ['hr.view'])).toBe(false)
  })

  it('reports a reason when denied', () => {
    const r = find('/admin/users')
    expect(evaluateRouteAccess(['waiter'] as UserRole[], [], r.matched, r.path).reason).toBe('role')
  })

  it('default role permissions do not leak role-excluded admin pages', () => {
    // previously both pages reused a permission held by a role the route excludes
    expect(can(['cashier'], '/website-menu-qr')).toBe(false)
    expect(can(['manager'], '/website-menu-qr')).toBe(true)
    expect(can(['manager'], '/admin/loyalty/earning-rules')).toBe(true)
  })

  it('sidebar permission codes match the route permission they unlock (Roles page relies on it)', () => {
    const mismatches: string[] = []
    const walk = (items: typeof NAV_ITEMS) => {
      for (const it of items) {
        if (it.children) walk(it.children)
        if (!it.to || !it.permission || it.to.includes('?')) continue
        const r = ALL.find((x) => x.path === it.to!.split('#')[0])
        if (!r) continue
        const perm = r.matched.map((m) => m.meta?.permission as string | undefined).filter(Boolean).pop()
        if (perm !== it.permission) mismatches.push(`${it.to}: nav=${it.permission} route=${perm}`)
      }
    }
    walk(NAV_ITEMS)
    expect(mismatches).toEqual([])
  })

  it('every authenticated MainLayout leaf route declares roles (except profile / unauthorized)', () => {
    const missing = ALL.filter(
      (r) =>
        r.matched[0]?.meta?.requiresAuth === true &&
        getRequiredRoleSets(r.matched).length === 0 &&
        !['/profile', '/unauthorized'].includes(r.path),
    ).map((r) => r.path)
    expect(missing).toEqual([])
  })
})
