import React from 'react';
import { useSearchParams } from 'react-router-dom';
import GateKiosk from './GateKiosk';

const GateEnter: React.FC = () => {
  const [searchParams] = useSearchParams();
  const institutionId = searchParams.get('institution_id') || '';
  const deviceName = searchParams.get('device_name') || 'Gate Entrance';

  if (!institutionId) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Configuration Required</h1>
          <p className="text-gray-400">
            Please provide <code className="text-emerald-400 bg-gray-800 px-2 py-0.5 rounded">institution_id</code> as a URL parameter.
          </p>
          <p className="text-gray-500 text-sm mt-4">
            Example: /gate-enter?institution_id=your-institution-uuid
          </p>
        </div>
      </div>
    );
  }

  return (
    <GateKiosk
      type="enter"
      institutionId={institutionId}
      deviceName={deviceName}
    />
  );
};

export default GateEnter;
