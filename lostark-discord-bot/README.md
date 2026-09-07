# Lost Ark Discord Bot

FocusAI 저장소 안에 함께 포함된 로스트아크 운영용 Discord 봇입니다. 파티 모집 패널, 원정대 조회, 숙제 알림, 떠돌이 상인 카드 알림, 아비도스 제작 계산, TTS 기능을 슬래시 명령어로 제공합니다.

이 봇은 독립 실행도 가능하지만, `LOSTARK_PARTY_SITE_URL`과 `LOSTARK_PARTY_BOT_API_TOKEN`을 설정하면 Lost Ark 파티 모집 웹 서비스의 봇 API와 연결해 모집/신청 흐름을 확장할 수 있습니다.

## 소스 검토 기준

이 문서는 `src/index.ts`, `src/commands`, `src/features`, `src/site-api`, `src/utils`, `package.json`, `.env.example`을 기준으로 작성했습니다. 실제 Discord 토큰, 길드 ID, 웹 서비스 연동 토큰, `node_modules`, `dist` 산출물은 문서 근거에서 제외했습니다.

## 한눈에 보기

| 항목 | 내용 |
| --- | --- |
| 실행 환경 | Node.js 22 이상, TypeScript |
| Discord 방식 | slash command, interaction handler |
| 주요 기능 | 파티 모집, 원정대 조회, 숙제 알림, 떠돌이 상인, 아비도스 계산, TTS |
| 웹 연동 | `src/site-api/client.ts`를 통해 Lost Ark 파티 모집 서비스 API 호출 |
| 빌드 | `npm run build`로 TypeScript 컴파일 후 `npm start` |

## 기능별 파일 지도

| 기능 영역 | 확인한 주요 파일 | 실제로 구현된 내용 |
| --- | --- | --- |
| 봇 진입점 | `src/index.ts` | Discord 클라이언트 생성, 명령어 collection 등록, interaction 처리, ready 이후 주기 작업 시작 |
| 명령어 배포 | `src/deploy-commands.ts`, `src/commands/index.ts` | 길드 slash command 배포와 명령어 목록 조립 |
| 파티 모집 | `src/features/party/party.command.ts`, `party.service.ts` | 버튼 기반 파티 모집 패널 생성과 참가 상태 처리 |
| 원정대 조회 | `src/features/roster/roster.command.ts`, `roster.service.ts`, `roster-sync.service.ts` | 캐릭터명 기반 원정대 정보 조회와 자동 동기화 |
| 숙제 알림 | `src/features/homework/homework.command.ts`, `homework.service.ts` | 알림 채널/역할 설정, 일일/주간 숙제 미리보기와 즉시 발송 |
| 떠돌이 상인 | `src/features/merchant/*.ts` | KLOA 데이터 동기화, 서버별 카드 조회, 추적 카드 알림, 수동 제보 |
| 아비도스 계산 | `src/features/abidos/*.ts` | 생활 재료 수량 입력 기반 제작 가능 수량 계산 |
| TTS | `src/features/tts/tts.command.ts`, `tts.service.ts` | 음성 채널 입장, Google TTS 음성 재생, 봇 퇴장 |
| 웹 서비스 연동 | `src/site-api/client.ts` | Lost Ark 파티 모집 웹 서비스의 봇 API 호출 준비 |

## 주요 명령어

| 명령어 | 설명 |
| --- | --- |
| `/ping` | 봇 응답 상태 확인 |
| `/party panel` | 파티 모집 버튼 패널 생성 |
| `/roster characters` | 캐릭터명으로 원정대 정보 조회 |
| `/homework channel`, `/homework role`, `/homework roster-channel` | 숙제/원정대 알림 채널과 역할 설정 |
| `/homework status`, `/homework preview`, `/homework send` | 알림 설정 확인, 미리보기, 즉시 발송 |
| `/merchant sets`, `/merchant servers`, `/merchant view` | 추적 카드셋, 서버 목록, 서버별 떠돌이 상인 카드 조회 |
| `/merchant set`, `/merchant watch-channel`, `/merchant watch-role`, `/merchant check`, `/merchant sync` | 수동 카드 등록, 알림 채널/역할, 즉시 검사, KLOA 동기화 |
| `/abidos calc` | 생활 재료 기반 아비도스 제작 계산 |
| `/tts speak`, `/tts leave` | 음성 채널 TTS 재생과 퇴장 |

## 실행 방법

```bash
npm install
cp .env.example .env
npm run deploy:commands
npm run dev
```

운영 빌드는 다음 순서로 확인합니다.

```bash
npm run build
npm start
```

## 환경변수

| 이름 | 설명 |
| --- | --- |
| `DISCORD_TOKEN` | Discord 봇 토큰 |
| `DISCORD_CLIENT_ID` | Discord 애플리케이션 Client ID |
| `DISCORD_GUILD_ID` | 개발 중 slash command를 빠르게 반영할 테스트 길드 ID |
| `LOSTARK_PARTY_SITE_URL` | 연동할 Lost Ark 파티 모집 웹 서비스 URL |
| `LOSTARK_PARTY_BOT_API_TOKEN` | 웹 서비스 봇 API 호출용 토큰 |

## Discord 권한

봇 초대 시 `bot`, `applications.commands` scope가 필요합니다. 기능 사용을 위해 메시지 보내기, 메시지 기록 보기, 음성 채널 참가, 말하기 권한을 함께 부여합니다.

## 검증

```bash
npm run build
```

현재 이 하위 봇에는 별도 테스트 스크립트가 없으므로, 최소 검증은 TypeScript 빌드 통과와 개발 서버 실행 후 Discord에서 `/ping` 응답을 확인하는 방식입니다.
