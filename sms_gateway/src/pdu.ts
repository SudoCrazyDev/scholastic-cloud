/**
 * Minimal GSM 03.40 / 03.38 PDU codec for SMS SUBMIT (outbound), and DELIVER +
 * STATUS-REPORT decoding (inbound / delivery receipts).
 *
 * Scope + limitations (deliberate, for a school-notification gateway):
 *  - SUBMIT supports GSM-7 and UCS2, with concatenation via UDH for long text.
 *  - DELIVER decoding handles single-part and reports UDH concat info so the
 *    caller can reassemble; the agent buffers fragments by (ref).
 *  - No compression, no non-default national language shift tables.
 */

// ── GSM 7-bit default alphabet ──────────────────────────────────────────────
const BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

const EXT: Record<string, number> = {
  '\f': 0x0a, '^': 0x14, '{': 0x28, '}': 0x29, '\\': 0x2f,
  '[': 0x3c, '~': 0x3d, ']': 0x3e, '|': 0x40, '€': 0x65,
}
const EXT_REV: Record<number, string> = Object.fromEntries(
  Object.entries(EXT).map(([k, v]) => [v, k]),
)

const BASIC_INDEX: Record<string, number> = {}
for (let i = 0; i < BASIC.length; i++) BASIC_INDEX[BASIC[i]] = i

export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (BASIC_INDEX[ch] === undefined && EXT[ch] === undefined) return false
  }
  return true
}

/** Convert text to a septet stream (ESC 0x1B prefixes extended chars). */
function toSeptets(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    if (BASIC_INDEX[ch] !== undefined) {
      out.push(BASIC_INDEX[ch])
    } else if (EXT[ch] !== undefined) {
      out.push(0x1b, EXT[ch])
    } else {
      out.push(BASIC_INDEX['?']) // unmappable → '?'
    }
  }
  return out
}

/** Pack septets into octets, optionally shifted by `fillBits` (for UDH alignment). */
function pack7bit(septets: number[], fillBits = 0): Buffer {
  const bits: number[] = new Array(fillBits).fill(0)
  for (const s of septets) {
    for (let b = 0; b < 7; b++) bits.push((s >> b) & 1)
  }
  while (bits.length % 8 !== 0) bits.push(0)
  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let b = 0; b < 8; b++) v |= bits[i + b] << b
    bytes.push(v)
  }
  return Buffer.from(bytes)
}

/** Unpack octets to septets. `septetCount` counts real chars; `fillBits` skips UDH alignment. */
function unpack7bit(buf: Buffer, septetCount: number, fillBits = 0): number[] {
  const bits: number[] = []
  for (const byte of buf) {
    for (let b = 0; b < 8; b++) bits.push((byte >> b) & 1)
  }
  const start = fillBits
  const out: number[] = []
  for (let i = 0; i < septetCount; i++) {
    let v = 0
    for (let b = 0; b < 7; b++) {
      const idx = start + i * 7 + b
      if (idx < bits.length) v |= bits[idx] << b
    }
    out.push(v)
  }
  return out
}

function septetsToText(septets: number[]): string {
  let out = ''
  for (let i = 0; i < septets.length; i++) {
    const s = septets[i]
    if (s === 0x1b) {
      const next = septets[++i]
      out += EXT_REV[next] ?? ' '
    } else {
      out += BASIC[s] ?? ''
    }
  }
  return out
}

// ── Address (phone number) encoding ─────────────────────────────────────────
function encodeAddress(raw: string): string {
  let intl = false
  let digits = raw.trim()
  if (digits.startsWith('+')) {
    intl = true
    digits = digits.slice(1)
  }
  digits = digits.replace(/\D/g, '')
  const toa = intl ? 0x91 : 0x81
  let swapped = ''
  for (let i = 0; i < digits.length; i += 2) {
    const a = digits[i]
    const b = digits[i + 1] ?? 'F'
    swapped += b + a
  }
  const len = digits.length // length in digits (semi-octets)
  return hex(len) + hex(toa) + swapped.toUpperCase()
}

