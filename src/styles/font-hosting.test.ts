import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8')

describe('fonts are self-hosted (no Google Fonts CDN)', () => {
  it('index.html references no Google Fonts origins', () => {
    const html = read('index.html')
    expect(html).not.toMatch(/fonts\.googleapis\.com/)
    expect(html).not.toMatch(/fonts\.gstatic\.com/)
  })

  it('the CSS font tokens use the Fontsource variable family names', () => {
    for (const file of ['src/index.css', 'src/styles/tokens.css']) {
      const css = read(file)
      expect(css, `${file} should reference "Fraunces Variable"`).toMatch(/Fraunces Variable/)
      expect(css, `${file} should reference "Roboto Serif Variable"`).toMatch(/Roboto Serif Variable/)
    }
  })
})
