import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatAdminSummary,
  formatAnnouncements,
  formatAuditLogs,
  formatHealthStatus,
  formatNewSupportTicketNotification,
  formatRecentSessions,
  formatSupportTicketDetail,
  formatSupportTickets,
  formatUserSearchResults,
} from './messages.js'
import type { AdminOverviewPayload } from '../../server/src/contracts.js'

const overview: AdminOverviewPayload = {
  totals: {
    totalUsers: 42,
    totalSessions: 128,
    sessionsToday: 7,
    averageFocusScore: 76,
    adminUsers: 2,
    activeUsers7d: 11,
    sessions7d: 39,
    averageFocusScore7d: 81,
  },
  recentUsers: [],
  recentSessions: [],
  users: [
    {
      id: '3',
      name: 'Admin Test',
      email: 'admin@example.com',
      isAdmin: true,
      createdAt: '2026-05-10T00:00:00.000Z',
      lastSessionAt: '2026-05-11T10:00:00.000Z',
      sessionCount: 4,
      averageFocusScore: 82,
      totalStudySeconds: 7200,
      subjects: ['Math'],
    },
  ],
  sessions: [
    {
      sessionId: 'session-1',
      userId: '3',
      userName: 'Admin Test',
      userEmail: 'admin@example.com',
      subject: 'Math',
      mode: 'Pomodoro',
      avgScore: 80,
      finalScore: 85,
      goalMinutes: 50,
      elapsedSeconds: 3600,
      focusedSeconds: 3000,
      tabSwitches: 1,
      idleEvents: 2,
      absenceEvents: 0,
      createdAt: '2026-05-11T10:00:00.000Z',
    },
  ],
  topSubjects: [
    { subject: 'Math', sessionCount: 12, averageFocusScore: 83 },
    { subject: 'English', sessionCount: 9, averageFocusScore: 74 },
  ],
  dailyStats: [
    { date: '2026-05-10', newUsers: 2, sessions: 5, averageFocusScore: 70 },
    { date: '2026-05-11', newUsers: 1, sessions: 8, averageFocusScore: 77 },
  ],
  announcements: [
    {
      id: '7',
      title: 'Maintenance',
      body: 'Maintenance body',
      tone: 'warn',
      isActive: true,
      isPinned: false,
      startsAt: null,
      endsAt: null,
      createdAt: '2026-05-10T10:00:00.000Z',
      updatedAt: '2026-05-11T10:00:00.000Z',
    },
  ],
  supportTickets: [
    {
      id: '15',
      userId: '3',
      userName: 'Admin Test',
      userEmail: 'admin@example.com',
      category: 'bug',
      status: 'open',
      subject: 'Camera issue',
      body: 'The camera permission failed.',
      adminReply: null,
      createdAt: '2026-05-11T10:00:00.000Z',
      updatedAt: '2026-05-11T10:30:00.000Z',
      answeredAt: null,
    },
  ],
  auditLogs: [
    {
      id: '9',
      actorUserId: '3',
      actorName: 'Admin Test',
      actorEmail: 'admin@example.com',
      actionType: 'support.update',
      targetType: 'support_ticket',
      targetId: '15',
      summary: 'Updated support ticket',
      details: null,
      createdAt: '2026-05-11T11:00:00.000Z',
    },
  ],
}

test('formats health status with operational flags', () => {
  const reply = formatHealthStatus({
    mariaEnabled: true,
    mariaReachable: false,
    anthropicEnabled: true,
    smtpEnabled: false,
  })

  assert.match(reply, /FocusAI 상태/)
  assert.match(reply, /MariaDB: 설정됨, 연결 안 됨/)
  assert.match(reply, /AI: 설정됨/)
  assert.match(reply, /SMTP: 설정 안 됨/)
})

test('formats admin summary totals and top subjects', () => {
  const reply = formatAdminSummary(overview)

  assert.match(reply, /전체 사용자: 42명/)
  assert.match(reply, /오늘 세션: 7개/)
  assert.match(reply, /최근 7일 세션: 39개/)
  assert.match(reply, /Math \(12개, 평균 83점\)/)
})

test('formats support tickets with ids and statuses', () => {
  const reply = formatSupportTickets(overview.supportTickets)

  assert.match(reply, /#15 \[열림\] Camera issue/)
  assert.match(reply, /Admin Test <admin@example.com>/)
})

test('formats empty support ticket list', () => {
  const reply = formatSupportTickets([])

  assert.equal(reply, '조회된 문의가 없습니다.')
})

test('formats support ticket detail', () => {
  const reply = formatSupportTicketDetail(overview.supportTickets[0])

  assert.match(reply, /문의 #15 \[열림\]/)
  assert.match(reply, /분류: 버그/)
  assert.match(reply, /아직 답변이 없습니다/)
})

test('formats user search results', () => {
  const reply = formatUserSearchResults(overview.users)

  assert.match(reply, /Admin Test <admin@example.com>/)
  assert.match(reply, /관리자: 예/)
  assert.match(reply, /세션: 4개/)
})

test('formats recent sessions', () => {
  const reply = formatRecentSessions(overview.sessions)

  assert.match(reply, /과목: Math, 모드: Pomodoro/)
  assert.match(reply, /평균\/최종 점수: 80\/85/)
})

test('formats audit logs', () => {
  const reply = formatAuditLogs(overview.auditLogs)

  assert.match(reply, /#9 support.update/)
  assert.match(reply, /대상: support_ticket #15/)
})

test('formats announcements', () => {
  const reply = formatAnnouncements(overview.announcements)

  assert.match(reply, /#7 \[활성\] Maintenance/)
  assert.match(reply, /공지 유형: 주의/)
})

test('formats new support ticket notification with admin link', () => {
  const reply = formatNewSupportTicketNotification(overview.supportTickets[0], 'https://focusai.example/admin')

  assert.match(reply, /새 문의가 접수되었습니다/)
  assert.match(reply, /관리자 페이지: https:\/\/focusai.example\/admin/)
})
