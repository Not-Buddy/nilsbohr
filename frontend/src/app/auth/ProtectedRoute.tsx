import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={loaderStyle}>
        <div style={spinnerStyle} />
        <p style={textStyle}>Checking authentication…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

const loaderStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#000',
  gap: '16px',
};

const spinnerStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  border: '3px solid #334155',
  borderTop: '3px solid #3b82f6',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};

const textStyle: React.CSSProperties = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: '12px',
  color: '#94a3b8',
};
