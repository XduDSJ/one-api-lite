import React, { useState } from 'react';
import { API, showError, showSuccess } from '../helpers';

const ChannelTestModal = ({ channel, onClose }) => {
  const [results, setResults] = useState({}); // { modelName: { status: 'testing'|'success'|'fail', time, message } }
  const [testingAll, setTestingAll] = useState(false);

  if (!channel) return null;

  // 从渠道数据获取模型列表
  const models = Array.isArray(channel.models)
    ? channel.models
    : (typeof channel.models === 'string' ? channel.models.split(',').filter(Boolean) : []);

  // 测试单个模型
  const testModel = async (modelName) => {
    setResults((prev) => ({ ...prev, [modelName]: { status: 'testing' } }));
    try {
      const res = await API.get(`/api/channel/test/${channel.id}?model=${encodeURIComponent(modelName)}`);
      const { success, message, time, modelName: retModel } = res.data;
      if (success) {
        setResults((prev) => ({ ...prev, [modelName]: { status: 'success', time, message } }));
      } else {
        setResults((prev) => ({ ...prev, [modelName]: { status: 'fail', message: message || '测试失败' } }));
      }
    } catch (e) {
      setResults((prev) => ({ ...prev, [modelName]: { status: 'fail', message: e.message || '请求失败' } }));
    }
  };

  // 全部测试
  const testAll = async () => {
    setTestingAll(true);
    for (const m of models) {
      await testModel(m);
    }
    setTestingAll(false);
  };

  const successCount = Object.values(results).filter((r) => r.status === 'success').length;
  const failCount = Object.values(results).filter((r) => r.status === 'fail').length;

  const modalStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const contentStyle = {
    background: '#131319', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16, width: 600, maxWidth: '90vw', maxHeight: '80vh',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 8px 16px rgba(0,0,0,0.8)',
  };

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 56, padding: '0 24px',
          background: '#1A1A22', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF' }}>
            测试渠道 — <span style={{ color: '#B86F05' }}>{channel.name || `#${channel.id}`}</span>
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#A1A1AA', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {/* 统计 + 全部测试 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#A1A1AA' }}>
            <span>共 {models.length} 个模型</span>
            {successCount > 0 && <span style={{ color: '#2DD4BF' }}>✓ {successCount} 成功</span>}
            {failCount > 0 && <span style={{ color: '#EF4444' }}>✗ {failCount} 失败</span>}
          </div>
          <button
            onClick={testAll}
            disabled={testingAll || models.length === 0}
            style={{
              height: 32, padding: '0 16px',
              background: 'rgba(184,111,5,0.12)',
              border: '1px solid rgba(184,111,5,0.5)',
              borderRadius: 8,
              color: '#B86F05', fontSize: 13, fontWeight: 600,
              cursor: testingAll ? 'not-allowed' : 'pointer',
              opacity: testingAll ? 0.6 : 1,
            }}
          >
            {testingAll ? '测试中…' : '全部测试'}
          </button>
        </div>

        {/* 模型列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {models.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>该渠道未配置模型</div>
          )}
          {models.map((m) => {
            const r = results[m];
            return (
              <div key={m} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 24px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}>
                {/* 模型名 */}
                <span style={{
                  flex: 1, fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#FFFFFF',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{m}</span>

                {/* 结果 */}
                {r?.status === 'testing' && (
                  <span style={{ fontSize: 12, color: '#A1A1AA' }}>测试中…</span>
                )}
                {r?.status === 'success' && (
                  <span style={{ fontSize: 12, color: '#2DD4BF', fontWeight: 500 }}>✓ {r.time}s</span>
                )}
                {r?.status === 'fail' && (
                  <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 500 }} title={r.message}>✗ 失败</span>
                )}

                {/* 测试按钮 */}
                <button
                  onClick={() => testModel(m)}
                  disabled={r?.status === 'testing'}
                  style={{
                    height: 28, padding: '0 12px',
                    background: r?.status === 'success' ? 'rgba(45,212,191,0.1)' : 'rgba(255,255,255,0.05)',
                    border: '1px solid ' + (r?.status === 'success' ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.1)'),
                    borderRadius: 6,
                    color: r?.status === 'success' ? '#2DD4BF' : r?.status === 'fail' ? '#EF4444' : '#A1A1AA',
                    fontSize: 12, fontWeight: 500,
                    cursor: r?.status === 'testing' ? 'not-allowed' : 'pointer',
                    opacity: r?.status === 'testing' ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r?.status === 'testing' ? '…' : r?.status === 'success' ? '重测' : '测试'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          height: 56, padding: '0 24px',
          background: '#1A1A22', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <button onClick={onClose} className='aurora-btn aurora-btn-ghost aurora-btn-sm'>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default ChannelTestModal;