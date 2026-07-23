import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Divider,
  Form,
  Grid,
  Header,
  Modal,
  Message,
} from 'semantic-ui-react';
import { Link } from 'react-router-dom';
import {
  API,
  removeTrailingSlash,
  showError,
  showSuccess,
  timestamp2string,
} from '../helpers';

const SystemSetting = () => {
  const { t } = useTranslation();
  let [inputs, setInputs] = useState({
    // 通用
    SystemName: '',
    Logo: '',
    ServerAddress: '',
    Footer: '',
    Theme: '',
    // 登录注册
    PasswordLoginEnabled: '',
    PasswordRegisterEnabled: '',
    EmailVerificationEnabled: '',
    RegisterEnabled: '',
    // 邮箱域名限制
    EmailDomainRestrictionEnabled: '',
    EmailDomainWhitelist: '',
    // SMTP
    SMTPServer: '',
    SMTPPort: '',
    SMTPAccount: '',
    SMTPFrom: '',
    SMTPToken: '',
    // 运营
    PreConsumedQuota: 0,
    ChatLink: '',
    RetryTimes: 0,
    ApproximateTokenEnabled: '',
    DisplayTokenStatEnabled: '',
    // 渠道监控
    AutomaticDisableChannelEnabled: '',
    AutomaticEnableChannelEnabled: '',
    ChannelDisableThreshold: 0,
    // 日志
    LogConsumeEnabled: '',
    // 内容
    Notice: '',
    HomePageContent: '',
    About: '',
  });
  const [originInputs, setOriginInputs] = useState({});
  let [loading, setLoading] = useState(false);
  const [EmailDomainWhitelist, setEmailDomainWhitelist] = useState([]);
  const [restrictedDomainInput, setRestrictedDomainInput] = useState('');
  const [showPasswordWarningModal, setShowPasswordWarningModal] =
    useState(false);
  let [historyTimestamp, setHistoryTimestamp] = useState(
    timestamp2string((new Date().getTime() / 1000) - 30 * 24 * 3600)
  );

  const getOptions = async () => {
    const res = await API.get('/api/option/');
    const { success, message, data } = res.data;
    if (success) {
      let newInputs = {};
      data.forEach((item) => {
        newInputs[item.key] = item.value;
      });
      setInputs({
        ...newInputs,
        EmailDomainWhitelist: newInputs.EmailDomainWhitelist.split(','),
      });
      setOriginInputs(newInputs);
      setEmailDomainWhitelist(
        newInputs.EmailDomainWhitelist.split(',').map((item) => {
          return { key: item, text: item, value: item };
        })
      );
    } else {
      showError(message);
    }
  };

  useEffect(() => {
    getOptions().then();
  }, []);

  const updateOption = async (key, value) => {
    setLoading(true);
    if (key.endsWith('Enabled')) {
      value = inputs[key] === 'true' ? 'false' : 'true';
    }
    const res = await API.put('/api/option/', {
      key,
      value,
    });
    const { success, message } = res.data;
    if (success) {
      if (key === 'EmailDomainWhitelist') {
        value = value.split(',');
      }
      setInputs((inputs) => ({
        ...inputs,
        [key]: value,
      }));
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const handleInputChange = async (e, { name, value }) => {
    if (name === 'PasswordLoginEnabled' && inputs[name] === 'true') {
      setShowPasswordWarningModal(true);
      return;
    }
    if (name.endsWith('Enabled')) {
      await updateOption(name, value);
    } else {
      setInputs((inputs) => ({ ...inputs, [name]: value }));
    }
  };

  const submitOption = async (key) => {
    if (key === 'ServerAddress') {
      await updateOption('ServerAddress', removeTrailingSlash(inputs.ServerAddress));
    } else {
      await updateOption(key, inputs[key]);
    }
  };

  const submitSMTP = async () => {
    if (originInputs['SMTPServer'] !== inputs.SMTPServer) {
      await updateOption('SMTPServer', inputs.SMTPServer);
    }
    if (originInputs['SMTPAccount'] !== inputs.SMTPAccount) {
      await updateOption('SMTPAccount', inputs.SMTPAccount);
    }
    if (originInputs['SMTPFrom'] !== inputs.SMTPFrom) {
      await updateOption('SMTPFrom', inputs.SMTPFrom);
    }
    if (
      originInputs['SMTPPort'] !== inputs.SMTPPort &&
      inputs.SMTPPort !== ''
    ) {
      await updateOption('SMTPPort', inputs.SMTPPort);
    }
    if (
      originInputs['SMTPToken'] !== inputs.SMTPToken &&
      inputs.SMTPToken !== ''
    ) {
      await updateOption('SMTPToken', inputs.SMTPToken);
    }
  };

  const submitEmailDomainWhitelist = async () => {
    if (
      originInputs['EmailDomainWhitelist'] !==
        inputs.EmailDomainWhitelist.join(',') &&
      inputs.SMTPToken !== ''
    ) {
      await updateOption(
        'EmailDomainWhitelist',
        inputs.EmailDomainWhitelist.join(',')
      );
    }
  };

  const deleteHistoryLogs = async () => {
    const res = await API.delete(
      `/api/log/?target_timestamp=${Date.parse(historyTimestamp) / 1000}`
    );
    const { success, message, data } = res.data;
    if (success) {
      showSuccess(`${data} 条日志已清理！`);
      return;
    }
    showError('日志清理失败：' + message);
  };

  return (
    <Grid columns={1}>
      <Grid.Column>
        <Form loading={loading}>
          {/* 1. 通用 */}
          <Header as='h3'>{t('setting.other.system.title')}</Header>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.other.system.name')}
              placeholder={t('setting.other.system.name_placeholder')}
              value={inputs.SystemName}
              name='SystemName'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('SystemName')}>
            {t('setting.other.system.buttons.save_name')}
          </Form.Button>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.other.system.logo')}
              placeholder={t('setting.other.system.logo_placeholder')}
              value={inputs.Logo}
              name='Logo'
              type='url'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('Logo')}>
            {t('setting.other.system.buttons.save_logo')}
          </Form.Button>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.system.general.server_address')}
              placeholder={t(
                'setting.system.general.server_address_placeholder'
              )}
              value={inputs.ServerAddress}
              name='ServerAddress'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('ServerAddress')}>
            {t('setting.system.general.buttons.update')}
          </Form.Button>
          <Form.Group widths='equal'>
            <Form.Input
              label={
                <label>
                  {t('setting.other.system.theme.title')}（
                  <Link to='https://github.com/songquanpeng/one-api/blob/main/web/README.md'>
                    {t('setting.other.system.theme.link')}
                  </Link>
                  ）
                </label>
              }
              placeholder={t('setting.other.system.theme.placeholder')}
              value={inputs.Theme}
              name='Theme'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('Theme')}>
            {t('setting.other.system.buttons.save_theme')}
          </Form.Button>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.other.content.footer.title')}
              placeholder={t('setting.other.content.footer.placeholder')}
              value={inputs.Footer}
              name='Footer'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('Footer')}>
            {t('setting.other.content.buttons.save_footer')}
          </Form.Button>

          <Divider />
          {/* 2. 登录注册 */}
          <Header as='h3'>{t('setting.system.login.title')}</Header>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.PasswordLoginEnabled === 'true'}
              label={t('setting.system.login.password_login')}
              name='PasswordLoginEnabled'
              onChange={handleInputChange}
            />
            {showPasswordWarningModal && (
              <Modal
                open={showPasswordWarningModal}
                onClose={() => setShowPasswordWarningModal(false)}
                size={'tiny'}
                style={{ maxWidth: '450px' }}
              >
                <Modal.Header>
                  {t('setting.system.password_login.warning.title')}
                </Modal.Header>
                <Modal.Content>
                  <p>{t('setting.system.password_login.warning.content')}</p>
                </Modal.Content>
                <Modal.Actions>
                  <Button onClick={() => setShowPasswordWarningModal(false)}>
                    {t('setting.system.password_login.warning.buttons.cancel')}
                  </Button>
                  <Button
                    color='yellow'
                    onClick={async () => {
                      setShowPasswordWarningModal(false);
                      await updateOption('PasswordLoginEnabled', 'false');
                    }}
                  >
                    {t('setting.system.password_login.warning.buttons.confirm')}
                  </Button>
                </Modal.Actions>
              </Modal>
            )}
            <Form.Checkbox
              checked={inputs.PasswordRegisterEnabled === 'true'}
              label={t('setting.system.login.password_register')}
              name='PasswordRegisterEnabled'
              onChange={handleInputChange}
            />
            <Form.Checkbox
              checked={inputs.EmailVerificationEnabled === 'true'}
              label={t('setting.system.login.email_verification')}
              name='EmailVerificationEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.RegisterEnabled === 'true'}
              label={t('setting.system.login.registration')}
              name='RegisterEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>

          <Divider />
          {/* 3. 邮件 */}
          <Header as='h3'>{t('setting.system.smtp.title')}</Header>
          <Message>{t('setting.system.smtp.subtitle')}</Message>
          <Form.Group widths={3}>
            <Form.Input
              label={t('setting.system.smtp.server')}
              placeholder={t('setting.system.smtp.server_placeholder')}
              name='SMTPServer'
              onChange={handleInputChange}
              value={inputs.SMTPServer}
            />
            <Form.Input
              label={t('setting.system.smtp.port')}
              placeholder={t('setting.system.smtp.port_placeholder')}
              name='SMTPPort'
              onChange={handleInputChange}
              value={inputs.SMTPPort}
            />
            <Form.Input
              label={t('setting.system.smtp.account')}
              placeholder={t('setting.system.smtp.account_placeholder')}
              name='SMTPAccount'
              onChange={handleInputChange}
              value={inputs.SMTPAccount}
            />
          </Form.Group>
          <Form.Group widths={3}>
            <Form.Input
              label={t('setting.system.smtp.from')}
              placeholder={t('setting.system.smtp.from_placeholder')}
              name='SMTPFrom'
              onChange={handleInputChange}
              value={inputs.SMTPFrom}
            />
            <Form.Input
              label={t('setting.system.smtp.token')}
              placeholder={t('setting.system.smtp.token_placeholder')}
              name='SMTPToken'
              onChange={handleInputChange}
              type='password'
              value={inputs.SMTPToken}
            />
          </Form.Group>
          <Form.Button onClick={submitSMTP}>
            {t('setting.system.smtp.buttons.save')}
          </Form.Button>

          <Header as='h4'>{t('setting.system.email_restriction.title')}</Header>
          <Message>{t('setting.system.email_restriction.subtitle')}</Message>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.EmailDomainRestrictionEnabled === 'true'}
              label={t('setting.system.email_restriction.enable')}
              name='EmailDomainRestrictionEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Group widths={3}>
            <Form.Input
              label={t('setting.system.email_restriction.add_domain')}
              placeholder={t(
                'setting.system.email_restriction.add_domain_placeholder'
              )}
              value={restrictedDomainInput}
              onChange={(e, { value }) => {
                setRestrictedDomainInput(value);
              }}
              action={
                <Button
                  onClick={() => {
                    if (restrictedDomainInput === '') return;
                    setEmailDomainWhitelist([
                      ...EmailDomainWhitelist,
                      {
                        key: restrictedDomainInput,
                        text: restrictedDomainInput,
                        value: restrictedDomainInput,
                      },
                    ]);
                    setRestrictedDomainInput('');
                  }}
                >
                  {t('setting.system.email_restriction.buttons.fill')}
                </Button>
              }
            />
          </Form.Group>
          <Form.Dropdown
            label={t('setting.system.email_restriction.allowed_domains')}
            placeholder={t('setting.system.email_restriction.allowed_domains')}
            fluid
            multiple
            search
            selection
            allowAdditions
            value={EmailDomainWhitelist.map((item) => item.value)}
            options={EmailDomainWhitelist}
            onAddItem={(e, { value }) => {
              setEmailDomainWhitelist([
                ...EmailDomainWhitelist,
                {
                  key: value,
                  text: value,
                  value: value,
                },
              ]);
            }}
            onChange={(e, { value }) => {
              let newEmailDomainWhitelist = [];
              value.forEach((item) => {
                newEmailDomainWhitelist.push({
                  key: item,
                  text: item,
                  value: item,
                });
              });
              setEmailDomainWhitelist(newEmailDomainWhitelist);
            }}
          />
          <Form.Button onClick={submitEmailDomainWhitelist}>
            {t('setting.system.email_restriction.buttons.save')}
          </Form.Button>

          <Divider />
          {/* 4. 运营 */}
          <Header as='h3'>{t('setting.operation.quota.title')}</Header>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.operation.quota.pre_consume')}
              name='PreConsumedQuota'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.PreConsumedQuota}
              type='number'
              min='0'
              placeholder={t('setting.operation.quota.pre_consume_placeholder')}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('PreConsumedQuota')}>
            {t('setting.operation.quota.buttons.save')}
          </Form.Button>

          <Header as='h4'>{t('setting.operation.general.title')}</Header>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.operation.general.chat_link')}
              name='ChatLink'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.ChatLink}
              type='link'
              placeholder={t('setting.operation.general.chat_link_placeholder')}
            />
            <Form.Input
              label={t('setting.operation.general.retry_times')}
              name='RetryTimes'
              type={'number'}
              step='1'
              min='0'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.RetryTimes}
              placeholder={t(
                'setting.operation.general.retry_times_placeholder'
              )}
            />
          </Form.Group>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.DisplayTokenStatEnabled === 'true'}
              label={t('setting.operation.general.display_token_stat')}
              name='DisplayTokenStatEnabled'
              onChange={handleInputChange}
            />
            <Form.Checkbox
              checked={inputs.ApproximateTokenEnabled === 'true'}
              label={t('setting.operation.general.approximate_token')}
              name='ApproximateTokenEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button onClick={() => { submitOption('ChatLink'); submitOption('RetryTimes'); }}>
            {t('setting.operation.general.buttons.save')}
          </Form.Button>

          <Divider />
          {/* 5. 渠道监控 */}
          <Header as='h3'>{t('setting.operation.monitor.title')}</Header>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.operation.monitor.max_response_time')}
              name='ChannelDisableThreshold'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.ChannelDisableThreshold}
              type='number'
              min='0'
              placeholder={t(
                'setting.operation.monitor.max_response_time_placeholder'
              )}
            />
          </Form.Group>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.AutomaticDisableChannelEnabled === 'true'}
              label={t('setting.operation.monitor.auto_disable')}
              name='AutomaticDisableChannelEnabled'
              onChange={handleInputChange}
            />
            <Form.Checkbox
              checked={inputs.AutomaticEnableChannelEnabled === 'true'}
              label={t('setting.operation.monitor.auto_enable')}
              name='AutomaticEnableChannelEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('ChannelDisableThreshold')}>
            {t('setting.operation.monitor.buttons.save')}
          </Form.Button>

          <Divider />
          {/* 6. 日志 */}
          <Header as='h3'>{t('setting.operation.log.title')}</Header>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.LogConsumeEnabled === 'true'}
              label={t('setting.operation.log.enable_consume')}
              name='LogConsumeEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Group widths={4}>
            <Form.Input
              label={t('setting.operation.log.target_time')}
              value={historyTimestamp}
              type='datetime-local'
              name='history_timestamp'
              onChange={(e, { name, value }) => {
                setHistoryTimestamp(value);
              }}
            />
          </Form.Group>
          <Form.Button onClick={deleteHistoryLogs}>
            {t('setting.operation.log.buttons.clean')}
          </Form.Button>

          <Divider />
          {/* 7. 内容 */}
          <Header as='h3'>{t('setting.other.content.title')}</Header>
          <Form.Group widths='equal'>
            <Form.TextArea
              label={t('setting.other.notice.content')}
              placeholder={t('setting.other.notice.content_placeholder')}
              value={inputs.Notice}
              name='Notice'
              onChange={handleInputChange}
              style={{ minHeight: 100, fontFamily: 'JetBrains Mono, Consolas' }}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('Notice')}>
            {t('setting.other.notice.buttons.save')}
          </Form.Button>
          <Form.Group widths='equal'>
            <Form.TextArea
              label={t('setting.other.content.homepage.title')}
              placeholder={t('setting.other.content.homepage.placeholder')}
              value={inputs.HomePageContent}
              name='HomePageContent'
              onChange={handleInputChange}
              style={{ minHeight: 150, fontFamily: 'JetBrains Mono, Consolas' }}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('HomePageContent')}>
            {t('setting.other.content.buttons.save_homepage')}
          </Form.Button>
          <Form.Group widths='equal'>
            <Form.TextArea
              label={t('setting.other.content.about.title')}
              placeholder={t('setting.other.content.about.placeholder')}
              value={inputs.About}
              name='About'
              onChange={handleInputChange}
              style={{ minHeight: 150, fontFamily: 'JetBrains Mono, Consolas' }}
            />
          </Form.Group>
          <Form.Button onClick={() => submitOption('About')}>
            {t('setting.other.content.buttons.save_about')}
          </Form.Button>
          <Message>{t('setting.other.copyright.notice')}</Message>
        </Form>
      </Grid.Column>
    </Grid>
  );
};

export default SystemSetting;
