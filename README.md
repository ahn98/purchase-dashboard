# 물품구매 관리 대시보드

공공기관 구성원이 물품을 구입할 때 절차별로 필요한 작업과 서류를 확인하고, 온라인으로 신청하고, 관리자가 진행단계를 한눈에 관리하는 웹사이트입니다.

- 화면: GitHub Pages (무료)
- 로그인·데이터·첨부파일: Supabase 무료 플랜

## 권한

| 기능 | 사용자 | 관리자 | 최고관리자 |
|---|---|---|---|
| 메인 대시보드 | 읽기 | 읽기 | 읽기·수정(공지, 회원 승인) |
| 물품 신청 내역 | 전체 읽기, 신청, 본인 건 수정('신청' 단계일 때) | 읽기·수정(진행단계, 예산 항목, 메모) | 전체 + 삭제 |
| 예산 내역 | 메뉴 숨김, 접근 차단 | 읽기 | 읽기·수정 |

권한은 화면뿐 아니라 데이터베이스(RLS)에서도 막혀 있어, 브라우저 개발자도구로 우회할 수 없습니다.
첨부 서류는 신청자 본인과 관리자 이상만 내려받을 수 있습니다.

## 폴더 구성

```
index.html        메인 대시보드
requests.html     물품 신청 내역
budget.html       예산 내역
login.html        로그인 / 회원가입
css/style.css     디자인
js/config.js      ★ 설정 (Supabase 키, 기관명, 절차별 할 일·서류)
js/common.js      공통 기능
js/*.js           페이지별 기능
forms/            ★ 다운로드용 양식 파일을 여기에 올림
supabase/schema.sql  Supabase에서 한 번 실행할 SQL
```

## 설치 순서

### 1. Supabase 프로젝트 만들기
1. https://supabase.com 에 가입하고 **New project**를 만듭니다. (Region은 Seoul 권장)
2. 왼쪽 메뉴 **SQL Editor → New query**에 `supabase/schema.sql` 내용을 전부 붙여넣고 **Run**을 누릅니다.
3. **Project Settings → API**에서 `Project URL`과 `anon public` 키를 복사해 둡니다.

### 2. GitHub에 올리기
1. GitHub에서 새 저장소(Public)를 만듭니다. 예: `purchase-dashboard`
2. 이 폴더의 파일을 모두 올립니다. (숨김 파일 `.nojekyll` 포함)
3. `js/config.js`를 열어 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ORG_NAME`을 입력합니다.
   - anon 키는 공개되어도 되는 키입니다. 데이터는 RLS 권한 규칙으로 보호됩니다.
   - **service_role 키는 절대 넣지 마세요.**
4. `forms/` 폴더에 양식 파일을 올립니다. (`forms/README.md` 참고)
5. 저장소 **Settings → Pages → Branch: main / (root) → Save**
6. 몇 분 뒤 `https://아이디.github.io/purchase-dashboard/` 주소로 접속됩니다.

### 3. 로그인 주소 등록
Supabase **Authentication → URL Configuration**에서
- **Site URL**: `https://아이디.github.io/purchase-dashboard/`
- **Redirect URLs**: `https://아이디.github.io/purchase-dashboard/**`

이 설정이 없으면 메일 링크를 눌렀을 때 사이트로 돌아오지 않습니다.

### 4. 첫 최고관리자 지정
1. 사이트의 **회원가입**에서 본인 이름과 이메일로 가입하고, 메일 링크를 누릅니다.
2. Supabase **SQL Editor**에서 아래를 실행합니다.
   ```sql
   update public.profiles set role = 'superadmin' where email = '본인이메일';
   ```
3. 사이트를 새로고침하면 최고관리자로 로그인됩니다. 이후 가입자는 대시보드 하단 **회원 관리**에서 권한을 골라 승인합니다.

## 운영 시 알아둘 점

- **메일 발송량**: Supabase 기본 메일은 시간당 발송 수가 매우 적습니다(테스트용). 실제 운영 전에 **Authentication → Emails → SMTP Settings**에서 기관 메일 서버나 외부 SMTP를 연결하세요.
- **메일 문구 한글화**: **Authentication → Emails → Templates**의 Magic Link 템플릿을 한글로 바꿀 수 있습니다.
- **휴면 정지**: 무료 플랜은 7일간 사용이 없으면 프로젝트가 일시 정지됩니다. Supabase 대시보드에서 Restore를 누르면 다시 켜집니다.
- **절차 바꾸기**: `js/config.js`의 `STEPS`에서 단계별 할 일·서류를 고칩니다. 운영 중에는 `key` 값을 바꾸지 마세요(DB에 저장된 값과 연결됨). 첫 단계 `key`는 `'신청'`이어야 합니다.
- **보안 검토**: 구성원의 실명·이메일과 예산 정보가 외부 클라우드에 저장됩니다. 운영 전 기관 정보보안 담당 부서의 확인을 받으세요.
