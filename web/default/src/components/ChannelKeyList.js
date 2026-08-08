import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Label, Table } from 'semantic-ui-react';
import { API, showError, showSuccess } from '../helpers';

// 密钥掩码：前 4 + **** + 后 4；不足 8 字符则全部掩码
function maskKey(keyValue) {
  if (!keyValue || typeof keyValue !== 'string') {
    return '****';
  }
  if (keyValue.length < 8) {
    return '****';
  }
  return keyValue.slice(0, 4) + '****' + keyValue.slice(-4);
}

// 状态 → 颜色与文案 key
const STATUS_META = {
  1: { color: 'green', key: 'channel.key_list.status_enabled' },
  2: { color: 'red', key: 'channel.key_list.status_disabled' },
  3: { color: 'yellow', key: 'channel.key_list.status_cooled' },
  4: { color: 'orange', key: 'channel.key_list.status_quota_exhausted' },
};

const STATUS_DEFAULT_TEXT = {
  1: '启用',
  2: '手动禁用',
  3: '冷却中',
  4: '配额耗尽',
};

function renderStatus(status, t) {
  const meta = STATUS_META[status];
  if (!meta) {
    return (
      <Label basic color='grey'>
        {t('channel.key_list.status_unknown', '未知')}
      </Label>
    );
  }
  return (
    <Label basic color={meta.color}>
      {t(meta.key, STATUS_DEFAULT_TEXT[status])}
    </Label>
  );
}

const ChannelKeyList = ({ channelId }) => {
  const { t } = useTranslation();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enablingId, setEnablingId] = useState(null);

  const loadKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await API.get(`/api/channel/${channelId}/keys/status`);
      const { success, message, data } = res.data;
      if (success) {
        setKeys(Array.isArray(data) ? data : []);
      } else {
        setError(message || t('channel.key_list.load_failed', '加载失败'));
      }
    } catch (e) {
      setError(e.message || t('channel.key_list.load_failed', '加载失败'));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const enableKey = async (keyId) => {
    setEnablingId(keyId);
    try {
      const res = await API.post(
        `/api/channel/${channelId}/key/${keyId}/enable`
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('channel.key_list.enable_success', '已启用'));
        await loadKeys();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e.message);
    }
    setEnablingId(null);
  };

  if (loading) {
    return (
      <Table compact size='small' basic='very'>
        <Table.Body>
          <Table.Row>
            <Table.Cell colSpan='6' textAlign='center'>
              {t('channel.key_list.loading', '加载中...')}
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    );
  }

  if (error) {
    return (
      <Table compact size='small' basic='very'>
        <Table.Body>
          <Table.Row>
            <Table.Cell colSpan='6' textAlign='center' error>
              {error}
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    );
  }

  if (keys.length === 0) {
    return (
      <Table compact size='small' basic='very'>
        <Table.Body>
          <Table.Row>
            <Table.Cell colSpan='6' textAlign='center'>
              {t('channel.key_list.no_keys', '无密钥')}
            </Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table>
    );
  }

  return (
    <Table compact size='small' basic='very'>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>
            {t('channel.key_list.col_key', '密钥')}
          </Table.HeaderCell>
          <Table.HeaderCell>
            {t('channel.key_list.col_status', '状态')}
          </Table.HeaderCell>
          <Table.HeaderCell>
            {t('channel.key_list.col_priority', '优先级')}
          </Table.HeaderCell>
          <Table.HeaderCell>
            {t('channel.key_list.col_quota', '今日配额')}
          </Table.HeaderCell>
          <Table.HeaderCell>
            {t('channel.key_list.col_reset_rule', '重置规则')}
          </Table.HeaderCell>
          <Table.HeaderCell>
            {t('channel.key_list.col_actions', '操作')}
          </Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {keys.map((k) => (
          <Table.Row key={k.id}>
            <Table.Cell>{maskKey(k.key_value)}</Table.Cell>
            <Table.Cell>{renderStatus(k.status, t)}</Table.Cell>
            <Table.Cell>{k.priority}</Table.Cell>
            <Table.Cell>
              {k.daily_quota_limit === 0 ? (
                '∞'
              ) : (
                `${k.daily_used_quota || 0} / ${k.daily_quota_limit}`
              )}
            </Table.Cell>
            <Table.Cell>{k.quota_reset_rule || '-'}</Table.Cell>
            <Table.Cell>
              {k.status !== 1 && (
                <Button
                  size='mini'
                  positive
                  loading={enablingId === k.id}
                  disabled={enablingId === k.id}
                  onClick={() => enableKey(k.id)}
                >
                  {t('channel.key_list.enable', '启用')}
                </Button>
              )}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
};

export default ChannelKeyList;
