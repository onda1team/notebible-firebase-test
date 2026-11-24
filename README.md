# 주의열매 여백성경 · 실제 동기화 검증판 (Google만)

이 저장소는 새로 만든 독립 검증판입니다. 기존 비공개 여백성경의 코드·번역 본문·주보·계정·기록·백업과 연결되지 않습니다. 가상 기록으로만 테스트하세요. GitHub Pages는 프런트엔드만, 별도 새 Firebase Spark 프로젝트는 Google 로그인 및 Cloud Firestore만 담당합니다. 결제 계정, Blaze, Analytics, Storage, Functions, 실사용자 가입은 이 범위에 없습니다.

## 콘솔 준비 (아직 시행하지 않음)

1. [Firebase Console](https://console.firebase.google.com/)에서 테스트용 **새 프로젝트**를 만들고 Spark로 둡니다. Analytics는 끄고 결제수단을 추가하지 않습니다. Web App을 등록하되 Firebase Hosting은 선택하지 않습니다.
2. Firestore Database에서 **Standard · 기본 (default)** DB 하나를 **Production mode**로 만들고 위치는 확인 후 하나로 확정합니다. 시작 rules에서 모든 접근이 막혀 있습니다. Rules 탭에 이 저장소의 `firestore.rules`만 올려 검토·게시합니다. 이 파일을 다른 프로젝트에 적용하지 마세요. 가능하면 Indexes → Single field → Add exemption → collection group `notes`, field `payload`의 인덱스를 끕니다 (`firestore.indexes.json`). 이 필드는 조회·정렬에 사용하지 않습니다.
3. Authentication → Sign-in method에서 **Google만** 활성화하고 대시보드가 요구하는 프로젝트 지원 이메일을 확인합니다. Email/Password·Phone·Anonymous와 Identity Platform 유료 업그레이드는 켜지 않습니다. Authentication → Settings → Authorized domains에 실제 Pages 호스트 **`onda1team.github.io`**만 추가합니다. 이 입력란에는 https나 `/notebibledemo/`를 넣지 않습니다. 브라우저 설정을 몰래 바꾸지 않습니다.
4. Firebase 웹 앱 설정에서 생긴 공개 `apiKey`(`AIza…`), `authDomain`(`<project-id>.firebaseapp.com`), `projectId`, `appId`만 `docs/config.js`에 넣습니다. 웹 설정 키 자체가 접근권이 아니므로 Firestore Rules가 필수입니다. **서비스 계정 JSON·비밀번호·OAuth 비밀값·사용자 이름/이메일/UID·실제 기록을 커밋하지 않습니다.** 표준 Auth 도메인만 지원합니다.
5. 이 검증판만 `onda1team/notebibledemo`에 커밋한 다음 Settings → Pages → Deploy from a branch → `main` → `/docs`로 게시합니다. 예상 주소 `https://onda1team.github.io/notebibledemo/`는 Pages UI의 실제 주소와 응답을 확인한 뒤 공유합니다. 기존 앱은 게시·이동·병합하지 않습니다.
6. 승인된 소유자가 사이트에서 **자기 Google 계정**을 한 번 선택합니다. 첫 로그인에 Firebase Auth 계정 행이 생길 수 있어도, 기록 접근은 승인 전 차단됩니다. Firestore 콘솔에서 Authentication → Users의 해당 소유자 이메일이 맞는지 확인하고 UID를 복사한 뒤 `yeobaekTesters/<UID>` 한 문서에 Boolean `enabled: true`를 입력합니다. 계정 이메일이나 UID를 코드·채팅에 적지 않습니다. 같은 Google 계정으로 맥과 휴대폰에서 각각 다시 로그인합니다. 승인되지 않은 구글 계정이라면 인증 후라도 기록에 접근하지 못합니다. 계정 권한을 거둘 때는 이 테스트 프로젝트에서 해당 문서의 `enabled`만 false로 바꿉니다.

### 모바일 로그인과 무료 제한

- [Google의 GitHub Pages 같은 타사 호스팅 안내](https://firebase.google.com/docs/auth/web/redirect-best-practices#popup)대로 사용자 클릭에서 `signInWithPopup`을 사용합니다. 앱 내 브라우저에서는 막힐 수 있으므로 휴대폰의 일반 Chrome/Safari에서 주소를 직접 엽니다. 팝업이 막힌 경우 이 사이트의 팝업 허용이 필요할 수 있습니다. 우회로 `signInWithRedirect`/보안 제한 끄기/다른 서비스로 갈아타기는 하지 않습니다. 실제 폰의 팝업 성공은 별도 확인 대상입니다.
- 로그인은 현재 페이지의 메모리에만 지속됩니다. 새로고침 후 다시 로그인하는 것이 정상이고, 테스트 초안 저장소는 브라우저 origin/프로젝트/경로/승인 Firebase UID별로 구분됩니다. 공유 컴퓨터에서 실제 개인 기록은 저장하지 않습니다.
- [Spark 요금제](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)와 [Firestore 기본 DB 무료 쿼터](https://firebase.google.com/docs/firestore/quotas) 안에서 운영합니다. 쿼터/네트워크 초과는 서버 저장 실패로 표기하며 결제나 다른 백엔드로 바꾸지 않습니다. 앱 최대 30건, 보이는 페이지에 한해 3분 간격 및 집중 복귀/직접 읽기, 한 건의 UTF-8 직렬화 본문 800,000바이트 제한(서버 1 MiB보다 작게)을 둡니다. 큰 기록은 전송하지 않고 초안과 JSON을 유지합니다.

## 실제 검증 순서 (아직 미실행)

| 단계 | 합격 기준 |
|---|---|
| v1 / 맥 | 새 가상 제목 A, 참조, 메모, 가상 주보, 간단한 손글씨를 입력하고 ‘서버에 저장’. 서버 저장 확인 r1 및 백업 다운로드. 백업의 무작위 record ID를 적어 둡니다. |
| v1 / 새 휴대폰 브라우저 | 같은 Google 계정으로 로그인. 맥 캐시 없이 동일 ID r1, 모든 필드·손글씨 일치. 전용 테스트 프로젝트 콘솔에서도 같은 ID의 r1 확인. 휴대폰에서 주보 한 줄을 바꿔 r2 저장하고, 맥의 ‘서버 기록 확인’에서 읽습니다. |
| v2 | `node tools/prepare-v2.mjs`로 화면 버전만 바꾼 뒤 diff 확인 및 테스트. *같은 Pages URL, Firebase 프로젝트, Auth, 문서 경로 및 규칙*을 유지하여 업데이트. 새 브라우저 프로필에서 로그인해 화면 v2와 동일 ID r2, 제목·주보·메모·손글씨 확인. V2가 보이기 전까지 캐시된 V1을 합격 처리하지 않습니다. |
| 충돌 | 두 창에서 같은 r2를 열고 같은 제목을 다르게 작성. 첫 저장 r3, 두 번째 저장이 r3를 덮지 않아야 하며 UI에 두 사본을 표시. 별도 사본 버튼 뒤 별개 ID r1 확인. 네트워크가 끊긴 상태는 ‘서버 저장’으로 보이지 않아야 합니다. |
| 권한 | 로그아웃 상태는 편집/기록이 숨겨짐. 승인 없는 Google 계정의 기록 접근 거부 확인. 별도 승인 테스트 계정은 첫 사용자와 목록·초안을 섞지 않음. 테스트 뒤 두 번째 allowlist를 필요에 따라 비활성화. |
| 복구 | 같은 검증판의 JSON을 가져오면 모든 항목이 새 ID로 초안이 되고, 충돌 사본도 나뉩니다. 원본이나 기존 비공개 앱 백업은 가져오지 않습니다. |

저장은 명시적 버튼이며 로컬 입력만 두 번 이상 저장되었다고 표시하지 않습니다. Firestore 트랜잭션이 기존 revision을 비교해 쓰고, 별도로 서버 값과 내용을 읽어서 확인합니다. 동시 편집은 자동으로 합치지 않고 사용자가 사본을 분리할 수 있게 합니다. Firefox/Chrome/Safari는 버튼 UX가 다를 수 있습니다. 삭제는 앱과 Rules에서 지원하지 않습니다. Firebase 콘솔 관리자 권한은 규칙을 우회할 수 있으므로 테스트 프로젝트 접근 권한을 공유하지 않습니다.

## 로컬 개발 및 검증

- Node 24 기준 `node --test`: 외부 자원 없이 동기화 경계, 두 클라이언트와 v2, 경쟁 트랜잭션, 읽기 실패, 충돌 사본, 캐시/권한 모형, 크기·초안 보존을 검사합니다.
- `python -m http.server --directory docs 4173`: 빈 공개 설정이면 로그인 비활성화/검증판 안내를 확인할 수 있습니다. 실제 Firebase 설정을 담은 상태로 로컬을 실행하고 새 Firebase 도메인을 추가할 필요는 없습니다.
- 선택적 실제 Firestore Rules 검사: Firebase CLI 15.37.0, Java 21, `firebase@13.4.0`, `@firebase/rules-unit-testing`을 로컬 QA 전용 위치에 설치하고 `firebase emulators:exec --only firestore --project demo-yeobaek-verify 'node tools/check-firestore.mjs'`. 별도 위치에 의존성을 설치했다면 `FIREBASE_QA_PACKAGE=/absolute/path/package.json`으로 알려줍니다. 이 명령은 loopback 에뮬레이터의 가상 계정만 사용하고 실제 Firebase 프로젝트나 Google Auth를 만들지 않습니다. CLI 배포 명령이 아닙니다.
- 이후 편집은 GitHub를 원본으로 Codex에서 pull → 테스트 → diff → 커밋 → Pages 검증을 반복합니다. ChatGPT Sites에서 원본을 계속 덮어 내보내거나, 배포 때마다 Firebase 프로젝트/기록 ID를 새로 만드는 작업이 아닙니다.

## 읽기 전용 Cornell 기존 기록 사본 (별도 추가 기능)

기존 검증판 노트와 섞거나 교체하지 않습니다. 현재 Firebase 테스트 프로젝트의 **기존 허용 목록을 그대로 둔 채** 별도의 `yeobaekTestAccounts/{uid}/cornellOriginals/{id}` 컬렉션만 추가합니다. 정식 사용 전 Rules 대상 프로젝트와 시험 사용자 UID를 확인하고, 기능을 올릴 경우 코드와 일치하는 **추가 규칙** 및 `cornellOriginals.payload` 인덱스 제외를 검토합니다. 설정 파일과 일반 notes 코드를 덮어쓰지 마세요. 본 묶음은 배포 또는 업로드 승인이 아닙니다.

승인된 계정으로 들어가 ‘기존 기록 사본 → 기기 백업 검토’에서 옛 Cornell v6 기기 백업의 사본을 엽니다. 브라우저에서만 후보·제외·보류 건수를 확인하며 서버로 보내지 않습니다. 같은 계정인지 별도 확인한 뒤 ‘이 계정에 원본 사본 보관’을 눌러야 서버에 씁니다. 휴지통, 미확정·충돌 기록, 복구 이력, 미지원 버전, 미디어, 너무 큰 기록은 올리지 않으며 원본은 유지됩니다. 정확히 일치하는 사본은 다시 쓰지 않습니다. 같은 장의 다른 저장 내용은 파일에서 서로 충돌하면 보류하고, 별도 파일로 유입된 버전도 기존 사본을 덮지 않습니다. 추후 복구 여부를 판단하려면 원본 기기 백업을 따로 보관하세요.

원본 행의 JSON 값과 블록·획·주석·질문 같은 배열 순서를 보존해 내보낼 수 있습니다. 직렬화 과정에서 JSON 공백과 키 순서는 달라질 수 있으므로 전체 최초 백업 파일 자체는 별도로 보존합니다. 화면에서 제목, 장 참조, 기록 메모, 주보 질문과 답변, 말씀 카드 참조는 읽을 수 있지만 필기/밑줄/레이아웃 재현과 편집은 제공하지 않습니다. 저장 직후 및 다음 로그인에서 원본의 장·제목별 건수, 복수 기기에서 원본 JSON 비교, 현재 기록과 분리됨을 먼저 한 건으로 확인하세요.

로컬 에뮬레이터는 허용 계정만 읽고 추가 가능, 다른 계정·익명·검증되지 않은 계정 차단, 형태가 틀린 쓰기 및 기존 사본 수정/삭제 거부를 확인합니다. 원본 파일, 그 내용, 개인 식별자를 GitHub나 공유 폴더에 넣지 않습니다.
