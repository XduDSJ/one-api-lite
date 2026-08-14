import React from 'react';
import { Icon } from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';

/**
 * AuroraEmpty - 空状态统一组件
 *
 * 用法：
 *   <AuroraEmpty icon='inbox' title='暂无数据' description='点击右上角添加按钮创建' />
 *   <AuroraEmpty />  // 默认空状态
 */
export const AuroraEmpty = ({ icon, title, description, action }) => {
  const { t } = useTranslation();
  return (
    <div className='aurora-empty'>
      <Icon
        name={icon || 'inbox'}
        size='huge'
        style={{ color: 'var(--aurora-text-muted)', opacity: 0.4, marginBottom: 'var(--space-3)' }}
      />
      <div className='aurora-empty-title'>
        {title || t('common.empty.default_title', '暂无数据')}
      </div>
      {description && (
        <div className='aurora-empty-description'>{description}</div>
      )}
      {action && <div className='aurora-empty-action'>{action}</div>}
    </div>
  );
};

/**
 * AuroraLoading - 加载状态统一组件
 *
 * 用法：
 *   <AuroraLoading />  // 默认加载
 *   <AuroraLoading text='正在加载渠道列表...' />
 */
export const AuroraLoading = ({ text }) => {
  const { t } = useTranslation();
  return (
    <div className='aurora-loading'>
      <div className='aurora-loading-spinner' aria-hidden='true' />
      <div className='aurora-loading-text'>
        {text || t('common.loading.default', '加载中...')}
      </div>
    </div>
  );
};

/**
 * AuroraError - 错误状态统一组件
 *
 * 用法：
 *   <AuroraError message='加载失败' onRetry={() => reload()} />
 */
export const AuroraError = ({ message, onRetry }) => {
  const { t } = useTranslation();
  return (
    <div className='aurora-error'>
      <Icon
        name='exclamation triangle'
        size='huge'
        style={{ color: 'var(--aurora-danger)', marginBottom: 'var(--space-3)' }}
      />
      <div className='aurora-error-message'>
        {message || t('common.error.default', '加载失败')}
      </div>
      {onRetry && (
        <button className='aurora-error-retry' onClick={onRetry}>
          {t('common.error.retry', '重试')}
        </button>
      )}
    </div>
  );
};

export default { AuroraEmpty, AuroraLoading, AuroraError };