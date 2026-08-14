import React, { useEffect, useState } from 'react';
import { Form, Image } from 'semantic-ui-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, getLogo, showError, showNotice } from '../helpers';

const PasswordResetConfirm = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [inputs, setInputs] = useState({
    email: '',
    newPassword: '',
  });
  const { email, newPassword } = inputs;
  const [loading, setLoading] = useState(false);
  const [disableButton, setDisableButton] = useState(false);
  const logo = getLogo();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      const res = API.get(`/api/user/reset?token=${token}`).then((res) => {
        const { success, message, data } = res.data;
        if (success) {
          setInputs({
            email: data.email,
            newPassword: data.password,
          });
        } else {
          showError(message);
        }
      });
    }
  }, []);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  async function handleSubmit() {
    setLoading(true);
    const res = await API.post('/api/user/reset_confirm', {
      email,
      password: newPassword,
    });
    const { success, message } = res.data;
    if (success) {
      let password = res.data.data;
      setInputs({ ...inputs, newPassword: password });
      await copy(password);
      showNotice(t('messages.notice.password_copied', { password }));
    } else {
      showError(message);
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

        <h1 className='aurora-login-title'>{t('auth.reset.confirm.title')}</h1>
        <p className='aurora-login-subtitle'>{t('auth.reset.confirm.welcome_subtitle', '已为您生成新密码')}</p>

        <Form size='large' className='aurora-login-form'>
          <Form.Field>
            <label className='aurora-login-label'>{t('auth.reset.email')}</label>
            <input
              name='email'
              value={email}
              readOnly
              placeholder={t('auth.reset.email')}
              className='aurora-login-input'
              style={{ backgroundColor: 'var(--aurora-surface-2)', cursor: 'default' }}
            />
          </Form.Field>
          <Form.Field>
            <label className='aurora-login-label'>{t('auth.reset.confirm.new_password')}</label>
            <input
              name='newPassword'
              value={newPassword}
              readOnly
              onClick={() => copy(newPassword)}
              placeholder={t('auth.reset.confirm.new_password')}
              className='aurora-login-input'
              style={{ backgroundColor: 'var(--aurora-surface-2)', cursor: 'pointer' }}
            />
          </Form.Field>
          <button
            type='button'
            onClick={handleSubmit}
            className='aurora-login-btn'
            disabled={disableButton}
          >
            {disableButton
              ? t('auth.reset.confirm.button_disabled')
              : t('auth.reset.confirm.button')}
          </button>
        </Form>

        <div style={{
          width: '100%',
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--aurora-text-muted)',
          marginTop: 'var(--space-2)',
        }}>
          {t('auth.reset.confirm.notice')}
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

export default PasswordResetConfirm;