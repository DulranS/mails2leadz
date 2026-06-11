const fs = require('fs');
const content = fs.readFileSync('page.js', 'utf8');
const lines = content.split('\n');

let openParens = 0;
let openBraces = 0;
let openBrackets = 0;
let problemLine = -1;

console.log('Checking entire file for bracket/parenthesis mismatches...');

for (let i = 0; i < lines.length; i++) {
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
      if (openParens < 0) {
        console.log(`\nUNMATCHED CLOSING PARENTHESIS at line ${i + 1}: ${line.trim()}`);
        console.log(`  Running total: ${openParens} (should never be negative)`);
        problemLine = i + 1;
        break;
      }
    }
    else if (char === '{') {
      openBraces++;
      lineBraces++;
    }
    else if (char === '}') {
      openBraces--;
      lineBraces--;
      if (openBraces < 0) {
        console.log(`\nUNMATCHED CLOSING BRACE at line ${i + 1}: ${line.trim()}`);
        console.log(`  Running total: ${openBraces} (should never be negative)`);
        problemLine = i + 1;
        break;
      }
    }
    else if (char === '[') {
      openBrackets++;
      lineBrackets++;
    }
    else if (char === ']') {
      openBrackets--;
      lineBrackets--;
      if (openBrackets < 0) {
        console.log(`\nUNMATCHED CLOSING BRACKET at line ${i + 1}: ${line.trim()}`);
        console.log(`  Running total: ${openBrackets} (should never be negative)`);
        problemLine = i + 1;
        break;
      }
    }
  }
  
  if (problemLine > 0) break;
  
  // Show lines with significant bracket activity
  if (Math.abs(lineParens) > 2 || Math.abs(lineBraces) > 2 || Math.abs(lineBrackets) > 2) {
    console.log(`Line ${i + 1}: ${line.trim().substring(0, 80)}${line.length > 80 ? '...' : ''}`);
    console.log(`  Changes: Parens: ${lineParens}, Braces: ${lineBraces}, Brackets: ${lineBrackets}`);
  }
}

console.log(`\nFinal counts: Parens: ${openParens}, Braces: ${openBraces}, Brackets: ${openBrackets}`);
if (problemLine > 0) {
  console.log(`First problem detected at line ${problemLine}`);
} else if (openParens !== 0 || openBraces !== 0 || openBrackets !== 0) {
  console.log('No negative counts found, but there are unmatched opening brackets/parentheses');
  console.log('The file ends with unclosed elements');
} else {
  console.log('All brackets and parentheses are properly matched');
}
