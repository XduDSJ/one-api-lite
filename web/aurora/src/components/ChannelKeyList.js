import React, { useState } from 'react';
import { API, showError, showSuccess } from '../helpers';

const ChannelKeyList = ({ channelId, multiKeyMode }) => {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/api/channel/${channelId}/keys`);
      if (res.data.success) setKeys(res.data.data || []);
    } catch (e) { showError(e); }
    setLoading(false);
  };

  React.useEffect(() => { if (channelId && multiKeyMode) loadKeys(); }, [channelId, multiKeyMode]);

  if (!multiKeyMode) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 8 }}>密钥列表 ({keys.length})</div>
      <div className='aurora-table'>
        <div className='aurora-table-header'>
          <span style={{ width: 200 }}>密钥</span>
          <span style={{ width: 100 }}>备注</span>
          <span style={{ width: 60 }}>优先级</span>
          <span style={{ width: 100 }}>状态</span>
        </div>
        {keys.map((k, i) => (
          <div className='aurora-table-row' key={i}>
            <span style={{ width: 200, color: '#A1A1AA', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{k.key_value?.slice(0, 20)}…</span>
            <span style={{ width: 100, color: '#D1D5DB' }}>{k.remark || '—'}</span>
            <span style={{ width: 60, color: '#B86F05', fontWeight: 700 }}>{k.priority}</span>
            <span style={{ width: 100 }}>
              <span className={`aurora-badge aurora-badge-${k.quota_state === 'normal' ? 'cyan' : k.quota_state === 'exhausted' ? 'red' : 'gold'}`}>
                {k.quota_state === 'normal' ? '正常' : k.quota_state === 'exhausted' ? '耗尽' : '冷却'}
              </span>
            </span>
          </div>
        ))}
        {keys.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#71717A' }}>暂无密钥</div>}
      </div>
    </div>
  );
};

export default ChannelKeyList;