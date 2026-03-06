import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import api from './api';

export type User = {
  github_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('token')
  );
  const [isLoading, setIsLoading] = useState(true);

  // On mount (or when token changes), validate it via /auth/me
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setUser(null);
      return;
    }

    let cancelled = false;

    api
      .get('/auth/me')
      .then((res) => {
        if (!cancelled) setUser(res.data);
      })
      .catch(() => {
        if (!cancelled) {
          // Token is invalid — clean up
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = () => {
    // Redirect to backend, which redirects to GitHub OAuth
    window.location.href = `${import.meta.env.VITE_BACKEND_URL}/auth/login`;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore — we clear locally anyway
    }
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    // Force redirect to landing page
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
