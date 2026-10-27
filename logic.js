// logic.js – 날씨 API 주소 · 응답 해석 · 판단 규칙 (화면을 다루는 코드 금지)

const REGIONS = {
  '세종': { latitude: 36.48, longitude: 127.29 },
  '대전': { latitude: 36.35, longitude: 127.38 },
  '태안': { latitude: 36.75, longitude: 126.30 },
  '보령': { latitude: 36.33, longitude: 126.61 },
};

// 각 지역 대표 지점의 기상청 단기예보 격자.
const KMA_GRIDS = {
  '세종': { nx: 66, ny: 103 },
  '대전': { nx: 67, ny: 100 },
  '태안': { nx: 48, ny: 109 },
  '보령': { nx: 54, ny: 100 },
};

function getKmaForecastQuery(region, now = new Date()) {
  if (!Object.hasOwn(KMA_GRIDS, region)) throw new Error('지원하지 않는 지역입니다.');
  // 오늘 00~23시 전체를 포함하는 전날 23시 발표본을 사용한다.
  const date = getTodayDate(now);
  const previousDay = new Date(date + 'T00:00:00+09:00');
  previousDay.setTime(previousDay.getTime() - 24 * 60 * 60 * 1000);
  return {
    date,
    params: {
      pageNo: '1', numOfRows: '1000', dataType: 'JSON',
      base_date: getTodayDate(previousDay).replace(/-/g, ''),
      base_time: '2300',
      ...KMA_GRIDS[region],
    },
  };
}

function parseKmaWeather(data, date) {
  const response = data && data.response;
  if (response?.header?.resultCode !== '00') throw new Error('기상청 응답 오류');
  const items = response.body?.items?.item;
  if (!Array.isArray(items)) throw new Error('기상청 예보 없음');
  const today = date.replace(/-/g, '');
  const byCategory = { TMX: [], WSD: [], POP: [] };
  const times = { WSD: new Set(), POP: new Set() };
  for (const item of items) {
    if (String(item.fcstDate) !== today || !Object.hasOwn(byCategory, item.category)) continue;
    if (item.fcstValue === null || item.fcstValue === undefined || String(item.fcstValue).trim() === '') {
      throw new Error('기상청 예보 값 누락');
    }
    const value = Number(item.fcstValue);
    if (!Number.isFinite(value) || value <= -900
        || (item.category === 'WSD' && value < 0)
        || (item.category === 'POP' && (value < 0 || value > 100))) {
      throw new Error('기상청 예보 값 오류');
    }
    byCategory[item.category].push(value);
    if (times[item.category]) times[item.category].add(String(item.fcstTime));
  }
  const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0') + '00');
  if (!byCategory.TMX.length || !hours.every((hour) => times.WSD.has(hour) && times.POP.has(hour))) {
    throw new Error('오늘 하루의 예보가 불완전합니다.');
  }
  return {
    tempMax: Math.max(...byCategory.TMX),
    windMax: Math.max(...byCategory.WSD),
    rainProb: Math.max(...byCategory.POP),
  };
}

function getTodayDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type).value;
  return [value('year'), value('month'), value('day')].join('-');
}

function buildWeatherUrl(region) {
  const coordinates = REGIONS[region];
  if (!coordinates) throw new Error('지원하지 않는 지역입니다.');
  const params = new URLSearchParams({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    daily: 'temperature_2m_max,wind_speed_10m_max,precipitation_probability_max',
    temperature_unit: 'celsius',
    wind_speed_unit: 'ms',
    timezone: 'Asia/Seoul',
    forecast_days: '1',
  });
  return 'https://api.open-meteo.com/v1/forecast?' + params;
}

function parseWeather(data, date = getTodayDate()) {
  const daily = data && data.daily;
  const index = daily && Array.isArray(daily.time) ? daily.time.indexOf(date) : -1;
  if (index < 0) throw new Error('오늘 날씨가 없습니다.');
  const weather = {
    tempMax: daily.temperature_2m_max?.[index],
    windMax: daily.wind_speed_10m_max?.[index],
    rainProb: daily.precipitation_probability_max?.[index],
  };
  // null이나 빠진 값이 0으로 취급되어 '진행'으로 판단되지 않게 한다.
  if (!Object.values(weather).every(Number.isFinite)
      || weather.windMax < 0 || weather.rainProb < 0 || weather.rainProb > 100) {
    throw new Error('날씨 값이 올바르지 않습니다.');
  }
  return weather;
}

// 교육용 가상 기준 (실제 작업 중지 · 행사 취소 기준은 각 기관 규정을 따름)
const RULES = { wind: 10, rain: 60, heat: 33 };

// 일정 구분과 날씨로 판단 (w가 없으면 '날씨 확인 전')
function judge(kind, w) {
  if (kind === '실내') return { level: 'ok', text: '영향 없음' };
  if (!w) return { level: 'none', text: '날씨 확인 전' };
  if (kind === '고소' && w.windMax >= RULES.wind) return { level: 'stop', text: '중지 검토 (강풍)' };
  if (w.tempMax >= RULES.heat) return { level: 'warn', text: '폭염 휴식' };
  if (w.rainProb >= RULES.rain) return { level: 'warn', text: '우천 주의' };
  return { level: 'ok', text: '진행' };
}

function buildJudgmentMarkdown(rows, date = getTodayDate()) {
  const escapeCell = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
    .replace(/([`*_\[\]~])/g, '\\$1').replace(/\r\n|\r|\n/g, '<br>');
  const lines = [
    '# 현장 일정 판단 · ' + date,
    '',
    '| 일정 | 지역 | 구분 | 담당 | 날씨 | 판단 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => '| ' + row.map(escapeCell).join(' | ') + ' |'),
    '',
    `판단 기준(교육용 가상): 실내는 영향 없음; 그 외 고소·풍속 ${RULES.wind}m/s 이상 → 중지 검토, 최고 기온 ${RULES.heat}℃ 이상 → 폭염 휴식, 강수확률 ${RULES.rain}% 이상 → 우천 주의 순으로 우선 적용; 해당 없으면 진행, 날씨 미수신이면 날씨 확인 전.`,
  ];
  return lines.join('\n') + '\n';
}

if (typeof module !== 'undefined') {
  module.exports = { REGIONS, KMA_GRIDS, getTodayDate, getKmaForecastQuery, parseKmaWeather,
    buildWeatherUrl, parseWeather, RULES, judge, buildJudgmentMarkdown };
}
