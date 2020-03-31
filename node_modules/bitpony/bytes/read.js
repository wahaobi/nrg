var coreTools = require('./tools');

var coreRead = function (buffer) {
    this.buffer = buffer;
}

/**
 * SIMPLE TYPES
 */

coreRead.prototype.uint8 = function (offset) {
    var count = this.buffer[offset];
    return {
        offset: offset + 1,
        result: count,
        raw: this.buffer[offset],
    }
}


coreRead.prototype.uint16 = function (offset) {
    var b = this.buffer.slice(offset, offset + 2), count = b.readUInt16LE(0, true);
    return {
        offset: offset + 2,
        result: count,
        raw: b,
    }
}

coreRead.prototype.uint32 = function (offset) {
    var b = this.buffer.slice(offset, offset + 4), count = coreTools.fromLittleEndian(b);
    return {
        offset: offset + 4,
        result: count,
        raw: b,
    }
}

coreRead.prototype.uint64 = function (offset) {
    var b = this.buffer.slice(offset, offset + 8), count = coreTools.fromLittleEndian(b, 1);
    return {
        offset: offset + 8,
        result: count,
        raw: b
    }
}


coreRead.prototype.var_int = function (offset) {
    var b, count = 0, o = offset;
    if (this.buffer[offset] == 253) {
        var res = this.uint16(offset + 1);
        count = res.result
        offset = res.offset
    } else if (this.buffer[offset] == 254) {
        var res = this.uint32(offset + 1);
        count = res.result
        offset = res.offset
    } else if (this.buffer[offset] == 255) {
        var res = this.uint64(offset + 1);
        count = res.result
        offset = res.offset
    } else {
        var res = this.uint8(offset);
        count = res.result
        offset = res.offset
    }
    

    return {
        offset: offset,
        result: count,
        raw: res.raw
    }
}

coreRead.prototype.string = function (offset) {
    var str, res = this.var_int(offset);

    str = this.buffer.slice(res.offset, res.offset + res.result);

    return {
        offset: res.offset + res.result,
        length: res.result,
        result: str,
        raw: str,
    }
}

coreRead.prototype.hash = function (offset) {
    var str = this.char(32, offset);

    var hash = coreTools.reverseBuffer(str.result).toString('hex')

    return {
        offset: str.offset,
        length: 32,
        result: hash,
        raw: str,
    }
}


coreRead.prototype.char = function (size, offset) {
    var str = this.buffer.slice(offset, offset + size);

    return {
        offset: offset + size,
        length: str.result,
        result: str,
        raw: str,
    }
}

coreRead.prototype.ip = function (offset) {

    var ipraw = this.char(16, offset);
    var res = coreTools.buffer2ipv4(ipraw.result.slice(12, 16));

    return {
        offset: offset + 16,
        result: res,
        raw: ipraw.result
    }

}

/**
 * PRIMITIVES
 */

coreRead.prototype.net_addr = function (isVersion, offset) {

    var time = -1, res, startoffset = offset;
    if (!isVersion) {

        res = this.uint32(offset);
        time = res.result;
        offset = res.offset;

    }

    res = this.uint64(offset);
    offset = res.offset;
    var services = res.result

    res = this.ip(offset);
    offset = res.offset;

    var ip = res.result;

    res = this.buffer.slice(offset, offset + 2);
    var port = parseInt(res.toString('hex'), 16);
    offset += 2;

    return {
        offset: offset,
        result: {
            ip: ip,
            port: port,
            time: time,
            services: services,
        },
        raw: this.buffer.slice(startoffset, offset)
    }
}

coreRead.prototype.header = function (offset) {
    var blockheader = {}, startoffset = offset, stopoffset = 0;

    var res = this.uint32(offset);
    offset = res.offset;
    blockheader.version = res.result;

    res = this.hash(offset);
    offset = res.offset;
    blockheader.prev_block = res.result;

    res = this.hash(offset);
    offset = res.offset;
    blockheader.merkle_root = res.result;

    var res = this.uint32(offset);
    offset = res.offset;
    blockheader.timestamp = res.result;

    var res = this.uint32(offset);
    offset = res.offset;
    blockheader.bits = res.result;

    var res = this.uint32(offset);
    offset = stopoffset = res.offset;
    blockheader.nonce = res.result;

    var res = this.var_int(offset);
    offset = res.offset;
    blockheader.txn_count = res.result;

    blockheader.hash = coreTools.reverseBuffer(coreTools.sha256(coreTools.sha256(this.buffer.slice(startoffset, stopoffset)))).toString('hex')

    return {
        offset: offset,
        result: blockheader,
        raw: this.buffer.slice(startoffset, offset),
        offsetrawheader: stopoffset
    }

}

