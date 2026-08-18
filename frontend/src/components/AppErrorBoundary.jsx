import React from 'react';

/**
 * The application's outermost error boundary.
 *
 * Before this existed the only boundary in the app wrapped the Curriculum page.
 * A render-time exception anywhere else -- most plausibly the schedule grid,
 * which is the largest screen and reads API shapes directly -- unmounted the
 * whole tree and left a blank white page with no route, no navigation, and no
 * indication that anything had happened.
 *
 * A boundary catches render, lifecycle, and constructor errors in the tree
 * below it. It deliberately does NOT catch errors thrown from event handlers,
 * promise rejections, or async callbacks; those keep going to the existing
 * try/catch and toast paths, which is where they belong.
 */
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept as console output rather than a toast: the toast provider lives
    // inside this boundary's subtree and may itself be gone by now.
    console.error('ATLAS: unrecoverable render error.', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-atlas-canvas">
        <div className="w-16 h-16 bg-sem-conflict-bg rounded-full flex items-center justify-center text-sem-conflict mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="font-display text-page text-atlas-ink mb-2">Something went wrong on this screen</h1>
        <p className="font-ui text-body text-atlas-slate max-w-md mb-6">
          The page could not be displayed. Your data has not been changed. Reloading usually
          clears it; if it keeps happening, tell a system administrator what you were doing.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center h-10 px-4 rounded-control bg-atlas-700 hover:bg-atlas-800 text-white font-ui font-medium transition-colors"
          >
            Reload the page
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center h-10 px-4 rounded-control border border-atlas-line text-atlas-ink font-ui font-medium hover:bg-atlas-50 transition-colors"
          >
            Back to Overview
          </a>
        </div>
      </div>
    );
  }
}
