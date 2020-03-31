var read = require('../bytes/read')
var readProto = require('../protocol/read')

module.exports = {
    //common types
    uint8: function (buffer) {
        var r = new read(buffer), res = r.uint8(0);
        return res.result;
    },
    uint16: function (buffer) {
        var r = new read(buffer), res = r.uint16(0);
        return res.result;
    },
    uint32: function (buffer) {
        var r = new read(buffer), res = r.uint32(0);
        return res.result;
    },
    uint64: function (buffer) {
        var r = new read(buffer), res = r.uint64(0);
        return res.result;
    },
    //primitives - bitcoin types
    var_int: function (buffer) {
        var r = new read(buffer), res = r.var_int(0);
        return res.result;
    },
    char: function (size, buffer) {
        var r = new read(buffer), res = r.char(size, 0);
        return res.result;
    },
    string: function (buffer) {
        var r = new read(buffer), res = r.string(0);
        return res.result;
    },
    hash: function (buffer) {
        var r = new read(buffer), res = r.hash(0);
        return res.result;
    },
    ip: function (buffer) {
        var r = new read(buffer), res = r.ip(0);
        return res.result;
    },
    tx_in: function (buffer) {
        return readProto.tx_in(buffer)
    },
    tx_out: function (buffer) {
        return readProto.tx_out(buffer)
    },
    tx: function (buffer) {
        return readProto.tx(buffer)
    },
    header: function (buffer) {
        return readProto.block(buffer).header
    },
    block: function (buffer) {
        return readProto.block(buffer)
    },
    //net - bitcoin protocol messages read, only important for me
    net_version: function (buffer) {
        return readProto.version(buffer)
    },
    net_addr: function (buffer) {
        return readProto.addr(buffer)
    },
    net_reject: function (buffer) {
        return readProto.reject(buffer)
    },
    net_headers: function (buffer) {
        return readProto.headers(buffer)
    },
    net_inv: function (buffer) {
        return readProto.inv(buffer)
    },
    //vectors - varint + object[]
    vector_addrs: function (buffer) {
        var r = new read(buffer), res = r.vector_net_addr(0);
        return res.result;
    },
    vector_headers: function (buffer) {
        var r = new read(buffer), res = r.vector_header(0);
        return res.result;
    },
    vector_net_inv: function (buffer) {
        var r = new read(buffer), res = r.vector_header(0);
        return res.result;
    },
    vector_tx_in: function (buffer) {
        var r = new read(buffer), res = r.vector_tx_in(0);
        return res.result;
    },
    vector_tx_out: function (buffer) {
        var r = new read(buffer), res = r.vector_tx_out(0);
        return res.result;
    },
    vector_tx: function (buffer) {
        var r = new read(buffer), res = r.vector_tx(0);
        return res.result;
    },
}