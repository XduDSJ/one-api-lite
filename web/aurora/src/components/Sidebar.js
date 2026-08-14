import React, { useContext, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UserContext } from '../context/User';
import { useTranslation } from 'react-i18next';
import { Icon, Dropdown } from 'semantic-ui-react';
import { getLogo, getSystemName, isAdmin, showSuccess, API } from '../helpers';

// 导航项（跟设计稿 Sidebar 节点对齐）
const navItems = [
  { name: 'header.dashboard', to: '/dashboard', icon: 'chart bar' },
  { name: 'header.channel', to: '/channel', icon: 'sitemap', admin: true },
  { name: 'header.token', to: '/token', icon: 'key' },
  { name: 'header.user', to: '/user', icon: 'user', admin: true },
  { name: 'header.group', to: '/group', icon: 'object group', admin: true },
  { name: 'header.log', to: '/log', icon: 'book' },
  { name: 'header.setting', to: '/setting', icon: 'setting' },
  { name: 'header.about', to: '/about', icon: 'info circle' },
];

const Sidebar = ({ collapsed, open, onClose }) => {
  const { t, i18n } = useTranslation();
  const [userState, userDispatch] = useContext(UserContext);
  const location = useLocation();
  const navigate = useNavigate();

  const systemName = getSystemName();
  const logo = getLogo();

  const languageOptions = [
    { key: 'zh', text: '中文', value: 'zh' },
    { key: 'en', text: 'English', value: 'en' },
  ];

  const changeLanguage = (language) => {
    i18n.changeLanguage(language);
  };

  const logout = async () => {
    await API.get('/api/user/logout');
    showSuccess('注销成功!');
    userDispatch({ type: 'logout' });
    localStorage.removeItem('user');
    navigate('/login');
  };

  const visibleItems = navItems.filter((item) => !item.admin || isAdmin());

  return (
    <>
      {/* 移动端遮罩 */}
      <div
        className={`aurora-sidebar-overlay ${open ? 'aurora-overlay-show' : ''}`}
        onClick={onClose}
      />
      <aside
        className={`aurora-sidebar ${collapsed ? 'aurora-sidebar-collapsed' : ''} ${open ? 'aurora-sidebar-open' : ''}`}
      >
        {/* Brand */}
        <Link to='/' className='aurora-sidebar-brand' onClick={onClose}>
          <img src={logo} alt='logo' />
          {!collapsed && <span>{systemName}</span>}
        </Link>

        {/* 导航标签 */}
        {!collapsed && <div className='aurora-sidebar-navlabel'>{t('header.main_menu')}</div>}

        {/* 导航项 */}
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.name}
              to={item.to}
              className={`aurora-nav-item ${isActive ? 'active' : ''}`}
              onClick={onClose}
              title={collapsed ? t(item.name) : undefined}
            >
              <Icon name={item.icon} />
              {!collapsed && <span>{t(item.name)}</span>}
            </Link>
          );
        })}

        {/* 弹性间距 */}
        <div style={{ flex: 1 }} />

        {/* 分隔线 */}
        <div className='aurora-sidebar-divider' />

        {/* 语言切换 */}
        {!collapsed && (
          <Dropdown
            selection
            compact
            options={languageOptions}
            value={i18n.language}
            onChange={(_, { value }) => changeLanguage(value)}
            style={{
              background: 'var(--aurora-surface)',
              border: '1px solid var(--aurora-border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--space-2)',
            }}
          />
        )}

        {/* 用户区 */}
        {userState.user ? (
          <Dropdown
            item
            direction='right'
            trigger={
              <div className='aurora-sidebar-user'>
                <div className='aurora-sidebar-user-avatar'>
                  {userState.user.username?.[0]?.toUpperCase() || 'U'}
                </div>
                {!collapsed && <span>{userState.user.username}</span>}
              </div>
            }
            style={{ width: '100%', padding: 0 }}
          >
            <Dropdown.Menu style={{
              background: 'var(--aurora-surface-2)',
              border: '1px solid var(--aurora-border)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <Dropdown.Item onClick={logout} style={{ color: 'var(--aurora-text-muted)' }}>
                <Icon name='sign out' /> {t('header.logout')}
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        ) : (
          <Link to='/login' className='aurora-nav-item' onClick={onClose}>
            <Icon name='sign in' />
            {!collapsed && <span>{t('header.login')}</span>}
          </Link>
        )}
      </aside>
    </>
  );
};

export default Sidebar;
