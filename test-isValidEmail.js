// Test the exact structure around isValidEmail
const testFunction = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  let cleaned = email.trim()
    .toLowerCase()
    .replace(/^["']+/, '')
    .replace(/["']+$/, '')
    .replace(/\s+/g, '')
    .replace(/[<>]/g, '');
  
  if (cleaned.length < 5) return false;
  if (cleaned === 'undefined' || cleaned === 'null' || cleaned === 'na' || cleaned === 'n/a') return false;
  
  // Basic email structure
  const atIndex = cleaned.indexOf('@');
  if (atIndex === -1 || atIndex === 0 || atIndex === cleaned.length - 1) return false;
  
  const [localPart, domainPart] = cleaned.split('@');
  
  // Local part validation
  if (!localPart || localPart.length < 1 || localPart.length > 64) return false;
  
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

console.log('Test function defined successfully');
