// lib/dashboard-utils.js
// Dashboard utility functions

import { CONFIG } from './dashboard-config.js';

// ============================================================================
// PHONE FORMATTING
// ============================================================================
export const formatForDialing = (raw) => {
  if (!raw || raw === 'N/A' || raw === '' || raw === 'undefined' || raw === 'null') return null;
  let cleaned = raw.toString().replace(/\D/g, '');

  // Handle Sri Lankan numbers starting with 0
  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = '94' + cleaned.slice(1);
  }

  // Handle numbers without country code
  if (cleaned.length === 9 && /^[7-9]/.test(cleaned)) {
    cleaned = '94' + cleaned;
  }

  // Validate international format
  const isValid = /^[1-9]\d{9,14}$/.test(cleaned);
  return isValid ? cleaned : null;
};

export const formatPhoneForDisplay = (phone) => {
  if (!phone) return 'N/A';
  const formatted = formatForDialing(phone);
  if (!formatted) return phone;

  // Format as +94 XX XXX XXXX for Sri Lankan numbers
  if (formatted.startsWith('94') && formatted.length === 11) {
    return `+${formatted.slice(0, 2)} ${formatted.slice(2, 4)} ${formatted.slice(4, 7)} ${formatted.slice(7)}`;
  }

  return `+${formatted}`;
};

// ============================================================================
// EMAIL VALIDATION
// ============================================================================
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;

  let cleaned = email.trim()
    .toLowerCase()
    .replace(/^["']+/, '')
    .replace(/["']+$/, '')
    .replace(/\s+/g, '')
    .replace(/[<>]/g, '');

  if (cleaned.length < 5) return false;
  if (cleaned === 'undefined' || cleaned === 'null' || cleaned === 'na' || cleaned === 'n/a') return false;
  if (cleaned.startsWith('[') || cleaned.includes('missing')) return false;

  const atCount = (cleaned.match(/@/g) || []).length;
  if (atCount !== 1) return false;

  const parts = cleaned.split('@');
  const [localPart, domainPart] = parts;

  if (!localPart || localPart.length < 1) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;

  if (!domainPart || domainPart.length < 3) return false;
  if (!domainPart.includes('.')) return false;
  if (domainPart.startsWith('.') || domainPart.endsWith('.')) return false;

  const domainBits = domainPart.split('.');
  const tld = domainBits[domainBits.length - 1];

  if (!tld || tld.length < 2 || tld.length > 6) return false;
  if (!/^[a-z0-9-]+$/.test(tld)) return false;
  if (tld.startsWith('-') || tld.endsWith('-')) return false;

  // Additional email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) return false;

  return true;
};

export const parseMultipleEmails = (emailString) => {
  if (!emailString || typeof emailString !== 'string') return [];

  const cleaned = emailString.trim();
  if (!cleaned) return [];

  // Split by comma or semicolon
  const emails = cleaned.split(/[;,]/).map(e => e.trim()).filter(e => e);

  // Validate and deduplicate
  const validEmails = [];
  const seen = new Set();

  emails.forEach(email => {
    if (isValidEmail(email)) {
      const normalized = email.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        validEmails.push(normalized);
      }
    }
  });

  return validEmails;
};

// ============================================================================
// CSV PARSING
// ============================================================================
export const parseCsvRow = (str) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      inQuotes = false;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);

  return result.map(field => {
    let cleaned = field.replace(/[\r\n]/g, '').trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).replace(/""/g, '"');
    }
    return cleaned;
  });
};

export const extractTemplateVariables = (text) => {
  if (!text) return [];
  const regex = /\{\{([^}]+)\}\}/g;
  const variables = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    variables.push(match[1].trim());
  }

  return [...new Set(variables)];
};

// ============================================================================
// TEMPLATE RENDERING
// ============================================================================
export const renderPreviewText = (text, recipient, mappings, sender) => {
  if (!text) return '';
  let result = text;

  Object.entries(mappings).forEach(([varName, col]) => {
    const regex = new RegExp(`{{\\s*${varName}\\s*}}`, 'g');

    if (varName === 'sender_name') {
      result = result.replace(regex, sender || 'Team');
    } else if (recipient && col && recipient[col] !== undefined) {
      result = result.replace(regex, recipient[col]);
    } else {
      result = result.replace(regex, `[${varName}]`);
    }
  });

  // Replace any remaining unmatched variables
  result = result.replace(/\{\{\s*[^}]+\s*\}\}/g, (match) => {
    const varName = match.replace(/\{\{\s*|\s*\}\}/g, '').trim();
    return `[${varName}]`;
  });

  return result;
};

// ============================================================================
// SOCIAL MEDIA
// ============================================================================
export const generateSocialHandle = (businessName, platform) => {
  if (!businessName) return null;

  let handle = businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 30);

  // Remove leading/trailing underscores
  handle = handle.replace(/^_+|_+$/g, '');

  return handle || null;
};

// ============================================================================
// DATE UTILITIES
// ============================================================================
export const daysBetween = (date1, date2) => {
  if (!date1 || !date2) return 999;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const safeParseDate = (date) => {
  if (!date) return null;
  const parsed = new Date(date);
  return isNaN(parsed.getTime()) ? null : parsed;
};

// ============================================================================
// THROTTLING
// ============================================================================
export const throttle = (func, limit) => {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================
export const localStorageHelper = {
  get: (key, defaultValue = null) => {
    try {
      if (typeof window !== 'undefined') {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      }
      return defaultValue;
    } catch (error) {
      console.error('LocalStorage get error:', error);
      return defaultValue;
    }
  },

  set: (key, value) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      console.error('LocalStorage set error:', error);
      return false;
    }
  },

  remove: (key) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
      }
      return true;
    } catch (error) {
      console.error('LocalStorage remove error:', error);
      return false;
    }
  }
};

/**
 * Session storage helper
 */
const sessionStorageHelper = {
  get: (key, defaultValue = null) => {
    try {
      const item = typeof window !== 'undefined' ? sessionStorage.getItem(key) : null;
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('SessionStorage get error:', error);
      return defaultValue;
    }
  },

  set: (key, value) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(key, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      console.error('SessionStorage set error:', error);
      return false;
    }
  }
};

/**
 * Copy text to clipboard with feedback
 */
const copyToClipboard = async (text, label = 'Text') => {
  try {
    await navigator.clipboard.writeText(text);
    return { success: true, message: `✅ Copied ${label}` };
  } catch (error) {
    console.error('Clipboard copy failed:', error);
    return { success: false, message: `❌ Failed to copy ${label}` };
  }
};

/**
 * Debounce function
 */
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// ============================================================================
// CONTACT KEY NORMALIZATION
// ============================================================================
export const normalizeContactKey = (contact) => {
  if (!contact) return null;
  const email = contact.email?.trim().toLowerCase();
  const phone = contact.phone ? formatForDialing(contact.phone) : null;
  return email || phone || null;
};

// Export all utility functions
export {
  formatForDialing,
  formatPhoneForDisplay,
  isValidEmail,
  parseMultipleEmails,
  parseCsvRow,
  extractTemplateVariables,
  renderPreviewText,
  generateSocialHandle,
  daysBetween,
  safeParseDate,
  throttle,
  localStorageHelper,
  sessionStorageHelper,
  copyToClipboard,
  debounce
};
