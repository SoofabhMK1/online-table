import { useEffect, useRef, useState } from 'react'

interface CacheEntry<T> {
  promise: Promise<T>
  value?: T
  ts: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()
const DEFAULT_TTL = 500

function nowMs() {
  return Date.now()
}

async function runOnce<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined
  if (hit && hit.value !== undefined && nowMs() - hit.ts < ttl) {
    return hit.value
  }
  if (inflight.has(key)) {
    return inflight.get(key) as Promise<T>
  }
  const p = (async () => {
    try {
      const value = await fetcher()
      cache.set(key, { promise: Promise.resolve(value), value, ts: nowMs() })
      return value
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

export interface CachedFetchResult<T> {
  data: T | undefined
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * 客户端请求去重 + 短期缓存 hook。
 * - 同 key + 同 fetcher 引用 + ttl（默认 500ms）内复用响应。
 * - 组件卸载时不再触发 setState。
 * - 调用 refresh() 可绕过缓存强制刷新（同时清空缓存条目）。
 */
export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  ttl: number = DEFAULT_TTL,
): CachedFetchResult<T> {
  const [data, setData] = useState<T | undefined>(
    () => (cache.get(key) as CacheEntry<T> | undefined)?.value,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    runOnce(key, fetcher, ttl)
      .then((value) => {
        if (!active || !aliveRef.current) return
        setData(value)
        setLoading(false)
      })
      .catch((e: Error) => {
        if (!active || !aliveRef.current) return
        setError(e)
        setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, ...deps])

  const refresh = () => {
    cache.delete(key)
    setTick((v) => v + 1)
  }

  return { data, loading, error, refresh }
}

/** 手动清空所有缓存（用于跨用户场景）。 */
export function clearFetchCache() {
  cache.clear()
  inflight.clear()
}
