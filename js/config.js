// =====================================================================
//  사이트 설정 — 이 파일만 고치면 기관에 맞게 바꿀 수 있습니다.
// =====================================================================
window.APP_CONFIG = {
  // Supabase > Project Settings > API 에서 복사해 붙여넣으세요.
  SUPABASE_URL: 'https://aihnbdsxehsozmjlmgoy.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Rm0YS4Rez60VB_IxfjoyHg_Uonu_2ix',

  ORG_NAME: '미래농업팀',
  SITE_NAME: '구매 관리',

  // 반려 처리할 때 쓰는 단계 이름
  REJECT_STEP: '반려',

  // 구매 절차. key 는 DB에 저장되는 값이므로 운영 중에는 바꾸지 마세요.
  // 첫 단계의 key 는 반드시 '신청' 이어야 합니다. (DB 규칙과 연결됨)
  // docs 에 file 이 있으면 다운로드 링크가 생기고, 없으면 '업체 제공' 등으로 표시됩니다.
  STEPS: [
    {
      key: '신청', title: '구매 신청', who: '신청자',
      tasks: ['물품구입 신청서 작성', '품명·규격·수량과 구매 사유 기재', '작성한 신청서를 첨부해 온라인 신청'],
      docs: [{ name: '물품구입 신청서', file: 'forms/01_purchase_request.hwp' }],
    },
    {
      key: '견적', title: '견적 접수', who: '신청자, 구매담당자',
      tasks: ['업체에 견적 요청', '기관 규정에 맞는 비교견적 확보'],
      docs: [{ name: '견적서', from: '업체 제공' }, { name: '비교견적 검토서', file: 'forms/02_quote_comparison.hwp' }],
    },
    {
      key: '품의', title: '구매 품의', who: '구매담당자',
      tasks: ['예산 항목과 잔액 확인', '구매 품의(내부결재) 상신'],
      docs: [{ name: '구매 품의서', file: 'forms/03_purchase_approval.hwp' }],
    },
    {
      key: '발주', title: '계약·발주', who: '구매담당자',
      tasks: ['계약 체결 또는 발주', '납품 기한 확인'],
      docs: [{ name: '계약서 또는 발주서', file: 'forms/04_order.hwp' }],
    },
    {
      key: '검수', title: '납품·검수', who: '신청자, 검수자',
      tasks: ['납품 물품의 수량·규격 확인', '검수조서 작성'],
      docs: [{ name: '거래명세서', from: '업체 제공' }, { name: '검수조서', file: 'forms/05_inspection.hwp' }],
    },
    {
      key: '지출', title: '대금 지급', who: '구매담당자, 회계',
      tasks: ['세금계산서 확인', '지출결의 후 대금 지급'],
      docs: [{ name: '세금계산서', from: '업체 제공' }, { name: '지출결의서', file: 'forms/06_payment.hwp' }],
    },
    {
      key: '완료', title: '완료', who: '구매담당자',
      tasks: ['물품 대장 등재(해당 시)', '관련 서류 보관'],
      docs: [],
    },
  ],

  // 예산 내역 계산 기준
  EXECUTED_STEPS: ['지출', '완료'],          // 집행액으로 계산
  COMMITTED_STEPS: ['품의', '발주', '검수'],  // 집행 예정액으로 계산
};
