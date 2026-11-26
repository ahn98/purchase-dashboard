// 로그인 / 회원가입
(async function () {
  const { db, C, toast, errMsg, esc } = App;
  document.getElementById('org-name').textContent = C.ORG_NAME;
  document.getElementById('site-name').textContent = C.SITE_NAME;
  document.title = `로그인 · ${C.SITE_NAME}`;

  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const sentBox = document.getElementById('sent-box');

  if (!db) {
    sentBox.hidden = false;
    sentBox.innerHTML = '<strong>초기 설정이 필요합니다.</strong><br>js/config.js에 Supabase 주소와 공개 키를 입력하세요.';
    loginForm.querySelector('button').disabled = true;
    signupForm.querySelector('button').disabled = true;
    return;
  }

  // 이미 로그인되어 있으면 대시보드로
  const { data: { session } } = await db.auth.getSession();
  if (session) { location.replace('index.html'); return; }

  // 메일 링크를 누르면 돌아올 주소 (GitHub Pages 하위 경로 자동 계산)
  const redirectTo = new URL('index.html', location.href).href;

  // 탭 전환
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      loginForm.hidden = tab.dataset.tab !== 'login';
      signupForm.hidden = tab.dataset.tab !== 'signup';
      sentBox.hidden = true;
    });
  });

  const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function showSent(email, isSignup) {
    sentBox.hidden = false;
    sentBox.innerHTML = `<strong>${esc(email)}</strong>으로 메일을 보냈습니다.<br>
      메일의 링크를 눌러 ${isSignup ? '이메일 인증을 마쳐 주세요. 이후 최고관리자 승인을 기다리면 됩니다.' : '로그인하세요.'}
      <br><span class="muted small">메일이 보이지 않으면 스팸함을 확인하세요.</span>`;
  }

  async function withBusy(form, fn) {
    const btn = form.querySelector('button[type=submit]');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '보내는 중…';
    try { await fn(); } finally { btn.disabled = false; btn.textContent = label; }
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginForm.email.value.trim();
    if (!validEmail(email)) { toast('이메일 형식을 확인하세요.', 'error'); return; }
    withBusy(loginForm, async () => {
      const { error } = await db.auth.signInWithOtp({
        email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
      });
      if (error) {
        if (/signups not allowed|not found/i.test(error.message)) toast('가입되지 않은 이메일입니다. 회원가입을 먼저 해 주세요.', 'error');
        else toast(errMsg(error), 'error');
        return;
      }
      showSent(email, false);
    });
  });

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fullName = signupForm.full_name.value.trim();
    const email = signupForm.email.value.trim();
    if (fullName.length < 2) { toast('실명을 입력하세요.', 'error'); return; }
    if (!validEmail(email)) { toast('이메일 형식을 확인하세요.', 'error'); return; }
    withBusy(signupForm, async () => {
      const { error } = await db.auth.signInWithOtp({
        email, options: { shouldCreateUser: true, data: { full_name: fullName }, emailRedirectTo: redirectTo },
      });
      if (error) { toast(errMsg(error), 'error'); return; }
      showSent(email, true);
    });
  });
})();
