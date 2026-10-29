# GitHub 정본 · 새 데이터 AWS 배포

## 2026-10-26 배포기 신호 처리 소스 동기화

운영에 이미 적용한 신호 구분 보완을 제품 helper에도 반영했다. TERM/INT는 건강 검사 재시도에 삼켜지지 않고 실제 release 롤백으로 전달된다. 이전 환경·이미지·deployed.json을 복원하고 in-progress 표시를 유지해 다음 자동 실행을 막으며, 일반 일시 오류는 기존 재시도를 유지한다. 로컬 기존 소스에서 신호2개 실패를 재현한 뒤 배포기 전체19개 검사를 통과했다. DB·Compose·unit·timer는 변경하지 않았다.

이 helper와 검사도 deploy/ 보호 경로에 속한다. 병합만으로 정상 앱 배포가 계속된다고 가정하지 않고 정확한 새 CI·artifact·현재 baseline을 검토해 별도 승격한다. 실제 이미지 교체와 검증 없이 deployed SHA를 조작하거나 guard를 제외하지 않는다. GitHub 병합·CI·운영 승격은 이 로컬 결과와 별도다. 과거 mutable bundle·설치 manifest는 보존하고 최종 merge SHA에서 새 디렉터리의 관리 묶음을 만든다. 기존 fresh installer나 prepare-bundle.py를 기존 경로에서 다시 실행하지 않는다.

이 구성은 기존 GitLab 서비스와 DB를 복사하거나 변경하지 않는다. 새 MariaDB와 업로드 볼륨으로 시작한다. 공개 주소는 `https://focusai.pigs0516.com` 제안이며 DNS·터널 연결은 별도 승인 후 적용한다.

## 실행 경계

`deploy/aws.compose.yml`의 기본 프로젝트명은 `focusai`다. `app`만 `127.0.0.1:3400`을 열고 DB는 내부 전용 네트워크에 둔다. 다른 프로젝트의 네트워크·DB·볼륨을 연결하지 않는다. app 512 MiB, DB 512 MiB, 최초 init 256 MiB 제한은 검증 출발점이며 용량 보장이 아니다. 빌드는 GitHub runner에서 수행하고 공유 S2 서버에서 빌드하지 않는다.

`deploy/aws.Dockerfile`은 웹과 API만 빌드한다. 봇 자동 시작은 끈다. 브라우저는 같은 주소의 `/api`를 사용한다. 런타임에는 DB 앱 비밀번호 파일만 마운트하며 root 비밀번호는 DB와 수동 init 컨테이너에만 제공한다. 정상 실행의 `AUTO_MIGRATE_SCHEMA=false`와 CRUD 전용 DB 권한으로 자동 DDL 실행을 막는다.

## 최초 준비와 초기화

이 절의 서버 작업은 아직 실행 승인을 받아야 한다. 기존 데이터가 없는 전용 볼륨에서만 수행한다.

1. 승인된 배포 경로에 Compose와 검증된 이미지 태그를 고정한다. 비밀번호는 서버에서 독립적으로 난수 생성하며 다른 프로젝트 값을 복사하지 않는다. `FOCUSAI_SECRETS_DIR`에 `db_root_password`, `db_app_password` 두 파일을 둔다. 각 값은 서로 다른 32자 이상이어야 한다. 내용을 로그에 출력하지 않는다.
2. 호스트 비밀 디렉터리는 `root:root` 소유 `0700`, 두 파일은 `root:root` 소유 `0444`로 설정한다. 상위 디렉터리 때문에 일반 호스트 사용자는 파일에 접근할 수 없고, 명시적으로 파일을 마운트한 DB/init/app의 해당 사용자만 읽는다. Compose 명령은 root로 실행한다. Compose의 파일 secret은 bind mount여서 YAML의 uid/mode로 소유권을 바꿀 수 없다. CI도 동일 owner/mode를 적용하고 기동 후 원래 임시 디렉터리 소유권을 복원해 정리한다. UID1000/0400을 운영 검증된 권한으로 사용하지 않는다.
3. `FOCUSAI_IMAGE`, `FOCUSAI_SECRETS_DIR`를 지정하고 `docker compose -f deploy/aws.compose.yml up -d --wait db`로 신규 DB만 기동한다.
4. `docker compose -f deploy/aws.compose.yml --profile init run --rm --no-deps init`을 **최초 한 번** 수행한다. 기존 테이블이 하나라도 있으면 거부한다. 현재 소스 스키마로 14개 테이블을 만들고 앱 사용자는 `SELECT, INSERT, UPDATE, DELETE`만 부여한다. 부분 초기화 실패 시 재실행으로 덮어쓰지 말고 실패 원인과 신규 볼륨 상태를 검토한다.
5. 앱만 기동하고 실제 health의 `mariaEnabled`와 `mariaReachable`, 합성 가입·쿠키·세션 저장/조회, 외부 프로젝트 불변을 확인한다. `/api/health` HTTP 200만으로 DB 정상이라고 판정하지 않는다.

