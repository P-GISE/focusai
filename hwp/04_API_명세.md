# 04. API 명세

API 서버는 Express 기반이며 기본 개발 주소는 `http://127.0.0.1:8787`입니다. 클라이언트에서는 `src/lib/api.ts`의 fetch 래퍼를 통해 `/api/*`를 호출합니다.

## 공통 규칙

- JSON 요청/응답을 사용합니다.
- 인증은 HttpOnly 세션 쿠키 `focusai_session` 기반입니다.
- 인증 필요 API는 `requireAuth`를 통과해야 합니다.
- 관리자 API는 `requireAdmin`과 `adminRateLimit`을 통과해야 합니다.
- DB 설정이 없으면 DB 의존 API는 503을 반환합니다.
- 검증 실패는 대체로 400 응답입니다.

## 공통 API

### `GET /api/health`

서비스 상태를 반환합니다.

주요 응답:

- `apiReachable`
- `mariaEnabled`
- `mariaReachable`
- `anthropicEnabled`

### `GET /api/bootstrap`

현재 로그인 상태와 초기 화면 데이터를 반환합니다.

로그인 상태면 다음을 포함합니다.

- `profile`
- `settings`
- `sessions`
- `status.authenticated`

## 인증과 계정

### `POST /api/auth/register`

회원가입 후 세션 쿠키를 발급합니다.

입력:

- `email`
- `password`
- `name`

### `POST /api/auth/login`

로그인 후 세션 쿠키를 발급합니다.

입력:

- `email`
- `password`

### `POST /api/auth/logout`

현재 세션을 폐기하고 쿠키를 제거합니다.

### `POST /api/auth/forgot-password`

비밀번호 재설정 메일 발송을 요청합니다. SMTP 미설정 시 503을 반환합니다.

### `POST /api/auth/reset-password`

재설정 토큰으로 새 비밀번호를 저장합니다.

### `POST /api/account/password`

현재 비밀번호를 확인한 뒤 비밀번호를 변경합니다. 인증과 account rate limit이 필요합니다.

### `POST /api/account/consent`

현재 동의 버전을 수락 처리합니다.

### `DELETE /api/account`

비밀번호 확인 후 계정을 삭제하고 현재 세션을 제거합니다.

### `PUT /api/profile`

프로필과 사용자 설정을 저장합니다.

입력:

- `profile`
- `settings`

## 학습 세션과 피드백

### `POST /api/sessions`

학습 세션을 저장합니다.

저장 대상:

- 세션 요약
- 점수 타임라인
- 이벤트 로그
- 결과 메모

서버는 세션 소유권을 검증하고 비정상 생성 시각을 보정합니다.

### `PATCH /api/sessions/:sessionId/notes`

세션 결과 메모를 수정합니다.

입력:

- `studied`
- `distraction`
- `nextGoal`

### `GET /api/ai/feedback`

저장된 세션과 설정을 기반으로 AI 피드백을 생성합니다.

응답:

- `insights`
- `source`: `anthropic` 또는 `local`
- `model`

Anthropic API가 비활성화되었거나 실패하면 로컬 분석으로 fallback합니다.

## 공지와 문의

### `GET /api/announcements/active`

현재 활성 공지를 반환합니다.

### `GET /api/announcements`

게시 가능한 공지 목록을 반환합니다.

### `GET /api/support/tickets`

현재 사용자의 문의 목록을 반환합니다.

### `POST /api/support/tickets`

문의/신고를 접수합니다.

입력:

- `category`: `inquiry`, `bug`, `report`, `account`, `other`
- `subject`
- `body`

## 관리자 API

모든 관리자 API는 인증, 관리자 권한, 관리자 rate limit이 필요합니다.

### `GET /api/admin/overview`

관리자 대시보드 데이터를 반환합니다.

포함 데이터:

- `overview.totals`
- `overview.recentUsers`
- `overview.recentSessions`
- `overview.users`
- `overview.sessions`
- `overview.topSubjects`
- `overview.dailyStats`
- `overview.announcements`
- `overview.supportTickets`
- `overview.auditLogs`
- `system`

### `PATCH /api/admin/users/:userId/role`

사용자 관리자 권한을 변경합니다.

입력:

- `isAdmin`

자기 자신의 권한 변경, 마지막 관리자 제거, allowlist 관리자 권한 변경은 차단됩니다.

### `POST /api/admin/announcements`

공지를 등록합니다.

입력:

- `title`
- `body`
- `tone`
- `isActive`
- `isPinned`
- `startsAt`
- `endsAt`

### `PATCH /api/admin/announcements/:announcementId`

공지를 수정합니다. 종료 시각은 시작 시각보다 뒤여야 합니다.

### `DELETE /api/admin/announcements/:announcementId`

공지를 삭제합니다.

### `PATCH /api/admin/support/tickets/:ticketId`

문의 상태와 관리자 답변을 저장합니다.

입력:

- `status`: `open`, `reviewing`, `resolved`, `closed`
- `adminReply`

## Discord 봇 관리 API

### `GET /api/admin/discord-bot`

FocusAI Discord 봇 설정과 런타임 상태를 반환합니다.

### `PUT /api/admin/discord-bot/settings`

FocusAI Discord 봇 설정을 저장합니다. 토큰 입력 또는 삭제도 처리합니다.

### `POST /api/admin/discord-bot/start`

FocusAI Discord 봇을 활성화하고 시작합니다.

### `POST /api/admin/discord-bot/stop`

FocusAI Discord 봇을 비활성화하고 중지합니다.

### `GET /api/admin/discord-bot/lostark`

Lost Ark Discord 봇 설정과 런타임 상태를 반환합니다.

### `PUT /api/admin/discord-bot/lostark/settings`

Lost Ark Discord 봇 설정을 저장합니다.

### `POST /api/admin/discord-bot/lostark/start`

Lost Ark Discord 봇 하위 프로세스를 시작합니다.

### `POST /api/admin/discord-bot/lostark/stop`

Lost Ark Discord 봇 하위 프로세스를 중지합니다.

## Rate limit

| 영역 | 환경변수 |
| --- | --- |
| 인증 | `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX` |
| 계정/문의 | `ACCOUNT_RATE_LIMIT_WINDOW_MS`, `ACCOUNT_RATE_LIMIT_MAX` |
| AI 피드백 | `AI_RATE_LIMIT_WINDOW_MS`, `AI_RATE_LIMIT_MAX` |
| 관리자 | `ADMIN_RATE_LIMIT_WINDOW_MS`, `ADMIN_RATE_LIMIT_MAX` |

Rate limit 구현은 메모리 기반입니다. 다중 컨테이너 운영에서는 공유 저장소 기반 rate limit으로 바꾸는 것이 좋습니다.
