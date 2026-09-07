export const RECENT_SESSION_LIMIT = 120
export const SESSION_SAVE_OFFLINE_MESSAGE =
  '세션 저장 서버에 연결할 수 없어 결과는 현재 화면에 임시로만 남아 있습니다.'
export const SESSION_SAVE_FAILURE_MESSAGE =
  '세션을 서버에 저장하지 못했습니다. 결과는 현재 브라우저에 임시로 남아 있습니다.'

type SessionIdentity = {
  id: string
}

export function mergeRecentSession<TSession extends SessionIdentity>(
  current: TSession[],
  session: TSession,
  limit = RECENT_SESSION_LIMIT,
) {
  return [session, ...current.filter((entry) => entry.id !== session.id)].slice(0, limit)
}
