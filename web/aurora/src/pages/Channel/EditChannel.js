import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess, showInfo, copy } from '../../helpers';
import { CHANNEL_OPTIONS } from '../../constants';
import Dropdown from '../../components/Dropdown';
import NumberStepper from '../../components/NumberStepper';

// 多选分组切换辅助
const toggleInArray = (arr, v) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

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
  const [fetchingModels, setFetchingModels] = useState(false);
  const [groupOptions, setGroupOptions] = useState(['default']);
  const [inputs, setInputs] = useState({
    type: 1, name: '', key: '', base_url: '',
    models: [], groups: ['default'],
    priority: 0, weight: 0, multi_key_mode: 0,
    model_mapping: '',
  });
  const [keys, setKeys] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  // modelAliases: [{original, alias}] — 设计稿 ModelMappingTable 每行
  const [modelAliases, setModelAliases] = useState([]);

  useEffect(() => {
    if (isEdit) {
      API.get(`/api/channel/${id}`).then((res) => {
        if (res.data.success) {
          const d = res.data.data;
          const modelsArr = Array.isArray(d.models) ? d.models
            : (typeof d.models === 'string' ? d.models.split(',').filter(Boolean) : []);
          // 解析 model_mapping（JSON string → alias 数组）
          let aliases = [];
          if (d.model_mapping) {
            try {
              const mapping = typeof d.model_mapping === 'string' ? JSON.parse(d.model_mapping) : d.model_mapping;
              aliases = modelsArr.map((m) => ({ original: m, alias: mapping[m] || '' }));
            } catch { aliases = modelsArr.map((m) => ({ original: m, alias: '' })); }
          } else {
            aliases = modelsArr.map((m) => ({ original: m, alias: '' }));
          }
          setInputs({
            ...d,
            models: modelsArr,
            groups: Array.isArray(d.groups) ? d.groups : (typeof d.groups === 'string' ? d.groups.split(',').filter(Boolean) : ['default']),
            multi_key_mode: d.multi_key_mode ?? 0,
            priority: d.priority ?? 0,
            weight: d.weight ?? 0,
            key: d.key || '',
            base_url: d.base_url || '',
            name: d.name || '',
            model_mapping: d.model_mapping || '',
          });
          setModelAliases(aliases);
          // keys 在 res.data.keys（后端 GetChannel 附带），不在 d 里
          if (Array.isArray(res.data.keys)) setKeys(res.data.keys);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
    API.get('/api/models').then((res) => {
      if (res.data.success && Array.isArray(res.data.data)) setModelOptions(res.data.data);
    }).catch(() => {});
    // 加载分组选项
    API.get('/api/channel/?p=0').then((res) => {
      if (res.data.success && Array.isArray(res.data.data)) {
        const groups = [...new Set(res.data.data.map((c) => c.group).filter(Boolean))];
        if (groups.length > 0) setGroupOptions(groups);
      }
    }).catch(() => {});
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
  };

  // === 多 Key ===
  // 新增 key 用负数临时 id，已有 key 带后端真实 id，后端按 id 做 diff
  const [nextKeyId, setNextKeyId] = useState(-1);
  const addKey = () => {
    setKeys([...keys, { id: nextKeyId, key_value: '', remark: '', priority: 0, daily_quota_limit: 0, quota_reset_rule: '' }]);
    setNextKeyId(nextKeyId - 1);
  };
  const removeKey = (idx) => setKeys(keys.filter((_, i) => i !== idx));
  const updateKey = (idx, field, value) => setKeys(keys.map((k, i) => i === idx ? { ...k, [field]: value } : k));
  // 启用/禁用 key（仅对已保存的 key，id > 0）
  const toggleKeyStatus = async (idx) => {
    const k = keys[idx];
    if (!k.id || k.id < 0) return;
    const isDisabled = k.status === 2;
    const endpoint = isDisabled ? 'enable' : 'disable';
    try {
      const res = await API.post(`/api/channel/${id}/key/${k.id}/${endpoint}`);
      if (res.data.success) {
        setKeys(keys.map((kk, i) => i === idx ? { ...kk, status: isDisabled ? 1 : 2, cooled_until: 0 } : kk));
      } else {
        showError(res.data.message || '操作失败');
      }
    } catch (e) {
      showError(e.message || '操作失败');
    }
  };

  // === 模型映射（设计稿 Section-Mapping 3:2408） ===

  // 从上游获取模型 — 设计稿 FetchModelsBtn 12:11
  const fetchUpstreamModels = async () => {
    setFetchingModels(true);
    try {
      let res;
      if (isEdit) {
        res = await API.get(`/api/channel/fetch_models/${id}`);
      } else {
        // 新建模式：用 type + base_url + key 请求
        // 多 Key 模式下用第一个 key
        const apiKey = inputs.multi_key_mode !== 0 && keys.length > 0 ? keys[0].key_value : inputs.key;
        res = await API.post('/api/channel/fetch_models', {
          type: parseInt(inputs.type),
          key: apiKey,
          base_url: inputs.base_url,
        });
      }
      const { success, message, data } = res.data;
      if (success && Array.isArray(data)) {
        const newModels = data.filter((m) => !inputs.models.includes(m));
        const newAliases = [...modelAliases, ...newModels.map((m) => ({ original: m, alias: '' }))];
        setInputs({ ...inputs, models: [...inputs.models, ...newModels] });
        setModelAliases(newAliases);
        showSuccess(`已获取 ${data.length} 个模型（新增 ${newModels.length}）`);
      } else {
        showError(message || '获取模型失败');
      }
    } catch (e) {
      showError(e.message || '获取模型失败');
    }
    setFetchingModels(false);
  };

  // 手动添加模型行 — 设计稿 AddRow 12:83
  const addModelRow = (modelName) => {
    const name = modelName || '';
    if (name && inputs.models.includes(name)) {
      showInfo('该模型已存在');
      return;
    }
    setInputs({ ...inputs, models: [...inputs.models, name] });
    setModelAliases([...modelAliases, { original: name, alias: '' }]);
  };

  // 移除模型行 — 设计稿 "移除" 按钮
  const removeModelRow = (idx) => {
    setInputs({ ...inputs, models: inputs.models.filter((_, i) => i !== idx) });
    setModelAliases(modelAliases.filter((_, i) => i !== idx));
  };

  // 更新别名 — 设计稿 Alias 列可编辑 input
  const updateModelAlias = (idx, alias) => {
    setModelAliases(modelAliases.map((a, i) => i === idx ? { ...a, alias } : a));
  };

  // 更新模型名（手动添加的空行可以编辑模型名）
  const updateModelName = (idx, name) => {
    setInputs({ ...inputs, models: inputs.models.map((m, i) => i === idx ? name : m) });
    setModelAliases(modelAliases.map((a, i) => i === idx ? { ...a, original: name } : a));
  };

  // 清空所有模型
  const clearAllModels = () => {
    setInputs({ ...inputs, models: [] });
    setModelAliases([]);
  };

  const handleSubmit = async () => {
    if (!inputs.name) { showError('请输入名称'); return; }
    // 构建 model_mapping 对象
    const mapping = {};
    modelAliases.forEach((a) => {
      if (a.alias && a.original) mapping[a.original] = a.alias;
    });
    const payload = {
      ...inputs,
      type: parseInt(inputs.type) || 1,
      weight: parseInt(inputs.weight) || 0,
      priority: parseInt(inputs.priority) || 0,
      multi_key_mode: parseInt(inputs.multi_key_mode) || 0,
      models: Array.isArray(inputs.models) ? inputs.models.join(',') : (inputs.models || ''),
      groups: Array.isArray(inputs.groups) ? inputs.groups.join(',') : (inputs.groups || 'default'),
      model_mapping: Object.keys(mapping).length > 0 ? JSON.stringify(mapping) : '',
      keys: parseInt(inputs.multi_key_mode) !== 0 ? keys : undefined,
    };
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
      <div style={{ padding: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
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
              <label style={labelStyle}>API 地址（OpenAI 兼容类型填上游地址，如 https://api.openai.com）</label>
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

          {inputs.multi_key_mode === 0 && (
            <div>
              <label style={labelStyle}>密钥</label>
              <input name='key' value={inputs.key} onChange={handleInputChange} placeholder='sk-...' style={{ ...inputStyle, fontFamily: 'JetBrains Mono, monospace' }} />
            </div>
          )}

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
                    <span style={{ width: 120, fontSize: 11.5, fontWeight: 500, color: '#71717A', textAlign: 'center' }}>操作</span>
                  </div>
                  {keys.map((k, idx) => {
                    const limit = k.daily_quota_limit || 0;
                    const used = k.daily_used_quota || 0;
                    const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                    const barColor = pct < 50 ? '#2DD4BF' : pct < 80 ? '#F5A623' : '#EF4444';
                    // key 状态徽章：1=启用 2=禁用 3=冷却 4=耗尽
                    const isSaved = k.id && k.id > 0;
                    const statusInfo = isSaved ? (() => {
                      switch (k.status) {
                        case 2: return { label: '禁用', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
                        case 3: return { label: '冷却', color: '#F5A623', bg: 'rgba(245,166,35,0.12)' };
                        case 4: return { label: '耗尽', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
                        default: return { label: '启用', color: '#2DD4BF', bg: 'rgba(45,212,191,0.12)' };
                      }
                    })() : null;
                    return (
                    <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      {/* 编辑行 */}
                      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 4px', gap: 8 }}>
                        <div style={{ width: 248, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input value={k.key_value} onChange={(e) => updateKey(idx, 'key_value', e.target.value)} placeholder='sk-...' style={{ flex: 1, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#FFFFFF', fontSize: 12, padding: '0 8px', fontFamily: 'JetBrains Mono, monospace' }} />
                          {statusInfo && <span style={{ flexShrink: 0, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, color: statusInfo.color, background: statusInfo.bg, whiteSpace: 'nowrap' }}>{statusInfo.label}</span>}
                        </div>
                        <input value={k.remark} onChange={(e) => updateKey(idx, 'remark', e.target.value)} placeholder='—' style={{ width: 118, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#FFFFFF', fontSize: 12, padding: '0 8px' }} />
                        <NumberStepper value={k.priority} onChange={(v) => updateKey(idx, 'priority', v)} width={68} height={36} center style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12 }} />
                        <input type='text' inputMode='numeric' value={k.daily_quota_limit} onChange={(e) => updateKey(idx, 'daily_quota_limit', parseInt(e.target.value.replace(/[^\d]/g, '')) || 0)} placeholder='0' style={{ width: 118, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#FFFFFF', fontSize: 12, padding: '0 8px' }} />
                        <select value={k.quota_reset_rule} onChange={(e) => updateKey(idx, 'quota_reset_rule', e.target.value)} style={{ width: 118, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#FFFFFF', fontSize: 12, padding: '0 8px' }}>
                          {resetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <div style={{ width: 120, display: 'flex', gap: 4, justifyContent: 'center' }}>
                          {isSaved && (
                            <button onClick={() => toggleKeyStatus(idx)} style={{ height: 36, padding: '0 10px', background: k.status === 2 ? 'rgba(45,212,191,0.1)' : 'rgba(245,166,35,0.1)', border: 'none', borderRadius: 6, color: k.status === 2 ? '#2DD4BF' : '#F5A623', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>{k.status === 2 ? '启用' : '禁用'}</button>
                          )}
                          <button onClick={() => removeKey(idx)} style={{ width: 50, height: 36, background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: 6, color: '#EF4444', fontSize: 11.5, fontWeight: 500, cursor: 'pointer' }}>删除</button>
                        </div>
                      </div>
                      {/* 配额使用条 — 仅在有配额限制时显示 */}
                      {limit > 0 && (
                        <div style={{ padding: '0 12px 6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10.5, color: '#71717A', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>
                            已用 {(used / 500000).toFixed(1)}$
                          </span>
                          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
                          </div>
                          <span style={{ fontSize: 10.5, color: '#71717A', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>
                            {(limit / 500000).toFixed(0)}$
                          </span>
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: barColor, whiteSpace: 'nowrap', minWidth: 32, textAlign: 'right' }}>
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
              <button onClick={addKey} style={{ width: '100%', height: 40, marginTop: 8, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(184,111,5,0.4)', borderRadius: 8, color: '#B86F05', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ 添加密钥</button>
              <div style={{ fontSize: 11.5, color: '#71717A', marginTop: 8 }}>重置时刻按 4 小时一档：00:00 / 04:00 / 08:00 / 12:00 / 16:00 / 20:00 / 不重置；每日配额 0 表示不限</div>
            </div>
          )}
        </div>

        {/* Section 3: 模型映射 — 按设计稿 3:2408 1:1 还原 */}
        <div style={{ marginBottom: 24 }}>
          {/* MappingHeader: 标题 + 右侧按钮组 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#7A8290' }}>模型映射</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* FetchModelsBtn — 设计稿 12:11: 金色边框透明底, "从上游获取模型" */}
              <button
                onClick={fetchUpstreamModels}
                disabled={fetchingModels}
                style={{
                  height: 28, padding: '0 12px',
                  background: 'rgba(184,111,5,0.12)',
                  border: '1px solid rgba(184,111,5,0.5)',
                  borderRadius: 6,
                  color: '#B86F05', fontSize: 12, fontWeight: 600,
                  cursor: fetchingModels ? 'not-allowed' : 'pointer',
                  opacity: fetchingModels ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {fetchingModels ? '获取中…' : '从上游获取模型'}
              </button>
              {/* 清空按钮 */}
              {modelAliases.length > 0 && (
                <button
                  onClick={clearAllModels}
                  style={{
                    height: 28, padding: '0 12px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    color: '#A1A1AA', fontSize: 12, fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  清空
                </button>
              )}
            </div>
          </div>

          {/* ModelMappingTable — 设计稿 12:57: 4列表格 */}
          <div style={{
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, overflow: 'hidden',
            background: 'rgba(255,255,255,0.03)',
          }}>
            {/* HeaderRow — 设计稿 12:58: 32px高, bg=rgba(255,255,255,0.05) */}
            <div style={{
              display: 'flex', height: 32, alignItems: 'center',
              background: 'rgba(255,255,255,0.05)',
            }}>
              <span style={{ width: 48, fontSize: 11, fontWeight: 600, color: '#7A8290', textAlign: 'center' }}>#</span>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#7A8290' }}>模型</span>
              <span style={{ width: 220, fontSize: 11, fontWeight: 600, color: '#7A8290' }}>别名</span>
              <span style={{ width: 64, fontSize: 11, fontWeight: 600, color: '#7A8290', textAlign: 'center' }}>操作</span>
            </div>

            {/* DataRows — 设计稿 12:63~12:82: 36px高, 交替背景 */}
            {modelAliases.map((row, idx) => (
              <div key={idx} style={{
                display: 'flex', height: 36, alignItems: 'center',
                background: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderTop: '1px solid rgba(255,255,255,0.04)',
              }}>
                {/* # — 序号 12px Regular #7A8290 center */}
                <span style={{ width: 48, fontSize: 12, color: '#7A8290', textAlign: 'center' }}>{idx + 1}</span>
                {/* 模型 — 12px JetBrains Mono #FFFFFF，空行可编辑 */}
                <div style={{ flex: 1, padding: '0 8px' }}>
                  <input
                    value={row.original}
                    onChange={(e) => updateModelName(idx, e.target.value)}
                    placeholder='输入模型名称'
                    style={{
                      width: '100%', height: 28,
                      background: 'transparent', border: '1px solid transparent',
                      borderRadius: 4, color: '#FFFFFF',
                      fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
                      padding: '0 6px',
                    }}
                    onFocus={(e) => { e.target.style.border = '1px solid rgba(255,255,255,0.15)'; e.target.style.background = 'rgba(255,255,255,0.05)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                  />
                </div>
                {/* 别名 — 11px JetBrains Mono, 有值=#2DD4BF, 无值=placeholder #71717A */}
                <div style={{ width: 220, padding: '0 8px' }}>
                  <input
                    value={row.alias}
                    onChange={(e) => updateModelAlias(idx, e.target.value)}
                    placeholder='点击设置别名'
                    style={{
                      width: '100%', height: 28,
                      background: 'transparent', border: '1px solid transparent',
                      borderRadius: 4,
                      color: row.alias ? '#2DD4BF' : '#71717A',
                      fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                      padding: '0 6px',
                    }}
                    onFocus={(e) => { e.target.style.border = '1px solid rgba(255,255,255,0.15)'; e.target.style.background = 'rgba(255,255,255,0.05)'; }}
                    onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
                  />
                </div>
                {/* 操作 — "移除" 11px Medium #EF4444 center */}
                <div style={{ width: 64, textAlign: 'center' }}>
                  <button
                    onClick={() => removeModelRow(idx)}
                    style={{
                      background: 'none', border: 'none',
                      color: '#EF4444', fontSize: 11, fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    移除
                  </button>
                </div>
              </div>
            ))}

            {/* AddRow — 设计稿 12:83: 金色虚线, "手动添加模型" */}
            <div style={{
              display: 'flex', height: 36, alignItems: 'center', justifyContent: 'center',
              borderTop: '1px solid rgba(184,111,5,0.3)',
              gap: 6, cursor: 'pointer',
            }} onClick={() => addModelRow('')}>
              <span style={{ color: '#B86F05', fontSize: 16, fontWeight: 700 }}>+</span>
              <span style={{ color: '#B86F05', fontSize: 12, fontWeight: 500 }}>手动添加模型</span>
            </div>
          </div>

          {/* TableHint — 设计稿 12:87: 提示文字 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1px solid #71717A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#71717A' }}>i</span>
            <span style={{ fontSize: 11, color: '#71717A' }}>点击「从上游获取模型」自动填充模型列表；别名不填则使用上游模型名；可手动添加行录入自定义模型</span>
          </div>
        </div>

        {/* Section 4: 高级设置 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#A1A1AA', marginBottom: 12 }}>高级设置</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>优先级</label>
              <NumberStepper name='priority' value={inputs.priority} onChange={(v) => setInputs({ ...inputs, priority: v })} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>权重</label>
              <NumberStepper name='weight' value={inputs.weight} onChange={(v) => setInputs({ ...inputs, weight: v })} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>分组</label>
              <Dropdown
                multiple
                placeholder='选择分组…'
                options={groupOptions.map((g) => ({ label: g, value: g, selected: (inputs.groups || []).includes(g) }))}
                onToggle={(g) => setInputs({ ...inputs, groups: toggleInArray(inputs.groups || [], g) })}
              />
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