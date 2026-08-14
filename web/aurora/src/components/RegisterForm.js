import React, { useContext, useEffect, useState } from 'react';
import {
  Button,
  Divider,
  Form,
  Icon,
  Image,
  Message,
} from 'semantic-ui-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../context/User';
import { API, getLogo, showError, showInfo, showSuccess } from '../helpers';

const RegisterForm = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    verificationCode: '',
  });
  const { username, password, confirmPassword, email, verificationCode } = inputs;
  const [, userDispatch] = useContext(UserContext);
  const navigate = useNavigate();
  const logo = getLogo();
  const [loading, setLoading] = useState(false);
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [status, setStatus] = useState({});
  const [emailVerify, setEmailVerify] = useState(false);

  useEffect(() => {
    let s = localStorage.getItem('status');
    if (s) {
      s = JSON.parse(s);
      setStatus(s);
      if (s.email_verification) setEmailVerify(true);
    }
  }, []);

  useEffect(() => {
    let interval = null;
    if (disableButton) {
      interval = setInterval(() => {
        setCountdown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [disableButton]);

  function handleChange(e) {
    const { name, value } = e.target;
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }

  async function handleSendVerificationCode() {
    if (!email) {
      showInfo(t('messages.error.empty_email', '请先输入邮箱地址'));
      return;
    }
    setDisableButton(true);
    setCountdown(30);
    const res = await API.post('/api/verification', {
      email,
    });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('messages.success.verification_code'));
    } else {
      showError(message);
      setDisableButton(false);
      setCountdown(30);
    }
    setLoading(false);
  }

  async function handleSubmit(e) {
    if (password !== confirmPassword) {
      showError(t('messages.error.password_mismatch'));
      return;
    }
    if (password.length < 8) {
      showError(t('messages.error.password_length'));
      return;
    }
    setLoading(true);
    const res = await API.post('/api/user/register', {
      username,
      password,
      email: emailVerify ? email : '',
      verification_code: emailVerify ? verificationCode : '',
    });
    const { success, message } = res.data;
    if (success) {
      userDispatch({ type: 'logout' });
      localStorage.removeItem('user');
      navigate('/login');
      showSuccess(t('messages.success.register'));
    } else {
      showError(message);
    }
    setLoading(false);
  }

  return (
    <div className='aurora-login-page'>
      <div className='aurora-glow aurora-glow-tl' aria-hidden='true' />
      <div className='aurora-glow aurora-glow-br' aria-hidden='true' />

      <div className='aurora-login-card' style={{ maxWidth: 480 }}>
        <div className='aurora-login-brand'>
          <Image src={logo} className='aurora-login-logo' />
          <span className='aurora-login-brandname'>One API Lite</span>
        </div>

        <h1 className='aurora-login-title'>{t('auth.register.welcome_title', '创建账号')}</h1>
        <p className='aurora-login-subtitle'>{t('auth.register.welcome_subtitle', '加入您的 AI 中枢')}</p>

        <Form size='large' className='aurora-login-form'>
          <Form.Field>
            <label className='aurora-login-label'>{t('auth.register.username')}</label>
            <input
              name='username'
              value={username}
              onChange={handleChange}
              placeholder={t('auth.register.username')}
              className='aurora-login-input'
            />
          </Form.Field>
          <Form.Field>
            <label className='aurora-login-label'>{t('auth.register.email')}</label>
            <input
              name='email'
              type='email'
              value={email}
              onChange={handleChange}
              placeholder={t('auth.register.email')}
              className='aurora-login-input'
            />
          </Form.Field>
          {emailVerify && (
            <Form.Field>
              <label className='aurora-login-label'>{t('auth.register.verification_code')}</label>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  name='verificationCode'
                  value={verificationCode}
                  onChange={handleChange}
                  placeholder={t('auth.register.verification_code')}
                  className='aurora-login-input'
                  style={{ flex: 1 }}
                />
                <button
                  type='button'
                  onClick={handleSendVerificationCode}
                  disabled={disableButton}
                  className='aurora-oauth-btn'
                  style={{ flex: '0 0 auto' }}
                >
                  {disableButton
                    ? t('auth.register.get_code_retry', { countdown })
                    : t('auth.register.get_code')}
                </button>
              </div>
            </Form.Field>
          )}
          <Form.Field>
            <label className='aurora-login-label'>{t('auth.register.password')}</label>
            <input
              name='password'
              type='password'
              value={password}
              onChange={handleChange}
              placeholder={t('auth.register.password')}
              className='aurora-login-input'
            />
          </Form.Field>
          <Form.Field>
            <label className='aurora-login-label'>{t('auth.register.confirm_password')}</label>
            <input
              name='confirmPassword'
              type='password'
              value={confirmPassword}
              onChange={handleChange}
              placeholder={t('auth.register.confirm_password')}
              className='aurora-login-input'
            />
          </Form.Field>
          <button
            type='button'
            onClick={handleSubmit}
            className='aurora-login-btn'
            disabled={!username || !password || !confirmPassword || (emailVerify && (!email || !verificationCode))}
          >
            {t('auth.register.button')}
          </button>
        </Form>

        <div className='aurora-login-footer'>
          <span style={{ color: 'var(--aurora-text-muted)' }}>
            {t('auth.register.has_account')}
          </span>
          <Link to='/login' className='aurora-login-link'>
            {t('auth.register.login')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;