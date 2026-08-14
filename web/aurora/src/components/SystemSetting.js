import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../helpers';

const SystemSetting = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({});
  const [loading, setLoading] = useState(true);

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

  const submitOption = async (key) => {
    const res = await API.put('/api/option/', { key, value: inputs[key] });
    if (res.data.success) showSuccess('保存成功');
    else showError(res.data.message);
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
    <div>
      <Section title='基本设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>系统名称</label>
            <input name='SystemName' value={inputs.SystemName || ''} onChange={handleInputChange} placeholder='One API' style={inputStyle} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('SystemName')}>保存</button>
          <div>
            <label style={labelStyle}>Logo 地址</label>
            <input name='Logo' value={inputs.Logo || ''} onChange={handleInputChange} placeholder='https://...' style={inputStyle} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('Logo')}>保存</button>
        </div>
      </Section>

      <Section title='运营设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>额度提醒倍率</label>
            <input name='QuotaPerUnit' value={inputs.QuotaPerUnit || ''} onChange={handleInputChange} placeholder='500000' style={inputStyle} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('QuotaPerUnit')}>保存</button>
          <div>
            <label style={labelStyle}>显示金额</label>
            <select name='DisplayInCurrency' value={inputs.DisplayInCurrency || 'false'} onChange={handleInputChange} style={inputStyle}>
              <option value='false'>否</option>
              <option value='true'>是</option>
            </select>
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('DisplayInCurrency')}>保存</button>
        </div>
      </Section>

      <Section title='内容设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>公告内容</label>
            <textarea name='Notice' value={inputs.Notice || ''} onChange={handleInputChange} placeholder='输入公告内容…' style={{ ...inputStyle, height: 100, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('Notice')}>保存</button>
          <div>
            <label style={labelStyle}>关于页面内容</label>
            <textarea name='About' value={inputs.About || ''} onChange={handleInputChange} placeholder='输入关于页面内容（支持 Markdown）…' style={{ ...inputStyle, height: 150, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('About')}>保存</button>
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
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('RegisterEnabled')}>保存</button>
          <div>
            <label style={labelStyle}>邮箱验证</label>
            <select name='EmailVerificationEnabled' value={inputs.EmailVerificationEnabled || 'false'} onChange={handleInputChange} style={inputStyle}>
              <option value='false'>关闭</option>
              <option value='true'>开启</option>
            </select>
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('EmailVerificationEnabled')}>保存</button>
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
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => { submitOption('SMTPServer'); submitOption('SMTPPort'); submitOption('SMTPAccount'); submitOption('SMTPToken'); }}>保存全部</button>
        </div>
      </Section>

      <Section title='额度与计费'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>额度提醒倍率</label>
            <input name='QuotaPerUnit' value={inputs.QuotaPerUnit || ''} onChange={handleInputChange} placeholder='500000' style={inputStyle} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('QuotaPerUnit')}>保存</button>
          <div>
            <label style={labelStyle}>显示金额</label>
            <select name='DisplayInCurrency' value={inputs.DisplayInCurrency || 'false'} onChange={handleInputChange} style={inputStyle}>
              <option value='false'>否</option>
              <option value='true'>是</option>
            </select>
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('DisplayInCurrency')}>保存</button>
        </div>
      </Section>

      <Section title='首页内容'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>首页内容（支持 Markdown 或 URL）</label>
            <textarea name='HomePageContent' value={inputs.HomePageContent || ''} onChange={handleInputChange} placeholder='输入首页内容…' style={{ ...inputStyle, height: 150, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <button className='aurora-btn aurora-btn-primary aurora-btn-sm' onClick={() => submitOption('HomePageContent')}>保存</button>
        </div>
      </Section>
    </div>
  );
};

export default SystemSetting;