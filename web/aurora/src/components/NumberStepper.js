import React from 'react';

/**
 * NumberStepper — 自定义数字输入框，替代原生 type='number'
 * 无原生箭头，自定义上下按钮，深色配色
 *
 * props: value, onChange, min, max, step, width, height, placeholder, center
 */
const NumberStepper = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  width = '100%',
  height = 44,
  placeholder = '0',
  center = false,
  style = {},
}) => {
  const val = typeof value === 'number' ? value : (parseInt(value) || 0);
  const stepVal = typeof step === 'number' ? step : (parseInt(step) || 1);

  const clamp = (v) => {
    if (min !== undefined && v < min) return min;
    if (max !== undefined && v > max) return max;
    return v;
  };

  const inc = () => onChange(clamp(val + stepVal));
  const dec = () => onChange(clamp(val - stepVal));

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    width,
    height,
    background: style.background || '#0D0D12',
    border: style.border || '1px solid rgba(255,255,255,0.08)',
    borderRadius: style.borderRadius || 10,
    overflow: 'hidden',
    ...style,
  };

  const inputStyle = {
    flex: 1,
    height: '100%',
    background: 'transparent',
    border: 'none',
    color: '#FFFFFF',
    fontSize: style.fontSize || 13,
    fontFamily: style.fontFamily || 'inherit',
    padding: `0 ${center ? '0' : '14px'}`,
    textAlign: center ? 'center' : 'left',
    outline: 'none',
    width: '100%',
    // 彻底移除原生箭头
    WebkitAppearance: 'none',
    MozAppearance: 'textfield',
  };

  const btnStyle = {
    width: 32,
    height: '100%',
    flexShrink: 0,
    background: 'rgba(255,255,255,0.04)',
    border: 'none',
    color: '#A1A1AA',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    userSelect: 'none',
  };

  return (
    <div style={containerStyle}>
      {/* 输入框 */}
      <input
        type='text'
        inputMode='numeric'
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d-]/g, '');
          const num = raw === '' || raw === '-' ? 0 : parseInt(raw);
          onChange(clamp(num));
        }}
        style={inputStyle}
      />
      {/* 自定义上下按钮 */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          type='button'
          onClick={inc}
          style={{ ...btnStyle, height: '50%', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          onMouseEnter={(e) => { e.target.style.background = 'rgba(184,111,5,0.15)'; e.target.style.color = '#B86F05'; }}
          onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.04)'; e.target.style.color = '#A1A1AA'; }}
        >
          ▲
        </button>
        <button
          type='button'
          onClick={dec}
          style={{ ...btnStyle, height: '50%' }}
          onMouseEnter={(e) => { e.target.style.background = 'rgba(184,111,5,0.15)'; e.target.style.color = '#B86F05'; }}
          onMouseLeave={(e) => { e.target.style.background = 'rgba(255,255,255,0.04)'; e.target.style.color = '#A1A1AA'; }}
        >
          ▼
        </button>
      </div>
    </div>
  );
};

export default NumberStepper;