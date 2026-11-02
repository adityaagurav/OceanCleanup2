import React from 'react';

/**
 * ErrorBoundary.jsx — Catches unforeseen runtime errors in the React UI tree
 * so a minor UI glitch never tears down the entire game or leaves a blank white screen.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught unhandled React error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-deep/90 text-white p-6 font-sans">
          <div className="max-w-md w-full bg-[#0a1a2f] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl text-center">
            <span className="text-4xl mb-3 block">🌊</span>
            <h2 className="text-xl font-extrabold text-cyan-300 mb-2">OceanCleanup Recovered</h2>
            <p className="text-sm text-cyan-100/70 mb-5">
              An unexpected interface error occurred, but the game state has been safeguarded.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="btn-ui px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm shadow-md"
              >
                Resume Game
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-ui px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/20"
              >
                Reload Window
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

