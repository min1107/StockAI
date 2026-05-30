import { supabase } from './supabase';

// 보유 종목 조회
export const getHoldings = async (userId) => {
  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

// 종목 추가 (이미 있으면 평단가/수량 업데이트)
export const addHolding = async (userId, stockCode, stockName, shares, avgPrice) => {
  // 동일 종목 있는지 확인
  const { data: existing } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .eq('stock_code', stockCode)
    .single();

  if (existing) {
    // 기존 보유 + 추가 → 평균단가 재계산
    const totalShares = existing.shares + shares;
    const newAvgPrice = Math.round(
      (existing.shares * existing.avg_price + shares * avgPrice) / totalShares
    );
    const { data, error } = await supabase
      .from('portfolios')
      .update({ shares: totalShares, avg_price: newAvgPrice })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // 새 종목 추가
  const { data, error } = await supabase
    .from('portfolios')
    .insert({ user_id: userId, stock_code: stockCode, stock_name: stockName, shares, avg_price: avgPrice })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// 종목 삭제
export const deleteHolding = async (id) => {
  const { error } = await supabase.from('portfolios').delete().eq('id', id);
  if (error) throw error;
};

// 종목 수정
export const updateHolding = async (id, shares, avgPrice) => {
  const { data, error } = await supabase
    .from('portfolios')
    .update({ shares, avg_price: avgPrice })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};
