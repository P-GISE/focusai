# FocusAI Web App

갱신 기준일: 2026-09-07

FocusAI는 브라우저 기반 학습 세션을 기록하고, 카메라/브라우저 신호를 보조 지표로 사용해 집중도를 계산하며, 리포트와 AI 피드백, 공지, 문의, 관리자 운영 기능을 제공하는 학습 보조 애플리케이션입니다.

프런트엔드는 React 19 + Vite + TypeScript, 백엔드는 Express 5 + TypeScript, 저장소는 MariaDB를 사용합니다. 운영 보조 기능으로 FocusAI 관리자 Discord 봇, Lost Ark Discord 봇 실행 관리, Capacitor 기반 Android APK 빌드를 포함합니다.

이 GitHub 저장소는 공개 업로드용으로 정리한 스냅샷입니다. 실제 `.env`, Discord 봇 런타임 JSON, 로그, APK 묶음, 빌드 산출물은 포함하지 않았고, 예시 환경파일과 소스 코드 중심으로 구성했습니다.

## 한눈에 보기

| 항목 | 내용 |
| --- | --- |
| 한국어 프로젝트명 | 포커스 AI |
| 저장소 성격 | 학습 집중도 기록/분석 웹앱 + 관리자 기능 + Android 패키징 |
| 주요 사용자 | 학습자, 서비스 관리자 |
| 실행 형태 | Vite 클라이언트와 Express API 서버를 함께 실행 |
| DB | MariaDB |
| AI 연동 | Anthropic Messages API, 없으면 로컬 분석 fallback |
| 모바일 | Capacitor Android 프로젝트 포함 |

## 주요 기능

### 사용자 기능

- 회원가입, 로그인, 로그아웃
- HttpOnly 세션 쿠키 기반 인증
- Android/cross-origin API 환경용 Bearer 세션 토큰 보조
- 개인정보/카메라 동의와 동의 버전 갱신
- 비밀번호 변경, 메일 기반 비밀번호 재설정, 계정 삭제
- 프로필, 과목, 학습 기본값, 알림/화면 설정 저장
- 학습 세션 시작, 일시정지, 재개, 종료, 자동 복구
- MediaPipe 기반 얼굴/시선/프레이밍 보조 분석
- 탭 전환, idle, 자리 비움, 화면 숨김 신호를 반영한 집중도 기록
- 세션 결과 메모 저장과 수정
- 대시보드와 학습 리포트
- 데스크톱 웹 PDF 리포트 다운로드
- Android APK native Downloads PDF 저장
- Anthropic Claude API 또는 로컬 분석 기반 AI 피드백
- 로컬 실행 환경에서만 `로컬세팅` 상태칩 표시
- 공지 목록과 활성 공지 확인
- 문의/버그/신고 접수와 본인 문의 내역 확인

### 관리자 기능

- 전체 사용자, 세션, 과목, 일별 통계, 문의, 감사 로그 조회
- 사용자 관리자 권한 변경
- 공지 등록, 수정, 삭제, 고정, 활성 기간 설정
- 문의 상태 변경과 관리자 답변 저장
- 시스템 상태, MariaDB 연결, Anthropic 설정, rate limit 상태 확인
- FocusAI Discord 관리자 봇 설정, 시작, 중지
- Lost Ark Discord 봇 설정, 시작, 중지

### FocusAI Discord 관리자 봇

관리자 화면에서 설정하는 FocusAI Discord 봇은 서버 내장 gateway로 실행되며, standalone `bot/src` 구현도 함께 있습니다.

주요 기능:

- 서비스 상태 조회
- 운영 요약 조회
- 문의 목록/상세/처리
- 사용자 검색
- 최근 학습 세션 조회
- 관리자 감사 로그 조회
- 공지 등록/목록/수정/종료
- support, health, daily 알림 채널 설정/조회
- 새 문의, 상태 이상/복구, 일일 요약 알림

명령은 설정된 guild, channel, role 조건으로 제한할 수 있습니다.

### Lost Ark Discord 봇

