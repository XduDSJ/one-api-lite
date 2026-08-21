import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Pagination from './Pagination';
import { API, showError, showSuccess } from '../helpers';
import { ITEMS_PER_PAGE } from '../constants';
import { renderQuota } from '../helpers/render';
import RechargeModal from './RechargeModal';

const UsersTable = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [rechargeUser, setRechargeUser] = useState(null);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/user/?p=0');
      if (res.data.success) setUsers(res.data.data);
    } catch (e) { showError(e); }
    setLoading(false);
  };

  const searchUsers = async () => {
    if (!searchKeyword) { loadUsers(); return; }
    setSearching(true);
    try {
      const res = await API.get(`/api/user/search?keyword=${searchKeyword}`);
      if (res.data.success) setUsers(res.data.data);
    } catch (e) { showError(e); }
    setSearching(false);
  };

  const manageUser = async (id, action, idx) => {
    if (action === 'delete') {
      const res = await API.delete(`/api/user/${id}`);
      if (res.data.success) {
        showSuccess('已删除用户');
        const newUsers = [...users]; newUsers[idx].deleted = true; setUsers(newUsers);
      } else showError(res.data.message);
    }
  };

  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE) || 1;
  const pageUsers = users.slice((activePage - 1) * ITEMS_PER_PAGE, activePage * ITEMS_PER_PAGE);
  const adminCount = users.filter((u) => u.role >= 10).length;

  const roleLabel = (role) => role >= 100 ? { text: '超级管理员', badge: 'purple' } : role >= 10 ? { text: '管理员', badge: 'gold' } : { text: '普通用户', badge: 'gray' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className='aurora-toolbar'>
        <div className='aurora-toolbar-left'>
          <input className='aurora-input' style={{ maxWidth: 320 }} placeholder={t('user.search', '搜索用户名…')} value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') searchUsers(); }} />
        </div>
        <div className='aurora-toolbar-right'>
          <Link to='/user/add' className='aurora-btn aurora-btn-primary aurora-btn-sm'>+ {t('user.buttons.add', '添加用户')}</Link>
        </div>
      </div>

      <div className='aurora-status-bar'>
        <span>{t('user.status_bar.summary', { total: users.length, admins: adminCount, defaultValue: `共 ${users.length} 个用户 · ${adminCount} 个管理员` })}</span>
      </div>

      <div className='aurora-table'>
        <div className='aurora-table-header'>
          <span style={{ width: 40 }}>ID</span>
          <span style={{ width: 120 }}>用户名</span>
          <span style={{ width: 100 }}>角色</span>
          <span style={{ width: 80 }}>状态</span>
          <span style={{ width: 120 }}>额度</span>
          <span style={{ width: 120 }}>已用</span>
          <span style={{ width: 150 }}>创建时间</span>
          <span style={{ flex: 1, textAlign: 'right' }}>操作</span>
        </div>
        {pageUsers.map((u, idx) => {
          if (u.deleted) return null;
          const role = roleLabel(u.role);
          const statusInfo = u.status === 1 ? { dot: 'on', label: '正常', color: '#2DD4BF' } : { dot: 'off', label: '封禁', color: '#EF4444' };
          return (
            <div className='aurora-table-row' key={u.id}>
              <span style={{ width: 40, color: '#6B7280' }}>{u.id}</span>
              <span style={{ width: 120, color: '#FFFFFF', fontWeight: 500 }}>{u.username}</span>
              <span style={{ width: 100 }}><span className={`aurora-badge aurora-badge-${role.badge}`}>{role.text}</span></span>
              <span style={{ width: 80 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className={`aurora-status-dot aurora-status-dot-${statusInfo.dot}`} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: statusInfo.color }}>{statusInfo.label}</span>
                </span>
              </span>
              <span style={{ width: 120, color: '#D1D5DB' }}>{renderQuota(u.quota, t)}</span>
              <span style={{ width: 120, color: '#D1D5DB' }}>{renderQuota(u.used_quota, t)}</span>
              <span style={{ width: 150, color: '#A1A1AA', fontSize: 12 }}>{new Date(u.created_time * 1000).toLocaleDateString('zh-CN')}</span>
              <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <span onClick={() => setRechargeUser(u)} style={{ fontSize: 12, color: '#B86F05', fontWeight: 500, cursor: 'pointer' }}>充值</span>
                <Link to={`/user/edit/${u.id}`} style={{ fontSize: 12, color: '#B86F05', fontWeight: 500, cursor: 'pointer' }}>编辑</Link>
                <span onClick={() => manageUser(u.id, 'delete', idx)} style={{ fontSize: 12, color: '#EF4444', fontWeight: 500, cursor: 'pointer' }}>删除</span>
              </span>
            </div>
          );
        })}
        {pageUsers.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#71717A' }}>暂无用户</div>}
      </div>

      <Pagination activePage={activePage} totalPages={totalPages} total={users.length} onPageChange={setActivePage} />

      {rechargeUser && <RechargeModal user={rechargeUser} onClose={() => setRechargeUser(null)} onSuccess={(id, quota) => { setRechargeUser(null); loadUsers(); }} />}
    </div>
  );
};

export default UsersTable;