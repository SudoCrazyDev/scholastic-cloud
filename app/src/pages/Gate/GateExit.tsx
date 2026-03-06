import React from 'react';
import { useSearchParams } from 'react-router-dom';
import GateKiosk from './GateKiosk';
import GateConfigError from './GateConfigError';

const GateExit: React.FC = () => {
  const [searchParams] = useSearchParams();
  const institutionId = searchParams.get('institution_id') || '';
  const deviceName = searchParams.get('device_name') || 'Gate Exit';

  if (!institutionId) {
    return <GateConfigError example="/gate-exit?institution_id=your-institution-uuid" />;
  }

  return (
    <GateKiosk
      type="exit"
      institutionId={institutionId}
      deviceName={deviceName}
    />
  );
};

export default GateExit;
