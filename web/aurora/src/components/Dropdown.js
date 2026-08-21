import React, { useState, useRef, useEffect } from 'react';

/**
 * 通用下拉框组件，自动处理点击外部关闭
 *
 * 单选模式（默认）：
 *   <Dropdown placeholder value options onSelect />
 *   - value: string（当前选中值，用于显示）
 *   - onSelect(value): 选中后回调，选中即关闭
 *
 * 多选模式：
 *   <Dropdown multiple placeholder options onToggle showTags hideSelected triggerText />
 *   - onToggle(value): 切换某项选中态，不关闭下拉
 *   - showTags: 触发器上方显示已选标签行（带 ✕ 删除）
 *   - hideSelected: 已选项从列表中过滤掉
 *   - triggerText: 触发器显示文字，未传则显示已选项 join(', ')
 *
 * options: [{ label, value, selected }]
 */
const Dropdown = ({
  placeholder,
  value,
  options,
  onSelect,
  onToggle,
  multiple = false,
  showTags = false,
  hideSelected = false,
  triggerText,
  style,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const defaultStyle = {
    width: '100%', height: 44, background: '#0D0D12',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
    color: '#FFFFFF', fontSize: 13, padding: '0 14px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    ...style,
  };

  const selectedCount = multiple ? options.filter((o) => o.selected).length : 0;
  const hasSelection = multiple ? selectedCount > 0 : !!value;

  // 触发器显示文字
  let triggerLabel;
  if (multiple) {
    triggerLabel = triggerText
      ? (selectedCount > 0 ? `${triggerText}（已选 ${selectedCount}）` : triggerText)
      : (selectedCount > 0 ? options.filter((o) => o.selected).map((o) => o.label).join(', ') : placeholder);
  } else {
    triggerLabel = value || placeholder;
  }

  // 多选标签行
  const selectedTags = multiple && showTags ? options.filter((o) => o.selected) : [];

  // 多选 + hideSelected：已选过滤掉
  const visibleOptions = multiple && hideSelected
    ? options.filter((o) => !o.selected)
    : options;

  const handleItemClick = (opt) => {
    if (multiple) {
      onToggle && onToggle(opt.value);
    } else {
      onSelect && onSelect(opt.value);
      setOpen(false);
    }
  };

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

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      {selectedTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 8 }}>
          {selectedTags.map((opt) => (
            <span key={opt.value} style={tagStyle}>
              {opt.label}
              <span style={tagRemoveStyle} onClick={() => onToggle && onToggle(opt.value)}>✕</span>
            </span>
          ))}
        </div>
      )}
      <div onClick={() => setOpen(!open)} style={defaultStyle}>
        <span style={{ color: hasSelection ? '#FFFFFF' : '#71717A' }}>{triggerLabel}</span>
        <span style={{ color: '#71717A', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#18181B', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
          maxHeight: 240, overflowY: 'auto', zIndex: 100,
        }}>
          {visibleOptions.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 13, color: '#71717A' }}>
              {multiple && hideSelected ? '全部已选' : '暂无选项'}
            </div>
          )}
          {visibleOptions.map((opt) => (
            <div
              key={opt.value}
              onClick={() => handleItemClick(opt)}
              style={{
                padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: opt.selected ? 'rgba(184,111,5,0.12)' : 'transparent',
                color: opt.selected ? '#B86F05' : '#D1D5DB',
                display: multiple ? 'flex' : 'block',
                alignItems: multiple ? 'center' : undefined,
                justifyContent: multiple ? 'space-between' : undefined,
              }}
            >
              <span>{opt.label}</span>
              {multiple && opt.selected && <span style={{ color: '#B86F05' }}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dropdown;
