import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  encodeBase32,decodeBase32,totpAt,validTotpStep,newAuthenticatorSecret,
  encryptAuthenticatorSecret,decryptAuthenticatorSecret,emailCodeDigest,safeBrowserLabel,
  tokenDigest,secretToken,equalDigest,cookieFromHeader,
} from '../src/auth/account-security-crypto.ts';
test('RFC 6238 TOTP validates standard authenticator secret and prevents replay',()=>{
  const secret=encodeBase32(Buffer.from('12345678901234567890'));
  assert.equal(totpAt(secret,1), '287082');
  const timestamp=1*30_000;
  assert.equal(validTotpStep(secret,'287082',timestamp),1);
  assert.equal(validTotpStep(secret,'287082',timestamp,1),null);
  assert.equal(validTotpStep(secret,'000000',timestamp),null);
  assert.equal(decodeBase32(secret).toString(), '12345678901234567890');
});
test('authenticator secrets are authenticated-encrypted with tamper detection',()=>{
  const key=randomBytes(32).toString('base64'); const secret=newAuthenticatorSecret();
  const ciphertext=encryptAuthenticatorSecret(secret,key);
  assert.notEqual(ciphertext.includes(secret),true);
  assert.equal(decryptAuthenticatorSecret(ciphertext,key),secret);
  const parts=ciphertext.split(':');
  parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1); // Corrupt a significant authentication-tag byte, not unused base64 padding bits.
  assert.throws(()=>decryptAuthenticatorSecret(parts.join(':'),key));
});
test('email codes are keyed, high entropy browser credentials are hashed, user agent is sanitized',()=>{
  assert.notEqual(emailCodeDigest('12345678','z'.repeat(32)),emailCodeDigest('12345678','q'.repeat(32)));
  assert.throws(()=>emailCodeDigest('12345678','weak'));
  assert.equal(tokenDigest(secretToken()).length,64);
  assert.equal(equalDigest('123456','123456'),true);
  assert.equal(equalDigest('123456','654321'),false);
  assert.equal(safeBrowserLabel('Mozilla Chrome/123 Windows NT 10.0'),'Chrome on Windows');
  assert.equal(cookieFromHeader('a=b; lexa_device=secret%2Fpart; x=y','lexa_device'),'secret/part');
});