`lostark-discord-bot/`는 별도 Discord 봇 프로젝트이며, FocusAI 관리자 API에서 설정과 실행 상태를 관리할 수 있습니다. 빌드 시 `server/dist/lostark-discord-bot`으로 복사되고, 운영에서는 bundled output을 `uploads/lostark-discord-bot`으로 stage해 실행할 수 있습니다.

Lost Ark Discord 봇의 배포 기준 소스는 이 저장소의 `lostark-discord-bot/`입니다. 기존 상위 `../디스코드 봇/` 중복 복사본은 프로젝트 밖 백업 위치로 이동했으므로, 기능 수정과 운영 반영은 `lostark-discord-bot/`만 기준으로 진행합니다.

주요 명령:

- `/ping`: 봇 응답 확인
- `/abidos`: 아비도스 제작/재료 계산 보조
- `/homework`: 캐릭터 숙제 알림과 상태 관리
- `/merchant`: 떠돌이 상인 카드 조회, 수동 등록, kloa.gg 동기화, 알림
- `/party`: 파티 모집 패널
- `/roster`: 원정대/캐릭터 정보 조회와 동기화
- `/tts`: 음성 채널 TTS 재생과 퇴장

## 기술 스택

- React 19
- Vite
- TypeScript
- Express 5
- MariaDB
- Zod
- Nodemailer + SMTP
- Anthropic Messages API
- MediaPipe Tasks Vision
- html2pdf.js
- discord.js 14
- Capacitor Android
- ffmpeg-static, google-tts-api, prism-media, opusscript
- Docker, Docker Compose, GitLab CI, Traefik

## 프로젝트 구조

```text
focusai-webapp/
  android/                Capacitor Android 프로젝트와 네이티브 빌드 설정
  src/                    React 클라이언트
  src/lib/                클라이언트 API, 타입, 카메라/비전/집중도 유틸
  server/src/             Express API 서버
  bot/src/                standalone FocusAI Discord 관리자 봇
  discord-bot/            legacy Discord 봇 compose 빌드 컨텍스트
  lostark-discord-bot/    Lost Ark Discord 봇 프로젝트
  db/                     MariaDB DDL과 운영 권한 SQL
  scripts/                개발, 빌드, MediaPipe, Android 보조 스크립트
  public/                 정적 자산과 MediaPipe 모델
  deploy/                 운영 환경변수 템플릿
  docs/                   Node test 기반 문서성/구조 회귀 검증
  hwp/                    과거 시스템/기능/API/운영 설계 문서 복사본
```

생성물인 `dist/`, `server/dist/`, `bot/dist/`, `lostark-discord-bot/dist/`, `node_modules/`, `.codex-local-logs/`, `.codex-logs/`, `output/`, 개발 로그, Android `build/` 하위 파일은 직접 수정하지 않습니다. 공개 저장소에는 APK 패키지와 실제 Discord 봇 상태 JSON을 포함하지 않습니다.

## 처음 써보는 순서

1. MariaDB를 준비하고 `.env.server`의 DB 접속 정보를 채웁니다.
2. `npm install`로 의존성을 설치합니다.
3. `npm run db:init`으로 기본 schema를 생성하거나 보정합니다.
4. `npm run dev`로 클라이언트와 API 서버를 함께 실행합니다.
5. `http://127.0.0.1:5173`에서 회원가입 후 학습 세션을 시작합니다.
6. 카메라 권한을 허용하면 얼굴/프레이밍/시선 보조 지표가 집중도 계산에 반영됩니다.
7. 세션을 종료한 뒤 리포트, 메모, PDF 다운로드, AI 피드백 흐름을 확인합니다.
8. 관리자 계정 설정 후 공지/문의/봇 설정/운영 상태 화면을 확인합니다.

## 빠른 시작

필수 조건:

- Node.js 22 계열
- MariaDB
- Android APK 빌드 시 Android Studio 또는 Android SDK, Java, Gradle 실행 환경

### 1. 패키지 설치

```powershell
npm install
```

