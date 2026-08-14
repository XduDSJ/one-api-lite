import React, { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Grid,
  Header,
  Image,
  Card,
  Message,
} from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import { API, copy, getLogo, showError, showNotice } from '../helpers';
import { useSearchParams } from 'react-router-dom';

const PasswordResetConfirm = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({
    email: '',
    token: '',
  });
  const { email, token } = inputs;
  const [loading, setLoading] = useState(false);
  const [disableButton, setDisableButton] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const logo = getLogo();

  const [countdown, setCountdown] = useState(30);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    let token = searchParams.get('token');
    let email = searchParams.get('email');
    setInputs({
      token,
      email,
    });
  }, []);

  useEffect(() => {
    let countdownInterval = null;
    if (disableButton && countdown > 0) {
      countdownInterval = setInterval(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      setDisableButton(false);
      setCountdown(30);
    }
    return () => clearInterval(countdownInterval);
  }, [disableButton, countdown]);

  async function handleSubmit(e) {
    setDisableButton(true);
    if (!email) return;
    setLoading(true);
    const res = await API.post(`/api/user/reset`, {
      email,
      token,
    });
    const { success, message } = res.data;
    if (success) {
      let password = res.data.data;
      setNewPassword(password);
      await copy(password);
      showNotice(t('messages.notice.password_copied', { password }));
    } else {
      showError(message);
    }
    setLoading(false);
  }

  return (
    <Grid textAlign='center' style={{ minHeight: '100vh', margin: '0' }} verticalAlign='middle'>
      <Grid.Column style={{ maxWidth: 450 }}>
        <Card
          fluid
          className='auth-card'
        >
          <Card.Content>
            <Card.Header>
              <Header
                as='h2'
                textAlign='center'
                style={{ marginBottom: '1.5em' }}
              >
                <Image src={logo} style={{ marginBottom: '10px' }} />
                <Header.Content>{t('auth.reset.confirm.title')}</Header.Content>
              </Header>
            </Card.Header>
            <Form size='large'>
              <Form.Input
                fluid
                icon='mail'
                iconPosition='left'
                placeholder={t('auth.reset.email')}
                name='email'
                value={email}
                readOnly
                style={{ marginBottom: '1em' }}
              />
              {newPassword && (
                <Form.Input
                  fluid
                  icon='lock'
                  iconPosition='left'
                  placeholder={t('auth.reset.confirm.new_password')}
                  name='newPassword'
                  value={newPassword}
                  readOnly
                  style={{
                    marginBottom: '1em',
                    cursor: 'pointer',
                    backgroundColor: 'var(--aurora-surface-2)',
                  }}
                  onClick={(e) => {
                    e.target.select();
                    navigator.clipboard.writeText(newPassword);
                    showNotice(t('auth.reset.confirm.notice'));
                  }}
                />
              )}
              <Button
                fluid
                size='large'
                primary
                onClick={handleSubmit}
                loading={loading}
                disabled={disableButton}
                style={{
                  marginBottom: '1.5em',
                }}
              >
                {disableButton
                  ? t('auth.reset.confirm.button_disabled')
                  : t('auth.reset.confirm.button')}
              </Button>
            </Form>
            {newPassword && (
              <Message style={{ background: 'transparent', boxShadow: 'none' }}>
                <p style={{ fontSize: '0.9em', color: 'var(--aurora-text-muted)' }}>
                  {t('auth.reset.confirm.notice')}
                </p>
              </Message>
            )}
          </Card.Content>
        </Card>
      </Grid.Column>
    </Grid>
  );
};

export default PasswordResetConfirm;
