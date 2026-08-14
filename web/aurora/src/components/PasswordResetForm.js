import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, getLogo, showError, showInfo, showSuccess } from '../helpers';

const PasswordResetForm = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [disableBtn, setDisableBtn] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const logo = getLogo();

  useEffect(() => {
    if (!disableBtn) return;
    const interval = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(interval);
  }, [disableBtn]);

  const handleSubmit = async () => {
    if (!email) { showInfo(t('messages.error.empty_email', '请输入邮箱')); return; }
    setDisableBtn(true); setCountdown(30);
    const res = await API.post('/api/user/reset', { email });
    const { success, message } = res.data;
    if (success) showSuccess(t('messages.success.password_reset', '重置邮件已发送'));
    else { showError(message); setDisableBtn(false); setCountdown(30); }
  };

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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#F5F5F8' }}>{t('auth.reset.title', '密码重置')}</h1>
          <p style={{ fontSize: 14, color: '#71717A' }}>{t('auth.reset.welcome_subtitle', '重置你的密码')}</p>
        </div>

        <div style={{ width: 360, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' }}>{t('auth.reset.email', '邮箱')}</label>
            <input type='email' value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.reset.email', '邮箱')} style={{ width: '100%', height: 44, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, padding: '0 14px' }} />
          </div>
          <button onClick={handleSubmit} disabled={!email || disableBtn} style={{ width: '100%', height: 46, background: '#B86F05', border: 'none', borderRadius: 10, color: '#FFFFFF', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: email && !disableBtn ? 1 : 0.5 }}>
            {disableBtn ? `${countdown}s` : t('auth.reset.button', '提 交')}
          </button>
        </div>

        <div style={{ fontSize: 13, color: '#71717A', textAlign: 'center', width: 360, maxWidth: '100%' }}>
          {t('auth.reset.notice', '系统将向您的邮箱发送重置链接')}
        </div>

        <Link to='/login' style={{ fontSize: 13, color: '#B86F05', fontWeight: 600 }}>← {t('auth.login.title', '登录')}</Link>
      </div>
    </div>
  );
};

export default PasswordResetForm;