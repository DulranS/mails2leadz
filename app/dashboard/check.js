const fs = require('fs');
const content = fs.readFileSync('page.js', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);
console.log('Last 10 lines:');
lines.slice(-10).forEach((line, i) => {
  console.log(`${lines.length - 10 + i + 1}: ${line}`);
});

// Check for unclosed brackets
let openParens = 0;
let openBraces = 0;
let openBrackets = 0;

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  if (char === '(') openParens++;
  else if (char === ')') openParens--;
  else if (char === '{') openBraces++;
  else if (char === '}') openBraces--;
  else if (char === '[') openBrackets++;
  else if (char === ']') openBrackets--;
}

console.log(`Unclosed parentheses: ${openParens}`);
console.log(`Unclosed braces: ${openBraces}`);
console.log(`Unclosed brackets: ${openBrackets}`);
