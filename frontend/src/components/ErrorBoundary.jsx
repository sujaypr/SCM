import React from 'react';
import { Alert, Box, Button, Container } from '@mui/material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Something went wrong</strong>
            <p>{this.state.error?.message || 'Unknown error'}</p>
          </Alert>
          <Box>
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
              {this.state.error?.stack}
            </pre>
          </Box>
          <Button
            variant="contained"
            onClick={() => window.location.reload()}
            sx={{ mt: 2 }}
          >
            Reload Page
          </Button>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
