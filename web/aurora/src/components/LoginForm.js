import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../context/User';
import { API, getLogo, showError, showSuccess, showWarning } from '../helpers';

const LoginForm = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({ username: '', password: '' });
  const [searchParams] = useSearchParams();
  const [, userDispatch] = useContext(UserContext);
  const navigate = useNavigate();
  const logo = getLogo();
  const { username, password } = inputs;

  useEffect(() => {
    if (searchParams.get('expired')) {
      showError(t('messages.error.login_expired', '登录已过期，请重新登录'));
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!username || !password) return;
    const res = await API.post('/api/user/login', { username, password });
    const { success, message, data } = res.data;
    if (success) {
      userDispatch({ type: 'login', payload: data });
      localStorage.setItem('user', JSON.stringify(data));
      if (username === 'root' && password === '123456') {
        navigate('/user/edit');
        showSuccess(t('messages.success.login', '登录成功'));
        showWarning(t('messages.error.root_password', '请立刻修改默认密码！'));
      } else {
        navigate('/dashboard');
        showSuccess(t('messages.success.login', '登录成功'));
      }
    } else {
      showError(message);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', background: '#0D0D12', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* GlowTopLeft — 设计稿 12:544: 800×800, gold radial 0.15→0 */}
      <div style={{
        position: 'absolute', top: -100, left: -100, width: 800, height: 800,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(184,111,5,0.15) 0%, rgba(184,111,5,0) 70%)',
        pointerEvents: 'none',
      }} />
      {/* GlowBottomRight — 设计稿 12:545: 800×800, cyan radial 0.08→0 */}
      <div style={{
        position: 'absolute', bottom: -100, right: -100, width: 800, height: 800,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(45,212,191,0.08) 0%, rgba(45,212,191,0) 70%)',
        pointerEvents: 'none',
      }} />

      {/* LoginCard — 设计稿 12:546: 440×auto, bg=#131319, stroke=rgba(255,255,255,0.06), cornerRadius:16, itemSpacing:24 */}
      <div style={{
        position: 'relative', zIndex: 2,
        width: 440, maxWidth: 'calc(100vw - 40px)',
        background: '#131319',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: '40px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      }}>
        {/* LogoRow — 设计稿 12:547: Logo 32×32 + "One API Lite" 20px Bold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt='logo' style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: '#F5F5F8', fontFamily: 'Noto Sans SC, sans-serif' }}>
            One API Lite
          </span>
        </div>

        {/* TitleBlock — 设计稿 12:550: "欢迎回来" 24px Bold + "登录到你的控制台" 14px Regular #71717A */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#F5F5F8', fontFamily: 'Noto Sans SC, sans-serif' }}>
            {t('auth.login.welcome_title', '欢迎回来')}
          </h1>
          <p style={{ fontSize: 14, color: '#71717A', fontFamily: 'Noto Sans SC, sans-serif' }}>
            {t('auth.login.welcome_subtitle', '登录到你的控制台')}
          </p>
        </div>

        {/* FormArea — 设计稿 12:553: 360px, itemSpacing:16 */}
        <div style={{ width: 360, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Username — 设计稿 12:554: label 13px #A1A1AA, input 360×44 cornerRadius:10 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, color: '#A1A1AA', fontFamily: 'Noto Sans SC, sans-serif' }}>
              {t('auth.login.username', '用户名')}
            </label>
            <input
              name='username'
              value={username}
              onChange={handleChange}
              placeholder={t('auth.login.username', '用户名')}
              style={{
                width: '100%', height: 44,
                background: '#0D0D12',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                color: '#FFFFFF', fontSize: 13,
                padding: '0 14px',
              }}
            />
          </div>

          {/* Password — 设计稿 12:558: 同上 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, color: '#A1A1AA', fontFamily: 'Noto Sans SC, sans-serif' }}>
              {t('auth.login.password', '密码')}
            </label>
            <input
              name='password'
              type='password'
              value={password}
              onChange={handleChange}
              placeholder={t('auth.login.password', '密码')}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              style={{
                width: '100%', height: 44,
                background: '#0D0D12',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                color: '#FFFFFF', fontSize: 13,
                padding: '0 14px',
              }}
            />
          </div>

          {/* LoginBtn — 设计稿 12:562: 360×46, bg=#B86F05, cornerRadius:10, "登 录" 15px SemiBold #FFFFFF */}
          <button
            onClick={handleSubmit}
            disabled={!username || !password}
            style={{
              width: '100%', height: 46,
              background: '#B86F05',
              border: 'none',
              borderRadius: 10,
              color: '#FFFFFF',
              fontSize: 15, fontWeight: 600,
              fontFamily: 'Noto Sans SC, sans-serif',
              cursor: username && password ? 'pointer' : 'not-allowed',
              opacity: username && password ? 1 : 0.5,
              marginTop: 4,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { if (username && password) e.target.style.background = '#D48811'; }}
            onMouseLeave={(e) => { if (username && password) e.target.style.background = '#B86F05'; }}
          >
            {t('auth.login.button', '登 录')}
          </button>
        </div>

        {/* Divider — 设计稿 12:564: 线150×1 + "或" 12px #52525B + 线150×1 */}
        <div style={{ width: 360, maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: 12, color: '#52525B', fontFamily: 'Noto Sans SC, sans-serif' }}>
            {t('auth.login.or', '或')}
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* OAuthRow — 设计稿 12:568: GithubBtn/WechatBtn 174×44, cornerRadius:10, stroke=rgba(255,255,255,0.1) */}
        <div style={{ width: 360, maxWidth: '100%', display: 'flex', gap: 12 }}>
          <button style={{
            flex: 1, height: 44,
            background: '#131319',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            color: '#D4D4D8', fontSize: 13,
            fontFamily: 'Inter, sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer',
          }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>G</span>
            GitHub
          </button>
          <button style={{
            flex: 1, height: 44,
            background: '#131319',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            color: '#D4D4D8', fontSize: 13,
            fontFamily: 'Noto Sans SC, sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer',
          }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#2DD4BF' }}>W</span>
            微信
          </button>
        </div>

        {/* RegisterLink — 设计稿 12:575: "还没有账号？" 13px #71717A + "立即注册" 13px SemiBold #B86F05 */}
        <div style={{ width: 360, maxWidth: '100%', textAlign: 'center' }}>
          <span style={{ fontSize: 13, color: '#71717A', fontFamily: 'Noto Sans SC, sans-serif' }}>
            {t('auth.login.no_account', '还没有账号？')}
          </span>
          <Link to='/register' style={{ fontSize: 13, fontWeight: 600, color: '#B86F05', fontFamily: 'Noto Sans SC, sans-serif', marginLeft: 4 }}>
            {t('auth.login.register', '立即注册')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;