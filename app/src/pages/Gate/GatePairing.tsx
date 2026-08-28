import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { pairDevice, type GateDeviceIdentity } from './offline/client'
import { importSeed, SeedMismatchError } from './offline/seed'

interface GatePairingProps {
  /** Which gate this terminal is standing at, for the copy on screen. */
  type: 'enter' | 'exit'
  onPaired: (device: GateDeviceIdentity) => void
}

/**
 * What an unpaired kiosk shows, in the order a technician actually works.
 *
 * **Step one** is the code an administrator just generated on the Gate Entries
 * page. **Step two** is optional and only exists because of the numbers: a
 * 3,000-student campus is ~90 MB of faces, which the links this feature exists
 * for cannot deliver in an afternoon, so the bundle from `php artisan
 * gate:seed-snapshot` can be loaded off a USB stick instead.
 *
 * The two are separate screens rather than one because the bundle is validated
 * against the device it was built for — which means the device has to have a
 * token before a bundle can be offered at all. Handing straight through to the
 * kiosk on a successful pair left the seed step with nowhere to live and no way
 * to reach it.
 *
 * Step two starts the gate on its own after a minute. A technician who pairs a
 * terminal and walks away must not leave a wall-mounted screen sitting on a
 * setup prompt, and the countdown holds while a bundle is still importing.
 */
const GatePairing: React.FC<GatePairingProps> = ({ type, onPaired }) => {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [paired, setPaired] = useState<GateDeviceIdentity | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isEnter = type === 'enter'

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || code.trim().length < 4) return

    setBusy(true)
    setError(null)

    try {
      // Held here rather than handed straight up: the seed step below needs a
      // paired device, and this is the only moment it has one.
      setPaired(await pairDevice(code))
    } catch (pairError) {
      setError(pairError instanceof Error ? pairError.message : 'Pairing failed.')
    } finally {
      setBusy(false)
    }
  }

  const loadSeed = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !paired) return

    setBusy(true)
    setError(null)
    setNote(null)

    try {
      const result = await importSeed(file, paired)
      setNote(
        `Loaded ${result.students.toLocaleString()} students and ${result.photos.toLocaleString()} ${
          result.photos === 1 ? 'photo' : 'photos'
        }.`,
      )
    } catch (seedError) {
      setError(
        seedError instanceof SeedMismatchError
          ? seedError.message
          : seedError instanceof Error
            ? seedError.message
            : 'That bundle could not be read.',
      )
    } finally {
      setBusy(false)
    }
  }

  const shell = (children: React.ReactNode) => (
    <div
      className={`min-h-screen flex flex-col items-center justify-center select-none px-6 ${
        isEnter
          ? 'bg-gradient-to-b from-white via-emerald-50/40 to-emerald-100/50'
          : 'bg-gradient-to-b from-white via-rose-50/40 to-rose-100/50'
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-gray-200 bg-white/85 backdrop-blur-sm p-10 text-center shadow-[0_4px_40px_-12px_rgba(0,0,0,0.12)]"
      >
        <div
          className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6 border ${
            isEnter ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-7 h-7 ${isEnter ? 'text-emerald-600' : 'text-rose-600'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </div>

        {children}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {note && <p className="mt-4 text-sm text-emerald-700">{note}</p>}
      </motion.div>

      <p className="mt-8 text-xs text-gray-400">
        ScholasticCloud · {isEnter ? 'Entrance' : 'Exit'} Kiosk
      </p>
    </div>
  )

  if (paired) {
    return shell(
      <GateSeedStep
        device={paired}
        busy={busy}
        fileRef={fileRef}
        onPickBundle={() => fileRef.current?.click()}
        onLoadBundle={loadSeed}
        onStart={() => onPaired(paired)}
      />,
    )
  }

  return shell(
    <>
      <h1 className="text-2xl font-semibold text-gray-900">Pair this kiosk</h1>
      <p className="mt-2 text-sm text-gray-500 leading-relaxed">
        In the portal, open <span className="font-medium">Gate Entries</span> → the{' '}
        <span className="font-medium">{isEnter ? 'Entrance' : 'Exit'} Gate</span> tab →{' '}
        <span className="font-medium">Add device</span>, then type the code it shows here.
      </p>

      <form onSubmit={submit} className="mt-7">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="XXXXXX"
          autoFocus
          maxLength={8}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center font-mono text-3xl tracking-[0.4em] text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
        />

        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-40 ${
            isEnter ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          {busy ? 'Pairing…' : 'Pair kiosk'}
        </button>
      </form>
    </>,
  )
}

const AUTO_START_SECONDS = 60

interface GateSeedStepProps {
  device: GateDeviceIdentity
  busy: boolean
  fileRef: React.RefObject<HTMLInputElement | null>
  onPickBundle: () => void
  onLoadBundle: (event: React.ChangeEvent<HTMLInputElement>) => void
  onStart: () => void
}

const GateSeedStep: React.FC<GateSeedStepProps> = ({
  device,
  busy,
  fileRef,
  onPickBundle,
  onLoadBundle,
  onStart,
}) => {
  const [remaining, setRemaining] = useState(AUTO_START_SECONDS)

  const start = useCallback(() => onStart(), [onStart])

  // Paused while a bundle is importing — a 90 MB stick takes minutes, and
  // starting the gate out from under the import would abandon it half-loaded.
  useEffect(() => {
    if (busy) {
      setRemaining(AUTO_START_SECONDS)
      return
    }

    const timer = window.setInterval(() => setRemaining((left) => left - 1), 1000)

    return () => window.clearInterval(timer)
  }, [busy])

  useEffect(() => {
    if (!busy && remaining <= 0) start()
  }, [busy, remaining, start])

  return (
    <>
      <h1 className="text-2xl font-semibold text-gray-900">Kiosk paired</h1>
      <p className="mt-2 text-sm text-gray-500 leading-relaxed">
        This terminal is now <span className="font-medium">{device.name}</span>
        {device.location ? ` · ${device.location}` : ''}. It will pull the roster over the network
        by itself.
      </p>

      <div className="mt-7 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-4 text-left">
        <p className="text-sm font-medium text-gray-700">Loading from a USB stick (optional)</p>
        <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
          A large campus is roughly 90 MB of photos. If this school's link cannot carry that,
          load the bundle built with{' '}
          <code className="font-mono text-gray-600">php artisan gate:seed-snapshot</code> now and
          the network is left with nothing to do but deltas.
        </p>

        <input ref={fileRef} type="file" accept=".zip" onChange={onLoadBundle} className="hidden" />
        <button
          type="button"
          disabled={busy}
          onClick={onPickBundle}
          className="mt-3 text-sm font-medium text-gray-600 underline underline-offset-4 hover:text-gray-900 disabled:opacity-40"
        >
          {busy ? 'Reading the bundle…' : 'Load a seed bundle'}
        </button>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={start}
        className="mt-6 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
      >
        Start the gate
      </button>

      <p className="mt-3 text-xs text-gray-400 tabular-nums">
        {busy
          ? 'Waiting for the bundle to finish…'
          : `Starting on its own in ${Math.max(0, remaining)}s`}
      </p>
    </>
  )
}

export default GatePairing
