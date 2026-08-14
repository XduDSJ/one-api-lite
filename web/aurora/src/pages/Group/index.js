import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants/common.constant';
import GroupPermissionModal from '../../components/GroupPermissionModal';

const Group = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [channels, setChannels] = useState([]);
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');

  const fetchAll = async (url, page = 0, acc = []) => {
    const res = await API.get(`${url}?p=${page}`);
    if (res.data.success) {
      const data = [...acc, ...res.data.data];
      if (res.data.data.length >= ITEMS_PER_PAGE) return fetchAll(url, page + 1, data);
      return data;
    }
    return acc;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [ch, us] = await Promise.all([fetchAll('/api/channel/'), fetchAll('/api/user/')]);
      setChannels(ch); setUsers(us);
      const defaultGroups = [...new Set([...ch.map((c) => c.group), ...us.map((u) => u.group)])].filter(Boolean);
      const groupStats = defaultGroups.map((name) => ({
        name,
        channelCount: ch.filter((c) => c.group === name).length,
        userCount: us.filter((u) => u.group === name).length,
        models: [...new Set(ch.filter((c) => c.group === name).flatMap((c) => c.models || []))],
        users: us.filter((u) => u.group === name),
        channels: ch.filter((c) => c.group === name),
      }));
      setGroups(groupStats);
    } catch (e) { showError(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleAddGroup = async () => {
    if (!newGroupName) return;
    showSuccess(`分组 ${newGroupName} 已添加（需关联渠道或用户后生效）`);
    setNewGroupName('');
    loadData();
  };

  const handleManage = (group) => { setSelectedGroup(group); setModalOpen(true); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className='aurora-status-bar'>
        <span>{t('group.title', '分组管理')}</span>
        <span>{t('group.description', '管理渠道和用户分组')}</span>
      </div>

      <div className='aurora-card' style={{ padding: 24 }}>
        <div className='aurora-section-header'><span className='aurora-section-title'>添加新分组</span></div>
        <div style={{ display: 'flex', gap: 12 }}>
          <input className='aurora-input' style={{ maxWidth: 400 }} placeholder='输入分组名称' value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddGroup(); }} />
          <button className='aurora-btn aurora-btn-primary' onClick={handleAddGroup}>添加</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
        {groups.map((group) => (
          <div key={group.name} className='aurora-card' style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF' }}>{group.name}</span>
              <span className='aurora-badge aurora-badge-cyan'>{group.channelCount} 渠道</span>
            </div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF' }}>{group.channelCount}</div><div style={{ fontSize: 12, color: '#71717A' }}>渠道</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF' }}>{group.userCount}</div><div style={{ fontSize: 12, color: '#71717A' }}>用户</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF' }}>{group.models.length}</div><div style={{ fontSize: 12, color: '#71717A' }}>模型</div></div>
            </div>
            <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => handleManage(group)}>管理权限</button>
          </div>
        ))}
        {groups.length === 0 && !loading && <div style={{ padding: 48, textAlign: 'center', color: '#71717A' }}>暂无分组</div>}
      </div>

      {selectedGroup && <GroupPermissionModal open={modalOpen} onClose={() => setModalOpen(false)} group={selectedGroup} allGroups={groups} onUpdate={loadData} />}
    </div>
  );
};

export default Group;