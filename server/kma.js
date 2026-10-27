const { KMA_GRIDS, getTodayDate, getKmaForecastQuery, parseKmaWeather, judge } = require('../logic.js');
const { loadPublicConfig } = require('./public-config.js');

const KMA_ENDPOINT = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst';

async function fetchJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('외부 서비스 응답 오류');
  return response.json();
}

async function readTasks(fetchImpl, config, region) {
  const url = new URL('/rest/v1/wx_tasks', config.url);
  url.search = new URLSearchParams({
    select: 'id,title,region,kind,owner', region: 'eq.' + region, order: 'id.asc',
  });
  const headers = { apikey: config.key };
  // 새 publishable 키는 JWT가 아니므로 Authorization에 넣지 않는다.
  if (!config.key.startsWith('sb_publishable_')) headers.Authorization = 'Bearer ' + config.key;
  const tasks = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchJson(fetchImpl, url, {
      headers: { ...headers, 'Range-Unit': 'items', Range: offset + '-' + (offset + pageSize - 1) },
    });
    if (!Array.isArray(page) || !page.every((task) => task && task.region === region
        && typeof task.title === 'string' && typeof task.owner === 'string'
        && ['야외', '고소', '실내'].includes(task.kind))) throw new Error('일정 응답 오류');
    tasks.push(...page);
    if (page.length < pageSize) return tasks;
  }
}

function createKmaHandler({ fetchImpl = globalThis.fetch, loadConfig = loadPublicConfig,
  env = process.env, now = () => new Date() } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 지원합니다.' } });
    }
    const params = new URL(req.url, 'https://weather-board.invalid').searchParams;
    const values = params.getAll('region');
    const region = values[0];
    if (values.length !== 1 || !Object.hasOwn(KMA_GRIDS, region)) {
      return res.status(400).json({ error: { code: 'INVALID_REGION',
        message: 'region에 세종·대전·태안·보령 중 한 곳을 입력해 주세요.' } });
    }

    let config;
    try {
      config = loadConfig();
    } catch (error) {
      return res.status(503).json({ error: { code: 'DB_NOT_CONFIGURED',
        message: 'config.js의 Supabase 공개 연결 설정을 확인해 주세요.' } });
    }
    const instant = now();
    const date = getTodayDate(instant);
    let tasks;
    try {
      tasks = await readTasks(fetchImpl, config, region);
    } catch (error) {
      return res.status(502).json({ error: { code: 'DB_UNAVAILABLE',
        message: 'DB 일정을 읽지 못했습니다. Supabase 연결과 wx_tasks 테이블을 확인해 주세요.' } });
    }

    let weather = null;
    let forecast = null;
    const warnings = [];
    if (!env.KMA_KEY || !env.KMA_KEY.trim()) {
      warnings.push({ code: 'KMA_NOT_CONFIGURED', message: 'Vercel의 KMA_KEY 환경변수를 확인해 주세요.' });
    } else {
      try {
        const query = getKmaForecastQuery(region, instant);
        const url = new URL(KMA_ENDPOINT);
        url.search = new URLSearchParams({ ...query.params, authKey: env.KMA_KEY.trim() });
        weather = parseKmaWeather(await fetchJson(fetchImpl, url), date);
        forecast = { baseDate: query.params.base_date, baseTime: query.params.base_time,
          source: '기상청 API허브 단기예보', units: { tempMax: '℃', windMax: 'm/s', rainProb: '%' } };
      } catch (error) {
        // 외부 오류나 요청 URL에는 키가 포함될 수 있어 응답·로그에 그대로 쓰지 않는다.
        warnings.push({ code: 'KMA_UNAVAILABLE', message: '오늘 날씨를 받지 못했습니다. 일정은 정상 조회되었습니다.' });
      }
    }
    return res.status(200).json({ status: weather ? 'ok' : 'partial', region, date,
      weather, forecast, warnings,
      tasks: tasks.map((task) => ({ ...task, weather, judgment: judge(task.kind, weather) })),
    });
  };
}

module.exports = { createKmaHandler };
