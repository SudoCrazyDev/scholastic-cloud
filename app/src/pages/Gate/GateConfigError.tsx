import React from 'react';

interface GateConfigErrorProps {
  example: string;
}

const GateConfigError: React.FC<GateConfigErrorProps> = ({ example }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-900 px-6">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-3">Configuration Required</h1>
        <p className="text-gray-500 leading-relaxed">
          Please provide{' '}
          <code className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-sm font-mono">
            institution_id
          </code>{' '}
          as a URL parameter.
        </p>
        <div className="mt-6 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-1.5 font-medium">Example</p>
          <code className="text-gray-700 text-sm font-mono break-all">{example}</code>
        </div>
      </div>
    </div>
  );
};

export default GateConfigError;
