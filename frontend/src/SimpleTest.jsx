import React from 'react';

function SimpleTest() {
  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'system-ui, sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: '20px',
        padding: '40px',
        maxWidth: '600px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
      }}>
        <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>✅ React is Working!</h1>
        <p style={{ fontSize: '20px', lineHeight: '1.6' }}>
          If you can see this colorful page, React is rendering successfully.
          The white screen issue is likely caused by:
        </p>
        <ul style={{ textAlign: 'left', fontSize: '16px', marginTop: '20px' }}>
          <li style={{ marginBottom: '10px' }}>CSS not loading properly</li>
          <li style={{ marginBottom: '10px' }}>Tailwind configuration issues</li>
          <li style={{ marginBottom: '10px' }}>Component rendering errors</li>
          <li style={{ marginBottom: '10px' }}>Browser caching old code</li>
        </ul>
        <div style={{ 
          marginTop: '30px',
          padding: '15px',
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '10px'
        }}>
          <strong>Try this:</strong> Press Ctrl+Shift+R (or Cmd+Shift+R on Mac) to hard refresh
        </div>
      </div>
    </div>
  );
}

export default SimpleTest;
