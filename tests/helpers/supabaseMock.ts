// ═══════════════════════════════════════════════════════════════════════════════
// Chainable Supabase client mock for service/store unit tests.
//
// Every supabase.from(table) call creates a query object that records each
// builder method invoked on it (select/eq/insert/update/...). Awaiting the query
// (directly, or via .single()/.maybeSingle()) resolves to the next response
// queued for that table with `queue(table, response)`; tables with nothing
// queued resolve to { data: null, error: null }.
//
// supabase.rpc(name, args) is recorded the same way and resolves to the next
// response queued with `queueRpc(name, response)`.
// ═══════════════════════════════════════════════════════════════════════════════

export type MockResponse = { data?: unknown; error?: { message: string } | null }

export interface RecordedQuery {
  table: string
  calls: { method: string; args: unknown[] }[]
}

export function createSupabaseMock() {
  const tableQueues = new Map<string, MockResponse[]>()
  const rpcQueues = new Map<string, MockResponse[]>()
  const queries: RecordedQuery[] = []
  const rpcCalls: { name: string; args: unknown }[] = []

  function next(queues: Map<string, MockResponse[]>, key: string) {
    const r = queues.get(key)?.shift() ?? {}
    return { data: r.data ?? null, error: r.error ?? null }
  }

  function makeQuery(table: string) {
    const record: RecordedQuery = { table, calls: [] }
    queries.push(record)
    let result: Promise<{ data: unknown; error: unknown }> | null = null
    const settle = () => (result ??= Promise.resolve(next(tableQueues, table)))

    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (res: any, rej: any) => settle().then(res, rej)
          }
          return (...args: unknown[]) => {
            record.calls.push({ method: prop, args })
            return proxy
          }
        },
      },
    )
    return proxy
  }

  const client = {
    from: (table: string) => makeQuery(table),
    rpc: (name: string, args?: unknown) => {
      rpcCalls.push({ name, args })
      return Promise.resolve(next(rpcQueues, name))
    },
  }

  return {
    client,
    queries,
    rpcCalls,
    queue(table: string, ...responses: MockResponse[]) {
      tableQueues.set(table, [...(tableQueues.get(table) ?? []), ...responses])
    },
    queueRpc(name: string, ...responses: MockResponse[]) {
      rpcQueues.set(name, [...(rpcQueues.get(name) ?? []), ...responses])
    },
    /** All recorded queries against a table, in call order. */
    on(table: string) {
      return queries.filter((q) => q.table === table)
    },
    reset() {
      tableQueues.clear()
      rpcQueues.clear()
      queries.length = 0
      rpcCalls.length = 0
    },
  }
}

/** First call of `method` on a recorded query, or undefined. */
export function call(q: RecordedQuery | undefined, method: string) {
  return q?.calls.find((c) => c.method === method)
}

/** Every call of `method` on a recorded query. */
export function calls(q: RecordedQuery | undefined, method: string) {
  return q?.calls.filter((c) => c.method === method) ?? []
}
