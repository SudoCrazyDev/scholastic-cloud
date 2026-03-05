import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { rfidScanLogService } from '../../services/rfidScanLogService';
import type { KioskScanResponse } from '../../types';

interface GateKioskProps {
  type: 'enter' | 'exit';
  institutionId: string;
  deviceName?: string;
}

const DISPLAY_DURATION_MS = 5000;

const GateKiosk: React.FC<GateKioskProps> = ({ type, institutionId, deviceName }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scanResult, setScanResult] = useState<KioskScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const focusInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    focusInput();

    const refocus = () => {
      setTimeout(focusInput, 100);
    };

    window.addEventListener('click', refocus);
    window.addEventListener('focus', refocus);

    return () => {
      window.removeEventListener('click', refocus);
      window.removeEventListener('focus', refocus);
    };
  }, [focusInput]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleScan = async (rfidUid: string) => {
    if (!rfidUid.trim() || isScanning) return;

    setIsScanning(true);
    setError(null);
    setScanResult(null);

    if (timerRef.current) clearTimeout(timerRef.current);

    try {
      const response = await rfidScanLogService.kioskScan({
        rfid_uid: rfidUid.trim(),
        institution_id: institutionId,
        type,
        device_name: deviceName,
      });

      setScanResult(response.data);

      timerRef.current = setTimeout(() => {
        setScanResult(null);
        setError(null);
        focusInput();
      }, DISPLAY_DURATION_MS);
    } catch (err: any) {
      const message = err.response?.data?.message || 'Scan failed. Please try again.';
      setError(message);

      timerRef.current = setTimeout(() => {
        setError(null);
        focusInput();
      }, DISPLAY_DURATION_MS);
    } finally {
      setIsScanning(false);
      focusInput();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = inputRef.current?.value || '';
      handleScan(value);
    }
  };

  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isEnter = type === 'enter';
  const label = isEnter ? 'ENTRANCE GATE' : 'EXIT GATE';

  const studentName = scanResult?.student
    ? [
        scanResult.student.first_name,
        scanResult.student.middle_name,
        scanResult.student.last_name,
        scanResult.student.ext_name,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  const gradeAndSection = scanResult?.class_section
    ? `${scanResult.class_section.grade_level} — ${scanResult.class_section.title}`
    : null;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center ${
      isEnter
        ? 'bg-gradient-to-br from-emerald-950 via-gray-950 to-emerald-950'
        : 'bg-gradient-to-br from-rose-950 via-gray-950 to-rose-950'
    } text-white select-none overflow-hidden relative`}>
      {/* Hidden RFID input */}
      <input
        ref={inputRef}
        type="text"
        onKeyDown={handleKeyDown}
        autoFocus
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Gate label */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2">
        <div className={`px-6 py-2 rounded-full border ${
          isEnter
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-rose-500/30 bg-rose-500/10'
        }`}>
          <span className={`text-sm font-bold tracking-[0.3em] ${
            isEnter ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {label}
          </span>
        </div>
      </div>

      {/* Clock */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="text-8xl font-extralight tracking-wider tabular-nums">
          {formattedTime}
        </div>
        <div className="text-xl text-gray-400 mt-3 tracking-wide">
          {formattedDate}
        </div>
      </motion.div>

      {/* Scan area */}
      <div className="w-full max-w-xl px-8">
        <AnimatePresence mode="wait">
          {scanResult ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className={`rounded-3xl border p-8 text-center ${
                isEnter
                  ? 'border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_60px_rgba(16,185,129,0.15)]'
                  : 'border-rose-500/30 bg-rose-500/5 shadow-[0_0_60px_rgba(244,63,94,0.15)]'
              }`}
            >
              {/* Status badge */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
                className={`inline-flex items-center gap-2 px-5 py-2 rounded-full mb-6 ${
                  isEnter
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {isEnter ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                )}
                <span className="font-semibold text-sm tracking-wider uppercase">
                  {isEnter ? 'Welcome' : 'Goodbye'}
                </span>
              </motion.div>

              {/* Profile picture */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 20 }}
                className="flex justify-center mb-6"
              >
                <div className={`w-32 h-32 rounded-full border-4 overflow-hidden ${
                  isEnter ? 'border-emerald-500/50' : 'border-rose-500/50'
                } bg-gray-800`}>
                  {scanResult.student?.profile_picture ? (
                    <img
                      src={scanResult.student.profile_picture}
                      alt={studentName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Student name */}
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-3xl font-bold mb-2"
              >
                {studentName}
              </motion.h2>

              {/* Grade level and section */}
              {gradeAndSection && (
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-lg text-gray-400"
                >
                  {gradeAndSection}
                </motion.p>
              )}

              {/* Timestamp */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-sm text-gray-500 mt-4"
              >
                Scanned at{' '}
                {new Date(scanResult.scanned_at).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </motion.p>

              {/* Auto-dismiss progress bar */}
              <div className="mt-6 mx-auto max-w-xs">
                <motion.div
                  className={`h-1 rounded-full ${
                    isEnter ? 'bg-emerald-500/40' : 'bg-rose-500/40'
                  }`}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: DISPLAY_DURATION_MS / 1000, ease: 'linear' }}
                />
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.3 }}
              className="rounded-3xl border border-red-500/30 bg-red-500/5 p-8 text-center shadow-[0_0_60px_rgba(239,68,68,0.15)]"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p className="text-xl font-semibold text-red-300">{error}</p>
              <div className="mt-6 mx-auto max-w-xs">
                <motion.div
                  className="h-1 rounded-full bg-red-500/40"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: DISPLAY_DURATION_MS / 1000, ease: 'linear' }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              {/* Pulsing scan indicator */}
              <div className="relative inline-flex items-center justify-center mb-6">
                <motion.div
                  className={`absolute w-28 h-28 rounded-full ${
                    isEnter ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                  }`}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className={`absolute w-28 h-28 rounded-full ${
                    isEnter ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                  }`}
                  animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0, 0.2] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                />
                <div className={`relative w-20 h-20 rounded-full flex items-center justify-center ${
                  isEnter ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </div>
              </div>

              <p className={`text-2xl font-light ${
                isEnter ? 'text-emerald-300/70' : 'text-rose-300/70'
              }`}>
                Scan your ID to {isEnter ? 'enter' : 'exit'}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Place your ID card on the scanner
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default GateKiosk;
