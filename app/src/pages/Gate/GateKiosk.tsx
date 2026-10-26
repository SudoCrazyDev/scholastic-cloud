import React, { useState, useEffect, useRef, useCallback } from 'react';
import { rfidScanLogService } from '../../services/rfidScanLogService';
import { correctedNow } from './offline/clock';
import { resolveLocally } from './offline/resolve';
import GateStatusChip from './GateStatusChip';
import type { GateSyncState } from './offline/useGateSync';

interface GateKioskProps {
  type: 'enter' | 'exit';
  institutionId: string;
  deviceName?: string;
  /**
   * Sync state when this kiosk is paired and holds a local roster. Absent means
   * the legacy `?institution_id=` mode, which behaves exactly as it always has.
   */
  sync?: GateSyncState;
}

/**
 * What is on screen right now.
 *
 * The three states are not decoration; they are what the gate can honestly
 * claim at each moment:
 *
 *  - **pending** — the face is drawn from the local roster the instant the card
 *    is read, and the scan is already on disk, but nothing has acknowledged it.
 *  - **recorded** — the server has it.
 *  - **queued** — the server could not be reached, and the scan is waiting on
 *    this device. Not an error: the record exists and will go up. Saying so is
 *    the difference between a kiosk that looks broken during an outage and one
 *    that tells the truth about it.
 */
interface DisplayResult {
  /** The tap this card belongs to — see `scanSeq`. */
  seq: number;
  name: string;
  gradeAndSection: string | null;
  photoUrl: string | null;
  scannedAt: Date;
  status: 'pending' | 'recorded' | 'queued';
}

