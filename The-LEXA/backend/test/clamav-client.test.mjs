import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { scanWithClamAV, InfectedFileError } from '../src/platform/clamav.ts';

async function fakeClamd(response, delay = 0) {
  const server = net.createServer((socket) => {
    let responded = false;
    socket.on('data', (chunk) => {
      if (responded || !chunk.includes(Buffer.from('zINSTREAM\0'))) return;
      responded = true;
      setTimeout(() => socket.end(response), delay);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('ClamAV INSTREAM protocol accepts clean response', async () => {
  const fake = await fakeClamd('stream: OK\0');
  try { await scanWithClamAV(Buffer.from('safe document'), { host: '127.0.0.1', port: fake.port, timeoutMs: 1000 }); }
  finally { await new Promise((resolve) => fake.server.close(resolve)); }
});

test('ClamAV INSTREAM protocol quarantines infected response', async () => {
  const fake = await fakeClamd('stream: Eicar-Test-Signature FOUND\0');
  try {
    await assert.rejects(
      scanWithClamAV(Buffer.from('test signature'), { host: '127.0.0.1', port: fake.port, timeoutMs: 1000 }),
      InfectedFileError,
    );
  } finally { await new Promise((resolve) => fake.server.close(resolve)); }
});

test('ClamAV unavailable and timeout responses fail closed', async () => {
  const fake = await fakeClamd('stream: OK\0', 100);
  try {
    await assert.rejects(scanWithClamAV(Buffer.from('safe'), { host: '127.0.0.1', port: fake.port, timeoutMs: 15 }), /timed out/i);
  } finally { await new Promise((resolve) => fake.server.close(resolve)); }
  const closed = net.createServer();
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const port = closed.address().port;
  await new Promise((resolve) => closed.close(resolve));
  await assert.rejects(scanWithClamAV(Buffer.from('safe'), { host: '127.0.0.1', port, timeoutMs: 200 }), /ECONNREFUSED|connect/i);
});
