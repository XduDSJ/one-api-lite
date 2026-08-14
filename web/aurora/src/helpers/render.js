import { getChannelOption } from './helper';
import React from 'react';

export function renderText(text, limit) {
  if (text.length > limit) {
    return text.slice(0, limit - 3) + '...';
  }
  return text;
}

export function renderGroup(group) {
  if (!group) return <span style={{ fontSize: 12, color: '#A1A1AA' }}>default</span>;
  const groups = group.split(',');
  groups.sort();
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
      {groups.map((g) => {
        const color = (g === 'vip' || g === 'pro') ? '#B86F05' : (g === 'svip' || g === 'premium') ? '#EF4444' : '#A1A1AA';
        return <span key={g} style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: `${color}22`, color }}>{g}</span>;
      })}
    </div>
  );
}

export function renderNumber(num) {
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 10000) return (num / 1000).toFixed(1) + 'k';
  return num;
}

export function renderQuota(quota, t, precision = 2) {
  const displayInCurrency = localStorage.getItem('display_in_currency') === 'true';
  const quotaPerUnit = parseFloat(localStorage.getItem('quota_per_unit') || '1');
  if (displayInCurrency) {
    const amount = (quota / quotaPerUnit).toFixed(precision);
    return `$${amount}`;
  }
  return renderNumber(quota);
}

export function renderQuotaWithPrompt(quota, t) {
  const displayInCurrency = localStorage.getItem('display_in_currency') === 'true';
  const quotaPerUnit = parseFloat(localStorage.getItem('quota_per_unit') || '1');
  if (displayInCurrency) {
    const amount = (quota / quotaPerUnit).toFixed(2);
    return ` ($${amount})`;
  }
  return '';
}

export function renderColorLabel(text) {
  const colors = ['#EF4444', '#B86F05', '#2DD4BF', '#9F7AEA', '#60A5FA', '#A1A1AA'];
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
  const color = colors[Math.abs(hash % colors.length)];
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, background: `${color}22`, color }}>{text}</span>;
}

export function renderChannelTip(channelId) {
  const channel = getChannelOption(channelId);
  if (!channel || !channel.tip) return null;
  return <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 13, color: '#A1A1AA' }} dangerouslySetInnerHTML={{ __html: channel.tip }} />;
}