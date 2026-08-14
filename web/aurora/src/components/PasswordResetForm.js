import React, { useEffect, useState } from 'react';
import { Form, Image } from 'semantic-ui-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, getLogo, showError, showInfo, showSuccess } from '../helpers';

const PasswordResetForm = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const logo = getLogo();

  useEffect(() => {
    let interval = null;
    if (disableButton) {
      interval = setInterval(() => {
        setCountdown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [disableButton]);

  async function handleSubmit() {
    if (!email) {
      showInfo(t('messages.error.empty_email', '请先输入邮箱地址'));
      return;
    }
    setDisableButton(true);
    setCountdown(30);
    const res = await API.post('/api/user/reset', {
      email,
    });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('messages.success.password_reset'));
    } else {
      showError(message);
      setDisableButton(false);
      setCountdown(30);
    }
    setLoading(false);
  }

  return (
    <div className='aurora-login-page'>
      <div className='aurora-glow aurora-glow-tl' aria-hidden='true' />
      <div className='aurora-glow aurora-glow-br' aria-hidden='true' />

      <div className='aurora-login-card'>
        <div className='aurora-login-brand'>
          <Image src={logo} className='aurora-login-logo' />
          <span className='aurora-login-brandname'>One API Lite</span>
        </div>

        <h1 className='aurora-login-title'>{t('auth.reset.title')}</h1>
        <p className='aurora-login-subtitle'>{t('auth.reset.welcome_subtitle', '重置您的密码')}</p>

        <Form size='large' className='aurora-login-form'>
          <Form.Field>
            <label className='aurora-login-label'>{t('auth.reset.email')}</label>
            <input
              name='email'
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.reset.email')}
              className='aurora-login-input'
            />
          </Form.Field>
          <button
            type='button'
            onClick={handleSubmit}
            className='aurora-login-btn'
            disabled={!email || disableButton}
          >
            {disableButton
              ? t('auth.register.get_code_retry', { countdown })
              : t('auth.reset.button')}
          </button>
        </Form>

        <div style={{
          width: '100%',
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--aurora-text-muted)',
          marginTop: 'var(--space-2)',
        }}>
          {t('auth.reset.notice')}
        </div>

        <div className='aurora-login-footer'>
          <Link to='/login' className='aurora-login-link'>
            ← {t('auth.login.title')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PasswordResetForm;