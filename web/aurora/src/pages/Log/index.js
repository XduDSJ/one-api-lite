import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { renderQuota } from '../../helpers/render';
import { showConfirm } from '../../components/ConfirmModal';

const ITEMS_PER_PAGE = 20;

// 日志类型映射 — 对齐后端 model/log.go 的 LogType 常量
// 0=Unknown 1=Topup(充值) 2=Consume(消费) 3=Manage(管理) 4=System(系统) 5=Test(测试) 6=Error(错误)
const logTypeMap = {
  1: { label: '充值', color: '#F5A623' },
  2: { label: '消费', color: '#2DD4BF' },
  3: { label: '管理', color: '#9CA3AF' },
  4: { label: '系统', color: '#A78BFA' },
  5: { label: '测试', color: '#60A5FA' },
  6: { label: '错误', color: '#EF4444' },
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
    const ok = await showConfirm('清空日志', '确认清空所有日志？此操作不可恢复。');
    if (!ok) return;
    const targetTs = Math.floor(Date.now() / 1000);
    const res = await API.delete(`/api/log/?target_timestamp=${targetTs}`);
    if (res.data.success) {
      showSuccess(`已清空 ${res.data.data || 0} 条日志`);
      loadLogs(1);
    } else showError(res.data.message);
  };

  const deleteOldLogs = async () => {
    const ok = await showConfirm('清理30天前日志', '确认删除30天前的日志？此操作不可恢复。');
    if (!ok) return;
    const targetTs = Math.floor(Date.now() / 1000) - 30 * 86400;
    const res = await API.delete(`/api/log/?target_timestamp=${targetTs}`);
    if (res.data.success) {
      showSuccess(`已清理 ${res.data.data || 0} 条30天前日志`);
      loadLogs(activePage);
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
    if (log.type === 6) return log.content || '错误';
    if (log.type === 5) return log.content || '测试';
    if (log.type === 1) return log.content || '充值';
    if (log.type === 3) return log.content || '管理操作';
    if (log.type === 4) return log.content || '系统';
    // 消费日志 — 流式/耗时 + request_id 后8位
    const parts = [];
    if (log.is_stream) parts.push('流式');
    if (log.elapsed_time > 0) parts.push(`${log.elapsed_time}ms`);
    if (log.request_id && log.request_id.length >= 8) parts.push(`req:${log.request_id.slice(-8)}`);
    if (parts.length > 0) return parts.join(' · ');
    if (log.prompt_tokens > 0 && log.completion_tokens > 0) return `${log.prompt_tokens}+${log.completion_tokens}`;
    return '—';
  };

  // hover 浮层状态
  const [hoverLog, setHoverLog] = useState(null);

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
          <button onClick={deleteOldLogs} style={{ height: 36, padding: '0 16px', background: 'rgba(245,166,35,0.12)', border: 'none', borderRadius: 8, color: '#F5A623', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>清理30天前</button>
          <button onClick={deleteLogs} style={{ height: 36, padding: '0 16px', background: 'rgba(239,68,68,0.12)', border: 'none', borderRadius: 8, color: '#EF4444', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>清空全部</button>
          <button onClick={() => loadLogs(activePage)} style={{ height: 36, padding: '0 16px', background: 'linear-gradient(135deg, #B86F05, #945200)', border: 'none', borderRadius: 8, color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>刷新</button>
        </div>
      </div>

      {/* 表格 */}
      <div className='aurora-table'>
        <div className='aurora-table-header'>
          <span style={{ width: 40 }}>ID</span>
          <span style={{ width: 140 }}>时间</span>
          <span style={{ width: 90 }}>用户</span>
          <span style={{ width: 55 }}>渠道</span>
          <span style={{ width: 50 }}>Key</span>
          <span style={{ width: 150 }}>模型</span>
          <span style={{ width: 90 }}>令牌</span>
          <span style={{ width: 60 }}>类型</span>
          <span style={{ width: 70 }}>输入</span>
          <span style={{ width: 70 }}>输出</span>
          <span style={{ width: 80 }}>额度</span>
          <span style={{ width: 65 }}>状态</span>
          <span style={{ width: 220 }}>详情</span>
        </div>
        {logs.map((log) => {
          const typeInfo = logTypeMap[log.type] || { label: '未知', color: '#71717A' };
          // 测试日志/错误日志：看 content 包含"失败"或"错误"才显示失败
          const isSuccess = (log.type === 5 || log.type === 6) ? !(log.content || '').includes('失败') && !(log.content || '').includes('错误') : true;
          if (log.type === 6) { const isSuccess6 = false; }
          const isErr = log.type === 6;
          const detail = fmtDetail(log);
          return (
            <div className='aurora-table-row' key={log.id}>
              <span style={{ width: 40, color: '#6B7280' }}>{log.id}</span>
              <span style={{ width: 140, color: '#FFFFFF', fontWeight: 500, fontSize: 12 }}>{fmtTime(log.created_at)}</span>
              <span style={{ width: 90, color: '#D1D5DB', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.username || '—'}</span>
              <span style={{ width: 55, color: '#9CA3AF', fontSize: 12 }}>{log.channel ? `#${log.channel}` : '—'}</span>
              <span style={{ width: 50, color: '#9CA3AF', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{log.channel_key_id ? `#${log.channel_key_id}` : '—'}</span>
              <span style={{ width: 150, color: '#D1D5DB', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.model_name || '—'}</span>
              <span style={{ width: 90, color: '#9CA3AF', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.token_name || '—'}</span>
              <span style={{ width: 60, color: typeInfo.color, fontSize: 12, fontWeight: 700 }}>{typeInfo.label}</span>
              <span style={{ width: 70, color: '#9CA3AF', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{log.prompt_tokens || 0}</span>
              <span style={{ width: 70, color: '#9CA3AF', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>{log.completion_tokens || 0}</span>
              <span style={{ width: 80, color: log.type === 1 ? '#F5A623' : '#D1D5DB', fontSize: 13 }}>{fmtQuota(log.quota)}</span>
              <span style={{ width: 65 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: isErr ? '#EF4444' : (isSuccess ? '#2DD4BF' : '#EF4444'), flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: isErr ? '#EF4444' : (isSuccess ? '#2DD4BF' : '#EF4444') }}>{isErr ? '失败' : (isSuccess ? '成功' : '失败')}</span>
                </span>
              </span>
              <span
                style={{ width: 220, color: isErr ? '#EF4444' : '#A1A1AA', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: detail && detail.length > 30 ? 'help' : 'default', position: 'relative' }}
                onMouseEnter={() => setHoverLog({ id: log.id, content: detail, x: 220, y: 0 })}
                onMouseLeave={() => setHoverLog(null)}
              >
                {detail}
              </span>
            </div>
          );
        })}
        {logs.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>暂无日志</div>}
      </div>

      {/* hover 浮层 */}
      {hoverLog && hoverLog.content && hoverLog.content.length > 30 && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          maxWidth: 500,
          maxHeight: 200,
          overflowY: 'auto',
          background: '#18181B',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10,
          padding: '12px 16px',
          fontSize: 12,
          color: '#D1D5DB',
          fontFamily: 'JetBrains Mono, monospace',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          zIndex: 9999,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {hoverLog.content}
        </div>
      )}

      {/* 分页 */}
      <div className='aurora-pagination'>
        <span className='aurora-pagi-info'>共 {total} 条 · 第 {activePage} / {totalPages} 页</span>
        <div className='aurora-pagi-btns'>
          <button className='aurora-pagi-btn' onClick={() => { setActivePage(activePage - 1); loadLogs(activePage - 1); }} disabled={activePage <= 1}>‹</button>
          {(() => {
            // 7个数字位 + 首尾省略号
            // 总页数≤7: 全部显示
            // 总页数>7: 首页+尾页固定,中间显示当前页前后各1页,用...省略
            const pages = [];
            const add = (p) => pages.push({ type: 'page', value: p });
            const addEllipsis = () => pages.push({ type: 'ellipsis' });
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) add(i);
            } else {
              add(1);
              if (activePage > 4) addEllipsis();
              // 当前页前后各1页，但不超过首页/尾页
              const start = Math.max(2, activePage - 1);
              const end = Math.min(totalPages - 1, activePage + 1);
              for (let i = start; i <= end; i++) add(i);
              if (activePage < totalPages - 3) addEllipsis();
              add(totalPages);
            }
            return pages.map((item, idx) => {
              if (item.type === 'ellipsis') {
                return <span key={`e${idx}`} className='aurora-pagi-btn' style={{ border: 'none', background: 'transparent', color: '#71717A', cursor: 'default' }}>…</span>;
              }
              return <button key={item.value} className={`aurora-pagi-btn ${activePage === item.value ? 'active' : ''}`} onClick={() => { setActivePage(item.value); loadLogs(item.value); }}>{item.value}</button>;
            });
          })()}
          <button className='aurora-pagi-btn' onClick={() => { setActivePage(activePage + 1); loadLogs(activePage + 1); }} disabled={activePage >= totalPages}>›</button>
        </div>
      </div>
    </div>
  );
};

export default LogPage;