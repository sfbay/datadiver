import type { VercelRequest, VercelResponse } from '@vercel/node'

// STUB — replaced by the real digest matcher in a later task.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, stub: true })
}
