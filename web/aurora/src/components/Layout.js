import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getLogo, getSystemName, isAdmin, showSuccess, API } from '../helpers';
import { UserContext } from '../context/User';

const navItems = [
  { key: 'dashboard', to: '/dashboard', label: '仪表盘', icon: 'D' },
  { key: 'channel', to: '/channel', label: '渠道管理', icon: 'C', admin: true },
  { key: 'token', to: '/token', label: '令牌管理', icon: 'T' },
  { key: 'user', to: '/user', label: '用户管理', icon: 'U', admin: true },
  { key: 'group', to: '/group', label: '分组管理', icon: 'G', admin: true },
  { key: 'log', to: '/log', label: '日志审计', icon: 'L' },
  { key: 'setting', to: '/setting', label: '系统设置', icon: 'S' },
  { key: 'about', to: '/about', label: '关于', icon: 'A' },
];

const pageMeta = {
  '/dashboard': { title: '仪表盘', breadcrumb: '控制台  /  仪表盘' },
  '/channel': { title: '渠道管理', breadcrumb: '控制台  /  渠道管理' },
  '/token': { title: '令牌管理', breadcrumb: '控制台  /  令牌管理' },
  '/user': { title: '用户管理', breadcrumb: '控制台  /  用户管理' },
  '/group': { title: '分组管理', breadcrumb: '控制台  /  分组管理' },
  '/log': { title: '日志审计', breadcrumb: '控制台  /  日志审计' },
  '/setting': { title: '系统设置', breadcrumb: '控制台  /  系统设置' },
  '/about': { title: '关于', breadcrumb: '控制台  /  关于' },
};

const Layout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { userState, userDispatch } = React.useContext(UserContext);
  const logo = getLogo();
  const systemName = getSystemName();

  const isAuthPage =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/reset' ||
    location.pathname.startsWith('/user/reset');

  if (isAuthPage) {
    return <div className='aurora-auth-page'>{children}</div>;
  }

  const toggleSidebar = () => {
    if (window.innerWidth <= 768) setSidebarOpen(!sidebarOpen);
    else setCollapsed(!collapsed);
  };

  const logout = async () => {
    await API.get('/api/user/logout');
    showSuccess('注销成功!');
    userDispatch({ type: 'logout' });
    localStorage.removeItem('user');
    navigate('/login');
  };

  let meta = pageMeta[location.pathname];
  if (!meta) {
    if (location.pathname.startsWith('/channel/edit')) meta = { title: '编辑渠道', breadcrumb: '控制台  /  渠道管理  /  编辑' };
    else if (location.pathname.startsWith('/channel/add')) meta = { title: '添加渠道', breadcrumb: '控制台  /  渠道管理  /  添加' };
    else if (location.pathname.startsWith('/token/edit')) meta = { title: '编辑令牌', breadcrumb: '控制台  /  令牌管理  /  编辑' };
    else if (location.pathname.startsWith('/token/add')) meta = { title: '添加令牌', breadcrumb: '控制台  /  令牌管理  /  添加' };
    else if (location.pathname.startsWith('/user/edit')) meta = { title: '编辑用户', breadcrumb: '控制台  /  用户管理  /  编辑' };
    else if (location.pathname.startsWith('/user/add')) meta = { title: '添加用户', breadcrumb: '控制台  /  用户管理  /  添加' };
    else if (location.pathname === '/') meta = { title: '首页', breadcrumb: '' };
    else meta = { title: '页面', breadcrumb: '' };
  }

  const visibleItems = navItems.filter((item) => !item.admin || isAdmin());

  return (
    <div className='aurora-layout'>
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`aurora-sidebar ${collapsed ? 'aurora-sidebar-collapsed' : ''} ${sidebarOpen ? 'aurora-sidebar-open' : ''}`}>
        <Link to='/' className='aurora-sidebar-brand' onClick={() => setSidebarOpen(false)}>
          <img src={logo} alt='logo' />
          {!collapsed && <span>{systemName}</span>}
        </Link>

        {!collapsed && <div className='aurora-sidebar-navlabel'>主菜单</div>}

        {visibleItems.map((item) => {
          const isActive = location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.key}
              to={item.to}
              className={`aurora-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
              title={collapsed ? item.label : undefined}
            >
              <span className='nav-icon'>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        <div style={{ flex: 1 }} />
        <div className='aurora-sidebar-divider' />

        {userState.user ? (
          <div className='aurora-sidebar-user' onClick={logout} style={{ cursor: 'pointer' }}>
            <div className='aurora-sidebar-user-avatar'>
              {userState.user.username?.[0]?.toUpperCase() || 'U'}
            </div>
            {!collapsed && (
              <div>
                <div className='aurora-sidebar-user-name'>{userState.user.username}</div>
                <div className='aurora-sidebar-user-role'>
                  {userState.user.role >= 100 ? '超级管理员' : userState.user.role >= 10 ? '管理员' : '普通用户'}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link to='/login' className='aurora-nav-item' onClick={() => setSidebarOpen(false)}>
            <span className='nav-icon'>→</span>
            {!collapsed && <span>登录</span>}
          </Link>
        )}
      </aside>

      {/* Main */}
      <div className={`aurora-main ${collapsed ? 'aurora-main-collapsed' : ''}`}>
        {/* TopBar */}
        <header className='aurora-topbar'>
          <div className='aurora-topbar-left'>
            <button className='aurora-topbar-toggle' onClick={toggleSidebar}>☰</button>
            <div className='aurora-topbar-title'>{meta.title}</div>
            {meta.breadcrumb && <div className='aurora-topbar-breadcrumb'>{meta.breadcrumb}</div>}
          </div>
          <div className='aurora-topbar-right'>
            <input className='aurora-topbar-search' placeholder='搜索...' />
            <div className='aurora-topbar-icon-btn'>🔔</div>
            <div className='aurora-topbar-icon-btn'>🌙</div>
            <div className='aurora-topbar-avatar'>
              {userState.user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className='aurora-content'>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;