coreRead.prototype.header80 = function (offset) {
    var res = this.header(offset);
    res.offset = res.offsetrawheader;
    return res
}

coreRead.prototype.inv = function (offset) {
    var inv = {};

    var res = this.uint32(offset);
    offset = res.offset;
    inv.type = res.result;

    res = this.hash(offset);
    offset = res.offset;
    inv.hash = res.result;

    return {
        offset: offset,
        result: inv,
        raw: ""
    }

}

coreRead.prototype.tx_in = function (offset) {

    var startoffset = offset, res = this.hash(offset), txin = {};
    offset = res.offset;
    txin.hash = res.result;

    res = this.uint32(offset);
    offset = res.offset;
    txin.index = res.result;

    res = this.string(offset);
    offset = res.offset;
    txin.scriptSig = res.result.toString('hex');
    txin.script_len = res.length;

    res = this.uint32(offset);
    offset = res.offset;
    txin.sequence = res.result;

    return {
        offset: offset,
        result: txin,
        raw: this.buffer.slice(startoffset, offset),
        length: offset - startoffset,
    }

}

coreRead.prototype.tx_out = function (offset) {

    var startoffset = offset, txout = {};

    res = this.uint64(offset);
    offset = res.offset;
    txout.amount = res.result;

    res = this.string(offset);
    offset = res.offset;
    txout.scriptPubKey = res.result.toString('hex');
    txout.script_len = res.length;

    return {
        offset: offset,
        result: txout,
        raw: this.buffer.slice(startoffset, offset),
        length: offset - startoffset,
    }

}


coreRead.prototype.tx = function (offset) {
    var tx = {}, startoffset = offset;

    var res = this.uint32(offset);
    offset = res.offset;
    tx.version = res.result;

    res = this.vector_tx_in(offset);
    offset = res.offset;
    tx.in_count = res.length;
    tx.in = res.result;


    res = this.vector_tx_out(offset);
    offset = res.offset;
    tx.out_count = res.length;
    tx.out = res.result;

    res = this.uint32(offset);
    offset = res.offset;
    tx.lock_time = res.result;
    var raw;
    tx.hash = coreTools.reverseBuffer(coreTools.sha256(coreTools.sha256(raw = this.buffer.slice(startoffset, offset)))).toString('hex');
    tx.length = raw.length

    return {
        offset: offset,
        result: tx,
        length: offset - startoffset,
        raw: raw
    }

}

coreRead.prototype.block = function (offset) {

    var block = {}, startoffset = offset;
    var res = this.header(offset);
    offset = res.offsetrawheader;//without number of tx, because its for vector
    block.header = res.result;

    res = this.vector_tx(offset);
    offset = res.offset;

    block.txn_count = res.length;
    block.txns = res.result;


    return {
        offset: offset,
        result: block,
        length: offset - startoffset,
        raw: this.buffer.slice(startoffset, offset)
    }
}

/**
 * VECTORS
 */

coreRead.prototype.vector = function (fnc, offset, params) {
    var count = 0;
    var res = this.var_int(offset);
    offset = res.offset;
    count = res.result;

    var arr = [];
    params = params ? params : [];
    params.push(offset);
    for (var i = 0; i < count; i++) {
        params[params.length - 1] = offset;
        var res = this[fnc].apply(this, params);
        offset = res.offset;
        arr.push(res.result);
    }

    return {
        offset: offset,
        length: count,
        result: arr,
        raw: ""
    }

}

coreRead.prototype.vector_net_addr = function (offset) {
    return this.vector('net_addr', offset, [false]);
}

coreRead.prototype.vector_header = function (offset) {
    return this.vector('header', offset);
}

coreRead.prototype.vector_inv = function (offset) {
    return this.vector('inv', offset);
}

coreRead.prototype.vector_tx_in = function (offset) {
    return this.vector('tx_in', offset);
}

coreRead.prototype.vector_tx_out = function (offset) {
    return this.vector('tx_out', offset);
}

coreRead.prototype.vector_tx = function (offset) {
    var res = this.vector('tx', offset);
    return res
}



module.exports = coreRead