function decodeAddress(len: number, toa: number, body: string): string {
  // TON=101 (alphanumeric): the address value is GSM-7 packed text, not BCD.
  // Carrier shortcodes and promo senders ("GLOBE", "SMART") arrive this way;
  // nibble-swapping them yields hex mush like "8381E060".
  if ((toa & 0x70) === 0x50) {
    const buf = Buffer.from(body, 'hex')
    // `len` counts useful semi-octets; 4 bits per semi-octet, 7 bits per char.
    const septets = unpack7bit(buf, Math.floor((len * 4) / 7))
    // A 7-character sender packs into exactly 7 octets — the same as an 8-character
    // one — so the count above cannot tell them apart and hands back one septet of
    // padding. Padding bits are zero and 0x00 is '@', which never ends a real sender
    // ID, so a trailing NUL is padding rather than text: "GLOBEPH@" -> "GLOBEPH".
    while (septets.length > 1 && septets[septets.length - 1] === 0) septets.pop()
    return septetsToText(septets)
  }
  let digits = ''
  for (let i = 0; i < body.length; i += 2) {
    digits += body[i + 1] + body[i]
  }
  digits = digits.slice(0, len).replace(/f/gi, '')
  return (toa & 0x70) === 0x10 ? '+' + digits : digits
}

// ── helpers ─────────────────────────────────────────────────────────────────
function hex(n: number): string {
  return n.toString(16).padStart(2, '0').toUpperCase()
}

export interface SubmitPart {
  /** Full PDU hex (SMSC length prefix `00` + TPDU). */
  pdu: string
  /** TPDU length in octets — the number AT+CMGS expects. */
  tpduLength: number
}

let concatRef = Math.floor(Math.random() * 0xffff)

/**
 * Build one or more SUBMIT PDUs for a destination + message. Requests a delivery
 * report (TP-SRR). Long messages are split with a concatenation UDH.
 */
export function encodeSubmit(destination: string, text: string): SubmitPart[] {
  const gsm7 = isGsm7(text)
  const addr = encodeAddress(destination)

  const parts: { udh: Buffer | null; payload: string }[] = []

  if (gsm7) {
    const septets = toSeptets(text)
    if (septets.length <= 160) {
      parts.push({ udh: null, payload: text })
    } else {
      // 153 septets per part (7 reserved for UDH). Split on the source text by re-encoding.
      const chunks = splitGsm7(text, 153)
      const ref = (concatRef = (concatRef + 1) & 0xffff)
      chunks.forEach((chunk, i) => {
        parts.push({ udh: udhConcat(ref, chunks.length, i + 1), payload: chunk })
      })
    }
  } else {
    const units = Array.from(text)
    if (unitsUtf16Length(units) <= 70) {
      parts.push({ udh: null, payload: text })
    } else {
      const chunks = splitUcs2(units, 67)
      const ref = (concatRef = (concatRef + 1) & 0xffff)
      chunks.forEach((chunk, i) => {
        parts.push({ udh: udhConcat(ref, chunks.length, i + 1), payload: chunk })
      })
    }
  }

  return parts.map(({ udh, payload }) => buildSubmitPdu(addr, payload, gsm7, udh))
}

function unitsUtf16Length(units: string[]): number {
  return units.reduce((n, u) => n + (u.codePointAt(0)! > 0xffff ? 2 : 1), 0)
}

function udhConcat(ref: number, total: number, seq: number): Buffer {
  // UDHL=05, IEI=00 (8-bit ref), IEDL=03, ref, total, seq
  return Buffer.from([0x05, 0x00, 0x03, ref & 0xff, total & 0xff, seq & 0xff])
}

function splitGsm7(text: string, maxSeptets: number): string[] {
  const chars = Array.from(text)
  const chunks: string[] = []
  let cur = ''
  let count = 0
  for (const ch of chars) {
    const cost = EXT[ch] !== undefined ? 2 : 1
    if (count + cost > maxSeptets) {
      chunks.push(cur)
      cur = ''
      count = 0
    }
    cur += ch
    count += cost
  }
  if (cur) chunks.push(cur)
  return chunks
}

