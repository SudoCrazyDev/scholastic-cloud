import React from 'react';
import { useSearchParams } from 'react-router-dom';
import GateKiosk from './GateKiosk';
import GateConfigError from './GateConfigError';

const GateEnter: React.FC = () => {
  const [searchParams] = useSearchParams();
  const institutionId = searchParams.get('institution_id') || '';
  const deviceName = searchParams.get('device_name') || 'Gate Entrance';

  if (!institutionId) {
    return <GateConfigError example="/gate-enter?institution_id=your-institution-uuid" />;
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
