import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api.get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('documind:logout', onLogout);
    return () => window.removeEventListener('documind:logout', onLogout);
  }, []);

  const handleAuth = ({ token, user }) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(user);
    return user;
  };

  const login = useCallback(async (email, password) => handleAuth((await api.post('/auth/login', { email, password })).data), []);
  const register = useCallback(async (name, email, password) => handleAuth((await api.post('/auth/register', { name, email, password })).data), []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
