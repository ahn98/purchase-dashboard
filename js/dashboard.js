// 메인 대시보드
(async function () {
  const me = await App.guard(['user', 'admin', 'superadmin'], 'index');
  if (!me) return;
  const { db, C, esc, won, num, fmtDate, fmtDateTime, isAdmin, ROLE_LABEL, STEP_KEYS, toast, errMsg, openModal, confirmModal, docsHtml } = App;
  const main = document.getElementById('app');
  const isSuper = me.role === 'superadmin';
  const year = new Date().getFullYear();

  let requests = [];
  let notice = '';
  let budgets = [];
  let members = [];

  async function load() {
    const jobs = [
      db.from('purchase_requests')
        .select('id, item_name, amount, step, created_at, updated_at, requester_id, budget_id, profiles(full_name)')
        .order('created_at', { ascending: false }),
      db.from('site_settings').select('value').eq('key', 'notice').maybeSingle(),
    ];
    if (isAdmin(me.role)) jobs.push(db.from('budgets').select('id, total_amount').eq('fiscal_year', year));
    else jobs.push(Promise.resolve({ data: [] }));
    if (isSuper) jobs.push(db.from('profiles').select('id, email, full_name, role, created_at').order('created_at', { ascending: false }));
    else jobs.push(Promise.resolve({ data: [] }));

    const [r, n, b, m] = await Promise.all(jobs);
    if (r.error) { toast(errMsg(r.error), 'error'); }
    requests = r.data || [];
    notice = (n.data && n.data.value) || '';
    budgets = b.data || [];
    members = m.data || [];
    render();
  }

  // ---------- 화면 ----------
  function render() {
    const active = requests.filter((x) => x.step !== C.REJECT_STEP && x.step !== STEP_KEYS[STEP_KEYS.length - 1]);
    const done = requests.filter((x) => x.step === STEP_KEYS[STEP_KEYS.length - 1]);
    const rejected = requests.filter((x) => x.step === C.REJECT_STEP);
    const mine = requests.filter((x) => x.requester_id === me.id);
    const mineActive = mine.filter((x) => active.includes(x));
    const pending = members.filter((x) => x.role === 'pending');

    main.innerHTML = `
      <section class="page-head">
        <div>
          <h1>메인 대시보드</h1>
          <p class="muted">구매 절차별로 필요한 작업과 서류, 현재 진행 중인 신청 건을 한눈에 확인합니다.</p>
        </div>
        <a class="btn btn-primary" href="requests.html?new=1">물품 신청하기</a>
      </section>

      <section class="notice" aria-label="공지사항">
        <span class="notice-label">공지</span>
        <p class="notice-text">${notice ? esc(notice).replace(/\n/g, '<br>') : '<span class="muted">등록된 공지가 없습니다.</span>'}</p>
        ${isSuper ? '<button type="button" class="btn btn-ghost btn-sm" id="edit-notice">공지 수정</button>' : ''}
      </section>

      <section class="summary" aria-label="요약">
        <div class="sum-item"><span class="sum-label">진행 중</span><span class="sum-value">${num(active.length)}<small>건</small></span></div>
        <div class="sum-item"><span class="sum-label">완료</span><span class="sum-value">${num(done.length)}<small>건</small></span></div>
        <div class="sum-item"><span class="sum-label">반려</span><span class="sum-value">${num(rejected.length)}<small>건</small></span></div>
        <div class="sum-item sum-mine"><span class="sum-label">내 신청 중 진행 중</span><span class="sum-value">${num(mineActive.length)}<small>건</small></span></div>
        ${isSuper && pending.length ? `<a class="sum-item sum-alert" href="#members"><span class="sum-label">가입 승인 대기</span><span class="sum-value">${num(pending.length)}<small>명</small></span></a>` : ''}
      </section>

      <section class="board-section" aria-labelledby="board-title">
        <div class="section-head">
          <h2 id="board-title">구매 절차 현황</h2>
          <p class="muted small">각 단계에서 할 일과 필요한 서류입니다. 양식 이름을 누르면 내려받습니다.</p>
        </div>
        <div class="board-scroll">
          <ol class="board">${C.STEPS.map((s, i) => stepColumn(s, i, active.concat(done))).join('')}</ol>
        </div>
      </section>

      <div class="dash-grid">
        ${rejected.length ? rejectedPanel(rejected) : ''}
        ${isAdmin(me.role) ? budgetPanel() : ''}
        ${recentPanel()}
      </div>

      ${isSuper ? membersPanel() : ''}
    `;
    bind();
  }

  function stepColumn(s, i, list) {
    const items = list.filter((x) => x.step === s.key);
    const shown = items.slice(0, 4);
    const isLast = i === C.STEPS.length - 1;
    return `
      <li class="step-col ${items.length ? 'has-items' : ''}">
        <div class="step-top">
          <span class="step-seal" aria-hidden="true">${i + 1}</span>
          <div>
            <h3 class="step-title">${esc(s.title)}</h3>
            <p class="step-who">${esc(s.who)}</p>
          </div>
          <a class="step-count" href="requests.html?step=${encodeURIComponent(s.key)}" title="${esc(s.title)} 단계 신청 건 보기">${num(items.length)}</a>
        </div>
        <div class="step-block">
          <h4>할 일</h4>
          <ul class="task-list">${s.tasks.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>
        <div class="step-block">
          <h4>서류</h4>
          ${docsHtml(s.docs)}
        </div>
        <div class="step-items">
          ${shown.length ? shown.map((x) => `
            <a class="req-chip" href="requests.html?id=${x.id}">
              <span class="req-chip-name">${esc(x.item_name)}</span>
              <span class="req-chip-meta">${esc(x.profiles?.full_name || '')} · ${won(x.amount)}</span>
            </a>`).join('') : `<p class="muted small empty-step">${isLast ? '완료된 건이 없습니다.' : '이 단계의 신청 건이 없습니다.'}</p>`}
          ${items.length > shown.length ? `<a class="more-link" href="requests.html?step=${encodeURIComponent(s.key)}">${num(items.length - shown.length)}건 더 보기</a>` : ''}
        </div>
      </li>`;
  }

  function rejectedPanel(list) {
    return `
      <section class="panel panel-reject">
        <h2>반려된 신청</h2>
        <ul class="plain-list">
          ${list.slice(0, 6).map((x) => `
            <li><a href="requests.html?id=${x.id}">${esc(x.item_name)}</a>
            <span class="muted small">${esc(x.profiles?.full_name || '')} · ${fmtDate(x.updated_at)}</span></li>`).join('')}
        </ul>
      </section>`;
  }

  function budgetPanel() {
    const total = budgets.reduce((a, b) => a + Number(b.total_amount || 0), 0);
    const ids = new Set(budgets.map((b) => b.id));
    const linked = requests.filter((x) => ids.has(x.budget_id));
    const executed = linked.filter((x) => C.EXECUTED_STEPS.includes(x.step)).reduce((a, x) => a + Number(x.amount || 0), 0);
    const committed = linked.filter((x) => C.COMMITTED_STEPS.includes(x.step)).reduce((a, x) => a + Number(x.amount || 0), 0);
    const remain = total - executed - committed;
    const pct = (v) => (total ? Math.min(100, (v / total) * 100) : 0);
    return `
      <section class="panel">
        <div class="panel-head"><h2>${year}년 예산</h2><a href="budget.html" class="small">예산 내역 보기</a></div>
        ${budgets.length ? `
          <div class="meter" role="img" aria-label="집행 ${pct(executed).toFixed(1)}%, 집행 예정 ${pct(committed).toFixed(1)}%">
            <span class="meter-exec" style="width:${pct(executed)}%"></span>
            <span class="meter-commit" style="width:${pct(committed)}%"></span>
          </div>
          <dl class="kv">
            <div><dt>편성액</dt><dd>${won(total)}</dd></div>
            <div><dt><i class="dot dot-exec"></i>집행액</dt><dd>${won(executed)}</dd></div>
            <div><dt><i class="dot dot-commit"></i>집행 예정</dt><dd>${won(committed)}</dd></div>
            <div><dt>잔액</dt><dd class="${remain < 0 ? 'neg' : ''}">${won(remain)}</dd></div>
          </dl>` : `<p class="muted">${year}년 예산이 아직 등록되지 않았습니다.</p>`}
      </section>`;
  }

  function recentPanel() {
    const mine = requests.filter((x) => x.requester_id === me.id).slice(0, 6);
    return `
      <section class="panel">
        <div class="panel-head"><h2>내 신청</h2><a href="requests.html?mine=1" class="small">전체 보기</a></div>
        ${mine.length ? `<ul class="plain-list">
          ${mine.map((x) => `<li><a href="requests.html?id=${x.id}">${esc(x.item_name)}</a> ${App.stepBadge(x.step)}
            <span class="muted small">${fmtDate(x.created_at)}</span></li>`).join('')}
        </ul>` : '<p class="muted">아직 신청한 물품이 없습니다. 위의 [물품 신청하기]로 시작하세요.</p>'}
      </section>`;
  }

  function roleSelect(id, current, disabled) {
    const opts = ['user', 'admin', 'superadmin'];
    return `<select data-role-for="${id}" ${disabled ? 'disabled' : ''} aria-label="권한 선택">
      ${opts.map((o) => `<option value="${o}" ${o === current ? 'selected' : ''}>${ROLE_LABEL[o]}</option>`).join('')}
    </select>`;
  }

  function membersPanel() {
    const pending = members.filter((x) => x.role === 'pending');
    const others = members.filter((x) => x.role !== 'pending');
    return `
      <section class="panel members" id="members">
        <h2>회원 관리</h2>
        <h3 class="sub">가입 승인 대기 <span class="muted">${num(pending.length)}명</span></h3>
        ${pending.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>이름</th><th>이메일</th><th>신청일</th><th>부여할 권한</th><th></th></tr></thead>
          <tbody>${pending.map((u) => `
            <tr>
              <td>${esc(u.full_name)}</td><td>${esc(u.email)}</td><td>${fmtDate(u.created_at)}</td>
              <td>${roleSelect(u.id, 'user', false)}</td>
              <td class="actions">
                <button type="button" class="btn btn-primary btn-sm" data-approve="${u.id}">승인</button>
                <button type="button" class="btn btn-ghost btn-sm" data-reject="${u.id}">거절</button>
              </td>
            </tr>`).join('')}
          </tbody></table></div>` : '<p class="muted">승인을 기다리는 가입 신청이 없습니다.</p>'}

        <h3 class="sub">전체 회원 <span class="muted">${num(others.length)}명</span></h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>이름</th><th>이메일</th><th>가입일</th><th>권한</th><th></th></tr></thead>
          <tbody>${others.map((u) => `
            <tr>
              <td>${esc(u.full_name)}${u.id === me.id ? ' <span class="muted small">(나)</span>' : ''}</td>
              <td>${esc(u.email)}</td><td>${fmtDate(u.created_at)}</td>
              <td>${u.role === 'rejected' ? `<span class="role-tag role-rejected">${ROLE_LABEL.rejected}</span>` : roleSelect(u.id, u.role, u.id === me.id)}</td>
              <td class="actions">
                ${u.id === me.id ? '' : u.role === 'rejected'
                  ? `<button type="button" class="btn btn-ghost btn-sm" data-restore="${u.id}">다시 승인 대기로</button>`
                  : `<button type="button" class="btn btn-ghost btn-sm" data-change="${u.id}">권한 변경</button>`}
              </td>
            </tr>`).join('')}
          </tbody></table></div>
      </section>`;
  }

  // ---------- 동작 ----------
  async function setRole(id, role, doneMsg) {
    const { error } = await db.from('profiles').update({ role }).eq('id', id);
    if (error) { toast(errMsg(error), 'error'); return; }
    toast(doneMsg, 'success');
    await load();
  }

  function bind() {
    const editBtn = document.getElementById('edit-notice');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const m = openModal({
          title: '공지 수정',
          body: `<label class="field"><span>공지 내용</span><textarea id="notice-input" rows="5">${esc(notice)}</textarea></label>`,
          footer: '<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="save-notice">공지 저장</button>',
        });
        m.el.querySelector('#save-notice').addEventListener('click', async () => {
          const value = m.el.querySelector('#notice-input').value.trim();
          const { error } = await db.from('site_settings')
            .upsert({ key: 'notice', value, updated_at: new Date().toISOString() });
          if (error) { toast(errMsg(error), 'error'); return; }
          m.close(); toast('공지를 저장했습니다.', 'success'); load();
        });
      });
    }

    main.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.approve;
      const role = main.querySelector(`[data-role-for="${id}"]`).value;
      setRole(id, role, `${ROLE_LABEL[role]} 권한으로 승인했습니다.`);
    }));
    main.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmModal('이 가입 신청을 거절할까요?', '거절', true))) return;
      setRole(b.dataset.reject, 'rejected', '가입 신청을 거절했습니다.');
    }));
    main.querySelectorAll('[data-change]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.change;
      const role = main.querySelector(`[data-role-for="${id}"]`).value;
      setRole(id, role, `권한을 ${ROLE_LABEL[role]}(으)로 변경했습니다.`);
    }));
    main.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', () => {
      setRole(b.dataset.restore, 'pending', '승인 대기 상태로 되돌렸습니다.');
    }));
  }

  await load();
})();
