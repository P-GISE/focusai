import test from 'node:test'
import assert from 'node:assert/strict'
import { commandNames, commands, optionNames } from './commands.js'

test('defines Korean slash command names', () => {
  const names = commands.map((command) => command.name)

  assert.deepEqual(names, [
    commandNames.status,
    commandNames.summary,
    commandNames.tickets,
    commandNames.ticketDetail,
    commandNames.ticketUpdate,
    commandNames.userSearch,
    commandNames.recentSessions,
    commandNames.auditLogs,
    commandNames.notificationChannelSet,
    commandNames.notificationChannelList,
    commandNames.announcementCreate,
    commandNames.announcementList,
    commandNames.announcementUpdate,
    commandNames.announcementEnd,
  ])
})

test('uses Korean option names for admin actions', () => {
  const ticketUpdate = commands.find((command) => command.name === commandNames.ticketUpdate)
  const announcementCreate = commands.find((command) => command.name === commandNames.announcementCreate)

  assert.deepEqual(
    ticketUpdate?.options?.map((option) => option.name),
    [optionNames.ticketId, optionNames.status, optionNames.reply],
  )
  assert.deepEqual(
    announcementCreate?.options?.map((option) => option.name),
    [optionNames.title, optionNames.body, optionNames.tone, optionNames.pinned],
  )
})

test('uses Korean option names for lookup and announcement management', () => {
  const ticketDetail = commands.find((command) => command.name === commandNames.ticketDetail)
  const userSearch = commands.find((command) => command.name === commandNames.userSearch)
  const recentSessions = commands.find((command) => command.name === commandNames.recentSessions)
  const auditLogs = commands.find((command) => command.name === commandNames.auditLogs)
  const notificationChannelSet = commands.find((command) => command.name === commandNames.notificationChannelSet)
  const announcementUpdate = commands.find((command) => command.name === commandNames.announcementUpdate)
  const announcementEnd = commands.find((command) => command.name === commandNames.announcementEnd)

  assert.deepEqual(ticketDetail?.options?.map((option) => option.name), [optionNames.ticketId])
  assert.deepEqual(userSearch?.options?.map((option) => option.name), [optionNames.email, optionNames.name])
  assert.deepEqual(recentSessions?.options?.map((option) => option.name), [optionNames.count])
  assert.deepEqual(auditLogs?.options?.map((option) => option.name), [optionNames.count])
  assert.deepEqual(
    notificationChannelSet?.options?.map((option) => option.name),
    [optionNames.notificationKind, optionNames.mentionRole],
  )
  assert.deepEqual(
    announcementUpdate?.options?.map((option) => option.name),
    [
      optionNames.announcementId,
      optionNames.title,
      optionNames.body,
      optionNames.tone,
      optionNames.pinned,
      optionNames.active,
    ],
  )
  assert.deepEqual(announcementEnd?.options?.map((option) => option.name), [optionNames.announcementId])
})
