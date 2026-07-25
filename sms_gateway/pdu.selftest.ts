import { encodeSubmit, decodePdu, isGsm7 } from './src/pdu.js'

let pass = 0
let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  if (String(got) === String(want)) pass++
  else {
    fail++
    console.log('FAIL', name, '\n  got :', got, '\n  want:', want)
  }
}

// 1. Classic DELIVER decode: "How are you?" from +31641600986
const deliver = '07911326040000F0040B911346610089F60000208062917314080CC8F71D14969741F977FD07'
const d = decodePdu(deliver)
eq('deliver.type', d.type, 'deliver')
if (d.type === 'deliver') {
  eq('deliver.text', d.text, 'How are you?')
  eq('deliver.sender', d.sender, '+31641600986')
}

// 2. GSM-7 detection
eq('isGsm7 ascii', isGsm7('Hello, world!'), true)
eq('isGsm7 emoji', isGsm7('Hello \u{1F600}'), false)
eq('isGsm7 euro(ext)', isGsm7('Price 5€'), true)

// 3. SUBMIT encode basics (GSM-7, single part)
const parts = encodeSubmit('+639171234567', 'Classes suspended today.')
eq('submit.count', parts.length, 1)
const p = parts[0].pdu
eq('submit.smsc0', p.slice(0, 2), '00')
eq('submit.firstOctet', p.slice(2, 4), '31') // SUBMIT|VP-rel|SRR, no UDH
// +639171234567 -> 12 digits, nibble-swapped = 361917325476
const addrExpected = '0C' + '91' + '361917325476'
eq('submit.addr', p.slice(6, 6 + addrExpected.length), addrExpected)

// 4. UCS2 SUBMIT (unicode forces DCS 08)
const u = encodeSubmit('+639171234567', 'café ☕')
const up = u[0].pdu
// layout: smsc(00) first(31) MR(00) addr(0C 91 + 6 octets = 16 hex) PID(00) DCS
const dcsIdx = 2 + 2 + 2 + 16 + 2
eq('ucs2.dcs', up.slice(dcsIdx, dcsIdx + 2), '08')

// 5. Long GSM-7 splits into concatenated parts with UDH (0x71 first octet)
const lp = encodeSubmit('+639171234567', 'A'.repeat(400))
eq('long.parts>=3', lp.length >= 3, true)
eq('long.udhi', lp[0].pdu.slice(2, 4), '71')

// 6. Status report decode (delivered, mr=42)
const sr =
  '0006' + '2A' + '0C91' + '361917325476' + '20806291731400' + '20806291731400' + '00'
const s = decodePdu(sr)
eq('status.type', s.type, 'status')
if (s.type === 'status') {
  eq('status.ref', s.reference, 42)
  eq('status.delivered', s.delivered, true)
  eq('status.recipient', s.recipient, '+639171234567')
}

console.log(`\nPDU self-test: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
