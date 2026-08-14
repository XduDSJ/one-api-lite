import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Dropdown, Form, Input, Label, Message, Pagination, Popup, Table,} from 'semantic-ui-react';
import {Link} from 'react-router-dom';
import {
  API,
  setPromptShown,
  shouldShowPrompt,
  showError,
  showInfo,
  showSuccess,
  timestamp2string,
} from '../helpers';

import {CHANNEL_OPTIONS, ITEMS_PER_PAGE} from '../constants';
import {renderGroup, renderNumber} from '../helpers/render';
import ChannelKeyList from './ChannelKeyList';

function renderTimestamp(timestamp) {
  return <>{timestamp2string(timestamp)}</>;
}

let type2label = undefined;

function renderType(type, t) {
  if (!type2label) {
    type2label = new Map();
    for (let i = 0; i < CHANNEL_OPTIONS.length; i++) {
      type2label[CHANNEL_OPTIONS[i].value] = CHANNEL_OPTIONS[i];
    }
    type2label[0] = {
      value: 0,
      text: t('channel.table.status_unknown'),
      color: 'grey',
    };
  }
  return (
    <Label basic color={type2label[type]?.color}>
      {type2label[type] ? type2label[type].text : type}
    </Label>
  );
}

function renderKeyMode(mode, t) {
  if (mode && mode !== 0) {
    return (
      <Label basic color='purple'>
        {t('channel.key_list.multi_key', '多Key')}
      </Label>
    );
  }
  return (
    <Label basic color='grey'>
      {t('channel.key_list.single_key', '单Key')}
    </Label>
  );
}

function renderBalance(type, balance, t) {
  switch (type) {
    case 1: // OpenAI
        if (balance === 0) {
            return <span>{t('channel.table.balance_not_supported')}</span>;
        }
      return <span>${balance.toFixed(2)}</span>;
    case 4: // CloseAI
      return <span>¥{balance.toFixed(2)}</span>;
    case 8: // 自定义
      return <span>${balance.toFixed(2)}</span>;
    case 5: // OpenAI-SB
      return <span>¥{(balance / 10000).toFixed(2)}</span>;
    case 10: // AI Proxy
      return <span>{renderNumber(balance)}</span>;
    case 12: // API2GPT
      return <span>¥{balance.toFixed(2)}</span>;
    case 13: // AIGC2D
      return <span>{renderNumber(balance)}</span>;
    case 20: // OpenRouter
      return <span>${balance.toFixed(2)}</span>;
    case 36: // DeepSeek
      return <span>¥{balance.toFixed(2)}</span>;
    case 44: // SiliconFlow
      return <span>¥{balance.toFixed(2)}</span>;
    default:
      return <span>{t('channel.table.balance_not_supported')}</span>;
  }
}

function isShowDetail() {
  return localStorage.getItem('show_detail') === 'true';
}

const promptID = 'detail';

