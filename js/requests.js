// 물품 신청 내역
(async function () {
  const me = await App.guard(['user', 'admin', 'superadmin'], 'requests');
  if (!me) return;
  const {
    db, C, esc, won, num, fmtDate, fmtDateTime, isAdmin, STEP_KEYS, ALL_STEPS,
    stepBadge, stepIndex, stepInfo, docsHtml, toast, errMsg, openModal, confirmModal,
    downloadAttachment, uploadAttachment,
  } = App;
  const main = document.getElementById('app');
  const admin = isAdmin(me.role);
  const isSuper = me.role === 'superadmin';

  const params = new URLSearchParams(location.search);
  const filters = {
    step: params.get('step') || '',
    mine: params.get('mine') === '1',
    q: '',
  };

  let requests = [];
  let budgets = [];

  // ---------- 데이터 ----------
  async function load() {
    const sel = admin
      ? '*, profiles(full_name, email), budgets(name, fiscal_year)'
      : '*, profiles(full_name, email)';
    const [r, b] = await Promise.all([
      db.from('purchase_requests').select(sel).order('id', { ascending: false }),
      admin ? db.from('budgets').select('id, name, fiscal_year').order('fiscal_year', { ascending: false }).order('name')
        : Promise.resolve({ data: [] }),
    ]);
    if (r.error) toast(errMsg(r.error), 'error');
    requests = r.data || [];
    budgets = b.data || [];
  }

  // ---------- 목록 화면 ----------
  function renderShell() {
    main.innerHTML = `
      <section class="page-head">
        <div>
          <h1>물품 신청 내역</h1>
          <p class="muted">${admin ? '신청 건을 눌러 진행단계와 예산 항목을 변경할 수 있습니다.' : '신청 단계에 있는 내 신청 건은 직접 수정할 수 있습니다.'}</p>
        </div>
        <button type="button" class="btn btn-primary" id="new-btn">물품 신청하기</button>
      </section>

      <section class="filters" aria-label="검색 조건">
        <label class="field inline">
          <span>진행단계</span>
          <select id="f-step">
            <option value="">전체</option>
            ${ALL_STEPS.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
        </label>
        <label class="field inline grow">
          <span>검색</span>
          <input type="search" id="f-q" placeholder="품명, 신청자 이름">
        </label>
        <label class="check"><input type="checkbox" id="f-mine"> 내 신청만</label>
      </section>

      <section id="list" aria-live="polite"></section>`;

    const fStep = document.getElementById('f-step');
    const fQ = document.getElementById('f-q');
    const fMine = document.getElementById('f-mine');
    fStep.value = filters.step;
    fMine.checked = filters.mine;
    fStep.addEventListener('change', () => { filters.step = fStep.value; renderList(); syncUrl(); });
    fMine.addEventListener('change', () => { filters.mine = fMine.checked; renderList(); syncUrl(); });
    fQ.addEventListener('input', () => { filters.q = fQ.value.trim().toLowerCase(); renderList(); });
    document.getElementById('new-btn').addEventListener('click', openNewForm);
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (filters.step) p.set('step', filters.step);
    if (filters.mine) p.set('mine', '1');
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function filtered() {
    return requests.filter((r) => {
      if (filters.step && r.step !== filters.step) return false;
      if (filters.mine && r.requester_id !== me.id) return false;
      if (filters.q) {
        const hay = `${r.item_name} ${r.spec || ''} ${r.profiles?.full_name || ''}`.toLowerCase();
        if (!hay.includes(filters.q)) return false;
      }
      return true;
    });
  }

  function progressDots(step) {
    if (step === C.REJECT_STEP) return '<span class="progress-dots rejected" aria-hidden="true"></span>';
    const idx = stepIndex(step);
    return `<span class="progress-dots" aria-hidden="true">${STEP_KEYS.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function renderList() {
    const list = filtered();
    const total = list.reduce((a, r) => a + Number(r.amount || 0), 0);
    const box = document.getElementById('list');
    if (!list.length) {
      box.innerHTML = `<div class="empty">
        <p>${requests.length ? '조건에 맞는 신청 건이 없습니다. 검색 조건을 바꿔 보세요.' : '아직 등록된 신청이 없습니다.'}</p>
        ${requests.length ? '' : '<button type="button" class="btn btn-primary" data-new>첫 물품 신청하기</button>'}
      </div>`;
      const nb = box.querySelector('[data-new]');
      if (nb) nb.addEventListener('click', openNewForm);
      return;
    }
    box.innerHTML = `
      <p class="list-meta">${num(list.length)}건 · 합계 ${won(total)}</p>
      <div class="table-wrap">
        <table class="table table-click">
          <thead><tr>
            <th class="num-col">번호</th><th>신청일</th><th>신청자</th><th>품명</th>
            <th class="right">수량</th><th class="right">금액</th>
            ${admin ? '<th>예산 항목</th>' : ''}
            <th>진행단계</th><th>첨부</th>
          </tr></thead>
          <tbody>
            ${list.map((r) => `
              <tr data-id="${r.id}" tabindex="0" class="${r.requester_id === me.id ? 'is-mine' : ''}">
                <td class="num-col">${r.id}</td>
                <td>${fmtDate(r.created_at)}</td>
                <td>${esc(r.profiles?.full_name || '')}</td>
                <td><strong>${esc(r.item_name)}</strong>${r.spec ? `<br><span class="muted small">${esc(r.spec)}</span>` : ''}</td>
                <td class="right">${num(r.quantity)}</td>
                <td class="right">${won(r.amount)}</td>
                ${admin ? `<td>${r.budgets ? esc(`${r.budgets.fiscal_year} ${r.budgets.name}`) : '<span class="muted small">미배정</span>'}</td>` : ''}
                <td><div class="step-cell">${stepBadge(r.step)}${progressDots(r.step)}</div></td>
                <td>${r.file_path ? '<span class="clip" title="첨부 있음">첨부</span>' : '<span class="muted small">-</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    box.querySelectorAll('tr[data-id]').forEach((tr) => {
      const open = () => openDetail(Number(tr.dataset.id));
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  // ---------- 공통 입력 필드 ----------
  function budgetOptions(selected) {
    return `<option value="">미배정</option>` + budgets.map((b) => (
      `<option value="${b.id}" ${Number(selected) === b.id ? 'selected' : ''}>${esc(`${b.fiscal_year} ${b.name}`)}</option>`
    )).join('');
  }

  function itemFields(r = {}, editable = true) {
    const dis = editable ? '' : 'disabled';
    return `
      <div class="form-grid">
        <label class="field span-2"><span>품명 <em>*</em></span>
          <input name="item_name" required maxlength="100" value="${esc(r.item_name)}" ${dis}></label>
        <label class="field span-2"><span>규격</span>
          <input name="spec" maxlength="200" value="${esc(r.spec)}" placeholder="모델명, 사양 등" ${dis}></label>
        <label class="field"><span>수량 <em>*</em></span>
          <input name="quantity" type="number" min="1" step="1" required value="${esc(r.quantity ?? 1)}" ${dis}></label>
        <label class="field"><span>단가(원) <em>*</em></span>
          <input name="unit_price" type="number" min="0" step="1" required value="${esc(r.unit_price ?? '')}" ${dis}></label>
        <div class="field span-2"><span>금액</span><output name="amount_out" class="amount-out">${won(r.amount ?? 0)}</output></div>
        <label class="field span-2"><span>구매 사유 <em>*</em></span>
          <textarea name="reason" rows="3" required maxlength="1000" ${dis}>${esc(r.reason)}</textarea></label>
      </div>`;
  }

  function bindAmount(form) {
    const q = form.querySelector('[name=quantity]');
    const p = form.querySelector('[name=unit_price]');
    const out = form.querySelector('[name=amount_out]');
    const calc = () => { out.textContent = won((Number(q.value) || 0) * (Number(p.value) || 0)); };
    q.addEventListener('input', calc);
    p.addEventListener('input', calc);
  }

  function readItem(form) {
    const v = (n) => form.querySelector(`[name=${n}]`).value.trim();
    const data = {
      item_name: v('item_name'),
      spec: v('spec') || null,
      quantity: parseInt(v('quantity'), 10),
      unit_price: parseInt(v('unit_price'), 10),
      reason: v('reason'),
    };
    if (!data.item_name) throw new Error('품명을 입력하세요.');
    if (!(data.quantity >= 1)) throw new Error('수량은 1 이상이어야 합니다.');
    if (!(data.unit_price >= 0)) throw new Error('단가를 입력하세요.');
    if (!data.reason) throw new Error('구매 사유를 입력하세요.');
    data.amount = data.quantity * data.unit_price;
    return data;
  }

  async function busy(btn, fn) {
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '처리 중…';
    try { await fn(); } catch (e) { toast(errMsg(e), 'error'); } finally { btn.disabled = false; btn.textContent = label; }
  }

  // ---------- 새 신청 ----------
  function openNewForm() {
    const first = C.STEPS[0];
    const m = openModal({
      title: '물품 신청',
      wide: true,
      body: `
        <form id="new-form" class="stack" novalidate>
          <div class="callout">
            <strong>신청 전에 준비하세요</strong>
            ${docsHtml(first.docs)}
            <p class="small muted">양식을 내려받아 작성한 뒤 아래에 첨부하세요.</p>
          </div>
          ${itemFields()}
          <label class="field"><span>작성한 신청서 첨부</span>
            <input type="file" name="file"></label>
          ${admin ? `<label class="field"><span>예산 항목</span><select name="budget_id">${budgetOptions()}</select></label>` : ''}
        </form>`,
      footer: '<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="submit-new">신청하기</button>',
    });
    const form = m.el.querySelector('#new-form');
    bindAmount(form);
    const btn = m.el.querySelector('#submit-new');
    btn.addEventListener('click', () => busy(btn, async () => {
      const data = readItem(form);
      const file = form.querySelector('[name=file]').files[0];
      if (file && file.size > 20 * 1024 * 1024) throw new Error('첨부파일은 20MB 이하만 올릴 수 있습니다.');
      if (file) Object.assign(data, await uploadAttachment(me.id, file));
      if (admin) {
        const b = form.querySelector('[name=budget_id]').value;
        data.budget_id = b ? Number(b) : null;
      }
      const { error } = await db.from('purchase_requests').insert(data);
      if (error) throw error;
      m.close();
      toast('신청했습니다.', 'success');
      await load(); renderList();
    }));
  }

  // ---------- 상세 / 수정 ----------
  async function openDetail(id) {
    const r = requests.find((x) => x.id === id);
    if (!r) { toast('신청 건을 찾을 수 없습니다.', 'error'); return; }
    const own = r.requester_id === me.id;
    const ownerEditable = own && r.step === STEP_KEYS[0];
    const editable = ownerEditable || admin;
    const info = stepInfo(r.step);
    const idx = stepIndex(r.step);
    const next = idx >= 0 && idx < STEP_KEYS.length - 1 ? C.STEPS[idx + 1] : null;

    const { data: hist } = await db.from('request_history')
      .select('from_step, to_step, changed_at, profiles(full_name)')
      .eq('request_id', id).order('changed_at', { ascending: true });

    const stepper = `
      <ol class="stepper ${r.step === C.REJECT_STEP ? 'is-rejected' : ''}">
        ${C.STEPS.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}">
          <span class="stepper-mark">${i + 1}</span><span class="stepper-label">${esc(s.title)}</span></li>`).join('')}
      </ol>
      ${r.step === C.REJECT_STEP ? '<p class="reject-note">이 신청은 반려되었습니다. 관리자 메모를 확인하세요.</p>' : ''}`;

    const guide = info && r.step !== STEP_KEYS[STEP_KEYS.length - 1] ? `
      <div class="callout">
        <strong>지금 단계: ${esc(info.title)}</strong> <span class="muted small">담당 ${esc(info.who)}</span>
        <ul class="task-list">${info.tasks.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        ${info.docs.length ? docsHtml(info.docs) : ''}
        ${next ? `<p class="small muted">다음 단계: ${esc(next.title)}</p>` : ''}
      </div>` : '';

    const histHtml = (hist || []).length ? `
      <ol class="timeline">
        ${hist.map((h) => `<li><span class="tl-step">${h.from_step ? `${esc(h.from_step)} → ` : ''}${esc(h.to_step)}</span>
          <span class="muted small">${fmtDateTime(h.changed_at)} · ${esc(h.profiles?.full_name || '시스템')}</span></li>`).join('')}
      </ol>` : '<p class="muted small">기록이 없습니다.</p>';

    const adminBlock = admin ? `
      <fieldset class="admin-box">
        <legend>관리자 처리</legend>
        <div class="form-grid">
          <label class="field"><span>진행단계</span>
            <select name="step">${ALL_STEPS.map((s) => `<option value="${esc(s)}" ${s === r.step ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
          <label class="field"><span>예산 항목</span>
            <select name="budget_id">${budgetOptions(r.budget_id)}</select></label>
          <label class="field span-2"><span>관리자 메모</span>
            <textarea name="admin_memo" rows="2" maxlength="1000" placeholder="반려 사유, 처리 메모 등">${esc(r.admin_memo)}</textarea></label>
        </div>
      </fieldset>` : (r.admin_memo ? `<div class="callout"><strong>관리자 메모</strong><p>${esc(r.admin_memo).replace(/\n/g, '<br>')}</p></div>` : '');

    const canDownload = r.file_path && (own || admin);
    const fileHtml = `
      <div class="field">
        <span>첨부 서류</span>
        <div class="file-row">
          ${r.file_path
            ? (canDownload ? `<button type="button" class="btn btn-ghost btn-sm" id="dl-btn">${esc(r.file_name || '첨부파일')} 내려받기</button>`
              : `<span class="muted small">${esc(r.file_name || '첨부파일')} (본인과 관리자만 열람 가능)</span>`)
            : '<span class="muted small">첨부 없음</span>'}
          ${editable ? '<label class="file-replace">새 파일로 교체 <input type="file" name="file"></label>' : ''}
        </div>
      </div>`;

    const m = openModal({
      title: `신청 #${r.id} · ${r.item_name}`,
      wide: true,
      body: `
        ${stepper}
        <dl class="meta-line">
          <div><dt>신청자</dt><dd>${esc(r.profiles?.full_name || '')}</dd></div>
          <div><dt>신청일</dt><dd>${fmtDate(r.created_at)}</dd></div>
          <div><dt>최종 수정</dt><dd>${fmtDateTime(r.updated_at)}</dd></div>
        </dl>
        ${guide}
        <form id="detail-form" class="stack" novalidate>
          ${!editable && own ? '<p class="small muted">진행이 시작된 신청은 관리자만 수정할 수 있습니다.</p>' : ''}
          ${itemFields(r, editable)}
          ${fileHtml}
          ${adminBlock}
        </form>
        <h3 class="sub">진행 이력</h3>
        ${histHtml}`,
      footer: `
        ${isSuper ? '<button class="btn btn-danger-ghost" id="del-btn">신청 삭제</button><span class="spacer"></span>' : ''}
        <button class="btn btn-ghost" data-close>닫기</button>
        ${editable ? '<button class="btn btn-primary" id="save-btn">변경 내용 저장</button>' : ''}`,
    });

    const form = m.el.querySelector('#detail-form');
    if (editable) bindAmount(form);

    const dl = m.el.querySelector('#dl-btn');
    if (dl) dl.addEventListener('click', () => downloadAttachment(r.file_path, r.file_name));

    const save = m.el.querySelector('#save-btn');
    if (save) save.addEventListener('click', () => busy(save, async () => {
      const data = readItem(form);
      const fileInput = form.querySelector('[name=file]');
      const file = fileInput && fileInput.files[0];
      if (file && file.size > 20 * 1024 * 1024) throw new Error('첨부파일은 20MB 이하만 올릴 수 있습니다.');
      if (file) Object.assign(data, await uploadAttachment(me.id, file));
      if (admin) {
        data.step = form.querySelector('[name=step]').value;
        const b = form.querySelector('[name=budget_id]').value;
        data.budget_id = b ? Number(b) : null;
        data.admin_memo = form.querySelector('[name=admin_memo]').value.trim() || null;
      }
      const { data: updated, error } = await db.from('purchase_requests').update(data).eq('id', r.id).select('id');
      if (error) throw error;
      if (!updated || !updated.length) throw new Error('권한이 없거나 이미 다음 단계로 진행되어 수정할 수 없습니다.');
      m.close();
      toast('변경 내용을 저장했습니다.', 'success');
      await load(); renderList();
    }));

    const del = m.el.querySelector('#del-btn');
    if (del) del.addEventListener('click', async () => {
      if (!(await confirmModal(`신청 #${r.id}을(를) 삭제할까요? 되돌릴 수 없습니다.`, '삭제', true))) return;
      const { error } = await db.from('purchase_requests').delete().eq('id', r.id);
      if (error) { toast(errMsg(error), 'error'); return; }
      if (r.file_path) await db.storage.from('attachments').remove([r.file_path]);
      m.close();
      toast('신청을 삭제했습니다.', 'success');
      await load(); renderList();
    });
  }

  // ---------- 시작 ----------
  renderShell();
  document.getElementById('list').innerHTML = '<p class="loading">불러오는 중…</p>';
  await load();
  renderList();

  const openId = Number(params.get('id'));
  if (openId) { openDetail(openId); syncUrl(); }
  if (params.get('new') === '1') { openNewForm(); syncUrl(); }
})();
