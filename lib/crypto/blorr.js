/*!
 * schnorr.js - schnorr signatures for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

var assert = require('assert');
var elliptic = require('elliptic');
var Signature = require('elliptic/lib/elliptic/ec/signature');
var BN = require('bn.js');
var HmacDRBG = require('./hmac-drbg');
const sha256 = require('./digest').sha256;
var secp256k1 = elliptic.ec('secp256k1');
var curve = secp256k1.curve;
var curves = elliptic.curves;
var hash = curves.secp256k1.hash;
var POOL64 = Buffer.allocUnsafe(64);

/**
 * @exports crypto/schnorr
 */

var schnorr = exports;

/**
 * Hash (r | M).
 * @param {Buffer} msg
 * @param {BN} r
 * @returns {Buffer}
 */

schnorr.hash = function _hash(msg, r) {
  console.log(r);
  var R = r.toArrayLike(Buffer, 'be', 32);
  var B = POOL64;

  R.copy(B, 0);
  msg.copy(B, 32);

  return new BN(sha256(B));
};

/**
 * Sign message.
 * @private
 * @param {Buffer} msg
 * @param {BN} priv
 * @param {BN} k
 * @param {Buffer} pn
 * @returns {Signature|null}
 */

schnorr.trySign = function trySign(msg, prv, k, pn) {
  var r, pn, h, s;

  if (prv.cmpn(0) === 0) throw new Error('Bad private key.');

  if (prv.cmp(curve.n) >= 0) throw new Error('Bad private key.');

  if (k.cmpn(0) === 0) return null;

  if (k.cmp(curve.n) >= 0) return null;

  r = curve.g.mul(k);

  if (pn) r = r.add(pn);

  if (r.y.isOdd()) {
    k = k.umod(curve.n);
    k = curve.n.sub(k);
  }

  h = schnorr.hash(msg, r.getX());

  if (h.cmpn(0) === 0) return null;

  if (h.cmp(curve.n) >= 0) return null;

  s = h.imul(prv);
  s = k.isub(s);
  s = s.umod(curve.n);

  if (s.cmpn(0) === 0) return null;

  return new Signature({ r: r.getX(), s: s });
};

/**
 * Sign message.
 * @param {Buffer} msg
 * @param {Buffer} key
 * @param {Buffer} pubNonce
 * @returns {Signature}
 */

schnorr.sign = function sign(msg, key, pubNonce) {
  var prv = new BN(key);
  var drbg = schnorr.drbg(msg, key, pubNonce);
  var len = curve.n.byteLength();
  var k, pn, sig;

  if (pubNonce) pn = curve.decodePoint(pubNonce);

  while (!sig) {
    k = new BN(drbg.generate(len));
    sig = schnorr.trySign(msg, prv, k, pn);
  }

  return sig;
};

/**
 * Verify signature.
 * @param {Buffer} msg
 * @param {Buffer} signature
 * @param {Buffer} key
 * @returns {Buffer}
 */

schnorr.verify = function verify(msg, signature, key) {
  var sig = new Signature(signature);
  var h = schnorr.hash(msg, sig.r);
  var k, l, r, rl;

  if (h.cmp(curve.n) >= 0) throw new Error('Invalid hash.');

  if (h.cmpn(0) === 0) throw new Error('Invalid hash.');

  if (sig.s.cmp(curve.n) >= 0) throw new Error('Invalid S value.');

  if (sig.r.cmp(curve.p) > 0) throw new Error('Invalid R value.');

  k = curve.decodePoint(key);
  l = k.mul(h);
  r = curve.g.mul(sig.s);
  rl = l.add(r);

  if (rl.y.isOdd()) throw new Error('Odd R value.');

  return rl.getX().cmp(sig.r) === 0;
};

/**
 * Recover public key.
 * @param {Buffer} msg
 * @param {Buffer} signature
 * @returns {Buffer}
 */

schnorr.recover = function recover(signature, msg) {
  var sig = new Signature(signature);
  var h = schnorr.hash(msg, sig.r);
  var hinv, s, R, l, r, k, rl;

  if (h.cmp(curve.n) >= 0) throw new Error('Invalid hash.');

  if (h.cmpn(0) === 0) throw new Error('Invalid hash.');

  if (sig.s.cmp(curve.n) >= 0) throw new Error('Invalid S value.');

  if (sig.r.cmp(curve.p) > 0) throw new Error('Invalid R value.');

  hinv = h.invm(curve.n);
  hinv = hinv.umod(curve.n);

  s = sig.s;
  s = curve.n.sub(s);
  s = s.umod(curve.n);

  s = s.imul(hinv);
  s = s.umod(curve.n);

  R = curve.pointFromX(sig.r, false);
  l = R.mul(hinv);
  r = curve.g.mul(s);
  k = l.add(r);

  l = k.mul(h);
  r = curve.g.mul(sig.s);
  rl = l.add(r);

  if (rl.y.isOdd()) throw new Error('Odd R value.');

  if (rl.getX().cmp(sig.r) !== 0) throw new Error('Could not recover pubkey.');

  return Buffer.from(k.encode('array', true));
};

