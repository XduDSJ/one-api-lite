import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
    <div style={{ fontSize: 64, fontWeight: 800, color: '#FFFFFF' }}>404</div>
    <div style={{ fontSize: 16, color: '#A1A1AA' }}>页面不存在</div>
    <Link to='/' className='aurora-btn aurora-btn-primary' style={{ marginTop: 8 }}>返回首页</Link>
  </div>
);

export default NotFound;