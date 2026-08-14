import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../helpers';
import { renderQuota } from '../helpers/render';

const GroupPermissionModal = ({ open, onClose, group, allGroups, onUpdate }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);

  if (!open || !group) return null;

  const groupOptions = allGroups.map((g) => ({ value: g.name, label: g.name }));

  const moveChannel = async (channel, target) => {
    if (target === group.name) return;
    setLoading(true);
    try {
      const res = await API.get(`/api/channel/${channel.id}`);
      const { success, data } = res.data;
      if (success) {
        data.group = target;
        const putRes = await API.put('/api/channel/', data);
        if (putRes.data.success) { showSuccess(`渠道 ${channel.name} 已移动到 ${target}`); onUpdate(); }
        else showError(putRes.data.message);
      }
    } catch (e) { showError(e); }
    setLoading(false);
  };

  const moveUser = async (user, target) => {
    if (target === group.name) return;
    setLoading(true);
    try {
      const res = await API.get(`/api/user/${user.id}`);
      const { success, data } = res.data;
      if (success) {
        data.group = target;
        const putRes = await API.put('/api/user/', data);
        if (putRes.data.success) { showSuccess(`用户 ${user.username} 已移动到 ${target}`); onUpdate(); }
        else showError(putRes.data.message);
      }
    } catch (e) { showError(e); }
    setLoading(false);
  };

  const tabs = ['渠道', '用户', '模型'];
  const selectStyle = { height: 32, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#FFFFFF', fontSize: 12, padding: '0 8px' };

  return (
    <div className='aurora-modal-overlay' onClick={onClose}>
      <div className='aurora-modal' style={{ width: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className='aurora-modal-header'>
          <span className='aurora-modal-title'>权限配置 — <span style={{ color: '#B86F05' }}>{group.name}</span></span>
          <button className='aurora-modal-close' onClick={onClose}>✕</button>
        </div>
        <div className='aurora-modal-body'>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {tabs.map((label, i) => (
              <button key={i} onClick={() => setTab(i)} style={{
                padding: '8px 16px', background: 'none', border: 'none', borderBottom: tab === i ? '2px solid #B86F05' : '2px solid transparent',
                color: tab === i ? '#FFFFFF' : '#71717A', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>

          {/* Tab: 渠道 */}
          {tab === 0 && (
            <div className='aurora-table' style={{ maxHeight: 300, overflowY: 'auto' }}>
              <div className='aurora-table-header'>
                <span style={{ width: 40 }}>ID</span>
                <span style={{ width: 120 }}>名称</span>
                <span style={{ width: 80 }}>类型</span>
                <span style={{ flex: 1, textAlign: 'right' }}>移动到</span>
              </div>
              {group.channels?.map((ch) => (
                <div className='aurora-table-row' key={ch.id}>
                  <span style={{ width: 40, color: '#6B7280' }}>{ch.id}</span>
                  <span style={{ width: 120, color: '#FFFFFF' }}>{ch.name}</span>
                  <span style={{ width: 80, color: '#A1A1AA' }}>#{ch.type}</span>
                  <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                    <select disabled={loading} onChange={(e) => moveChannel(ch, e.target.value)} value='' style={selectStyle}>
                      <option value=''>选择分组…</option>
                      {groupOptions.filter((g) => g.value !== group.name).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </span>
                </div>
              ))}
              {(!group.channels || group.channels.length === 0) && <div style={{ padding: 24, textAlign: 'center', color: '#71717A' }}>暂无渠道</div>}
            </div>
          )}

          {/* Tab: 用户 */}
          {tab === 1 && (
            <div className='aurora-table' style={{ maxHeight: 300, overflowY: 'auto' }}>
              <div className='aurora-table-header'>
                <span style={{ width: 40 }}>ID</span>
                <span style={{ width: 120 }}>用户名</span>
                <span style={{ width: 100 }}>角色</span>
                <span style={{ flex: 1, textAlign: 'right' }}>移动到</span>
              </div>
              {group.users?.map((u) => (
                <div className='aurora-table-row' key={u.id}>
                  <span style={{ width: 40, color: '#6B7280' }}>{u.id}</span>
                  <span style={{ width: 120, color: '#FFFFFF' }}>{u.username}</span>
                  <span style={{ width: 100 }}><span className={`aurora-badge aurora-badge-${u.role >= 100 ? 'purple' : u.role >= 10 ? 'gold' : 'gray'}`}>{u.role >= 100 ? '超管' : u.role >= 10 ? '管理员' : '用户'}</span></span>
                  <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                    <select disabled={loading || u.role >= 100} onChange={(e) => moveUser(u, e.target.value)} value='' style={selectStyle}>
                      <option value=''>选择分组…</option>
                      {groupOptions.filter((g) => g.value !== group.name).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </span>
                </div>
              ))}
              {(!group.users || group.users.length === 0) && <div style={{ padding: 24, textAlign: 'center', color: '#71717A' }}>暂无用户</div>}
            </div>
          )}

          {/* Tab: 模型 */}
          {tab === 2 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8 }}>
              {group.models?.map((m) => <span key={m} className='aurora-badge aurora-badge-cyan'>{m}</span>)}
              {(!group.models || group.models.length === 0) && <div style={{ padding: 24, textAlign: 'center', color: '#71717A' }}>暂无模型</div>}
            </div>
          )}
        </div>
        <div className='aurora-modal-footer'>
          <span style={{ fontSize: 12, color: '#52525B' }}>移动后需确认关联生效</span>
          <button className='aurora-btn aurora-btn-primary' onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default GroupPermissionModal;