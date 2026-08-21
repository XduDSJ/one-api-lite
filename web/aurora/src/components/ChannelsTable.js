import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Pagination from './Pagination';
import { API, showError, showSuccess, showInfo, timestamp2string } from '../helpers';
import { CHANNEL_OPTIONS, ITEMS_PER_PAGE } from '../constants';
import ChannelTestModal from './ChannelTestModal';
import { renderGroup, renderNumber } from '../helpers/render';
import ChannelKeyList from './ChannelKeyList';

const typeMap = {};
CHANNEL_OPTIONS.forEach((o) => { typeMap[o.value] = o; });

const typeBadgeColor = (type) => {
  const colors = { 1: 'cyan', 2: 'cyan', 3: 'gold', 8: 'gray', 5: 'cyan', 14: 'purple', 33: 'gold', 42: 'cyan' };
  return colors[type] || 'gray';
};

const ChannelsTable = () => {
  const { t } = useTranslation();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [testChannelData, setTestChannelData] = useState(null);
  const [expandedKey, setExpandedKey] = useState(null);

  useEffect(() => { loadChannels(); }, []);

  const loadChannels = async (page = 0) => {
    setLoading(true);
    try {
      const res = await API.get(`/api/channel/?p=${page}`);
      if (res.data.success && Array.isArray(res.data.data)) {
        const data = res.data.data.map((ch) => ({ ...ch, response_time: ch.response_time || 0 }));
        setChannels(data);
        setActivePage(page + 1);
      }
    } catch (e) { showError(e); }
    setLoading(false);
  };

  const searchChannels = async () => {
    if (!searchKeyword) { loadChannels(0); return; }
    setSearching(true);
    try {
      const res = await API.get(`/api/channel/search?keyword=${searchKeyword}`);
      if (res.data.success) setChannels(res.data.data);
      setActivePage(1);
    } catch (e) { showError(e); }
    setSearching(false);
  };

  const manageChannel = async (id, action, idx) => {
    try {
      if (action === 'delete') {
        const res = await API.delete(`/api/channel/${id}`);
        if (res.data.success) {
          showSuccess('已删除渠道');
          const newCh = [...channels];
          const realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
          newCh[realIdx].deleted = true;
          setChannels(newCh);
        } else showError(res.data.message);
      } else {
        const status = action === 'enable' ? 1 : action === 'disable' ? 2 : 3;
        const res = await API.put('/api/channel/', { id, status });
        if (res.data.success) {
          showSuccess(action === 'enable' ? '已启用' : action === 'disable' ? '已禁用' : '已自动禁用');
          const newCh = [...channels];
          const realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
          newCh[realIdx].status = status;
          setChannels(newCh);
        } else showError(res.data.message);
      }
    } catch (e) { showError(e); }
  };

  const testChannel = async (id, name, idx) => {
    try {
      const res = await API.get(`/api/channel/test/${id}`);
      const { success, message, time, modelName } = res.data;
      if (success) {
        showSuccess(t('channel.messages.test_success', {
          name,
          model: modelName || '',
          time,
          message: message || '',
          defaultValue: `${name} 测试成功，模型 ${modelName || ''}，耗时 ${time}s`,
        }));
        const newCh = [...channels];
        const realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
        newCh[realIdx].response_time = time * 1000;
        setChannels(newCh);
      } else showError(message);
    } catch (e) { showError(e); }
  };

  const testAllChannels = async () => {
    showInfo(`开始测试 ${channels.length} 个渠道…`);
    let success = 0, fail = 0;
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (ch.deleted) continue;
      try {
        const res = await API.get(`/api/channel/test/${ch.id}`);
        if (res.data.success) {
          success++;
          const newCh = [...channels];
          newCh[i].response_time = res.data.time * 1000;
          setChannels(newCh);
        } else { fail++; }
      } catch { fail++; }
    }
    showSuccess(`测试完成：${success} 成功，${fail} 失败`);
  };

  const updateBalance = async (id, name) => {
    try {
      const res = await API.get(`/api/channel/update_balance/${id}`);
      if (res.data.success) {
        showSuccess(t('channel.messages.balance_updated', { name, defaultValue: `${name} 余额已更新` }));
        loadChannels(activePage - 1);
      } else showError(res.data.message);
    } catch (e) { showError(e); }
  };

  const deleteAllDisabled = async () => {
    const res = await API.delete('/api/channel/disabled');
    if (res.data.success) {
      showSuccess(t('channel.messages.deleted_disabled', { defaultValue: `已删除 ${res.data.data} 个禁用渠道` }));
      loadChannels(0);
    } else showError(res.data.message);
  };

  const refresh = () => loadChannels(activePage - 1);

  const totalPages = Math.ceil(channels.length / ITEMS_PER_PAGE) || 1;
  const pageChannels = channels.slice((activePage - 1) * ITEMS_PER_PAGE, activePage * ITEMS_PER_PAGE);
  const enabledCount = channels.filter((c) => c.status === 1).length;
  const disabledCount = channels.filter((c) => c.status !== 1).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toolbar */}
      <div className='aurora-toolbar'>
        <div className='aurora-toolbar-left'>
          <input
            className='aurora-input'
            style={{ maxWidth: 320 }}
            placeholder={t('channel.search', '搜索渠道名称…')}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') searchChannels(); }}
          />
        </div>
        <div className='aurora-toolbar-right'>
          <button className='aurora-btn aurora-btn-ghost aurora-btn-sm' onClick={testAllChannels}>
            {t('channel.buttons.test_all', '测试全部')}
          </button>
          <button className='aurora-btn aurora-btn-danger aurora-btn-sm' onClick={deleteAllDisabled}>
            {t('channel.buttons.delete_disabled', '删除已禁用')}
          </button>
          <button className='aurora-btn aurora-btn-ghost aurora-btn-sm' onClick={refresh}>
            {t('channel.buttons.refresh', '刷新')}
          </button>
          <Link to='/channel/add' className='aurora-btn aurora-btn-primary aurora-btn-sm'>
            + {t('channel.buttons.add', '新增渠道')}
          </Link>
        </div>
      </div>

      {/* Status bar */}
      <div className='aurora-status-bar'>
        <span>{t('channel.status_bar.summary', { total: channels.length, enabled: enabledCount, disabled: disabledCount, defaultValue: `共 ${channels.length} 个渠道 · ${enabledCount} 个启用 · ${disabledCount} 个禁用` })}</span>
        <span>{t('channel.status_bar.auto_refresh', { defaultValue: '余额每 5 分钟自动刷新' })}</span>
      </div>

      {/* Table */}
      <div className='aurora-table'>
        <div className='aurora-table-header'>
          <span style={{ width: 40 }}>ID</span>
          <span style={{ width: 150 }}>名称</span>
          <span style={{ width: 100 }}>类型</span>
          <span style={{ width: 80 }}>分组</span>
          <span style={{ width: 220 }}>支持模型</span>
          <span style={{ width: 70 }}>优先级</span>
          <span style={{ width: 60 }}>权重</span>
          <span style={{ width: 80 }}>状态</span>
          <span style={{ width: 90 }}>响应时间</span>
          <span style={{ width: 90 }}>余额</span>
          <span style={{ width: 160, textAlign: 'right' }}>操作</span>
        </div>
        {pageChannels.map((ch, idx) => {
          if (ch.deleted) return null;
          const badgeColor = typeBadgeColor(ch.type);
          const responseColor = ch.response_time === 0 ? '#52525B' : ch.response_time < 200 ? '#2DD4BF' : ch.response_time < 500 ? '#B86F05' : '#EF4444';
          const statusInfo = ch.status === 1 ? { dot: 'on', label: '启用', color: '#2DD4BF' } : ch.status === 2 ? { dot: 'off', label: '禁用', color: '#EF4444' } : { dot: 'auto', label: '自动禁用', color: '#B86F05' };
          return (
            <div key={ch.id}>
              <div className='aurora-table-row'>
                <span style={{ width: 40, color: '#6B7280' }}>{ch.id}</span>
                <span style={{ width: 150, color: '#FFFFFF', fontWeight: 500 }}>{ch.name || '—'}</span>
                <span style={{ width: 100 }}>
                  <span className={`aurora-badge aurora-badge-${badgeColor}`}>{typeMap[ch.type]?.text || `#${ch.type}`}</span>
                </span>
                <span style={{ width: 80, color: '#9CA3AF', fontSize: 12 }}>{ch.group || 'default'}</span>
                <span style={{ width: 220, color: '#D1D5DB', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {Array.isArray(ch.models) ? (ch.models.length > 2 ? ch.models.slice(0, 2).join(', ') + `  +${ch.models.length - 2}` : ch.models.join(', ')) : (typeof ch.models === 'string' && ch.models ? ch.models.split(',').slice(0, 2).join(', ') : '—')}
                </span>
                <span style={{ width: 70, color: '#F5A623', fontWeight: 700 }}>{ch.priority ?? 0}</span>
                <span style={{ width: 60, color: '#D1D5DB' }}>{ch.weight ?? 0}</span>
                <span style={{ width: 80 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className={`aurora-status-dot aurora-status-dot-${statusInfo.dot}`} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: statusInfo.color }}>{statusInfo.label}</span>
                  </span>
                </span>
                <span style={{ width: 90, color: responseColor, fontWeight: 400 }}>{ch.response_time > 0 ? `${ch.response_time}ms` : '—'}</span>
                <span style={{ width: 90, color: ch.balance ? '#D1D5DB' : '#52525B' }}>{ch.balance ? `$${renderNumber(ch.balance)}` : '—'}</span>
                <span style={{ width: 160, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Link to={`/channel/edit/${ch.id}`} style={{ fontSize: 12, color: '#F5A623', fontWeight: 500, cursor: 'pointer' }}>编辑</Link>
                  <span onClick={() => setTestChannelData(ch)} style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, cursor: 'pointer' }}>测试</span>
                  <span onClick={() => manageChannel(ch.id, ch.status === 1 ? 'disable' : 'enable', idx)} style={{ fontSize: 12, color: ch.status === 1 ? '#F5A623' : '#2DD4BF', fontWeight: 500, cursor: 'pointer' }}>{ch.status === 1 ? '禁用' : '启用'}</span>
                  <span onClick={() => manageChannel(ch.id, 'delete', idx)} style={{ fontSize: 12, color: '#EF4444', fontWeight: 500, cursor: 'pointer' }}>删除</span>
                </span>
              </div>
            </div>
          );
        })}
        {pageChannels.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: '#71717A' }}>暂无渠道数据</div>
        )}
      </div>

      {/* Pagination */}
      <Pagination activePage={activePage} totalPages={totalPages} total={channels.length} onPageChange={setActivePage} />

      {/* 测试弹窗 */}
      {testChannelData && (
        <ChannelTestModal channel={testChannelData} onClose={() => setTestChannelData(null)} />
      )}
    </div>
  );
};

export default ChannelsTable;