import React, { useState } from 'react';
import { Modal, Button, Form, Label, Segment, Header } from 'semantic-ui-react';
import { API, showError, showSuccess } from '../helpers';
import { useTranslation } from 'react-i18next';
import { renderQuota, renderNumber } from '../helpers/render';

const RechargeModal = ({ open, onClose, user, onSuccess }) => {
  const { t } = useTranslation();
  const [addAmount, setAddAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const displayInCurrency =
    localStorage.getItem('display_in_currency') === 'true';
  const quotaPerUnit = parseFloat(localStorage.getItem('quota_per_unit') || '1');

  // 快捷金额：货币模式用美元，原始模式用 quota 数值
  const quickAmounts = displayInCurrency
    ? [100, 500, 1000, 5000]
    : [1000000, 5000000, 10000000, 50000000];

  const parsedAmount = parseFloat(addAmount) || 0;
  const addQuota = displayInCurrency
    ? Math.round(parsedAmount * quotaPerUnit)
    : Math.round(parsedAmount);
  const currentQuota = user ? user.quota : 0;
  const newQuota = currentQuota + addQuota;

  const handleQuickAdd = (amount) => {
    setAddAmount(String(amount));
  };

  const handleClose = () => {
    setAddAmount('');
    setRemark('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!addAmount || parsedAmount <= 0) {
      showError(t('user.recharge.messages.amount_invalid'));
      return;
    }
    setSubmitting(true);
    try {
      // 先获取用户完整数据，避免 PUT 覆写时丢失其他字段
      const res = await API.get(`/api/user/${user.id}`);
      const { success, data, message } = res.data;
      if (!success) {
        showError(message);
        setSubmitting(false);
        return;
      }
      // 计算新额度 = 当前额度 + 增加量
      const calculatedNewQuota = data.quota + addQuota;
      // 覆写式更新 quota
      const updateRes = await API.put('/api/user/', {
        ...data,
        quota: calculatedNewQuota,
      });
      const {
        success: updateSuccess,
        message: updateMessage,
      } = updateRes.data;
      if (updateSuccess) {
        showSuccess(t('user.recharge.messages.success'));
        if (onSuccess) onSuccess(user.id, calculatedNewQuota);
        handleClose();
      } else {
        showError(updateMessage);
      }
    } catch (error) {
      showError(error.message || String(error));
    }
    setSubmitting(false);
  };

  if (!user) return null;

  return (
    <Modal open={open} onClose={handleClose} size='small'>
      <Header>{t('user.recharge.title')}</Header>
      <Modal.Content>
        <Form>
          {/* 用户信息 */}
          <Segment secondary>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '4px',
              }}
            >
              <span>
                <strong>{t('user.recharge.user')}:</strong> {user.username}
                {user.display_name ? ` (${user.display_name})` : ''}
              </span>
              <span>
                <strong>{t('user.recharge.current_quota')}:</strong>{' '}
                {renderQuota(user.quota, t)}
              </span>
            </div>
          </Segment>

          {/* 充值金额输入 */}
          <Form.Input
            label={
              displayInCurrency
                ? t('user.recharge.amount_label_currency')
                : t('user.recharge.amount_label_raw')
            }
            placeholder={
              displayInCurrency
                ? t('user.recharge.amount_placeholder_currency')
                : t('user.recharge.amount_placeholder_raw')
            }
            value={addAmount}
            onChange={(e, { value }) => setAddAmount(value)}
            type='number'
            min='0'
          />

          {/* 快捷金额按钮 */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{ marginBottom: '8px', display: 'block', fontWeight: 'bold' }}
            >
              {t('user.recharge.quick_add')}
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {quickAmounts.map((amount) => (
                <Button
                  key={amount}
                  size='small'
                  basic
                  onClick={() => handleQuickAdd(amount)}
                >
                  {displayInCurrency
                    ? `+$${amount}`
                    : `+${renderNumber(amount)}`}
                </Button>
              ))}
            </div>
          </div>

          {/* 实时预览 */}
          {addAmount && parsedAmount > 0 && (
            <Segment>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 'bold' }}>
                  {t('user.recharge.preview')}
                </span>
                <span>
                  <Label basic>{renderQuota(currentQuota, t)}</Label>
                  <span style={{ margin: '0 8px' }}>+</span>
                  <Label basic color='green'>
                    {renderQuota(addQuota, t)}
                  </Label>
                  <span style={{ margin: '0 8px' }}>=</span>
                  <Label basic color='blue'>
                    {renderQuota(newQuota, t)}
                  </Label>
                </span>
              </div>
              {displayInCurrency && (
                <div
                  style={{ marginTop: '8px', color: 'var(--aurora-text-muted)', fontSize: '12px' }}
                >
                  {t('user.recharge.raw_quota_hint', {
                    count: renderNumber(addQuota),
                  })}
                </div>
              )}
              {!displayInCurrency && quotaPerUnit > 0 && (
                <div
                  style={{ marginTop: '8px', color: 'var(--aurora-text-muted)', fontSize: '12px' }}
                >
                  {t('user.recharge.equivalent', {
                    amount: (addQuota / quotaPerUnit).toFixed(2),
                  })}
                </div>
              )}
            </Segment>
          )}

          {/* 备注 */}
          <Form.Input
            label={t('user.recharge.remark_label')}
            placeholder={t('user.recharge.remark_placeholder')}
            value={remark}
            onChange={(e, { value }) => setRemark(value)}
          />
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={handleClose} disabled={submitting}>
          {t('user.recharge.buttons.cancel')}
        </Button>
        <Button
          positive
          onClick={handleSubmit}
          loading={submitting}
          disabled={!addAmount || parsedAmount <= 0}
        >
          {t('user.recharge.buttons.confirm')}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default RechargeModal;
