const test = require('node:test');
const assert = require('node:assert/strict');
const { createKmaHandler } = require('../server/kma.js');
const { loadPublicConfig } = require('../server/public-config.js');
const { getKmaForecastQuery, parseKmaWeather } = require('../logic.js');

const date = '2026-10-27';
const instant = new Date(date + 'T09:00:00+09:00');
const exampleKey = 'example-kma-key-not-a-real-key';
const config = { url: 'https://example.supabase.co', key: 'sb_publishable_example' };
const tasks = ['야외', '고소', '실내'].map((kind, id) => ({
  id: id + 1, title: '가상 일정 ' + id, owner: '가상', region: '대전', kind,
}));

function forecast() {
  const item = [{ category: 'TMX', fcstDate: '20261027', fcstTime: '1500', fcstValue: '34' }];
  for (let hour = 0; hour < 24; hour += 1) {
    const common = { fcstDate: '20261027', fcstTime: String(hour).padStart(2, '0') + '00' };
    item.push({ ...common, category: 'WSD', fcstValue: hour === 12 ? '12' : '3' });
    item.push({ ...common, category: 'POP', fcstValue: hour === 12 ? '70' : '10' });
  }
  return { response: { header: { resultCode: '00' }, body: { items: { item } } } };
}

function response() {
  return {
    headers: {}, statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function fixture({ db = tasks, kma = forecast(), dbError = false, kmaError = false,
  env = { KMA_KEY: exampleKey }, loadConfig = () => config } = {}) {
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.hostname === 'example.supabase.co') {
      if (dbError) throw new Error('DB upstream failure with secret ' + exampleKey);
      const [start, end] = options.headers.Range.split('-').map(Number);
      return { ok: true, json: async () => db.slice(start, end + 1) };
    }
    if (kmaError) throw new Error('KMA upstream failure with secret ' + exampleKey);
    return { ok: true, json: async () => kma };
  };
  return { calls, handler: createKmaHandler({ fetchImpl, loadConfig, env, now: () => instant }) };
}

async function invoke(handler, url = '/api/kma?region=' + encodeURIComponent('대전'), method = 'GET') {
  const res = response();
  await handler({ url, method }, res);
  assert.equal(JSON.stringify(res.body).includes(exampleKey), false, '인증키가 응답에 없어야 한다');
  return res;
}

test('지역 DB 일정, 기상청 날씨와 공통 규칙 판단을 반환한다', async () => {
  const { handler, calls } = fixture();
  const res = await invoke(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.date, date);
  assert.deepEqual(res.body.weather, { tempMax: 34, windMax: 12, rainProb: 70 });
  assert.deepEqual(res.body.tasks.map((t) => t.judgment.text), ['폭염 휴식', '중지 검토 (강풍)', '영향 없음']);
  assert.equal(calls[0].url.searchParams.get('region'), 'eq.대전');
  assert.equal(calls[0].url.searchParams.get('order'), 'id.asc');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].url.hostname, 'apihub.kma.go.kr');
  assert.equal(calls[1].url.searchParams.get('authKey'), exampleKey);
  assert.equal(calls[1].url.searchParams.get('base_date'), '20261026');
  assert.equal(calls[1].url.searchParams.get('base_time'), '2300');
  assert.equal(calls[1].url.searchParams.get('nx'), '67');
  assert.equal(calls[1].url.searchParams.get('ny'), '100');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('지원 지역 4곳을 조회한다', async () => {
  for (const region of ['세종', '대전', '태안', '보령']) {
    const { handler } = fixture({ db: [{ ...tasks[0], region }] });
    const res = await invoke(handler, '/api/kma?region=' + encodeURIComponent(region));
    assert.equal(res.body.region, region);
    assert.equal(res.body.tasks[0].region, region);
  }
});