### 2. 환경변수 파일 생성

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item .env.server.example .env.server
```

cmd:

```cmd
copy .env.example .env
copy .env.server.example .env.server
```

`.env`는 Vite 클라이언트용이고, `.env.server`는 로컬 Express 서버와 봇 실행용입니다. 실제 비밀값이 들어간 `.env`, `.env.server`, `lostark-discord-bot/.env`는 Git에 커밋하지 않습니다.

### 3. DB 초기화

```powershell
npm run db:init
```

현재 schema는 다음 테이블을 사용합니다.

- `users`
- `subjects`
- `user_subjects`
- `user_settings`
- `study_sessions`
- `session_score_samples`
- `session_events`
- `auth_sessions`
- `password_reset_tokens`
- `announcements`
- `support_tickets`
- `admin_audit_logs`
- `ai_usage_logs`
- `discord_bot_settings`

### 4. 개발 서버 실행

기본 로컬 웹 실행:

```powershell
npm run dev
```

`npm run dev`는 `npm run dev:web`과 같은 흐름입니다. 클라이언트와 API 서버를 함께 실행하고 Discord 봇 자동 시작은 막습니다. 로그인/회원가입까지 확인하려면 이 명령을 기본으로 사용합니다.

클라이언트, API 서버, standalone FocusAI Discord 봇을 함께 실행:

```powershell
npm run dev:all
```

웹과 API만 실행하고 Discord 봇 자동 시작을 막기:

```powershell
npm run dev:web
```

개별 실행:

```powershell
npm run dev:client
npm run dev:server
npm run dev:bot
```

기본 주소:

- Web: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- API: [http://127.0.0.1:8787](http://127.0.0.1:8787)
- Health: [http://127.0.0.1:8787/api/health](http://127.0.0.1:8787/api/health)

Vite 개발 서버는 기본적으로 `0.0.0.0:5173`에 바인딩합니다. 같은 네트워크의 모바일 브라우저에서 확인하려면 PC IPv4 주소를 사용해 `http://<PC_IP>:5173`로 접속합니다. PC에서만 열고 싶으면 실행 전에 `FOCUSAI_CLIENT_HOST=127.0.0.1`로 고정합니다.

실제 모바일 카메라 권한은 브라우저 보안 정책상 HTTPS 보안 컨텍스트가 필요할 수 있으므로 최종 검증은 HTTPS 배포 주소 또는 Android APK에서 진행합니다.

로컬 hostname 또는 사설 LAN 주소로 접속하면 로그인 화면과 상단바에 `로컬세팅` 칩을 표시합니다. 운영 서버 접속에서는 서버 세팅 칩을 표시하지 않고 API 연결 상태만 보여줍니다.

Lost Ark Discord 봇을 단독 개발할 때:

```powershell
cd lostark-discord-bot
npm install
npm run deploy:commands
npm run dev
```

## 주요 npm 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 기본 로컬 웹 실행, 클라이언트와 API 서버 실행 |
| `npm run dev:all` | 클라이언트, API 서버, standalone FocusAI Discord 봇 실행 |
| `npm run dev:web` | 클라이언트와 API 서버만 실행, Discord 봇 자동 시작 비활성화 |
| `npm run dev:client` | Vite 개발 서버 실행 |
| `npm run dev:server` | Express API 서버 실행 |
| `npm run dev:bot` | standalone FocusAI Discord 봇 실행 |
| `npm run build` | 클라이언트, 서버, FocusAI 봇, Lost Ark 봇 전체 빌드 |
| `npm run build:client` | TypeScript와 Vite 클라이언트 빌드 |
| `npm run build:android:web` | Android APK에 들어갈 웹 자산 빌드 |
| `npm run android:sync` | 웹 빌드 결과를 Capacitor Android 프로젝트에 동기화 |
| `npm run android:apk` | Android debug APK 생성 |
| `npm run android:aab` | Android App Bundle 생성 |
| `npm run android:open` | Android 프로젝트를 동기화한 뒤 Android Studio로 열기 |
| `npm run lint` | ESLint 검증 |
| `npm run test:server` | 서버 테스트 |
| `npm run test:bot` | FocusAI 봇 테스트 |
| `npm run test:docs` | 문서성/구조 회귀 테스트 |
| `npm test` | server, bot, docs 테스트 전체 실행 |
| `npm run db:init` | MariaDB schema 초기화 또는 보정 |
| `npm run preview` | 빌드된 클라이언트 preview |
| `npm run start` | 빌드된 운영 서버 실행 |
| `npm run start:bot` | 빌드된 standalone FocusAI 봇 실행 |