/**
 * Combine signatures.
 * @param {Buffer[]} sigs
 * @returns {Signature}
 */

schnorr.combineSigs = function combineSigs(sigs) {
  var s = new BN(0);
  var i, r, sig, last;

  for (i = 0; i < sigs.length; i++) {
    sig = new Signature(sigs[i]);

    if (sig.s.cmpn(0) === 0) throw new Error('Bad S value.');

    if (sig.s.cmp(curve.n) >= 0) throw new Error('Bad S value.');

    if (!r) r = sig.r;

    if (last && last.r.cmp(sig.r) !== 0) throw new Error('Bad signature combination.');

    s = s.iadd(sig.s);
    s = s.umod(curve.n);

    last = sig;
  }

  if (s.cmpn(0) === 0) throw new Error('Bad combined signature.');

  return new Signature({ r: r, s: s });
};

/**
 * Combine public keys.
 * @param {Buffer[]} keys
 * @returns {Buffer}
 */

schnorr.combineKeys = function combineKeys(keys) {
  var i, key, point;

  if (keys.length === 0) throw new Error();

  if (keys.length === 1) return keys[0];

  point = curve.decodePoint(keys[0]);

  for (i = 1; i < keys.length; i++) {
    key = curve.decodePoint(keys[i]);
    point = point.add(key);
  }

  return Buffer.from(point.encode('array', true));
};

/**
 * Partially sign.
 * @param {Buffer} msg
 * @param {Buffer} priv
 * @param {Buffer} privNonce
 * @param {Buffer} pubNonce
 * @returns {Buffer}
 */

schnorr.partialSign = function partialSign(msg, priv, privNonce, pubNonce) {
  var prv = new BN(priv);
  var k = new BN(privNonce);
  var pn = curve.decodePoint(pubNonce);
  var sig = schnorr.trySign(msg, prv, k, pn);

  if (!sig) throw new Error('Bad K value.');

  return sig;
};

/**
 * Schnorr personalization string.
 * @const {Buffer}
 */

schnorr.alg = Buffer.from('Schnorr+SHA256  ', 'ascii');

/**
 * Instantiate an HMAC-DRBG.
 * @param {Buffer} msg
 * @param {Buffer} priv
 * @param {Buffer} data
 * @returns {HmacDRBG}
 */

schnorr.drbg = function drbg(msg, priv, data) {
  var pers = Buffer.allocUnsafe(48);

  pers.fill(0);

  if (data) {
    console.log('data length: ' + data.length);
    assert(data.length === 32);
    data.copy(pers, 0);
  }

  schnorr.alg.copy(pers, 32);

  return new HmacDRBG(priv, msg, pers);
};

schnorr.toArrayBuffer = function toArrayBuffer(buf) {
  var ab = new ArrayBuffer(buf.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buf.length; ++i) {
    view[i] = buf[i];
  }
  return ab;
};

/**
 * Generate pub+priv nonce pair (non buffer).
 * @param {Buffer} msg
 * @param {Buffer} priv
 * @param {Buffer} data
 * @returns {Object}
 */

schnorr.generateNoncePair = function generateNoncePair(msg, priv, data) {
  var drbg = schnorr.drbg(msg, priv, data);
  var len = curve.n.byteLength();
  var k;
  var res;

  for (;;) {
    k = new BN(drbg.generate(len));

    if (k.cmpn(0) === 0) continue;

    if (k.cmp(curve.n) >= 0) continue;

    break;
  }

  res = Buffer.from(curve.g.mul(k).encode('array', true));
  console.log(schnorr.toArrayBuffer(res));
  return res;
};

/**
 * Generate pub+priv nonce Object.
 * @param {Buffer} msg
 * @param {Buffer} priv
 * @param {Buffer} data
 * @returns {Object}
 */

schnorr.generateNonceObject = function generateNoncePair(msg, priv, data) {
  var drbg = schnorr.drbg(msg, priv, data);
  var len = curve.n.byteLength();
  var k;
  var res;

  for (;;) {
    k = new BN(drbg.generate(len));

    if (k.cmpn(0) === 0) continue;

    if (k.cmp(curve.n) >= 0) continue;

    break;
  }

  res = curve.g.mul(k);
  return {
    r: res.getX(),
    s: res.getY()
  };
};