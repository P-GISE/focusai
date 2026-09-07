# FocusAI 배포 가이드 (ibetter 서버)

이 프로젝트는 **ibetter 서버의 셀프호스팅 GitLab + gitlab-runner + Traefik + Cloudflared** 환경에 배포됩니다. mate, dotaku 등 같은 호스트에서 운영 중인 프로젝트와 동일한 build-on-host 패턴을 따릅니다.

## 토폴로지

```
[GitLab (gitlab.ibetter.kr)]
   │ git push origin main
   ▼
[gitlab-runner: Main Shared Runner / tag: docker]
   │ docker:27-cli 이미지로 실행
   │ /var/run/docker.sock 마운트되어 호스트 Docker 조작
   │ /data1/docker/focusai 볼륨 마운트
   ▼
[/data1/docker/focusai]
   │ docker compose build
   │ docker compose up -d
   ▼
[focusai-ibetter-kr 컨테이너]
   │ network: web
   ├─► mariadb-11.4.5 (같은 web 네트워크, 컨테이너 이름으로 접근)
   └─► Traefik :80 ◄── Cloudflared 터널 ◄── https://focusai.ibetter.kr
```

핵심:
- **TLS는 Cloudflared가 종단**합니다. Traefik은 HTTP(:80)만 listen.
- **이미지 레지스트리는 사용하지 않습니다.** 빌드는 ibetter 호스트에서 직접 수행.
- **`.env.server`는 git에 들어가지 않고** `/data1/docker/focusai/.env.server`에 직접 두며, CI가 매 배포 때 백업/복원합니다.

## 사전 준비 (한 번만)

### 1. GitLab 프로젝트 생성

`gitlab.ibetter.kr`의 `focusai` 그룹 안에 `focusai` 프로젝트로 운영합니다.
URL: https://gitlab.ibetter.kr/focusai/focusai

```bash
cd /Users/jeongps/workspace/05_프로젝트/FocusAI/focusai
git remote add origin https://gitlab.ibetter.kr/focusai/focusai.git
git push -u origin main
```

### 2. gitlab-runner config 마운트 추가

ibetter 서버에서 `gitlab-runner` 컨테이너의 `config.toml`에 focusai 디렉토리를 추가합니다.

```bash
ssh ibetter
sudo nano /data1/docker/gitlab/gitlab-runner/config.toml
```

`[runners.docker]` 섹션의 `volumes` 배열에 다음 항목을 추가:

```toml
volumes = [
  "/cache",
  "/var/run/docker.sock:/var/run/docker.sock",
  "/data1/docker/wanderlust:/data1/docker/wanderlust",
  "/data1/docker/ffnb-web:/data1/docker/ffnb-web",
  "/data1/docker/space_ibetter_kr:/data1/docker/space_ibetter_kr",
  "/data1/docker/dotaku:/data1/docker/dotaku",
  "/data1/docker/mate:/data1/docker/mate",
  "/data1/docker/text_ibetter_kr:/data1/docker/text_ibetter_kr",
  "/data1/docker/focusai:/data1/docker/focusai"
]
```

저장 후 runner 재시작:

```bash
docker restart gitlab-runner
```

### 3. MariaDB 데이터베이스 및 사용자 준비

ibetter 호스트의 `mariadb-11.4.5` 컨테이너에 접속해 DB와 운영 계정을 만듭니다.

```bash
ssh ibetter
docker exec -it mariadb-11.4.5 mariadb -uroot -p
```

```sql
-- 1. DB 생성
CREATE DATABASE IF NOT EXISTS focusai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 앱 전용 계정 생성 (비밀번호는 openssl rand -base64 24 등으로 미리 생성)
CREATE USER IF NOT EXISTS 'focusai_app'@'%' IDENTIFIED BY '여기에_강한_비밀번호';

-- 3. focusai DB에 대한 전체 권한 부여 (DML + DDL)
--    부팅 시 ensureSchema()가 CREATE TABLE / ALTER TABLE 를 자동 실행할 수 있도록 DDL도 함께 부여합니다.
--    grant 대상은 focusai DB로 한정되어 있으므로 root와 달리 다른 DB는 건드릴 수 없습니다.
GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, DROP, INDEX, ALTER,
      CREATE TEMPORARY TABLES, CREATE VIEW, EVENT, TRIGGER, SHOW VIEW,
      CREATE ROUTINE, ALTER ROUTINE, EXECUTE
ON `focusai`.* TO 'focusai_app'@'%';

FLUSH PRIVILEGES;

-- 검증
SHOW GRANTS FOR 'focusai_app'@'%';
```

