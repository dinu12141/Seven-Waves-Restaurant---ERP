// ═══════════════════════════════════════════════════════════════════
// CORE — Barrel Export
// Seven Waves ERP — Step 03A/03C Infrastructure
// ═══════════════════════════════════════════════════════════════════

// Error handling
export { errorHandler } from './errors/ErrorHandler'
export { ErrorCategory, ErrorSeverity, classifySupabaseError, generateCorrelationId } from './errors/types'
export type { ErpError } from './errors/types'

// API client
export { api } from './api/ApiClient'
export type { ApiCallOptions, ApiResult } from './api/ApiClient'

// API response helpers (Step 03C)
export { ok, fail, fromApiResult, paginated } from './api/response'
export type { ServiceResult, PaginatedResult } from './api/response'

// Realtime (Step 03A — basic engine)
export { realtimeEngine } from './realtime/RealtimeEngine'
export type { ChannelSubscription, ChangeEvent } from './realtime/RealtimeEngine'

// Realtime (Step 03D — production manager)
export { realtimeManager } from './realtime/realtime.manager'
export type { ConnectionState, ManagedChannel } from './realtime/realtime.manager'
export { CHANNEL_REGISTRY, resolveChannelKey, buildFilter } from './realtime/channel.registry'
export type { ChannelDefinition, ChannelScope } from './realtime/channel.registry'
export { EVENT_HANDLER_MAP } from './realtime/event.handlers'

// Offline
export { offlineSyncEngine } from './offline/OfflineSyncEngine'
export type { SyncStatus } from './offline/OfflineSyncEngine'
export { offlinePut, offlineGet, offlineGetAll, offlineDelete, offlineClear, offlineCount, OfflineStores } from './offline/offlineDb'
export type { SyncQueueItem, OfflineStoreName } from './offline/offlineDb'

// RBAC
export { hasPermission, hasModuleAccess, getEffectivePermissions } from './rbac/permissions'
export { usePermission } from './rbac/usePermission'

// Security
export { sessionGuard } from './security/sessionGuard'

// Logging
export { logger, LogLevel } from './logging/logger'

