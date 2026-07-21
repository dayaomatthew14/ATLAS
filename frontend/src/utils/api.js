let rawBaseUrl = import.meta.env.VITE_API_URL || '/api';
if (rawBaseUrl.startsWith('http://') && !rawBaseUrl.includes('localhost') && !rawBaseUrl.includes('127.0.0.1')) {
  rawBaseUrl = rawBaseUrl.replace('http://', 'https://');
}
const BASE_URL = rawBaseUrl;
console.log("[ATLAS API] Base URL initialized as:", BASE_URL);

async function request(endpoint, options = {}) {
  const isFormData = options.body instanceof FormData;
  
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
    const response = await fetch(`${BASE_URL}${endpoint}`, config);
    
    if (response.status === 401) {
      localStorage.removeItem('atlas_role');
      localStorage.removeItem('atlas_user_name');
      localStorage.removeItem('atlas_department');
      localStorage.removeItem('atlas_profile_picture');
      // Don't try to removeItem('atlas_token') — it's an HttpOnly cookie
      try {
        await fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch (e) {}
      window.location.href = '/login';
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
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  postForm: (endpoint, formData) => request(endpoint, { method: 'POST', body: formData }),
  post: (endpoint, body) => {
    const isFormData = body instanceof FormData;
    return request(endpoint, { 
      method: 'POST', 
      body: isFormData ? body : JSON.stringify(body) 
    });
  },
  put: (endpoint, body) => {
    const isFormData = body instanceof FormData;
    return request(endpoint, { 
      method: 'PUT', 
      body: isFormData ? body : JSON.stringify(body) 
    });
  },
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};
