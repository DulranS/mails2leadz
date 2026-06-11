const fs = require('fs');

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let braceStack = [];
  let parenStack = [];
  let inString = false;
  let stringChar = '';
  let inRegex = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const prevChar = j > 0 ? line[j-1] : '';
      const nextChar = j < line.length - 1 ? line[j+1] : '';
      
      // Handle string literals
      if (!inRegex && (char === '"' || char === "'" || char === '`')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar && prevChar !== '\\') {
          inString = false;
          stringChar = '';
        }
        continue;
      }
      
      // Skip characters inside strings
      if (inString) continue;
      
      // Handle regex literals
      if (char === '/' && nextChar && /[a-z]/.test(nextChar) && 
          (j === 0 || /[=(:,\s]/.test(prevChar))) {
        inRegex = true;
        continue;
      }
      if (inRegex && char === '/' && prevChar !== '\\') {
        inRegex = false;
        continue;
      }
      if (inRegex) continue;
      
      // Track braces and parentheses
      if (char === '{') {
        braceStack.push({ line: i+1, char: '{' });
      } else if (char === '}') {
        if (braceStack.length === 0) {
          console.log(`Extra closing brace at line ${i+1}, col ${j+1}`);
          console.log(`Context: ${line.substring(Math.max(0, j-20), j+20)}`);
        } else {
          braceStack.pop();
        }
      } else if (char === '(') {
        parenStack.push({ line: i+1, char: '(' });
      } else if (char === ')') {
        if (parenStack.length === 0) {
          console.log(`Extra closing paren at line ${i+1}, col ${j+1}`);
        } else {
          parenStack.pop();
        }
      }
    }
  }
  
  console.log(`Final state:`);
  console.log(`  Open braces: ${braceStack.length}`);
  console.log(`  Open parens: ${parenStack.length}`);
  
  if (braceStack.length > 0) {
    console.log(`Unclosed braces:`);
    braceStack.forEach(item => console.log(`  Line ${item.line}: ${item.char}`));
  }
  
  if (parenStack.length > 0) {
    console.log(`Unclosed parentheses:`);
    parenStack.forEach(item => console.log(`  Line ${item.line}: ${item.char}`));
  }
}

analyzeFile('app/dashboard/page.js');
