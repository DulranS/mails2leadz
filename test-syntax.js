'use client';
import { useState } from 'react';

const useLeadScoring = () => {
  const [scores, setScores] = useState({});
  
  const calculateScore = (contact, contactHistory = {}) => {
    if (!contact) return 50;
    return 50;
  }, []);
  
  const updateScore = (contactKey, score) => {
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

export default function Dashboard() {
  return <div>Test</div>;
}
