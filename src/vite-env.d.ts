/// <reference types="vite/client" />

import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresBranchAccess?: boolean
    roles?: string[]
    permission?: string
    module?: string
  }
}

declare module '*.png' {
  const value: string
  export default value
}
