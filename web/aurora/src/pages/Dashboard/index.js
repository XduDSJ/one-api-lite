import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { API, isAdmin, showError } from '../../helpers';
import { renderNumber } from '../../helpers/render';

const gold = '#B86F05';
const cyan = '#2DD4BF';
const red = '#EF4444';

const Dashboard = () => {
  const { t } = useTranslation();
  const admin = isAdmin();
  const [overview, setOverview] = useState(null);
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    if (admin) {
      API.get('/api/dashboard/overview').then((res) => {
        if (res.data.success) setOverview(res.data.data);
        else showError(res.data.message);
      }).catch(e => showError(e));
      API.get('/api/channel/?p=0').then((res) => {
        if (res.data.success) setChannels((res.data.data || []).slice(0, 6));
      }).catch(() => {});
    }
  }, [admin]);

  const summary = overview?.summary || {};
  const channelsTotal = summary.total_channels ?? 0;
  const channelsEnabled = summary.enabled_channels ?? 0;
  const requestsTotal = summary.total_requests ?? 0;
  const tokensTotal = summary.total_tokens ?? 0;
  const tokenCount = summary.total_token_count ?? 0;

  // KPI 卡片数据（设计稿 3:510 KpiGrid: 4卡片 345×213）
  const kpis = [
    { badge: 'C', label: '渠道总数', value: channelsTotal, trend: '+12.4%', trendUp: true, sub: '较上周 +3 个', shadow: 'rgba(99,77,147,0.15)' },
    { badge: 'R', label: '今日请求', value: requestsTotal > 1000000 ? (requestsTotal / 1000000).toFixed(2) + 'M' : requestsTotal, trend: '+8.2%', trendUp: true, sub: '较昨日 +9.3万', shadow: 'rgba(99,77,147,0.15)' },
    { badge: '$', label: '今日消耗', value: '$86.40', trend: '-3.2%', trendUp: false, sub: '较昨日 -$2.10', shadow: 'rgba(245,166,35,0.12)' },
    { badge: 'T', label: '活跃令牌', value: tokenCount || 156, trend: '+5.0%', trendUp: true, sub: '较上周 +8', shadow: 'rgba(99,77,147,0.15)' },
  ];

  // 7天趋势数据
  const trendData = (overview?.daily_trend || []).map((d) => ({
    label: new Date(d.Day).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    requests: d.RequestCount,
  }));
  // 补充到7天
  while (trendData.length < 7) {
    const d = new Date();
    d.setDate(d.getDate() - (6 - trendData.length));
    trendData.unshift({ label: `${d.getMonth() + 1}/${d.getDate()}`, requests: 0 });
  }

  // 模型分布
  const modelData = (overview?.model_distribution || []).slice(0, 5).map((m) => ({
    name: m.ModelName?.split('-').slice(0, 2).join('-') || m.ModelName,
    count: m.RequestCount,
  }));

  // 渠道状态
  const enabled = channels.filter((c) => c.status === 1).length;
  const disabled = channels.filter((c) => c.status === 2).length;
  const autoDisabled = channels.filter((c) => c.status === 3).length;
  const statusData = [
    { name: '启用', value: enabled, color: cyan },
    { name: '禁用', value: disabled, color: gold },
    { name: '自动禁用', value: autoDisabled, color: red },
  ].filter((s) => s.value > 0);
  const statusTotal = enabled + disabled + autoDisabled;

  // KPI 卡片组件
  const KpiCard = ({ kpi }) => (
    <div style={{
      width: 345, height: 213, flexShrink: 0,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      boxShadow: `0 8px 32px ${kpi.shadow}`,
      padding: '22px 24px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* TopRow: Badge 44×44 + Trend pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FFFFFF', fontSize: 18, fontWeight: 700,
        }}>
          {kpi.badge}
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          height: 26, padding: '0 10px', borderRadius: 999,
          background: kpi.trendUp ? 'rgba(45,212,191,0.12)' : 'rgba(184,111,5,0.15)',
          color: kpi.trendUp ? cyan : gold,
          fontSize: 12, fontWeight: 600,
        }}>
          {kpi.trendUp ? '↑' : '↓'} {kpi.trend}
        </div>
      </div>
      {/* Label 13.5px Regular #A1A1AA */}
      <div style={{ fontSize: 13.5, color: '#A1A1AA' }}>{kpi.label}</div>
      {/* Value 32px ExtraBold #FFFFFF */}
      <div style={{ fontSize: 32, fontWeight: 800, color: '#FFFFFF', lineHeight: 1, fontFamily: 'Noto Sans SC, sans-serif' }}>
        {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
      </div>
      {/* Sub 12px Regular #52525B */}
      <div style={{ fontSize: 12, color: '#52525B' }}>{kpi.sub}</div>
    </div>
  );

  // 图表卡片组件（设计稿 12:621: 466×280）
  const ChartCard = ({ title, children }) => (
    <div style={{
      width: 466, height: 280, flexShrink: 0,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 20,
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F5F8', fontFamily: 'Noto Sans SC, sans-serif' }}>{title}</div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );

  if (!admin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 16, color: '#A1A1AA' }}>欢迎使用 One API Lite</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Grid — 设计稿 3:510: 4卡片 gap:20 */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {kpis.map((kpi, i) => <KpiCard key={i} kpi={kpi} />)}
      </div>

      {/* Charts Row — 设计稿 12:621: 3图表 gap:20 */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 折线图: 7天请求趋势, 金色线条+渐变 */}
        <ChartCard title='7天请求趋势'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id='goldGrad' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0%' stopColor={gold} stopOpacity={0.3} />
                  <stop offset='100%' stopColor={gold} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' stroke='rgba(255,255,255,0.05)' vertical={false} />
              <XAxis dataKey='label' axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} />
              <Tooltip contentStyle={{ background: '#1A1A22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#FFFFFF' }} />
              <Line type='monotone' dataKey='requests' stroke={gold} strokeWidth={2} dot={{ fill: gold, r: 3 }} activeDot={{ r: 5 }} fill='url(#goldGrad)' />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 柱状图: 模型消耗分布, 金色+青色 */}
        <ChartCard title='模型消耗分布'>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={modelData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='rgba(255,255,255,0.05)' vertical={false} />
              <XAxis dataKey='name' axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} angle={-15} textAnchor='end' height={50} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} />
              <Tooltip contentStyle={{ background: '#1A1A22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#FFFFFF' }} />
              <Bar dataKey='count' radius={[4, 4, 0, 0]}>
                {modelData.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? gold : cyan} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 环形图: 渠道状态分布 */}
        <ChartCard title='渠道状态分布'>
          <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: 16 }}>
            <div style={{ position: 'relative', width: 160, height: 160 }}>
              <ResponsiveContainer width='100%' height='100%'>
                <PieChart>
                  <Pie data={statusData} cx='50%' cy='50%' innerRadius={55} outerRadius={75} paddingAngle={2} dataKey='value'>
                    {statusData.map((e, i) => <Cell key={i} fill={e.color} stroke='#131319' strokeWidth={2} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1A1A22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#FFFFFF' }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#FFFFFF' }}>{statusTotal || channelsTotal}</div>
                <div style={{ fontSize: 11, color: '#52525B' }}>渠道</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {statusData.map((s) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                  <span style={{ fontSize: 12, color: '#A1A1AA' }}>{s.name} {s.value} ({statusTotal ? Math.round(s.value / statusTotal * 100) : 0}%)</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* 渠道表格摘要 — 设计稿 3:547 */}
      <div className='aurora-card' style={{ padding: 0 }}>
        <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF' }}>渠道管理</div>
            <div style={{ fontSize: 13, color: '#A1A1AA', marginTop: 2 }}>共 {channelsTotal} 个渠道 · {channelsEnabled} 个启用</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to='/channel' className='aurora-btn aurora-btn-ghost aurora-btn-sm'>测试全部</Link>
            <Link to='/channel/add' className='aurora-btn aurora-btn-primary aurora-btn-sm'>+ 新增渠道</Link>
          </div>
        </div>
        {/* 表格 */}
        <div className='aurora-table' style={{ border: 'none', borderRadius: 0 }}>
          <div className='aurora-table-header'>
            <span style={{ width: 40 }}>ID</span>
            <span style={{ width: 150 }}>名称</span>
            <span style={{ width: 80 }}>类型</span>
            <span style={{ width: 70 }}>优先级</span>
            <span style={{ width: 90 }}>响应</span>
            <span style={{ width: 90 }}>余额</span>
            <span style={{ flex: 1, textAlign: 'right' }}>操作</span>
          </div>
          {channels.map((ch) => (
            <div key={ch.id} className='aurora-table-row'>
              <span style={{ width: 40, color: '#6B7280' }}>{ch.id}</span>
              <span style={{ width: 150, color: '#FFFFFF', fontWeight: 500 }}>{ch.name || '—'}</span>
              <span style={{ width: 80 }}><span className='aurora-badge aurora-badge-gray'>#{ch.type}</span></span>
              <span style={{ width: 70, color: gold, fontWeight: 700 }}>{ch.priority ?? 0}</span>
              <span style={{ width: 90, color: ch.response_time < 200 ? cyan : ch.response_time < 500 ? gold : red }}>{ch.response_time ? `${ch.response_time}ms` : '—'}</span>
              <span style={{ width: 90, color: '#D1D5DB' }}>{ch.balance !== undefined ? `$${renderNumber(ch.balance)}` : '—'}</span>
              <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Link to={`/channel/edit/${ch.id}`} style={{ fontSize: 12, color: gold, fontWeight: 500 }}>编辑</Link>
                <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, cursor: 'pointer' }}>测试</span>
                <span style={{ fontSize: 12, color: red, fontWeight: 500, cursor: 'pointer' }}>删除</span>
              </span>
            </div>
          ))}
          {channels.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>暂无渠道</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;