import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { PartyProvider } from '../party/PartyContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import Home from './pages/Home';
import CallbackPage from './pages/CallbackPage';
import PartyLobbyPage from './pages/PartyLobbyPage';
import PixiApp from './PixiApp';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<CallbackPage />} />

          <Route path="/home" element={
            <ProtectedRoute><Home /></ProtectedRoute>
          } />

          <Route path="/parties/*" element={
            <ProtectedRoute>
              <PartyProvider>
                <PartyLobbyPage />
              </PartyProvider>
            </ProtectedRoute>
          } />

          <Route path="/game" element={
            <ProtectedRoute>
              <PartyProvider>
                <PixiApp />
              </PartyProvider>
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