const ChannelsTable = () => {
  const { t } = useTranslation();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [updatingBalance, setUpdatingBalance] = useState(false);
  const [showPrompt, setShowPrompt] = useState(shouldShowPrompt(promptID));
  const [showDetail, setShowDetail] = useState(isShowDetail());
  const [expandedChannelId, setExpandedChannelId] = useState(null);

  const processChannelData = (channel) => {
    if (channel.models === '') {
      channel.models = [];
      channel.test_model = '';
    } else {
      channel.models = channel.models.split(',');
      if (channel.models.length > 0) {
        channel.test_model = channel.models[0];
      }
      channel.model_options = channel.models.map((model) => {
        return {
          key: model,
          text: model,
          value: model,
        };
      });
      console.log('channel', channel);
    }
    return channel;
  };

  const loadChannels = async (startIdx) => {
    const res = await API.get(`/api/channel/?p=${startIdx}`);
    const { success, message, data } = res.data;
    if (success) {
      let localChannels = data.map(processChannelData);
      if (startIdx === 0) {
        setChannels(localChannels);
      } else {
        let newChannels = [...channels];
        newChannels.splice(
          startIdx * ITEMS_PER_PAGE,
          data.length,
          ...localChannels
        );
        setChannels(newChannels);
      }
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const onPaginationChange = (e, { activePage }) => {
    (async () => {
      if (activePage === Math.ceil(channels.length / ITEMS_PER_PAGE) + 1) {
        // In this case we have to load more data and then append them.
        await loadChannels(activePage - 1);
      }
      setActivePage(activePage);
    })();
  };

  const refresh = async () => {
    setLoading(true);
    await loadChannels(activePage - 1);
  };

  const toggleShowDetail = () => {
    setShowDetail(!showDetail);
    localStorage.setItem('show_detail', (!showDetail).toString());
  };

  useEffect(() => {
    loadChannels(0)
      .then()
      .catch((reason) => {
        showError(reason);
      });
  }, []);

  const manageChannel = async (id, action, idx, value) => {
    let data = { id };
    let res;
    switch (action) {
      case 'delete':
        res = await API.delete(`/api/channel/${id}/`);
        break;
      case 'enable':
        data.status = 1;
        res = await API.put('/api/channel/', data);
        break;
      case 'disable':
        data.status = 2;
        res = await API.put('/api/channel/', data);
        break;
      case 'priority':
        if (value === '') {
          return;
        }
        data.priority = parseInt(value);
        res = await API.put('/api/channel/', data);
        break;
      case 'weight':
        if (value === '') {
          return;
        }
        data.weight = parseInt(value);
        if (data.weight < 0) {
          data.weight = 0;
        }
        res = await API.put('/api/channel/', data);
        break;
    }
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('channel.messages.operation_success'));
      let channel = res.data.data;
      let newChannels = [...channels];
      let realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
      if (action === 'delete') {
        newChannels[realIdx].deleted = true;
      } else {
        newChannels[realIdx].status = channel.status;
      }
      setChannels(newChannels);
    } else {
      showError(message);
    }
  };

  const renderStatus = (status, t) => {
    switch (status) {
      case 1:
        return (
          <Label basic color='green'>
            {t('channel.table.status_enabled')}
          </Label>
        );
      case 2:
        return (
          <Popup
            trigger={
              <Label basic color='red'>
                {t('channel.table.status_disabled')}
              </Label>
            }
            content={t('channel.table.status_disabled_tip')}
            basic
          />
        );
      case 3:
        return (
          <Popup
            trigger={
              <Label basic color='yellow'>
                {t('channel.table.status_auto_disabled')}
              </Label>
            }
            content={t('channel.table.status_auto_disabled_tip')}
            basic
          />
        );
      default:
        return (
          <Label basic color='grey'>
            {t('channel.table.status_unknown')}
          </Label>
        );
    }
  };

  const renderResponseTime = (responseTime, t) => {
    let time = responseTime / 1000;
    time = time.toFixed(2) + 's';
    if (responseTime === 0) {
      return (
        <Label basic color='grey'>
          {t('channel.table.not_tested')}
        </Label>
      );
    } else if (responseTime <= 1000) {
      return (
        <Label basic color='green'>
          {time}
        </Label>
      );
    } else if (responseTime <= 3000) {
      return (
        <Label basic color='olive'>
          {time}
        </Label>
      );
    } else if (responseTime <= 5000) {
      return (
        <Label basic color='yellow'>
          {time}
        </Label>
      );
    } else {
      return (
        <Label basic color='red'>
          {time}
        </Label>
      );
    }
  };

  const searchChannels = async () => {
    if (searchKeyword === '') {
      // if keyword is blank, load files instead.
      await loadChannels(0);
      setActivePage(1);
      return;
    }
    setSearching(true);
    const res = await API.get(`/api/channel/search?keyword=${searchKeyword}`);
    const { success, message, data } = res.data;
    if (success) {
      let localChannels = data.map(processChannelData);
      setChannels(localChannels);
      setActivePage(1);
    } else {
      showError(message);
    }
    setSearching(false);
  };

  const switchTestModel = async (idx, model) => {
    let newChannels = [...channels];
    let realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
    newChannels[realIdx].test_model = model;
    setChannels(newChannels);
  };

  const testChannel = async (id, name, idx, m) => {
    const res = await API.get(`/api/channel/test/${id}?model=${m}`);
    const { success, message, time, model } = res.data;
    if (success) {
      let newChannels = [...channels];
      let realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
      newChannels[realIdx].response_time = time * 1000;
      newChannels[realIdx].test_time = Date.now() / 1000;
      setChannels(newChannels);
      showSuccess(
        t('channel.messages.test_success', { name, model, time, message })
      );
    } else {
      showError(message);
    }
    let newChannels = [...channels];
    let realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
    newChannels[realIdx].response_time = time * 1000;
    newChannels[realIdx].test_time = Date.now() / 1000;
    setChannels(newChannels);
  };

  const testChannels = async (scope) => {
    const res = await API.get(`/api/channel/test?scope=${scope}`);
    const { success, message } = res.data;
    if (success) {
      showInfo(t('channel.messages.test_all_started'));
    } else {
      showError(message);
    }
  };

  const deleteAllDisabledChannels = async () => {
    const res = await API.delete(`/api/channel/disabled`);
    const { success, message, data } = res.data;
    if (success) {
      showSuccess(
        t('channel.messages.delete_disabled_success', { count: data })
      );
      await refresh();
    } else {
      showError(message);
    }
  };

  const updateChannelBalance = async (id, name, idx) => {
    const res = await API.get(`/api/channel/update_balance/${id}/`);
    const { success, message, balance } = res.data;
    if (success) {
      let newChannels = [...channels];
      let realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
      newChannels[realIdx].balance = balance;
      newChannels[realIdx].balance_updated_time = Date.now() / 1000;
      setChannels(newChannels);
      showSuccess(t('channel.messages.balance_update_success', { name }));
    } else {
      showError(message);
    }
  };

  const updateAllChannelsBalance = async () => {
    setUpdatingBalance(true);
    const res = await API.get(`/api/channel/update_balance`);
    const { success, message } = res.data;
    if (success) {
      showInfo(t('channel.messages.all_balance_updated'));
    } else {
      showError(message);
    }
    setUpdatingBalance(false);
  };

  const handleKeywordChange = async (e, { value }) => {
    setSearchKeyword(value.trim());
  };

  const sortChannel = (key) => {
    if (channels.length === 0) return;
    setLoading(true);
    let sortedChannels = [...channels];
    sortedChannels.sort((a, b) => {
      if (!isNaN(a[key])) {
        // If the value is numeric, subtract to sort
        return a[key] - b[key];
      } else {
        // If the value is not numeric, sort as strings
        return ('' + a[key]).localeCompare(b[key]);
      }
    });
    if (sortedChannels[0].id === channels[0].id) {
      sortedChannels.reverse();
    }
    setChannels(sortedChannels);
    setLoading(false);
  };

  return (
    <>
      {/* 顶部工具栏：搜索 + 过滤 + 操作按钮组（设计稿布局） */}
      <div className='aurora-channel-toolbar'>
        <div className='aurora-channel-toolbar__left'>
          <Form onSubmit={searchChannels} style={{ margin: 0, flex: 1, maxWidth: 320 }}>
            <Form.Input
              icon='search'
              fluid
              iconPosition='left'
              placeholder={t('channel.search')}
              value={searchKeyword}
              loading={searching}
              onChange={handleKeywordChange}
            />
          </Form>
          <Dropdown
            selection
            compact
            options={[
              { key: 'all_type', value: '', text: t('channel.filter.all_type', '全类型') },
              ...CHANNEL_OPTIONS.map((opt) => ({ key: opt.value, value: opt.value, text: opt.text })),
            ]}
            placeholder={t('channel.filter.all_type', '全类型')}
            style={{ minWidth: 120 }}
          />
          <Dropdown
            selection
            compact
            options={[
              { key: 'all_status', value: '', text: t('channel.filter.all_status', '全状态') },
              { key: 'enabled', value: '1', text: t('channel.table.status_enabled') },
              { key: 'disabled', value: '2', text: t('channel.table.status_disabled') },
              { key: 'auto_disabled', value: '3', text: t('channel.table.status_auto_disabled') },
            ]}
            placeholder={t('channel.filter.all_status', '全状态')}
            style={{ minWidth: 120 }}
          />
        </div>
        <div className='aurora-channel-toolbar__right'>
          <Button
            size='small'
            basic
            loading={loading}
            onClick={() => testChannels('all')}
          >
            {t('channel.buttons.test_all')}
          </Button>
          <Popup
            trigger={
              <Button size='small' basic color='red' loading={loading}>
                {t('channel.buttons.delete_disabled')}
              </Button>
            }
            on='click'
            flowing
            hoverable
          >
            <Button
              size='tiny'
              negative
              onClick={deleteAllDisabledChannels}
            >
              {t('channel.buttons.confirm_delete_disabled')}
            </Button>
          </Popup>
          <Button
            size='small'
            as={Link}
            to='/channel/add'
            className='aurora-btn-primary'
            style={{
              background: 'var(--aurora-accent)',
              color: '#fff',
              borderColor: 'var(--aurora-accent)',
            }}
            loading={loading}
          >
            + {t('channel.buttons.add')}
          </Button>
        </div>
      </div>

      {/* 自动刷新状态条（设计稿元素） */}
      <div className='aurora-status-bar'>
        <span>
          {t('channel.status_bar.summary', {
            total: channels.length,
            enabled: channels.filter((c) => c.status === 1).length,
            disabled: channels.filter((c) => c.status === 2 || c.status === 3).length,
          })}
        </span>
        <span>{t('channel.status_bar.auto_refresh')}</span>
      </div>
      {showPrompt && (
        <Message
          onDismiss={() => {
            setShowPrompt(false);
            setPromptShown(promptID);
          }}
        >
          {t('channel.balance_notice')}
          <br />
          {t('channel.test_notice')}
          <br />
          {t('channel.detail_notice')}
        </Message>
      )}
      {/* 渠道表格卡片 — 按设计稿 3:870 精确还原 */}
      <div className='aurora-channel-table-card'>
        {/* 表头 */}
        <div className='aurora-ch-header'>
          <span className='aurora-ch-col-id' style={{ cursor: 'pointer' }} onClick={() => sortChannel('id')}>{t('channel.table.id')}</span>
          <span className='aurora-ch-col-name' style={{ cursor: 'pointer' }} onClick={() => sortChannel('name')}>{t('channel.table.name')}</span>
          <span className='aurora-ch-col-type' style={{ cursor: 'pointer' }} onClick={() => sortChannel('type')}>{t('channel.table.type')}</span>
          <span className='aurora-ch-col-group'>{t('channel.table.group')}</span>
          <span className='aurora-ch-col-models'>{t('channel.table.supported_models', '支持模型')}</span>
          <span className='aurora-ch-col-priority' style={{ cursor: 'pointer' }} onClick={() => sortChannel('priority')}>{t('channel.table.priority')}</span>
          <span className='aurora-ch-col-weight'>{t('channel.table.weight', '权重')}</span>
          <span className='aurora-ch-col-status' style={{ cursor: 'pointer' }} onClick={() => sortChannel('status')}>{t('channel.table.status')}</span>
          <span className='aurora-ch-col-response' style={{ cursor: 'pointer' }} onClick={() => sortChannel('response_time')}>{t('channel.table.response_time')}</span>
          <span className='aurora-ch-col-balance' style={{ cursor: 'pointer' }} onClick={() => sortChannel('balance')}>{t('channel.table.balance')}</span>
          <span className='aurora-ch-col-actions'>{t('channel.table.actions')}</span>
        </div>

        {/* 数据行 */}
        {channels
          .slice((activePage - 1) * ITEMS_PER_PAGE, activePage * ITEMS_PER_PAGE)
          .map((channel, idx) => {
            if (channel.deleted) return null;
            const typeBadgeClass = `aurora-ch-type-${(type2label?.[channel.type]?.text || 'default').toLowerCase().replace(/\s+/g, '')}`.replace(/[^a-z0-9-_]/g, '');
            const responseTimeMs = channel.response_time || 0;
            const responseClass = responseTimeMs === 0 ? 'aurora-ch-response-none' : responseTimeMs < 200 ? 'aurora-ch-response-fast' : responseTimeMs < 500 ? 'aurora-ch-response-medium' : 'aurora-ch-response-slow';
            const statusClass = channel.status === 1 ? 'aurora-ch-status-enabled' : channel.status === 2 ? 'aurora-ch-status-disabled' : channel.status === 3 ? 'aurora-ch-status-auto' : '';
            const statusLabel = channel.status === 1 ? t('channel.table.status_enabled') : channel.status === 2 ? t('channel.table.status_disabled') : channel.status === 3 ? t('channel.table.status_auto_disabled') : t('channel.table.status_unknown');
            const realIdx = (activePage - 1) * ITEMS_PER_PAGE + idx;
            return (
              <div className='aurora-ch-row' key={channel.id}>
                <span className='aurora-ch-col-id aurora-ch-cell-id'>{channel.id}</span>
                <span className='aurora-ch-col-name aurora-ch-cell-name'>{channel.name || t('channel.table.no_name')}</span>
                <div className='aurora-ch-col-type'>
                  <span className={`aurora-ch-type-badge ${typeBadgeClass}`}>
                    {type2label?.[channel.type]?.text || `#${channel.type}`}
                  </span>
                </div>
                <span className='aurora-ch-col-group aurora-ch-cell-group'>{channel.group || 'default'}</span>
                <span className='aurora-ch-col-models aurora-ch-cell-models'>
                  {channel.models ? (channel.models.length > 3 ? channel.models.slice(0, 3).join(', ') + ` +${channel.models.length - 3}` : channel.models.join(', ')) : '—'}
                </span>
                <span className='aurora-ch-col-priority aurora-ch-cell-priority'>{channel.priority ?? 0}</span>
                <span className='aurora-ch-col-weight aurora-ch-cell-weight'>{channel.weight ?? 0}</span>
                <div className='aurora-ch-col-status'>
                  <span className={`aurora-ch-status ${statusClass}`}>
                    <span className='aurora-ch-status-dot' />
                    <span className='aurora-ch-status-label'>{statusLabel}</span>
                  </span>
                </div>
                <span className={`aurora-ch-col-response ${responseClass}`}>
                  {responseTimeMs > 0 ? `${responseTimeMs}ms` : '—'}
                </span>
                <span className={`aurora-ch-col-balance ${channel.balance ? 'aurora-ch-cell-balance' : 'aurora-ch-cell-balance-muted'}`}>
                  {channel.balance ? renderBalance(channel.type, channel.balance, t) : '—'}
                </span>
                <div className='aurora-ch-col-actions aurora-ch-actions'>
                  <Link to={`/channel/edit/${channel.id}`} className='aurora-ch-action-btn aurora-ch-action-edit'>{t('channel.buttons.edit')}</Link>
                  <button className='aurora-ch-action-btn aurora-ch-action-test' onClick={() => testChannel(channel.id, channel.name, idx)}>{t('channel.buttons.test')}</button>
                  <button className='aurora-ch-action-btn aurora-ch-action-balance' onClick={() => updateChannelBalance(channel.id, channel.name, idx)}>{t('channel.buttons.balance', '余额')}</button>
                  <button className='aurora-ch-action-btn aurora-ch-action-delete' onClick={() => manageChannel(channel.id, 'delete', idx)}>{t('channel.buttons.delete')}</button>
                </div>
              </div>
            );
          })}

        {/* 分页器 */}
        <div className='aurora-ch-pagination'>
          <span className='aurora-ch-pagi-info'>
            {t('channel.pagi.info', { total: channels.length, page: activePage, total_pages: Math.ceil(channels.length / ITEMS_PER_PAGE) || 1 })}
          </span>
          <div className='aurora-ch-pagi-btns'>
            <button className='aurora-ch-pagi-btn' onClick={() => setActivePage(activePage - 1)} disabled={activePage <= 1}>‹</button>
            {Array.from({ length: Math.min(5, Math.ceil(channels.length / ITEMS_PER_PAGE) || 1) }, (_, i) => {
              const page = i + 1;
              return (
                <button key={page} className={`aurora-ch-pagi-btn ${activePage === page ? 'active' : ''}`} onClick={() => setActivePage(page)}>
                  {page}
                </button>
              );
            })}
            <button className='aurora-ch-pagi-btn' onClick={() => setActivePage(activePage + 1)} disabled={activePage >= Math.ceil(channels.length / ITEMS_PER_PAGE)}>›</button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChannelsTable;
