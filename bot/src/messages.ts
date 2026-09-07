import type {
  AdminOverviewPayload,
  AdminAuditLogPayload,
  AdminSessionRecordPayload,
  AdminUserRecordPayload,
  AnnouncementPayload,
  SupportTicketPayload,
} from '../../server/src/contracts.js'

export type HealthStatus = {
  mariaEnabled: boolean
  mariaReachable: boolean
  anthropicEnabled: boolean
  smtpEnabled: boolean
}

function yesNo(value: boolean) {
  return value ? '설정됨' : '설정 안 됨'
}

function ticketStatusLabel(status: SupportTicketPayload['status']) {
  const labels: Record<SupportTicketPayload['status'], string> = {
    open: '열림',
    reviewing: '검토중',
    resolved: '해결됨',
    closed: '닫힘',
  }

  return labels[status]
}

function ticketCategoryLabel(category: SupportTicketPayload['category']) {
  const labels: Record<SupportTicketPayload['category'], string> = {
    inquiry: '문의',
    bug: '버그',
    report: '신고',
    account: '계정',
    other: '기타',
  }

  return labels[category]
}

function announcementToneLabel(tone: AnnouncementPayload['tone']) {
  const labels: Record<AnnouncementPayload['tone'], string> = {
    info: '정보',
    good: '좋음',
    warn: '주의',
    danger: '위험',
  }

  return labels[tone]
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}…`
}

export function formatHealthStatus(status: HealthStatus) {
  const mariaState = status.mariaEnabled
    ? `설정됨, ${status.mariaReachable ? '연결됨' : '연결 안 됨'}`
    : '설정 안 됨'

  return [
    'FocusAI 상태',
    `MariaDB: ${mariaState}`,
    `AI: ${yesNo(status.anthropicEnabled)}`,
    `SMTP: ${yesNo(status.smtpEnabled)}`,
  ].join('\n')
}

export function formatAdminSummary(overview: AdminOverviewPayload) {
  const topSubjects = overview.topSubjects.length
    ? overview.topSubjects
        .map((subject) => `${subject.subject} (${subject.sessionCount}개, 평균 ${subject.averageFocusScore}점)`)
        .join(', ')
    : '아직 학습 과목 데이터가 없습니다.'

  const openTickets = overview.supportTickets.filter((ticket) =>
    ticket.status === 'open' || ticket.status === 'reviewing',
  ).length

  return [
    'FocusAI 관리자 요약',
    `전체 사용자: ${overview.totals.totalUsers}명`,
    `관리자: ${overview.totals.adminUsers}명`,
    `오늘 세션: ${overview.totals.sessionsToday}개`,
    `최근 7일 세션: ${overview.totals.sessions7d}개`,
    `최근 7일 활성 사용자: ${overview.totals.activeUsers7d}명`,
    `평균 집중 점수: ${overview.totals.averageFocusScore}점`,
    `열림/검토중 문의: ${openTickets}개`,
    `상위 과목: ${topSubjects}`,
  ].join('\n')
}

export function formatSupportTicketDetail(ticket: SupportTicketPayload) {
  return [
    `문의 #${ticket.id} [${ticketStatusLabel(ticket.status)}]`,
    `제목: ${ticket.subject}`,
    `사용자: ${ticket.userName} <${ticket.userEmail}>`,
    `분류: ${ticketCategoryLabel(ticket.category)}`,
    `작성일: ${ticket.createdAt}`,
    `수정일: ${ticket.updatedAt}`,
    '',
    '내용',
    truncate(ticket.body, 1200),
    '',
    '관리자 답변',
    ticket.adminReply ? truncate(ticket.adminReply, 800) : '아직 답변이 없습니다.',
  ].join('\n')
}

export function formatSupportTickets(tickets: SupportTicketPayload[]) {
  if (tickets.length === 0) {
    return '조회된 문의가 없습니다.'
  }

  return tickets
    .slice(0, 10)
    .map((ticket) =>
      [
        `#${ticket.id} [${ticketStatusLabel(ticket.status)}] ${ticket.subject}`,
        `${ticket.userName} <${ticket.userEmail}>`,
        `분류: ${ticketCategoryLabel(ticket.category)}`,
        `수정일: ${ticket.updatedAt}`,
      ].join('\n'),
    )
    .join('\n\n')
}

export function formatUserSearchResults(users: AdminUserRecordPayload[]) {
  if (users.length === 0) {
    return '조회된 사용자가 없습니다.'
  }

  return users
    .slice(0, 10)
    .map((user) =>
      [
        `${user.name} <${user.email}>`,
        `ID: ${user.id}`,
        `관리자: ${user.isAdmin ? '예' : '아니오'}`,
        `세션: ${user.sessionCount}개, 평균 집중 점수: ${user.averageFocusScore}점`,
        `최근 세션: ${user.lastSessionAt ?? '없음'}`,
      ].join('\n'),
    )
    .join('\n\n')
}

export function formatRecentSessions(sessions: AdminSessionRecordPayload[]) {
  if (sessions.length === 0) {
    return '조회된 학습 세션이 없습니다.'
  }

  return sessions
    .slice(0, 10)
    .map((session) =>
      [
        `${session.userName} <${session.userEmail}>`,
        `과목: ${session.subject}, 모드: ${session.mode}`,
        `평균/최종 점수: ${session.avgScore}/${session.finalScore}`,
        `집중 시간: ${Math.round(session.focusedSeconds / 60)}분 / 총 ${Math.round(session.elapsedSeconds / 60)}분`,
        `생성일: ${session.createdAt}`,
      ].join('\n'),
    )
    .join('\n\n')
}

export function formatAuditLogs(logs: AdminAuditLogPayload[]) {
  if (logs.length === 0) {
    return '조회된 감사 로그가 없습니다.'
  }

  return logs
    .slice(0, 10)
    .map((log) =>
      [
        `#${log.id} ${log.actionType}`,
        `${log.actorName} <${log.actorEmail}>`,
        `대상: ${log.targetType}${log.targetId ? ` #${log.targetId}` : ''}`,
        `요약: ${log.summary}`,
        `생성일: ${log.createdAt}`,
      ].join('\n'),
    )
    .join('\n\n')
}

export function formatAnnouncements(announcements: AnnouncementPayload[]) {
  if (announcements.length === 0) {
    return '조회된 공지가 없습니다.'
  }

  return announcements
    .slice(0, 10)
    .map((announcement) =>
      [
        `#${announcement.id} [${announcement.isActive ? '활성' : '비활성'}] ${announcement.title}`,
        `공지 유형: ${announcementToneLabel(announcement.tone)}, 고정: ${announcement.isPinned ? '예' : '아니오'}`,
        `수정일: ${announcement.updatedAt}`,
      ].join('\n'),
    )
    .join('\n\n')
}

export function formatNewSupportTicketNotification(ticket: SupportTicketPayload, adminUrl: string | undefined) {
  const lines = [
    '새 문의가 접수되었습니다.',
    `#${ticket.id} [${ticketStatusLabel(ticket.status)}] ${ticket.subject}`,
    `${ticket.userName} <${ticket.userEmail}>`,
    `분류: ${ticketCategoryLabel(ticket.category)}`,
  ]

  if (adminUrl) {
    lines.push(`관리자 페이지: ${adminUrl}`)
  }

  return lines.join('\n')
}
