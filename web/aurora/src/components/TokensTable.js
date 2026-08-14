import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { API, showError, showSuccess, copy } from '../helpers';
import { ITEMS_PER_PAGE } from '../constants';
import { renderQuota, renderNumber } from '../helpers/render';

const TokensTable = () => {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => { loadTokens(); }, []);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/token/?p=0');
      if (res.data.success) setTokens(res.data.data);
    } catch (e) { showError(e); }
    setLoading(false);
  };

  const searchTokens = async () => {
    if (!searchKeyword) { loadTokens(); return; }
    setSearching(true);
    try {
      const res = await API.get(`/api/token/search?keyword=${searchKeyword}`);
      if (res.data.success) setTokens(res.data.data);
    } catch (e) { showError(e); }
    setSearching(false);
  };

  const manageToken = async (id, action, idx) => {
    let res;
    if (action === 'delete') {
      res = await API.delete(`/api/token/${id}`);
    } else {
      res = await API.put('/api/token/', { id, status: action === 'enable' ? 1 : 2 });
    }
    if (res.data.success) {
      showSuccess(t('token.messages.operation_success', '操作成功'));
      const newTokens = [...tokens];
      newTokens[idx].status = action === 'enable' ? 1 : action === 'disable' ? 2 : newTokens[idx].status;
      if (action === 'delete') newTokens[idx].deleted = true;
      setTokens(newTokens);
    } else showError(res.data.message);
  };

  const totalPages = Math.ceil(tokens.length / ITEMS_PER_PAGE) || 1;
  const pageTokens = tokens.slice((activePage - 1) * ITEMS_PER_PAGE, activePage * ITEMS_PER_PAGE);
  const enabledCount = tokens.filter((tk) => tk.status === 1).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className='aurora-toolbar'>
        <div className='aurora-toolbar-left'>
          <input className='aurora-input' style={{ maxWidth: 320 }} placeholder={t('token.search', '搜索令牌名称…')} value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') searchTokens(); }} />
        </div>
        <div className='aurora-toolbar-right'>
          <Link to='/token/add' className='aurora-btn aurora-btn-primary aurora-btn-sm'>+ {t('token.buttons.add', '添加令牌')}</Link>
        </div>
      </div>

      <div className='aurora-status-bar'>
        <span>{t('token.status_bar.summary', { total: tokens.length, enabled: enabledCount, defaultValue: `共 ${tokens.length} 个令牌 · ${enabledCount} 个启用` })}</span>
        <span>{t('token.status_bar.tip', { defaultValue: '最后更新: 刚刚' })}</span>
      </div>

      <div className='aurora-table'>
        <div className='aurora-table-header'>
          <span style={{ width: 40 }}>ID</span>
          <span style={{ width: 150 }}>名称</span>
          <span style={{ width: 80 }}>状态</span>
          <span style={{ width: 120 }}>已用额度</span>
          <span style={{ width: 120 }}>剩余额度</span>
          <span style={{ width: 150 }}>创建时间</span>
          <span style={{ width: 150 }}>过期时间</span>
          <span style={{ flex: 1, textAlign: 'right' }}>操作</span>
        </div>
        {pageTokens.map((tk, idx) => {
          if (tk.deleted) return null;
          const statusInfo = tk.status === 1 ? { dot: 'on', label: '启用', color: '#2DD4BF' } : { dot: 'off', label: '禁用', color: '#EF4444' };
          return (
            <div className='aurora-table-row' key={tk.id}>
              <span style={{ width: 40, color: '#6B7280' }}>{tk.id}</span>
              <span style={{ width: 150, color: '#FFFFFF', fontWeight: 500 }}>{tk.name || '—'}</span>
              <span style={{ width: 80 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className={`aurora-status-dot aurora-status-dot-${statusInfo.dot}`} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: statusInfo.color }}>{statusInfo.label}</span>
                </span>
              </span>
              <span style={{ width: 120, color: '#D1D5DB' }}>{renderQuota(tk.used_quota, t)}</span>
              <span style={{ width: 120, color: '#D1D5DB' }}>{tk.unlimited_quota ? '无限' : renderQuota(tk.remain_quota, t)}</span>
              <span style={{ width: 150, color: '#A1A1AA', fontSize: 12 }}>{new Date(tk.created_time * 1000).toLocaleString('zh-CN')}</span>
              <span style={{ width: 150, color: '#A1A1AA', fontSize: 12 }}>{tk.expired_time === -1 ? '永不过期' : new Date(tk.expired_time * 1000).toLocaleString('zh-CN')}</span>
              <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <span onClick={() => copy(tk.key)} style={{ fontSize: 12, color: '#2DD4BF', fontWeight: 500, cursor: 'pointer' }}>复制</span>
                <Link to={`/token/edit/${tk.id}`} style={{ fontSize: 12, color: '#B86F05', fontWeight: 500, cursor: 'pointer' }}>编辑</Link>
                <span onClick={() => manageToken(tk.id, tk.status === 1 ? 'disable' : 'enable', idx)} style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, cursor: 'pointer' }}>{tk.status === 1 ? '禁用' : '启用'}</span>
                <span onClick={() => manageToken(tk.id, 'delete', idx)} style={{ fontSize: 12, color: '#EF4444', fontWeight: 500, cursor: 'pointer' }}>删除</span>
              </span>
            </div>
          );
        })}
        {pageTokens.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#71717A' }}>暂无令牌</div>}
      </div>

      <div className='aurora-pagination'>
        <span className='aurora-pagi-info'>第 {activePage} 页 / 共 {totalPages} 页 · {tokens.length} 条</span>
        <div className='aurora-pagi-btns'>
          <button className='aurora-pagi-btn' onClick={() => setActivePage(activePage - 1)} disabled={activePage <= 1}>‹</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
            <button key={p} className={`aurora-pagi-btn ${activePage === p ? 'active' : ''}`} onClick={() => setActivePage(p)}>{p}</button>
          ))}
          <button className='aurora-pagi-btn' onClick={() => setActivePage(activePage + 1)} disabled={activePage >= totalPages}>›</button>
        </div>
      </div>
    </div>
  );
};

export default TokensTable;