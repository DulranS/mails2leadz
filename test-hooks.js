'use client';
import { useState, useCallback } from 'react';

// Test hook 1
const useLeadScoring = () => {
  const [scores, setScores] = useState({});
  
  const calculateScore = useCallback((contact, contactHistory = {}) => {
    if (!contact) return 50;
    return 50;
  }, []);
  
  const updateScore = useCallback((contactKey, score) => {
    setScores(prev => ({
      ...prev,
      [contactKey]: score
    }));
  }, []);
  
  return {
    scores,
    calculateScore,
    updateScore,
    setScores
  };
};

// Test hook 2
const useDailyQuotas = (userId) => {
  const [quotas, setQuotas] = useState({
    emails: { used: 0, limit: 500, resetTime: null }
  });
  const [loading, setLoading] = useState(true);
  
  return {
    quotas,
    loading,
    setQuotas
  };
};

export default function Dashboard() {
  return <div>Test</div>;
}
