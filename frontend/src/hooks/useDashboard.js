import { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';

const RAW_API_URL = import.meta.env.VITE_API_URL || '';
const API_BASE = (() => {
  if (!RAW_API_URL) return '/api';
  const url = RAW_API_URL.replace(/\/+$/,'');
  return url.endsWith('/api') ? url : `${url}/api`;
})();

const useDashboard = (businessId = 1, intervalSec = 8) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const pollTimer = useRef(null);
  const esRef = useRef(null);

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const startPolling = useCallback(() => {
    stopPolling();
    const fetchOnce = async () => {
      try {
        const resp = await axios.get(`${API_BASE}/dashboard/summary`, { params: { business_id: businessId } });
        if (resp.data && resp.data.success) {
          setData(resp.data.data);
          setLoading(false);
          setError(null);
        }
      } catch (e) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load dashboard');
      }
    };
    fetchOnce();
    pollTimer.current = setInterval(fetchOnce, Math.max(3, intervalSec) * 1000);
  }, [businessId, intervalSec]);

  const startSSE = useCallback(() => {
    try {
      if (esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
      }
      const url = `${API_BASE}/dashboard/stream?business_id=${encodeURIComponent(businessId)}&interval=${encodeURIComponent(intervalSec)}`;
      const es = new EventSource(url);
      esRef.current = es;
      es.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          if (payload && !payload.error) {
            setData({
              inventory: payload.inventory,
              logistics: payload.logistics,
              forecast: payload.forecast,
            });
            setConnected(true);
            setLoading(false);
            setError(null);
          }
        } catch {}
      };
      es.onerror = () => {
        try { es.close(); } catch {}
        esRef.current = null;
        setConnected(false);
        startPolling();
      };
    } catch {
      setConnected(false);
      startPolling();
    }
  }, [businessId, intervalSec, startPolling]);

  const refresh = useCallback(async () => {
    try {
      const resp = await axios.get(`${API_BASE}/dashboard/summary`, { params: { business_id: businessId } });
      if (resp.data && resp.data.success) {
        setData(resp.data.data);
        setLoading(false);
        setError(null);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to refresh');
    }
  }, [businessId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    stopPolling();
    startSSE();
    return () => {
      stopPolling();
      if (esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
      }
    };
  }, [startSSE]);

  return { data, loading, error, connected, refresh };
};

export default useDashboard;
