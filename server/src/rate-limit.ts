import type { NextFunction, Request, Response } from 'express'

type RateLimitOptions = {
  bucket: string
  max: number
  windowMs: number
  keyBy?: (request: Request) => string
}

type RateLimitBucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitBucket>()
let lastCleanupAt = 0

function getClientIp(request: Request) {
  return request.ip || request.socket.remoteAddress || 'unknown'
}

function defaultKeyBy(request: Request) {
  if (request.authContext) {
    return `user:${request.authContext.userId}`
  }

  return `ip:${getClientIp(request)}`
}

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < 60_000) {
    return
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }

  lastCleanupAt = now
}

export function createRateLimit(options: RateLimitOptions) {
  return (request: Request, response: Response, next: NextFunction) => {
    const now = Date.now()
    cleanupExpiredBuckets(now)

    const keySource = (options.keyBy ?? defaultKeyBy)(request)
    const bucketKey = `${options.bucket}:${keySource}`
    const existing = buckets.get(bucketKey)

    if (!existing || existing.resetAt <= now) {
      buckets.set(bucketKey, {
        count: 1,
        resetAt: now + options.windowMs,
      })
      next()
      return
    }

    if (existing.count >= options.max) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((existing.resetAt - now) / 1000))))
      response.status(429).json({ error: 'Too many requests. Please try again later.' })
      return
    }

    existing.count += 1
    buckets.set(bucketKey, existing)
    next()
  }
}

export function getRateLimitStats() {
  const byBucket = new Map<string, number>()

  for (const key of buckets.keys()) {
    const separatorIndex = key.indexOf(':')
    const bucketName = separatorIndex === -1 ? key : key.slice(0, separatorIndex)
    byBucket.set(bucketName, (byBucket.get(bucketName) ?? 0) + 1)
  }

  return {
    totalActiveBuckets: buckets.size,
    buckets: Array.from(byBucket.entries())
      .map(([bucket, activeKeys]) => ({ bucket, activeKeys }))
      .sort((left, right) => left.bucket.localeCompare(right.bucket)),
  }
}
