import React from 'react';

const Chat = () => {
  const chatLink = localStorage.getItem('chat_link');
  if (chatLink) {
    return <iframe src={chatLink} style={{ width: '100%', height: 'calc(100vh - 72px)', border: 'none' }} />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
      <div style={{ fontSize: 48 }}>{'chat'}</div>
      <div style={{ fontSize: 16, color: '#A1A1AA' }}>{'Chat not configured'}</div>
      <div style={{ fontSize: 13, color: '#52525B' }}>{'Please set ChatLink in system settings'}</div>
    </div>
  );
};

export default Chat;