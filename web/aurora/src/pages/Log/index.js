import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { renderQuota } from '../../helpers/render';

const ITEMS_PER_PAGE = 20;

// 日志类型映射
const logTypeMap = {
  1: { label: '充值', color: '#F5A623' },
  2: { label: '消费', color: '#2DD4BF' },
  3: { label: '管理', color: '#9CA3AF' },
  4: { label: '系统', color: '#A78BFA' },
  5: { label: '错误', color: '#EF4444' },
};

const LogPage = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searching, setSearching] = useState(false);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;
  const isAdmin = true; // 管理员日志页

  const loadLogs = async (page) => {
    setLoading(true);
    try {
      const url = isAdmin
        ? `/api/log/?p=${page - 1}&per_page=${ITEMS_PER_PAGE}${typeFilter ? `&type=${typeFilter}` : ''}`
        : `/api/log/self/?p=${page - 1}&per_page=${ITEMS_PER_PAGE}${typeFilter ? `&type=${typeFilter}` : ''}`;
      const res = await API.get(url);
      if (res.data.success) {
        setLogs(res.data.data || []);
        setTotal(res.data.total || (res.data.data ? res.data.data.length : 0));
      }
    } catch (e) {
      showError(e);
    }
    setLoading(false);
  };

  const searchLogs = async () => {
    if (!searchKeyword) { loadLogs(1); return; }
    setSearching(true);
    try {
      const url = isAdmin
        ? `/api/log/search?keyword=${searchKeyword}`
        : `/api/log/self/search?keyword=${searchKeyword}`;
      const res = await API.get(url);
      if (res.data.success) {
        setLogs(res.data.data || []);
        setTotal(res.data.data ? res.data.data.length : 0);
        setActivePage(1);
      }
    } catch (e) {
      showError(e);
    }
    setSearching(false);
  };

  const deleteLogs = async () => {
    if (!window.confirm('确认清空所有日志？此操作不可恢复。')) return;
    const res = await API.delete('/api/log/');
    if (res.data.success) {
      showSuccess('已清空日志');
      loadLogs(1);
    } else showError(res.data.message);
  };

  useEffect(() => {
    loadLogs(1);
  }, [typeFilter]);

  const inputStyle = { height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#FFFFFF', fontSize: 13, padding: '0 12px', outline: 'none' };
  const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'none', minWidth: 100 };

  // 格式化时间
  const fmtTime = (ts) => {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  // 格式化额度
  const fmtQuota = (quota) => {
    if (!quota) return '$0.00';
    return '$' + (quota / 500000).toFixed(2);
  };

  // 格式化详情
  const fmtDetail = (log) => {
    if (log.type === 5) return log.content || '错误';
    if (log.completion_tokens > 0) return `补全 ${log.completion_tokens} tokens`;
    if (log.prompt_tokens > 0) return `输入 ${log.prompt_tokens} tokens`;
    return log.content || '—';
  };

  if (loading && logs.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>加载中…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, padding: '0 20px', background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
        {/* 筛选组 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            className='aurora-input'
            style={{ maxWidth: 280, ...inputStyle }}
            placeholder='搜索日志…'
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') searchLogs(); }}
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value=''>全部类型</option>
            {Object.entries(logTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {/* 操作组 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={deleteLogs} style={{ height: 36, padding: '0 16px', background: 'rgba(239,68,68,0.12)', border: 'none', borderRadius: 8, color: '#EF4444', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>清空日志</button>
          <button onClick={() => loadLogs(activePage)} style={{ height: 36, padding: '0 16px', background: 'linear-gradient(135deg, #B86F05, #945200)', border: 'none', borderRadius: 8, color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>刷新</button>
        </div>
      </div>

      {/* 表格 */}
      <div className='aurora-table'>
        <div className='aurora-table-header'>
          <span style={{ width: 40 }}>ID</span>
          <span style={{ width: 180 }}>时间</span>
          <span style={{ width: 140 }}>用户</span>
          <span style={{ width: 140 }}>渠道</span>
          <span style={{ width: 200 }}>模型</span>
          <span style={{ width: 100 }}>类型</span>
          <span style={{ width: 120 }}>额度</span>
          <span style={{ width: 100 }}>状态</span>
          <span style={{ width: 280 }}>详情</span>
        </div>
        {logs.map((log) => {
          const typeInfo = logTypeMap[log.type] || { label: '未知', color: '#71717A' };
          const isSuccess = log.type !== 5;
          return (
            <div className='aurora-table-row' key={log.id}>
              <span style={{ width: 40, color: '#6B7280' }}>{log.id}</span>
              <span style={{ width: 180, color: '#FFFFFF', fontWeight: 500, fontSize: 13 }}>{fmtTime(log.created_at)}</span>
              <span style={{ width: 140, color: '#D1D5DB', fontSize: 12 }}>{log.username || '—'}</span>
              <span style={{ width: 140, color: '#9CA3AF', fontSize: 12 }}>{log.channel_id ? `#${log.channel_id}` : '—'}</span>
              <span style={{ width: 200, color: '#D1D5DB', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.model_name || '—'}</span>
              <span style={{ width: 100, color: typeInfo.color, fontSize: 13, fontWeight: 700 }}>{typeInfo.label}</span>
              <span style={{ width: 120, color: log.type === 1 ? '#F5A623' : '#D1D5DB', fontSize: 13 }}>{fmtQuota(log.quota)}</span>
              <span style={{ width: 100 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: isSuccess ? '#2DD4BF' : '#EF4444', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: isSuccess ? '#2DD4BF' : '#EF4444' }}>{isSuccess ? '成功' : '失败'}</span>
                </span>
              </span>
              <span style={{ width: 280, color: isSuccess ? '#2DD4BF' : '#EF4444', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtDetail(log)}</span>
            </div>
          );
        })}
        {logs.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>暂无日志</div>}
      </div>

      {/* 分页 */}
      <div className='aurora-pagination'>
        <span className='aurora-pagi-info'>共 {total} 条 · 第 {activePage} / {totalPages} 页</span>
        <div className='aurora-pagi-btns'>
          <button className='aurora-pagi-btn' onClick={() => { setActivePage(activePage - 1); loadLogs(activePage - 1); }} disabled={activePage <= 1}>‹</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
            <button key={p} className={`aurora-pagi-btn ${activePage === p ? 'active' : ''}`} onClick={() => { setActivePage(p); loadLogs(p); }}>{p}</button>
          ))}
          <button className='aurora-pagi-btn' onClick={() => { setActivePage(activePage + 1); loadLogs(activePage + 1); }} disabled={activePage >= totalPages}>›</button>
        </div>
      </div>
    </div>
  );
};

export default LogPage;