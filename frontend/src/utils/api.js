import { clearSession } from './session';

let rawBaseUrl = import.meta.env.VITE_API_URL || '/api';
const isLocalHost = (typeof window !== 'undefined') && (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1' ||
  rawBaseUrl.includes('localhost') ||
  rawBaseUrl.includes('127.0.0.1')
);

if (!isLocalHost && (rawBaseUrl.includes('railway.app') || (typeof window !== 'undefined' && window.location.protocol === 'https:'))) {
  rawBaseUrl = rawBaseUrl.replace(/^http:\/\//i, 'https://');
}
const BASE_URL = rawBaseUrl;

/**
 * Exported for the few places that need a URL rather than a fetch — PDF and
 * Excel exports opened in a new tab. Two call sites had invented
 * `api.defaults.baseURL`, which does not exist on this object and threw a
 * TypeError on click (HEU-03).
 */
export const API_BASE = BASE_URL;

async function request(endpoint, options = {}) {
  const isFormData = options.body instanceof FormData;
  let url = `${BASE_URL}${endpoint}`;
  if (!isLocalHost && typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    url = url.replace(/^http:\/\//i, 'https://');
  }
  if (options.params) {
    const paramsObj = {};
    Object.keys(options.params).forEach(k => {
      if (options.params[k] !== undefined && options.params[k] !== null) {
        paramsObj[k] = options.params[k];
      }
    });
    const query = new URLSearchParams(paramsObj).toString();
    if (query) {
      url += (url.includes('?') ? '&' : '?') + query;
    }
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('atlas_token') : null;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
    credentials: 'include',
  };

  try {
    const response = await fetch(url, config);

    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      clearSession();
      try {
        await fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch {
        /* the session is already gone locally; a failed logout call changes nothing */
      }
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      // Throw rather than returning undefined: callers that immediately do
      // data.map(...) would otherwise crash with a confusing TypeError before
      // the redirect completes.
      const authError = new Error('Your session has expired. Please sign in again.');
      authError.status = 401;
      throw authError;
    }

    if (response.status === 204) {
      return null;
    }

    // Not every response carries a JSON body — an empty body, an HTML error
    // page from a proxy, or a server restarting mid-request all produce one
    // that response.json() cannot parse. Parsing defensively means the caller
    // sees the real HTTP failure instead of a confusing SyntaxError.
    const raw = await response.text();
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      let errorMessage = 'Something went wrong';
      if (Array.isArray(data?.detail)) {
        errorMessage = data.detail.map(e => `${e.loc?.join('.')} ${e.msg}`).join(', ');
      } else if (data?.detail) {
        errorMessage = data.detail;
      } else {
        errorMessage = `The server returned an unexpected response (${response.status}).`;
      }
      const errorObj = new Error(errorMessage);
      errorObj.status = response.status;
      errorObj.response = { status: response.status, data };
      throw errorObj;
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

export const api = {
  get: (endpoint, options) => request(endpoint, { method: 'GET', ...options }),
  postForm: (endpoint, formData, options) => request(endpoint, { method: 'POST', body: formData, ...options }),
  post: (endpoint, body, options) => {
    const isFormData = body instanceof FormData;
    return request(endpoint, {
      method: 'POST',
      body: isFormData ? body : JSON.stringify(body),
      ...options
    });
  },
  put: (endpoint, body, options) => {
    const isFormData = body instanceof FormData;
    return request(endpoint, {
      method: 'PUT',
      body: isFormData ? body : JSON.stringify(body),
      ...options
    });
  },
  patch: (endpoint, body, options) => {
    const isFormData = body instanceof FormData;
    return request(endpoint, {
      method: 'PATCH',
      body: isFormData ? body : JSON.stringify(body),
      ...options
    });
  },
  delete: (endpoint, options) => request(endpoint, { method: 'DELETE', ...options }),
};
