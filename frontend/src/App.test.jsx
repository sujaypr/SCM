import React from 'react';

function AppTest() {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#e8ebed', 
      color: '#333', 
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1>Test Page - React is Working!</h1>
      <p>If you can see this, React is rendering correctly.</p>
      <div style={{ marginTop: '2rem', padding: '1rem', background: 'white', borderRadius: '8px' }}>
        <h2>Debug Information:</h2>
        <ul>
          <li>React Version: {React.version}</li>
          <li>Time: {new Date().toLocaleString()}</li>
        </ul>
      </div>
    </div>
  );
}

export default AppTest;
