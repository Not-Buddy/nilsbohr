import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import Home from './pages/Home';
import CallbackPage from './pages/CallbackPage';
import PixiApp from './PixiApp';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public — login landing page */}
          <Route path="/" element={<LandingPage />} />

          {/* Protected — repo diagram home */}
          <Route path="/home" element={
            <ProtectedRoute><Home /></ProtectedRoute>
          } />

          {/* Protected — game view */}
          <Route path="/game" element={
            <ProtectedRoute><PixiApp /></ProtectedRoute>
          } />

          {/* OAuth callback */}
          <Route path="/auth/callback" element={<CallbackPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
