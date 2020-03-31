var coreTools = require('./tools');

var coreWrite = function (buffer) {
    this.buffer = buffer||new Buffer("");
}

coreWrite.prototype.append = function (buff, append) {
    var startlen = this.buffer.length
    if (append)
        this.buffer = Buffer.concat([
            this.buffer,
            buff
        ]);


    return buff;
}

coreWrite.prototype.getBuffer = function () {
    return this.buffer
}

coreWrite.prototype.uint8 = function (value, append) {
    var res = new Buffer(coreTools.numHex(value), 'hex');
    this.append(res, append);
    return {
        length: res.length,
        result: res
    }
}


coreWrite.prototype.uint16 = function (value, append) {
    var res = Buffer.alloc(2);
    res.writeUInt16LE(value, 0, true);
    this.append(res, append);
    return {
        length: res.length,
        result: res
    }
}

coreWrite.prototype.uint32 = function (value, append) {
    var res = coreTools.littleEndian(value);
    this.append(res, append);
    return {
        length: res.length,
        result: res
    }
}

coreWrite.prototype.uint64 = function (value, append) {
    var res = coreTools.littleEndian(value, 1);
    this.append(res, append);

    return {
        length: res.length,
        result: res
    }

}


coreWrite.prototype.var_int = function (value, append) {
    if (value > 0xFFFFFFF) {
        var res = this.uint64(value);
        res = Buffer.concat([
            new Buffer([0xFF]),
            res.result
        ]);

        this.append(res, append);
    } else if (value > 0xFFFF) {
        var res = this.uint32(value);
        res = Buffer.concat([
            new Buffer([0xFE]),
            res.result
        ])
        this.append(res, append);
    } else if (value >= 0xFD) {
        var res = this.uint16(value);
        res = Buffer.concat([
            new Buffer([0xFD]),
            res.result
        ]);
        this.append(res, append);
    } else {
        var res = this.uint8(value);
        res = res.result
        this.append(res, append);
    }

    return {
        result: res,
        length: res.length
    }
}

coreWrite.prototype.string = function (value, append) {
    var buff, res;
    if (typeof value === 'string')
        buff = new Buffer(value);
    else if (value instanceof Buffer)
        buff = value;
    else
        throw new Error("dont know type <" + (typeof value) + ">");
    
    var length = this.var_int(value.length);
    res = Buffer.concat([
        length.result,
        buff
    ]);
    this.append(res, append);

    return {
        result: res,
        length: res.length
    }
}


coreWrite.prototype.char = function (value, append) {
    var buff;
    if (value instanceof String)
        buff = new Buffer(value);
    else if (value instanceof Buffer)
        buff = value;
    else
        throw new Error("dont know type " + (typeof value));

    this.append(buff, append);

    return {
        result: buff,
        length: buff.length
    }
}

coreWrite.prototype.ip = function (ip, append) {
    var res = Buffer.concat([
        new Buffer([0x0, 0x0, 0xFF, 0xFF]),
        new Buffer(Number(coreTools.ipv4toLong(ip)).toString(16), 'hex')
    ]);


    this.append(res, append);

    return {
        result: res,
        length: res.length,
    }

}

coreWrite.prototype.hash = function (hexstring, append) {
    var b = new Buffer(hexstring, 'hex');
    b = coreTools.reverseBuffer(b);
    var res = this.char(b);

    this.append(res.result, append);

    return res
}

coreWrite.prototype.net_addr = function (timestamp, services, ip, port, append) {
    var push = function (buff) {
        return push.res = Buffer.concat([
            push.res,
            buff,
        ]);
    }


    var buff;
    if (timestamp != null) {
        buff = this.uint32(timestamp);
        push.res = buff.result;
    } else
        push.res = new Buffer([]);


    buff = this.uint64(services);
    push(buff.result);

    buff = this.uint64(services);
    push(buff.result);

    buff = this.ip(ip);
    push(buff.result);

    buff = new Buffer(Number(port).toString(16), 'hex');
    push(buff);

    this.append(push.res, append)
    return {
        result: push.res,
        length: push.res.length,
    }

}

