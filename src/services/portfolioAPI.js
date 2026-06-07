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

// 종목 추가 (같은 계좌 내 동일 종목이면 평단가/수량 업데이트)
export const addHolding = async (userId, stockCode, stockName, shares, avgPrice, accountId = null) => {
  let query = supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .eq('stock_code', stockCode);

  if (accountId) {
    query = query.eq('account_id', accountId);
  } else {
    query = query.is('account_id', null);
  }

  const { data: existing } = await query.single();

  if (existing) {
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

  const record = { user_id: userId, stock_code: stockCode, stock_name: stockName, shares, avg_price: avgPrice };
  if (accountId) record.account_id = accountId;

  const { data, error } = await supabase
    .from('portfolios')
    .insert(record)
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

// ── 계좌 CRUD ──────────────────────────────────────────────────────

export const getAccounts = async (userId) => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
};

export const createAccount = async (userId, brokerage, alias, color) => {
  const { data, error } = await supabase
    .from('accounts')
    .insert({ user_id: userId, brokerage, alias, color })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteAccount = async (id) => {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
};

export const updateAccount = async (id, brokerage, alias, color) => {
  const { data, error } = await supabase
    .from('accounts')
    .update({ brokerage, alias, color })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};
