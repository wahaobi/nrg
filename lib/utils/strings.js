'use strict';

var keccak = require('keccak/js');
var crypto = require('crypto');
var secp256k1 = require('secp256k1');
var uuid = require('node-uuid');
var btoa = require('btoa');
var atob = require('atob');
var avon = require('avon');

var ICAP = require('ethereumjs-icap');

var strings = {

  shortenHash: function (hash, partLength = 4) {
    return hash.slice(0, partLength) + '...' + hash.slice(hash.length - partLength, hash.length);
  },

  ellipsisMiddle: function (text, length = 12, ellipsis = '...') {
    const tl = text.length;
    if (tl <= length) {
      return text;
    }

    const el = ellipsis.length;
    if (tl <= el) {
      return text;
    }

    const sl = length - el;
    const pl = Math.ceil(sl / 2);
    const left = text.slice(0, pl);
    const right = text.slice(-(length - el - pl));
    return `${left}${ellipsis}${right}`;
  },

  isHex: function (str) {
    if (str.length % 2 === 0 && str.match(/^[0-9a-f]+$/i)) return true;
    return false;
  },

  isBase64: function (str) {
    var index;
    if (str.length % 4 > 0 || str.match(/[^0-9a-z+/=]/i)) return false;
    index = str.indexOf('=');
    if (index === -1 || str.slice(index).match(/={1,2}/)) return true;
    return false;
  },

  str2buf: function (str, enc) {
    if (!str || str.constructor !== String) return str;
    if (!enc && strings.isHex(str)) enc = 'hex';
    if (!enc && strings.isBase64(str)) enc = 'base64';
    return Buffer.from(str, enc);
  },

  swapOrder: function (str) {
    var split = str.split('').reverse();
    var x = '';
    for (var i = 0; i < split.length; i += 2) {
      x += split[i + 1] + split[i];
    }
    return x;
  },

  blake2b: function (str) {
    if (str === undefined || str.constructor !== String) {
      return Error('failed to create blake2b of string');
    }
    /// here should set some hard flag for if machine architecture is 64 bit / multi core
    // avon.ALGORITHMS.B  // avon.ALGORITHMS.BP
    return avon.sumBuffer(Buffer.from(str), avon.ALGORITHMS.BP).toString('hex');
  },

  blake2bl: function (str) {
    // blake 2b-light
    if (str === undefined || str.constructor !== String) {
      return Error('failed to create blake2bl of string');
    }
    /// here should set some hard flag for if machine architecture is 64 bit / multi core
    // avon.ALGORITHMS.B  // avon.ALGORITHMS.BP
    return avon.sumBuffer(Buffer.from(str), avon.ALGORITHMS.BP).toString('hex').slice(64, 128);
  },

  blake2bls: function (str) {
    // blake 2b-light, sha1
    if (str === undefined || str.constructor !== String) {
      return Error('failed to create blake2bl of string');
    }
    return avon.sumBuffer(Buffer.from(str), avon.ALGORITHMS.BP).toString('hex').slice(88, 128);
  },

  blake2bBuffer: function (buf) {
    return avon.sumBuffer(buf, avon.ALGORITHMS.B).toString('hex');
  },

  blake2s: function (str) {
    if (str === undefined || str.constructor !== String) {
      return Error('failed to create blake2s of string');
    }
    /// here should set some hard flag for if machine architecture is 64 bit / multi core
    // avon.ALGORITHMS.S  // avon.ALGORITHMS.SP
    return avon.sumBuffer(Buffer.from(str), avon.ALGORITHMS.SP).toString('hex');
  },

  privateKeyToAddress: function (priv) {
    var privateKeyBuffer, publicKey;

    privateKeyBuffer = this.str2buf(priv);

    if (privateKeyBuffer.length < 32) {
      privateKeyBuffer = Buffer.concat([Buffer.alloc(32 - privateKeyBuffer.length, 0), privateKeyBuffer]);
    }
    publicKey = secp256k1.publicKeyCreate(privateKeyBuffer, false).slice(1);
    return '0x' + keccak('keccak256').update(publicKey).digest().slice(-20).toString('hex');
  },

  addressToIcap: function (pub) {
    return ICAP.fromAddress(pub);
  },

  keccak: function (str) {
    if (str === undefined || str.constructor !== String) {
      return Error('failed to create keccak256 of string');
    }
    return keccak('keccak256').update(str).digest('hex');
  },

  doubleSha: function (str) {
    if (str === undefined || str.constructor !== String) {
      return Error('failed to create sha of string');
    }
    return crypto.createHash('sha256').update(crypto.createHash('sha256').update(str).digest('hex')).digest('hex');
  },

  sha: function (str) {
    if (str === undefined || str.constructor !== String) {
      return Error('failed to create sha of string');
    }
    return crypto.createHash('sha1').update(str).digest('hex');
  },

  sha256: function (str) {
    if (str === undefined || str.constructor !== String) {
      return Error('failed to create sha of string');
    }
    return crypto.createHash('sha256').update(str).digest('hex');
  },

  uuid: function () {
    return uuid.v4();
  },

  randomSha: function () {
    return crypto.createHash('sha1').update(uuid.v4()).digest('hex');
  },

  stringToUint: function (string) {
    const encoded = btoa(unescape(encodeURIComponent(string)));
    const charList = encoded.split('');
    const uintArray = [];
    for (var i = 0; i < charList.length; i++) {
      uintArray.push(charList[i].charCodeAt(0));
    }
    return new Uint8Array(uintArray);
  },

  uintToString: function (uintArray) {
    const encodedString = String.fromCharCode.apply(null, uintArray);
    return decodeURIComponent(escape(atob(encodedString)));
  },

  s2hex: function (s) {
    // http://stackoverflow.com/questions/6226189/how-to-convert-a-string-to-bytearray
    var result = '';
    for (var i = 0; i < s.length; i++) {
      var charCode = s.charCodeAt(i);
      var cLen = Math.ceil(Math.log(charCode) / Math.log(256));
      for (var j = 0; j < cLen; j++) {
        var octet = (charCode << j * 8 & 0xFF).toString(16);
        if (octet.length === 1) {
          octet = '0' + octet;
        }
        result += octet;
      }
    }

    return result;
  },

  randomHash: function (howMany, chars) {
    const alphabet = chars || 'abcdefghijklmnopqrstuwxyzABCDEFGHIJKLMNOPQRSTUWXYZ0123456789';
    const rnd = crypto.randomBytes(howMany);
    const value = new Array(howMany);
    const len = alphabet.length;

    for (var i = 0; i < howMany; i++) {
      value[i] = alphabet[rnd[i] % len];
    }

    return value.join('');
  },

  fnv1a: function (v) {
    const n = v.length;
    let a = 2166136261;
    let c;
    let d;
    let i = -1;
    while (++i < n) {
      c = v.charCodeAt(i);
      d = c & 0xff000000;
      if (d) {
        a ^= d >> 24;
        a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
      }
      d = c & 0xff0000;
      if (d) {
        a ^= d >> 16;
        a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
      }
      d = c & 0xff00;
      if (d) {
        a ^= d >> 8;
        a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
      }
      a ^= c & 0xff;
      a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
    }
    a += a << 13;
    a ^= a >> 7;
    a += a << 3;
    a ^= a >> 17;
    a += a << 5;
    return a & 0xffffffff;
  },

  fnv1ab: function (a) {
    a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
    a += a << 13;
    a ^= a >> 7;
    a += a << 3;
    a ^= a >> 17;
    a += a << 5;
    return a & 0xffffffff;
  }
};

module.exports = strings;