## 환경변수 요약

전체 항목은 `.env.example`, `.env.server.example`, `deploy/prod.env.example`을 기준으로 확인합니다.

### 서버와 DB

- `NODE_ENV`
- `PORT`
- `CLIENT_ORIGIN`
- `APP_BASE_URL`
- `MARIADB_HOST`
- `MARIADB_PORT`
- `MARIADB_USER`
- `MARIADB_PASSWORD`
- `MARIADB_DATABASE`
- `MARIADB_CONNECTION_LIMIT`
- `AUTO_MIGRATE_SCHEMA`
- `ALLOW_ROOT_DB_IN_PRODUCTION`

운영 환경에서 `APP_BASE_URL`과 `CLIENT_ORIGIN`은 HTTPS URL이어야 합니다. `CLIENT_ORIGIN`에는 Capacitor Android WebView origin인 `https://localhost`가 자동으로 추가됩니다.

### 인증과 관리자

- `SESSION_COOKIE_NAME`
- `SESSION_TTL_DAYS`
- `ADMIN_EMAILS`
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX`
- `ACCOUNT_RATE_LIMIT_WINDOW_MS`
- `ACCOUNT_RATE_LIMIT_MAX`
- `AI_RATE_LIMIT_WINDOW_MS`
- `AI_RATE_LIMIT_MAX`
- `ADMIN_RATE_LIMIT_WINDOW_MS`
- `ADMIN_RATE_LIMIT_MAX`

`ADMIN_EMAILS`에 포함된 이메일로 로그인한 계정이 관리자 페이지 접근 기준입니다.

### Anthropic AI

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_VERSION`
- `ANTHROPIC_MAX_TOKENS`
- `ANTHROPIC_TIMEOUT_MS`
- `ANTHROPIC_DAILY_REQUEST_LIMIT`
- `ANTHROPIC_DAILY_BUDGET_USD`
- `ANTHROPIC_INPUT_USD_PER_MILLION`
- `ANTHROPIC_OUTPUT_USD_PER_MILLION`
- `ANTHROPIC_CACHE_WRITE_USD_PER_MILLION`
- `ANTHROPIC_CACHE_READ_USD_PER_MILLION`

API 키가 없거나 호출이 실패하면 로컬 분석 결과로 fallback합니다. 예산 제한과 사용량은 `ai_usage_logs`에 기록됩니다.

### SMTP

- `PASSWORD_RESET_TTL_MINUTES`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`

SMTP가 설정되지 않으면 비밀번호 재설정 메일 API는 사용할 수 없습니다.

### Discord

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_BOT_SETTINGS_SECRET`
- `DISCORD_GUILD_ID`
- `DISCORD_ADMIN_CHANNEL_ID`
- `DISCORD_ADMIN_ROLE_IDS`
- `DISCORD_BOT_ACTOR_USER_ID`
- `DISCORD_REGISTER_COMMANDS`
- `DISCORD_ADMIN_URL`
- `DISCORD_SUPPORT_POLL_MS`
- `DISCORD_HEALTH_POLL_MS`
- `DISCORD_DAILY_SUMMARY_HOUR`
- `LOSTARK_DISCORD_BOT_DIR`
- `FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART`

관리자 화면에서 저장하는 봇 토큰은 `discord_bot_settings` 테이블에 암호화 저장됩니다. 운영에서는 `DISCORD_BOT_SETTINGS_SECRET`을 고정값으로 설정하는 것을 권장합니다. secret이 바뀌거나 uploads 볼륨의 자동 생성 secret 파일이 사라지면 기존 토큰은 다시 입력해야 합니다.

