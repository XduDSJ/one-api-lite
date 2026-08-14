import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API, getLogo, showError } from '../../helpers';
import { marked } from 'marked';

const Home = () => {
  const [homeContent, setHomeContent] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('home_page_content');
    if (saved) setHomeContent(saved);
    API.get('/api/status').then((res) => {
      if (res.data.success && res.data.data?.home_page_content) {
        const c = res.data.data.home_page_content;
        setHomeContent(c.startsWith('https://') ? c : marked.parse(c));
        localStorage.setItem('home_page_content', c);
      }
    }).catch(() => {});
  }, []);

  if (!homeContent) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
        <img src={getLogo()} alt='logo' style={{ width: 48, height: 48, borderRadius: 12 }} />
        <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}>One API Lite</div>
        <div style={{ fontSize: 14, color: '#A1A1AA' }}>LLM API 管理 & 分发系统</div>
        <Link to='/dashboard' className='aurora-btn aurora-btn-primary' style={{ marginTop: 8 }}>进入仪表盘</Link>
      </div>
    );
  }

  if (homeContent.startsWith('https://')) {
    return <iframe src={homeContent} style={{ width: '100%', height: '80vh', border: 'none' }} />;
  }

  return <div style={{ maxWidth: 800, margin: '0 auto' }} dangerouslySetInnerHTML={{ __html: homeContent }} />;
};

export default Home;