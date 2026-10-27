// app.js – 화면 동작 (목록 그리기, 일정 추가)

let tasks = [];
let taskClient = null;
let savingTask = false;
const TASK_COLUMNS = 'id,title,region,kind,owner';
const weatherByRegion = {};
const windTest = new URLSearchParams(window.location.search).get('test') === 'wind';

async function loadWeather() {
  const regions = Object.keys(REGIONS);
  const failed = new Set();
  let completed = 0;
  const status = document.getElementById('weatherStatus');
  const testNotice = windTest ? ' · 시험 모드: 수신한 풍속을 12m/s로 변경' : '';

  function updateStatus() {
    const loaded = Object.keys(weatherByRegion).length;
    const progress = completed < regions.length
      ? '오늘 날씨 불러오는 중 (' + completed + '/' + regions.length + ')'
      : '오늘 날씨 수신: ' + loaded + '/' + regions.length + '개 지역';
    const error = failed.size
      ? ' · ' + [...failed].join(' · ') + ': 날씨를 받지 못했습니다. 새로고침해 다시 시도해 주세요.'
      : '';
    status.textContent = progress + ' · 한국 시간 기준 / 최고 기온 · 최대 풍속 · 최대 강수확률' + testNotice + error;
  }

  updateStatus();
  await Promise.all(regions.map(async (region) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(buildWeatherUrl(region), { signal: controller.signal });
      if (!response.ok) throw new Error('날씨 요청 실패: ' + response.status);
      const weather = parseWeather(await response.json());
      if (windTest) weather.windMax = 12;
      weatherByRegion[region] = weather;
    } catch (error) {
      failed.add(region);
    } finally {
      clearTimeout(timeout);
      completed += 1;
      renderTasks();
      updateStatus();
    }
  }));
}

function isTaskList(value) {
  return Array.isArray(value) && value.every((task) => task
    && typeof task.title === 'string' && typeof task.owner === 'string'
    && Object.hasOwn(REGIONS, task.region) && ['야외', '고소', '실내'].includes(task.kind));
}

async function loadTasks() {
  const message = document.getElementById('msgBox');
  const button = document.querySelector('#taskForm button');
  button.disabled = true;
  message.textContent = '일정 불러오는 중';
  try {
    if (!taskClient) taskClient = createTaskClient();
    const { data, error } = await taskClient.from('wx_tasks').select(TASK_COLUMNS).order('id');
    if (error) throw error;
    if (!isTaskList(data)) throw new Error('일정 형식 오류');
    tasks = data;
    renderTasks();
    message.textContent = '';
    button.disabled = false;
  } catch (error) {
    message.textContent = error.configuration
      ? error.message
      : error.code === 'PGRST205' || error.code === '42P01'
        ? 'wx_tasks 테이블을 찾지 못했습니다. Supabase SQL Editor에서 setup.sql을 실행한 뒤 새로고침해 주세요.'
        : 'Supabase에서 일정을 불러오지 못했습니다. 연결 설정과 setup.sql 실행 여부를 확인하고 새로고침해 주세요.';
  }
}

function createTaskClient() {
  function configurationError(message) {
    const error = new Error(message);
    error.configuration = true;
    return error;
  }
  if (typeof SUPABASE_URL !== 'string' || !SUPABASE_URL
      || typeof SUPABASE_PUBLIC_KEY !== 'string' || !SUPABASE_PUBLIC_KEY) {
    throw configurationError('config.js에 Supabase 주소와 공개용 키를 입력해 주세요.');
  }
  let publicKey = SUPABASE_PUBLIC_KEY.startsWith('sb_publishable_');
  if (!publicKey) {
    try {
      const payload = SUPABASE_PUBLIC_KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      publicKey = JSON.parse(atob(payload)).role === 'anon';
    } catch (error) {
      publicKey = false;
    }
  }
  if (!publicKey) throw configurationError('publishable 또는 anon 공개용 키만 사용해 주세요. 비밀 키는 사용할 수 없습니다.');
  try {
    if (new URL(SUPABASE_URL).protocol !== 'https:') throw new Error('HTTPS 주소 필요');
  } catch (error) {
    throw configurationError('config.js의 Supabase HTTPS 주소를 확인해 주세요.');
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw configurationError('Supabase 스크립트를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function weatherText(w) {
  return w ? w.tempMax + '℃ · ' + w.windMax + 'm/s · ' + w.rainProb + '%' : '-';
}

function renderTasks() {
  const body = document.getElementById('taskList');
  body.innerHTML = '';
  for (const t of tasks) {
    const w = weatherByRegion[t.region];
    const r = judge(t.kind, w);
    const tr = document.createElement('tr');
    for (const v of [t.title, t.region, t.kind, t.owner, weatherText(w)]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    td.textContent = r.text;
    td.className = r.level;
    tr.appendChild(td);
    body.appendChild(tr);
  }
  document.getElementById('saveMarkdown').disabled = tasks.length === 0;
}

function downloadJudgmentMarkdown() {
  const rows = [...document.querySelectorAll('#taskList tr')]
    .map((row) => [...row.cells].map((cell) => cell.textContent));
  const date = todayDate.dateTime;
  const markdown = buildJudgmentMarkdown(rows, date);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '현장일정_판단_' + date + '.md';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function addTask(e) {
  e.preventDefault();
  if (!taskClient || savingTask || document.querySelector('#taskForm button').disabled) return;
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  if (!isTaskList([t])) return;
  const button = document.querySelector('#taskForm button');
  const message = document.getElementById('msgBox');
  savingTask = true;
  button.disabled = true;
  message.textContent = '일정 저장 중';
  try {
    const { data, error } = await taskClient.from('wx_tasks').insert(t).select(TASK_COLUMNS).single();
    if (error) throw error;
    if (!isTaskList([data])) throw new Error('저장 응답 오류');
    tasks.push(data);
    e.target.reset();
    renderTasks();
    message.textContent = 'Supabase에 일정을 저장했습니다.';
  } catch (error) {
    message.textContent = '저장을 확인하지 못했습니다. 새로고침해 목록을 확인한 뒤 다시 시도해 주세요.';
  } finally {
    savingTask = false;
    button.disabled = false;
  }
}

const todayText = getTodayDate();
const todayDate = document.getElementById('todayDate');
todayDate.textContent = todayText;
todayDate.dateTime = todayText;

document.getElementById('taskForm').addEventListener('submit', addTask);
document.getElementById('saveMarkdown').addEventListener('click', downloadJudgmentMarkdown);
loadTasks();
renderTasks();
loadWeather();