function splitUcs2(units: string[], maxUnits: number): string[] {
  const chunks: string[] = []
  let cur = ''
  let count = 0
  for (const u of units) {
    const cost = u.codePointAt(0)! > 0xffff ? 2 : 1
    if (count + cost > maxUnits) {
      chunks.push(cur)
      cur = ''
      count = 0
    }
    cur += u
    count += cost
  }
  if (cur) chunks.push(cur)
  return chunks
}

function buildSubmitPdu(addr: string, payload: string, gsm7: boolean, udh: Buffer | null): SubmitPart {
  const udhi = udh ? 0x40 : 0x00
  // TP flags: SMS-SUBMIT (0x01) | Validity-period relative (0x10) | SRR (0x20) | UDHI
  const firstOctet = 0x01 | 0x10 | 0x20 | udhi
  const mr = 0x00 // let the modem assign the reference
  const pid = 0x00
  const dcs = gsm7 ? 0x00 : 0x08
  const vp = 0xaa // ~4 days

  let udl: number
  let udHex: string

  if (gsm7) {
    const septets = toSeptets(payload)
    if (udh) {
      const udhLen = udh.length // includes UDHL byte
      const fillBits = (7 - ((udhLen * 8) % 7)) % 7
      const packed = pack7bit(septets, fillBits)
      const udhSeptets = Math.ceil((udhLen * 8) / 7)
      udl = udhSeptets + septets.length
      udHex = udh.toString('hex').toUpperCase() + packed.toString('hex').toUpperCase()
    } else {
      const packed = pack7bit(septets, 0)
      udl = septets.length
      udHex = packed.toString('hex').toUpperCase()
    }
  } else {
    const textBuf = Buffer.from(payload, 'utf16le').swap16()
    const bodyHex = textBuf.toString('hex').toUpperCase()
    if (udh) {
      udl = udh.length + textBuf.length
      udHex = udh.toString('hex').toUpperCase() + bodyHex
    } else {
      udl = textBuf.length
      udHex = bodyHex
    }
  }

  const tpdu =
    hex(firstOctet) + hex(mr) + addr + hex(pid) + hex(dcs) + hex(vp) + hex(udl) + udHex
  const tpduLength = tpdu.length / 2
  return { pdu: '00' + tpdu, tpduLength }
}

// ── Decoding inbound PDUs (DELIVER) and delivery receipts (STATUS-REPORT) ────
/** Payload alphabet named by TP-DCS. '8bit' is binary, not readable text. */
export type Alphabet = 'gsm7' | 'ucs2' | '8bit'

export interface DecodedDeliver {
  type: 'deliver'
  sender: string
  /** Decoded message. Always empty when `encoding` is '8bit' — see `dataHex`. */
  text: string
  encoding: Alphabet
  /** User data with the UDH stripped, hex — populated for '8bit' only. */
  dataHex: string | null
  timestamp: string | null
  concat: { ref: number; total: number; seq: number } | null
}

/**
 * TP-DCS → payload alphabet (GSM 03.38 §4). Anything we cannot render as text
 * — 8-bit payloads (WAP push, OTA config, voicemail indicators) and compressed
 * data — reports as '8bit' so callers can skip it instead of printing mojibake.
 */
export function alphabetOf(dcs: number): Alphabet {
  if ((dcs & 0xc0) === 0x00) {
    // General data coding: bit 5 = compressed, bits 3-2 = alphabet.
    if (dcs & 0x20) return '8bit' // compressed — unsupported, treat as binary
    const alphabet = (dcs >> 2) & 0x03
    if (alphabet === 0x01) return '8bit'
    if (alphabet === 0x02) return 'ucs2'
    return 'gsm7' // 0b00 default alphabet; 0b11 reserved → best-effort text
  }
  if ((dcs & 0xf0) === 0xe0) return 'ucs2' // message-waiting group, UCS2
  if ((dcs & 0xf0) === 0xf0) return dcs & 0x04 ? '8bit' : 'gsm7' // data coding / message class
  return 'gsm7' // remaining message-waiting + reserved groups are GSM-7
}

export interface DecodedStatus {
  type: 'status'
  reference: number
  recipient: string
  delivered: boolean
  failed: boolean
}

export type DecodedPdu = DecodedDeliver | DecodedStatus

