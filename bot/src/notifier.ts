import type { SupportTicketPayload } from '../../server/src/contracts.js'
import type { HealthStatus } from './messages.js'

function isActionableTicket(ticket: SupportTicketPayload) {
  return ticket.status === 'open' || ticket.status === 'reviewing'
}

export function createSupportTicketTracker() {
  const seenTicketIds = new Set<string>()
  let initialized = false

  return {
    next(tickets: SupportTicketPayload[]) {
      const actionableTickets = tickets.filter(isActionableTicket)
      const freshTickets = initialized
        ? actionableTickets.filter((ticket) => !seenTicketIds.has(ticket.id))
        : []

      for (const ticket of actionableTickets) {
        seenTicketIds.add(ticket.id)
      }
      initialized = true

      return freshTickets
    },
  }
}

function isHealthy(status: HealthStatus) {
  return status.mariaEnabled && status.mariaReachable && status.anthropicEnabled && status.smtpEnabled
}

export function createHealthStatusTracker() {
  let previousHealthy: boolean | null = null

  return {
    next(status: HealthStatus) {
      const currentHealthy = isHealthy(status)

      if (previousHealthy === null) {
        previousHealthy = currentHealthy
        return null
      }

      if (previousHealthy && !currentHealthy) {
        previousHealthy = currentHealthy

        if (!status.mariaReachable) {
          return 'FocusAI 상태 경고: MariaDB 연결이 끊겼습니다.'
        }

        return 'FocusAI 상태 경고: 주요 서비스 설정을 확인해야 합니다.'
      }

      if (!previousHealthy && currentHealthy) {
        previousHealthy = currentHealthy
        return 'FocusAI 상태 복구: 모든 주요 서비스가 정상입니다.'
      }

      previousHealthy = currentHealthy
      return null
    },
  }
}
