const fs = require('fs');
const content = fs.readFileSync('app/dashboard/page.js', 'utf8');
let braceCount = 0;
let parenCount = 0;
let bracketCount = 0;
let lineNum = 0;

content.split('\n').forEach((line, index) => {
  lineNum = index + 1;
  for (let char of line) {
    if (char === '{') braceCount++;
    else if (char === '}') {
      braceCount--;
      if (braceCount < 0) {
        console.log(`Extra closing brace at line ${lineNum}: "${line.trim()}"`);
        console.log(`Braces: ${braceCount}, Parens: ${parenCount}, Brackets: ${bracketCount}`);
        process.exit(1);
      }
    }
    else if (char === '(') parenCount++;
    else if (char === ')') {
      parenCount--;
      if (parenCount < 0) {
        console.log(`Extra closing paren at line ${lineNum}: "${line.trim()}"`);
        console.log(`Braces: ${braceCount}, Parens: ${parenCount}, Brackets: ${bracketCount}`);
        process.exit(1);
      }
    }
    else if (char === '[') bracketCount++;
    else if (char === ']') {
      bracketCount--;
      if (bracketCount < 0) {
        console.log(`Extra closing bracket at line ${lineNum}: "${line.trim()}"`);
        console.log(`Braces: ${braceCount}, Parens: ${parenCount}, Brackets: ${bracketCount}`);
        process.exit(1);
      }
    }
  }
});

console.log(`Final counts - Braces: ${braceCount}, Parens: ${parenCount}, Brackets: ${bracketCount}`);
if (braceCount !== 0 || parenCount !== 0 || bracketCount !== 0) {
  console.log('Unmatched brackets detected!');
  if (braceCount > 0) console.log(`Missing ${braceCount} closing braces`);
  if (parenCount > 0) console.log(`Missing ${parenCount} closing parens`);
  if (bracketCount > 0) console.log(`Missing ${bracketCount} closing brackets`);
} else {
  console.log('All brackets matched!');
}
