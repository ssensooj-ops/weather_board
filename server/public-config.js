const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPublicConfig() {
  // 브라우저와 동일한 프로젝트 소유의 두 줄 설정을 읽는다. 요청 입력은 실행하지 않는다.
  const source = readFileSync(path.join(process.cwd(), 'config.js'), 'utf8');
  const config = vm.runInNewContext(source + '\n({ SUPABASE_URL, SUPABASE_PUBLIC_KEY })',
    Object.create(null), { timeout: 100 });
  const { SUPABASE_URL: url, SUPABASE_PUBLIC_KEY: key } = config;
  if (typeof url !== 'string' || new URL(url).protocol !== 'https:' || typeof key !== 'string') {
    throw new Error('공개 연결 설정 오류');
  }
  let publicKey = key.startsWith('sb_publishable_');
  if (!publicKey) {
    try {
      publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role === 'anon';
    } catch (error) {
      publicKey = false;
    }
  }
  if (!publicKey) throw new Error('공개용 키만 허용');
  return { url, key };
}

module.exports = { loadPublicConfig };
