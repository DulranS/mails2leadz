const fs = require('fs');
const content = fs.readFileSync('page.js', 'utf8');

// Track positions of all brackets to find the exact issue
const positions = {
  '(': [],
  ')': [],
  '{': [],
  '}': [],
  '[': [],
  ']': []
};

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  if (positions[char] !== undefined) {
    positions[char].push(i);
  }
}

console.log('Bracket counts:');
console.log(`(: ${positions['('].length}`);
console.log(`): ${positions[')'].length}`);
console.log(`{: ${positions['{'].length}`);
console.log(`}: ${positions['}'].length}`);
console.log(`[: ${positions['['].length}`);
console.log(`]: ${positions[']'].length}`);

// Find unmatched brackets
let openParenStack = [];
let openBraceStack = [];
let openBracketStack = [];

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  const lineNum = content.substring(0, i).split('\n').length;
  const lineStart = content.lastIndexOf('\n', i - 1) + 1;
  const lineEnd = content.indexOf('\n', i);
  const line = content.substring(lineStart, lineEnd > -1 ? lineEnd : content.length);
  const colNum = i - lineStart;
  
  if (char === '(') {
    openParenStack.push({pos: i, line: lineNum, col: colNum});
  } else if (char === ')') {
    if (openParenStack.length === 0) {
      console.log(`\nUnmatched closing ')' at line ${lineNum}, col ${colNum}`);
      console.log(`Line: ${line.trim()}`);
    } else {
      openParenStack.pop();
    }
  } else if (char === '{') {
    openBraceStack.push({pos: i, line: lineNum, col: colNum});
  } else if (char === '}') {
    if (openBraceStack.length === 0) {
      console.log(`\nUnmatched closing '}' at line ${lineNum}, col ${colNum}`);
      console.log(`Line: ${line.trim()}`);
    } else {
      openBraceStack.pop();
    }
  } else if (char === '[') {
    openBracketStack.push({pos: i, line: lineNum, col: colNum});
  } else if (char === ']') {
    if (openBracketStack.length === 0) {
      console.log(`\nUnmatched closing ']' at line ${lineNum}, col ${colNum}`);
      console.log(`Line: ${line.trim()}`);
    } else {
      openBracketStack.pop();
    }
  }
}

console.log(`\nUnclosed brackets at end of file:`);
console.log(`Open parentheses: ${openParenStack.length}`);
if (openParenStack.length > 0) {
  console.log('First open paren:', openParenStack[0]);
}
console.log(`Open braces: ${openBraceStack.length}`);
if (openBraceStack.length > 0) {
  console.log('First open brace:', openBraceStack[0]);
}
console.log(`Open brackets: ${openBracketStack.length}`);
if (openBracketStack.length > 0) {
  console.log('First open bracket:', openBracketStack[0]);
}
