import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess, showInfo, copy } from '../../helpers';
import { CHANNEL_OPTIONS } from '../../constants';

const typeMap = {};
CHANNEL_OPTIONS.forEach((o) => { typeMap[o.value] = o; });

const resetOptions = [
  { value: '', label: '不重置' },
  { value: '00:00', label: '00:00' },
  { value: '04:00', label: '04:00' },
  { value: '08:00', label: '08:00' },
  { value: '12:00', label: '12:00' },
  { value: '16:00', label: '16:00' },
  { value: '20:00', label: '20:00' },
];

const EditChannel = () => {
  const { id } = useParams();
  const isEdit = id !== undefined;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(isEdit);
  const [inputs, setInputs] = useState({ type: 1, name: '', key: '', base_url: '', models: [], groups: ['default'], priority: 0, weight: 0, multi_key_mode: 0 });
  const [keys, setKeys] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [customModel, setCustomModel] = useState('');

  useEffect(() => {
    if (isEdit) {
      API.get(`/api/channel/${id}`).then((res) => {
        if (res.data.success) {
          const d = res.data.data;
          setInputs(d);
          if (d.keys) setKeys(d.keys);
        }
        setLoading(false);
      });
    }
    // Load model options
    API.get('/api/models').then((res) => {
      if (res.data.success) setModelOptions(res.data.data.map((m) => ({ value: m, label: m })));
    }).catch(() => {});
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
  };

  const addKey = () => setKeys([...keys, { key_value: '', remark: '', priority: 0, daily_quota_limit: 0, quota_reset_rule: '' }]);
  const removeKey = (idx) => setKeys(keys.filter((_, i) => i !== idx));
  const updateKey = (idx, field, value) => setKeys(keys.map((k, i) => i === idx ? { ...k, [field]: value } : k));

  const addCustomModel = () => {
    if (customModel && !inputs.models.includes(customModel)) {
      setInputs({ ...inputs, models: [...inputs.models, customModel] });
      setCustomModel('');
    }
  };

  const handleSubmit = async () => {
    if (!inputs.name) { showError('请输入名称'); return; }
    const payload = { ...inputs, keys: inputs.multi_key_mode !== 0 ? keys : undefined };
    if (isEdit) payload.id = parseInt(id);
    const res = await (isEdit ? API.put('/api/channel/', payload) : API.post('/api/channel/', payload));
    if (res.data.success) {
      showSuccess(isEdit ? '更新成功' : '创建成功');
      navigate('/channel');
    } else showError(res.data.message);
  };

  const handleCancel = () => navigate('/channel');

  const inputStyle = { width: '100%', height: 44, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, padding: '0 14px' };
  const labelStyle = { fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>加载中…</div>;

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div className='aurora-card' style={{ padding: 24 }}>
        {/* Header */}
        <div className='aurora-section-header'>
          <span className='aurora-section-title'>{isEdit ? '编辑渠道' : '添加渠道'}</span>
        </div>

        {/* Section 1: 基本信息 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#A1A1AA', marginBottom: 12 }}>基本信息</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>类型</label>
              <select name='type' value={inputs.type} onChange={handleInputChange} style={inputStyle}>
                {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>名称</label>
              <input name='name' value={inputs.name} onChange={handleInputChange} placeholder='输入渠道名称' style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>代理地址（可选）</label>
              <input name='base_url' value={inputs.base_url || ''} onChange={handleInputChange} placeholder='https://api.openai.com' style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Section 2: 密钥管理 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#A1A1AA', marginBottom: 12 }}>密钥管理</div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>多 Key 模式</label>
            <select name='multi_key_mode' value={inputs.multi_key_mode} onChange={handleInputChange} style={inputStyle}>
              <option value={0}>关闭（单 Key）</option>
              <option value={1}>优先级 + 故障转移</option>
              <option value={2}>前缀分片</option>
              <option value={3}>轮询</option>
              <option value={4}>最少已用比例优先</option>
            </select>
          </div>

          {/* 单 Key 模式 */}
          {inputs.multi_key_mode === 0 && (
            <div>
              <label style={labelStyle}>密钥</label>
              <input name='key' value={inputs.key} onChange={handleInputChange} placeholder='sk-...' style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace' }} />
            </div>
          )}

          {/* 多 Key 表格 */}
          {inputs.multi_key_mode !== 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#A1A1AA' }}>密钥列表 ({keys.length})</span>
              </div>
              {keys.length > 0 && (
                <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', height: 28, alignItems: 'center', padding: '0 4px', gap: 8, background: 'rgba(255,255,255,0.03)' }}>
                    <span style={{ width: 248, fontSize: 11.5, fontWeight: 500, color: '#71717A' }}>密钥</span>
                    <span style={{ width: 118, fontSize: 11.5, fontWeight: 500, color: '#71717A' }}>备注</span>
                    <span style={{ width: 68, fontSize: 11.5, fontWeight: 500, color: '#71717A', textAlign: 'center' }}>优先级</span>
                    <span style={{ width: 118, fontSize: 11.5, fontWeight: 500, color: '#71717A' }}>每日配额</span>
                    <span style={{ width: 118, fontSize: 11.5, fontWeight: 500, color: '#71717A' }}>重置时刻</span>
                    <span style={{ width: 56, fontSize: 11.5, fontWeight: 500, color: '#71717A', textAlign: 'center' }}>操作</span>
                  </div>
                  {keys.map((k, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '8px 4px', gap: 8, background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <input value={k.key_value} onChange={(e) => updateKey(idx, 'key_value', e.target.value)} placeholder='sk-...' style={{ width: 248, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#FFFFFF', fontSize: 12, padding: '0 8px', fontFamily: 'JetBrains Mono, monospace' }} />
                      <input value={k.remark} onChange={(e) => updateKey(idx, 'remark', e.target.value)} placeholder='—' style={{ width: 118, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#FFFFFF', fontSize: 12, padding: '0 8px' }} />
                      <input type='number' value={k.priority} onChange={(e) => updateKey(idx, 'priority', parseInt(e.target.value) || 0)} style={{ width: 68, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#FFFFFF', fontSize: 12, padding: '0 8px', textAlign: 'center' }} />
                      <input type='number' value={k.daily_quota_limit} onChange={(e) => updateKey(idx, 'daily_quota_limit', parseInt(e.target.value) || 0)} placeholder='0' style={{ width: 118, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#FFFFFF', fontSize: 12, padding: '0 8px' }} />
                      <select value={k.quota_reset_rule} onChange={(e) => updateKey(idx, 'quota_reset_rule', e.target.value)} style={{ width: 118, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#FFFFFF', fontSize: 12, padding: '0 8px' }}>
                        {resetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button onClick={() => removeKey(idx)} style={{ width: 56, height: 36, background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 6, color: '#EF4444', fontSize: 11.5, fontWeight: 500, cursor: 'pointer' }}>删除</button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={addKey} style={{ width: '100%', height: 40, marginTop: 8, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(184,111,5,0.4)', borderRadius: 8, color: '#B86F05', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ 添加密钥</button>
              <div style={{ fontSize: 11.5, color: '#71717A', marginTop: 8 }}>重置时刻按 4 小时一档：00:00 / 04:00 / 08:00 / 12:00 / 16:00 / 20:00 / 不重置；每日配额 0 表示不限</div>
            </div>
          )}
        </div>

        {/* Section 3: 模型 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#A1A1AA', marginBottom: 12 }}>模型</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {inputs.models.map((m) => (
                <span key={m} className='aurora-badge aurora-badge-cyan' style={{ cursor: 'pointer' }} onClick={() => setInputs({ ...inputs, models: inputs.models.filter((x) => x !== m) })}>{m} ✕</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { addCustomModel(); e.preventDefault(); } }} placeholder='输入模型名称' style={{ ...inputStyle, flex: 1 }} />
              <button className='aurora-btn aurora-btn-ghost' onClick={addCustomModel}>添加</button>
            </div>
          </div>
        </div>

        {/* Section 4: 高级设置 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#A1A1AA', marginBottom: 12 }}>高级设置</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>优先级</label>
              <input type='number' name='priority' value={inputs.priority} onChange={handleInputChange} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>权重</label>
              <input type='number' name='weight' value={inputs.weight} onChange={handleInputChange} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>分组</label>
              <input name='groups' value={inputs.groups?.join(',') || ''} onChange={(e) => setInputs({ ...inputs, groups: e.target.value.split(',').filter(Boolean) })} placeholder='default' style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 12, color: '#52525B' }}>修改后需重新测试渠道可用性</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className='aurora-btn aurora-btn-ghost' onClick={handleCancel}>取消</button>
            <button className='aurora-btn aurora-btn-primary' onClick={handleSubmit}>{isEdit ? '保存' : '创建'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditChannel;