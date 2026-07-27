import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { PartyProvider, useParty } from '../party/PartyContext';
import { PartyMemberOverlay } from './components/PartyMemberOverlay';
import ProtectedRoute from './auth/ProtectedRoute';
import DeviceGuard from './components/DeviceGuard';
import BackendGuard from './components/BackendGuard';
import LandingPage from './pages/LandingPage';
import Home from './pages/Home';
import CallbackPage from './pages/CallbackPage';
import PartyLobbyPage from './pages/PartyLobbyPage';
import PixiApp from './PixiApp';
import './App.css';

function GlobalPartyHUD() {
  const { party, remotePlayers } = useParty();
  if (!party) return null;
  return <PartyMemberOverlay remotePlayers={remotePlayers} />;
}

function App() {
  return (
    <DeviceGuard>
      <AuthProvider>
        <PartyProvider>
          <BrowserRouter>
            <GlobalPartyHUD />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login/callback" element={<CallbackPage />} />

              <Route path="/home" element={
                <ProtectedRoute><Home /></ProtectedRoute>
              } />

              <Route path="/lobby" element={
                <ProtectedRoute>
                  <PartyLobbyPage />
                </ProtectedRoute>
              } />

              <Route path="/game" element={
                <ProtectedRoute>
                  <BackendGuard>
                    <PixiApp />
                  </BackendGuard>
                </ProtectedRoute>
              } />
            </Routes>
          </BrowserRouter>
        </PartyProvider>
      </AuthProvider>
    </DeviceGuard>
  );
}

export default App;
