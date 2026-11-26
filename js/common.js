// =====================================================================
//  공통 기능 (모든 페이지에서 사용)
// =====================================================================
(function () {
  const C = window.APP_CONFIG;
  const configured = !C.SUPABASE_URL.includes('YOUR-PROJECT-ID');
  const db = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

  const ROLE_LABEL = {
    pending: '승인 대기', user: '사용자', admin: '관리자', superadmin: '최고관리자', rejected: '거절됨',
  };
  const isAdmin = (role) => role === 'admin' || role === 'superadmin';
  const STEP_KEYS = C.STEPS.map((s) => s.key);
  const ALL_STEPS = [...STEP_KEYS, C.REJECT_STEP];

  // ---------- 서식 ----------
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  const won = (n) => (n === null || n === undefined || n === '' ? '-' : Number(n).toLocaleString('ko-KR') + '원');
  const num = (n) => Number(n || 0).toLocaleString('ko-KR');
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-');
  const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '-');
  const stepIndex = (step) => STEP_KEYS.indexOf(step);
  const stepInfo = (step) => C.STEPS.find((s) => s.key === step);

  function stepBadge(step) {
    let cls = 'badge';
    if (step === C.REJECT_STEP) cls += ' badge-reject';
    else if (step === STEP_KEYS[STEP_KEYS.length - 1]) cls += ' badge-done';
    else cls += ' badge-step';
    const i = stepIndex(step);
    const prefix = i >= 0 ? `<span class="badge-num">${i + 1}</span>` : '';
    return `<span class="${cls}">${prefix}${esc(step)}</span>`;
  }

  // 서류 목록 HTML
  function docsHtml(docs) {
    if (!docs || !docs.length) return '<span class="muted">해당 없음</span>';
    return '<ul class="doc-list">' + docs.map((d) => (
      d.file
        ? `<li><a class="doc-link" href="${esc(d.file)}" download>${esc(d.name)}</a></li>`
        : `<li><span class="doc-plain">${esc(d.name)}</span> <span class="muted small">${esc(d.from || '')}</span></li>`
    )).join('') + '</ul>';
  }

  // ---------- 알림 ----------
  function toast(msg, type = 'info') {
    let wrap = document.getElementById('toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toast-wrap';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function errMsg(error) {
    if (!error) return '알 수 없는 오류가 발생했습니다.';
    const m = error.message || String(error);
    if (/row-level security|permission denied/i.test(m)) return '권한이 없어 처리할 수 없습니다.';
    if (/rate limit/i.test(m)) return '요청이 너무 잦습니다. 잠시 후 다시 시도하세요.';
    return m;
  }

  // ---------- 모달 ----------
  function openModal({ title, body, footer = '', wide = false }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <h2 id="modal-title">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="닫기">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    const prevFocus = document.activeElement;
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    const first = overlay.querySelector('input, select, textarea, button:not([data-close])');
    (first || overlay.querySelector('[data-close]')).focus();
    return { el: overlay, close };
  }

  function confirmModal(message, okLabel = '확인', danger = false) {
    return new Promise((resolve) => {
      const m = openModal({
        title: '확인',
        body: `<p>${esc(message)}</p>`,
        footer: `<button class="btn btn-ghost" data-close>취소</button>
                 <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okLabel)}</button>`,
      });
      m.el.querySelector('[data-ok]').addEventListener('click', () => { m.close(); resolve(true); });
      m.el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(false)));
    });
  }

  // ---------- 상단 메뉴 ----------
  function renderHeader(me, active) {
    const header = document.getElementById('app-header');
    if (!header) return;
    const links = [
      { id: 'index', href: 'index.html', label: '메인 대시보드', show: true },
      { id: 'requests', href: 'requests.html', label: '물품 신청 내역', show: true },
      { id: 'budget', href: 'budget.html', label: '예산 내역', show: isAdmin(me.role) },
    ];
    header.innerHTML = `
      <div class="header-inner">
        <a class="brand" href="index.html">
          <span class="brand-seal" aria-hidden="true">購</span>
          <span class="brand-text"><span class="brand-org">${esc(C.ORG_NAME)}</span><span class="brand-site">${esc(C.SITE_NAME)}</span></span>
        </a>
        <nav class="nav" aria-label="주 메뉴">
          ${links.filter((l) => l.show).map((l) => `
            <a href="${l.href}" class="${l.id === active ? 'active' : ''}" ${l.id === active ? 'aria-current="page"' : ''}>${l.label}</a>
          `).join('')}
        </nav>
        <div class="me">
          <span class="me-name">${esc(me.full_name)}</span>
          <span class="role-tag role-${esc(me.role)}">${esc(ROLE_LABEL[me.role])}</span>
          <button type="button" class="btn btn-ghost btn-sm" id="logout-btn">로그아웃</button>
        </div>
      </div>`;
    document.getElementById('logout-btn').addEventListener('click', logout);
  }

  async function logout() {
    if (db) await db.auth.signOut();
    location.replace('login.html');
  }

  function showBlocked(title, message) {
    const main = document.getElementById('app');
    document.getElementById('app-header').innerHTML = '';
    main.innerHTML = `
      <section class="blocked">
        <span class="brand-seal big" aria-hidden="true">購</span>
        <h1>${esc(title)}</h1>
        <p>${esc(message)}</p>
        <button type="button" class="btn btn-ghost" id="blocked-logout">로그아웃</button>
      </section>`;
    document.getElementById('blocked-logout').addEventListener('click', logout);
  }

  function showSetupNeeded() {
    document.getElementById('app').innerHTML = `
      <section class="blocked">
        <span class="brand-seal big" aria-hidden="true">購</span>
        <h1>초기 설정이 필요합니다</h1>
        <p>js/config.js 파일에 Supabase 주소(SUPABASE_URL)와 공개 키(SUPABASE_ANON_KEY)를 입력하세요. 자세한 방법은 README.md에 있습니다.</p>
      </section>`;
  }

  // ---------- 접근 권한 확인 ----------
  // allowed: 이 페이지에 들어올 수 있는 권한 목록
  async function guard(allowed, active) {
    if (!db) { showSetupNeeded(); return null; }
    const { data: { session } } = await db.auth.getSession();
    if (!session) { location.replace('login.html'); return null; }

    const { data: me, error } = await db.from('profiles')
      .select('id, email, full_name, role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) { showBlocked('회원 정보를 불러오지 못했습니다', errMsg(error)); return null; }
    if (!me || me.role === 'pending') {
      showBlocked('가입 승인을 기다리는 중입니다', '최고관리자가 가입을 승인하면 이용할 수 있습니다. 승인 후 이 페이지를 새로고침하세요.');
      return null;
    }
    if (me.role === 'rejected') {
      showBlocked('가입이 승인되지 않았습니다', '자세한 내용은 최고관리자에게 문의하세요.');
      return null;
    }
    if (!allowed.includes(me.role)) { location.replace('index.html'); return null; }

    renderHeader(me, active);
    return me;
  }

  // ---------- 첨부파일 ----------
  async function downloadAttachment(path, fileName) {
    const { data, error } = await db.storage.from('attachments')
      .createSignedUrl(path, 60, { download: fileName || true });
    if (error) { toast(errMsg(error), 'error'); return; }
    location.href = data.signedUrl;
  }

  async function uploadAttachment(userId, file) {
    const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await db.storage.from('attachments').upload(path, file, { upsert: false });
    if (error) throw error;
    return { file_path: path, file_name: file.name };
  }

  window.App = {
    C, db, ROLE_LABEL, STEP_KEYS, ALL_STEPS, isAdmin,
    esc, won, num, fmtDate, fmtDateTime, stepIndex, stepInfo, stepBadge, docsHtml,
    toast, errMsg, openModal, confirmModal, guard, logout,
    downloadAttachment, uploadAttachment,
  };
})();
