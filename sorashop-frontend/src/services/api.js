import axios from 'axios';
import { getSupportBoutiqueId } from './supportViewState';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api/';

const csrfOptions = {
  withCredentials: true,
};

const authClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  ...csrfOptions,
});

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  ...csrfOptions,
});

// Access tokens deliberately live only in this module's memory. A page reload
// requires a silent refresh using the HttpOnly cookie.
let accessToken = null;
let csrfToken = null;
let refreshPromise = null;
let authFailureHandler = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function clearAccessToken() {
  accessToken = null;
}

export function setAuthFailureHandler(handler) {
  authFailureHandler = handler;
}

async function ensureCsrfToken() {
  const response = await authClient.get('csrf/');
  csrfToken = response.data.csrfToken || null;
  if (!csrfToken) {
    throw new Error('Le serveur n’a pas renvoyé de token CSRF.');
  }
}

authClient.interceptors.request.use((config) => {
  if (csrfToken && !['get', 'head', 'options'].includes(config.method?.toLowerCase())) {
    config.headers['X-CSRFToken'] = csrfToken;
  }
  return config;
});

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      // This also recovers from a deleted/expired CSRF cookie before a refresh.
      await ensureCsrfToken();
      const response = await authClient.post('token/refresh/', {});
      setAccessToken(response.data.access);
      return response.data.access;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function bootstrapAuthentication() {
  try {
    await refreshAccessToken();
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}

export async function logout() {
  try {
    await ensureCsrfToken();
    await authClient.post('token/logout/', {});
  } finally {
    clearAccessToken();
  }
}

function isAuthEndpoint(url = '') {
  return /(^|\/)token(\/|$)|(^|\/)csrf(\/|$)/.test(url);
}

api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    const supportBoutiqueId = getSupportBoutiqueId();
    if (supportBoutiqueId) {
      config.headers['X-Support-Boutique'] = String(supportBoutiqueId);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      isAuthEndpoint(originalRequest.url)
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      const token = await refreshAccessToken();
      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    } catch (refreshError) {
      clearAccessToken();
      authFailureHandler?.();
      return Promise.reject(refreshError);
    }
  }
);

// The backend paginates lists. Existing components retain their previous API.
export async function getAll(url, config) {
  let resultats = [];
  let suivant = url;
  let premierAppel = true;

  while (suivant) {
    const response = await api.get(suivant, premierAppel ? config : undefined);
    resultats = resultats.concat(response.data.results);
    suivant = response.data.next;
    premierAppel = false;
  }

  return resultats;
}

export default api;
