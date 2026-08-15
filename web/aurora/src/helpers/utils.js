import {toast} from 'react-toastify';
import {toastConstants} from '../constants';
import React from 'react';
import {API} from './api';

const HTMLToastContent = ({ htmlContent }) => {
  return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
};
export default HTMLToastContent;

export function isAdmin() {
  let user = localStorage.getItem('user');
  if (!user) return false;
  user = JSON.parse(user);
  return user.role >= 10;
}

export function isRoot() {
  let user = localStorage.getItem('user');
  if (!user) return false;
  user = JSON.parse(user);
  return user.role >= 100;
}

export function getSystemName() {
  let system_name = localStorage.getItem('system_name');
  if (!system_name) return 'One API';
  return system_name;
}

export function getLogo() {
  let logo = localStorage.getItem('logo');
  if (!logo) return '/logo.png';
  return logo;
}

export function getFooterHTML() {
  return localStorage.getItem('footer_html');
}

export async function copy(text) {
  let okay = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    okay = false;
    console.error(e);
  }
  return okay;
}

export function isMobile() {
  return window.innerWidth <= 600;
}

let showErrorOptions = { autoClose: false, closeOnClick: false, draggable: false };
let showWarningOptions = { autoClose: toastConstants.WARNING_TIMEOUT };
let showSuccessOptions = { autoClose: toastConstants.SUCCESS_TIMEOUT };
let showInfoOptions = { autoClose: toastConstants.INFO_TIMEOUT };
let showNoticeOptions = { autoClose: false };

if (isMobile()) {
  showErrorOptions.position = 'top-center';
  // showErrorOptions.transition = 'flip';

  showSuccessOptions.position = 'top-center';
  // showSuccessOptions.transition = 'flip';

  showInfoOptions.position = 'top-center';
  // showInfoOptions.transition = 'flip';

  showNoticeOptions.position = 'top-center';
  // showNoticeOptions.transition = 'flip';
}

// 错误提示带复制按钮
const ErrorToastContent = ({ message }) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingRight: 20 }}>
      <span style={{ flex: 1, fontSize: 13, color: '#FF6B6B', wordBreak: 'break-all', lineHeight: 1.5 }}>{message}</span>
      <button
        onClick={handleCopy}
        style={{
          flexShrink: 0, height: 24, padding: '0 8px', borderRadius: 4,
          background: copied ? 'rgba(45,212,191,0.2)' : 'rgba(255,255,255,0.1)',
          border: 'none', color: copied ? '#2DD4BF' : '#A1A1AA',
          fontSize: 11, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  );
};

export function showError(error) {
  if (!error) return;
  console.error(error);
  let msg;
  if (error.message) {
    if (error.name === 'AxiosError') {
      switch (error.response.status) {
        case 401:
          window.location.href = '/login?expired=true';
          break;
        case 429:
          msg = '错误：请求次数过多，请稍后再试！';
          toast.error(<ErrorToastContent message={msg} />, showErrorOptions);
          break;
        case 500:
          msg = '错误：服务器内部错误，请联系管理员！';
          toast.error(<ErrorToastContent message={msg} />, showErrorOptions);
          break;
        case 405:
          toast.info('本站仅作演示之用，无服务端！');
          break;
        default:
          msg = '错误：' + error.message;
          toast.error(<ErrorToastContent message={msg} />, showErrorOptions);
      }
      return;
    }
    msg = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
  } else {
    msg = typeof error === 'string' ? error : JSON.stringify(error);
  }
  // 如果是后端返回的 {success:false, message:xxx} 格式
  if (error && error.response && error.response.data && error.response.data.message) {
    msg = error.response.data.message;
  }
  toast.error(<ErrorToastContent message={'错误：' + msg} />, showErrorOptions);
}

export function showWarning(message) {
  toast.warn(message, showWarningOptions);
}

export function showSuccess(message) {
  toast.success(message, showSuccessOptions);
}

export function showInfo(message) {
  toast.info(message, showInfoOptions);
}

export function showNotice(message, isHTML = false) {
  if (isHTML) {
    toast(<HTMLToastContent htmlContent={message} />, showNoticeOptions);
  } else {
    toast.info(message, showNoticeOptions);
  }
}

export function openPage(url) {
  window.open(url);
}

export function removeTrailingSlash(url) {
  if (url.endsWith('/')) {
    return url.slice(0, -1);
  } else {
    return url;
  }
}

export function timestamp2string(timestamp) {
  let date = new Date(timestamp * 1000);
  let year = date.getFullYear().toString();
  let month = (date.getMonth() + 1).toString();
  let day = date.getDate().toString();
  let hour = date.getHours().toString();
  let minute = date.getMinutes().toString();
  let second = date.getSeconds().toString();
  if (month.length === 1) {
    month = '0' + month;
  }
  if (day.length === 1) {
    day = '0' + day;
  }
  if (hour.length === 1) {
    hour = '0' + hour;
  }
  if (minute.length === 1) {
    minute = '0' + minute;
  }
  if (second.length === 1) {
    second = '0' + second;
  }
  return (
      year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second
  );
}

export function downloadTextAsFile(text, filename) {
  let blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

export const verifyJSON = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

export function shouldShowPrompt(id) {
  let prompt = localStorage.getItem(`prompt-${id}`);
  return !prompt;
}

export function setPromptShown(id) {
  localStorage.setItem(`prompt-${id}`, 'true');
}
