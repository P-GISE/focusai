import test from 'node:test'
import assert from 'node:assert/strict'
import {
  allowedNotificationMentions,
  formatNotificationSettings,
  withMention,
} from './notification-settings.js'

test('formats notification settings with channels and role mentions', () => {
  const reply = formatNotificationSettings({
    support: { channelId: 'channel-1', mentionRoleId: 'role-1' },
    health: { channelId: 'channel-2', mentionRoleId: null },
  })

  assert.match(reply, /문의: <#channel-1>, 멘션: <@&role-1>/)
  assert.match(reply, /상태: <#channel-2>/)
  assert.match(reply, /일일요약: 설정 안 됨/)
})

test('allowedNotificationMentions suppresses user-controlled Discord mentions', () => {
  assert.deepEqual(allowedNotificationMentions({ channelId: 'channel-1', mentionRoleId: 'role-1' }), {
    parse: [],
    roles: ['role-1'],
  })
  assert.deepEqual(allowedNotificationMentions({ channelId: 'channel-1', mentionRoleId: null }), {
    parse: [],
    roles: [],
  })
})

test('prepends role mention when a setting has a mention role', () => {
  assert.equal(
    withMention('새 문의가 접수되었습니다.', { channelId: 'channel-1', mentionRoleId: 'role-1' }),
    '<@&role-1>\n새 문의가 접수되었습니다.',
  )
  assert.equal(withMention('정상입니다.', { channelId: 'channel-1', mentionRoleId: null }), '정상입니다.')
})
