import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../helpers';
import { renderQuota, renderNumber } from '../helpers/render';

const RechargeModal = ({ user, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const displayInCurrency = localStorage.getItem('display_in_currency') === 'true';
  const quotaPerUnit = parseFloat(localStorage.getItem('quota_per_unit') || '1');
  const parsed = parseFloat(amount) || 0;
  const addQuota = displayInCurrency ? Math.round(parsed * quotaPerUnit) : Math.round(parsed);
  const newQuota = (user?.quota || 0) + addQuota;
  const quickAmounts = displayInCurrency ? [100, 500, 1000, 5000] : [1000000, 5000000, 10000000, 50000000];

  const handleSubmit = async () => {
    if (!amount || parsed <= 0) { showError('请输入有效金额'); return; }
    setSubmitting(true);
    try {
      const res = await API.get(`/api/user/${user.id}`);
      const { success, data, message } = res.data;
      if (!success) { showError(message); setSubmitting(false); return; }
      const calculated = data.quota + addQuota;
      const updateRes = await API.put('/api/user/', { ...data, quota: calculated });
      if (updateRes.data.success) {
        showSuccess(t('user.recharge.messages.success', '充值成功'));
        if (onSuccess) onSuccess(user.id, calculated);
        onClose();
      } else showError(updateRes.data.message);
    } catch (e) { showError(e.message); }
    setSubmitting(false);
  };

  if (!user) return null;

  const inputStyle = { width: '100%', height: 44, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, padding: '0 14px' };

  return (
    <div className='aurora-modal-overlay' onClick={onClose}>
      <div className='aurora-modal' style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className='aurora-modal-header'>
          <span className='aurora-modal-title'>{t('user.recharge.title', '用户充值')}</span>
          <button className='aurora-modal-close' onClick={onClose}>✕</button>
        </div>
        <div className='aurora-modal-body' style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#A1A1AA', fontSize: 13 }}>用户: <strong style={{ color: '#FFFFFF' }}>{user.username}</strong></span>
            <span style={{ color: '#A1A1AA', fontSize: 13 }}>当前额度: <strong style={{ color: '#FFFFFF' }}>{renderQuota(user.quota, t)}</strong></span>
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' }}>{displayInCurrency ? '充值金额 ($)' : '充值额度'}</label>
            <input type='number' min='0' value={amount} onChange={(e) => setAmount(e.target.value)} placeholder='输入金额' style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' }}>快捷金额</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {quickAmounts.map((a) => (
                <button key={a} className='aurora-btn aurora-btn-ghost aurora-btn-sm' onClick={() => setAmount(String(a))}>
                  {displayInCurrency ? `+$${a}` : `+${renderNumber(a)}`}
                </button>
              ))}
            </div>
          </div>
          {amount && parsed > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <span className='aurora-badge aurora-badge-gray'>{renderQuota(user.quota, t)}</span>
              <span style={{ color: '#A1A1AA' }}>+</span>
              <span className='aurora-badge aurora-badge-cyan'>{renderQuota(addQuota, t)}</span>
              <span style={{ color: '#A1A1AA' }}>=</span>
              <span className='aurora-badge aurora-badge-gold'>{renderQuota(newQuota, t)}</span>
            </div>
          )}
          <div>
            <label style={{ fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' }}>备注</label>
            <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder='可选备注' style={inputStyle} />
          </div>
        </div>
        <div className='aurora-modal-footer'>
          <span style={{ fontSize: 12, color: '#52525B' }}>修改后需重新确认用户额度</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className='aurora-btn aurora-btn-ghost' onClick={onClose} disabled={submitting}>取消</button>
            <button className='aurora-btn aurora-btn-primary' onClick={handleSubmit} disabled={submitting || !amount || parsed <= 0}>{submitting ? '处理中…' : '确认充值'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RechargeModal;