import test from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response } from 'express'
import { createRateLimit } from './rate-limit.js'

function createMockResponse() {
  const state = {
    headers: new Map<string, string>(),
    statusCode: 200,
    body: undefined as unknown,
  }

  const response = {
    setHeader(name: string, value: number | string) {
      state.headers.set(name, String(value))
    },
    status(code: number) {
      state.statusCode = code
      return response
    },
    json(payload: unknown) {
      state.body = payload
      return response
    },
  } as unknown as Response

  return { response, state }
}

test('default rate limit key is not bypassed by spoofed forwarding headers', () => {
  const middleware = createRateLimit({
    bucket: `spoofed-ip-${Date.now()}`,
    windowMs: 60_000,
    max: 1,
  })
  const next = () => {
    nextCalls += 1
  }
  const fixedClientIp = '198.51.100.10'
  let nextCalls = 0

  const first = createMockResponse()
  middleware(
    {
      headers: {
        'x-forwarded-for': '203.0.113.1',
        'x-real-ip': '203.0.113.1',
      },
      ip: fixedClientIp,
    } as unknown as Request,
    first.response,
    next,
  )

  const second = createMockResponse()
  middleware(
    {
      headers: {
        'x-forwarded-for': '203.0.113.2',
        'x-real-ip': '203.0.113.2',
      },
      ip: fixedClientIp,
    } as unknown as Request,
    second.response,
    next,
  )

  assert.equal(nextCalls, 1)
  assert.equal(second.state.statusCode, 429)
  assert.equal(second.state.headers.has('Retry-After'), true)
})
