// The Pi gate-kiosk installer, straight from the repo's kiosk/ folder at build
// time — so the download is always whatever this deploy shipped with.
import installScript from '../../../kiosk/install-kiosk.sh?raw'
import kioskScript from '../../../kiosk/kiosk.sh?raw'
import kioskDefault from '../../../kiosk/kiosk.default?raw'
import kioskReadme from '../../../kiosk/README.md?raw'
import { buildZip } from './zip'

export function downloadKioskInstaller() {
  const blob = buildZip([
    { name: 'kiosk/install-kiosk.sh', content: installScript, mode: 0o755 },
    { name: 'kiosk/kiosk.sh', content: kioskScript, mode: 0o755 },
    { name: 'kiosk/kiosk.default', content: kioskDefault },
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
