import React, { lazy, Suspense, useContext, useEffect } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { API, getLogo, getSystemName, showError, showNotice } from './helpers';
import { UserContext } from './context/User';
import { StatusContext } from './context/Status';
import LoginForm from './components/LoginForm';
import { PrivateRoute } from './components/PrivateRoute';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Channel = lazy(() => import('./pages/Channel'));
const EditChannel = lazy(() => import('./pages/Channel/EditChannel'));
const Token = lazy(() => import('./pages/Token'));
const EditToken = lazy(() => import('./pages/Token/EditToken'));
const User = lazy(() => import('./pages/User'));
const EditUser = lazy(() => import('./pages/User/EditUser'));
const AddUser = lazy(() => import('./pages/User/AddUser'));
const Log = lazy(() => import('./pages/Log'));
const Setting = lazy(() => import('./pages/Setting'));
const About = lazy(() => import('./pages/About'));
const Chat = lazy(() => import('./pages/Chat'));
const Group = lazy(() => import('./pages/Group'));
const NotFound = lazy(() => import('./pages/NotFound'));
const RegisterForm = lazy(() => import('./components/RegisterForm'));
const PasswordResetForm = lazy(() => import('./components/PasswordResetForm'));
const PasswordResetConfirm = lazy(() => import('./components/PasswordResetConfirm'));

const Loading = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
    <div className='aurora-loading-spinner' />
  </div>
);

function App() {
  const [userState, userDispatch] = useContext(UserContext);
  const [, statusDispatch] = useContext(StatusContext);

  const loadUser = () => {
    let user = localStorage.getItem('user');
    if (user) {
      userDispatch({ type: 'login', payload: JSON.parse(user) });
    }
  };

  const loadStatus = async () => {
    try {
      const res = await API.get('/api/status');
      const { success, message, data } = res.data || {};
      if (success && data) {
        localStorage.setItem('status', JSON.stringify(data));
        statusDispatch({ type: 'set', payload: data });
        localStorage.setItem('system_name', data.system_name);
        localStorage.setItem('logo', data.logo);
        localStorage.setItem('footer_html', data.footer_html);
        localStorage.setItem('quota_per_unit', data.quota_per_unit);
        localStorage.setItem('display_in_currency', data.display_in_currency);
        if (data.chat_link) localStorage.setItem('chat_link', data.chat_link);
        else localStorage.removeItem('chat_link');
        if (data.version !== process.env.REACT_APP_VERSION && data.version !== 'v0.0.0' && process.env.REACT_APP_VERSION !== '') {
          showNotice(`新版本可用：${data.version}，请使用快捷键 Shift + F5 刷新页面`);
        }
      } else {
        showError(message || '无法正常连接至服务器！');
      }
    } catch (error) {
      showError(error.message || '无法正常连接至服务器！');
    }
  };

  useEffect(() => {
    loadUser();
    loadStatus();
    const systemName = getSystemName();
    if (systemName) document.title = systemName;
    const logo = getLogo();
    if (logo) {
      const link = document.querySelector("link[rel~='icon']");
      if (link) link.href = logo;
    }
  }, []);

  return (
    <Routes>
      <Route path='/' element={<Navigate to='/dashboard' replace />} />
      <Route path='/dashboard' element={<PrivateRoute><Suspense fallback={<Loading />}><Dashboard /></Suspense></PrivateRoute>} />
      <Route path='/channel' element={<PrivateRoute><Suspense fallback={<Loading />}><Channel /></Suspense></PrivateRoute>} />
      <Route path='/channel/edit/:id' element={<Suspense fallback={<Loading />}><EditChannel /></Suspense>} />
      <Route path='/channel/add' element={<Suspense fallback={<Loading />}><EditChannel /></Suspense>} />
      <Route path='/token' element={<PrivateRoute><Suspense fallback={<Loading />}><Token /></Suspense></PrivateRoute>} />
      <Route path='/token/edit/:id' element={<Suspense fallback={<Loading />}><EditToken /></Suspense>} />
      <Route path='/token/add' element={<Suspense fallback={<Loading />}><EditToken /></Suspense>} />
      <Route path='/user' element={<PrivateRoute><Suspense fallback={<Loading />}><User /></Suspense></PrivateRoute>} />
      <Route path='/user/edit/:id' element={<Suspense fallback={<Loading />}><EditUser /></Suspense>} />
      <Route path='/user/edit' element={<Suspense fallback={<Loading />}><EditUser /></Suspense>} />
      <Route path='/user/add' element={<Suspense fallback={<Loading />}><AddUser /></Suspense>} />
      <Route path='/user/reset' element={<Suspense fallback={<Loading />}><PasswordResetConfirm /></Suspense>} />
      <Route path='/login' element={<Suspense fallback={<Loading />}><LoginForm /></Suspense>} />
      <Route path='/register' element={<Suspense fallback={<Loading />}><RegisterForm /></Suspense>} />
      <Route path='/reset' element={<Suspense fallback={<Loading />}><PasswordResetForm /></Suspense>} />
      <Route path='/setting' element={<PrivateRoute><Suspense fallback={<Loading />}><Setting /></Suspense></PrivateRoute>} />
      <Route path='/log' element={<PrivateRoute><Suspense fallback={<Loading />}><Log /></Suspense></PrivateRoute>} />
      <Route path='/about' element={<Suspense fallback={<Loading />}><About /></Suspense>} />
      <Route path='/chat' element={<Suspense fallback={<Loading />}><Chat /></Suspense>} />
      <Route path='/group' element={<PrivateRoute><Suspense fallback={<Loading />}><Group /></Suspense></PrivateRoute>} />
      <Route path='*' element={<Suspense fallback={<Loading />}><NotFound /></Suspense>} />
    </Routes>
  );
}

export default App;