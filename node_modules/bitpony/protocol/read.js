var readStack = require('../stack/read')

var bitcoinMessageRead = function (buffer, script) {
    this.buffer = buffer;
    this.script = script;
    this.result = null;
}

bitcoinMessageRead.prototype.getResult = function (filter) {
    if (!this.result)
        this.result = new readStack(this.buffer, this.script).getResult(filter || {});//after parsing makeup

    return this.result;
}

bitcoinMessageRead.version = function (buffer) {
    var res = new bitcoinMessageRead(buffer, {
        'version': 'uint32',
        'services': 'uint64',
        'timestamp': 'uint64',
        'addr_recv': ['net_addr', true],//with params
        'addr_from': ['net_addr', true],
        'nonce': 'uint64',
        'user_agent': 'string',
        'start_height': 'uint32',
        'relay': 'uint8',
    }).getResult({
        user_agent: function (uabuff) {
            return uabuff.toString();
        },
        addr_recv: function (arr) {
            return arr.ip + ":" + arr.port + "," + arr.services
        },
        addr_from: function (arr) {
            return arr.ip + ":" + arr.port + "," + arr.services
        }
    });
    return res;
}

bitcoinMessageRead.addr = function (buffer) {
    var res = new bitcoinMessageRead(buffer, {
        'addrs': 'vector.net_addr'
    }).getResult();
    return res;
}

bitcoinMessageRead.reject = function (buffer) {
    var res = new bitcoinMessageRead(buffer, {
        'msg': 'string',
        'code': 'uint8',
        'reason': 'string',
    }).getResult();
    return res;
}

bitcoinMessageRead.headers = function (buffer) {
    var res = new bitcoinMessageRead(buffer, {
        'headers': 'vector.header',
    }).getResult();
    return res.headers;

}

bitcoinMessageRead.inv = function (buffer) {
    var res = new bitcoinMessageRead(buffer, {
        'headers': 'vector.inv',
    }).getResult();
    return res.headers;
}

bitcoinMessageRead.tx_in = function (buffer) {
    var res = new bitcoinMessageRead(buffer, {
        'tx_in': 'tx_in',
    }).getResult();
    return res.tx_in;
}

bitcoinMessageRead.tx_out = function (buffer) {
    var res = new bitcoinMessageRead(buffer, {
        'tx_out': 'tx_out',
    }).getResult();
    return res.tx_out;
}

bitcoinMessageRead.tx = function (buffer) {
    var res = new bitcoinMessageRead(buffer, {
        'tx': 'tx',
    }).getResult();
    return res.tx;
}

bitcoinMessageRead.block = function (buffer) {
    var res = new bitcoinMessageRead(buffer, {
        'block': 'block',
    }).getResult();
    return res.block;
}

//todo?

module.exports = bitcoinMessageRead;