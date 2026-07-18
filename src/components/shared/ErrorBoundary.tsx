import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';
import { Button } from './ui/Button';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 rounded-lg border border-danger/30 bg-danger-bg">
          <EmptyState
            icon={AlertTriangle}
            tone="danger"
            title="Ada yang error di modul ini."
            description={this.state.error.message}
            action={
              <Button variant="secondary" size="sm" onClick={() => this.setState({ error: null })}>
                Coba lagi
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
