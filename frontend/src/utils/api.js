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

  // No Authorization header. The session travels in the HttpOnly `atlas_token`
  // cookie that /auth/login sets, carried by `credentials: 'include'` below.
  //
  // A second copy used to be kept in localStorage and sent as a Bearer token,
  // and because the server prefers the header over the cookie, that copy was
  // the credential actually in use -- which made the HttpOnly flag decorative.
  // Any injected script could read the token and replay it for the life of the
  // session. Removing the readable copy is what makes HttpOnly mean something.
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
      clearSession();
      try {
        // The session cookie is HttpOnly, so this request is the only thing
        // that can clear it -- `clearSession()` above reaches localStorage and
        // nothing else. A failure here is not cosmetic: the browser keeps
        // sending a credential the user believes they have surrendered. It
        // used to be swallowed in silence, which is why that could not be
        // noticed from the outside.
        const res = await fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
          console.error(
            `ATLAS: sign-out did not complete (HTTP ${res.status}). The session cookie may still be set. `
            + 'Close the browser to be sure the session has ended.'
          );
        }
      } catch (err) {
        console.error(
          'ATLAS: sign-out request failed, so the session cookie may still be set. '
          + 'Close the browser to be sure the session has ended.',
          err
        );
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

/**
 * Fetch a binary response as a Blob.
 *
 * `request` above always drains the body with `response.text()`, which is right
 * for JSON and destroys a PDF. This is the same call — same base URL, same
 * bearer token, same cookie credentials, same 401 handling — stopping short of
 * that one step so the caller gets bytes.
 */
async function requestBlob(endpoint, options = {}) {
  let url = `${BASE_URL}${endpoint}`;
  if (options.params) {
    const query = new URLSearchParams(
      Object.fromEntries(
        Object.entries(options.params).filter(([, v]) => v !== undefined && v !== null && v !== '')
      )
    ).toString();
    if (query) url += (url.includes('?') ? '&' : '?') + query;
  }

  // Cookie-only, same as `request` above.
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });

  if (response.status === 401) {
    clearSession();
    if (window.location.pathname !== '/login') window.location.href = '/login';
    const authError = new Error('Your session has expired. Please sign in again.');
    authError.status = 401;
    throw authError;
  }

  if (!response.ok) {
    // An error body is JSON even when the success body would not be.
    let detail = `The server returned an unexpected response (${response.status}).`;
    try {
      const data = JSON.parse(await response.text());
      if (data?.detail) detail = Array.isArray(data.detail) ? data.detail.join(', ') : data.detail;
    } catch {
      /* keep the generic message */
    }
    const errorObj = new Error(detail);
    errorObj.status = response.status;
    throw errorObj;
  }

  return response.blob();
}

export const api = {
  get: (endpoint, options) => request(endpoint, { method: 'GET', ...options }),
  getBlob: (endpoint, options) => requestBlob(endpoint, options),
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
