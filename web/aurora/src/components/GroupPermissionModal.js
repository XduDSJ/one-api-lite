import React, { useState } from 'react';
import {
  Button,
  Dropdown,
  Header,
  Icon,
  Label,
  Modal,
  Tab,
  Table,
} from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../helpers';
import { renderQuota } from '../helpers/render';

const GroupPermissionModal = ({ open, onClose, group, allGroups, onUpdate }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // 将渠道移动到其他分组
  const moveChannel = async (channel, targetGroup) => {
    if (targetGroup === group.name) return;
    setLoading(true);
    try {
      // 先获取完整渠道数据，再 PUT 覆写
      const getRes = await API.get(`/api/channel/${channel.id}`);
      const { success, data } = getRes.data;
      if (!success) {
        showError(t('group.permission.fetch_error'));
        setLoading(false);
        return;
      }
      data.group = targetGroup;
      const putRes = await API.put('/api/channel/', data);
      const { success: putSuccess, message } = putRes.data;
      if (putSuccess) {
        showSuccess(
          t('group.permission.channel_moved', {
            name: channel.name,
            target: targetGroup,
          })
        );
        onUpdate();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    }
    setLoading(false);
  };

  // 将用户移动到其他分组
  const moveUser = async (user, targetGroup) => {
    if (targetGroup === group.name) return;
    setLoading(true);
    try {
      // 先获取用户完整数据，再 PUT 覆写
      const getRes = await API.get(`/api/user/${user.id}`);
      const { success, data } = getRes.data;
      if (!success) {
        showError(t('group.permission.fetch_error'));
        setLoading(false);
        return;
      }
      data.group = targetGroup;
      const putRes = await API.put('/api/user/', data);
      const { success: putSuccess, message } = putRes.data;
      if (putSuccess) {
        showSuccess(
          t('group.permission.user_moved', {
            name: user.username,
            target: targetGroup,
          })
        );
        onUpdate();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    }
    setLoading(false);
  };

  // 渠道状态映射
  const renderChannelStatus = (status) => {
    switch (status) {
      case 1:
        return <Label size='mini' color='green'>{t('group.permission.status_enabled')}</Label>;
      case 2:
        return <Label size='mini' color='red'>{t('group.permission.status_disabled')}</Label>;
      case 3:
        return <Label size='mini' color='yellow'>{t('group.permission.status_auto_disabled')}</Label>;
      default:
        return <Label size='mini' color='grey'>{t('group.permission.status_unknown')}</Label>;
    }
  };

  // 构建分组下拉选项（排除当前分组）
  const groupOptions = allGroups
    .filter((g) => g !== group.name)
    .map((g) => ({ key: g, text: g, value: g }));

  const tabPanes = [
    {
      menuItem: (
        <span key='channels'>
          <Icon name='sitemap' /> {t('group.permission.tab_channels')}
          <Label size='mini' color='blue' style={{ marginLeft: '6px' }}>
            {group.channels.length}
          </Label>
        </span>
      ),
      render: () => (
        <Tab.Pane loading={loading}>
          {group.channels.length === 0 ? (
            <p style={{ color: 'var(--aurora-text-muted)', textAlign: 'center', padding: '20px' }}>
              {t('group.permission.no_channels')}
            </p>
          ) : (
            <Table compact size='small'>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t('group.permission.col_id')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('group.permission.col_name')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('group.permission.col_type')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('group.permission.col_status')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('group.permission.col_move_to')}</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {group.channels.map((ch) => (
                  <Table.Row key={ch.id}>
                    <Table.Cell>{ch.id}</Table.Cell>
                    <Table.Cell>{ch.name}</Table.Cell>
                    <Table.Cell>{ch.type_name || ch.type}</Table.Cell>
                    <Table.Cell>{renderChannelStatus(ch.status)}</Table.Cell>
                    <Table.Cell>
                      <Dropdown
                        selection
                        compact
                        placeholder={t('group.permission.select_group')}
                        options={groupOptions}
                        value=''
                        onChange={(_, { value }) => moveChannel(ch, value)}
                        disabled={loading}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Tab.Pane>
      ),
    },
    {
      menuItem: (
        <span key='users'>
          <Icon name='users' /> {t('group.permission.tab_users')}
          <Label size='mini' color='blue' style={{ marginLeft: '6px' }}>
            {group.users.length}
          </Label>
        </span>
      ),
      render: () => (
        <Tab.Pane loading={loading}>
          {group.users.length === 0 ? (
            <p style={{ color: 'var(--aurora-text-muted)', textAlign: 'center', padding: '20px' }}>
              {t('group.permission.no_users')}
            </p>
          ) : (
            <Table compact size='small'>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t('group.permission.col_id')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('group.permission.col_username')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('group.permission.col_display_name')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('group.permission.col_role')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('group.permission.col_quota')}</Table.HeaderCell>
                  <Table.HeaderCell>{t('group.permission.col_move_to')}</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {group.users.map((u) => (
                  <Table.Row key={u.id}>
                    <Table.Cell>{u.id}</Table.Cell>
                    <Table.Cell>{u.username}</Table.Cell>
                    <Table.Cell>{u.display_name || '-'}</Table.Cell>
                    <Table.Cell>
                      {u.role === 100 ? (
                        <Label size='mini' color='purple'>{t('group.permission.role_root')}</Label>
                      ) : u.role === 10 ? (
                        <Label size='mini' color='blue'>{t('group.permission.role_admin')}</Label>
                      ) : (
                        <Label size='mini'>{t('group.permission.role_user')}</Label>
                      )}
                    </Table.Cell>
                    <Table.Cell>{renderQuota(u.quota, t)}</Table.Cell>
                    <Table.Cell>
                      <Dropdown
                        selection
                        compact
                        placeholder={t('group.permission.select_group')}
                        options={groupOptions}
                        value=''
                        onChange={(_, { value }) => moveUser(u, value)}
                        disabled={loading || u.role === 100}
                      />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Tab.Pane>
      ),
    },
    {
      menuItem: (
        <span key='models'>
          <Icon name='cube' /> {t('group.permission.tab_models')}
          <Label size='mini' color='blue' style={{ marginLeft: '6px' }}>
            {group.models.length}
          </Label>
        </span>
      ),
      render: () => (
        <Tab.Pane>
          {group.models.length === 0 ? (
            <p style={{ color: 'var(--aurora-text-muted)', textAlign: 'center', padding: '20px' }}>
              {t('group.permission.no_models')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {group.models.map((model) => (
                <Label key={model} size='small' color='blue' basic>
                  {model}
                </Label>
              ))}
            </div>
          )}
        </Tab.Pane>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size='small'
      closeIcon
      className='aurora-permission-modal'
      style={{ maxWidth: 560 }}
    >
      <Header className='aurora-modal-header'>
        <Icon name='shield' />
        <Header.Content>
          {t('group.permission.title')} — <span style={{ color: 'var(--aurora-accent)' }}>{group.name}</span>
        </Header.Content>
      </Header>
      <Modal.Content>
        <Tab
          panes={tabPanes}
          activeIndex={activeTab}
          onTabChange={(_, { activeIndex }) => setActiveTab(activeIndex)}
        />
      </Modal.Content>
      <Modal.Actions>
        <Button primary onClick={onClose}>{t('group.permission.buttons.close')}</Button>
      </Modal.Actions>
    </Modal>
  );
};

export default GroupPermissionModal;
