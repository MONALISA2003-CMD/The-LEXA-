import { Socket } from 'node:net';

export class InfectedFileError extends Error {
  readonly code = 'CLAMAV_INFECTED';
}

export async function scanWithClamAV(data: Buffer, options: { host?: string; port?: number; timeoutMs?: number } = {}): Promise<void> {
  const host = options.host || process.env.CLAMAV_HOST;
  const port = options.port || Number(process.env.CLAMAV_PORT || 3310);
  if (!host) throw new Error('CLAMAV_HOST is required; malware scanning fails closed.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CLAMAV_PORT is invalid.');
  await new Promise<void>((resolve, reject) => {
    const socket = new Socket();
    let response = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve();
    };
    socket.setTimeout(options.timeoutMs || 120_000);
    socket.connect(port, host, () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < data.length; offset += 64 * 1024) {
        const chunk = data.subarray(offset, offset + 64 * 1024);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (response.includes('\0') || response.includes('\n')) {
        if (/: OK/.test(response)) finish();
        else if (/FOUND/.test(response)) finish(new InfectedFileError(`ClamAV detected malware: ${response.slice(0, 200)}`));
        else finish(new Error(`ClamAV scan failed: ${response.slice(0, 200)}`));
      }
    });
    socket.on('timeout', () => finish(new Error('ClamAV scan timed out.')));
    socket.on('error', (error) => finish(error));
    socket.on('close', () => { if (!settled) finish(new Error(`ClamAV connection closed without a scan verdict: ${response.slice(0, 200)}`)); });
  });
}
