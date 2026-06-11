const fs = require('fs');
const content = fs.readFileSync('page.js', 'utf8');
const lines = content.split('\n');

// Check around line 303 specifically
const startLine = 290;
const endLine = 310;

let openParens = 0;
let openBraces = 0;
let openBrackets = 0;

console.log(`Checking lines ${startLine} to ${endLine} around line 303...`);

// Get initial counts from lines before startLine
for (let i = 0; i < startLine - 1; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '(') openParens++;
    else if (char === ')') openParens--;
    else if (char === '{') openBraces++;
    else if (char === '}') openBraces--;
    else if (char === '[') openBrackets++;
    else if (char === ']') openBrackets--;
  }
}

console.log(`Initial counts at line ${startLine}: Parens: ${openParens}, Braces: ${openBraces}, Brackets: ${openBrackets}`);

for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
  const line = lines[i];
  let lineParens = 0;
  let lineBraces = 0;
  let lineBrackets = 0;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '(') {
      openParens++;
      lineParens++;
    }
    else if (char === ')') {
      openParens--;
      lineParens--;
    }
    else if (char === '{') {
      openBraces++;
      lineBraces++;
    }
    else if (char === '}') {
      openBraces--;
      lineBraces--;
      if (openBraces < 0) {
        console.log(`\nPROBLEM: Unmatched closing brace at line ${i + 1}: ${line.trim()}`);
        console.log(`  Before: ${openBraces + 1}, After: ${openBraces}`);
      }
    }
    else if (char === '[') {
      openBrackets++;
      lineBrackets++;
    }
    else if (char === ']') {
      openBrackets--;
      lineBrackets--;
    }
  }
  
  console.log(`Line ${i + 1}: ${line.trim()}`);
  console.log(`  Changes: Parens: ${lineParens}, Braces: ${lineBraces}, Brackets: ${lineBrackets}`);
  console.log(`  Totals: Parens: ${openParens}, Braces: ${openBraces}, Brackets: ${openBrackets}`);
}
