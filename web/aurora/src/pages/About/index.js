import React, { useEffect, useState } from 'react';
import { API, getLogo, showError } from '../../helpers';
import { marked } from 'marked';

const About = () => {
  const [about, setAbout] = useState('');
  const [loaded, setLoaded] = useState(false);
  const logo = getLogo();

  useEffect(() => {
    const saved = localStorage.getItem('about');
    if (saved) setAbout(saved);
    API.get('/api/about').then((res) => {
      const { success, message, data } = res.data;
      if (success) {
        const c = data.startsWith('https://') ? data : marked.parse(data);
        setAbout(c);
        localStorage.setItem('about', c);
      } else showError(message);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  if (!about) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt='logo' style={{ width: 48, height: 48, borderRadius: 12 }} />
          <span style={{ fontSize: 24, fontWeight: 700, color: '#FFFFFF' }}>One API Lite</span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF' }}>关于</h2>
        <p style={{ fontSize: 14, color: '#A1A1AA' }}>LLM API 管理 & 分发系统，支持多种模型统一 API 适配</p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: '#1A1A22', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
          <span style={{ fontSize: 14 }}>GitHub:</span>
          <a href='https://github.com/XduDSJ/one-api-lite' target='_blank' rel='noopener noreferrer' style={{ color: '#B86F05', fontWeight: 500, fontSize: 14 }}>
            github.com/XduDSJ/one-api-lite
          </a>
        </div>
      </div>
    );
  }

  if (about.startsWith('https://')) return <iframe src={about} style={{ width: '100%', height: '80vh', border: 'none' }} />;
  return <div className='aurora-card' style={{ padding: 24, maxWidth: 800, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: about }} />;
};

export default About;