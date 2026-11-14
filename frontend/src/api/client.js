import axios from 'axios';

export const TOKEN_KEY = 'documind-token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 180_000, // AI extraction of a batch can take a while
});

// Attach JWT to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Expired / invalid session → broadcast logout.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login') && !err.config?.url?.includes('/auth/register')) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event('documind:logout'));
    }
    return Promise.reject(err);
  }
);

export const errorMessage = (err) =>
  err?.response?.data?.error ||
  (err?.code === 'ERR_NETWORK' ? 'Cannot reach the DocuMind API. Is the backend running?' : err?.message) ||
  'Something went wrong';

export default api;
