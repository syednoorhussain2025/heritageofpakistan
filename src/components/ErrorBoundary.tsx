"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches any render-phase error in the subtree and shows a recovery UI
 * instead of a blank white screen.  Place at the root of the app so no
 * single component crash can take down the whole page.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return <>{this.props.fallback}</>;

      return (
        <div
          role="alert"
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "24px",
            background: "#f4f4f4",
            fontFamily: "sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#555", maxWidth: 400, margin: 0, fontSize: 14 }}>
            An unexpected error occurred. Your data is safe — please try reloading the page.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#1a1a2e",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "10px 22px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Reload page
            </button>
            <button
              onClick={this.handleReset}
              style={{
                background: "transparent",
                color: "#1a1a2e",
                border: "1.5px solid #1a1a2e",
                borderRadius: 10,
                padding: "10px 22px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Try again
            </button>
          </div>
          {process.env.NODE_ENV !== "production" && this.state.error && (
            <pre
              style={{
                marginTop: 16,
                padding: "12px 16px",
                background: "#fee2e2",
                borderRadius: 8,
                fontSize: 11,
                color: "#991b1b",
                maxWidth: "90vw",
                overflowX: "auto",
                textAlign: "left",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
