import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from 'semantic-ui-react';

// 页面标题 + 面包屑映射（按设计稿 TopBar 结构）
const pageMetaMap = {
  '/dashboard': { title: 'header.dashboard', breadcrumb: '控制台  /  仪表盘' },
  '/channel': { title: 'header.channel', breadcrumb: '控制台  /  渠道管理' },
  '/token': { title: 'header.token', breadcrumb: '控制台  /  令牌管理' },
  '/user': { title: 'header.user', breadcrumb: '控制台  /  用户管理' },
  '/group': { title: 'header.group', breadcrumb: '控制台  /  分组管理' },
  '/log': { title: 'header.log', breadcrumb: '控制台  /  日志审计' },
  '/setting': { title: 'header.setting', breadcrumb: '控制台  /  系统设置' },
  '/about': { title: 'header.about', breadcrumb: '控制台  /  关于' },
  '/login': { title: 'header.login', breadcrumb: '' },
  '/register': { title: 'header.register', breadcrumb: '' },
};

const TopBar = ({ onToggleSidebar, pathname }) => {
  const { t } = useTranslation();

  let meta = pageMetaMap[pathname];
  if (!meta) {
    if (pathname.startsWith('/channel/edit')) meta = { title: 'header.channel_edit', breadcrumb: '控制台  /  渠道管理  /  编辑' };
    else if (pathname.startsWith('/channel/add')) meta = { title: 'header.channel_add', breadcrumb: '控制台  /  渠道管理  /  添加' };
    else if (pathname.startsWith('/token/edit')) meta = { title: 'header.token_edit', breadcrumb: '控制台  /  令牌管理  /  编辑' };
    else if (pathname.startsWith('/token/add')) meta = { title: 'header.token_add', breadcrumb: '控制台  /  令牌管理  /  添加' };
    else if (pathname.startsWith('/user/edit')) meta = { title: 'header.user_edit', breadcrumb: '控制台  /  用户管理  /  编辑' };
    else if (pathname.startsWith('/user/add')) meta = { title: 'header.user_add', breadcrumb: '控制台  /  用户管理  /  添加' };
    else if (pathname.startsWith('/user/reset')) meta = { title: 'header.password_reset', breadcrumb: '' };
    else if (pathname === '/reset') meta = { title: 'header.password_reset', breadcrumb: '' };
    else if (pathname === '/') meta = { title: 'header.home', breadcrumb: '' };
    else meta = { title: 'header.about', breadcrumb: '控制台  /  关于' };
  }

  return (
    <header className='aurora-topbar'>
      {/* LeftGroup: 页面标题 + 面包屑 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <button
          className='aurora-topbar-toggle'
          onClick={onToggleSidebar}
          aria-label='Toggle sidebar'
        >
          <Icon name='bars' />
        </button>
        <h1 className='aurora-topbar-title'>{t(meta.title)}</h1>
        {meta.breadcrumb && (
          <span className='aurora-topbar-breadcrumb'>{meta.breadcrumb}</span>
        )}
      </div>

      {/* RightGroup: 搜索框 + 通知 + 主题 + 头像 */}
      <div className='aurora-topbar-actions'>
        <input
          className='aurora-topbar-search'
          placeholder='搜索...'
        />
        <div className='aurora-topbar-icon-btn' title='通知'>
          <Icon name='bell' style={{ color: '#A1A1AA', fontSize: '16px' }} />
        </div>
        <div className='aurora-topbar-icon-btn' title='主题'>
          <Icon name='moon' style={{ color: '#A1A1AA', fontSize: '16px' }} />
        </div>
        <div className='aurora-topbar-avatar' title='用户'>
          R
        </div>
      </div>
    </header>
  );
};

export default TopBar;