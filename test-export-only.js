'use client';
import { useState } from 'react';

// Copy just the export part to test
const testHook = () => {
  const [state, setState] = useState('test');
  return { state, setState };
};

export default function Dashboard() {
  return <div>Test Dashboard</div>;
}
