# 현장 일정 날씨판

오늘 현장 일정과 지역별 날씨를 한 화면에서 보고, 날씨 때문에 주의 · 중지를 검토할 일정을 표시합니다. (교육용 가상 데이터)

## Supabase 설정과 실행
1. Supabase 프로젝트의 SQL Editor에서 `setup.sql`을 실행합니다. `wx_tasks`와 초기 가상 일정 6건이 만들어집니다.
2. `config.js`의 두 줄에 프로젝트 URL과 공개용 키(publishable 또는 기존 anon)를 입력합니다. secret/service_role 키는 사용하지 않습니다.
3. 사이트를 HTTP/HTTPS 주소로 열면 DB 일정을 읽습니다. 화면에서 추가한 일정도 DB에 저장되므로 다른 브라우저에서 새로고침하면 같은 목록을 볼 수 있습니다.

로그인 없는 교육용 앱으로, 공개 사용자는 전체 일정 조회와 추가가 가능합니다. 수정·삭제는 허용하지 않습니다. 실제 개인정보를 넣지 마세요.
지역·구분과 빈 일정명·담당은 DB 제약으로도 검증합니다. 기존 JSON과 브라우저 저장 일정은 자동으로 가져오지 않습니다.
날씨 조회, `?test=wind` 시험 모드와 ‘오늘판단md로저장’ 기능은 그대로 사용할 수 있습니다.

## 지역별 JSON API
Vercel 환경변수 `KMA_KEY`에 **기상청 API허브** 발급 키를 설정하고 배포합니다. 환경변수를 변경했다면 다시 배포해야 합니다.

배포 주소의 `/api/kma?region=대전`을 열면 DB의 대전 일정과 기상청 오늘 날씨, 일정별 판단이 JSON으로 나옵니다. 세종·태안·보령도 지원합니다.
Supabase는 기존 `config.js`의 공개용 연결 정보를 재사용하므로 별도 DB 비밀 키는 필요하지 않습니다.
오늘 하루 전체를 판단하기 위해 전날 23시 발표 예보를 사용합니다. 최고 기온은 TMX, 풍속·강수확률은 오늘 시간별 예보의 최댓값입니다.
날씨 실패 시 `status: "partial"`, `weather: null`, `warnings`와 DB 일정을 반환합니다. 실내는 ‘영향 없음’, 나머지는 ‘날씨 확인 전’입니다.
요청·응답 예시와 오류 상태 코드는 `PRD.md`의 F-07을 참고하세요. API는 Vercel에서 실행되며 HTML 더블클릭만으로는 동작하지 않습니다.

공식 명세: [기상청 API허브 단기예보](https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=286), [Vercel Node.js 함수](https://vercel.com/docs/functions/runtimes/node-js).
서버 API 자동 검증: Node.js 환경에서 `node --test tests/kma.test.cjs`를 실행합니다. 기상청·DB 응답은 모의 데이터로 검증하며 DB를 변경하지 않습니다.

## 파일
| 파일 | 역할 |
|---|---|
| index.html | 화면 구조 |
| style.css | 디자인 |
| logic.js | 판단 규칙 |
| app.js | 화면 동작 |
| config.js | Supabase URL · 공개용 키 두 줄 |
| setup.sql | SQL Editor에서 실행할 DB 설정과 초기 가상 일정 |
| api/kma.js · server/ | DB 일정·기상청 날씨·판단 JSON API |
| vercel.json | 서버 함수 설정 |
| data/tasks.json | 이전 단원의 JSON 예제 (현재 앱은 읽지 않음) |
| PRD.md | 무엇을 · 왜 만드는지 |
| CLAUDE.md | AI가 지킬 작업 규칙 |
| .gitignore | GitHub에 올리지 않을 파일 목록 |
