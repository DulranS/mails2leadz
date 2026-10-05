// hooks/useDailyQuotas.js
// Custom hook for managing daily quotas

import { useState, useEffect, useCallback } from 'react';
import { CONFIG } from '../lib/dashboard-config.js';

export const useDailyQuotas = (userId) => {
  const [quotas, setQuotas] = useState({
    emails: { used: 0, limit: CONFIG.MAX_DAILY_EMAILS, resetTime: null },
    whatsapp: { used: 0, limit: CONFIG.MAX_DAILY_WHATSAPP, resetTime: null },
    sms: { used: 0, limit: CONFIG.MAX_DAILY_SMS, resetTime: null },
    calls: { used: 0, limit: CONFIG.MAX_DAILY_CALLS, resetTime: null }
  });
  const [loading, setLoading] = useState(true);

  // Load quotas from API
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const loadQuotas = async () => {
      try {
        const res = await fetch('/api/get-daily-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });

        if (res.ok) {
          const data = await res.json();
          setQuotas({
            emails: {
              used: data.count || 0,
              limit: CONFIG.MAX_DAILY_EMAILS,
              resetTime: data.resetTime || null
            },
            whatsapp: {
              used: data.whatsappCount || 0,
              limit: CONFIG.MAX_DAILY_WHATSAPP,
              resetTime: data.resetTime || null
            },
            sms: {
              used: data.smsCount || 0,
              limit: CONFIG.MAX_DAILY_SMS,
              resetTime: data.resetTime || null
            },
            calls: {
              used: data.callCount || 0,
              limit: CONFIG.MAX_DAILY_CALLS,
              resetTime: data.resetTime || null
            }
          });
        }
      } catch (error) {
        console.error('Quota load error:', error);
      } finally {
        setLoading(false);
      }
    };

    loadQuotas();

    // Refresh quotas every hour
    const interval = setInterval(loadQuotas, 3600000);
    return () => clearInterval(interval);
  }, [userId]);

  // Check if quota available
  const canUse = useCallback((channel, count = 1) => {
    // Map channel names to quota keys
    const channelMap = {
      'email': 'emails',
      'whatsapp': 'whatsapp',
      'sms': 'sms',
      'call': 'calls'
    };

    const quotaKey = channelMap[channel] || channel;
    const quota = quotas[quotaKey];
    if (!quota) return { available: false, reason: 'Invalid channel' };

    const remaining = quota.limit - quota.used;
    if (remaining < count) {
      return {
        available: false,
        reason: `Daily limit reached (${quota.used}/${quota.limit} used)`,
        remaining,
        limit: quota.limit
      };
    }

    return {
      available: true,
      reason: 'Quota available',
      remaining,
      limit: quota.limit
    };
  }, [quotas]);

  // Increment quota usage
  const incrementQuota = useCallback((channel, count = 1) => {
    // Map channel names to quota keys
    const channelMap = {
      'email': 'emails',
      'whatsapp': 'whatsapp',
      'sms': 'sms',
      'call': 'calls'
    };

    const quotaKey = channelMap[channel] || channel;

    setQuotas(prev => ({
      ...prev,
      [quotaKey]: {
        ...prev[quotaKey],
        used: prev[quotaKey].used + count
      }
    }));
  }, []);

  return {
    quotas,
    loading,
    canUse,
    incrementQuota,
    setQuotas
  };
};
