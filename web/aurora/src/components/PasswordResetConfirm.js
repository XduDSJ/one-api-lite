import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, getLogo, showError, showNotice } from '../helpers';

const PasswordResetConfirm = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [inputs, setInputs] = useState({ email: '', newPassword: '' });
  const { email, newPassword } = inputs;
  const logo = getLogo();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      API.get(`/api/user/reset?token=${token}`).then((res) => {
        const { success, message, data } = res.data;
        if (success) setInputs({ email: data.email, newPassword: data.password });
        else showError(message);
      });
    }
  }, []);

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); } catch (e) {}
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#F5F5F8' }}>{t('auth.reset.confirm.title', '密码重置确认')}</h1>
          <p style={{ fontSize: 14, color: '#71717A' }}>{t('auth.reset.confirm.welcome_subtitle', '已为您生成新密码')}</p>
        </div>

        <div style={{ width: 360, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' }}>{t('auth.reset.email', '邮箱')}</label>
            <input value={email} readOnly style={{ width: '100%', height: 44, background: '#1A1A22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#A1A1AA', fontSize: 13, padding: '0 14px', cursor: 'default' }} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' }}>{t('auth.reset.confirm.new_password', '新密码')}</label>
            <input value={newPassword} readOnly onClick={() => copy(newPassword)} style={{ width: '100%', height: 44, background: '#1A1A22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, padding: '0 14px', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <div style={{ fontSize: 13, color: '#71717A', textAlign: 'center' }}>
            {t('auth.reset.confirm.notice', '点击密码框复制，请及时登录修改密码')}
          </div>
        </div>

        <Link to='/login' style={{ fontSize: 13, color: '#B86F05', fontWeight: 600 }}>← {t('auth.login.title', '登录')}</Link>
      </div>
    </div>
  );
};

export default PasswordResetConfirm;