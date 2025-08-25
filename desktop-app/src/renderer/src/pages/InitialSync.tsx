import React, { useEffect, useState } from 'react';
import { offlineSyncService } from '../services/offlineSyncService';
import { authService } from '../services/authService';

interface InitialSyncProps {
  onDone: () => void;
}

const InitialSync: React.FC<InitialSyncProps> = ({ onDone }) => {
  const user = authService.getCurrentUser();
  const [progress, setProgress] = useState<string>('Preparing...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!user) {
        setError('No authenticated user');
        return;
      }
      try {
        setProgress('Checking local data...');
        const seeded = await offlineSyncService.isSeeded(user.id);
        if (seeded.success && seeded.seeded) {
          onDone();
          return;
        }
        setProgress('Fetching required data...');
        const res = await offlineSyncService.initialSeed(user.id);
        if (!res.success) {
          setError(res.error || 'Failed to seed offline data');
          return;
        }
        setProgress('Finalizing...');
        setTimeout(onDone, 300);
      } catch (e: any) {
        setError(e?.message || 'Failed to perform initial sync');
      }
    };
    run();
  }, [user, onDone]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
        <div className="mx-auto h-12 w-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <h2 className="mt-6 text-xl font-semibold text-gray-900">Preparing offline mode</h2>
        {!error ? (
          <p className="mt-2 text-sm text-gray-600">{progress}</p>
        ) : (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
};

export default InitialSync;

