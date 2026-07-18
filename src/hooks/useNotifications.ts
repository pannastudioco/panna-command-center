import { useState, useEffect } from 'react';

export const useNotifications = () => {
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  return { error, setError, toast, setToast };
};
