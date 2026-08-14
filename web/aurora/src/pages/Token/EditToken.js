import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { renderQuota } from '../../helpers/render';

const EditToken = () => {
  const { id } = useParams();
  const isEdit = id !== undefined;
  const [inputs, setInputs] = useState({
    name: '', remain_quota: 0, expired_time: -1, unlimited_quota: false,
    subnet: '', model_limits_enabled: false, model_limits: '',
    allow_channels: '', group: '',
  });
  const [loading, setLoading] = useState(isEdit);
  const [expireMode, setExpireMode] = useState('never'); // never / custom / days
  const [expireDays, setExpireDays] = useState(30);
  const navigate = useNavigate();

  useEffect(() => {
    if (isEdit) {
      API.get(`/api/token/${id}`).then((res) => {
        if (res.data.success) {
          const d = res.data.data;
          setInputs({
            name: d.name || '',
            remain_quota: d.remain_quota ?? 0,
            expired_time: d.expired_time ?? -1,
            unlimited_quota: d.unlimited_quota ?? false,
            subnet: d.subnet || '',
            model_limits_enabled: d.model_limits_enabled ?? false,
            model_limits: Array.isArray(d.model_limits) ? d.model_limits.join('\n') : (d.model_limits || ''),
            allow_channels: Array.isArray(d.allow_channels) ? d.allow_channels.join(',') : (d.allow_channels || ''),
            group: d.group || '',
          });
          // 设置过期模式
          if (d.expired_time === -1) setExpireMode('never');
          else if (d.expired_time > 0) {
            const now = Math.floor(Date.now() / 1000);
            const daysLeft = Math.ceil((d.expired_time - now) / 86400);
            if (daysLeft > 0 && daysLeft < 365) { setExpireMode('days'); setExpireDays(daysLeft); }
            else setExpireMode('custom');
          }
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setInputs((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const getExpiredTime = () => {
    if (expireMode === 'never') return -1;
    if (expireMode === 'days') {
      const now = Math.floor(Date.now() / 1000);
      return now + expireDays * 86400;
    }
    return parseInt(inputs.expired_time) || -1;
  };

  const handleSubmit = async () => {
    if (!inputs.name) { showError('请输入名称'); return; }
    const modelLimits = inputs.model_limits_enabled ? inputs.model_limits.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    const allowChannels = inputs.allow_channels ? inputs.allow_channels.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const payload = {
      ...inputs,
      remain_quota: parseInt(inputs.remain_quota) || 0,
      expired_time: getExpiredTime(),
      status: parseInt(inputs.status) || 1,
      model_limits: modelLimits,
      allow_channels: allowChannels,
    };
    if (isEdit) payload.id = parseInt(id);
    const res = await (isEdit ? API.put('/api/token/', payload) : API.post('/api/token/', payload));
    if (res.data.success) {
      showSuccess(isEdit ? '更新成功' : '创建成功');
      navigate('/token');
    } else showError(res.data.message);
  };

  const inputStyle = { width: '100%', height: 44, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, padding: '0 14px' };
  const labelStyle = { fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' };
  const Section = ({ title, children }) => (
    <div className='aurora-card' style={{ padding: 24, marginBottom: 16 }}>
      <div className='aurora-section-header'><span className='aurora-section-title'>{title}</span></div>
      {children}
    </div>
  );

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>加载中…</div>;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Section title={isEdit ? '编辑令牌' : '创建令牌'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>名称</label>
            <input name='name' value={inputs.name} onChange={handleChange} placeholder='输入令牌名称' style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>剩余额度</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type='number' name='remain_quota' value={inputs.remain_quota} onChange={handleChange} disabled={inputs.unlimited_quota} style={{ ...inputStyle, opacity: inputs.unlimited_quota ? 0.4 : 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#A1A1AA', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type='checkbox' name='unlimited_quota' checked={inputs.unlimited_quota} onChange={handleChange} /> 无限额度
              </label>
            </div>
          </div>
        </div>
      </Section>

      <Section title='有效期'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { v: 'never', label: '永不过期' },
              { v: 'days', label: '指定天数' },
              { v: 'custom', label: '自定义时间戳' },
            ].map((opt) => (
              <button key={opt.v} onClick={() => setExpireMode(opt.v)} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                background: expireMode === opt.v ? 'rgba(184,111,5,0.15)' : 'rgba(255,255,255,0.04)',
                border: expireMode === opt.v ? '1px solid rgba(184,111,5,0.5)' : '1px solid rgba(255,255,255,0.08)',
                color: expireMode === opt.v ? '#B86F05' : '#A1A1AA',
              }}>{opt.label}</button>
            ))}
          </div>
          {expireMode === 'days' && (
            <div>
              <label style={labelStyle}>有效天数</label>
              <input type='number' value={expireDays} onChange={(e) => setExpireDays(parseInt(e.target.value) || 30)} style={inputStyle} />
            </div>
          )}
          {expireMode === 'custom' && (
            <div>
              <label style={labelStyle}>过期时间戳（Unix 秒，-1=永不过期）</label>
              <input type='number' name='expired_time' value={inputs.expired_time} onChange={handleChange} style={inputStyle} />
            </div>
          )}
        </div>
      </Section>

      <Section title='IP 白名单'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>允许访问的 IP（CIDR 格式，逗号分隔，留空=不限制）</label>
            <input name='subnet' value={inputs.subnet} onChange={handleChange} placeholder='例: 192.168.1.0/24,10.0.0.1' style={inputStyle} />
          </div>
        </div>
      </Section>

      <Section title='渠道限制'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>允许使用的渠道 ID（逗号分隔，留空=不限制）</label>
            <input name='allow_channels' value={inputs.allow_channels} onChange={handleChange} placeholder='例: 1,2,3' style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>分组</label>
            <input name='group' value={inputs.group} onChange={handleChange} placeholder='default' style={inputStyle} />
          </div>
        </div>
      </Section>

      <Section title='模型限制'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#A1A1AA', cursor: 'pointer' }}>
            <input type='checkbox' name='model_limits_enabled' checked={inputs.model_limits_enabled} onChange={handleChange} /> 启用模型限制
          </label>
          {inputs.model_limits_enabled && (
            <div>
              <label style={labelStyle}>允许的模型（每行一个）</label>
              <textarea name='model_limits' value={inputs.model_limits} onChange={handleChange} placeholder={'gpt-4o\ngpt-4o-mini\nclaude-3.5-sonnet'} style={{ ...inputStyle, height: 120, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }} />
            </div>
          )}
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Link to='/token' className='aurora-btn aurora-btn-ghost'>取消</Link>
        <button className='aurora-btn aurora-btn-primary' onClick={handleSubmit}>{isEdit ? '保存' : '创建'}</button>
      </div>
    </div>
  );
};

export default EditToken;