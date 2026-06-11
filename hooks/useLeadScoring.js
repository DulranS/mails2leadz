// hooks/useLeadScoring.js
// Custom hook for lead scoring

import { useState, useCallback } from 'react';
import { isValidEmail, formatForDialing } from '../lib/dashboard-utils.js';

export const useLeadScoring = () => {
  const [scores, setScores] = useState({});

  const calculateScore = useCallback((contact, contactHistory = {}) => {
    if (!contact) return 50;

    let score = 50;
    const contactKey = contact.email || contact.phone;
    const history = contactHistory[contactKey] || {};

    // Email quality
    if (contact.email && isValidEmail(contact.email)) {
      score += 15;
    }

    // Phone quality
    if (contact.phone && formatForDialing(contact.phone)) {
      score += 10;
    }

    // Social media presence
    const socialChannels = [
      contact.twitter,
      contact.instagram,
      contact.linkedin_company,
      contact.linkedin_ceo,
      contact.linkedin_founder
    ].filter(Boolean).length;

    score += Math.min(15, socialChannels * 3);

    // Contact confidence
    if (contact.contact_confidence === 'High') score += 10;
    else if (contact.contact_confidence === 'Medium') score += 5;

    // Decision maker
    if (contact.linkedin_ceo || contact.linkedin_founder) score += 10;
    if (contact.decision_maker_found === 'Yes') score += 8;

    // Engagement history
    if (history.contactCount > 0) {
      score += Math.min(10, history.contactCount * 2);
    }

    if (history.replied) {
      score += 25;
    }

    // Company size
    if (contact.company_size_indicator === 'small') score += 5;
    else if (contact.company_size_indicator === 'medium') score += 10;
    else if (contact.company_size_indicator === 'large') score += 15;

    // Website presence
    if (contact.website) score += 5;
    if (contact.contact_page_found === 'Yes') score += 5;

    // Lead quality from CSV
    if (contact.lead_quality === 'HOT') score += 30;
    else if (contact.lead_quality === 'WARM') score += 15;

    // Rating and reviews
    if (parseFloat(contact.rating) >= 4.8) score += 20;
    if (parseInt(contact.review_count) > 100) score += 10;

    return Math.min(100, Math.max(0, score));
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
