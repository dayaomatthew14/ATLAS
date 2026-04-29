const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

  if (!isFormData && options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);
    
    if (response.status === 401) {
      localStorage.removeItem('atlas_token');
      localStorage.removeItem('atlas_role');
      window.location.href = '/login';
      return;
    }

    if (response.status === 204) {
      return null;
    }

    // Try to parse as JSON, but handle empty responses or non-JSON
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const text = await response.text();
      data = text ? JSON.parse(text) : {};
    } else {
      data = { message: await response.text() };
    }
    
    if (!response.ok) {
      const errorMessage = typeof data.detail === 'string' 
        ? data.detail 
        : typeof data.detail === 'object' 
          ? JSON.stringify(data.detail) 
          : data.message || 'Something went wrong';
      throw new Error(errorMessage);
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PUT', body }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};