## 주요 API

### 공통

- `GET /api/health`
- `GET /api/bootstrap`

### 인증과 계정

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/account/password`
- `POST /api/account/consent`
- `DELETE /api/account`
- `PUT /api/profile`

### 학습과 AI 피드백

- `POST /api/sessions`
- `PATCH /api/sessions/:sessionId/notes`
- `GET /api/ai/feedback`

### 공지와 문의

- `GET /api/announcements/active`
- `GET /api/announcements`
- `GET /api/support/tickets`
- `POST /api/support/tickets`

### 관리자

- `GET /api/admin/overview`
- `PATCH /api/admin/users/:userId/role`
- `POST /api/admin/announcements`
- `PATCH /api/admin/announcements/:announcementId`
- `DELETE /api/admin/announcements/:announcementId`
- `PATCH /api/admin/support/tickets/:ticketId`

### Discord 봇 관리

- `GET /api/admin/discord-bot`
- `PUT /api/admin/discord-bot/settings`
- `POST /api/admin/discord-bot/start`
- `POST /api/admin/discord-bot/stop`
- `GET /api/admin/discord-bot/lostark`
- `PUT /api/admin/discord-bot/lostark/settings`
- `POST /api/admin/discord-bot/lostark/start`
- `POST /api/admin/discord-bot/lostark/stop`

## 빌드와 검증

```powershell
npm run lint
npm test
npm run build
```

범위를 나눠 확인할 때:

```powershell
npm run test:server
npm run test:bot
npm run test:docs
```

DB 연결과 schema 보정까지 확인할 때:

```powershell
npm run db:init
```

최근 로컬 검증 결과:

- `npm run test:docs`: 44개 통과
- `npm run lint`: 통과
- `npm test`: server 39개, bot 28개, docs 44개 통과
- `npm run build:client`: 통과

문서 또는 README를 수정했을 때는 최소 `npm run test:docs`를 실행해 README 링크, CI 문구, Android/설정 UI 회귀 테스트를 확인합니다.

## Android APK

FocusAI는 Capacitor로 Android APK를 만들 수 있습니다. 현재 React/Vite 빌드 결과를 native Android 프로젝트에 포함하는 local asset APK와, 운영 사이트를 여는 hosted APK 흐름을 모두 지원합니다.

필수 준비:

- Android Studio 또는 Android SDK
- `ANDROID_HOME` 또는 `ANDROID_SDK_ROOT`
- 실행 가능한 Java/Gradle 환경

현재 전달용 debug 산출물:

```text
apk-packages/focusai-apk-pack.zip
apk-packages/focusai-local-debug.apk
apk-packages/focusai-server-debug.apk
```

`focusai-local-debug.apk`는 APK 안에 웹 자산을 포함한 빌드이고, `focusai-server-debug.apk`는 운영 사이트를 여는 hosted 빌드입니다. 둘 다 debug 서명 APK이며 스토어 배포용이 아닙니다.

현재 최신 검증 local APK:

```text
apk-packages/focusai-local-debug.apk
size: 19,839,030 bytes
sha256: 33FA72D2438D6DFF654823FE9C84F95F9B7C85D8064CB9333C2D1DB446843E08
```

이 APK에서 로그인 세션, API 연결, Claude AI 피드백, 리포트 반영, PDF Downloads 저장을 확인했습니다.

### Local Asset APK

기본 API 주소는 `https://focusai.ibetter.kr/api`입니다.

```powershell
npm run build:android:web
npm run android:sync
npm run android:apk
```

생성 경로:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

로컬 API를 바라보는 테스트 APK:

```powershell
$env:VITE_ANDROID_API_BASE_URL='http://<PC_IP>:8787/api'
npm run android:apk
```

이 경우 `capacitor.config.ts`가 `http://` API에 맞춰 Android mixed content를 허용합니다. 실제 기기에서 PC API에 접근 가능해야 합니다.

