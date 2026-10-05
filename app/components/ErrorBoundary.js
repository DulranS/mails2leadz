'use client';

import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    console.error('[ErrorBoundary] getDerivedStateFromError:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] componentDidCatch:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      console.error('[ErrorBoundary] Rendering error state:', this.state.error);
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee', border: '1px solid red' }}>
          <h2>Something went wrong</h2>
          <p>{this.state.error && this.state.error.toString()}</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
