import React, { Component, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Label used in console.error to identify the boundary location. */
  label?: string;
  /** Called when the user clicks "Tentar novamente". Use to reset queries, etc. */
  onReset?: () => void;
  /** When true, the fallback fills the viewport (use for root-level boundaries). */
  fullScreen?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, errorInfo);
  }

  handleRetry = () => {
    try {
      this.props.onReset?.();
    } catch (err) {
      console.error('[ErrorBoundary] onReset threw', err);
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const wrapperClass = this.props.fullScreen
        ? 'liquid-stage flex min-h-screen flex-col items-center justify-center p-6 animate-fade-in'
        : 'flex flex-col items-center justify-center py-20 animate-fade-in';
      return (
        <div className={wrapperClass}>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Algo deu errado</h2>
          <p className="text-sm text-foreground/60 mb-4 max-w-md text-center">
            Ocorreu um erro inesperado ao carregar esta área. Você pode tentar
            novamente ou recarregar a página.
          </p>
          <p className="text-xs text-foreground/40 mb-4 font-mono max-w-md text-center truncate">
            {this.state.error?.message}
          </p>
          <div className="flex gap-2">
            <Button onClick={this.handleRetry} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </Button>
            <Button onClick={() => window.location.reload()} className="gap-2">
              <Home className="h-4 w-4" /> Recarregar app
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
