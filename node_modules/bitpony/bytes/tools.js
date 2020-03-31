var Uint64LE = require("int64-buffer").Uint64LE;
var crypto = require('crypto');

var coreTools = {};

coreTools.littleEndian = function (num, longlong) {
    if (!longlong) {
        var buf = Buffer.alloc(4);
        buf.writeUInt32LE(num, 0, true);
        return buf;
    } else {
        var big = new Uint64LE(num);
        return big.toBuffer();
    }
}

coreTools.fromLittleEndian = function (buff, longlong) {
    if (!longlong) {
        return buff.readUInt32LE(0, true);
    } else {
        var big = new Uint64LE(buff);
        return big.toNumber(10);
    }
}

coreTools.numHex = function (s) {
    var a = s.toString(16);
    if ((a.length % 2) > 0) {
        a = "0" + a;
    }
    return a;
}

coreTools.reverseBuffer = function (buff) {
    var out_rev = Buffer.alloc(buff.length), i = 0
    for (; i < buff.length; i++) {
        out_rev[buff.length - 1 - i] = buff[i];
    }

    return out_rev;
}

coreTools.ipv4toLong = function (string) {//todo ipv6
    var octet = '([01]?[0-9]?[0-9]|2[0-4][0-9]|25[0-5])';
    var ipRegExp = new RegExp('^' + octet + '\.' + octet + '\.' + octet + '\.' + octet + '$');

    var octets = string.match(ipRegExp);
    if (octets === null) {
        throw 'Invalid IPv4 address!';
    } else {

        return ((octets[1] << 24) >>> 0) +
                ((octets[2] << 16) >>> 0) +
                ((octets[3] << 8) >>> 0) +
                (octets[4] << 0);
    }
}

coreTools.buffer2ipv4 = function (buff) {//todo ipv6
    return buff[0] + "." + buff[1] + "." + buff[2] + "." + buff[3]
}

coreTools.sha256 = function (message, output) {
    if (!output)
        output = '';
    return crypto.createHash('sha256').update(message).digest(output);
}

module.exports = coreTools;