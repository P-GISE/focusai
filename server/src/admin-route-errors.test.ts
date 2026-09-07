import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getAdminRoleUpdateErrorResponse,
  getAnnouncementMutationErrorResponse,
  getSupportTicketAdminUpdateErrorResponse,
} from './admin-route-errors.js'

test('admin role update errors keep protected account responses explicit', () => {
  assert.deepEqual(getAdminRoleUpdateErrorResponse(new Error('ADMIN_TARGET_NOT_FOUND')), {
    status: 404,
    error: '사용자를 찾을 수 없습니다.',
  })
  assert.deepEqual(getAdminRoleUpdateErrorResponse(new Error('SELF_ADMIN_ROLE_UPDATE_BLOCKED')), {
    status: 400,
    error: '이 화면에서는 자신의 관리자 권한을 변경할 수 없습니다.',
  })
  assert.deepEqual(getAdminRoleUpdateErrorResponse(new Error('LAST_ADMIN_BLOCKED')), {
    status: 400,
    error: '최소 한 개 이상의 관리자 계정은 유지되어야 합니다.',
  })
  assert.deepEqual(getAdminRoleUpdateErrorResponse(new Error('ALLOWLIST_ADMIN_LOCKED')), {
    status: 400,
    error: '이 관리자 계정은 서버 허용 목록으로 보호되고 있습니다.',
  })
})

test('announcement and support admin mutations expose not-found responses', () => {
  assert.deepEqual(getAnnouncementMutationErrorResponse(new Error('ANNOUNCEMENT_NOT_FOUND')), {
    status: 404,
    error: '공지사항을 찾을 수 없습니다.',
  })
  assert.deepEqual(getSupportTicketAdminUpdateErrorResponse(new Error('SUPPORT_TICKET_NOT_FOUND')), {
    status: 404,
    error: '문의 내역을 찾을 수 없습니다.',
  })
})

test('unknown admin mutation errors fall through to generic route handling', () => {
  assert.equal(getAdminRoleUpdateErrorResponse(new Error('DATABASE_DOWN')), null)
  assert.equal(getAnnouncementMutationErrorResponse(new Error('DATABASE_DOWN')), null)
  assert.equal(getSupportTicketAdminUpdateErrorResponse(new Error('DATABASE_DOWN')), null)
}
)
