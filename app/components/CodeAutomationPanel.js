// app/components/CodeAutomationPanel.js
'use client';

import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useNotifications } from './ui/NotificationProvider';

export default function CodeAutomationPanel() {
  const { addNotification } = useNotifications();
  const [action, setAction] = useState('make');
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [requirements, setRequirements] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [docType, setDocType] = useState('javadoc');
  const [improvements, setImprovements] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleExecute = async () => {
    setLoading(true);
    setResult(null);

    try {
      const payload = {
        action,
        code,
        language,
        requirements,
        bugDescription,
        docType,
        improvements: improvements ? improvements.split(',').map(i => i.trim()) : []
      };

      const res = await fetch('/api/ai-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.result);
        addNotification(`${action.charAt(0).toUpperCase() + action.slice(1)} completed successfully`, 'success');
      } else {
        addNotification(`Error: ${data.error}`, 'error');
      }
    } catch (error) {
      console.error('AI automation error:', error);
      addNotification('Failed to execute AI automation', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Selection */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Select Action</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {['make', 'fix', 'doc', 'detect', 'analyze', 'refactor'].map(act => (
            <button
              key={act}
              onClick={() => setAction(act)}
              className={`p-4 rounded-lg border-2 transition ${
                action === act
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="font-medium capitalize">{act}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {getActionDescription(act)}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Input Fields */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="typescript">TypeScript</option>
              <option value="java">Java</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
            </select>
          </div>

          {action === 'make' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Requirements
              </label>
              <textarea
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="Describe what code you want to generate..."
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 h-32"
              />
            </div>
          )}

          {(action === 'fix' || action === 'detect' || action === 'analyze' || action === 'refactor' || action === 'doc') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Code
              </label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste your code here..."
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 h-64 font-mono text-sm"
              />
            </div>
          )}

          {action === 'fix' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bug Description
              </label>
              <textarea
                value={bugDescription}
                onChange={(e) => setBugDescription(e.target.value)}
                placeholder="Describe the bug you want to fix..."
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 h-24"
              />
            </div>
          )}

          {action === 'doc' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Documentation Type
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
              >
                <option value="javadoc">JSDoc</option>
                <option value="readme">README</option>
                <option value="api">API Documentation</option>
                <option value="inline">Inline Comments</option>
              </select>
            </div>
          )}

          {action === 'refactor' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Improvements (comma-separated)
              </label>
              <textarea
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                placeholder="e.g., performance, readability, error handling..."
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 h-24"
              />
            </div>
          )}

          <Button
            onClick={handleExecute}
            disabled={loading}
            className="w-full py-3"
          >
            {loading ? 'Processing...' : `Execute ${action}`}
          </Button>
        </div>
      </Card>

      {/* Result Display */}
      {result && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Result</h3>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

function getActionDescription(action) {
  const descriptions = {
    make: 'Generate code from requirements',
    fix: 'Fix bugs in code',
    doc: 'Generate documentation',
    detect: 'Detect bugs and issues',
    analyze: 'Analyze code quality',
    refactor: 'Refactor for improvements'
  };
  return descriptions[action] || '';
}
