import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { renderQuota } from '../../helpers/render';

const EditToken = () => {
  const { id } = useParams();
  const isEdit = id !== undefined;
  const [inputs, setInputs] = useState({ name: '', remain_quota: 0, expired_time: -1, unlimited_quota: false });
  const [loading, setLoading] = useState(isEdit);
  const navigate = useNavigate();

  useEffect(() => {
    if (isEdit) {
      API.get(`/api/token/${id}`).then((res) => {
        if (res.data.success) setInputs({
          ...res.data.data,
          name: res.data.data.name || '',
          remain_quota: res.data.data.remain_quota ?? 0,
          expired_time: res.data.data.expired_time ?? -1,
          unlimited_quota: res.data.data.unlimited_quota ?? false,
        });
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleSubmit = async () => {
    if (!inputs.name) { showError('请输入名称'); return; }
    const payload = { ...inputs };
    if (isEdit) payload.id = parseInt(id);
    const res = await (isEdit ? API.put('/api/token/', payload) : API.post('/api/token/', payload));
    if (res.data.success) {
      showSuccess(isEdit ? '更新成功' : '创建成功');
      navigate('/token');
    } else showError(res.data.message);
  };

  const inputStyle = { width: '100%', height: 44, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, padding: '0 14px' };
  const labelStyle = { fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>加载中…</div>;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className='aurora-card' style={{ padding: 24 }}>
        <div className='aurora-section-header'><span className='aurora-section-title'>{isEdit ? '编辑令牌' : '创建令牌'}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>名称</label>
            <input value={inputs.name} onChange={(e) => setInputs({ ...inputs, name: e.target.value })} placeholder='输入令牌名称' style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>剩余额度</label>
            <input type='number' value={inputs.remain_quota} onChange={(e) => setInputs({ ...inputs, remain_quota: parseInt(e.target.value) || 0 })} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type='checkbox' id='unlimited' checked={inputs.unlimited_quota} onChange={(e) => setInputs({ ...inputs, unlimited_quota: e.target.checked })} />
            <label htmlFor='unlimited' style={{ fontSize: 13, color: '#A1A1AA', cursor: 'pointer' }}>无限额度</label>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Link to='/token' className='aurora-btn aurora-btn-ghost'>取消</Link>
            <button className='aurora-btn aurora-btn-primary' onClick={handleSubmit}>{isEdit ? '保存' : '创建'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditToken;