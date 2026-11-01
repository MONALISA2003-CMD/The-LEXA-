import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBackupKey, encryptBackupPayload, decryptBackupPayload } from '../src/platform/backup-crypto.ts';
const key=Buffer.alloc(32,7);
test('AES-256-GCM backup payload round-trips with a versioned header',()=>{const source=Buffer.from('LEXA backup fixture');const encrypted=encryptBackupPayload(source,key);assert.notDeepEqual(encrypted,source);assert.equal(decryptBackupPayload(encrypted,key).toString(),source.toString());});
test('AES-256-GCM backup payload detects tampering',()=>{const encrypted=encryptBackupPayload(Buffer.from('data'),key);encrypted[encrypted.length-1]^=1;assert.throws(()=>decryptBackupPayload(encrypted,key));});
test('backup key rejects missing and invalid-length values',()=>{assert.throws(()=>decodeBackupKey(undefined),/required/);assert.throws(()=>decodeBackupKey(Buffer.from('short').toString('base64')),/32 bytes/);});