class Reader {
  private pos = 0
  constructor(private hexStr: string) {}
  byte(): number {
    const v = parseInt(this.hexStr.substr(this.pos, 2), 16)
    this.pos += 2
    return v
  }
  take(nBytes: number): string {
    const s = this.hexStr.substr(this.pos, nBytes * 2)
    this.pos += nBytes * 2
    return s
  }
  rest(): string {
    return this.hexStr.substr(this.pos)
  }
}

export function decodePdu(pduHex: string): DecodedPdu {
  const r = new Reader(pduHex.trim().toUpperCase())
  const smscLen = r.byte()
  if (smscLen > 0) r.take(smscLen) // skip SMSC
  const first = r.byte()
  const mti = first & 0x03

  if (mti === 0x02) {
    // STATUS-REPORT
    const reference = r.byte()
    const raLen = r.byte()
    const raToa = r.byte()
    const raBytes = Math.ceil(raLen / 2)
    const recipient = decodeAddress(raLen, raToa, r.take(raBytes))
    r.take(7) // SCTS
    r.take(7) // discharge time
    const status = r.byte()
    return {
      type: 'status',
      reference,
      recipient,
      delivered: status < 0x20,
      failed: status >= 0x40,
    }
  }

  // DELIVER
  const udhi = (first & 0x40) !== 0
  const oaLen = r.byte()
  const oaToa = r.byte()
  const oaBytes = Math.ceil(oaLen / 2)
  const sender = decodeAddress(oaLen, oaToa, r.take(oaBytes))
  r.byte() // PID
  const dcs = r.byte()
  const scts = r.take(7)
  const udl = r.byte()
  const udHex = r.rest()
  const ud = Buffer.from(udHex, 'hex')

  let concat: DecodedDeliver['concat'] = null
  let text = ''
  let dataHex: string | null = null

  const encoding = alphabetOf(dcs)

  // The UDH is a byte-length-prefixed block whatever the alphabet is.
  let udhTotal = 0
  if (udhi && ud.length) {
    const udhl = ud[0]
    concat = parseConcat(ud.subarray(1, 1 + udhl))
    udhTotal = udhl + 1
  }

  if (encoding === 'gsm7') {
    // The septet stream is padded so the text starts on a septet boundary:
    // skipSeptets * 7 == udhTotal * 8 + fillBits. So unpacking from bit 0 and
    // dropping skipSeptets already lands on the first real character —
    // applying the fill bits here as well would shift text by another 1-6 bits.
    const skipSeptets = udhi ? Math.ceil((udhTotal * 8) / 7) : 0
    // When UDH present, udl counts the udh septets too; drop them.
    text = septetsToText(unpack7bit(ud, udl).slice(skipSeptets))
  } else {
    const body = ud.subarray(udhTotal)
    if (encoding === 'ucs2') {
      // swap16 throws on an odd length; a truncated trailing byte is not a char.
      const even = body.subarray(0, body.length - (body.length % 2))
      text = Buffer.from(even).swap16().toString('utf16le')
    } else {
      dataHex = body.toString('hex').toUpperCase()
    }
  }

  return { type: 'deliver', sender, text, encoding, dataHex, timestamp: parseScts(scts), concat }
}

function parseConcat(udh: Buffer): DecodedDeliver['concat'] {
  let i = 0
  while (i + 1 < udh.length) {
    const iei = udh[i]
    const iedl = udh[i + 1]
    const data = udh.subarray(i + 2, i + 2 + iedl)
    if (iei === 0x00 && data.length === 3) {
      return { ref: data[0], total: data[1], seq: data[2] }
    }
    if (iei === 0x08 && data.length === 4) {
      return { ref: (data[0] << 8) | data[1], total: data[2], seq: data[3] }
    }
    i += 2 + iedl
  }
  return null
}

/** SCTS is 7 octets of swapped-nibble BCD: YY MM DD HH MM SS TZ. */
function parseScts(scts: string): string | null {
  if (scts.length < 14) return null
  const p = (i: number) => scts[i + 1] + scts[i]
  const yy = p(0), mm = p(2), dd = p(4), hh = p(6), mi = p(8), ss = p(10)
  const year = 2000 + parseInt(yy, 10)
  return `${year}-${mm}-${dd}T${hh}:${mi}:${ss}`
}