MediaPipe 얼굴 분석용 WASM 파일은 빌드/개발 서버 시작 전에 `public/mediapipe/tasks-vision/wasm`으로 동기화됩니다. 따라서 CDN CSP 허용 없이도 앱 origin에서 모델을 로드합니다.

Android PDF 저장은 `html2pdf.js`로 생성한 base64 PDF를 `window.FocusAiAndroid.savePdf()` native bridge로 전달하고, Android Q 이상에서는 MediaStore Downloads에 저장합니다. 이전 Android 버전은 public Downloads 경로를 사용합니다.

### Hosted APK

```powershell
$env:CAPACITOR_SERVER_URL='https://focusai.ibetter.kr'
$env:VITE_ANDROID_API_BASE_URL='https://focusai.ibetter.kr/api'
npm run android:apk
```

Hosted APK는 앱 시작 시 운영 사이트를 엽니다. 서버를 최신 코드로 배포한 뒤 로그인, `https://localhost` CORS, Bearer 세션 처리, 카메라 권한, MediaPipe 로딩을 검증해야 합니다.

### Release Build

스토어 또는 외부 배포에는 debug APK 대신 release signing과 Android App Bundle 절차가 필요합니다.

```powershell
npm run android:aab
```

keystore 생성, signing config, AAB 업로드 절차는 별도 운영 문서로 정리해야 합니다.

## 운영 배포

이 저장소는 GitLab CI와 Docker Compose 기반 배포 구성을 포함합니다.

- `.gitlab-ci.yml`: push/MR에서 verify, `main` push에서 production deploy
- `Dockerfile`: Node 22 multi-stage build
- `docker-compose.yml`: `focusai-ibetter-kr` 컨테이너, Traefik label, uploads volume, `.env.server` 주입
- `deploy/prod.env.example`: 운영 `.env.server` 템플릿
- `DEPLOYMENT.md`: ibetter 서버 기준 기존 배포 절차 문서

현재 `.gitlab-ci.yml`의 verify 단계는 실제로 `npm ci`, `npm run lint`만 실행합니다. 배포 전에는 로컬에서 `npm test`와 `npm run build`를 별도로 실행해야 합니다. CI verify에 test/build를 다시 포함할지는 남은 운영 과제입니다.

운영 서버의 실제 `.env.server`에는 비밀값이 들어가므로 Git에 커밋하지 않습니다. 기존 legacy `.env`만 있는 서버는 배포 스크립트가 `.env.server`로 백업/복원하는 경로를 갖고 있습니다.

## 운영 메모

- 브라우저에서 MariaDB로 직접 연결하지 않습니다. 모든 데이터 접근은 Express API를 통합니다.
- 운영 DB 계정은 현재 `AUTO_MIGRATE_SCHEMA` 정책과 맞는 권한을 가져야 합니다.
- HTTPS 환경에서 세션 쿠키를 사용합니다.
- `uploads` volume에는 Discord secret, 알림 채널 설정, Lost Ark 봇 stage 파일처럼 복구가 필요한 운영 데이터가 들어갈 수 있습니다.
- DB와 uploads volume은 같은 시점 기준으로 백업합니다.
- Android debug APK는 테스트용입니다. 공개 배포에는 release signing과 AAB 절차가 필요합니다.

## 문제 해결

### 관리자 페이지가 보이지 않는 경우

- 로그인 이메일이 `ADMIN_EMAILS`에 포함되어 있는지 확인합니다.
- `.env.server` 수정 후 서버를 재시작했는지 확인합니다.
- 일반 사용자 계정으로 로그인한 상태인지 확인합니다.

### AI 피드백이 로컬 분석으로만 나오는 경우

- `ANTHROPIC_API_KEY`가 설정되어 있는지 확인합니다.
- 학습 세션이 1개 이상 저장되어 있는지 확인합니다. 세션이 없으면 서버는 Claude를 호출하지 않고 로컬 분석을 반환합니다.
- 운영에서 Anthropic 단가와 예산 환경변수가 올바른지 확인합니다.
- `ai_usage_logs`에서 일일 요청/예산 차단 여부를 확인합니다.

