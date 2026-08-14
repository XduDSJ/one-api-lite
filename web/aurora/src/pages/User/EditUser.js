import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { API, showError, showSuccess } from '../../helpers';
import { renderQuota } from '../../helpers/render';

const EditUser = () => {
  const { id } = useParams();
  const isEdit = id !== undefined;
  const [inputs, setInputs] = useState({ username: '', display_name: '', password: '', quota: 0, group: 'default' });
  const [loading, setLoading] = useState(isEdit);
  const navigate = useNavigate();

  useEffect(() => {
    if (isEdit) {
      API.get(`/api/user/${id}`).then((res) => {
        if (res.data.success) setInputs({
          ...res.data.data,
          username: res.data.data.username || '',
          display_name: res.data.data.display_name || '',
          password: '',
          quota: res.data.data.quota ?? 0,
          group: res.data.data.group || 'default',
        });
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleSubmit = async () => {
    if (!inputs.username) { showError('请输入用户名'); return; }
    const payload = {
      ...inputs,
      quota: parseInt(inputs.quota) || 0,
      role: parseInt(inputs.role) || 1,
      status: parseInt(inputs.status) || 1,
    };
    if (isEdit) payload.id = parseInt(id);
    if (!payload.password) delete payload.password;
    const res = await (isEdit ? API.put('/api/user/', payload) : API.post('/api/user/', payload));
    if (res.data.success) {
      showSuccess(isEdit ? '更新成功' : '创建成功');
      navigate('/user');
    } else showError(res.data.message);
  };

  const inputStyle = { width: '100%', height: 44, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, padding: '0 14px' };
  const labelStyle = { fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>加载中…</div>;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className='aurora-card' style={{ padding: 24 }}>
        <div className='aurora-section-header'><span className='aurora-section-title'>{isEdit ? '编辑用户' : '创建用户'}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><label style={labelStyle}>用户名</label><input value={inputs.username} onChange={(e) => setInputs({ ...inputs, username: e.target.value })} placeholder='输入用户名' style={inputStyle} /></div>
          <div><label style={labelStyle}>显示名称</label><input value={inputs.display_name} onChange={(e) => setInputs({ ...inputs, display_name: e.target.value })} placeholder='可选' style={inputStyle} /></div>
          <div><label style={labelStyle}>密码{isEdit ? '（留空不修改）' : ''}</label><input type='password' value={inputs.password} onChange={(e) => setInputs({ ...inputs, password: e.target.value })} placeholder='输入密码' style={inputStyle} /></div>
          <div><label style={labelStyle}>额度</label><input type='number' value={inputs.quota} onChange={(e) => setInputs({ ...inputs, quota: parseInt(e.target.value) || 0 })} style={inputStyle} /></div>
          <div><label style={labelStyle}>分组</label><input value={inputs.group} onChange={(e) => setInputs({ ...inputs, group: e.target.value })} placeholder='default' style={inputStyle} /></div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Link to='/user' className='aurora-btn aurora-btn-ghost'>取消</Link>
            <button className='aurora-btn aurora-btn-primary' onClick={handleSubmit}>{isEdit ? '保存' : '创建'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditUser;