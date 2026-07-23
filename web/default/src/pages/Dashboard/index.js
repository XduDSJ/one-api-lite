import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Card, Grid} from 'semantic-ui-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import axios from 'axios';
import {API, isAdmin, showError} from '../../helpers';
import './Dashboard.css';

// 在 Dashboard 组件内添加自定义配置
const chartConfig = {
  lineChart: {
    style: {
      background: '#fff',
      borderRadius: '8px',
    },
    line: {
      strokeWidth: 2,
      dot: false,
      activeDot: { r: 4 },
    },
    grid: {
      vertical: false,
      horizontal: true,
      opacity: 0.1,
    },
  },
  colors: {
    requests: '#4318FF',
    quota: '#00B5D8',
    tokens: '#6C63FF',
  },
  barColors: [
    '#4318FF', // 深紫色
    '#00B5D8', // 青色
    '#6C63FF', // 紫色
    '#05CD99', // 绿色
    '#FFB547', // 橙色
    '#FF5E7D', // 粉色
    '#41B883', // 翠绿
    '#7983FF', // 淡紫
    '#FF8F6B', // 珊瑚色
    '#49BEFF', // 天蓝
  ],
};

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

  useEffect(() => {
    // 管理员加载全局总览数据，普通用户加载个人统计数据
    if (admin) {
      fetchOverviewData();
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

  // 获取管理员全局总览数据
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

  const calculateSummary = (dashboardData) => {
    if (!Array.isArray(dashboardData) || dashboardData.length === 0) {
      setSummaryData({
        todayRequests: 0,
        todayQuota: 0,
        todayTokens: 0,
      });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const todayData = dashboardData.filter((item) => item.Day === today);

    const summary = {
      todayRequests: todayData.reduce(
        (sum, item) => sum + item.RequestCount,
        0
      ),
      todayQuota:
        todayData.reduce((sum, item) => sum + item.Quota, 0) / 1000000,
      todayTokens: todayData.reduce(
        (sum, item) => sum + item.PromptTokens + item.CompletionTokens,
        0
      ),
    };

    setSummaryData(summary);
  };

  // 处理数据以供折线图使用，补充缺失的日期
  const processTimeSeriesData = () => {
    const dailyData = {};

    // 获取日期范围
    const dates = data.map((item) => item.Day);
    const maxDate = new Date(); // 总是使用今天作为最后一天
    let minDate =
      dates.length > 0
        ? new Date(Math.min(...dates.map((d) => new Date(d))))
        : new Date();

    // 确保至少显示7天的数据
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // -6是因为包含今天
    if (minDate > sevenDaysAgo) {
      minDate = sevenDaysAgo;
    }

    // 生成所有日期
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dailyData[dateStr] = {
        date: dateStr,
        requests: 0,
        quota: 0,
        tokens: 0,
      };
    }

    // 填充实际数据
    data.forEach((item) => {
      dailyData[item.Day].requests += item.RequestCount;
      dailyData[item.Day].quota += item.Quota / 1000000;
      dailyData[item.Day].tokens += item.PromptTokens + item.CompletionTokens;
    });

    return Object.values(dailyData).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  };

  // 处理数据以供堆叠柱状图使用
  const processModelData = () => {
    const timeData = {};

    // 获取日期范围
    const dates = data.map((item) => item.Day);
    const maxDate = new Date(); // 总是使用今天作为最后一天
    let minDate =
      dates.length > 0
        ? new Date(Math.min(...dates.map((d) => new Date(d))))
        : new Date();

    // 确保至少显示7天的数据
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // -6是因为包含今天
    if (minDate > sevenDaysAgo) {
      minDate = sevenDaysAgo;
    }

    // 生成所有日期
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      timeData[dateStr] = {
        date: dateStr,
      };

      // 初始化所有模型的数据为0
      const models = [...new Set(data.map((item) => item.ModelName))];
      models.forEach((model) => {
        timeData[dateStr][model] = 0;
      });
    }

    // 填充实际数据
    data.forEach((item) => {
      timeData[item.Day][item.ModelName] =
        item.PromptTokens + item.CompletionTokens;
    });

    return Object.values(timeData).sort((a, b) => a.date.localeCompare(b.date));
  };

  // 获取所有唯一的模型名称
  const getUniqueModels = () => {
    return [...new Set(data.map((item) => item.ModelName))];
  };

  // 处理管理员总览的每日趋势数据，补充缺失日期（最近 7 天）
  // 注意：后端结构体无 json tag，字段为 PascalCase
  const processOverviewDailyData = () => {
    if (!overviewData || !overviewData.daily_trend) return [];
    const dailyMap = {};
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    for (let d = new Date(sevenDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dailyMap[dateStr] = { day: dateStr, requests: 0, tokens: 0 };
    }
    overviewData.daily_trend.forEach((item) => {
      if (dailyMap[item.Day]) {
        dailyMap[item.Day].requests += item.RequestCount;
        dailyMap[item.Day].tokens += item.PromptTokens + item.CompletionTokens;
      }
    });
    return Object.values(dailyMap).sort((a, b) => a.day.localeCompare(b.day));
  };

  // 处理模型分布数据，按请求数排序取前 10
  const processModelDistribution = () => {
    if (!overviewData || !overviewData.model_distribution) return [];
    return [...overviewData.model_distribution]
      .sort((a, b) => b.RequestCount - a.RequestCount)
      .slice(0, 10)
      .map((item) => ({ name: item.ModelName, count: item.RequestCount }));
  };

  // 处理渠道分布数据，按请求数排序取前 10
  const processChannelDistribution = () => {
    if (!overviewData || !overviewData.channel_distribution) return [];
    return [...overviewData.channel_distribution]
      .sort((a, b) => b.RequestCount - a.RequestCount)
      .slice(0, 10)
      .map((item) => ({ name: `#${item.ChannelId}`, count: item.RequestCount }));
  };

  const timeSeriesData = processTimeSeriesData();
  const modelData = processModelData();
  const models = getUniqueModels();

  // 生成随机颜色
  const getRandomColor = (index) => {
    return chartConfig.barColors[index % chartConfig.barColors.length];
  };

  // 添加一个日期格式化函数
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
    });
  };

  // 修改所有 XAxis 配置
  const xAxisConfig = {
    dataKey: 'date',
    axisLine: false,
    tickLine: false,
    tick: {
      fontSize: 12,
      fill: '#A3AED0',
      textAnchor: 'middle', // 文本居中对齐
    },
    tickFormatter: formatDate,
    interval: 0,
    minTickGap: 5,
    padding: { left: 30, right: 30 }, // 增加两侧的内边距，确保首尾标签完整显示
  };

  // 管理员全局总览视图
  if (admin) {
    const summary = (overviewData && overviewData.summary) || {};
    const dailyData = processOverviewDailyData();
    const modelDist = processModelDistribution();
    const channelDist = processChannelDistribution();

    // 汇总卡片配置，每张卡片顶部用不同强调色与下方图表呼应
    const summaryCards = [
      { key: 'total_requests', value: summary.total_requests ?? 0, color: chartConfig.barColors[0] },
      { key: 'total_tokens', value: summary.total_tokens ?? 0, color: chartConfig.barColors[1] },
      { key: 'total_users', value: summary.total_users ?? 0, color: chartConfig.barColors[2] },
      { key: 'total_channels', value: summary.total_channels ?? 0, color: chartConfig.barColors[3] },
      { key: 'enabled_channels', value: summary.enabled_channels ?? 0, color: chartConfig.barColors[4] },
      { key: 'total_token_count', value: summary.total_token_count ?? 0, color: chartConfig.barColors[5] },
    ];

    // 分布柱状图 XAxis 配置：标签倾斜避免模型名重叠
    const distXAxisConfig = {
      axisLine: false,
      tickLine: false,
      angle: -20,
      textAnchor: 'end',
      height: 70,
      interval: 0,
      tick: { fontSize: 11, fill: '#A3AED0' },
    };

    return (
      <div className='dashboard-container'>
        {/* 汇总卡片：两行三列 */}
        <Grid columns={3} stackable className='charts-grid'>
          {summaryCards.map((card) => (
            <Grid.Column key={card.key}>
              <Card fluid className='chart-card' style={{ borderTop: `3px solid ${card.color}` }}>
                <Card.Content>
                  <div style={{ color: '#A3AED0', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                    {t(`dashboard.overview.${card.key}`)}
                  </div>
                  <div style={{ color: '#2B3674', fontSize: '28px', fontWeight: 700, lineHeight: 1.2 }}>
                    {card.value.toLocaleString()}
                  </div>
                </Card.Content>
              </Card>
            </Grid.Column>
          ))}
        </Grid>

        {/* 每日趋势折线图：请求数 + Token 数 */}
        <Grid columns={2} stackable className='charts-grid'>
          <Grid.Column>
            <Card fluid className='chart-card'>
              <Card.Content>
                <Card.Header>{t('dashboard.overview.daily_requests')}</Card.Header>
                <div className='chart-container'>
                  <ResponsiveContainer width='100%' height={220}>
                    <LineChart data={dailyData} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray='3 3' vertical={false} opacity={0.1} />
                      <XAxis dataKey='day' axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3AED0' }} tickFormatter={formatDate} interval={0} minTickGap={5} padding={{ left: 20, right: 20 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3AED0' }} />
                      <Tooltip contentStyle={{ background: '#fff', border: 'none', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} formatter={(value) => [value, t('dashboard.overview.daily_requests')]} labelFormatter={(label) => `${t('dashboard.statistics.tooltip.date')}: ${formatDate(label)}`} />
                      <Line type='monotone' dataKey='requests' stroke={chartConfig.colors.requests} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card.Content>
            </Card>
          </Grid.Column>
          <Grid.Column>
            <Card fluid className='chart-card'>
              <Card.Content>
                <Card.Header>{t('dashboard.overview.daily_tokens')}</Card.Header>
                <div className='chart-container'>
                  <ResponsiveContainer width='100%' height={220}>
                    <LineChart data={dailyData} margin={{ left: 10, right: 10 }}>
                      <CartesianGrid strokeDasharray='3 3' vertical={false} opacity={0.1} />
                      <XAxis dataKey='day' axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3AED0' }} tickFormatter={formatDate} interval={0} minTickGap={5} padding={{ left: 20, right: 20 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3AED0' }} />
                      <Tooltip contentStyle={{ background: '#fff', border: 'none', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} formatter={(value) => [value, t('dashboard.overview.daily_tokens')]} labelFormatter={(label) => `${t('dashboard.statistics.tooltip.date')}: ${formatDate(label)}`} />
                      <Line type='monotone' dataKey='tokens' stroke={chartConfig.colors.tokens} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card.Content>
            </Card>
          </Grid.Column>
        </Grid>

        {/* 分布柱状图：模型 Top 10 + 渠道 Top 10 */}
        <Grid columns={2} stackable className='charts-grid'>
          <Grid.Column>
            <Card fluid className='chart-card'>
              <Card.Content>
                <Card.Header>{t('dashboard.overview.model_distribution')}</Card.Header>
                <div className='chart-container'>
                  <ResponsiveContainer width='100%' height={320}>
                    <BarChart data={modelDist} margin={{ left: 10, right: 20, bottom: 10 }}>
                      <CartesianGrid strokeDasharray='3 3' vertical={false} opacity={0.1} />
                      <XAxis dataKey='name' {...distXAxisConfig} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3AED0' }} />
                      <Tooltip contentStyle={{ background: '#fff', border: 'none', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} cursor={{ fill: 'rgba(67, 24, 255, 0.05)' }} />
                      <Bar dataKey='count' name={t('dashboard.charts.requests.tooltip')} fill={chartConfig.colors.requests} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card.Content>
            </Card>
          </Grid.Column>
          <Grid.Column>
            <Card fluid className='chart-card'>
              <Card.Content>
                <Card.Header>{t('dashboard.overview.channel_distribution')}</Card.Header>
                <div className='chart-container'>
                  <ResponsiveContainer width='100%' height={320}>
                    <BarChart data={channelDist} margin={{ left: 10, right: 20, bottom: 10 }}>
                      <CartesianGrid strokeDasharray='3 3' vertical={false} opacity={0.1} />
                      <XAxis dataKey='name' {...distXAxisConfig} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#A3AED0' }} />
                      <Tooltip contentStyle={{ background: '#fff', border: 'none', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} cursor={{ fill: 'rgba(0, 181, 216, 0.05)' }} />
                      <Bar dataKey='count' name={t('dashboard.charts.requests.tooltip')} fill={chartConfig.colors.quota} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card.Content>
            </Card>
          </Grid.Column>
        </Grid>
      </div>
    );
  }

  return (
    <div className='dashboard-container'>
      {/* 三个并排的折线图 */}
      <Grid columns={3} stackable className='charts-grid'>
        <Grid.Column>
          <Card fluid className='chart-card'>
            <Card.Content>
              <Card.Header>
                {t('dashboard.charts.requests.title')}
                {/* <span className='stat-value'>{summaryData.todayRequests}</span> */}
              </Card.Header>
              <div className='chart-container'>
                <ResponsiveContainer
                  width='100%'
                  height={120}
                  margin={{ left: 10, right: 10 }} // 调整容器边距
                >
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid
                      strokeDasharray='3 3'
                      vertical={chartConfig.lineChart.grid.vertical}
                      horizontal={chartConfig.lineChart.grid.horizontal}
                      opacity={chartConfig.lineChart.grid.opacity}
                    />
                    <XAxis {...xAxisConfig} />
                    <YAxis hide={true} />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value) => [
                        value,
                        t('dashboard.charts.requests.tooltip'),
                      ]}
                      labelFormatter={(label) =>
                        `${t(
                          'dashboard.statistics.tooltip.date'
                        )}: ${formatDate(label)}`
                      }
                    />
                    <Line
                      type='monotone'
                      dataKey='requests'
                      stroke={chartConfig.colors.requests}
                      strokeWidth={chartConfig.lineChart.line.strokeWidth}
                      dot={chartConfig.lineChart.line.dot}
                      activeDot={chartConfig.lineChart.line.activeDot}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card.Content>
          </Card>
        </Grid.Column>

        <Grid.Column>
          <Card fluid className='chart-card'>
            <Card.Content>
              <Card.Header>
                {t('dashboard.charts.quota.title')}
                {/* <span className='stat-value'>
                  ${summaryData.todayQuota.toFixed(3)}
                </span> */}
              </Card.Header>
              <div className='chart-container'>
                <ResponsiveContainer
                  width='100%'
                  height={120}
                  margin={{ left: 10, right: 10 }} // 调整容器边距
                >
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid
                      strokeDasharray='3 3'
                      vertical={chartConfig.lineChart.grid.vertical}
                      horizontal={chartConfig.lineChart.grid.horizontal}
                      opacity={chartConfig.lineChart.grid.opacity}
                    />
                    <XAxis {...xAxisConfig} />
                    <YAxis hide={true} />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value) => [
                        value.toFixed(6),
                        t('dashboard.charts.quota.tooltip'),
                      ]}
                      labelFormatter={(label) =>
                        `${t(
                          'dashboard.statistics.tooltip.date'
                        )}: ${formatDate(label)}`
                      }
                    />
                    <Line
                      type='monotone'
                      dataKey='quota'
                      stroke={chartConfig.colors.quota}
                      strokeWidth={chartConfig.lineChart.line.strokeWidth}
                      dot={chartConfig.lineChart.line.dot}
                      activeDot={chartConfig.lineChart.line.activeDot}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card.Content>
          </Card>
        </Grid.Column>

        <Grid.Column>
          <Card fluid className='chart-card'>
            <Card.Content>
              <Card.Header>
                {t('dashboard.charts.tokens.title')}
                {/* <span className='stat-value'>{summaryData.todayTokens}</span> */}
              </Card.Header>
              <div className='chart-container'>
                <ResponsiveContainer
                  width='100%'
                  height={120}
                  margin={{ left: 10, right: 10 }} // 调整容器边距
                >
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid
                      strokeDasharray='3 3'
                      vertical={chartConfig.lineChart.grid.vertical}
                      horizontal={chartConfig.lineChart.grid.horizontal}
                      opacity={chartConfig.lineChart.grid.opacity}
                    />
                    <XAxis {...xAxisConfig} />
                    <YAxis hide={true} />
                    <Tooltip
                      contentStyle={{
                        background: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      }}
                      formatter={(value) => [
                        value,
                        t('dashboard.charts.tokens.tooltip'),
                      ]}
                      labelFormatter={(label) =>
                        `${t(
                          'dashboard.statistics.tooltip.date'
                        )}: ${formatDate(label)}`
                      }
                    />
                    <Line
                      type='monotone'
                      dataKey='tokens'
                      stroke={chartConfig.colors.tokens}
                      strokeWidth={chartConfig.lineChart.line.strokeWidth}
                      dot={chartConfig.lineChart.line.dot}
                      activeDot={chartConfig.lineChart.line.activeDot}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card.Content>
          </Card>
        </Grid.Column>
      </Grid>

      {/* 模型使用统计 */}
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header>{t('dashboard.statistics.title')}</Card.Header>
          <div className='chart-container'>
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={modelData}>
                <CartesianGrid
                  strokeDasharray='3 3'
                  vertical={false}
                  opacity={0.1}
                />
                <XAxis {...xAxisConfig} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#A3AED0' }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}
                  labelFormatter={(label) =>
                    `${t('dashboard.statistics.tooltip.date')}: ${formatDate(
                      label
                    )}`
                  }
                />
                <Legend
                  wrapperStyle={{
                    paddingTop: '20px',
                  }}
                />
                {models.map((model, index) => (
                  <Bar
                    key={model}
                    dataKey={model}
                    stackId='a'
                    fill={getRandomColor(index)}
                    name={model}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
};

export default Dashboard;
