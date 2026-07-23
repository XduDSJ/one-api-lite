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
import { API, getLogo, showError, showInfo, showSuccess } from '../helpers';

const PasswordResetForm = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({
    email: '',
  });
  const { email } = inputs;
  const [loading, setLoading] = useState(false);
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const logo = getLogo();

  useEffect(() => {
    let status = localStorage.getItem('status');
    if (status) {
      status = JSON.parse(status);
    }
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

  function handleChange(e) {
    const { name, value } = e.target;
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }

  async function handleSubmit(e) {
    setDisableButton(true);
    if (!email) return;
    setLoading(true);
    const res = await API.get(
      `/api/reset_password?email=${email}`
    );
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('auth.reset.notice'));
      setInputs({ ...inputs, email: '' });
    } else {
      showError(message);
      setDisableButton(false);
      setCountdown(30);
    }
    setLoading(false);
  }

  return (
    <Grid textAlign='center' style={{ marginTop: '48px' }}>
      <Grid.Column style={{ maxWidth: 450 }}>
        <Card
          fluid
          className='chart-card'
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
        >
          <Card.Content>
            <Card.Header>
              <Header
                as='h2'
                textAlign='center'
                style={{ marginBottom: '1.5em' }}
              >
                <Image src={logo} style={{ marginBottom: '10px' }} />
                <Header.Content>{t('auth.reset.title')}</Header.Content>
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
                onChange={handleChange}
                style={{ marginBottom: '1em' }}
              />
              <Button
                color='blue'
                fluid
                size='large'
                onClick={handleSubmit}
                loading={loading}
                disabled={disableButton}
                style={{
                  background: '#2F73FF', // 使用更现代的蓝色
                  color: 'white',
                  marginBottom: '1.5em',
                }}
              >
                {disableButton
                  ? t('auth.register.get_code_retry', { countdown })
                  : t('auth.reset.button')}
              </Button>
            </Form>
            <Message style={{ background: 'transparent', boxShadow: 'none' }}>
              <p style={{ fontSize: '0.9em', color: '#666' }}>
                {t('auth.reset.notice')}
              </p>
            </Message>
          </Card.Content>
        </Card>
      </Grid.Column>
    </Grid>
  );
};

export default PasswordResetForm;
