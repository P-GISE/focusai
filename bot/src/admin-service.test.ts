import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createDiscordAdminGuard,
  normalizeDiscordRoleIds,
  parseActorUserId,
  resolveActorUserId,
  parseTicketId,
} from './admin-service.js'

test('allows configured administrator role in the configured guild and channel', () => {
  const guard = createDiscordAdminGuard({
    guildIds: new Set(['guild-1']),
    channelId: 'channel-1',
    roleIds: new Set(['role-admin']),
  })

  const result = guard({
    guildId: 'guild-1',
    channelId: 'channel-1',
    roleIds: new Set(['role-admin', 'role-other']),
  })

  assert.deepEqual(result, { ok: true })
})

test('rejects commands outside the configured Discord guild', () => {
  const guard = createDiscordAdminGuard({
    guildIds: new Set(['guild-1']),
    channelId: 'channel-1',
    roleIds: new Set(['role-admin']),
  })

  const result = guard({
    guildId: 'guild-2',
    channelId: 'channel-1',
    roleIds: new Set(['role-admin']),
  })

  assert.deepEqual(result, {
    ok: false,
    message: 'This command is only available in the configured FocusAI admin server.',
  })
})

test('rejects commands without one of the configured administrator roles', () => {
  const guard = createDiscordAdminGuard({
    guildIds: new Set(['guild-1']),
    channelId: undefined,
    roleIds: new Set(['role-admin']),
  })

  const result = guard({
    guildId: 'guild-1',
    channelId: 'channel-1',
    roleIds: new Set(['role-member']),
  })

  assert.deepEqual(result, {
    ok: false,
    message: 'You do not have permission to use FocusAI admin bot commands.',
  })
})

test('allows commands from any configured Discord guild', () => {
  const guard = createDiscordAdminGuard({
    guildIds: new Set(['guild-1', 'guild-2']),
    channelId: undefined,
    roleIds: new Set(),
  })

  assert.deepEqual(
    guard({
      guildId: 'guild-2',
      channelId: 'channel-1',
      roleIds: new Set(),
    }),
    { ok: true },
  )
})

test('parses positive actor and ticket ids', () => {
  assert.equal(parseActorUserId('12'), 12)
  assert.equal(parseTicketId('88'), 88)
})

test('rejects missing or invalid actor and ticket ids', () => {
  assert.throws(() => parseActorUserId(undefined), /DISCORD_BOT_ACTOR_USER_ID/)
  assert.throws(() => parseActorUserId('0'), /positive integer/)
  assert.throws(() => parseTicketId('abc'), /positive integer/)
})

test('resolves empty actor id from the first admin user', () => {
  const actorId = resolveActorUserId(undefined, [
    { id: '2', isAdmin: false },
    { id: '7', isAdmin: true },
  ])

  assert.equal(actorId, 7)
})

test('rejects empty actor id when no admin user exists', () => {
  assert.throws(() => resolveActorUserId(undefined, [{ id: '2', isAdmin: false }]), /관리자 계정을 찾을 수 없습니다/)
})

test('normalizes cached and raw Discord role containers', () => {
  assert.deepEqual(normalizeDiscordRoleIds(['role-a', 'role-b']), new Set(['role-a', 'role-b']))
  assert.deepEqual(
    normalizeDiscordRoleIds({
      cache: new Map([
        ['role-c', { id: 'role-c' }],
        ['role-d', { id: 'role-d' }],
      ]),
    }),
    new Set(['role-c', 'role-d']),
  )
  assert.deepEqual(normalizeDiscordRoleIds(undefined), new Set())
})
