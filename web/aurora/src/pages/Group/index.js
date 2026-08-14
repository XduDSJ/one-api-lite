import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Card,
  Grid,
  Header,
  Icon,
  Input,
  Label,
  Loader,
  Message,
  Segment,
  Statistic,
} from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants/common.constant';
import GroupPermissionModal from '../../components/GroupPermissionModal';

const Group = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [channels, setChannels] = useState([]);
  const [users, setUsers] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [customGroups, setCustomGroups] = useState(
    JSON.parse(localStorage.getItem('custom_groups') || '[]')
  );

  // 获取所有渠道（分页加载全部）
  const fetchAllChannels = async () => {
    let allChannels = [];
    let page = 0;
    while (true) {
      const res = await API.get(`/api/channel/?p=${page}`);
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        break;
      }
      allChannels = allChannels.concat(data);
      if (data.length < ITEMS_PER_PAGE) break;
      page++;
    }
    return allChannels;
  };

  // 获取所有用户（分页加载全部）
  const fetchAllUsers = async () => {
    let allUsers = [];
    let page = 0;
    while (true) {
      const res = await API.get(`/api/user/?p=${page}`);
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        break;
      }
      allUsers = allUsers.concat(data);
      if (data.length < ITEMS_PER_PAGE) break;
      page++;
    }
    return allUsers;
  };

  // 获取后端预定义分组
  const fetchPredefinedGroups = async () => {
    try {
      const res = await API.get('/api/group/');
      const { success, data } = res.data;
      if (success && Array.isArray(data)) {
        return data;
      }
    } catch (e) {
      // 忽略错误，使用空数组
    }
    return [];
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [predefinedGroups, allChannels, allUsers] = await Promise.all([
        fetchPredefinedGroups(),
        fetchAllChannels(),
        fetchAllUsers(),
      ]);

      setChannels(allChannels);
      setUsers(allUsers);

      // 从渠道和用户中提取所有分组名，合并预定义和自定义分组
      const groupSet = new Set(predefinedGroups);
      allChannels.forEach((ch) => {
        if (ch.group) groupSet.add(ch.group);
      });
      allUsers.forEach((u) => {
        if (u.group) groupSet.add(u.group);
      });
      customGroups.forEach((g) => groupSet.add(g));

      // 构建分组统计数据
      const groupStats = Array.from(groupSet).map((groupName) => {
        const groupChannels = allChannels.filter((ch) => ch.group === groupName);
        const groupUsers = allUsers.filter((u) => u.group === groupName);
        // 汇总可用模型
        const models = new Set();
        groupChannels.forEach((ch) => {
          if (ch.models) {
            ch.models.split(',').forEach((m) => {
              if (m.trim()) models.add(m.trim());
            });
          }
        });
        return {
          name: groupName,
          channelCount: groupChannels.length,
          userCount: groupUsers.length,
          modelCount: models.size,
          channels: groupChannels,
          users: groupUsers,
          models: Array.from(models).sort(),
          activeChannels: groupChannels.filter((ch) => ch.status === 1).length,
        };
      });

      groupStats.sort((a, b) => b.channelCount - a.channelCount);
      setGroups(groupStats);
    } catch (error) {
      showError(error.message);
    }
    setLoading(false);
  }, [customGroups]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleManageGroup = (group) => {
    setSelectedGroup(group);
    setModalOpen(true);
  };

  const handleAddGroup = () => {
    const name = newGroupName.trim();
    if (!name) {
      showError(t('group.messages.name_required'));
      return;
    }
    // 检查是否已存在
    if (groups.some((g) => g.name === name)) {
      showError(t('group.messages.name_exists'));
      return;
    }
    const updated = [...customGroups, name];
    setCustomGroups(updated);
    localStorage.setItem('custom_groups', JSON.stringify(updated));
    setNewGroupName('');
    showSuccess(t('group.messages.add_success'));
    loadData();
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedGroup(null);
  };

  const handleModalUpdate = () => {
    loadData();
  };

  if (loading) {
    return (
      <div className='dashboard-container'>
        <Loader active size='large'>{t('group.loading')}</Loader>
      </div>
    );
  }

  return (
    <div className='aurora-dashboard'>
      {/* 顶部状态条：标题 + 描述 */}
      <div className='aurora-status-bar' style={{ background: 'rgba(245, 230, 178, 0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Icon name='object group' style={{ color: 'var(--aurora-accent)' }} />
          <strong style={{ color: 'var(--aurora-text)' }}>{t('group.title')}</strong>
          <span style={{ color: 'var(--aurora-text-muted)', fontSize: 13 }}>
            {t('group.description')}
          </span>
        </div>
      </div>

      {/* 添加新分组 */}
      <Card fluid className='aurora-chart-card' style={{ marginBottom: 'var(--space-4)' }}>
        <Card.Content>
          <div className='aurora-setting-section-header'>
            <span className='aurora-setting-section-title'>
              <Icon name='plus circle' style={{ marginRight: 'var(--space-2)' }} />
              {t('group.add_new')}
            </span>
          </div>
          <Input
            action={
              <Button color='blue' onClick={handleAddGroup}>
                <Icon name='plus' /> {t('group.buttons.add')}
              </Button>
            }
            placeholder={t('group.name_placeholder')}
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddGroup();
            }}
            style={{ maxWidth: '400px' }}
          />
        </Card.Content>
      </Card>

      {/* 分组列表 */}
      {groups.length === 0 ? (
        <Message info>
          <Message.Header>{t('group.empty_title')}</Message.Header>
          <p>{t('group.empty_hint')}</p>
        </Message>
      ) : (
        <Grid stackable columns={2}>
          {groups.map((group) => (
            <Grid.Column key={group.name}>
              <Card fluid className='aurora-chart-card'>
                <Card.Content>
                  <Card.Header
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      <Icon name='folder' color='blue' style={{ marginRight: '6px' }} />
                      {group.name}
                    </span>
                    <Label
                      color={group.channelCount > 0 ? 'blue' : 'grey'}
                      size='small'
                      tag
                    >
                      {group.channelCount} {t('group.channels')}
                    </Label>
                  </Card.Header>
                </Card.Content>
                <Card.Content>
                  <Statistic.Group size='mini' widths={3}>
                    <Statistic>
                      <Statistic.Value>{group.channelCount}</Statistic.Value>
                      <Statistic.Label>{t('group.stats.channels')}</Statistic.Label>
                    </Statistic>
                    <Statistic>
                      <Statistic.Value>{group.userCount}</Statistic.Value>
                      <Statistic.Label>{t('group.stats.users')}</Statistic.Label>
                    </Statistic>
                    <Statistic>
                      <Statistic.Value>{group.modelCount}</Statistic.Value>
                      <Statistic.Label>{t('group.stats.models')}</Statistic.Label>
                    </Statistic>
                  </Statistic.Group>
                  {group.activeChannels < group.channelCount && group.channelCount > 0 && (
                    <Message size='tiny' warning style={{ marginTop: '8px', marginBottom: '0' }}>
                      {t('group.active_hint', {
                        active: group.activeChannels,
                        total: group.channelCount,
                      })}
                    </Message>
                  )}
                </Card.Content>
                <Card.Content extra>
                  <Button
                    primary
                    size='small'
                    onClick={() => handleManageGroup(group)}
                  >
                    <Icon name='settings' /> {t('group.buttons.manage')}
                  </Button>
                </Card.Content>
              </Card>
            </Grid.Column>
          ))}
        </Grid>
      )}

      {/* 权限配置弹窗 */}
      {selectedGroup && (
        <GroupPermissionModal
          open={modalOpen}
          onClose={handleModalClose}
          group={selectedGroup}
          allGroups={groups.map((g) => g.name)}
          onUpdate={handleModalUpdate}
        />
      )}
    </div>
  );
};

export default Group;
