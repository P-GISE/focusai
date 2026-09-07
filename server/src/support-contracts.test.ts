import test from 'node:test'
import assert from 'node:assert/strict'
import { supportTicketCreateSchema } from './contracts.js'

test('support ticket create schema limits subject and body length', () => {
  assert.equal(
    supportTicketCreateSchema.safeParse({
      category: 'bug',
      subject: '앱 화면 문의',
      body: '문의 내용을 구체적으로 적었습니다.',
    }).success,
    true,
  )

  assert.equal(
    supportTicketCreateSchema.safeParse({
      category: 'bug',
      subject: '가'.repeat(81),
      body: '문의 내용을 구체적으로 적었습니다.',
    }).success,
    false,
  )

  assert.equal(
    supportTicketCreateSchema.safeParse({
      category: 'bug',
      subject: '앱 화면 문의',
      body: '가'.repeat(801),
    }).success,
    false,
  )
})
