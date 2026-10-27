import React, { useEffect, useState } from 'react'
import GateKiosk from './GateKiosk'
import GatePairing from './GatePairing'
import GateConfigError from './GateConfigError'
import { isPaired, storedDevice, type GateDeviceIdentity } from './offline/client'
import { useGateSync } from './offline/useGateSync'

interface GateTerminalProps {
  type: 'enter' | 'exit'
}

/**
 * Decides which of the two states a gate terminal is in.
 *
 *  1. **Paired** — the device has its own token, so it holds a local roster and
 *     resolves taps without the network. Institution and gate come from the
 *     token, not the URL.
 *  2. **Unpaired** — shows the pairing screen.
 *
 * There used to be a third: no token but `?institution_id=` in the URL, which
 * ran online-only with one round trip per tap. At a morning rush that was slow,
 * and its public endpoint shares the pairing throttle — ten a minute per
 * address — so taps started failing with "Too Many Attempts". It is gone; an
 * old URL that still carries `institution_id` now lands on the pairing screen,
 * and the parameter is ignored.
 */
const GateTerminal: React.FC<GateTerminalProps> = ({ type }) => {
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

    return <GateKiosk type={type} deviceName={device.name} sync={sync} />
  }

  return <GatePairing type={type} onPaired={setDevice} />
}

export default GateTerminal