> `db/production-grants.sql` 파일은 코드 작성자가 처음에 가정했던 DML-only 권한 모델의 흔적이며, 위 GRANT가 실제 운영 기준입니다. (사전준비 3번이 권위)

### 4. /data1/docker/focusai/.env.server 작성

```bash
ssh ibetter
mkdir -p /data1/docker/focusai
```

`deploy/prod.env.example`을 그대로 복사해 `/data1/docker/focusai/.env.server`로 두고, `CHANGE_ME` 계열 placeholder를 실제 운영 값으로 채웁니다.

```env
MARIADB_PASSWORD=<위 3번에서 만든 강한 비밀번호>
ADMIN_EMAILS=<운영자 이메일 콤마 분리>
FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART=false
DISCORD_BOT_SETTINGS_SECRET=<openssl rand -base64 32 로 생성한 랜덤 문자열>
DISCORD_BOT_TOKEN=<Discord 봇 토큰>
DISCORD_CLIENT_ID=<Discord 애플리케이션 client id>
DISCORD_GUILD_ID=<운영 Discord 서버 id>
DISCORD_ADMIN_CHANNEL_ID=<관리자 명령 채널 id>
DISCORD_ADMIN_ROLE_IDS=<관리자 역할 id 콤마 분리>
DISCORD_BOT_ACTOR_USER_ID=<봇이 관리자 변경을 기록할 사용자 id>
ANTHROPIC_API_KEY=<Anthropic 키, AI 피드백 사용 시>
SMTP_HOST=...
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=FocusAI <발신주소>
```

`DISCORD_BOT_SETTINGS_SECRET`은 운영에서 고정값으로 두는 것을 권장합니다. 값이 있으면 관리자 페이지에서 Discord 봇 토큰을 저장할 때 이 값을 토큰 암호화 키로 사용합니다. 값이 없으면 앱이 `/app/uploads/.focusai-secrets/discord-bot-settings-secret` 파일을 자동 생성해서 사용합니다. `uploads` 볼륨을 삭제하거나 이 secret 값을 바꾸면 기존에 저장된 봇 토큰을 다시 입력해야 합니다.

```bash
openssl rand -base64 32
```

다른 값(`MARIADB_HOST=mariadb-11.4.5`, `AUTO_MIGRATE_SCHEMA=true`, `CLIENT_ORIGIN/APP_BASE_URL`, `FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART=false` 등)은 템플릿 그대로 둬도 됩니다. 운영 서버에서 FocusAI Discord 봇 자동 시작을 일시적으로 막아야 할 때만 `FOCUSAI_DISABLE_DISCORD_BOT_AUTOSTART=true`로 바꿉니다. focusai_app에 DDL 권한이 부여되어 있으므로 첫 부팅 시 ensureSchema()가 자동으로 14개 테이블을 만들고, 향후 신규 컬럼이 코드에 추가되어도 ensureColumn 마이그레이션이 자동 적용됩니다.

### 5. Cloudflared 라우팅 추가

`focusai.ibetter.kr` 도메인이 ibetter 호스트의 Traefik(:80)으로 향하도록 Cloudflare Zero Trust 또는 cloudflared config에 ingress 규칙을 추가합니다. 기존 다른 `*.ibetter.kr` 서비스(dotaku 등)와 동일한 방식.

> Cloudflare DNS에 CNAME 레코드 또는 터널 라우팅이 미리 등록되어 있어야 첫 배포 후 외부에서 접근됩니다.

## 배포 흐름

준비가 끝난 뒤 평시 배포는:

```bash
# 로컬에서
git push origin main
```

