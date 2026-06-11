const fs = require('fs');
const content = fs.readFileSync('page.js', 'utf8');

// Find the problematic section around the multi-channel modal
const lines = content.split('\n');
const startLine = 5761; // Where showMultiChannelModal starts
const endLine = 5997;   // Where it should end

let openParens = 0;
let openBraces = 0;
let openBrackets = 0;
let problemLine = -1;

console.log(`Checking lines ${startLine} to ${endLine}...`);

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
  
  if (openParens < 0 || openBraces < 0 || openBrackets < 0) {
    console.log(`\nPROBLEM at line ${i + 1}: ${line.trim()}`);
    console.log(`  Parentheses change: ${lineParens}, Braces change: ${lineBraces}, Brackets change: ${lineBrackets}`);
    console.log(`  Totals: Parens: ${openParens}, Braces: ${openBraces}, Brackets: ${openBrackets}`);
    problemLine = i + 1;
    break;
  }
  
  if (lineParens !== 0 || lineBraces !== 0 || lineBrackets !== 0) {
    console.log(`Line ${i + 1}: ${line.trim().substring(0, 80)}${line.length > 80 ? '...' : ''}`);
    console.log(`  Changes: Parens: ${lineParens}, Braces: ${lineBraces}, Brackets: ${lineBrackets}`);
  }
}

console.log(`\nFinal counts: Parens: ${openParens}, Braces: ${openBraces}, Brackets: ${openBrackets}`);
if (problemLine > 0) {
  console.log(`First problem detected at line ${problemLine}`);
}