test('누락·중복·미지원·객체 속성 지역을 외부 호출 전에 거부한다', async () => {
  const { handler, calls } = fixture();
  for (const query of ['', '?region=', '?region=서울', '?region=대전&region=태안', '?region=__proto__', '?region=toString']) {
    const res = await invoke(handler, '/api/kma' + query);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(calls.length, 0);
});

test('GET 외 요청은 405이고 DB를 변경하지 않는다', async () => {
  const { handler, calls } = fixture();
  const res = await invoke(handler, '/api/kma?region=대전', 'POST');
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET');
  assert.equal(calls.length, 0);
});

test('기상청 실패·키 누락에도 일정과 미수신 판단을 유지한다', async () => {
  for (const options of [{ kmaError: true }, { env: {} }, { env: { KMA_KEY: '  ' } }]) {
    const res = await invoke(fixture(options).handler);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'partial');
    assert.equal(res.body.weather, null);
    assert.equal(res.body.forecast, null);
    assert.deepEqual(res.body.tasks.map((t) => t.judgment.text), ['날씨 확인 전', '날씨 확인 전', '영향 없음']);
    assert.equal(res.body.warnings.length, 1);
  }
});

test('DB 실패와 설정 실패를 구분하며 원본 오류를 노출하지 않는다', async () => {
  const failed = await invoke(fixture({ dbError: true }).handler);
  assert.equal(failed.statusCode, 502);
  assert.equal(failed.body.error.code, 'DB_UNAVAILABLE');
  const missing = await invoke(fixture({ loadConfig: () => { throw new Error('private details'); } }).handler);
  assert.equal(missing.statusCode, 503);
  assert.equal(missing.body.error.code, 'DB_NOT_CONFIGURED');
  assert.equal(JSON.stringify(missing.body).includes('private details'), false);
});

test('일정이 없는 지역은 빈 배열이며 다른 지역의 DB 응답은 거부한다', async () => {
  assert.deepEqual((await invoke(fixture({ db: [] }).handler)).body.tasks, []);
  assert.equal((await invoke(fixture({ db: [{ ...tasks[0], region: '태안' }] }).handler)).statusCode, 502);
});

test('1000건을 넘는 DB 일정도 다음 범위를 읽는다', async () => {
  const db = Array.from({ length: 1002 }, (_, id) => ({ ...tasks[0], id }));
  const { handler, calls } = fixture({ db });
  assert.equal((await invoke(handler)).body.tasks.length, 1002);
  assert.equal(calls[1].options.headers.Range, '1000-1999');
});

test('한국 날짜, 월·연 경계에서 전날 발표본을 고른다', () => {
  assert.equal(getKmaForecastQuery('대전', new Date('2026-12-31T15:01:00Z')).params.base_date, '20261231');
  assert.equal(getKmaForecastQuery('대전', new Date('2026-03-01T00:00:00+09:00')).params.base_date, '20260228');
  assert.equal(getKmaForecastQuery('대전', new Date('2026-10-26T15:01:00Z')).date, date);
});

test('불완전·결측·잘못된 예보를 정상 날씨로 해석하지 않는다', () => {
  const mutations = [
    (data) => { data.response.header.resultCode = '30'; },
    (data) => { data.response.body.items.item.splice(0, 1); },
    (data) => { data.response.body.items.item.splice(1, 1); },
    (data) => { data.response.body.items.item[0].fcstValue = '-999'; },
    (data) => { data.response.body.items.item[1].fcstValue = null; },
    (data) => { data.response.body.items.item[2].fcstValue = '101'; },
    (data) => { data.response.body.items.item[1].fcstValue = '-1'; },
  ];
  for (const mutate of mutations) {
    const data = forecast();
    mutate(data);
    assert.throws(() => parseKmaWeather(data, date));
  }
});

test('미완성 예보 응답이면 API에서도 부분 실패로 반환한다', async () => {
  const data = forecast();
  data.response.body.items.item.pop();
  const res = await invoke(fixture({ kma: data }).handler);
  assert.equal(res.body.status, 'partial');
  assert.equal(res.body.weather, null);
});

test('프로젝트 공개 config.js를 서버에서도 읽는다', () => {
  const actual = loadPublicConfig();
  assert.equal(new URL(actual.url).protocol, 'https:');
  assert.equal(typeof actual.key, 'string');
  assert.ok(actual.key.length > 0);
});