const GateKiosk: React.FC<GateKioskProps> = ({ type, institutionId, deviceName, sync }) => {
  /**
   * `correctedNow`, not `new Date()`: on a device with no real-time clock the
   * raw reading can be days out, and this is the number rendered in 6.5rem type
   * above the scanner. Showing the wrong day on the wall while stamping scans
   * with the corrected time would be the worst of both — the staff standing
   * there would have no reason to doubt it.
   */
  const [currentTime, setCurrentTime] = useState(correctedNow);
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The consoling half of a refusal. A card this device cannot name may still be
   * perfectly valid — issued after its last roster sync — so when the scan has
   * been queued for the server to resolve, the red card says so rather than
   * implying the tap went nowhere.
   */
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Which tap the display belongs to. A scan that is still in flight when the
   * next student taps must not be allowed to overwrite the newer card — that is
   * precisely the queue-forming behaviour the local roster exists to remove.
   *
   * There is no auto-clear: a card stays up until the next tap replaces it, so
   * whatever is on screen when a reply lands may be the *previous* student's.
   * A reply only fills in from the card on screen when that card is its own.
   */
  const scanSeq = useRef(0);

  /** The object URL currently on screen, revoked when it stops being. */
  const photoUrlRef = useRef<string | null>(null);

  const releasePhoto = useCallback(() => {
    if (photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(correctedNow()), 1000);
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

  useEffect(() => releasePhoto, [releasePhoto]);

  const handleScan = async (scanned: string) => {
    const value = scanned.trim();
    if (!value) return;

    const seq = ++scanSeq.current;

    setError(null);
    setErrorNote(null);
    focusInput();

    if (sync) {
      await handlePairedScan(value, seq);
      return;
    }

    await handleLegacyScan(value, seq);
  };

  /**
   * A tap on a paired kiosk. **Nothing here waits on the network.**
   *
   * The roster answers who tapped and the outbox takes the record, both from
   * local storage; the upload attempt that follows only decides which of two
   * true things the card says — "recorded" or "saved, waiting to upload".
   */
  const handlePairedScan = async (value: string, seq: number) => {
    if (!sync) return;

    const local = await resolveLocally(value);

    if (local && scanSeq.current === seq) {
      releasePhoto();
      const photoUrl = local.photo ? URL.createObjectURL(local.photo) : null;
      photoUrlRef.current = photoUrl;

      setResult({
        seq,
        name: local.name,
        gradeAndSection: local.gradeAndSection,
        photoUrl,
        scannedAt: correctedNow(),
        status: 'pending',
      });
    }

    // Returns once the scan is durable, saying whether it also got through.
    const submission = await sync.recordScan(value, type);

    if (scanSeq.current !== seq) return;

    // The server refused the card outright. When this happens to a tap the
    // local roster *did* resolve, the two disagree — and the server wins, so
    // the welcome card has to come down.
    if (submission.status === 'rejected') {
      releasePhoto();
      setResult(null);
      setError(
        submission.reason === 'unknown_tag'
          ? 'Card not recognised'
          : 'Scan could not be recorded',
      );
      setErrorNote(null);
      return;
    }

    const named = submission.student
      ? [
          submission.student.first_name,
          submission.student.middle_name,
          submission.student.last_name,
          submission.student.ext_name,
        ]
          .filter(Boolean)
          .join(' ')
      : '';

    const serverSection = submission.student?.grade_level && submission.student?.section
      ? `${submission.student.grade_level} — ${submission.student.section}`
      : (submission.student?.grade_level ?? submission.student?.section ?? null);

    // Nobody can name this tap: not the roster, and not the reply — because
    // there was no reply. The scan is saved either way.
    if (!local && !named) {
      releasePhoto();
      setResult(null);
      setError('Card not recognised');
      setErrorNote('Saved on this kiosk — it will upload when the link returns');
      return;
    }

    // The roster could not name this tap, so any photo still held is the
    // previous student's.
    if (!local) releasePhoto();

    setResult((current) => {
      // The local roster's answer first: it is what is already on screen, and
      // re-fetching a photo over the same slow link would undo the caching.
      const own = current?.seq === seq ? current : null;

      return {
        seq,
        name: own?.name || named,
        gradeAndSection: own?.gradeAndSection ?? serverSection,
        photoUrl: own?.photoUrl ?? null,
        // The device's own stamp is the record now — see `outbox.ts`.
        scannedAt: own?.scannedAt ?? correctedNow(),
        status: submission.status === 'recorded' ? 'recorded' : 'queued',
      };
    });
  };

  /**
   * A tap on an unpaired kiosk, still on `?institution_id=`: one round trip,
   * online only, exactly as this page worked before any of this existed. Kept so
   * a kiosk in the field keeps working until someone pairs it.
   */
  const handleLegacyScan = async (value: string, seq: number) => {
    try {
      const response = await rfidScanLogService.kioskScan({
        rfid_uid: value,
        institution_id: institutionId,
        type,
        device_name: deviceName,
      });

      if (scanSeq.current !== seq) return;

      const student = response.data.student;
      const section = response.data.class_section;

      const name = student
        ? [student.first_name, student.middle_name, student.last_name, student.ext_name]
            .filter(Boolean)
            .join(' ')
        : '';

      // The card on screen, if any, is the previous tap's; nothing of it carries over.
      releasePhoto();
      setResult({
        seq,
        name,
        gradeAndSection: section ? `${section.grade_level} — ${section.title}` : null,
        photoUrl: student?.profile_picture ?? null,
        scannedAt: new Date(response.data.scanned_at),
        status: 'recorded',
      });
    } catch (err: unknown) {
      if (scanSeq.current !== seq) return;

      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Scan failed. Please try again.';

      releasePhoto();
      setResult(null);
      setError(message);
    } finally {
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
            className={`w-2.5 h-2.5 rounded-full ${
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

        <div className="flex items-center gap-3">
          {sync && <GateStatusChip state={sync} />}
          <span className="text-sm text-gray-400 tabular-nums font-medium">{formattedTime}</span>
        </div>
      </header>

      {/* ───── Main Content ───── */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-3xl px-8">
        {/* Clock */}
        <div className="text-center mb-14">
          <div className="text-[6.5rem] leading-none font-extralight tracking-wider tabular-nums text-gray-800">
            {formattedTime}
          </div>
          <div className="text-lg text-gray-400 mt-4 tracking-wide font-light">
            {formattedDate}
          </div>
        </div>

        {/* Scan Area */}
        <div className="w-full">
          {result ? (
            /* ── Scan Result Card — stays up until the next tap replaces it ── */
            <div
              className={`rounded-3xl border backdrop-blur-sm p-10 text-center ${
                isEnter
                  ? 'border-emerald-200 bg-white/80 shadow-[0_4px_40px_-8px_rgba(16,185,129,0.15)]'
                  : 'border-rose-200 bg-white/80 shadow-[0_4px_40px_-8px_rgba(244,63,94,0.15)]'
              }`}
            >
              {/* Status badge */}
              <div
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
              </div>

              {/* Profile picture */}
              <div className="flex justify-center mb-8">
                <div
                  className={`w-56 h-56 rounded-full border-4 overflow-hidden ${
                    isEnter ? 'border-emerald-300' : 'border-rose-300'
                  } bg-gray-100`}
                >
                  {result.photoUrl ? (
                    <img
                      src={result.photoUrl}
                      alt={result.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-28 h-28 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              {/* Student name */}
              <h2 className="text-6xl font-bold text-gray-900 mb-3">{result.name}</h2>

              {/* Grade level and section */}
              {result.gradeAndSection && (
                <p className="text-3xl text-gray-500">{result.gradeAndSection}</p>
              )}

              {/* Timestamp */}
              <p className="text-sm text-gray-400 mt-5">
                Scanned at{' '}
                {result.scannedAt.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
                {result.status === 'pending' && <span className="text-gray-300"> · saving…</span>}
                {result.status === 'queued' && (
                  <span className="text-amber-600"> · saved, waiting to upload</span>
                )}
              </p>
            </div>
          ) : error ? (
            /* ── Error Card ── */
            <div
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
              <p className="text-sm text-gray-400">{errorNote ?? 'Please try again'}</p>
            </div>
          ) : (
            /* ── Idle / Waiting for the first scan ── */
            <div className="text-center">
              {/* Scan indicator */}
              <div className="inline-flex items-center justify-center mb-8">
                <div
                  className={`w-24 h-24 rounded-full flex items-center justify-center border ${
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
            </div>
          )}
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
