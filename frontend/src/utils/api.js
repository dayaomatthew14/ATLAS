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

    const data = await response.json();
    
    if (!response.ok) {
      let errorMessage = 'Something went wrong';
      if (Array.isArray(data.detail)) {
        errorMessage = data.detail.map(e => `${e.loc?.join('.')} ${e.msg}`).join(', ');
      } else if (data.detail) {
        errorMessage = data.detail;
      }
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
