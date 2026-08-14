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
      <div style={{ position: 'relative', minHeight: 'calc(100vh - 72px)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Glow — 设计稿 19:2/19:3/19:4 */}
        <div style={{ position: 'absolute', top: 400, left: -200, width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,230,178,0.18) 0%, rgba(245,230,178,0) 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -100, right: -100, width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,166,35,0.12) 0%, rgba(245,166,35,0) 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: '40%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,212,191,0.10) 0%, rgba(45,212,191,0) 70%)', pointerEvents: 'none' }} />

        {/* 品牌卡 — 设计稿 19:6 Content */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 600, width: '100%' }}>
          <div className='aurora-card' style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <img src={logo} alt='logo' style={{ width: 56, height: 56, borderRadius: 14 }} />
              <span style={{ fontSize: 28, fontWeight: 700, color: '#FFFFFF' }}>One API Lite</span>
            </div>
            <div style={{ fontSize: 16, color: '#A1A1AA', textAlign: 'center' }}>LLM API 管理 & 分发系统</div>
            <div style={{ fontSize: 14, color: '#71717A', textAlign: 'center', lineHeight: 1.6 }}>支持多种模型统一 API 适配，包括 OpenAI / Anthropic / Gemini / Azure 等，可用于二次分发管理 key</div>

            {/* GitHub 链接区 */}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <a href='https://github.com/XduDSJ/one-api-lite' target='_blank' rel='noopener noreferrer' className='aurora-btn aurora-btn-primary'>GitHub 仓库</a>
              <a href='https://github.com/XduDSJ/one-api-lite/issues' target='_blank' rel='noopener noreferrer' className='aurora-btn aurora-btn-ghost'>问题反馈</a>
            </div>

            {/* 技术栈标签 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
              {['Go', 'Gin', 'GORM', 'React', 'Recharts', 'Docker'].map((tech) => (
                <span key={tech} className='aurora-badge aurora-badge-gray'>{tech}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (about.startsWith('https://')) return <iframe src={about} style={{ width: '100%', height: '80vh', border: 'none' }} />;
  return <div className='aurora-card' style={{ padding: 24, maxWidth: 800, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: about }} />;
};

export default About;