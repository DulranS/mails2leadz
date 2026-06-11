'use client';

import { useEffect } from 'react';

export default function ExtensionCleaner() {
  useEffect(() => {
    // Comprehensive extension cleanup with full error handling
    const cleanExtensions = () => {
      try {
        // Safe DOM access
        if (!document || !document.documentElement) {
          return;
        }
        
        const html = document.documentElement;
        const body = document.body;
        
        // Clean HTML attributes safely
        if (html && html.attributes) {
          try {
            const attributes = Array.from(html.attributes || []);
            for (let i = attributes.length - 1; i >= 0; i--) {
              try {
                const attr = attributes[i];
                if (attr && attr.name && typeof attr.name === 'string') {
                  if (attr.name.startsWith('data-bybit') || 
                      attr.name.startsWith('data-extension') ||
                      attr.name.startsWith('data-webext') ||
                      (attr.name.includes && attr.name.includes('channel-name')) ||
                      (attr.name.includes && attr.name.includes('wallet'))) {
                    html.removeAttribute(attr.name);
                  }
                }
              } catch (attrError) {
                // Skip this attribute, continue with others
                continue;
              }
            }
          } catch (attributesError) {
            // Skip attribute cleanup entirely
          }
        }
        
        // Remove extension elements safely
        if (document.querySelectorAll) {
          try {
            const extensionElements = document.querySelectorAll('[id*="extension"], [class*="extension"], [data-webext]');
            extensionElements.forEach((el, index) => {
              try {
                if (el && el.parentNode) {
                  el.parentNode.removeChild(el);
                }
              } catch (removeError) {
                // Skip this element, continue with others
              }
            });
          } catch (querySelectorError) {
            // Skip element removal entirely
          }
        }
        
        // Suppress extension errors safely
        if (window && window.console) {
          try {
            const originalError = window.console.error;
            if (typeof originalError === 'function') {
              window.console.error = (...args) => {
                try {
                  if (!args || args.length === 0) return;
                  if (typeof args[0] !== 'string') return;
                  const str = args[0];
                  if (str.includes('webextension') || 
                      str.includes('TronWeb') || 
                      str.includes('bybit') ||
                      str.includes('gethookd') ||
                      str.includes('evmAsk') ||
                      str.includes('frame_ant') ||
                      str.includes('lockdown-install')) {
                    return; // Suppress extension errors
                  }
                  return originalError.apply(window.console, args);
                } catch (consoleError) {
                  // Silent fail - don't break app
                }
              };
            }
          } catch (consoleOverrideError) {
            // Skip console override entirely
          }
        }
        
      } catch (e) {
        // Complete cleanup failure - don't break the app
        // Silent fail - app continues working
      }
    };

    // Run multiple times with error handling
    const timers = [];
    try {
      timers.push(setTimeout(cleanExtensions, 100));
      timers.push(setTimeout(cleanExtensions, 500));
      timers.push(setTimeout(cleanExtensions, 1000));
    } catch (timerError) {
      // If timers fail, try once immediately
      try {
        cleanExtensions();
      } catch (immediateError) {
        // Complete failure - app continues without cleanup
      }
    }
    
    return () => {
      // Cleanup timers safely
      timers.forEach(timer => {
        try {
          clearTimeout(timer);
        } catch (clearError) {
          // Ignore cleanup errors
        }
      });
    };
  }, []);

  return null;
}
