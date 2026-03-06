import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function CallbackPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      // Save token and force full-page reload so AuthProvider picks it up
      localStorage.setItem('token', token);
      window.location.href = '/home';
    } else {
      // Failed — show error briefly, then go back to landing
      setError(true);
      setTimeout(() => (window.location.href = '/'), 2000);
    }
  }, [searchParams]);

  if (error) {
    return (
      <div style={style}>
        <p style={{ ...textStyle, color: '#ef4444' }}>❌ Login failed. Redirecting…</p>
      </div>
    );
  }

  return (
    <div style={style}>
      <p style={textStyle}>Logging you in…</p>
    </div>
  );
}

const style: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#000',
};

const textStyle: React.CSSProperties = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: '14px',
  color: '#94a3b8',
};