## 선택 외부 기능

| 기능 | 필요한 설정 이름 | 발급·준비 주체 | 미설정 상태 |
|---|---|---|---|
| 기본 회원가입·집중 세션·통계 | 신규 MariaDB 자격 증명 | 이 서비스 전용으로 서버에서 생성 | DB가 없으면 사용할 수 없음 |
| Claude AI 코치 | `ANTHROPIC_API_KEY`, 모델·단가·일일 한도/예산 | 사용자 소유 Anthropic Console | `source=local`, 화면에 로컬 분석 안내. 외부 AI 호출 성공 아님 |
| 비밀번호 재설정 메일 | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, 필요 시 `SMTP_USER`, `SMTP_PASSWORD` | 사용자 소유 메일 제공자 | 메일 전달 미검증·사용 불가 |
| Discord 봇 | 봇 토큰·client/guild ID·설정 암호화 키 | 사용자 소유 Discord Developer Portal | 자동 시작 비활성 |

기본 배포에는 AI·SMTP·Discord 자격 증명을 넣지 않는다. 필요 기능은 별도 서버 비밀 설정을 검토하고 추가한다. 키 이름이 존재하는 것과 외부 계정 인증/사용 가능 여부는 별개다.

## CI 및 이후 자동 배포

`.github/workflows/aws-release.yml`은 PR과 main에서 회귀 검사·Docker 이미지 빌드·격리 Compose 합성 시험을 수행한다. main의 검증 통과 후에만 commit-tagged 이미지 archive, SHA-256, revision, DB 스키마 소스 해시 artifact를 발행한다. 이 단계만으로 운영 자동 배포가 설치된 것은 아니다.

S2의 기존 ubuntu GitHub 인증은 저장소 읽기 확인이 되었다. 별도 키 복사 없이 서버 pull 방식으로 검증 artifact를 가져오는 최소안을 준비한다. 운영 puller 설치/타이머 활성화는 별도 서버 작업이며, 검증된 main SHA, 성공한 정확한 workflow run, archive/revision, 현재 초기화 스키마 해시 일치를 확인해야 한다. `server/src/mariadb.ts`가 바뀌면 자동 배포를 멈추고 DB 변경 승인을 받는다. 최초 init 프로필은 정기 업데이트에서 호출하지 않는다.

`deploy/aws-poll.py`와 `focusai-deploy.service/.timer`가 설치 후보이다. 승인 후 root 소유 `/opt/focusai/deploy/aws-poll.py`, `/opt/focusai/aws.compose.yml`, `/opt/focusai/.env`를 배치한다. `.env`는 `0600`, `/var/lib/focusai-deploy`는 root 전용 `0700`이며 최초 검증된 실제 SHA·서버 image ID를 `deployed.json`에 기록한다. 그 후 타이머를 활성화한다. 스크립트는 기존 ubuntu `gh` 인증으로만 artifact를 읽고 root 인증 파일을 만들지 않는다. 타이머·초기 상태·정기 실행은 아직 설치되지 않았다.

보호 대상은 `db/`, `server/src/mariadb.ts`, `server/src/init-db.ts`, `deploy/`, `.github/workflows/`다. 이 중 변경이 있으면 자동 교체를 거부한다. SHA·artifact ZIP digest·내부 이미지 checksum·단일 이미지 태그·OCI revision을 검증하며, CI와 서버의 image ID 표현이 같다고 가정하지 않는다. 검증 후 서버에서 로드한 image ID를 사용한다. 다른 컨테이너 ID/시작 시각/재시작 횟수 변화도 확인한다.

