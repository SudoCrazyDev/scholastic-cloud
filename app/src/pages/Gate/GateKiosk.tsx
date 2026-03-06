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
    <div
      className={`min-h-screen flex flex-col items-center justify-between select-none overflow-hidden relative ${
        isEnter
          ? 'bg-gradient-to-b from-white via-emerald-50/40 to-emerald-100/50 text-gray-900'
          : 'bg-gradient-to-b from-white via-rose-50/40 to-rose-100/50 text-gray-900'
      }`}
    >
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

      {/* ───── Header ───── */}
      <header className="w-full flex items-center justify-between px-8 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full animate-pulse ${
              isEnter ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          <span className="text-sm text-gray-400 font-medium">{deviceName}</span>
        </div>

        <div
          className={`px-5 py-1.5 rounded-full border ${
            isEnter
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-rose-300 bg-rose-50'
          }`}
        >
          <span
            className={`text-xs font-bold tracking-[0.25em] ${
              isEnter ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {label}
          </span>
        </div>

        <span className="text-sm text-gray-400 tabular-nums font-medium">
          {formattedTime}
        </span>
      </header>

      {/* ───── Main Content ───── */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-xl px-8">
        {/* Clock */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-14"
        >
          <div className="text-[6.5rem] leading-none font-extralight tracking-wider tabular-nums text-gray-800">
            {formattedTime}
          </div>
          <div className="text-lg text-gray-400 mt-4 tracking-wide font-light">
            {formattedDate}
          </div>
        </motion.div>

        {/* Scan Area */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            {scanResult ? (
              /* ── Scan Result Card ── */
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.92, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -24 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={`rounded-3xl border backdrop-blur-sm p-10 text-center ${
                  isEnter
                    ? 'border-emerald-200 bg-white/80 shadow-[0_4px_40px_-8px_rgba(16,185,129,0.15)]'
                    : 'border-rose-200 bg-white/80 shadow-[0_4px_40px_-8px_rgba(244,63,94,0.15)]'
                }`}
              >
                {/* Status badge */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 22 }}
                  className={`inline-flex items-center gap-2.5 px-5 py-2 rounded-full mb-8 ${
                    isEnter
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {isEnter ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
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
                  transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 20 }}
                  className="flex justify-center mb-6"
                >
                  <div
                    className={`w-28 h-28 rounded-full border-[3px] overflow-hidden ${
                      isEnter ? 'border-emerald-300' : 'border-rose-300'
                    } bg-gray-100`}
                  >
                    {scanResult.student?.profile_picture ? (
                      <img
                        src={scanResult.student.profile_picture}
                        alt={studentName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Student name */}
                <motion.h2
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="text-3xl font-bold text-gray-900 mb-1.5"
                >
                  {studentName}
                </motion.h2>

                {/* Grade level and section */}
                {gradeAndSection && (
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="text-base text-gray-500"
                  >
                    {gradeAndSection}
                  </motion.p>
                )}

                {/* Timestamp */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45 }}
                  className="text-sm text-gray-400 mt-5"
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
                <div className="mt-8 mx-auto max-w-[12rem]">
                  <div className="h-px bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${
                        isEnter ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                      initial={{ width: '100%' }}
                      animate={{ width: '0%' }}
                      transition={{ duration: DISPLAY_DURATION_MS / 1000, ease: 'linear' }}
                    />
                  </div>
                </div>
              </motion.div>
            ) : error ? (
              /* ── Error Card ── */
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.92, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -24 }}
                transition={{ duration: 0.3 }}
                className="rounded-3xl border border-red-200 bg-white/80 backdrop-blur-sm p-10 text-center shadow-[0_4px_40px_-8px_rgba(239,68,68,0.12)]"
              >
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 border border-red-200 mb-5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <p className="text-xl font-semibold text-red-600 mb-1">{error}</p>
                <p className="text-sm text-gray-400">Please try again</p>
                <div className="mt-8 mx-auto max-w-[12rem]">
                  <div className="h-px bg-gray-200 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-red-500"
                      initial={{ width: '100%' }}
                      animate={{ width: '0%' }}
                      transition={{ duration: DISPLAY_DURATION_MS / 1000, ease: 'linear' }}
                    />
                  </div>
                </div>
              </motion.div>
            ) : (
              /* ── Idle / Waiting for scan ── */
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                {/* Pulsing scan indicator */}
                <div className="relative inline-flex items-center justify-center mb-8">
                  <motion.div
                    className={`absolute w-32 h-32 rounded-full ${
                      isEnter ? 'bg-emerald-200/40' : 'bg-rose-200/40'
                    }`}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className={`absolute w-32 h-32 rounded-full ${
                      isEnter ? 'bg-emerald-200/30' : 'bg-rose-200/30'
                    }`}
                    animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                  />
                  <div
                    className={`relative w-24 h-24 rounded-full flex items-center justify-center border ${
                      isEnter
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                  </div>
                </div>

                <p
                  className={`text-2xl font-light ${
                    isEnter ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  Scan your ID to {isEnter ? 'enter' : 'exit'}
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  Place your ID card on the scanner
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ───── Footer ───── */}
      <footer className="w-full px-8 pb-5 pt-4">
        <div className="flex items-center justify-center gap-2 text-gray-300 text-xs">
          <span>ScholasticCloud</span>
          <span>·</span>
          <span className="capitalize">{type} Kiosk</span>
        </div>
      </footer>
    </div>
  );
};

export default GateKiosk;
