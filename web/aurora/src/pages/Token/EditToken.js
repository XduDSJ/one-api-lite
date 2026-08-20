import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { API, showError, showSuccess } from '../../helpers';
import NumberStepper from '../../components/NumberStepper';

const Section = ({ title, children }) => (
  <div style={{ padding: 24, marginBottom: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
    <div className='aurora-section-header'><span className='aurora-section-title'>{title}</span></div>
    {children}
  </div>
);

const EditToken = () => {
  const { id } = useParams();
  const isEdit = id !== undefined;
  const [inputs, setInputs] = useState({
    name: '', remain_quota: 0, expired_time: -1, unlimited_quota: true,
    subnet: '', model_limits_enabled: false, model_limits: '',
    allow_channels: '', group: 'default',
  });
  const [loading, setLoading] = useState(isEdit);
  const [expireMode, setExpireMode] = useState('never');
  const [expireDays, setExpireDays] = useState(30);
  const [expireDate, setExpireDate] = useState('');
  const navigate = useNavigate();

  // 下拉选项数据
  const [groupOptions, setGroupOptions] = useState(['default']);
  const [channelOptions, setChannelOptions] = useState([]); // [{id, name}]
  const [modelOptions, setModelOptions] = useState([]); // string[]
  const [selectedChannels, setSelectedChannels] = useState([]); // [id, ...]
  const [selectedModels, setSelectedModels] = useState([]); // [string, ...]
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  useEffect(() => {
    // 加载分组选项（从渠道列表提取）
    API.get('/api/channel/?p=0').then((res) => {
      if (res.data.success && Array.isArray(res.data.data)) {
        const groups = [...new Set(res.data.data.map((c) => c.group).filter(Boolean))];
        if (groups.length > 0) setGroupOptions(groups);
      }
    }).catch(() => {});

    // 加载可用渠道
    API.get('/api/user/accessible_channels').then((res) => {
      if (res.data.success && Array.isArray(res.data.data)) {
        setChannelOptions(res.data.data);
      }
    }).catch(() => {});

    // 加载可用模型
    API.get('/api/channel/models').then((res) => {
      if (res.data.success && Array.isArray(res.data.data)) {
        setModelOptions(res.data.data.map((m) => (typeof m === 'string' ? m : m.id)));
      }
    }).catch(() => {});

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
            model_limits_enabled: d.models ? true : false,
            model_limits: d.models || '',
            allow_channels: d.channel_ids || '',
            group: d.group || 'default',
          });
          // 解析已选渠道
          if (d.channel_ids) {
            setSelectedChannels(d.channel_ids.split(',').map((s) => parseInt(s.trim())).filter(Boolean));
          }
          // 解析已选模型
          if (d.models) {
            setSelectedModels(d.models.split(',').map((s) => s.trim()).filter(Boolean));
          }
          // 设置过期模式
          if (d.expired_time === -1) {
            setExpireMode('never');
          } else if (d.expired_time > 0) {
            const dt = new Date(d.expired_time * 1000);
            setExpireDate(dt.toISOString().slice(0, 10));
            const now = Math.floor(Date.now() / 1000);
            const daysLeft = Math.ceil((d.expired_time - now) / 86400);
            if (daysLeft > 0 && daysLeft < 365) { setExpireMode('days'); setExpireDays(daysLeft); }
            else setExpireMode('date');
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
      return now + (expireDays || 30) * 86400;
    }
    if (expireMode === 'date' && expireDate) {
      return Math.floor(new Date(expireDate).getTime() / 1000);
    }
    return -1;
  };

  const toggleChannel = (chId) => {
    setSelectedChannels((prev) => prev.includes(chId) ? prev.filter((x) => x !== chId) : [...prev, chId]);
  };
  const toggleModel = (m) => {
    setSelectedModels((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };

  const handleSubmit = async () => {
    if (!inputs.name) { showError('请输入名称'); return; }
    const modelsStr = inputs.model_limits_enabled ? selectedModels.join(',') : '';
    const channelIdsStr = selectedChannels.length > 0 ? selectedChannels.join(',') : '';
    const payload = {
      ...inputs,
      remain_quota: parseInt(inputs.remain_quota) || 0,
      expired_time: getExpiredTime(),
      status: parseInt(inputs.status) || 1,
      models: modelsStr,
      channel_ids: channelIdsStr,
    };
    delete payload.model_limits;
    delete payload.allow_channels;
    delete payload.model_limits_enabled;
    if (isEdit) payload.id = parseInt(id);
    const res = await (isEdit ? API.put('/api/token/', payload) : API.post('/api/token/', payload));
    if (res.data.success) {
      showSuccess(isEdit ? '更新成功' : '创建成功');
      navigate('/token');
    } else showError(res.data.message);
  };

  const inputStyle = { width: '100%', height: 44, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, padding: '0 14px' };
  const labelStyle = { fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' };

  // 标签样式（选中项 + 删除叉号）
  const tagStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    height: 26, padding: '0 8px 0 10px',
    borderRadius: 6, fontSize: 12, fontWeight: 500,
    background: 'rgba(184,111,5,0.12)', color: '#B86F05',
    cursor: 'default', margin: '0 4px 4px 0',
  };
  const tagRemoveStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 14, height: 14, borderRadius: '50%',
    background: 'rgba(184,111,5,0.2)', color: '#B86F05',
    fontSize: 10, cursor: 'pointer', lineHeight: 1,
  };

  // 下拉菜单样式
  const dropdownStyle = {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
    background: '#131319', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, maxHeight: 200, overflowY: 'auto',
    marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  };
  const dropdownItemStyle = {
    padding: '8px 12px', fontSize: 13, color: '#D1D5DB',
    cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
  };

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
              <NumberStepper name='remain_quota' value={inputs.remain_quota} onChange={(v) => setInputs({ ...inputs, remain_quota: v })} style={{ ...inputStyle, opacity: inputs.unlimited_quota ? 0.4 : 1 }} />
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
              { v: 'date', label: '指定日期' },
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
              <NumberStepper value={expireDays} onChange={(v) => setExpireDays(v || 30)} style={inputStyle} />
            </div>
          )}
          {expireMode === 'date' && (
            <div>
              <label style={labelStyle}>过期日期</label>
              <input type='date' value={expireDate} onChange={(e) => setExpireDate(e.target.value)} style={inputStyle} />
            </div>
          )}
        </div>
      </Section>

      <Section title='分组'>
        <div style={{ position: 'relative' }}>
          <label style={labelStyle}>所属分组</label>
          <div onClick={() => setGroupDropdownOpen(!groupDropdownOpen)} style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: inputs.group ? '#FFFFFF' : '#71717A' }}>{inputs.group || '选择分组…'}</span>
            <span style={{ color: '#71717A', fontSize: 10 }}>{groupDropdownOpen ? '▲' : '▼'}</span>
          </div>
          {groupDropdownOpen && (
            <div style={dropdownStyle}>
              {groupOptions.map((g) => (
                <div key={g} onClick={() => { setInputs({ ...inputs, group: g }); setGroupDropdownOpen(false); }} style={{ ...dropdownItemStyle, background: inputs.group === g ? 'rgba(184,111,5,0.12)' : 'transparent', color: inputs.group === g ? '#B86F05' : '#D1D5DB' }}>
                  {g}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title='IP 白名单'>
        <div>
          <label style={labelStyle}>允许访问的 IP（CIDR 格式，逗号分隔，留空=不限制）</label>
          <input name='subnet' value={inputs.subnet} onChange={handleChange} placeholder='例: 192.168.1.0/24,10.0.0.1' style={inputStyle} />
        </div>
      </Section>

      <Section title='渠道限制'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>允许使用的渠道（留空=不限制）</label>
            {/* 已选标签 */}
            {selectedChannels.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 8 }}>
                {selectedChannels.map((chId) => {
                  const ch = channelOptions.find((c) => c.id === chId);
                  return (
                    <span key={chId} style={tagStyle}>
                      {ch ? ch.name : `#${chId}`}
                      <span style={tagRemoveStyle} onClick={() => toggleChannel(chId)}>✕</span>
                    </span>
                  );
                })}
              </div>
            )}
            {/* 下拉选择 */}
            <div style={{ position: 'relative' }}>
              <div onClick={() => setChannelDropdownOpen(!channelDropdownOpen)} style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717A' }}>{channelDropdownOpen ? '选择渠道…' : `点击选择（已选 ${selectedChannels.length}）`}</span>
                <span style={{ color: '#71717A', fontSize: 10 }}>{channelDropdownOpen ? '▲' : '▼'}</span>
              </div>
              {channelDropdownOpen && (
                <div style={dropdownStyle}>
                  {channelOptions.length === 0 && <div style={{ ...dropdownItemStyle, color: '#71717A' }}>暂无可用渠道</div>}
                  {channelOptions.map((ch) => (
                    <div key={ch.id} onClick={() => toggleChannel(ch.id)} style={{ ...dropdownItemStyle, background: selectedChannels.includes(ch.id) ? 'rgba(45,212,191,0.12)' : 'transparent', color: selectedChannels.includes(ch.id) ? '#2DD4BF' : '#D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{ch.name}</span>
                      {selectedChannels.includes(ch.id) && <span style={{ color: '#2DD4BF' }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              <label style={labelStyle}>允许的模型（已选 {selectedModels.length} 个）</label>
              {/* 已选标签 */}
              {selectedModels.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 8 }}>
                  {selectedModels.map((m) => (
                    <span key={m} style={tagStyle}>
                      {m}
                      <span style={tagRemoveStyle} onClick={() => toggleModel(m)}>✕</span>
                    </span>
                  ))}
                </div>
              )}
              {/* 下拉选择 */}
              <div style={{ position: 'relative' }}>
                <div onClick={() => setModelDropdownOpen(!modelDropdownOpen)} style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: '#71717A' }}>{modelDropdownOpen ? '选择模型…' : '点击添加模型'}</span>
                  <span style={{ color: '#71717A', fontSize: 10 }}>{modelDropdownOpen ? '▲' : '▼'}</span>
                </div>
                {modelDropdownOpen && (
                  <div style={dropdownStyle}>
                    {modelOptions.filter((m) => !selectedModels.includes(m)).map((m) => (
                      <div key={m} onClick={() => toggleModel(m)} style={dropdownItemStyle}>
                        {m}
                      </div>
                    ))}
                    {modelOptions.filter((m) => !selectedModels.includes(m)).length === 0 && <div style={{ ...dropdownItemStyle, color: '#71717A' }}>全部已选</div>}
                  </div>
                )}
              </div>
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