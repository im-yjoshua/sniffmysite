/**
 * SSRF hardening tests for the fetcher.
 * - IP classification: private/loopback/link-local/multicast/doc ranges blocked.
 * - validatedEndpoint(): rejects private literals + hostnames resolving privately.
 * - fetchPage(): end-to-end block against a real local server, redirect chains
 *   landing on private IPs (via stub), redirect limits, body cap, timeout,
 *   content-type gating. Zero external network.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  fetchPage,
  validatedEndpoint,
  extractVisibleText,
  isPublicIp,
  FetchError,
  MAX_BODY_BYTES,
  createPinnedLookup,
  rawGet,
  type RawResponse,
  type ValidatedEndpoint,
} from '../lib/fetch';

async function assertRejectsCode(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof FetchError, `expected FetchError, got ${e}`);
    assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`);
    return;
  }
  assert.fail(`expected rejection with code ${code}, but it resolved`);
}

describe('isPublicIp', () => {
  const blocked = [
    '127.0.0.1', '127.1.2.3', // loopback
    '10.0.0.1', '10.255.0.1', // RFC 1918
    '172.16.0.1', '172.31.255.255', // RFC 1918
    '192.168.1.1', // RFC 1918
    '169.254.169.254', // link-local (cloud metadata endpoint)
    '0.0.0.0', // "this network"
    '100.64.0.1', // CGNAT
    '192.0.2.1', '198.51.100.7', '203.0.113.9', // documentation ranges
    '224.0.0.1', // multicast
    '::1', // v6 loopback
    '::', // v6 unspecified
    'fe80::1', // v6 link-local
    'fc00::1', // v6 unique-local
    'ff02::1', // v6 multicast
    '2001:db8::1', // v6 documentation
    '::ffff:127.0.0.1', // v4-mapped loopback
    '::ffff:10.1.2.3', // v4-mapped private
  ];
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => assert.equal(isPublicIp(ip), false));
  }
  const allowed = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2001:4860:4860::8888'];
  for (const ip of allowed) {
    it(`allows ${ip}`, () => assert.equal(isPublicIp(ip), true));
  }
  it('denies garbage input', () => assert.equal(isPublicIp('not-an-ip'), false));
});

describe('validatedEndpoint', () => {
  it('rejects loopback literal', async () => {
    await assertRejectsCode(validatedEndpoint('http://127.0.0.1:8080/'), 'ssrf_blocked');
  });
  it('rejects localhost (resolves to loopback)', async () => {
    await assertRejectsCode(validatedEndpoint('http://localhost:3000/'), 'ssrf_blocked');
  });
  it('rejects 10/8', async () => {
    await assertRejectsCode(validatedEndpoint('http://10.0.0.1/'), 'ssrf_blocked');
  });
  it('rejects [::1]', async () => {
    await assertRejectsCode(validatedEndpoint('http://[::1]:8080/'), 'ssrf_blocked');
  });
  it('rejects link-local 169.254.169.254', async () => {
    await assertRejectsCode(validatedEndpoint('http://169.254.169.254/latest/meta-data/'), 'ssrf_blocked');
  });
  it('rejects non-http schemes', async () => {
    await assertRejectsCode(validatedEndpoint('ftp://example.com/'), 'invalid_url');
    await assertRejectsCode(validatedEndpoint('file:///etc/passwd'), 'invalid_url');
  });
  it('rejects credentialed URLs', async () => {
    await assertRejectsCode(validatedEndpoint('http://user:pass@8.8.8.8/'), 'invalid_url');
  });
  it('rejects malformed / empty URLs', async () => {
    await assertRejectsCode(validatedEndpoint(''), 'invalid_url');
    await assertRejectsCode(validatedEndpoint('not a url'), 'invalid_url');
  });
  it('accepts a public IP literal without DNS', async () => {
    const ep = await validatedEndpoint('http://8.8.8.8/');
    assert.equal(ep.ip, '8.8.8.8');
    assert.equal(ep.family, 4);
  });
});

describe('fetchPage', () => {
  let server: Server;
  let port: number;

  before(
    () =>
      new Promise<void>((resolve) => {
        server = createServer((_req, res) => {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end('<html><body><p>Hello</p></body></html>');
        });
        server.listen(0, '127.0.0.1', () => {
          port = (server.address() as AddressInfo).port;
          resolve();
        });
      }),
  );
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('refuses to fetch a local server end-to-end (127.0.0.1)', async () => {
    await assertRejectsCode(fetchPage(`http://127.0.0.1:${port}/`), 'ssrf_blocked');
  });

  it('refuses localhost end-to-end', async () => {
    await assertRejectsCode(fetchPage(`http://localhost:${port}/`), 'ssrf_blocked');
  });

  const okBody = (html: string, contentType = 'text/html; charset=utf-8'): RawResponse => ({
    status: 200,
    headers: { 'content-type': contentType },
    body: Buffer.from(html, 'utf8'),
  });

  it('follows a same-host redirect and re-validates', async () => {
    const page = await fetchPage('http://8.8.8.8/start', {
      stub: async (url) => {
        if (url.pathname === '/start') {
          return { status: 302, headers: { location: '/landing' }, body: Buffer.alloc(0) };
        }
        return okBody('<html><head><title>T</title></head><body><p>landed</p><p>The redirect worked and this landing page has plenty of readable copy for the scanner to chew on, well past the empty-page guard.</p></body></html>');
      },
    });
    assert.equal(page.finalUrl, 'http://8.8.8.8/landing');
    assert.ok(page.text.includes('landed'));
  });

  it('blocks a redirect chain that lands on a private IP', async () => {
    await assertRejectsCode(
      fetchPage('http://8.8.8.8/start', {
        stub: async (url) => {
          if (url.pathname === '/start') {
            return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' }, body: Buffer.alloc(0) };
          }
          return okBody('<html><body>should never load</body></html>');
        },
      }),
      'ssrf_blocked',
    );
  });

  it('blocks a redirect to localhost', async () => {
    await assertRejectsCode(
      fetchPage('http://8.8.8.8/start', {
        stub: async (url) => {
          if (url.pathname === '/start') {
            return { status: 301, headers: { location: 'http://localhost:9000/admin' }, body: Buffer.alloc(0) };
          }
          return okBody('<html><body>nope</body></html>');
        },
      }),
      'ssrf_blocked',
    );
  });

  it('enforces the 3-redirect limit', async () => {
    await assertRejectsCode(
      fetchPage('http://8.8.8.8/r0', {
        stub: async (url) => {
          const n = Number(url.pathname.replace('/r', '')) + 1;
          return { status: 302, headers: { location: `/r${n}` }, body: Buffer.alloc(0) };
        },
      }),
      'too_many_redirects',
    );
  });

  it('aborts past the 2MB body cap', async () => {
    await assertRejectsCode(
      fetchPage('http://8.8.8.8/big', {
        stub: async () => okBody(`<html><body>${'x'.repeat(MAX_BODY_BYTES + 1)}</body></html>`),
      }),
      'body_too_large',
    );
  });

  it('times out on a hanging upstream', async () => {
    await assertRejectsCode(
      fetchPage('http://8.8.8.8/hang', {
        timeoutMs: 50,
        stub: async () => new Promise<RawResponse>(() => {}), // never resolves
      }),
      'timeout',
    );
  });

  it('refuses non-HTML content types', async () => {
    await assertRejectsCode(
      fetchPage('http://8.8.8.8/doc.pdf', {
        stub: async () => okBody('%PDF-1.4 fake', 'application/pdf'),
      }),
      'unsupported_content_type',
    );
  });

  it('extracts text, title and links from a stubbed page', async () => {
    const page = await fetchPage('http://8.8.8.8/', {
      stub: async () =>
        okBody(`<html><head><title>Acme</title></head><body>
          <nav><a href="/pricing">Pricing</a></nav>
          <script>var x = 1;</script>
          <h1>Hello world</h1>
          <p>Acme builds wonderful widgets for wonderful people. Our platform is the best platform for platforms, trusted by teams everywhere who love shipping.</p>
          <footer>\u00a9 2026 Acme</footer>
        </body></html>`),
    });
    assert.equal(page.title, 'Acme');
    assert.ok(page.text.includes('Hello world'));
    assert.ok(!page.text.includes('var x = 1'), 'scripts must be stripped');
    assert.ok(page.text.includes('2026'), 'footer (© year) must survive');
    assert.ok(page.links.some((l) => l.href === 'http://8.8.8.8/pricing'));
  });
});

describe('extractVisibleText', () => {
  it('strips scripts, styles and nav but keeps footer', () => {
    const t = extractVisibleText(`<html><body>
      <nav><a href="/">Home</a></nav>
      <style>.x{color:red}</style>
      <script>alert(1)</script>
      <p>Keep me</p>
      <footer>Footer kept</footer>
    </body></html>`);
    assert.ok(t.includes('Keep me'));
    assert.ok(t.includes('Footer kept'));
    assert.ok(!t.includes('alert(1)'));
    assert.ok(!t.includes('.x{color:red}'));
  });
});

describe('createPinnedLookup', () => {
  const ep: ValidatedEndpoint = {
    url: new URL('http://93.184.216.34/'),
    ip: '93.184.216.34',
    family: 4,
  };
  type LooseLookup = (
    h: string,
    o: { all?: boolean },
    cb: (err: unknown, a: unknown, f: unknown) => void,
  ) => void;
  const lookup = createPinnedLookup(ep) as LooseLookup;

  it('answers the classic lookup shape with a single address', async () => {
    const [address, family] = await new Promise<[unknown, unknown]>((resolve, reject) => {
      lookup('example.com', {}, (err, a, f) => (err ? reject(err) : resolve([a, f])));
    });
    assert.equal(address, '93.184.216.34');
    assert.equal(family, 4);
  });

  it('answers { all: true } with an address ARRAY (Node Happy Eyeballs)', async () => {
    // Regression: Node ≥20 calls custom lookups with { all: true } and
    // expects [{ address, family }]. A bare string made Node iterate the
    // string's characters and fail with
    // "ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined".
    const addrs = await new Promise<unknown>((resolve, reject) => {
      lookup('example.com', { all: true }, (err, a) => (err ? reject(err) : resolve(a)));
    });
    assert.deepEqual(addrs, [{ address: '93.184.216.34', family: 4 }]);
  });
});

describe('rawGet transport (regression: ERR_INVALID_IP_ADDRESS)', () => {
  let server: Server;
  let port: number;

  before(
    () =>
      new Promise<void>((resolve) => {
        server = createServer((_req, res) => {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end('<html><body>pinned-transport-ok</body></html>');
        });
        server.listen(0, '127.0.0.1', () => {
          port = (server.address() as AddressInfo).port;
          resolve();
        });
      }),
  );
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('reaches a server through the REAL pinned-lookup transport', async () => {
    // Bypass validatedEndpoint on purpose: the SSRF guard (tested above)
    // correctly refuses loopback. This test targets the TRANSPORT — the
    // pinned custom lookup that Node invokes with { all: true }.
    const ep: ValidatedEndpoint = {
      url: new URL(`http://127.0.0.1:${port}/`),
      ip: '127.0.0.1',
      family: 4,
    };
    const res = await rawGet(ep, new AbortController().signal);
    assert.equal(res.status, 200);
    assert.match(res.body.toString('utf8'), /pinned-transport-ok/);
  });
});
