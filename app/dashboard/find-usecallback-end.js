const fs = require('fs');
const content = fs.readFileSync('page.js', 'utf8');
const lines = content.split('\n');

// Find useCallback endings after line 2656
for (let i = 2656; i < lines.length; i++) {
  const line = lines[i];
  // Look for pattern: }, [dependencies]);
  if (line.match(/^\s*\}\s*,\s*\[.*\]\s*\)\s*;?\s*$/)) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
    // Show some context
    const start = Math.max(0, i - 3);
    const end = Math.min(lines.length - 1, i + 1);
    for (let j = start; j <= end; j++) {
      const marker = j === i ? '>>> ' : '    ';
      console.log(`${marker}${j + 1}: ${lines[j]}`);
    }
    console.log('---');
  }
}
