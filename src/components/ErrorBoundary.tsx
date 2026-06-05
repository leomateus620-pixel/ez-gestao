import React, { Component, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
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
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Algo deu errado</h2>
          <p className="text-sm text-foreground/60 mb-4 max-w-md text-center">
            Ocorreu um erro inesperado. Tente recarregar a página.
          </p>
          <p className="text-xs text-foreground/40 mb-4 font-mono max-w-md text-center truncate">
            {this.state.error?.message}
          </p>
          <Button onClick={this.handleRetry} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
