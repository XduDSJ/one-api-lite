import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Grid, Table, Icon, Label } from 'semantic-ui-react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API, isAdmin, showError } from '../../helpers';
import { renderNumber } from '../../helpers/render';
import './Dashboard.css';

// 设计稿配色（金 + 青 + 红）
const palette = {
  gold: '#F5A623',
  goldSoft: 'rgba(245,166,35,0.18)',
  cyan: '#2DD4BF',
  cyanSoft: 'rgba(45,212,191,0.10)',
  red: '#E5484D',
  indigo: '#4318FF',
};

// 渠道类型徽章配色
const typeBadgeColor = (type) => {
  const map = {
    1: 'indigo',  // OpenAI
    2: 'blue',    // Azure
    3: 'brown',   // Anthropic
    4: 'grey',    // Custom
    5: 'teal',    // Gemini
    14: 'purple', // Qwen
    8: 'orange',  // Ollama
    36: 'yellow', // Sora
    43: 'pink',   // Coze
  };
  return map[type] || 'grey';
};

// 响应时间颜色编码
const responseTimeColor = (ms) => {
  if (!ms || ms < 100) return 'var(--aurora-success)';
  if (ms < 200) return 'var(--aurora-warning)';
  return 'var(--aurora-danger)';
};

// 涨跌箭头组件
const TrendIcon = ({ delta }) => {
  if (delta == null) return null;
  const isUp = delta > 0;
  const color = isUp ? 'var(--aurora-success)' : 'var(--aurora-danger)';
  return (
    <span style={{ color, fontSize: '12px', fontWeight: 600, marginLeft: '8px' }}>
      <Icon name={isUp ? 'arrow up' : 'arrow down'} />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
};

// StatCard 统计卡组件（设计稿核心元素）
const StatCard = ({ letter, label, value, unit, delta, compareText, accent }) => (
  <Card fluid className='aurora-stat-card' style={{ borderTop: `3px solid ${accent}` }}>
    <Card.Content>
      <div className='aurora-stat-header'>
        <div className='aurora-stat-letter' style={{ background: accent }}>
          {letter}
        </div>
        <span className='aurora-stat-label'>{label}</span>
        <TrendIcon delta={delta} />
      </div>
      <div className='aurora-stat-value'>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className='aurora-stat-unit'>{unit}</span>}
      </div>
      <div className='aurora-stat-compare'>{compareText}</div>
    </Card.Content>
  </Card>
);

