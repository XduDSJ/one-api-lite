import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from 'semantic-ui-react';

// 页面标题映射
const pageTitleMap = {
  '/dashboard': 'header.dashboard',
  '/channel': 'header.channel',
  '/token': 'header.token',
  '/user': 'header.user',
  '/group': 'header.group',
  '/log': 'header.log',
  '/setting': 'header.setting',
  '/about': 'header.about',
  '/login': 'header.login',
  '/register': 'header.register',
};

const TopBar = ({ onToggleSidebar, pathname }) => {
  const { t } = useTranslation();

  // 根据路径推断标题
  let titleKey = pageTitleMap[pathname];
  if (!titleKey) {
    if (pathname.startsWith('/channel/edit')) titleKey = 'header.channel_edit';
    else if (pathname.startsWith('/channel/add')) titleKey = 'header.channel_add';
    else if (pathname.startsWith('/token/edit')) titleKey = 'header.token_edit';
    else if (pathname.startsWith('/token/add')) titleKey = 'header.token_add';
    else if (pathname.startsWith('/user/edit')) titleKey = 'header.user_edit';
    else if (pathname.startsWith('/user/add')) titleKey = 'header.user_add';
    else if (pathname.startsWith('/user/reset')) titleKey = 'header.password_reset';
    else if (pathname === '/reset') titleKey = 'header.password_reset';
    else if (pathname === '/') titleKey = 'header.home';
    else titleKey = 'header.about';
  }

  return (
    <header className='aurora-topbar'>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button
          className='aurora-topbar-toggle'
          onClick={onToggleSidebar}
          aria-label='Toggle sidebar'
        >
          <Icon name='bars' />
        </button>
        <h1 className='aurora-topbar-title'>{t(titleKey)}</h1>
      </div>
      <div className='aurora-topbar-actions' />
    </header>
  );
};

export default TopBar;