GitLab CI가 다음 순서로 실행됩니다 (`.gitlab-ci.yml`):

1. **verify 단계**: `node:22-bookworm` 이미지에서 `npm ci`, `npm run lint` 실행. lint 실패 시 deploy 차단. 배포 전에는 로컬에서 `npm test`와 `npm run build`를 별도로 실행합니다.
2. **deploy_production 단계** (main 브랜치만):
   1. `/data1/docker/focusai/.env.server`를 `/tmp`에 백업. 구버전 `/data1/docker/focusai/.env`만 있으면 `.env.server`로 마이그레이션
   2. 기존 컨테이너 `docker compose down`
   3. `cp -r $CI_PROJECT_DIR/. /data1/docker/focusai/`
   4. `.git`, `node_modules`, `dist`, `server/dist`, `.npm` 제거
   5. `.env.server` 복원 (백업 없으면 즉시 실패)
   6. `docker compose build` → `docker compose up -d`
   7. 10초 대기 후 컨테이너 상태 + 최근 30줄 로그 출력

성공 시 `https://focusai.ibetter.kr` 에서 바로 확인 가능합니다.

## 첫 배포 절차 요약

```bash
# 1. 로컬 저장소를 GitLab에 push
cd /Users/jeongps/workspace/05_프로젝트/FocusAI/focusai
git remote add origin https://gitlab.ibetter.kr/focusai/focusai.git
git push -u origin main

# 2. ibetter 서버 사전 준비 (위 1~5번)
#    - gitlab-runner config 마운트 추가 + 재시작
#    - mariadb DB/사용자/권한 생성 (DML+DDL 한 번에)
#    - /data1/docker/focusai/.env.server 작성 (focusai_app 자격증명 그대로)
#    - cloudflared 라우팅 추가

# 3. CI가 자동으로 배포 실행 (또는 GitLab UI에서 pipeline 재실행)

# 4. 첫 부팅 후 컨테이너 로그 확인 (스키마 자동 생성 완료 확인)
ssh ibetter docker logs --tail 50 focusai-ibetter-kr

# 5. 외부 접속 검증
curl -I https://focusai.ibetter.kr/api/health
```

향후 배포는 `git push origin main` 한 줄이면 됩니다. 신규 컬럼이 코드에 추가되어도 부팅 시 자동 ALTER 적용.

## 평시 운영

- **로그**: `docker logs -f focusai-ibetter-kr` (또는 dozzle 웹 UI)
- **컨테이너 상태**: `docker ps --filter name=focusai-ibetter-kr`
- **헬스체크**: Dockerfile의 HEALTHCHECK가 `/api/health`를 30초마다 점검. `docker inspect --format '{{.State.Health.Status}}' focusai-ibetter-kr`
- **DB 접속**: `docker exec -it mariadb-11.4.5 mariadb -ufocusai_app -p focusai`
- **재기동**: `cd /data1/docker/focusai && docker compose restart`
- **수동 재배포**: `cd /data1/docker/focusai && docker compose up -d --build`
- **Discord 봇 토큰 암호화 키 확인**: 기본값은 자동 생성입니다. 수동으로 고정하려면 아래 절차로 `.env.server`에 `DISCORD_BOT_SETTINGS_SECRET`을 추가합니다.

```bash
cd /data1/docker/focusai
cp .env.server ".env.server.bak.$(date +%Y%m%d%H%M%S)"
SECRET="$(openssl rand -base64 32)"
if grep -q '^DISCORD_BOT_SETTINGS_SECRET=' .env.server; then
  sed -i "s|^DISCORD_BOT_SETTINGS_SECRET=.*|DISCORD_BOT_SETTINGS_SECRET=$SECRET|" .env.server
else
  printf '\nDISCORD_BOT_SETTINGS_SECRET=%s\n' "$SECRET" >> .env.server
fi
unset SECRET
docker compose up -d --force-recreate web
docker compose exec web sh -lc 'test -n "$DISCORD_BOT_SETTINGS_SECRET" && echo DISCORD_BOT_SETTINGS_SECRET_OK'
```

