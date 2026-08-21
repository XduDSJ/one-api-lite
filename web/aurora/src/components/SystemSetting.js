import React, { useEffect, useState, useRef, useCallback } from 'react';
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

// 每个 Section 的字段映射
const SECTION_KEYS = {
  basic: ['SystemName', 'Logo'],
  ops: ['QuotaPerUnit', 'DisplayInCurrency'],
  content: ['Notice', 'About'],
  auth: ['RegisterEnabled', 'EmailVerificationEnabled'],
  smtp: ['SMTPServer', 'SMTPPort', 'SMTPAccount', 'SMTPToken'],
  retry: ['ChannelFailCooldownSec', 'ChannelAutoDisableEnabled', 'ChannelAutoDisableFailureCount'],
  home: ['HomePageContent'],
};

// key → section 反向映射
const keyToSection = {};
Object.entries(SECTION_KEYS).forEach(([sec, keys]) => keys.forEach((k) => { keyToSection[k] = sec; }));

const SystemSetting = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [savedHint, setSavedHint] = useState({}); // {sectionKey: 'saving'|'saved'|''}
  const timersRef = useRef({}); // 防抖定时器
  const initialRef = useRef({}); // 初始值，避免加载完就触发自动保存

  useEffect(() => {
    API.get('/api/option/').then((res) => {
      if (res.data.success) {
        const opts = {};
        res.data.data.forEach((o) => { opts[o.key] = o.value; });
        setInputs(opts);
        initialRef.current = { ...opts };
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // 自动保存单个 key（防抖 1 秒）
  const autoSave = useCallback((key) => {
    const section = keyToSection[key];
    if (!section) return;
    // 清除该 section 的已有定时器
    if (timersRef.current[section]) clearTimeout(timersRef.current[section]);
    timersRef.current[section] = setTimeout(async () => {
      const keys = SECTION_KEYS[section];
      setSavedHint((prev) => ({ ...prev, [section]: 'saving' }));
      try {
        const results = await Promise.all(
          keys.map((k) => {
            let v = inputs[k] ?? '';
            // 数字字段空值兜底为0
            if (v === '' && ['ChannelFailCooldownSec', 'ChannelAutoDisableFailureCount', 'QuotaPerUnit'].includes(k)) v = '0';
            return API.put('/api/option/', { key: k, value: v });
          })
        );
        const failed = results.find((r) => !r.data.success);
        if (failed) {
          showError(failed.data.message);
          setSavedHint((prev) => ({ ...prev, [section]: '' }));
        } else {
          setSavedHint((prev) => ({ ...prev, [section]: 'saved' }));
          setTimeout(() => setSavedHint((prev) => ({ ...prev, [section]: '' })), 2000);
        }
      } catch (err) {
        showError(err.message || '保存失败');
        setSavedHint((prev) => ({ ...prev, [section]: '' }));
      }
    }, 1000);
  }, [inputs]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // 数字字段过滤非数字，允许空值（保存时兜底）
    let val = value;
    if (e.target.type === 'number') {
      val = value.replace(/[^\d]/g, '');
      // 去掉前导0：0300 → 300，但保留单个0
      if (val.length > 1 && val[0] === '0') val = val.replace(/^0+/, '');
    }
    setInputs((prev) => {
      const next = { ...prev, [name]: val };
      if (initialRef.current[name] !== val) {
        setTimeout(() => autoSave(name), 0);
      }
      return next;
    });
  };

  // 按钮点击也触发自动保存
  const handleBtnChange = (name, value) => {
    setInputs((prev) => {
      const next = { ...prev, [name]: value };
      // 初始值可能是 undefined/''/'false'，统一按字符串比较
      const initVal = initialRef.current[name] ?? 'false';
      if (initVal !== value) {
        setTimeout(() => autoSave(name), 0);
      }
      return next;
    });
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>加载中…</div>;

  const hintStyle = (section) => {
    const h = savedHint[section];
    if (h === 'saving') return { fontSize: 12, color: '#F5A623' };
    if (h === 'saved') return { fontSize: 12, color: '#2DD4BF' };
    return { fontSize: 12, color: '#52525B' };
  };
  const hintText = (section) => {
    const h = savedHint[section];
    if (h === 'saving') return '保存中…';
    if (h === 'saved') return '已自动保存 ✓';
    return '修改后自动保存';
  };

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
          <span style={hintStyle('basic')}>{hintText('basic')}</span>
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
          <span style={hintStyle('ops')}>{hintText('ops')}</span>
        </div>
      </Section>

      <Section title='内容设置'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 公告内容 — aurora 主题没有公告展示页，暂注释
          <div>
            <label style={labelStyle}>公告内容</label>
            <textarea name='Notice' value={inputs.Notice || ''} onChange={handleInputChange} placeholder='输入公告内容…' style={{ ...inputStyle, height: 100, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          */}
          <div>
            <label style={labelStyle}>关于页面内容</label>
            <textarea name='About' value={inputs.About || ''} onChange={handleInputChange} placeholder='输入关于页面内容（支持 Markdown）…' style={{ ...inputStyle, height: 150, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <span style={hintStyle('content')}>{hintText('content')}</span>
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
          <span style={hintStyle('auth')}>{hintText('auth')}</span>
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
          <span style={hintStyle('smtp')}>{hintText('smtp')}</span>
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
                onClick={() => handleBtnChange('ChannelAutoDisableEnabled', 'true')}
                style={{
                  height: 32, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: (inputs.ChannelAutoDisableEnabled === 'true' || inputs.ChannelAutoDisableEnabled === true) ? 'linear-gradient(135deg, #B86F05, #945200)' : 'rgba(255,255,255,0.05)',
                  color: (inputs.ChannelAutoDisableEnabled === 'true' || inputs.ChannelAutoDisableEnabled === true) ? '#FFFFFF' : '#71717A',
                }}
              >启用</button>
              <button
                type='button'
                onClick={() => handleBtnChange('ChannelAutoDisableEnabled', 'false')}
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
          <span style={hintStyle('retry')}>{hintText('retry')}</span>
        </div>
      </Section>

      {/* 首页内容 — aurora 主题 / 直接重定向到 /dashboard，没有首页，暂注释
      <Section title='首页内容'>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>首页内容（支持 Markdown 或 URL）</label>
            <textarea name='HomePageContent' value={inputs.HomePageContent || ''} onChange={handleInputChange} placeholder='输入首页内容…' style={{ ...inputStyle, height: 150, paddingTop: 12, fontFamily: 'JetBrains Mono, monospace' }} />
          </div>
          <span style={hintStyle('home')}>{hintText('home')}</span>
        </div>
      </Section>
      */}
    </div>
  );
};

export default SystemSetting;
