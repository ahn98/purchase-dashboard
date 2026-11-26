// 예산 내역 (관리자: 읽기 / 최고관리자: 읽기·수정)
(async function () {
  const me = await App.guard(['admin', 'superadmin'], 'budget');
  if (!me) return;
  const { db, C, esc, won, num, fmtDate, stepBadge, toast, errMsg, openModal, confirmModal } = App;
  const main = document.getElementById('app');
  const isSuper = me.role === 'superadmin';
  const thisYear = new Date().getFullYear();

  let year = thisYear;
  let years = [thisYear];
  let budgets = [];
  let requests = [];

  async function loadYears() {
    const { data } = await db.from('budgets').select('fiscal_year');
    const set = new Set([thisYear, ...(data || []).map((d) => d.fiscal_year)]);
    years = [...set].sort((a, b) => b - a);
  }

  async function load() {
    const { data: b, error } = await db.from('budgets').select('*').eq('fiscal_year', year).order('name');
    if (error) { toast(errMsg(error), 'error'); }
    budgets = b || [];
    const ids = budgets.map((x) => x.id);
    if (ids.length) {
      const { data: r, error: e2 } = await db.from('purchase_requests')
        .select('id, item_name, amount, step, budget_id, created_at, profiles(full_name)')
        .in('budget_id', ids).order('created_at', { ascending: false });
      if (e2) toast(errMsg(e2), 'error');
      requests = r || [];
    } else {
      requests = [];
    }
    render();
  }

  function calc(budget) {
    const list = requests.filter((r) => r.budget_id === budget.id);
    const executed = list.filter((r) => C.EXECUTED_STEPS.includes(r.step)).reduce((a, r) => a + Number(r.amount || 0), 0);
    const committed = list.filter((r) => C.COMMITTED_STEPS.includes(r.step)).reduce((a, r) => a + Number(r.amount || 0), 0);
    const total = Number(budget.total_amount || 0);
    return { list, total, executed, committed, remain: total - executed - committed };
  }

  function bar(c) {
    const p = (v) => (c.total ? Math.min(100, (v / c.total) * 100) : 0);
    const rate = c.total ? ((c.executed + c.committed) / c.total) * 100 : 0;
    return `<div class="bar-cell">
      <div class="meter small-meter" role="img" aria-label="집행 ${p(c.executed).toFixed(1)}%, 집행 예정 ${p(c.committed).toFixed(1)}%">
        <span class="meter-exec" style="width:${p(c.executed)}%"></span>
        <span class="meter-commit" style="width:${p(c.committed)}%"></span>
      </div>
      <span class="rate ${rate > 100 ? 'neg' : ''}">${rate.toFixed(1)}%</span>
    </div>`;
  }

  function render() {
    const rows = budgets.map((b) => ({ b, c: calc(b) }));
    const sum = rows.reduce((a, { c }) => ({
      total: a.total + c.total, executed: a.executed + c.executed,
      committed: a.committed + c.committed, remain: a.remain + c.remain,
    }), { total: 0, executed: 0, committed: 0, remain: 0 });

    main.innerHTML = `
      <section class="page-head">
        <div>
          <h1>예산 내역</h1>
          <p class="muted">집행액은 ${esc(C.EXECUTED_STEPS.join(', '))} 단계, 집행 예정은 ${esc(C.COMMITTED_STEPS.join(', '))} 단계에 있는 신청 금액의 합계입니다.</p>
        </div>
        <div class="head-actions">
          <label class="field inline"><span>회계연도</span>
            <select id="year-sel">${years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`).join('')}</select>
          </label>
          ${isSuper ? '<button type="button" class="btn btn-primary" id="add-btn">예산 항목 추가</button>' : ''}
        </div>
      </section>

      <section class="summary" aria-label="${year}년 예산 요약">
        <div class="sum-item"><span class="sum-label">편성액</span><span class="sum-value money">${won(sum.total)}</span></div>
        <div class="sum-item"><span class="sum-label"><i class="dot dot-exec"></i>집행액</span><span class="sum-value money">${won(sum.executed)}</span></div>
        <div class="sum-item"><span class="sum-label"><i class="dot dot-commit"></i>집행 예정</span><span class="sum-value money">${won(sum.committed)}</span></div>
        <div class="sum-item"><span class="sum-label">잔액</span><span class="sum-value money ${sum.remain < 0 ? 'neg' : ''}">${won(sum.remain)}</span></div>
      </section>

      ${rows.length ? `
      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>예산 항목</th><th class="right">편성액</th><th class="right">집행액</th><th class="right">집행 예정</th>
            <th class="right">잔액</th><th>집행률</th><th class="right">연결 신청</th>${isSuper ? '<th></th>' : ''}
          </tr></thead>
          <tbody>
            ${rows.map(({ b, c }) => `
              <tr>
                <td><strong>${esc(b.name)}</strong>${b.note ? `<br><span class="muted small">${esc(b.note)}</span>` : ''}</td>
                <td class="right">${won(c.total)}</td>
                <td class="right">${won(c.executed)}</td>
                <td class="right">${won(c.committed)}</td>
                <td class="right ${c.remain < 0 ? 'neg' : ''}">${won(c.remain)}</td>
                <td>${bar(c)}</td>
                <td class="right"><button type="button" class="link-btn" data-list="${b.id}">${num(c.list.length)}건</button></td>
                ${isSuper ? `<td class="actions">
                  <button type="button" class="btn btn-ghost btn-sm" data-edit="${b.id}">수정</button>
                  <button type="button" class="btn btn-danger-ghost btn-sm" data-del="${b.id}">삭제</button></td>` : ''}
              </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <th>합계</th><th class="right">${won(sum.total)}</th><th class="right">${won(sum.executed)}</th>
            <th class="right">${won(sum.committed)}</th><th class="right ${sum.remain < 0 ? 'neg' : ''}">${won(sum.remain)}</th>
            <th colspan="${isSuper ? 3 : 2}"></th>
          </tr></tfoot>
        </table>
      </div>` : `
      <div class="empty">
        <p>${year}년 예산 항목이 없습니다.${isSuper ? ' 예산 항목을 추가하면 신청 건에 연결할 수 있습니다.' : ' 최고관리자가 예산을 등록하면 여기에 표시됩니다.'}</p>
        ${isSuper ? '<button type="button" class="btn btn-primary" data-add>예산 항목 추가</button>' : ''}
      </div>`}`;
    bind();
  }

  function budgetForm(b = {}) {
    return `
      <form id="budget-form" class="stack" novalidate>
        <div class="form-grid">
          <label class="field"><span>회계연도 <em>*</em></span>
            <input name="fiscal_year" type="number" min="2000" max="2100" required value="${esc(b.fiscal_year ?? year)}"></label>
          <label class="field"><span>편성액(원) <em>*</em></span>
            <input name="total_amount" type="number" min="0" step="1" required value="${esc(b.total_amount ?? '')}"></label>
          <label class="field span-2"><span>예산 항목명 <em>*</em></span>
            <input name="name" required maxlength="100" value="${esc(b.name)}" placeholder="예: 사무용품비"></label>
          <label class="field span-2"><span>비고</span>
            <input name="note" maxlength="200" value="${esc(b.note)}"></label>
        </div>
      </form>`;
  }

  function openBudgetModal(b) {
    const m = openModal({
      title: b ? '예산 항목 수정' : '예산 항목 추가',
      body: budgetForm(b),
      footer: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="save-budget">${b ? '변경 내용 저장' : '예산 항목 추가'}</button>`,
    });
    const form = m.el.querySelector('#budget-form');
    m.el.querySelector('#save-budget').addEventListener('click', async () => {
      const v = (n) => form.querySelector(`[name=${n}]`).value.trim();
      const data = {
        fiscal_year: parseInt(v('fiscal_year'), 10),
        total_amount: parseInt(v('total_amount'), 10),
        name: v('name'),
        note: v('note') || null,
      };
      if (!data.name) { toast('예산 항목명을 입력하세요.', 'error'); return; }
      if (!(data.fiscal_year >= 2000)) { toast('회계연도를 확인하세요.', 'error'); return; }
      if (!(data.total_amount >= 0)) { toast('편성액을 입력하세요.', 'error'); return; }
      const q = b ? db.from('budgets').update(data).eq('id', b.id) : db.from('budgets').insert(data);
      const { error } = await q;
      if (error) { toast(errMsg(error), 'error'); return; }
      m.close();
      toast(b ? '변경 내용을 저장했습니다.' : '예산 항목을 추가했습니다.', 'success');
      year = data.fiscal_year;
      await loadYears(); await load();
    });
  }

  function openLinked(b) {
    const { list } = calc(b);
    openModal({
      title: `${b.name} · 연결된 신청`,
      wide: true,
      body: list.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>번호</th><th>신청일</th><th>신청자</th><th>품명</th><th class="right">금액</th><th>진행단계</th></tr></thead>
          <tbody>${list.map((r) => `<tr>
            <td><a href="requests.html?id=${r.id}">${r.id}</a></td><td>${fmtDate(r.created_at)}</td>
            <td>${esc(r.profiles?.full_name || '')}</td><td>${esc(r.item_name)}</td>
            <td class="right">${won(r.amount)}</td><td>${stepBadge(r.step)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="muted">이 예산 항목에 연결된 신청이 없습니다.</p>',
      footer: '<button class="btn btn-ghost" data-close>닫기</button>',
    });
  }

  function bind() {
    document.getElementById('year-sel').addEventListener('change', (e) => { year = Number(e.target.value); load(); });
    main.querySelectorAll('#add-btn, [data-add]').forEach((btn) => btn.addEventListener('click', () => openBudgetModal(null)));
    main.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
      openBudgetModal(budgets.find((x) => x.id === Number(btn.dataset.edit)));
    }));
    main.querySelectorAll('[data-list]').forEach((btn) => btn.addEventListener('click', () => {
      openLinked(budgets.find((x) => x.id === Number(btn.dataset.list)));
    }));
    main.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
      const b = budgets.find((x) => x.id === Number(btn.dataset.del));
      if (!(await confirmModal(`'${b.name}' 예산 항목을 삭제할까요? 연결된 신청 건은 '미배정'이 됩니다.`, '삭제', true))) return;
      const { error } = await db.from('budgets').delete().eq('id', b.id);
      if (error) { toast(errMsg(error), 'error'); return; }
      toast('예산 항목을 삭제했습니다.', 'success');
      await loadYears(); await load();
    }));
  }

  main.innerHTML = '<p class="loading">불러오는 중…</p>';
  await loadYears();
  await load();
})();
