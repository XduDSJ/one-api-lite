import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, isAdmin, copy, timestamp2string } from '../helpers';
import Pagination from './Pagination';
import { renderQuota, renderNumber } from '../helpers/render';
import { ITEMS_PER_PAGE } from '../constants';

const LogsTable = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [showStat, setShowStat] = useState(false);
  const [stat, setStat] = useState({ quota: 0, token: 0 });
  const [logType, setLogType] = useState(0);
  const admin = isAdmin();
  const [inputs, setInputs] = useState({ token_name: '', model_name: '', start_timestamp: '', end_timestamp: '', channel: '' });

  useEffect(() => { loadLogs(); }, []);

  const loadLogs = async (page = 0) => {
    setLoading(true);
    try {
      let url = `/api/log/self/?p=${page}&type=${logType}`;
      if (admin) url = `/api/log/?p=${page}&type=${logType}`;
      if (inputs.token_name) url += `&token_name=${inputs.token_name}`;
      if (inputs.model_name) url += `&model_name=${inputs.model_name}`;
      const res = await API.get(url);
      if (res.data.success) {
        setLogs(res.data.data.items || res.data.data);
        if (res.data.data?.stat) { setStat(res.data.data.stat); setShowStat(true); }
      }
    } catch (e) { showError(e); }
    setLoading(false);
  };

  const totalPages = Math.ceil(logs.length / ITEMS_PER_PAGE) || 1;
  const pageLogs = logs.slice((activePage - 1) * ITEMS_PER_PAGE, activePage * ITEMS_PER_PAGE);

  const typeLabel = (type) => {
    const map = { 1: { text: '测试', badge: 'gray' }, 2: { text: '充值', badge: 'gold' }, 3: { text: '消费', badge: 'cyan' }, 4: { text: '管理', badge: 'purple' }, 5: { text: '系统', badge: 'red' } };
    return map[type] || { text: '其他', badge: 'gray' };
  };

  const inputStyle = { height: 36, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#FFFFFF', fontSize: 13, padding: '0 12px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar */}
      <div className='aurora-toolbar'>
        <div className='aurora-toolbar-left' style={{ gap: 8, flexWrap: 'wrap' }}>
          <select value={logType} onChange={(e) => { setLogType(parseInt(e.target.value)); loadLogs(); }} style={{ ...inputStyle, width: 120 }}>
            <option value={0}>全部类型</option>
            <option value={2}>充值</option>
            <option value={3}>消费</option>
            <option value={4}>管理</option>
            <option value={5}>系统</option>
            <option value={1}>测试</option>
          </select>
          <input placeholder='令牌名称' value={inputs.token_name} onChange={(e) => setInputs({ ...inputs, token_name: e.target.value })} style={{ ...inputStyle, width: 140 }} />
          <input placeholder='模型名称' value={inputs.model_name} onChange={(e) => setInputs({ ...inputs, model_name: e.target.value })} style={{ ...inputStyle, width: 140 }} />
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => loadLogs()}>查询</button>
        </div>
      </div>

      {/* Status bar */}
      <div className='aurora-status-bar'>
        <span>总消费额度: {showStat ? renderQuota(stat.quota, t) : '—'}</span>
        <span>共 {logs.length} 条日志</span>
      </div>

      {/* Table */}
      <div className='aurora-table'>
        <div className='aurora-table-header'>
          <span style={{ width: 60 }}>时间</span>
          <span style={{ width: 80 }}>类型</span>
          <span style={{ width: 120 }}>令牌</span>
          <span style={{ width: 150 }}>模型</span>
          {admin && <span style={{ width: 60 }}>渠道</span>}
          <span style={{ width: 80 }}>耗时</span>
          <span style={{ width: 100 }}>额度</span>
          <span style={{ flex: 1, textAlign: 'right' }}>详情</span>
        </div>
        {pageLogs.map((log, idx) => {
          const tp = typeLabel(log.type);
          return (
            <div className='aurora-table-row' key={idx}>
              <span style={{ width: 60, color: '#A1A1AA', fontSize: 11 }}>{timestamp2string(log.created_at, true)}</span>
              <span style={{ width: 80 }}><span className={`aurora-badge aurora-badge-${tp.badge}`}>{tp.text}</span></span>
              <span style={{ width: 120, color: '#D1D5DB', fontSize: 12 }}>{log.token_name || '—'}</span>
              <span style={{ width: 150, color: '#D1D5DB', fontSize: 12 }}>{log.model_name || '—'}</span>
              {admin && <span style={{ width: 60, color: '#6B7280' }}>{log.channel_id || '—'}</span>}
              <span style={{ width: 80, color: '#A1A1AA' }}>{log.use_time ? `${log.use_time}s` : '—'}</span>
              <span style={{ width: 100, color: '#D1D5DB' }}>{renderQuota(log.quota, t)}</span>
              <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <span onClick={() => copy(JSON.stringify(log, null, 2))} style={{ fontSize: 12, color: '#9CA3AF', cursor: 'pointer' }}>复制</span>
              </span>
            </div>
          );
        })}
        {pageLogs.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#71717A' }}>暂无日志</div>}
      </div>

      {/* Pagination */}
      <Pagination activePage={activePage} totalPages={totalPages} total={logs.length} onPageChange={setActivePage} />
    </div>
  );
};

export default LogsTable;