var write = require('../bytes/write')
var writeProto = require('../protocol/write')

module.exports = {
    //common types
    uint8: function (value) {
        var r = new write(), res = r.uint8(value, false);
        return res.result;
    },
    uint16: function (value) {
        var r = new write(), res = r.uint16(value, false);
        return res.result;
    },
    uint32: function (value) {
        var r = new write(), res = r.uint32(value, false);
        return res.result;
    },
    uint64: function (value) {
        var r = new write(), res = r.uint64(value, false);
        return res.result;
    },
    //primitives - bitcoin types
    var_int: function (value) {
        var r = new write(), res = r.var_int(value, false);
        return res.result;
    },
    char: function (value) {
        var r = new write(), res = r.char(value, false);
        return res.result;
    },
    string: function (value) {
        var r = new write(), res = r.string(value, false);
        return res.result;
    },
    hash: function (value) {
        var r = new write(), res = r.hash(value, false);
        return res.result;
    },
    ip: function (value) {
        var r = new write(), res = r.ip(value, false);
        return res.result;
    },
    tx_in: function (hash, index, scriptSig, sequence) {
        var r = new write(), res = r.tx_in(hash, index, scriptSig, sequence, false);
        return res.result;
    },
    tx_out: function (amount, scriptPubKey) {
        var r = new write(), res = r.tx_out(amount, scriptPubKey, false);
        return res.result;
    },
    tx: function (version, tx_in, tx_out, lock_time) {
        return writeProto.tx(version, tx_in, tx_out, lock_time);
    },
    header: function (version, prev_block, merkle_root, timestamp, bits, nonce) {
        return writeProto.header(version, prev_block, merkle_root, timestamp, bits, nonce, 0)
    },
    block: function (header, txlist) {
        return writeProto.block(header, txlist)
    },
    //net - bitcoin protocol messages read, only important for me
    net_version: function (protocolVersion, services, timestamp, ipRecv, portRecv, ipFrom, portFrom, nonce, useragent, startBlockHeight, relay) {
        return writeProto.version(protocolVersion, services, timestamp, ipRecv, portRecv, ipFrom, portFrom, nonce, useragent, startBlockHeight, relay)
    },
    net_getheaders: function (version, hashes, stophash) {
        return writeProto.getheaders(version, hashes, stophash)
    },
    //vectors - varint + object[]
    vector_tx_in: function (arr) {
        var r = new write(), res = r.vector_tx_in(arr, false);
        return res.result;
    },
    vector_tx_out: function (arr) {
        var r = new write(), res = r.vector_tx_out(arr, false);
        return res.result;
    },
    vector_tx: function (arr) {
        var r = new write(), res = r.vector_tx(arr, false);
        return res.result;
    },
}