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

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
      localStorage.removeItem('atlas_role');
      localStorage.removeItem('atlas_user_name');
      localStorage.removeItem('atlas_department');
      localStorage.removeItem('atlas_profile_picture');
      // Don't try to removeItem('atlas_token') — it's an HttpOnly cookie
      try {
        await fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch (e) { }
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return;
    }

    if (response.status === 204) {
      return null;
    }

    const data = await response.json();

    if (!response.ok) {
      let errorMessage = 'Something went wrong';
      if (Array.isArray(data.detail)) {
        errorMessage = data.detail.map(e => `${e.loc?.join('.')} ${e.msg}`).join(', ');
      } else if (data.detail) {
        errorMessage = data.detail;
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
  delete: (endpoint, options) => request(endpoint, { method: 'DELETE', ...options }),
};