앱 교체는 `--no-deps`로 app 하나만 수행한다. DB·업로드 볼륨과 다른 컨테이너를 유지하고, 실패/신호 중단에는 이전 이미지로 되돌린다. 배포 중 표시와 실패 표시를 보존하여 반복 자동 실행이 실패 상태를 덮지 않도록 한다. 앱 롤백은 DB 쓰기 자체를 되돌리지 않는다. 호환되지 않는 데이터 변경은 자동 배포 대상이 아니다.

타이머를 중지하면 다음 자동 배포만 멈추고 앱은 유지된다. 교체 실패 후 `in-progress` 표시는 자동 삭제하지 않는다. 실제 앱 이미지, `.env`, `deployed.json`, DB 접근, 다른 서비스 불변을 확인한 뒤 관리자가 표시를 해제해야 한다. 전원 차단/SIGKILL은 즉시 롤백을 보장하지 않으며 다음 실행을 차단한다. 초기 배포 이후 새 데이터가 쌓인 볼륨을 삭제하는 롤백은 금지한다.

## 검증 범위

`node scripts/test-aws-compose.mjs`는 새 임시 Compose 프로젝트에서 14개 테이블 생성, 재초기화 거부, CRUD 전용 권한, 합성 가입/쿠키/로그인, 세션 저장·조회, 로컬 AI 응답, 앱 재기동 후 DB·데이터 보존을 검사한다. 종료 시 그 임시 프로젝트의 볼륨만 삭제한다. 증거에는 결과 boolean과 메모리 표본만 쓰며 비밀번호·쿠키·사용자 본문은 저장하지 않는다.

`docker stats` 표본은 관측 최고치이며 전체 순간 peak 보장이 아니다. `build-process-time.txt`의 RSS는 Docker CLI 프로세스 지표로 빌드 컨테이너 전체 peak를 뜻하지 않는다. 실제 카메라, 브라우저 쿠키 저장, 외부 AI·메일·봇, 공개 DNS/TLS 흐름은 별도 검증한다.

공식 근거: [MariaDB 초기화 환경변수](https://mariadb.com/docs/server/server-management/automated-mariadb-deployment-and-administration/docker-and-mariadb/mariadb-server-docker-official-image-environment-variables), [Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/), [파일 secret 권한 제한](https://docs.docker.com/reference/compose-file/services/).


## GitHub 이벤트 배포 전환 준비 — 2026-10-29

이 절은 위 최초 준비·타이머 설치 후보의 당시 기록과 구분한다. `.github/workflows/deploy-event.yml`은 main push의 **AWS release candidate** 완료 이벤트와 main의 수동 recovery를 받는다. 두 경로 모두 GitHub REST에서 정확한 run ID를 다시 읽어 `P-GISE/focusai`·head repository·main·push·`.github/workflows/aws-release.yml`·완료·성공·SHA를 검증한다. PR 또는 다른 branch의 run은 배포하지 않으며 특권 job은 소스를 checkout하지 않는다.

프로젝트 전용 `FOCUSAI_DEPLOY_SSH_KEY`, `FOCUSAI_DEPLOY_KNOWN_HOSTS`, `FOCUSAI_DEPLOY_TARGET` 세 repository secret과 S2의 제한 SSH entry 설치가 필요하다. 고정 명령은 `event-deploy-focusai <SHA40> <run ID>`다. strict host pinning·일시 key0600·종료 정리를 사용한다. 같은 프로젝트 실행은 취소 없이 queue에 쌓이고, 원격 lock timeout(exit75 및 정확한 오류)만 최대20분 재시도한다. 요청 SHA/run·실제 배포 run/artifact run·image digest 영수증을 확인한다. 수동 복구에는 성공한 main push CI의 정확한 run ID와 SHA를 입력한다.

현재는 로컬 candidate 준비 단계이며 이 변경에서 키·secret 등록, S2 설치, 실제 workflow_run 배포·health 검증을 수행하지 않았다. 실제 운영 helper·현재 배포 baseline을 별도로 확인하고 기존 Node/이미지 보안 수정과 이번 workflow·CI 보호 경로의 전체 차이를 검토한 뒤 최초 승격해야 한다. 기존 보안 검사·DB 스키마 해시·manager→deploy 잠금·실패 롤백을 유지하며 가드를 제외하지 않는다. 실제 새 push CI→이벤트→제한 command→운영 SHA/run/image/health 검증 전 기존 timer는 유지한다. 서버 전체 재부팅·DB/Compose/SMTP/Discord 변경은 없다.
