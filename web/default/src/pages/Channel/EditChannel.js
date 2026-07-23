import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Card, Form, Input, Message, Table} from 'semantic-ui-react';
import {useNavigate, useParams} from 'react-router-dom';
import {API, copy, showError, showInfo, showSuccess, verifyJSON,} from '../../helpers';
import {CHANNEL_OPTIONS} from '../../constants';
import {renderChannelTip} from '../../helpers/render';

const MODEL_MAPPING_EXAMPLE = {
  'gpt-3.5-turbo-0301': 'gpt-3.5-turbo',
  'gpt-4-0314': 'gpt-4',
  'gpt-4-32k-0314': 'gpt-4-32k',
};

function type2secretPrompt(type, t) {
  switch (type) {
    case 15:
      return t('channel.edit.key_prompts.zhipu');
    case 18:
      return t('channel.edit.key_prompts.spark');
    case 22:
      return t('channel.edit.key_prompts.fastgpt');
    case 23:
      return t('channel.edit.key_prompts.tencent');
    default:
      return t('channel.edit.key_prompts.default');
  }
}

const EditChannel = () => {
  const { t } = useTranslation();
  const params = useParams();
  const navigate = useNavigate();
  const channelId = params.id;
  const isEdit = channelId !== undefined;
  const [loading, setLoading] = useState(isEdit);
  const handleCancel = () => {
    navigate('/channel');
  };

  const originInputs = {
    name: '',
    type: 1,
    key: '',
    base_url: '',
    other: '',
    model_mapping: '',
    system_prompt: '',
    models: [],
    groups: ['default'],
  };
  const [batch, setBatch] = useState(false);
  const [inputs, setInputs] = useState(originInputs);
  const [modelOptions, setModelOptions] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [customModel, setCustomModel] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  // 模型别名列表: [{original: string, alias: string}]
  // alias 为空时使用原始名;alias !== original 时生成 model_mapping
  const [modelAliases, setModelAliases] = useState([]);
  const [config, setConfig] = useState({
    region: '',
    sk: '',
    ak: '',
    user_id: '',
    vertex_ai_project_id: '',
    vertex_ai_adc: '',
  });
  const handleInputChange = (e, { name, value }) => {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  };

  const handleConfigChange = (e, { name, value }) => {
    setConfig((inputs) => ({ ...inputs, [name]: value }));
  };

  const loadChannel = async () => {
    let res = await API.get(`/api/channel/${channelId}`);
    const { success, message, data } = res.data;
    if (success) {
      if (data.models === '') {
        data.models = [];
      } else {
        data.models = data.models.split(',');
      }
      if (data.group === '') {
        data.groups = [];
      } else {
        data.groups = data.group.split(',');
      }
      // 从 models + model_mapping 反向解析 modelAliases
      let mapping = {};
      if (data.model_mapping !== '') {
        try {
          mapping = JSON.parse(data.model_mapping);
        } catch (e) {
          // model_mapping 格式错误,忽略
        }
      }
      const mappingValues = new Set(Object.values(mapping));
      let consumedKeys = new Set();
      let originalsFromKeys = new Set();
      let aliases = [];
      // 第一遍: 处理 mapping key(别名)
      data.models.forEach((model) => {
        if (mapping[model]) {
          aliases.push({ original: mapping[model], alias: model });
          consumedKeys.add(model);
          originalsFromKeys.add(mapping[model]);
        }
      });
      // 第二遍: 处理非 key 的 model,跳过已被 key 引用为 original 的 value(旧数据兼容)
      data.models.forEach((model) => {
        if (!mapping[model]) {
          if (originalsFromKeys.has(model)) {
            return;
          }
          aliases.push({ original: model, alias: '' });
        }
      });
      // 检测未被消费的 mapping key(旧数据中 key 不在 models 里)
      let unconsumedCount = Object.keys(mapping).length - consumedKeys.size;
      if (unconsumedCount > 0) {
        showInfo(t('channel.edit.messages.mapping_keys_ignored', { count: unconsumedCount }));
      }
      setModelAliases(aliases);
      // inputs.models 设为原始名,供下拉框使用
      data.models = aliases.map((a) => a.original);
      setInputs(data);
      if (data.config !== '') {
        setConfig(JSON.parse(data.config));
      }
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const fetchUpstreamModels = async () => {
    if (!channelId) {
      showInfo(t('channel.edit.messages.fetch_save_first'));
      return;
    }
    setFetchingModels(true);
    try {
      let res = await API.get(`/api/channel/fetch_models/${channelId}`);
      const { success, message, data } = res.data;
      if (success) {
        if (data.length === 0) {
          showInfo(t('channel.edit.messages.fetch_empty'));
          return;
        }
        // 合并到当前已选模型(去重)
        let existingModels = new Set(inputs.models);
        let newModels = [];
        data.forEach((model) => {
          if (!existingModels.has(model)) {
            newModels.push(model);
          }
        });
        let allModels = [...inputs.models, ...newModels];
        handleInputChange(null, { name: 'models', value: allModels });
        // 同步 modelAliases: 新模型添加空别名条目
        if (newModels.length > 0) {
          setModelAliases((prev) => [
            ...prev,
            ...newModels.map((m) => ({ original: m, alias: '' })),
          ]);
        }
        showSuccess(t('channel.edit.messages.fetch_success', { total: data.length, added: newModels.length }));
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setFetchingModels(false);
    }
  };

  const fetchGroups = async () => {
    try {
      let res = await API.get(`/api/group/`);
      setGroupOptions(
        res.data.data.map((group) => ({
          key: group,
          text: group,
          value: group,
        }))
      );
    } catch (error) {
      showError(error.message);
    }
  };

  useEffect(() => {
    let localModelOptions = [];
    inputs.models.forEach((model) => {
      if (!localModelOptions.find((option) => option.key === model)) {
        localModelOptions.push({
          key: model,
          text: model,
          value: model,
        });
      }
    });
    setModelOptions(localModelOptions);
  }, [inputs.models]);

  // modelAliases 变化时自动同步 model_mapping 文本框(只读展示)
  useEffect(() => {
    let mapping = {};
    modelAliases.forEach((a) => {
      if (a.alias.trim() !== '' && a.alias.trim() !== a.original) {
        mapping[a.alias.trim()] = a.original;
      }
    });
    const mappingStr =
      Object.keys(mapping).length > 0 ? JSON.stringify(mapping, null, 2) : '';
    setInputs((prev) =>
      prev.model_mapping === mappingStr
        ? prev
        : { ...prev, model_mapping: mappingStr }
    );
  }, [modelAliases]);

  useEffect(() => {
    if (isEdit) {
      loadChannel().then();
    }
    fetchGroups().then();
  }, []);

  const submit = async () => {
    if (inputs.key === '') {
      if (config.ak !== '' && config.sk !== '' && config.region !== '') {
        inputs.key = `${config.ak}|${config.sk}|${config.region}`;
      } else if (
        config.region !== '' &&
        config.vertex_ai_project_id !== '' &&
        config.vertex_ai_adc !== ''
      ) {
        inputs.key = `${config.region}|${config.vertex_ai_project_id}|${config.vertex_ai_adc}`;
      }
    }
    if (!isEdit && (inputs.name === '' || inputs.key === '')) {
      showInfo(t('channel.edit.messages.name_required'));
      return;
    }
    if (inputs.type !== 43 && inputs.models.length === 0) {
      showInfo(t('channel.edit.messages.models_required'));
      return;
    }
    if (inputs.model_mapping !== '' && !verifyJSON(inputs.model_mapping)) {
      showInfo(t('channel.edit.messages.model_mapping_invalid'));
      return;
    }
    let localInputs = { ...inputs };
    if (localInputs.key === 'undefined|undefined|undefined') {
      localInputs.key = ''; // prevent potential bug
    }
    if (localInputs.base_url && localInputs.base_url.endsWith('/')) {
      localInputs.base_url = localInputs.base_url.slice(
        0,
        localInputs.base_url.length - 1
      );
    }
    if (localInputs.type === 3 && localInputs.other === '') {
      localInputs.other = '2024-03-01-preview';
    }
    // 从 modelAliases 生成最终 models 和 model_mapping
    // models 存别名(有别名时)或原始名(无别名时)
    // model_mapping 存 {别名: 原始名},仅当 alias !== original 时
    // 校验: 禁止逗号(破坏 models 字段分隔)、禁止重复对外名
    let finalModels = [];
    let mapping = {};
    let seenNames = new Set();
    for (let i = 0; i < modelAliases.length; i++) {
      const a = modelAliases[i];
      const alias = a.alias.trim();
      if (alias.includes(',')) {
        showError(t('channel.edit.messages.alias_invalid_comma'));
        return;
      }
      const finalName = alias !== '' ? alias : a.original;
      if (seenNames.has(finalName)) {
        showError(t('channel.edit.messages.alias_duplicate', { name: finalName }));
        return;
      }
      seenNames.add(finalName);
      finalModels.push(finalName);
      if (alias !== '' && alias !== a.original) {
        mapping[alias] = a.original;
      }
    }
    localInputs.models = finalModels.join(',');
    localInputs.model_mapping =
      Object.keys(mapping).length > 0 ? JSON.stringify(mapping, null, 2) : '';
    localInputs.group = localInputs.groups.join(',');
    localInputs.config = JSON.stringify(config);
    let res;
    if (isEdit) {
      res = await API.put(`/api/channel/`, {
        ...localInputs,
        id: parseInt(channelId),
      });
    } else {
      res = await API.post(`/api/channel/`, localInputs);
    }
    const { success, message } = res.data;
    if (success) {
      if (isEdit) {
        showSuccess(t('channel.edit.messages.update_success'));
      } else {
        showSuccess(t('channel.edit.messages.create_success'));
        setInputs(originInputs);
      }
    } else {
      showError(message);
    }
  };

  const addCustomModel = () => {
    if (customModel.trim() === '') return;
    if (inputs.models.includes(customModel)) return;
    let localModels = [...inputs.models];
    localModels.push(customModel);
    let localModelOptions = [];
    localModelOptions.push({
      key: customModel,
      text: customModel,
      value: customModel,
    });
    setModelOptions((modelOptions) => {
      return [...modelOptions, ...localModelOptions];
    });
    setCustomModel('');
    handleInputChange(null, { name: 'models', value: localModels });
    // 同步 modelAliases
    setModelAliases((prev) => [...prev, { original: customModel, alias: '' }]);
  };

  // 下拉框增删模型时同步 modelAliases
  const handleModelsChange = (e, { value }) => {
    const newModels = value;
    const oldModels = inputs.models;
    // 找出新增的模型
    const added = newModels.filter((m) => !oldModels.includes(m));
    // 找出删除的模型
    const removed = oldModels.filter((m) => !newModels.includes(m));
    setModelAliases((prev) => {
      let result = prev.filter((a) => !removed.includes(a.original));
      result = [...result, ...added.map((m) => ({ original: m, alias: '' }))];
      return result;
    });
    handleInputChange(null, { name: 'models', value: newModels });
  };

  // 更新某行的别名
  const updateModelAlias = (index, alias) => {
    setModelAliases((prev) => {
      let result = [...prev];
      result[index] = { ...result[index], alias };
      return result;
    });
  };

  // 删除某行(同时从 models 中移除)
  const removeModelAlias = (index) => {
    const model = modelAliases[index].original;
    setModelAliases((prev) => prev.filter((_, i) => i !== index));
    handleInputChange(null, {
      name: 'models',
      value: inputs.models.filter((m) => m !== model),
    });
  };

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header'>
            {isEdit
              ? t('channel.edit.title_edit')
              : t('channel.edit.title_create')}
          </Card.Header>
          <Form loading={loading} autoComplete='new-password'>
            <Form.Field>
              <Form.Select
                label={t('channel.edit.type')}
                name='type'
                required
                search
                options={CHANNEL_OPTIONS}
                value={inputs.type}
                onChange={handleInputChange}
              />
            </Form.Field>
            <Form.Field>
              <Form.Input
                label={t('channel.edit.name')}
                name='name'
                placeholder={t('channel.edit.name_placeholder')}
                onChange={handleInputChange}
                value={inputs.name}
                required
              />
            </Form.Field>
            <Form.Field>
              <Form.Dropdown
                label={t('channel.edit.group')}
                placeholder={t('channel.edit.group_placeholder')}
                name='groups'
                required
                fluid
                multiple
                selection
                allowAdditions
                additionLabel={t('channel.edit.group_addition')}
                onChange={handleInputChange}
                value={inputs.groups}
                autoComplete='new-password'
                options={groupOptions}
              />
            </Form.Field>
            {renderChannelTip(inputs.type)}

            {/* Azure OpenAI specific fields */}
            {inputs.type === 3 && (
              <>
                <Message>
                  注意，<strong>模型部署名称必须和模型名称保持一致</strong>
                  ，因为 One API 会把请求体中的 model
                  参数替换为你的部署名称（模型名称中的点会被剔除），
                  <a
                    target='_blank'
                    href='https://github.com/songquanpeng/one-api/issues/133?notification_referrer_id=NT_kwDOAmJSYrM2NjIwMzI3NDgyOjM5OTk4MDUw#issuecomment-1571602271'
                  >
                    图片演示
                  </a>
                  。
                </Message>
                <Form.Field>
                  <Form.Input
                    label='AZURE_OPENAI_ENDPOINT'
                    name='base_url'
                    placeholder='请输入 AZURE_OPENAI_ENDPOINT，例如：https://docs-test-001.openai.azure.com'
                    onChange={handleInputChange}
                    value={inputs.base_url}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <Form.Field>
                  <Form.Input
                    label='默认 API 版本'
                    name='other'
                    placeholder='请输入默认 API 版本，例如：2024-03-01-preview，该配置可以被实际的请求查询参数所覆盖'
                    onChange={handleInputChange}
                    value={inputs.other}
                    autoComplete='new-password'
                  />
                </Form.Field>
              </>
            )}

            {/* Custom base URL field */}
            {inputs.type === 8 && (
              <Form.Field>
                <Form.Input
                    required
                    label={t('channel.edit.proxy_url')}
                    name='base_url'
                    placeholder={t('channel.edit.proxy_url_placeholder')}
                    onChange={handleInputChange}
                    value={inputs.base_url}
                    autoComplete='new-password'
                />
              </Form.Field>
            )}
            {inputs.type === 50 && (
                <Form.Field>
                  <Form.Input
                      required
                  label={t('channel.edit.base_url')}
                  name='base_url'
                  placeholder={t('channel.edit.base_url_placeholder')}
                  onChange={handleInputChange}
                  value={inputs.base_url}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}

            {inputs.type === 18 && (
              <Form.Field>
                <Form.Input
                  label={t('channel.edit.spark_version')}
                  name='other'
                  placeholder={t('channel.edit.spark_version_placeholder')}
                  onChange={handleInputChange}
                  value={inputs.other}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}
            {inputs.type === 21 && (
              <Form.Field>
                <Form.Input
                  label={t('channel.edit.knowledge_id')}
                  name='other'
                  placeholder={t('channel.edit.knowledge_id_placeholder')}
                  onChange={handleInputChange}
                  value={inputs.other}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}
            {inputs.type === 17 && (
              <Form.Field>
                <Form.Input
                  label={t('channel.edit.plugin_param')}
                  name='other'
                  placeholder={t('channel.edit.plugin_param_placeholder')}
                  onChange={handleInputChange}
                  value={inputs.other}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}
            {inputs.type === 34 && (
              <Message>{t('channel.edit.coze_notice')}</Message>
            )}
            {inputs.type === 40 && (
              <Message>
                {t('channel.edit.douban_notice')}
                <a
                  target='_blank'
                  href='https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint'
                >
                  {t('channel.edit.douban_notice_link')}
                </a>
                {t('channel.edit.douban_notice_2')}
              </Message>
            )}
            {inputs.type !== 43 && (
              <Form.Field>
                <Form.Dropdown
                  label={t('channel.edit.models')}
                  placeholder={t('channel.edit.models_placeholder')}
                  name='models'
                  required
                  fluid
                  multiple
                  search
                  onLabelClick={(e, { value }) => {
                    copy(value).then();
                  }}
                  selection
                  onChange={handleModelsChange}
                  value={inputs.models}
                  autoComplete='new-password'
                  options={modelOptions}
                />
              </Form.Field>
            )}
            {inputs.type !== 43 && (
              <div style={{ lineHeight: '40px', marginBottom: '12px' }}>
                <Button
                  type={'button'}
                  loading={fetchingModels}
                  disabled={!isEdit || fetchingModels}
                  onClick={fetchUpstreamModels}
                >
                  {t('channel.edit.buttons.fetch_upstream')}
                </Button>
                <Button
                  type={'button'}
                  onClick={() => {
                    handleInputChange(null, { name: 'models', value: [] });
                    setModelAliases([]);
                    setModelOptions([]);
                  }}
                >
                  {t('channel.edit.buttons.clear')}
                </Button>
                <Input
                  action={
                    <Button type={'button'} onClick={addCustomModel}>
                      {t('channel.edit.buttons.add_custom')}
                    </Button>
                  }
                  placeholder={t('channel.edit.buttons.custom_placeholder')}
                  value={customModel}
                  onChange={(e, { value }) => {
                    setCustomModel(value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addCustomModel();
                      e.preventDefault();
                    }
                  }}
                />
              </div>
            )}
            {inputs.type !== 43 && modelAliases.length > 0 && (
              <Form.Field>
                <label>{t('channel.edit.model_aliases')}</label>
                <p style={{ color: 'gray', fontSize: '0.85em', marginTop: '-5px' }}>
                  {t('channel.edit.model_aliases_hint')}
                </p>
                <Table compact size='small' unstackable>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell width={7}>
                        {t('channel.edit.alias_original')}
                      </Table.HeaderCell>
                      <Table.HeaderCell width={7}>
                        {t('channel.edit.alias_name')}
                      </Table.HeaderCell>
                      <Table.HeaderCell width={2}>
                        {t('channel.edit.alias_actions')}
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {modelAliases.map((item, index) => (
                      <Table.Row key={index}>
                        <Table.Cell>{item.original}</Table.Cell>
                        <Table.Cell>
                          <Input
                            fluid
                            size='small'
                            placeholder={item.original}
                            value={item.alias}
                            onChange={(e, { value }) =>
                              updateModelAlias(index, value)
                            }
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            size='mini'
                            negative
                            type='button'
                            onClick={() => removeModelAlias(index)}
                          >
                            {t('channel.edit.alias_remove')}
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </Form.Field>
            )}
            {inputs.type !== 43 && (
              <>
                <Form.Field>
                  <Form.TextArea
                    label={`${t('channel.edit.model_mapping')}（${t('channel.edit.model_mapping_auto')}）`}
                    placeholder={t('channel.edit.model_mapping_placeholder')}
                    name='model_mapping'
                    readOnly
                    value={inputs.model_mapping}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
                <Form.Field>
                  <Form.TextArea
                    label={t('channel.edit.system_prompt')}
                    placeholder={t('channel.edit.system_prompt_placeholder')}
                    name='system_prompt'
                    onChange={handleInputChange}
                    value={inputs.system_prompt}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
              </>
            )}
            {inputs.type === 33 && (
              <Form.Field>
                <Form.Input
                  label='Region'
                  name='region'
                  required
                  placeholder={t('channel.edit.aws_region_placeholder')}
                  onChange={handleConfigChange}
                  value={config.region}
                  autoComplete=''
                />
                <Form.Input
                  label='AK'
                  name='ak'
                  required
                  placeholder={t('channel.edit.aws_ak_placeholder')}
                  onChange={handleConfigChange}
                  value={config.ak}
                  autoComplete=''
                />
                <Form.Input
                  label='SK'
                  name='sk'
                  required
                  placeholder={t('channel.edit.aws_sk_placeholder')}
                  onChange={handleConfigChange}
                  value={config.sk}
                  autoComplete=''
                />
              </Form.Field>
            )}
            {inputs.type === 42 && (
              <Form.Field>
                <Form.Input
                  label='Region'
                  name='region'
                  required
                  placeholder={t('channel.edit.vertex_region_placeholder')}
                  onChange={handleConfigChange}
                  value={config.region}
                  autoComplete=''
                />
                <Form.Input
                  label={t('channel.edit.vertex_project_id')}
                  name='vertex_ai_project_id'
                  required
                  placeholder={t('channel.edit.vertex_project_id_placeholder')}
                  onChange={handleConfigChange}
                  value={config.vertex_ai_project_id}
                  autoComplete=''
                />
                <Form.Input
                  label={t('channel.edit.vertex_credentials')}
                  name='vertex_ai_adc'
                  required
                  placeholder={t('channel.edit.vertex_credentials_placeholder')}
                  onChange={handleConfigChange}
                  value={config.vertex_ai_adc}
                  autoComplete=''
                />
              </Form.Field>
            )}
            {inputs.type === 34 && (
              <Form.Input
                label={t('channel.edit.user_id')}
                name='user_id'
                required
                placeholder={t('channel.edit.user_id_placeholder')}
                onChange={handleConfigChange}
                value={config.user_id}
                autoComplete=''
              />
            )}
            {inputs.type !== 33 &&
              inputs.type !== 42 &&
              (batch ? (
                <Form.Field>
                  <Form.TextArea
                    label={t('channel.edit.key')}
                    name='key'
                    required
                    placeholder={t('channel.edit.batch_placeholder')}
                    onChange={handleInputChange}
                    value={inputs.key}
                    style={{
                      minHeight: 150,
                      fontFamily: 'JetBrains Mono, Consolas',
                    }}
                    autoComplete='new-password'
                  />
                </Form.Field>
              ) : (
                <Form.Field>
                  <Form.Input
                    label={t('channel.edit.key')}
                    name='key'
                    required
                    placeholder={type2secretPrompt(inputs.type, t)}
                    onChange={handleInputChange}
                    value={inputs.key}
                    autoComplete='new-password'
                  />
                </Form.Field>
              ))}
            {inputs.type === 37 && (
              <Form.Field>
                <Form.Input
                  label='Account ID'
                  name='user_id'
                  required
                  placeholder={
                    '请输入 Account ID，例如：d8d7c61dbc334c32d3ced580e4bf42b4'
                  }
                  onChange={handleConfigChange}
                  value={config.user_id}
                  autoComplete=''
                />
              </Form.Field>
            )}
            {inputs.type !== 33 && !isEdit && (
              <Form.Checkbox
                checked={batch}
                label={t('channel.edit.batch')}
                name='batch'
                onChange={() => setBatch(!batch)}
              />
            )}
            {inputs.type !== 3 &&
              inputs.type !== 33 &&
              inputs.type !== 8 &&
                inputs.type !== 50 &&
              inputs.type !== 22 && (
                <Form.Field>
                  <Form.Input
                      label={t('channel.edit.proxy_url')}
                    name='base_url'
                      placeholder={t('channel.edit.proxy_url_placeholder')}
                    onChange={handleInputChange}
                    value={inputs.base_url}
                    autoComplete='new-password'
                  />
                </Form.Field>
              )}
            {inputs.type === 22 && (
              <Form.Field>
                <Form.Input
                  label='私有部署地址'
                  name='base_url'
                  placeholder={
                    '请输入私有部署地址，格式为：https://fastgpt.run/api/openapi'
                  }
                  onChange={handleInputChange}
                  value={inputs.base_url}
                  autoComplete='new-password'
                />
              </Form.Field>
            )}
            <Button onClick={handleCancel}>
              {t('channel.edit.buttons.cancel')}
            </Button>
            <Button
              type={isEdit ? 'button' : 'submit'}
              positive
              onClick={submit}
            >
              {t('channel.edit.buttons.submit')}
            </Button>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
};

export default EditChannel;
