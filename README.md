# 현장 일정 날씨판

오늘 현장 일정과 지역별 날씨를 한 화면에서 보고, 날씨 때문에 주의 · 중지를 검토할 일정을 표시합니다. (교육용 가상 데이터)

## Supabase 설정과 실행
1. Supabase 프로젝트의 SQL Editor에서 `setup.sql`을 실행합니다. `wx_tasks`와 초기 가상 일정 6건이 만들어집니다.
2. `config.js`의 두 줄에 프로젝트 URL과 공개용 키(publishable 또는 기존 anon)를 입력합니다. secret/service_role 키는 사용하지 않습니다.
3. 사이트를 HTTP/HTTPS 주소로 열면 DB 일정을 읽습니다. 화면에서 추가한 일정도 DB에 저장되므로 다른 브라우저에서 새로고침하면 같은 목록을 볼 수 있습니다.

로그인 없는 교육용 앱으로, 공개 사용자는 전체 일정 조회와 추가가 가능합니다. 수정·삭제는 허용하지 않습니다. 실제 개인정보를 넣지 마세요.
지역·구분과 빈 일정명·담당은 DB 제약으로도 검증합니다. 기존 JSON과 브라우저 저장 일정은 자동으로 가져오지 않습니다.
날씨 조회, `?test=wind` 시험 모드와 ‘오늘판단md로저장’ 기능은 그대로 사용할 수 있습니다.

## 파일
| 파일 | 역할 |
|---|---|
| index.html | 화면 구조 |
| style.css | 디자인 |
| logic.js | 판단 규칙 |
| app.js | 화면 동작 |
| config.js | Supabase URL · 공개용 키 두 줄 |
| setup.sql | SQL Editor에서 실행할 DB 설정과 초기 가상 일정 |
| data/tasks.json | 이전 단원의 JSON 예제 (현재 앱은 읽지 않음) |
| PRD.md | 무엇을 · 왜 만드는지 |
| CLAUDE.md | AI가 지킬 작업 규칙 |
| .gitignore | GitHub에 올리지 않을 파일 목록 |
