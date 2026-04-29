import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, X, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center p-4 rounded-lg shadow-lg border-l-4 transform transition-all duration-300 animate-in slide-in-from-right ${
              toast.type === 'success' 
                ? 'bg-white border-green-500 text-gray-800' 
                : toast.type === 'info'
                ? 'bg-white border-blue-500 text-gray-800'
                : toast.type === 'warning'
                ? 'bg-white border-yellow-500 text-gray-800'
                : 'bg-white border-red-500 text-gray-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
            ) : toast.type === 'info' ? (
              <Info className="w-5 h-5 text-blue-500 mr-3" />
            ) : toast.type === 'warning' ? (
              <AlertTriangle className="w-5 h-5 text-yellow-500 mr-3" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 mr-3" />
            )}
            <span className="text-sm font-medium pr-8">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
