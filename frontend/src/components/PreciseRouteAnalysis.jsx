import React from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

// DEPRECATED: Precise route analysis feature has been removed. Stub component only.
const PreciseRouteAnalysis = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-[--background] rounded-lg shadow-xl w-full max-w-md mx-4 p-6 text-center border border-[--border]">
        <h2 className="text-lg font-semibold text-[--foreground] mb-2">Feature Removed</h2>
        <p className="text-sm text-[--muted-foreground]">
          Precise Route Analysis has been removed. Please use Route Weather Analysis instead.
        </p>
        <button onClick={onClose} className="mt-4 px-4 py-2 rounded-md border border-[--border] hover:bg-[--sidebar]">
          Close
        </button>
      </div>
    </div>
  );
};

export default PreciseRouteAnalysis;