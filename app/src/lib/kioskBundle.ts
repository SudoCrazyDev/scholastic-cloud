// The Pi gate-kiosk installer, straight from the repo's kiosk/ folder at build
// time — so the download is always whatever this deploy shipped with.
import installScript from '../../../kiosk/install-kiosk.sh?raw'
import kioskScript from '../../../kiosk/kiosk.sh?raw'
import kioskDefault from '../../../kiosk/kiosk.default?raw'
import kioskReadme from '../../../kiosk/README.md?raw'
import { buildZip } from './zip'

/** The placeholder `kiosk.sh` refuses to start on. */
const PLACEHOLDER_URL = 'KIOSK_URL="https://example.com"'

/**
 * @param kioskUrl Written into the bundled `kiosk.default` as `KIOSK_URL`, so the
 *   installer sets up the right gate page without anyone editing the file. It may
 *   carry `?pair=<code>`, which the gate page uses to pair itself on first boot.
 */
export function downloadKioskInstaller(kioskUrl?: string) {
  const settings = kioskUrl
    ? kioskDefault.replace(PLACEHOLDER_URL, `KIOSK_URL="${kioskUrl}"`)
    : kioskDefault

  const blob = buildZip([
    { name: 'kiosk/install-kiosk.sh', content: installScript, mode: 0o755 },
    { name: 'kiosk/kiosk.sh', content: kioskScript, mode: 0o755 },
    { name: 'kiosk/kiosk.default', content: settings },
    { name: 'kiosk/README.md', content: kioskReadme },
  ])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'scholasticcloud-kiosk.zip'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
