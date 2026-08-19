import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { API, isAdmin, showError } from '../../helpers';

const gold = '#B86F05';
const cyan = '#2DD4BF';
const red = '#EF4444';

const Dashboard = () => {
  const { t } = useTranslation();
  const admin = isAdmin();
  const [overview, setOverview] = useState(null);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (admin) {
      Promise.all([
        API.get('/api/dashboard/overview').catch(() => ({ data: { success: false } })),
        API.get('/api/channel/?p=0').catch(() => ({ data: { success: false } })),
      ]).then(([ovRes, chRes]) => {
        if (ovRes.data.success) setOverview(ovRes.data.data);
        if (chRes.data.success && Array.isArray(chRes.data.data)) {
          setChannels(chRes.data.data.slice(0, 8));
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [admin]);

  const summary = overview?.summary || {};
  const channelsTotal = summary.total_channels ?? channels.length;
  const channelsEnabled = summary.enabled_channels ?? channels.filter((c) => c.status === 1).length;
  const requestsTotal = summary.total_requests ?? 0;
  const tokensTotal = summary.total_tokens ?? 0;
  const tokenCount = summary.total_token_count ?? 0;

  // KPI — 5卡片
  const fmtTokens = (n) => {
    if (n >= 1000000000) return (n / 1000000000).toFixed(2) + 'B';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
  };
  const kpis = [
    { badge: 'C', label: '渠道总数', value: channelsTotal, sub: `${channelsEnabled} 个启用`, shadow: 'rgba(99,77,147,0.15)' },
    { badge: 'R', label: '近7天请求', value: requestsTotal > 1000000 ? (requestsTotal / 1000000).toFixed(2) + 'M' : requestsTotal.toLocaleString(), sub: '请求总数', shadow: 'rgba(99,77,147,0.15)' },
    { badge: 'T', label: '近7天Token', value: fmtTokens(tokensTotal), sub: 'Token 消耗量', shadow: 'rgba(245,166,35,0.12)' },
    { badge: 'Σ', label: '累计Token', value: fmtTokens(summary.total_all_tokens ?? 0), sub: '历史总消耗', shadow: 'rgba(45,212,191,0.12)' },
    { badge: 'K', label: '启用令牌', value: tokenCount || 0, sub: '当前可用令牌', shadow: 'rgba(99,77,147,0.15)' },
  ];

  // 7天趋势 — 真实数据，空就显示7天0
  let trendData = (overview?.daily_trend || []).map((d) => ({
    label: new Date(d.Day).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    requests: d.RequestCount || 0,
  }));
  if (trendData.length === 0) {
    const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    trendData = days.map((d) => ({ label: d, requests: 0 }));
  }

  // 模型消耗分布 — 显示 token 消耗量（Quota），真实数据，空就空
  let modelTokenData = (overview?.model_distribution || []).slice(0, 5).map((m) => ({
    name: m.ModelName || m.model_name || '?',
    count: m.Quota ?? m.quota ?? 0,
  }));
  // 模型调用次数分布 — 显示请求次数（RequestCount）
  let modelCountData = (overview?.model_distribution || []).slice(0, 5).map((m) => ({
    name: m.ModelName || m.model_name || '?',
    count: m.RequestCount || m.request_count || 0,
  }));

  // 渠道状态分布
  const enabled = channels.filter((c) => c.status === 1).length;
  const disabled = channels.filter((c) => c.status === 2).length;
  const autoDisabled = channels.filter((c) => c.status === 3).length;
  const statusData = [
    { name: '启用', value: enabled, color: cyan },
    { name: '禁用', value: disabled, color: gold },
    { name: '自动禁用', value: autoDisabled, color: red },
  ].filter((s) => s.value > 0);
  const statusTotal = enabled + disabled + autoDisabled;

  // KPI 卡片
  const KpiCard = ({ kpi }) => (
    <div style={{
      width: 345, minWidth: 345, height: 213, flexShrink: 0,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      boxShadow: `0 8px 32px ${kpi.shadow}`,
      padding: '22px 24px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#FFFFFF', fontSize: 18, fontWeight: 700,
        }}>{kpi.badge}</div>
        {kpi.trend && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            height: 26, padding: '0 10px', borderRadius: 999,
            background: kpi.trendUp ? 'rgba(45,212,191,0.12)' : 'rgba(184,111,5,0.15)',
            color: kpi.trendUp ? cyan : gold,
            fontSize: 12, fontWeight: 600,
          }}>{kpi.trendUp ? '↑' : '↓'} {kpi.trend}</div>
        )}
      </div>
      <div style={{ fontSize: 13.5, color: '#A1A1AA' }}>{kpi.label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: '#FFFFFF', lineHeight: 1, fontFamily: 'Noto Sans SC, sans-serif' }}>
        {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
      </div>
      <div style={{ fontSize: 12, color: '#52525B' }}>{kpi.sub}</div>
    </div>
  );

  // 图表卡片
  const ChartCard = ({ title, children }) => (
    <div style={{
      width: 466, minWidth: 466, height: 280, flexShrink: 0,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: 20,
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F5F8', fontFamily: 'Noto Sans SC, sans-serif' }}>{title}</div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>{children}</div>
    </div>
  );

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>加载中…</div>;

  if (!admin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF' }}>欢迎使用 One API Lite</div>
        <div style={{ fontSize: 14, color: '#A1A1AA' }}>LLM API 管理 & 分发系统</div>
        <Link to='/channel' className='aurora-btn aurora-btn-primary'>进入渠道管理</Link>
      </div>
    );
  }

  const tooltipStyle = { background: '#131319', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#FFFFFF', fontSize: 12 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Grid — 4卡片固定不换行 */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {kpis.map((kpi, i) => <KpiCard key={i} kpi={kpi} />)}
      </div>

      {/* Charts Row — 4图表固定不换行 */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* 折线图 */}
        <ChartCard title='7天请求趋势'>
          <ResponsiveContainer width='100%' height='100%'>
            <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id='goldGrad' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='0%' stopColor={gold} stopOpacity={0.25} />
                  <stop offset='100%' stopColor={gold} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' stroke='rgba(255,255,255,0.04)' vertical={false} />
              <XAxis dataKey='label' axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
              <Line type='monotone' dataKey='requests' stroke={gold} strokeWidth={2} dot={{ fill: gold, r: 3 }} activeDot={{ r: 5, fill: gold, stroke: '#FFFFFF', strokeWidth: 2 }} fill='url(#goldGrad)' />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 柱状图 — 模型 Token 消耗分布 */}
        <ChartCard title='模型Token消耗分布'>
          {modelTokenData.length > 0 ? (
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={modelTokenData} margin={{ top: 5, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='rgba(255,255,255,0.04)' vertical={false} />
              <XAxis dataKey='name' axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} angle={-15} textAnchor='end' height={50} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey='count' radius={[4, 4, 0, 0]} maxBarSize={56}>
                {modelTokenData.map((_, i) => <Cell key={i} fill={i === 0 ? gold : i === 1 ? '#D48811' : i === 2 ? cyan : i === 3 ? '#1FB8A8' : '#7A8290'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#71717A', fontSize: 13 }}>暂无消费记录</div>
          )}
        </ChartCard>

        {/* 柱状图 — 模型调用次数分布 */}
        <ChartCard title='模型调用次数分布'>
          {modelCountData.length > 0 ? (
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={modelCountData} margin={{ top: 5, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='rgba(255,255,255,0.04)' vertical={false} />
              <XAxis dataKey='name' axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} angle={-15} textAnchor='end' height={50} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#52525B' }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey='count' radius={[4, 4, 0, 0]} maxBarSize={56}>
                {modelCountData.map((_, i) => <Cell key={i} fill={i === 0 ? cyan : i === 1 ? '#1FB8A8' : i === 2 ? gold : i === 3 ? '#D48811' : '#7A8290'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#71717A', fontSize: 13 }}>暂无调用记录</div>
          )}
        </ChartCard>

        {/* 环形图 */}
        <ChartCard title='渠道状态分布'>
          <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: 16 }}>
            <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0 }}>
              {statusTotal > 0 ? (
                <>
                  <ResponsiveContainer width='100%' height='100%'>
                    <PieChart>
                      <Pie data={statusData} cx='50%' cy='50%' innerRadius={55} outerRadius={75} paddingAngle={3} dataKey='value' stroke='#131319' strokeWidth={2}>
                        {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#FFFFFF' }}>{statusTotal}</div>
                    <div style={{ fontSize: 11, color: '#52525B' }}>渠道</div>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', fontSize: 12, color: '#71717A' }}>暂无数据</div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              {[
                { name: '启用', value: enabled, color: cyan },
                { name: '禁用', value: disabled, color: gold },
                { name: '自动禁用', value: autoDisabled, color: red },
              ].map((s) => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#A1A1AA', flex: 1 }}>{s.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>{s.value}</span>
                  <span style={{ fontSize: 11, color: '#52525B' }}>{statusTotal > 0 ? Math.round(s.value / statusTotal * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* 渠道表格摘要 */}
      <div className='aurora-card' style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF' }}>渠道概览</div>
            <div style={{ fontSize: 13, color: '#A1A1AA', marginTop: 2 }}>共 {channelsTotal} 个渠道 · {channelsEnabled} 个启用</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to='/channel' className='aurora-btn aurora-btn-ghost aurora-btn-sm'>管理全部</Link>
            <Link to='/channel/add' className='aurora-btn aurora-btn-primary aurora-btn-sm'>+ 新增</Link>
          </div>
        </div>
        <div className='aurora-table' style={{ border: 'none', borderRadius: 0 }}>
          <div className='aurora-table-header'>
            <span style={{ width: 40 }}>ID</span>
            <span style={{ width: 150 }}>名称</span>
            <span style={{ width: 200 }}>支持模型</span>
            <span style={{ width: 70 }}>优先级</span>
            <span style={{ width: 80 }}>状态</span>
            <span style={{ width: 90 }}>响应</span>
            <span style={{ flex: 1, textAlign: 'right' }}>操作</span>
          </div>
          {channels.slice(0, 6).map((ch) => (
            <div className='aurora-table-row' key={ch.id}>
              <span style={{ width: 40, color: '#6B7280' }}>{ch.id}</span>
              <span style={{ width: 150, color: '#FFFFFF', fontWeight: 500 }}>{ch.name || '—'}</span>
              <span style={{ width: 200, color: '#D1D5DB', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {Array.isArray(ch.models) ? (ch.models.length > 3 ? ch.models.slice(0, 3).join(', ') + ` +${ch.models.length - 3}` : ch.models.join(', ')) : (typeof ch.models === 'string' && ch.models ? ch.models.split(',').slice(0, 3).join(', ') : '—')}
              </span>
              <span style={{ width: 70, color: gold, fontWeight: 700 }}>{ch.priority ?? 0}</span>
              <span style={{ width: 80 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span className={`aurora-status-dot aurora-status-dot-${ch.status === 1 ? 'on' : ch.status === 2 ? 'off' : 'auto'}`} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: ch.status === 1 ? cyan : ch.status === 2 ? red : gold }}>{ch.status === 1 ? '启用' : ch.status === 2 ? '禁用' : '自动禁用'}</span>
                </span>
              </span>
              <span style={{ width: 90, color: ch.response_time < 200 ? cyan : ch.response_time < 500 ? gold : red }}>{ch.response_time ? `${ch.response_time}ms` : '—'}</span>
              <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Link to={`/channel/edit/${ch.id}`} style={{ fontSize: 12, color: gold, fontWeight: 500 }}>编辑</Link>
                <Link to='/channel' style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>管理</Link>
              </span>
            </div>
          ))}
          {channels.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#71717A' }}>暂无渠道</div>}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;