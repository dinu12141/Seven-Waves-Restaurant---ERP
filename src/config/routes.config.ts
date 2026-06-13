// ═══════════════════════════════════════════════════════════════════
// Route Meta Types — Typed Route Metadata
// Seven Waves ERP — Step 03C
// ═══════════════════════════════════════════════════════════════════

import type { UserRole } from '../stores/auth'

/**
 * Typed route meta — enforced on all ERP routes.
 * Extends vue-router's RouteMeta interface.
 */
export interface ErpRouteMeta {
  /** Whether route requires authentication (default: true) */
  requiresAuth?: boolean
  /** Whether route requires branch access validation */
  requiresBranchAccess?: boolean
  /** Module key — must match MODULE_REGISTRY */
  module?: string
  /** Required permission string */
  permission?: string
  /** Allowed roles (checked via canAccessRoute) */
  roles?: UserRole[]
  /** Breadcrumb label */
  breadcrumb?: string
  /** Layout to use (resolved by route parent) */
  layout?: string
  /** Whether the page is a standalone PWA page */
  isPwa?: boolean
  /** Minimum viewport for this page */
  minViewport?: 'mobile' | 'tablet' | 'desktop'
}

// Augment vue-router to accept our typed meta
declare module 'vue-router' {
  interface RouteMeta extends ErpRouteMeta {}
}