`.env.server`에 `DISCORD_BOT_SETTINGS_SECRET`을 넣지 않는 기본 운영에서는 관리자 페이지의 Discord 봇 설정을 한 번 조회하거나 저장하면 `/app/uploads/.focusai-secrets/discord-bot-settings-secret` 파일이 자동 생성됩니다.

## 롤백

레지스트리 기반이 아니라 git 기반이므로 롤백은 git revert로 합니다.

```bash
# 로컬에서
git revert <문제 커밋>
git push origin main
# → CI가 자동으로 이전 상태를 다시 빌드/배포
```

긴급 상황에서 컨테이너만 빠르게 멈추고 싶으면:

```bash
ssh ibetter "cd /data1/docker/focusai && docker compose down"
```

## 트러블슈팅

| 증상 | 원인 / 확인 |
|------|------------|
| CI deploy_production이 `bash: cd: /data1/docker/focusai: No such file or directory` | gitlab-runner config.toml volumes에 `/data1/docker/focusai` 미추가. 사전준비 2번 |
| `FATAL $SERVER_ENV_FILE missing` | `/data1/docker/focusai/.env.server` 미작성. 사전준비 4번 |
| `Access denied for user 'focusai_app'@... to database 'focusai'` | GRANT 누락 또는 비밀번호 오타. 사전준비 3번 SQL 다시 실행 |
| 컨테이너 부팅 직후 `CREATE command denied to user 'focusai_app'@...` 후 종료 | DDL GRANT가 빠짐. 사전준비 3번에서 CREATE/ALTER/DROP/INDEX 등이 포함된 GRANT 문을 그대로 실행했는지 재확인 |
| `getaddrinfo ENOTFOUND mariadb-11.4.5` | focusai 컨테이너가 `web` 네트워크에 없음. `docker inspect focusai-ibetter-kr` 로 네트워크 확인. 또는 mariadb-11.4.5 이름이 바뀌었는지 `docker ps | grep mariadb` |
| `https://focusai.ibetter.kr` 가 502/외부 접근 안 됨 | Cloudflared 라우팅 미설정 또는 Traefik이 컨테이너를 못 본 상태. `docker logs traefik | grep focusai` 확인 |
| 관리자 페이지에서 Discord 봇 토큰 암호화 키 준비 실패 표시 | `/app/uploads/.focusai-secrets/discord-bot-settings-secret`을 생성하거나 읽지 못한 상태. `uploads` 볼륨 권한과 컨테이너 사용자 권한을 확인한 뒤 `web` 컨테이너를 재생성 |
| AI 피드백이 항상 "로컬 분석" 표시 | `ANTHROPIC_API_KEY` 비어 있거나 일일 예산/요청 한도 도달. `ai_usage_logs` 테이블 was_blocked=1 행 확인 |

## 파일 구성

| 파일 | 역할 |
|------|------|
| `Dockerfile` | 멀티스테이지 빌드. node:22-bookworm → bookworm-slim. CMD `node server/dist/index.js` |
| `docker-compose.yml` | 운영 컴포즈. 단일 web 서비스, web 네트워크, Traefik 라벨 |
| `.gitlab-ci.yml` | verify(lint) + deploy_production(mate 패턴) |
| `deploy/prod.env.example` | 운영 .env.server 템플릿. 실제 비밀값 없이 placeholder만 유지 |
| `db/schema.sql` | 참고용 DDL. 실제 적용은 `mariadb.ts`의 ensureSchema가 자동 실행 |
| `db/production-grants.sql` | 코드 작성자가 처음에 가정한 DML-only 권한 모델의 흔적. **실제 운영은 사전준비 3번의 DML+DDL GRANT를 사용**합니다. |

## 참고: 동일 패턴 프로젝트

같은 ibetter 호스트에서 운영 중인 프로젝트로 mate(`/data1/docker/mate/.gitlab-ci.yml`)와 dotaku(`/data1/docker/dotaku/.gitlab-ci.yml`)가 있습니다. 향후 CI 변경 시 두 프로젝트의 패턴 변화를 함께 참고하면 일관성 유지에 도움이 됩니다.
