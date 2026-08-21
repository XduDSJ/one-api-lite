import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../helpers';

// 移到组件外部，避免每次重渲染创建新引用导致 input 失焦
const inputStyle = { width: '100%', height: 44, background: '#0D0D12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#FFFFFF', fontSize: 13, padding: '0 14px' };
const labelStyle = { fontSize: 13, color: '#A1A1AA', marginBottom: 8, display: 'block' };

const Section = ({ title, children }) => (
  <div className='aurora-card' style={{ padding: 24, marginBottom: 16 }}>
    <div className='aurora-section-header'><span className='aurora-section-title'>{title}</span></div>
    {children}
  </div>
);

const SystemSetting = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({}); // 按节 key 记录 saving 状态

  useEffect(() => {
    API.get('/api/option/').then((res) => {
      if (res.data.success) {
        const opts = {};
        res.data.data.forEach((o) => { opts[o.key] = o.value; });
        setInputs(opts);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
  };

  // 批量提交一节内的多个 key，统一成功/失败提示
  const submitOptions = async (sectionKey, keys) => {
    setSaving((prev) => ({ ...prev, [sectionKey]: true }));
    try {
      const results = await Promise.all(
        keys.map((key) => API.put('/api/option/', { key, value: inputs[key] ?? '' }))
      );
      const failed = results.find((r) => !r.data.success);
      if (failed) showError(failed.data.message);
      else showSuccess('保存成功');
    } catch (err) {
      showError(err.message || '保存失败');
    } finally {
      setSaving((prev) => ({ ...prev, [sectionKey]: false }));
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>加载中…</div>;

  return (
    <div>
      <Section title='基本设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>系统名称</label>
            <input name='SystemName' value={inputs.SystemName || ''} onChange={handleInputChange} placeholder='One API' style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Logo 地址</label>
            <input name='Logo' value={inputs.Logo || ''} onChange={handleInputChange} placeholder='https://...' style={inputStyle} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' style={{ alignSelf: 'flex-start' }} disabled={saving.basic} onClick={() => submitOptions('basic', ['SystemName', 'Logo'])}>{saving.basic ? '保存中…' : '保存本节'}</button>
        </div>
      </Section>

      <Section title='运营与计费设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>额度提醒倍率</label>
            <input name='QuotaPerUnit' value={inputs.QuotaPerUnit || ''} onChange={handleInputChange} placeholder='500000' style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>显示金额</label>
            <select name='DisplayInCurrency' value={inputs.DisplayInCurrency || 'false'} onChange={handleInputChange} style={inputStyle}>
              <option value='false'>否</option>
              <option value='true'>是</option>
            </select>
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' style={{ alignSelf: 'flex-start' }} disabled={saving.ops} onClick={() => submitOptions('ops', ['QuotaPerUnit', 'DisplayInCurrency'])}>{saving.ops ? '保存中…' : '保存本节'}</button>
        </div>
      </Section>

      <Section title='内容设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>公告内容</label>
            <textarea name='Notice' value={inputs.Notice || ''} onChange={handleInputChange} placeholder='输入公告内容…' style={{ ...inputStyle, height: 100, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <div>
            <label style={labelStyle}>关于页面内容</label>
            <textarea name='About' value={inputs.About || ''} onChange={handleInputChange} placeholder='输入关于页面内容（支持 Markdown）…' style={{ ...inputStyle, height: 150, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' style={{ alignSelf: 'flex-start' }} disabled={saving.content} onClick={() => submitOptions('content', ['Notice', 'About'])}>{saving.content ? '保存中…' : '保存本节'}</button>
        </div>
      </Section>

      <Section title='登录注册设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>允许注册</label>
            <select name='RegisterEnabled' value={inputs.RegisterEnabled || 'true'} onChange={handleInputChange} style={inputStyle}>
              <option value='true'>允许</option>
              <option value='false'>禁止</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>邮箱验证</label>
            <select name='EmailVerificationEnabled' value={inputs.EmailVerificationEnabled || 'false'} onChange={handleInputChange} style={inputStyle}>
              <option value='false'>关闭</option>
              <option value='true'>开启</option>
            </select>
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' style={{ alignSelf: 'flex-start' }} disabled={saving.auth} onClick={() => submitOptions('auth', ['RegisterEnabled', 'EmailVerificationEnabled'])}>{saving.auth ? '保存中…' : '保存本节'}</button>
        </div>
      </Section>

      <Section title='邮件 SMTP 设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>SMTP 服务器</label>
            <input name='SMTPServer' value={inputs.SMTPServer || ''} onChange={handleInputChange} placeholder='smtp.example.com' style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>SMTP 端口</label>
            <input name='SMTPPort' value={inputs.SMTPPort || ''} onChange={handleInputChange} placeholder='587' style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>SMTP 账号</label>
            <input name='SMTPAccount' value={inputs.SMTPAccount || ''} onChange={handleInputChange} placeholder='user@example.com' style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>SMTP 密码/Token</label>
            <input type='password' name='SMTPToken' value={inputs.SMTPToken || ''} onChange={handleInputChange} placeholder='••••••••' style={inputStyle} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' style={{ alignSelf: 'flex-start' }} disabled={saving.smtp} onClick={() => submitOptions('smtp', ['SMTPServer', 'SMTPPort', 'SMTPAccount', 'SMTPToken'])}>{saving.smtp ? '保存中…' : '保存本节'}</button>
        </div>
      </Section>

      <Section title='渠道与重试设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>渠道失败冷却秒数（失败后临时跳过该渠道，0=不冷却）</label>
            <input name='ChannelFailCooldownSec' value={inputs.ChannelFailCooldownSec ?? 300} onChange={handleInputChange} type='number' min='0' style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>连续失败自动禁用渠道</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type='button'
                onClick={() => setInputs((prev) => ({ ...prev, ChannelAutoDisableEnabled: 'true' }))}
                style={{
                  height: 32, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: (inputs.ChannelAutoDisableEnabled === 'true' || inputs.ChannelAutoDisableEnabled === true) ? 'linear-gradient(135deg, #B86F05, #945200)' : 'rgba(255,255,255,0.05)',
                  color: (inputs.ChannelAutoDisableEnabled === 'true' || inputs.ChannelAutoDisableEnabled === true) ? '#FFFFFF' : '#71717A',
                }}
              >启用</button>
              <button
                type='button'
                onClick={() => setInputs((prev) => ({ ...prev, ChannelAutoDisableEnabled: 'false' }))}
                style={{
                  height: 32, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: (inputs.ChannelAutoDisableEnabled === 'false' || inputs.ChannelAutoDisableEnabled === undefined) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                  color: (inputs.ChannelAutoDisableEnabled === 'false' || inputs.ChannelAutoDisableEnabled === undefined) ? '#EF4444' : '#71717A',
                }}
              >关闭</button>
            </div>
          </div>
          <div>
            <label style={labelStyle}>连续失败阈值（达到此次数后自动禁用渠道）</label>
            <input name='ChannelAutoDisableFailureCount' value={inputs.ChannelAutoDisableFailureCount ?? 5} onChange={handleInputChange} type='number' min='1' style={inputStyle} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' style={{ alignSelf: 'flex-start' }} disabled={saving.retry} onClick={() => submitOptions('retry', ['ChannelFailCooldownSec', 'ChannelAutoDisableEnabled', 'ChannelAutoDisableFailureCount'])}>{saving.retry ? '保存中…' : '保存本节'}</button>
        </div>
      </Section>

      <Section title='首页内容'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>首页内容（支持 Markdown 或 URL）</label>
            <textarea name='HomePageContent' value={inputs.HomePageContent || ''} onChange={handleInputChange} placeholder='输入首页内容…' style={{ ...inputStyle, height: 150, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' style={{ alignSelf: 'flex-start' }} disabled={saving.home} onClick={() => submitOptions('home', ['HomePageContent'])}>{saving.home ? '保存中…' : '保存本节'}</button>
        </div>
      </Section>
    </div>
  );
};

export default SystemSetting;
