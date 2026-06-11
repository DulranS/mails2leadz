// Test file to isolate the issue
'use client';
import { useState } from 'react';

// Test hook
const useTest = () => {
  const [test, setTest] = useState('');
  return { test, setTest };
};

// Test export
export default function TestComponent() {
  return <div>Test</div>;
}
