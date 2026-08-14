import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../context/User';
import { API, getLogo, showError, showInfo, showSuccess } from '../helpers';

const RegisterForm = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({ username: '', password: '', confirmPassword: '', email: '', verificationCode: '' });
  const { username, password, confirmPassword, email, verificationCode } = inputs;
  const [, userDispatch] = useContext(UserContext);
  const navigate = useNavigate();
  const logo = getLogo();
  const [loading, setLoading] = useState(false);
  const [disableBtn, setDisableBtn] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [status, setStatus] = useState({});
  const [emailVerify, setEmailVerify] = useState(false);

  useEffect(() => {
    let s = localStorage.getItem('status');
    if (s) { s = JSON.parse(s); setStatus(s); if (s.email_verification) setEmailVerify(true); }
  }, []);

  useEffect(() => {
    if (!disableBtn) return;
    const interval = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(interval);
  }, [disableBtn]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
  };

  const sendCode = async () => {
    if (!email) { showInfo(t('messages.error.empty_email', '请先输入邮箱')); return; }
    setDisableBtn(true); setCountdown(30);
    const res = await API.post('/api/verification', { email });
    const { success, message } = res.data;
    if (success) showSuccess(t('messages.success.verification_code', '验证码已发送'));
    else { showError(message); setDisableBtn(false); setCountdown(30); }
  };

  const handleSubmit = async () => {
    if (password !== confirmPassword) { showError(t('messages.error.password_mismatch', '两次密码不一致')); return; }
    if (password.length < 8) { showError(t('messages.error.password_length', '密码至少8位')); return; }
    setLoading(true);
    const res = await API.post('/api/user/register', {
      username, password,
      email: emailVerify ? email : '',
      verification_code: emailVerify ? verificationCode : '',
    });
    const { success, message } = res.data;
    if (success) {
      userDispatch({ type: 'logout' });
      localStorage.removeItem('user');
      navigate('/login');
      showSuccess(t('messages.success.register', '注册成功'));
    } else { showError(message); }
    setLoading(false);
  };

  const inputStyle = {
    width: '100%', height: 44, background: '#0D0D12',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
    color: '#FFFFFF', fontSize: 13, padding: '0 14px',
  };
  const labelStyle = { fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', background: '#0D0D12', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: -100, left: -100, width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(184,111,5,0.15) 0%, rgba(184,111,5,0) 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -100, right: -100, width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,212,191,0.08) 0%, rgba(45,212,191,0) 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 2, width: 440, maxWidth: 'calc(100vw - 40px)', background: '#131319', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt='logo' style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: '#F5F5F8' }}>One API Lite</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#F5F5F8' }}>{t('auth.register.welcome_title', '创建账号')}</h1>
          <p style={{ fontSize: 14, color: '#71717A' }}>{t('auth.register.welcome_subtitle', '加入你的 AI 中枢')}</p>
        </div>

        <div style={{ width: 360, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>{t('auth.register.username', '用户名')}</label>
            <input name='username' value={username} onChange={handleChange} placeholder={t('auth.register.username', '用户名')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('auth.register.email', '邮箱')}</label>
            <input name='email' type='email' value={email} onChange={handleChange} placeholder={t('auth.register.email', '邮箱')} style={inputStyle} />
          </div>
          {emailVerify && (
            <div>
              <label style={labelStyle}>{t('auth.register.verification_code', '验证码')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input name='verificationCode' value={verificationCode} onChange={handleChange} placeholder={t('auth.register.verification_code', '验证码')} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={sendCode} disabled={disableBtn} style={{ height: 44, padding: '0 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: disableBtn ? '#52525B' : '#B86F05', fontSize: 13, fontWeight: 600, cursor: disableBtn ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                  {disableBtn ? `${countdown}s` : t('auth.register.get_code', '获取验证码')}
                </button>
              </div>
            </div>
          )}
          <div>
            <label style={labelStyle}>{t('auth.register.password', '密码')}</label>
            <input name='password' type='password' value={password} onChange={handleChange} placeholder={t('auth.register.password', '密码')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('auth.register.confirm_password', '确认密码')}</label>
            <input name='confirmPassword' type='password' value={confirmPassword} onChange={handleChange} placeholder={t('auth.register.confirm_password', '确认密码')} style={inputStyle} />
          </div>
          <button onClick={handleSubmit} disabled={loading || !username || !password} style={{ width: '100%', height: 46, background: '#B86F05', border: 'none', borderRadius: 10, color: '#FFFFFF', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: username && password ? 1 : 0.5 }}>
            {t('auth.register.button', '注 册')}
          </button>
        </div>

        <div style={{ width: 360, maxWidth: '100%', textAlign: 'center' }}>
          <span style={{ fontSize: 13, color: '#71717A' }}>{t('auth.register.has_account', '已有账号？')}</span>
          <Link to='/login' style={{ fontSize: 13, fontWeight: 600, color: '#B86F05', marginLeft: 4 }}>{t('auth.register.login', '返回登录')}</Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;