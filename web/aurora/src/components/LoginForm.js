import React, { useContext, useEffect, useState } from 'react';
import {
  Button,
  Divider,
  Form,
  Icon,
  Image,
  Message,
} from 'semantic-ui-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../context/User';
import { API, getLogo, showError, showSuccess, showWarning } from '../helpers';

const LoginForm = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({
    username: '',
    password: '',
  });
  const [searchParams] = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const { username, password } = inputs;
  const [userState, userDispatch] = useContext(UserContext);
  const navigate = useNavigate();
  const [status, setStatus] = useState({});
  const logo = getLogo();

useEffect(() => {
    if (searchParams.get('expired')) {
      showError(t('messages.error.login_expired'));
    }
    let status = localStorage.getItem('status');
    if (status) {
      status = JSON.parse(status);
      setStatus(status);
    }
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }

  async function handleSubmit(e) {
    setSubmitted(true);
    if (username && password) {
      const res = await API.post(`/api/user/login`, {
        username,
        password,
      });
      const { success, message, data } = res.data;
      if (success) {
        userDispatch({ type: 'login', payload: data });
        localStorage.setItem('user', JSON.stringify(data));
        if (username === 'root' && password === '123456') {
          navigate('/user/edit');
          showSuccess(t('messages.success.login'));
          showWarning(t('messages.error.root_password'));
        } else {
          navigate('/token');
          showSuccess(t('messages.success.login'));
        }
      } else {
        showError(message);
      }
    }
  }

  return (
    <div className='aurora-login-page'>
      {/* 双侧氛围光晕（设计稿 12:543） */}
      <div className='aurora-glow aurora-glow-tl' aria-hidden='true' />
      <div className='aurora-glow aurora-glow-br' aria-hidden='true' />

      <div className='aurora-login-card'>
        {/* 品牌区（设计稿核心元素） */}
        <div className='aurora-login-brand'>
          <Image src={logo} className='aurora-login-logo' />
          <span className='aurora-login-brandname'>One API Lite</span>
        </div>

        {/* 大标题 */}
        <h1 className='aurora-login-title'>{t('auth.login.welcome_title', '欢迎回来')}</h1>
        <p className='aurora-login-subtitle'>{t('auth.login.welcome_subtitle', '登录到您的控制台')}</p>

        {/* 表单 */}
        <Form size='large' className='aurora-login-form'>
          <Form.Field>
            <label className='aurora-login-label'>{t('auth.login.username')}</label>
            <input
              name='username'
              value={username}
              onChange={handleChange}
              placeholder={t('auth.login.username')}
              className='aurora-login-input'
            />
          </Form.Field>
          <Form.Field>
            <label className='aurora-login-label'>{t('auth.login.password')}</label>
            <input
              name='password'
              type='password'
              value={password}
              onChange={handleChange}
              placeholder={t('auth.login.password')}
              className='aurora-login-input'
            />
          </Form.Field>
          <button
            type='button'
            onClick={handleSubmit}
            className='aurora-login-btn'
            disabled={!username || !password}
          >
            {t('auth.login.button')}
          </button>
        </Form>

        {/* 分隔线 + "或" */}
        <div className='aurora-login-divider'>
          <span className='aurora-login-divider-line' />
          <span className='aurora-login-divider-text'>{t('auth.login.or', '或')}</span>
          <span className='aurora-login-divider-line' />
        </div>

        {/* 第三方登录（设计稿 GitHub + 微信） */}
        <div className='aurora-login-oauth'>
          <button type='button' className='aurora-oauth-btn'>
            <Icon name='github' />
            {t('auth.login.github', 'GitHub')}
          </button>
          <button type='button' className='aurora-oauth-btn'>
            <Icon name='wechat' />
            {t('auth.login.wechat', '微信')}
          </button>
        </div>

        {/* 底部链接 */}
        <div className='aurora-login-footer'>
          <span style={{ color: 'var(--aurora-text-muted)' }}>
            {t('auth.login.no_account')}
          </span>
          <Link to='/register' className='aurora-login-link'>
            {t('auth.login.register')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;