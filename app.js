// app.js – 화면 동작 (목록 그리기, 일정 추가)

let baseTasks = [];
let addedTasks = [];
let tasks = [];
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
  const notices = [];
  button.disabled = true;
  message.textContent = '일정 불러오는 중';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('./data/tasks.json', { signal: controller.signal });
    if (!response.ok) throw new Error('일정 요청 실패');
    const data = await response.json();
    if (!isTaskList(data)) throw new Error('일정 형식 오류');
    baseTasks = data;
  } catch (error) {
    baseTasks = [];
    notices.push(window.location.protocol === 'file:'
      ? '배포주소로열어주세요'
      : '기본 일정을 불러오지 못했습니다. 새로고침해 다시 시도해 주세요.');
  } finally {
    clearTimeout(timeout);
  }

  // 기본 JSON을 읽은 다음, 화면에서 추가한 일정만 브라우저 저장에서 읽는다.
  try {
    const saved = JSON.parse(localStorage.getItem('wx_added') || '[]');
    if (!isTaskList(saved)) throw new Error('저장된 일정 형식 오류');
    addedTasks = saved;
  } catch (error) {
    addedTasks = [];
    notices.push('브라우저에 저장된 추가 일정을 읽지 못했습니다.');
  }
  tasks = baseTasks.concat(addedTasks);
  renderTasks();
  message.textContent = notices.join(' ');
  button.disabled = false;
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
}

function addTask(e) {
  e.preventDefault();
  const t = {
    title: document.getElementById('titleInput').value.trim(),
    region: document.getElementById('regionInput').value,
    kind: document.getElementById('kindInput').value,
    owner: document.getElementById('ownerInput').value.trim(),
  };
  if (!t.title || !t.owner) return;
  const nextAdded = addedTasks.concat(t);
  try {
    localStorage.setItem('wx_added', JSON.stringify(nextAdded));
  } catch (error) {
    document.getElementById('msgBox').textContent = '일정을 저장하지 못했습니다. 브라우저 저장 설정을 확인해 주세요.';
    return;
  }
  addedTasks = nextAdded;
  tasks = baseTasks.concat(addedTasks);
  e.target.reset();
  renderTasks();
}

const todayText = getTodayDate();
const todayDate = document.getElementById('todayDate');
todayDate.textContent = todayText;
todayDate.dateTime = todayText;

document.getElementById('taskForm').addEventListener('submit', addTask);
loadTasks();
renderTasks();
loadWeather();