### PDF 다운로드가 비어 있거나 저장되지 않는 경우

- 데스크톱 웹에서는 브라우저 다운로드 차단 여부를 확인합니다.
- Android APK에서는 Downloads 권한/저장소 상태와 `FocusAiAndroid` bridge 존재 여부를 확인합니다.
- 리포트 데이터가 0개인 상태에서도 PDF export가 깨지지 않도록 zero-data 도넛과 막대 크기 회귀 테스트가 포함되어 있습니다.

### 비밀번호 재설정 메일이 전송되지 않는 경우

- SMTP 환경변수 조합이 완전한지 확인합니다.
- `SMTP_FROM`이 실제 발신 계정과 맞는지 확인합니다.
- 서버 로그에서 Nodemailer 오류를 확인합니다.

### Discord 봇 토큰 저장이 실패하는 경우

- `uploads` volume 권한을 확인합니다.
- 운영에서 `DISCORD_BOT_SETTINGS_SECRET`이 고정값으로 설정되어 있는지 확인합니다.
- secret 값 변경 또는 uploads 삭제 후에는 관리자 화면에서 토큰을 다시 저장합니다.

### 서버가 환경변수 검증에서 시작하지 않는 경우

- `CLIENT_ORIGIN`과 `APP_BASE_URL`이 올바른 URL인지 확인합니다.
- production에서는 URL이 HTTPS인지 확인합니다.
- boolean 환경변수는 `true` 또는 `false`만 사용합니다.
- SMTP 일부만 설정했거나 Anthropic 단가 값이 잘못되었는지 확인합니다.

### Lost Ark Discord 봇이 시작하지 않는 경우

- 관리자 화면에 저장된 token, client id, guild id가 실제 Discord 앱 설정과 맞는지 확인합니다.
- `LOSTARK_DISCORD_BOT_DIR`를 비우면 bundled bot을 `uploads/lostark-discord-bot`으로 stage해서 실행합니다.
- slash command 등록 실패 시 봇 초대 권한에 `applications.commands`가 포함되어 있는지 확인합니다.

## 참고 파일

- [src/App.tsx](./src/App.tsx): 클라이언트 메인 화면과 상태 흐름
- [src/lib/api.ts](./src/lib/api.ts): 클라이언트 API 호출
- [src/lib/studyVision.ts](./src/lib/studyVision.ts): MediaPipe 기반 학습 비전 분석
- [src/lib/focusTracking.ts](./src/lib/focusTracking.ts): 집중도 판정과 스무딩
- [server/src](./server/src): Express API 서버 소스
- [server/src/index.ts](./server/src/index.ts): Express API 라우트
- [server/src/contracts.ts](./server/src/contracts.ts): 서버 Zod 계약
- [server/src/store.ts](./server/src/store.ts): MariaDB 데이터 접근
- [server/src/discord-bot-gateway.ts](./server/src/discord-bot-gateway.ts): 서버 내장 FocusAI Discord 봇
- [server/src/process-discord-bot-gateway.ts](./server/src/process-discord-bot-gateway.ts): 외부 프로세스 봇 gateway
- [bot/src/index.ts](./bot/src/index.ts): standalone FocusAI Discord 봇
- [lostark-discord-bot/src/index.ts](./lostark-discord-bot/src/index.ts): Lost Ark Discord 봇 진입점
- [lostark-discord-bot/src/features](./lostark-discord-bot/src/features): Lost Ark 봇 기능별 명령과 서비스
- [db/schema.sql](./db/schema.sql): MariaDB 기준 DDL
- [docs](./docs): Node test 기반 문서성/구조 회귀 검증
- [hwp](./hwp): 과거 문서 복사본
- [DEPLOYMENT.md](./DEPLOYMENT.md): 운영 배포 절차 문서
- [../docs](../docs): 2026-05-21 기준 상위 시스템 문서