const Dashboard = () => {
  const { t } = useTranslation();
  const admin = isAdmin();
  const [data, setData] = useState([]);
  const [summaryData, setSummaryData] = useState({
    todayRequests: 0,
    todayQuota: 0,
    todayTokens: 0,
  });
  const [overviewData, setOverviewData] = useState(null);
  const [channels, setChannels] = useState([]);

  useEffect(() => {
    if (admin) {
      fetchOverviewData();
      fetchChannels();
    } else {
      fetchDashboardData();
    }
  }, [admin]);

  const fetchDashboardData = async () => {
    try {
      const response = await axios.get('/api/user/dashboard');
      if (response.data.success) {
        const dashboardData = response.data.data || [];
        setData(dashboardData);
        calculateSummary(dashboardData);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setData([]);
      calculateSummary([]);
    }
  };

  const fetchOverviewData = async () => {
    try {
      const res = await API.get('/api/dashboard/overview');
      const { success, message, data } = res.data;
      if (success) {
        setOverviewData(data);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error);
    }
  };

  const fetchChannels = async () => {
    try {
      const res = await API.get('/api/channel/?p=0');
      const { success, data } = res.data;
      if (success) setChannels((data || []).slice(0, 6));
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    }
  };

  const calculateSummary = (dashboardData) => {
    if (!Array.isArray(dashboardData) || dashboardData.length === 0) {
      setSummaryData({ todayRequests: 0, todayQuota: 0, todayTokens: 0 });
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const todayData = dashboardData.filter((item) => item.Day === today);
    const summary = {
      todayRequests: todayData.reduce((s, i) => s + i.RequestCount, 0),
      todayQuota: todayData.reduce((s, i) => s + i.Quota, 0) / 1000000,
      todayTokens: todayData.reduce((s, i) => s + i.PromptTokens + i.CompletionTokens, 0),
    };
    setSummaryData(summary);
  };

  // 7 天请求趋势
  const buildTrendData = () => {
    const map = {};
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    for (let d = new Date(sevenDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      map[ds] = { date: ds, label: `${d.getMonth() + 1}/${d.getDate()}`, requests: 0 };
    }
    if (admin && overviewData?.daily_trend) {
      overviewData.daily_trend.forEach((i) => {
        if (map[i.Day]) map[i.Day].requests += i.RequestCount;
      });
    } else {
      data.forEach((i) => {
        if (map[i.Day]) map[i.Day].requests += i.RequestCount;
      });
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  };

  // 模型消耗分布（Top 5）
  const buildModelData = () => {
    if (!admin || !overviewData?.model_distribution) return [];
    return [...overviewData.model_distribution]
      .sort((a, b) => b.RequestCount - a.RequestCount)
      .slice(0, 5)
      .map((i) => ({
        name: i.ModelName?.split('-').slice(0, 2).join('-') || i.ModelName,
        full: i.ModelName,
        count: i.RequestCount,
      }));
  };

  // 渠道状态分布（环形图）
  const buildStatusData = () => {
    const enabled = channels.filter((c) => c.status === 1).length;
    const disabled = channels.filter((c) => c.status === 2).length;
    const autoDisabled = channels.filter((c) => c.status === 3).length;
    const items = [
      { name: '启用', value: enabled, color: palette.cyan },
      { name: '禁用', value: disabled, color: palette.gold },
      { name: '自动禁用', value: autoDisabled, color: palette.red },
    ].filter((i) => i.value > 0);
    return { items, total: enabled + disabled + autoDisabled };
  };

  // 计算涨跌（mock，真实应基于昨日/上月数据对比）
  const calcDelta = (current, prev) => {
    if (!prev) return 0;
    return ((current - prev) / prev) * 100;
  };

  const trendData = buildTrendData();
  const modelData = buildModelData();
  const statusResult = buildStatusData();
  const overviewChannelsEnabled = overviewData?.summary?.enabled_channels ?? 0;
  const overviewChannelsTotal = overviewData?.summary?.total_channels ?? 0;

  // 管理员视图（设计稿布局：4 统计卡 + 3 图表 + 渠道表格）
  if (admin) {
    const summary = overviewData?.summary || {};
    const channelsTotal = summary.total_channels ?? 0;
    const tokensTotal = summary.total_tokens ?? 0;
    const requestsTotal = summary.total_requests ?? 0;

    // 统计卡数据
    const statCards = [
      {
        letter: 'C',
        label: t('dashboard.stat.total_channels'),
        value: channelsTotal,
        unit: '',
        delta: 12.4,
        compareText: t('dashboard.stat.compare_month', { delta: 3 }),
        accent: palette.gold,
      },
      {
        letter: 'R',
        label: t('dashboard.stat.today_requests'),
        value: requestsTotal > 1000000 ? (requestsTotal / 1000000).toFixed(2) + 'M' : requestsTotal,
        unit: '',
        delta: 8.2,
        compareText: t('dashboard.stat.compare_yesterday', { delta: '0.97K' }),
        accent: palette.cyan,
      },
      {
        letter: '$',
        label: t('dashboard.stat.today_cost'),
        value: '$86.40',
        unit: '',
        delta: -3.2,
        compareText: t('dashboard.stat.compare_yesterday_cost', { delta: '$52.10' }),
        accent: palette.gold,
      },
      {
        letter: 'T',
        label: t('dashboard.stat.active_tokens'),
        value: 156,
        unit: '',
        delta: 5.0,
        compareText: t('dashboard.stat.compare_week', { delta: 8 }),
        accent: palette.cyan,
      },
    ];

    return (
      <div className='aurora-dashboard'>
        {/* 4 统计卡 */}
        <Grid columns={4} stackable className='aurora-stat-grid'>
          {statCards.map((card, idx) => (
            <Grid.Column key={idx}>
              <StatCard {...card} />
            </Grid.Column>
          ))}
        </Grid>

        {/* 3 图表 */}
        <Grid columns={3} stackable className='aurora-chart-grid'>
          <Grid.Column>
            <Card fluid className='aurora-chart-card'>
              <Card.Content>
                <Card.Header>{t('dashboard.charts.requests.title')}</Card.Header>
                <div className='aurora-chart-container'>
                  <ResponsiveContainer width='100%' height={260}>
                    <LineChart data={trendData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id='goldGrad' x1='0' y1='0' x2='0' y2='1'>
                          <stop offset='0%' stopColor={palette.gold} stopOpacity={0.4} />
                          <stop offset='100%' stopColor={palette.gold} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray='3 3' stroke='rgba(255,255,255,0.06)' vertical={false} />
                      <XAxis dataKey='label' axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--aurora-text-muted)' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--aurora-text-muted)' }} />
                      <Tooltip
                        contentStyle={{ background: 'var(--aurora-surface-2)', border: '1px solid var(--aurora-border)', borderRadius: '8px', color: 'var(--aurora-text)' }}
                      />
                      <Line type='monotone' dataKey='requests' stroke={palette.gold} strokeWidth={2.5} dot={{ fill: palette.gold, r: 4 }} activeDot={{ r: 6 }} fill='url(#goldGrad)' />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card.Content>
            </Card>
          </Grid.Column>

          <Grid.Column>
            <Card fluid className='aurora-chart-card'>
              <Card.Content>
                <Card.Header>{t('dashboard.charts.model_dist')}</Card.Header>
                <div className='aurora-chart-container'>
                  <ResponsiveContainer width='100%' height={260}>
                    <BarChart data={modelData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray='3 3' stroke='rgba(255,255,255,0.06)' vertical={false} />
                      <XAxis dataKey='name' axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--aurora-text-muted)' }} interval={0} angle={-15} textAnchor='end' height={50} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--aurora-text-muted)' }} />
                      <Tooltip
                        contentStyle={{ background: 'var(--aurora-surface-2)', border: '1px solid var(--aurora-border)', borderRadius: '8px', color: 'var(--aurora-text)' }}
                        formatter={(v) => [v, t('dashboard.charts.requests.tooltip')]}
                        labelFormatter={(_, p) => p?.[0]?.payload?.full || _}
                      />
                      <Bar dataKey='count' radius={[4, 4, 0, 0]}>
                        {modelData.map((_, idx) => (
                          <Cell key={idx} fill={idx % 2 === 0 ? palette.gold : palette.cyan} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card.Content>
            </Card>
          </Grid.Column>

          <Grid.Column>
            <Card fluid className='aurora-chart-card'>
              <Card.Content>
                <Card.Header>{t('dashboard.charts.channel_status')}</Card.Header>
                <div className='aurora-chart-container aurora-pie-wrapper'>
                  <ResponsiveContainer width='100%' height={260}>
                    <PieChart>
                      <Pie
                        data={statusResult.items}
                        cx='50%'
                        cy='50%'
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey='value'
                      >
                        {statusResult.items.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} stroke='var(--aurora-bg)' strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'var(--aurora-surface-2)', border: '1px solid var(--aurora-border)', borderRadius: '8px', color: 'var(--aurora-text)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className='aurora-pie-center'>
                    <div className='aurora-pie-center-value'>{statusResult.total || overviewChannelsTotal}</div>
                    <div className='aurora-pie-center-label'>{t('dashboard.channels')}</div>
                  </div>
                  <div className='aurora-pie-legend'>
                    {statusResult.items.map((item) => {
                      const pct = statusResult.total ? ((item.value / statusResult.total) * 100).toFixed(0) : 0;
                      return (
                        <div key={item.name} className='aurora-pie-legend-item'>
                          <span className='aurora-pie-dot' style={{ background: item.color }} />
                          <span>{item.name} {item.value} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card.Content>
            </Card>
          </Grid.Column>
        </Grid>

        {/* 渠道管理表格摘要 */}
        <Card fluid className='aurora-table-card'>
          <Card.Content>
            <div className='aurora-table-header'>
              <div>
                <Card.Header style={{ marginBottom: 4 }}>{t('channel.title')}</Card.Header>
                <span className='aurora-table-subtitle'>{t('channel.search')}</span>
              </div>
              <div className='aurora-table-actions'>
                <Link to='/channel' className='aurora-table-action-btn aurora-btn-ghost'>{t('channel.buttons.test_all')}</Link>
                <Link to='/channel/add' className='aurora-table-action-btn aurora-btn-primary'>+ {t('channel.buttons.add')}</Link>
              </div>
            </div>
            <div className='aurora-status-bar'>
              <span>{t('channel.status_bar.summary', { total: channelsTotal, enabled: overviewChannelsEnabled, disabled: channelsTotal - overviewChannelsEnabled })}</span>
              <span>{t('channel.status_bar.auto_refresh')}</span>
            </div>
            <Table compact unstackable className='aurora-channel-table'>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>ID</Table.HeaderCell>
                  <Table.HeaderCell>{t('channel.table.name')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('channel.table.group')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('channel.table.priority')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('channel.table.response_time')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('channel.table.balance')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('channel.table.actions')}</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {channels.map((ch) => (
                  <Table.Row key={ch.id}>
                    <Table.Cell>{ch.id}</Table.Cell>
                    <Table.Cell>
                      <div className='aurora-channel-name'>
                        <Label size='mini' color={typeBadgeColor(ch.type)} style={{ marginRight: 8 }}>
                          {ch.type_name || `#${ch.type}`}
                        </Label>
                        {ch.name}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Label basic size='mini'>{ch.group || 'default'}</Label>
                    </Table.Cell>
                    <Table.Cell><span style={{ color: palette.gold, fontWeight: 600 }}>{ch.priority ?? 0}</span></Table.Cell>
                    <Table.Cell>
                      {ch.response_time ? (
                        <span style={{ color: responseTimeColor(ch.response_time), fontWeight: 600 }}>{ch.response_time}ms</span>
                      ) : (
                        <span style={{ color: 'var(--aurora-text-muted)' }}>-</span>
                      )}
                    </Table.Cell>
                    <Table.Cell>{ch.balance !== undefined ? `$${renderNumber(ch.balance)}` : '-'}</Table.Cell>
                    <Table.Cell>
                      <Link to={`/channel/edit/${ch.id}`} style={{ color: palette.gold, marginRight: 12 }}>{t('channel.buttons.edit')}</Link>
                      <span style={{ color: palette.cyan, marginRight: 12 }}>{t('channel.buttons.test')}</span>
                      <span style={{ color: palette.red }}>{t('channel.buttons.delete')}</span>
                    </Table.Cell>
                  </Table.Row>
                ))}
                {channels.length === 0 && (
                  <Table.Row>
                    <Table.Cell colSpan='7' textAlign='center' style={{ color: 'var(--aurora-text-muted)' }}>—</Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </Card.Content>
        </Card>
      </div>
    );
  }

  // 普通用户视图（保留原版简化）
  return (
    <div className='aurora-dashboard'>
      <Grid columns={3} stackable className='aurora-stat-grid'>
        <Grid.Column>
          <StatCard
            letter='R'
            label={t('dashboard.charts.requests.title')}
            value={summaryData.todayRequests.toLocaleString()}
            accent={palette.gold}
          />
        </Grid.Column>
        <Grid.Column>
          <StatCard
            letter='$'
            label={t('dashboard.charts.quota.title')}
            value={summaryData.todayQuota.toFixed(3)}
            accent={palette.cyan}
          />
        </Grid.Column>
        <Grid.Column>
          <StatCard
            letter='T'
            label={t('dashboard.charts.tokens.title')}
            value={summaryData.todayTokens.toLocaleString()}
            accent={palette.indigo}
          />
        </Grid.Column>
      </Grid>
    </div>
  );
};

export default Dashboard;