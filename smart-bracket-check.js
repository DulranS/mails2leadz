const fs = require('fs');
const content = fs.readFileSync('app/dashboard/page.js', 'utf8');
let braceCount = 0;
let lineNum = 0;
let inRegex = false;
let inString = false;
let stringChar = '';

content.split('\n').forEach((line, index) => {
  lineNum = index + 1;
  
  for (let i = 0; i < line.length; i++) {
    let char = line[i];
    let prevChar = i > 0 ? line[i - 1] : '';
    
    // Handle string literals
    if (!inRegex && !inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
      continue;
    }
    if (inString && char === stringChar && prevChar !== '\\') {
      inString = false;
      continue;
    }
    if (inString) continue;
    
    // Handle regex literals
    if (!inRegex && char === '/' && prevChar !== '\\') {
      // Check if this might be a regex (not division)
      let isRegex = false;
      if (i === 0) isRegex = true;
      else if ('=([{,;:?'.includes(prevChar)) isRegex = true;
      else if (/\s/.test(prevChar)) {
        // Look back to find previous non-whitespace
        let j = i - 1;
        while (j >= 0 && /\s/.test(line[j])) j--;
        if (j >= 0 && '=([{,;:?'.includes(line[j])) isRegex = true;
      }
      
      if (isRegex) {
        inRegex = true;
        continue;
      }
    }
    if (inRegex && char === '/' && prevChar !== '\\') {
      inRegex = false;
      continue;
    }
    if (inRegex) continue;
    
    // Count braces outside of strings and regex
    if (char === '{') braceCount++;
    else if (char === '}') {
      braceCount--;
      if (braceCount < 0) {
        console.log(`Extra closing brace at line ${lineNum}: "${line.trim()}"`);
        console.log(`Braces: ${braceCount}`);
        process.exit(1);
      }
    }
  }
});

console.log(`Final brace count: ${braceCount}`);
if (braceCount !== 0) {
  console.log('Unmatched braces detected!');
} else {
  console.log('All braces matched!');
}
