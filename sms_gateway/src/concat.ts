/**
 * Reassembly buffer for multi-part inbound SMS.
 *
 * Fragments arrive as independent PDUs carrying a concatenation header
 * (reference, total, sequence). They can arrive out of order, interleaved with
 * other senders' fragments, or not at all.
 */

/** How long to hold an incomplete multi-part SMS before giving up on the rest. */
export const CONCAT_TTL_MS = 10 * 60_000

interface ConcatEntry {
  total: number
  parts: Map<number, string>
  /** Modem storage slots holding the fragments; freed once the message is whole. */
  indexes: Set<number>
  sender: string
  timestamp: string | null
  firstSeen: number
}

/** A multi-part SMS that is ready to hand to the portal. */
export interface Assembled {
  sender: string
  text: string
  timestamp: string | null
  indexes: number[]
  /** False when the TTL expired and some segments never turned up. */
  complete: boolean
  have: number
  total: number
}

export class ConcatBuffer {
  private store = new Map<string, ConcatEntry>()

  /**
   * Keyed by sender *and* reference. The concatenation reference is only 8 bits
   * and only unique per sender, so keying on it alone lets two shortcodes
   * texting at the same time splice their fragments into one another.
   */
  private key(sender: string, ref: number): string {
    return `${sender} ${ref}`
  }

  add(
    ref: number,
    seq: number,
    total: number,
    sender: string,
    text: string,
    timestamp: string | null,
    index: number,
    now: number,
  ): Assembled | null {
    const key = this.key(sender, ref)
    let entry = this.store.get(key)
    if (!entry) {
      entry = { total, parts: new Map(), indexes: new Set(), sender, timestamp, firstSeen: now }
      this.store.set(key, entry)
    }
    // Re-reading an already-buffered fragment (the poll after a fragment was
    // held back, or a restart) must be idempotent — hence the map and the set.
    entry.parts.set(seq, text)
    entry.indexes.add(index)
    if (entry.parts.size < entry.total) return null
    this.store.delete(key)
    return this.assemble(entry, true)
  }

  /** Flush entries whose missing segments never arrived. */
  expire(now: number): Assembled[] {
    const out: Assembled[] = []
    for (const [key, entry] of this.store) {
      if (now - entry.firstSeen < CONCAT_TTL_MS) continue
      this.store.delete(key)
      out.push(this.assemble(entry, false))
    }
    return out
  }

  /** Number of messages still waiting on segments — for tests and diagnostics. */
  get pending(): number {
    return this.store.size
  }

  private assemble(entry: ConcatEntry, complete: boolean): Assembled {
    return {
      sender: entry.sender,
      text: Array.from({ length: entry.total }, (_, i) => entry.parts.get(i + 1) ?? '').join(''),
      timestamp: entry.timestamp,
      indexes: Array.from(entry.indexes),
      complete,
      have: entry.parts.size,
      total: entry.total,
    }
  }
}
