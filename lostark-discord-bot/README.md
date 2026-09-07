# Custom Discord Bot Starter

기능을 하나씩 붙일 수 있도록 만든 모듈형 디스코드 봇 스타터입니다.

현재 포함된 기능:

- `/ping`: 봇 응답 확인
- `/merchant servers`: 등록된 서버 목록 보기
- `/merchant view`: 특정 서버의 떠돌이상인 카드 목록 보기
- `/merchant set`: 특정 서버의 카드 목록 저장 또는 수정
- `/tts speak`: 음성 채널에서 한국어/영어/일본어 TTS 재생
- `/tts leave`: 봇 음성 채널 퇴장

## 1. 설치

```bash
npm install
```

## 2. 환경 변수

`.env.example`을 참고해서 `.env` 파일을 만듭니다.

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
```

- `DISCORD_GUILD_ID`는 개발 중 빠른 슬래시 명령어 반영용입니다.
- 나중에 전역 명령어로 배포하고 싶으면 비워도 됩니다.

## 3. 슬래시 명령어 배포

```bash
npm run deploy:commands
```

## 4. 개발 실행

```bash
npm run dev
```

## 5. 운영 빌드

```bash
npm run build
npm start
```

## 6. 디스코드 봇 권한

디스코드 개발자 포털에서 봇을 만들고 아래 스코프로 초대하면 됩니다.

- `bot`
- `applications.commands`

추천 권한:

- 메시지 보내기
- 음성 채널 참가
- 말하기
- 메시지 기록 보기

## 7. 다음 확장 아이디어

- 로스트아크 공식/커뮤니티 데이터 크롤링 자동화
- 서버별 카드 갱신 알림
- 특정 카드 포함 여부 필터링
- 관리자 전용 설정 명령어
- 웹 대시보드 또는 Google Sheets 연동
