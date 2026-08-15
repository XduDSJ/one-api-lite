import React, { useState, useEffect } from 'react';

let confirmResolver = null;

export const showConfirm = (title, message) => {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    window.dispatchEvent(new CustomEvent('show-confirm', { detail: { title, message } }));
  });
};

export const ConfirmModal = () => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ title: '', message: '' });

  useEffect(() => {
    const handler = (e) => {
      setData(e.detail);
      setOpen(true);
    };
    window.addEventListener('show-confirm', handler);
    return () => window.removeEventListener('show-confirm', handler);
  }, []);

  const handleClose = (result) => {
    setOpen(false);
    if (confirmResolver) {
      confirmResolver(result);
      confirmResolver = null;
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={() => handleClose(false)}>
      <div style={{
        background: '#131319', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, width: 400, maxWidth: '90vw',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 52, padding: '0 20px',
          background: '#1A1A22', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF' }}>{data.title || '确认'}</span>
          <button onClick={() => handleClose(false)} style={{ background: 'none', border: 'none', color: '#A1A1AA', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: '#D1D5DB', lineHeight: 1.6, margin: 0 }}>{data.message}</p>
        </div>
        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
          height: 56, padding: '0 20px',
          background: '#1A1A22', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <button onClick={() => handleClose(false)} style={{
            height: 34, padding: '0 16px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#A1A1AA', fontSize: 13, fontWeight: 500,
          }}>取消</button>
          <button onClick={() => handleClose(true)} style={{
            height: 34, padding: '0 16px', borderRadius: 8, cursor: 'pointer',
            background: 'linear-gradient(135deg, #B86F05, #945200)', border: 'none',
            color: '#FFFFFF', fontSize: 13, fontWeight: 600,
          }}>确认</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;