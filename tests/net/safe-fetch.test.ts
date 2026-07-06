import { describe, expect, it } from 'vitest'
import { assertSafeUrl } from '@/server/net/safe-fetch'

describe('assertSafeUrl', () => {
  it('accepts public http/https', () => {
    expect(assertSafeUrl('https://feeds.bbci.co.uk/news/business/rss.xml').hostname).toBe('feeds.bbci.co.uk')
    expect(() => assertSafeUrl('http://example.com/feed')).not.toThrow()
  })
  it('rejects non-http(s) schemes', () => {
    for (const u of ['file:///etc/passwd', 'ftp://host/x', 'gopher://host', 'data:text/xml,<rss/>']) {
      expect(() => assertSafeUrl(u)).toThrow()
    }
  })
  it('rejects private / loopback / link-local / metadata hosts', () => {
    for (const u of [
      'http://localhost/f',
      'http://127.0.0.1/f',
      'http://0.0.0.0/f',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.5/f',
      'http://192.168.1.1/f',
      'http://172.16.0.1/f',
      'http://[::1]/f',
      'http://service.local/f',
    ]) {
      expect(() => assertSafeUrl(u)).toThrow()
    }
  })
  it('rejects unparseable input', () => {
    expect(() => assertSafeUrl('not a url')).toThrow()
  })
})
