import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import GateKiosk from './GateKiosk'
import GatePairing from './GatePairing'
import GateConfigError from './GateConfigError'
import { isPaired, storedDevice, type GateDeviceIdentity } from './offline/client'
import { useGateSync } from './offline/useGateSync'

interface GateTerminalProps {
  type: 'enter' | 'exit'
}

/**
 * Decides which of the three states a gate terminal is in.
 *
 *  1. **Paired** — the device has its own token, so it holds a local roster and
 *     resolves taps without the network. Institution and gate come from the
 *     token, not the URL.
 *  2. **Legacy** — no token, but `?institution_id=` is present. Behaves exactly
 *     as this page always has: online-only, one round trip per tap. Kiosks
 *     already in the field keep working untouched until someone pairs them.
 *  3. **Unpaired** — neither. Shows the pairing screen instead of the old
 *     "configuration required" error, because that is now a step in an install
 *     rather than a mistake.
 */
const GateTerminal: React.FC<GateTerminalProps> = ({ type }) => {
  const [searchParams] = useSearchParams()

  const legacyInstitutionId = searchParams.get('institution_id') || ''
  const legacyDeviceName =
    searchParams.get('device_name') || (type === 'enter' ? 'Gate Entrance' : 'Gate Exit')

  const [device, setDevice] = useState<GateDeviceIdentity | null>(() =>
    isPaired() ? storedDevice() : null,
  )

  const sync = useGateSync(device)

  // A revoked token has already taken the local roster with it; all that is
  // left is to put the pairing screen back up so the kiosk can be re-adopted.
  useEffect(() => {
    if (sync.revoked) setDevice(null)
  }, [sync.revoked])

  if (device) {
    const servesThisGate = device.gate_type === 'both' || device.gate_type === type

    // Recording entrances as exits would quietly corrupt attendance, and it
    // would look like a working gate the whole time — so a mismatch stops here
    // rather than being silently accepted.
    if (!servesThisGate) {
      return (
        <GateConfigError
          example={device.gate_type === 'exit' ? '/gate-exit' : '/gate-enter'}
          title="Wrong gate for this kiosk"
          message={`This device is paired as the ${
            device.gate_type === 'exit' ? 'exit' : 'entrance'
          } gate ("${device.name}"). Open the matching page, or unpair it in the portal and pair it again for this gate.`}
        />
      )
    }

    return (
      <GateKiosk
        type={type}
        institutionId={device.institution_id}
        deviceName={device.name}
        sync={sync}
      />
    )
  }

  // A revoked kiosk must not quietly carry on through the legacy public
  // endpoint just because its URL still carries an `institution_id`. Revoking
  // is how a school stops a device it no longer trusts; falling back here would
  // make that button do nothing.
  if (legacyInstitutionId && !sync.revoked) {
    return <GateKiosk type={type} institutionId={legacyInstitutionId} deviceName={legacyDeviceName} />
  }

  return <GatePairing type={type} onPaired={setDevice} />
}

export default GateTerminal
