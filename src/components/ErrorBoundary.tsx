import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    // TODO: fix React 19 class component types properly
    // @ts-ignore - React 19 class component type definitions issue
    this.setState({ hasError: false, error: null });
  };

  render() {
    // TODO: fix React 19 class component types properly
    // @ts-ignore - React 19 class component type definitions issue
    if (this.state.hasError) {
      // @ts-ignore - React 19 class component type definitions issue
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center 
                        bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-md w-full text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-xl font-semibold text-gray-900 
                           dark:text-white mb-2">
              Something went wrong
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
              An unexpected error occurred. Your data is safe.
            </p>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg 
                         hover:bg-blue-700 transition-colors text-sm"
            >
              Try again
            </button>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mt-4 text-left text-xs bg-red-50 
                              dark:bg-red-900/20 text-red-700 
                              dark:text-red-400 p-3 rounded-lg 
                              overflow-auto max-h-48">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }

    // @ts-ignore - React 19 class component type definitions issue
    return this.props.children;
  }
}

export default ErrorBoundary;
