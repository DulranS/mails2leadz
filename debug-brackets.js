const fs = require('fs');
const content = fs.readFileSync('app/dashboard/page.js', 'utf8');
let braceCount = 0;
let lineNum = 0;
let lines = content.split('\n');

console.log('Analyzing braces around line 303...\n');

// Show context around line 303
for (let i = Math.max(0, 300); i < Math.min(lines.length, 310); i++) {
  let lineBraceCount = 0;
  for (let char of lines[i]) {
    if (char === '{') lineBraceCount++;
    else if (char === '}') lineBraceCount--;
  }
  console.log(`Line ${i + 1}: ${lineBraceCount > 0 ? '+' : ''}${lineBraceCount} braces - "${lines[i].trim()}"`);
}

console.log('\nFull analysis up to line 303:');
content.split('\n').forEach((line, index) => {
  lineNum = index + 1;
  if (lineNum <= 303) {
    for (let char of line) {
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount < 0) {
          console.log(`\nPROBLEM: Extra closing brace at line ${lineNum}: "${line.trim()}"`);
          console.log(`Brace count went to ${braceCount}`);
          process.exit(1);
        }
      }
    }
    
    if (lineNum % 50 === 0) {
      console.log(`Line ${lineNum}: Brace count = ${braceCount}`);
    }
  }
});

console.log(`\nBrace count at line 303: ${braceCount}`);
