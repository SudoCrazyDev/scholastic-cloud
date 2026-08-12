import { encodeSubmit, decodePdu, isGsm7, alphabetOf } from './src/pdu.js'
import { ConcatBuffer, CONCAT_TTL_MS } from './src/concat.js'

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

// 7. Concatenated inbound DELIVER: both parts must decode cleanly and rejoin.
// A 6-byte concat UDH leaves 1 fill bit; counting it twice shifts every septet
// and turns carrier promos into mojibake ("irst9z29Δww;…").
const CONCAT_TEXT =
  'GLOBE: Enjoy unli calls and texts to all networks for 30 days at only P299. ' +
  'Register now by texting UNLI299 to 8080. Terms and conditions apply. ' +
  'Visit any Globe store for help.'
const concatPdus = [
  '00440AD047E6535804000020806291731400A0050003B402018ECCA7B0A80315DDEA771E5477B3D3A07198CD9E83C26E32885EC6D3E720FA1B1466B341EE32FDFE96AFE720F35B0E9AC140E4707E0E0AD3416F373B0F82CA723917485A3EA7E7F4B21CE47EDF41E23C885EC6D3D3EE33A8EA642665B91C88FE06E16038980B442DCBDB7350D84D068DDF6E729A9E7EBBE7A0301CCECEBB40D6F43C4D0785DD',
  '00440AD047E65358040000208062917314001E050003B40202F2A023FB2D2E83E6F4B7BC0C32BFE52074990D7701',
]
const decodedParts = concatPdus.map((p) => decodePdu(p))
eq('concat.seq1', decodedParts[0].type === 'deliver' && decodedParts[0].concat?.seq, 1)
eq('concat.total', decodedParts[0].type === 'deliver' && decodedParts[0].concat?.total, 2)
eq('concat.ref match', decodedParts[0].type === 'deliver' && decodedParts[1].type === 'deliver'
  ? decodedParts[0].concat?.ref === decodedParts[1].concat?.ref
  : false, true)
eq(
  'concat.text',
  decodedParts.map((d) => (d.type === 'deliver' ? d.text : '')).join(''),
  CONCAT_TEXT,
)

// 8. Alphanumeric originating address (TON=101) — carrier shortcodes send these.
// BCD nibble-swapping them yields hex mush like "8381E060".
eq('alpha.sender', decodedParts[0].type === 'deliver' && decodedParts[0].sender, 'GLOBE')
const national = decodePdu('000404810808' + '0000' + '20806291731400' + '03' + 'D4F29C')
eq('national.sender', national.type === 'deliver' && national.sender, '8080')

// 9. TP-DCS -> alphabet. Everything that is not renderable text must say '8bit'
// so the agent drops it instead of storing mojibake.
for (const [dcs, want] of [
  [0x00, 'gsm7'], // default alphabet
  [0x04, '8bit'], // 8-bit data (WAP push / OTA)
  [0x08, 'ucs2'], // UCS2
  [0x10, 'gsm7'], // has message class, default alphabet
  [0x14, '8bit'], // has message class, 8-bit
  [0x18, 'ucs2'], // has message class, UCS2
  [0x20, '8bit'], // compressed — unsupported
  [0xc0, 'gsm7'], // message-waiting, discard
  [0xe0, 'ucs2'], // message-waiting, store UCS2
  [0xf0, 'gsm7'], // data coding / message class, default alphabet
  [0xf4, '8bit'], // data coding / message class, 8-bit
] as [number, string][]) {
  eq(`alphabetOf 0x${dcs.toString(16).padStart(2, '0')}`, alphabetOf(dcs), want)
}

// 10. An 8-bit DELIVER yields no text at all — just the raw payload.
const binary = decodePdu('000404810808' + '00' + '04' + '20806291731400' + '04' + 'DEADBEEF')
eq('binary.encoding', binary.type === 'deliver' && binary.encoding, '8bit')
eq('binary.text', binary.type === 'deliver' && binary.text, '')
eq('binary.dataHex', binary.type === 'deliver' && binary.dataHex, 'DEADBEEF')
eq('gsm7.encoding', decodedParts[0].type === 'deliver' && decodedParts[0].encoding, 'gsm7')

// 11. Concatenated UCS2 — the non-GSM-7 branch also has to skip the UDH.
const ucs2Text = 'Salamat po sa inyong tulong ❤ — nakatanggap na po kami ng abiso. '.repeat(3)
const ucs2Parts = encodeSubmit('+639171234567', ucs2Text)
eq('ucs2.multipart', ucs2Parts.length > 1, true)
eq(
  'ucs2.concat text',
  ucs2Parts
    .map((p) => decodePdu('0044' + '0C91361917325476' + '00' + p.pdu.slice(24, 26) + '20806291731400' + p.pdu.slice(28)))
    .map((d) => (d.type === 'deliver' ? d.text : ''))
    .join(''),
  ucs2Text,
)

// 12. ConcatBuffer: two senders reusing the same 8-bit reference must not merge.
const buf = new ConcatBuffer()
eq('concat.a part1 incomplete', buf.add(7, 1, 2, 'GLOBE', 'AAA', null, 1, 0), null)
eq('concat.b part1 incomplete', buf.add(7, 1, 2, 'SMART', 'BBB', null, 2, 0), null)
eq('concat.pending both', buf.pending, 2)
eq('concat.a joined', buf.add(7, 2, 2, 'GLOBE', 'aaa', null, 3, 0)?.text, 'AAAaaa')
eq('concat.b joined', buf.add(7, 2, 2, 'SMART', 'bbb', null, 4, 0)?.text, 'BBBbbb')
eq('concat.drained', buf.pending, 0)

// Re-reading the same fragment (restart, or the poll after it was held back)
// must not duplicate it or double-count towards `total`.
const idem = new ConcatBuffer()
eq('concat.idem first', idem.add(9, 1, 2, 'GLOBE', 'X', null, 5, 0), null)
eq('concat.idem repeat', idem.add(9, 1, 2, 'GLOBE', 'X', null, 5, 0), null)
const idemDone = idem.add(9, 2, 2, 'GLOBE', 'Y', null, 6, 0)
eq('concat.idem text', idemDone?.text, 'XY')
eq('concat.idem slots', idemDone?.indexes.join(','), '5,6')

// A segment that never arrives must not pin the entry (or its modem slot) forever.
const stale = new ConcatBuffer()
stale.add(3, 1, 3, 'GLOBE', 'first ', null, 10, 0)
eq('concat.ttl not yet', stale.expire(CONCAT_TTL_MS - 1).length, 0)
const expired = stale.expire(CONCAT_TTL_MS)
eq('concat.ttl fires', expired.length, 1)
eq('concat.ttl partial', expired[0].complete, false)
eq('concat.ttl text', expired[0].text, 'first ')
eq('concat.ttl frees slot', expired[0].indexes.join(','), '10')
eq('concat.ttl drained', stale.pending, 0)

console.log(`\nPDU self-test: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
