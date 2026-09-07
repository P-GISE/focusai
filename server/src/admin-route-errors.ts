export type AdminRouteErrorResponse = {
  status: number
  error: string
}

function readErrorCode(error: unknown) {
  return error instanceof Error ? error.message : ''
}

export function getAdminRoleUpdateErrorResponse(error: unknown): AdminRouteErrorResponse | null {
  switch (readErrorCode(error)) {
    case 'ADMIN_TARGET_NOT_FOUND':
      return { status: 404, error: '사용자를 찾을 수 없습니다.' }
    case 'SELF_ADMIN_ROLE_UPDATE_BLOCKED':
      return { status: 400, error: '이 화면에서는 자신의 관리자 권한을 변경할 수 없습니다.' }
    case 'LAST_ADMIN_BLOCKED':
      return { status: 400, error: '최소 한 개 이상의 관리자 계정은 유지되어야 합니다.' }
    case 'ALLOWLIST_ADMIN_LOCKED':
      return { status: 400, error: '이 관리자 계정은 서버 허용 목록으로 보호되고 있습니다.' }
    default:
      return null
  }
}

export function getAnnouncementMutationErrorResponse(error: unknown): AdminRouteErrorResponse | null {
  if (readErrorCode(error) === 'ANNOUNCEMENT_NOT_FOUND') {
    return { status: 404, error: '공지사항을 찾을 수 없습니다.' }
  }

  return null
}

export function getSupportTicketAdminUpdateErrorResponse(error: unknown): AdminRouteErrorResponse | null {
  if (readErrorCode(error) === 'SUPPORT_TICKET_NOT_FOUND') {
    return { status: 404, error: '문의 내역을 찾을 수 없습니다.' }
  }

  return null
}
