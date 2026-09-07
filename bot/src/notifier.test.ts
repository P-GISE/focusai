import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createHealthStatusTracker,
  createSupportTicketTracker,
} from './notifier.js'
import type { HealthStatus } from './messages.js'
import type { SupportTicketPayload } from '../../server/src/contracts.js'

const ticket = (id: string, status: SupportTicketPayload['status'] = 'open'): SupportTicketPayload => ({
  id,
  userId: '3',
  userName: 'Admin Test',
  userEmail: 'admin@example.com',
  category: 'inquiry',
  status,
  subject: `Ticket ${id}`,
  body: 'Body',
  adminReply: null,
  createdAt: '2026-05-11T10:00:00.000Z',
  updatedAt: '2026-05-11T10:00:00.000Z',
  answeredAt: null,
})

const healthy: HealthStatus = {
  mariaEnabled: true,
  mariaReachable: true,
  anthropicEnabled: true,
  smtpEnabled: true,
}

test('support ticket tracker suppresses initial tickets and returns only new open tickets', () => {
  const tracker = createSupportTicketTracker()

  assert.deepEqual(tracker.next([ticket('1')]), [])
  assert.deepEqual(tracker.next([ticket('1'), ticket('2'), ticket('3', 'closed')]), [ticket('2')])
  assert.deepEqual(tracker.next([ticket('1'), ticket('2')]), [])
})

test('health status tracker reports failure and recovery transitions', () => {
  const tracker = createHealthStatusTracker()

  assert.equal(tracker.next(healthy), null)
  assert.equal(
    tracker.next({ ...healthy, mariaReachable: false }),
    'FocusAI 상태 경고: MariaDB 연결이 끊겼습니다.',
  )
  assert.equal(tracker.next({ ...healthy, mariaReachable: false }), null)
  assert.equal(tracker.next(healthy), 'FocusAI 상태 복구: 모든 주요 서비스가 정상입니다.')
})
