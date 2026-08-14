import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Icon, Image } from 'semantic-ui-react';
import { API, getLogo, showError } from '../../helpers';
import { marked } from 'marked';

const About = () => {
  const { t } = useTranslation();
  const [about, setAbout] = useState('');
  const [aboutLoaded, setAboutLoaded] = useState(false);
  const logo = getLogo();

  const displayAbout = async () => {
    setAbout(localStorage.getItem('about') || '');
    const res = await API.get('/api/about');
    const { success, message, data } = res.data;
    if (success) {
      let aboutContent = data;
      if (!data.startsWith('https://')) {
        aboutContent = marked.parse(data);
      }
      setAbout(aboutContent);
      localStorage.setItem('about', aboutContent);
    } else {
      showError(message);
      setAbout(t('about.loading_failed'));
    }
    setAboutLoaded(true);
  };

  useEffect(() => {
    displayAbout().then();
  }, []);

  if (!aboutLoaded) {
    return null;
  }

  // 自定义内容（关于页为空时显示设计稿风格）
  if (about === '') {
    return (
      <div className='aurora-dashboard'>
        <Card fluid className='aurora-chart-card' style={{ maxWidth: 720, margin: '0 auto' }}>
          <Card.Content style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
            <div className='aurora-login-brand' style={{ justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
              <Image src={logo} style={{ width: 48, height: 48 }} />
              <span className='aurora-login-brandname' style={{ fontSize: 24 }}>One API Lite</span>
            </div>
            <h2 style={{ color: 'var(--aurora-text)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              {t('about.title')}
            </h2>
            <p style={{ color: 'var(--aurora-text-muted)', marginBottom: 'var(--space-5)' }}>
              {t('about.description')}
            </p>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-3) var(--space-5)',
              background: 'var(--aurora-surface-2)',
              border: '1px solid var(--aurora-border)',
              borderRadius: 'var(--radius-md)',
            }}>
              <Icon name='github' />
              <a
                href='https://github.com/XduDSJ/one-api-lite'
                target='_blank'
                rel='noopener noreferrer'
                style={{ color: 'var(--aurora-primary)', fontWeight: 500 }}
              >
                {t('about.repository')} github.com/XduDSJ/one-api-lite
              </a>
            </div>
          </Card.Content>
        </Card>
      </div>
    );
  }

  // 自定义内容或 iframe
  if (about.startsWith('https://')) {
    return (
      <iframe
        src={about}
        style={{ width: '100%', height: '100vh', border: 'none' }}
      />
    );
  }

  return (
    <div className='aurora-dashboard'>
      <Card fluid className='aurora-chart-card'>
        <Card.Content>
          <div dangerouslySetInnerHTML={{ __html: about }} />
        </Card.Content>
      </Card>
    </div>
  );
};

export default About;