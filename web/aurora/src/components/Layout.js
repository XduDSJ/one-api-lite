import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const Layout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // 认证类页面（登录/注册/重置）：独立居中布局，不渲染侧边栏与顶栏
  const isAuthPage =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/reset' ||
    location.pathname.startsWith('/user/reset');

  if (isAuthPage) {
    return <div className='aurora-auth-page'>{children}</div>;
  }

  const toggleSidebar = () => {
    // 移动端：切换抽屉开关
    if (window.innerWidth <= 768) {
      setSidebarOpen(!sidebarOpen);
    } else {
      // 桌面端：折叠/展开
      setCollapsed(!collapsed);
    }
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className='aurora-layout'>
      <Sidebar
        collapsed={collapsed}
        open={sidebarOpen}
        onClose={closeSidebar}
      />
      <div className={`aurora-main ${collapsed ? 'aurora-main-collapsed' : ''}`}>
        <TopBar
          onToggleSidebar={toggleSidebar}
          pathname={location.pathname}
        />
        <main className='aurora-content'>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