coreWrite.prototype.header = function (version, prev_block, merkle_root, timestamp, bits, nonce, txn_count, append) {
    var push = function (buff) {
        return push.res = Buffer.concat([
            push.res,
            buff,
        ]);
    };
    push.res = new Buffer("");

    var res = this.uint32(version);
    push(res.result)

    res = this.hash(prev_block);
    push(res.result)

    res = this.hash(merkle_root);
    push(res.result)

    res = this.uint32(timestamp);
    push(res.result)

    res = this.uint32(bits);
    push(res.result)

    res = this.uint32(nonce);
    push(res.result)

    if (txn_count != null) {//if header this value is 0, else this value is start next block tx[] (tx_vector)
        res = this.var_int(txn_count);
        push(res.result)
    }

    this.append(push.res, append);

    return {
        result: push.res,
        length: push.res.length,
    }

}

coreWrite.prototype.tx_in = function (hash, index, scriptSig, sequence, append) {
    var push = function (buff) {
        return push.res = Buffer.concat([
            push.res,
            buff,
        ]);
    };
    push.res = new Buffer("");


    var res = this.hash(hash);
    push(res.result);
    var res = this.uint32(index);
    push(res.result);

    var res = this.string(new Buffer(scriptSig, 'hex'));
    push(res.result);


    var res = this.uint32(sequence);
    push(res.result);


    this.append(push.res, append);
    return {
        result: push.res,
        length: push.res.length,
    }

}

coreWrite.prototype.tx_out = function (amount, scriptPubKey, append) {

    var push = function (buff) {
        return push.res = Buffer.concat([
            push.res,
            buff,
        ]);
    };
    push.res = new Buffer("");

    var res = this.uint64(amount);
    push(res.result);
    var res = this.string(new Buffer(scriptPubKey, 'hex'));
        
    push(res.result);

    this.append(push.res, append);
    return {
        result: push.res,
        length: push.res.length,
    }
}

coreWrite.prototype.tx = function (version, tx_in, tx_out, lock_time, append) {
    var push = function (buff) {
        return push.res = Buffer.concat([
            push.res,
            buff,
        ]);
    };
    push.res = new Buffer("");

    var res = this.uint32(version);
    push(res.result);

    res = this.vector_tx_in(tx_in);
    push(res.result);

    res = this.vector_tx_out(tx_out);
    push(res.result);

    res = this.uint32(lock_time);
    push(res.result);


    this.append(push.res, append);
    return {
        result: push.res,
        length: push.res.length,
    }
}

coreWrite.prototype.block = function (header, txlist, append) {
    var push = function (buff) {
        return push.res = Buffer.concat([
            push.res,
            buff,
        ]);
    };
    push.res = new Buffer("");

    if (typeof header.bits == 'string')
        header.bits = parseInt(header.bits, 16)

    var res = this.header(header.version, header.prev_block, header.merkle_root, header.timestamp, header.bits, header.nonce, null);
    push(res.result);

    res = this.vector_tx(txlist);
    push(res.result);

    this.append(push.res, append);
    return {
        result: push.res,
        length: push.res.length,
    }
}

coreWrite.prototype.vector = function (method, paramsOrder, arr, append) {
    var push = function (buff) {
        return push.res = Buffer.concat([
            push.res,
            buff,
        ]);
    };
    push.res = new Buffer("");

    var res = this.var_int(arr.length);
    push(res.result);

    var method = method;
    var paramsOrder = paramsOrder;

    for (var i in arr) {
        var _p = [];

        for (var p in paramsOrder) {
            _p.push(arr[i][paramsOrder[p]]);
        }

        res = this[method].apply(this, _p);
        push(res.result);
    }

    this.append(push.res, append);
    return {
        length: push.res.length,
        result: push.res,
    }

}

coreWrite.prototype.vector_tx_in = function (arr, append) {

    var res = this.vector('tx_in', [
        'hash',
        'index',
        'scriptSig',
        'sequence'
    ], arr);

    this.append(res.result, append);
    return {
        length: res.result.length,
        result: res.result,
    }

}

coreWrite.prototype.vector_tx_out = function (arr, append) {

    var res = this.vector('tx_out', [
        'amount',
        'scriptPubKey'
    ], arr);

    this.append(res.result, append);
    return {
        length: res.result.length,
        result: res.result,
    }

}

coreWrite.prototype.vector_tx = function (arr, append) {

    var res = this.vector('tx', [
        'version',
        'in',
        'out',
        'lock_time'
    ], arr);

    this.append(res.result, append);
    return {
        length: res.result.length,
        result: res.result,
    }

}


module.exports = coreWrite