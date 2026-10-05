// lib/sms-qualifier.js
// SMS Sales Qualification System

/**
 * Generate SMS qualification message
 * @param {Object} lead - Lead data
 * @returns {string} SMS message
 */
export const generateQualificationSMS = (lead) => {
  const firstName = lead.firstName || lead.first_name || '';
  const businessName = lead.businessName || lead.company || '';
  
  return `Hi ${firstName}, quick question: What's your exact budget and timeframe to buy? (e.g., "this week" or "just looking") Also, what's your preferred contact method? Serious inquiries only please.`;
};

/**
 * Parse SMS response for qualification
 * @param {string} response - SMS response from lead
 * @returns {Object} Qualification result
 */
export const parseQualificationResponse = (response) => {
  const lowerResponse = response.toLowerCase();
  
  // Check for negative/vague responses
  const negativeKeywords = ['not interested', 'no thanks', 'stop', 'remove', 'unsubscribe', 'not looking', 'never', 'no budget'];
  const vagueKeywords = ['maybe', 'someday', 'later', 'not sure', 'don\'t know', 'undecided', 'thinking'];
  
  const hasNegative = negativeKeywords.some(keyword => lowerResponse.includes(keyword));
  const hasVague = vagueKeywords.some(keyword => lowerResponse.includes(keyword));
  
  if (hasNegative) {
    return {
      qualified: false,
      reason: 'Negative response',
      shouldArchive: true,
      stopFollowUp: true
    };
  }
  
  if (hasVague) {
    return {
      qualified: false,
      reason: 'Vague response',
      shouldArchive: true,
      stopFollowUp: true
    };
  }
  
  // Extract budget
  const budgetPatterns = [
    /\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+)(?:k|m)?\s*(?:budget|dollars?|usd)?/i,
    /budget[:\s]*\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+)(?:k|m)?/i
  ];
  
  let budget = null;
  for (const pattern of budgetPatterns) {
    const match = response.match(pattern);
    if (match) {
      budget = match[1];
      break;
    }
  }
  
  // Extract timeframe
  const timeframePatterns = [
    /this\s*week/i,
    /next\s*week/i,
    /this\s*month/i,
    /next\s*month/i,
    /(\d+)\s*(?:days?|weeks?|months?)/i,
    /asap|immediately|right\s*now/i,
    /q[1-4]|quarter\s*[1-4]/i
  ];
  
  let timeframe = null;
  for (const pattern of timeframePatterns) {
    const match = response.match(pattern);
    if (match) {
      timeframe = match[0];
      break;
    }
  }
  
  // Extract contact method
  const contactPatterns = [
    /(?:call|phone|text|sms)/i,
    /email/i,
    /whatsapp/i,
    /zoom|meet|call/i
  ];
  
  let contactMethod = null;
  for (const pattern of contactPatterns) {
    const match = response.match(pattern);
    if (match) {
      contactMethod = match[0];
      break;
    }
  }
  
  // Check if response has enough qualifying information
  const hasBudget = budget !== null;
  const hasTimeframe = timeframe !== null;
  const hasContactMethod = contactMethod !== null;
  
  if (!hasBudget && !hasTimeframe && !hasContactMethod) {
    return {
      qualified: false,
      reason: 'Insufficient information',
      shouldArchive: true,
      stopFollowUp: true
    };
  }
  
  return {
    qualified: true,
    budget,
    timeframe,
    contactMethod,
    summary: {
      budget: budget || 'Not specified',
      timeframe: timeframe || 'Not specified',
      contactMethod: contactMethod || 'Not specified',
      fullResponse: response
    }
  };
};

/**
 * Format qualification summary
 * @param {Object} qualification - Qualification result
 * @param {Object} lead - Lead data
 * @returns {string} Formatted summary
 */
export const formatQualificationSummary = (qualification, lead) => {
  if (!qualification.qualified) {
    return `❌ ${lead.email} - ${qualification.reason} (Archived)`;
  }
  
  const summary = qualification.summary;
  return `✅ ${lead.email}\n` +
         `   Budget: ${summary.budget}\n` +
         `   Timeframe: ${summary.timeframe}\n` +
         `   Contact: ${summary.contactMethod}\n` +
         `   Response: "${summary.fullResponse}"`;
};

/**
 * Check if lead should be archived
 * @param {Object} qualification - Qualification result
 * @returns {boolean}
 */
export const shouldArchiveLead = (qualification) => {
  return qualification.shouldArchive === true;
};

/**
 * Check if follow-up should stop
 * @param {Object} qualification - Qualification result
 * @returns {boolean}
 */
export const shouldStopFollowUp = (qualification) => {
  return qualification.stopFollowUp === true;
};
