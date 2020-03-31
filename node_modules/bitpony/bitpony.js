var builder = require('./types/builder');
var parser = require('./types/parser');

var stackReader = require('./stack/read')
var stackWriter = require('./stack/write')

var reader = require('./bytes/read')
var writer = require('./bytes/write')

var tools = require('./bytes/tools')


var bitPony = function (type, format, data) {
    this.type = type;
    this.format = format;
    this.data = data;
    this.valid = false;

    if (this.format == 'binary') {
        this.parse();
    } else if (this.format == 'json') {
        this.validate();
        this.build();
    } else if (this.format == 'validate') {
        this.validate();
    }

}

bitPony.prototype.isValid = function () {
    return this.valid;
}

bitPony.prototype._containKeys = function (keys) {
    for (var i in keys) {
        if (this.data[keys[i]] === null || this.data[keys[i]] === "")
            throw new Error('key ' + this.type + '.' + keys[i] + " can not be empty " + this.data[keys[i]]);
    }
}

bitPony.prototype._check = function (key, cb) {
    cb(this.data[key]);
}

bitPony.prototype.validate = function () {

    if (this.type == 'tx_in') {
        this._containKeys(['scriptSig', 'index', 'hash']);

        if (!this.data.sequence)
            this.data.sequence = 0;

        this._check('hash', function (val) {
            var b = new Buffer(val, 'hex');
            if (b.length != 32)
                throw new Error('hash of tx_in is 32 byte char str');
        });

        this._check('index', function (val) {
            if (parseInt(val) < 0 || isNaN(val))
                throw new Error('index must be a integer >0');
        });

        this.valid = true;
    }

    if (this.type == 'tx_out') {
        this._containKeys(['scriptPubKey', 'amount']);

        this._check('amount', function (val) {
            if (parseInt(val) < 0 || isNaN(val))
                throw new Error('index must be a integer >0');
        });

        this.valid = true;
    }

    if (this.type == 'blockheader') {
        this._containKeys(['version', 'prev_block', 'merkle_root', 'timestamp', 'bits', 'nonce']);

        this._check('version', function (val) {
            if (parseInt(val) < 0 || isNaN(val))
                throw new Error('block version must be a integer >0');
        });

        this._check('prev_block', function (val) {
            var b = new Buffer(val, 'hex');
            if (b.length != 32)
                throw new Error('prev_block of block is 32 byte char str');
        });

        this._check('merkle_root', function (val) {
            var b = new Buffer(val, 'hex');
            if (b.length != 32)
                throw new Error('merkle_root of block is 32 byte char str');
        });

        this._check('timestamp', function (val) {
            if (parseInt(val) < 0 || isNaN(val))
                throw new Error('block timestamp must be a integer >0');
        });

        if (typeof this.data['bits'] == 'string') {
            this.data['bits'] = parseInt(this.data['bits'], 16)
        }

        this._check('bits', function (val) {
            if (parseInt(val) < 0 || isNaN(val))
                throw new Error('block bits must be a integer >0');
        });

        this._check('nonce', function (val) {
            if (parseInt(val) < 0 || isNaN(val))
                throw new Error('block nonce must be a integer >0');
        });

        this.valid = true;
    }

    if (this.type == 'tx') {

        this._containKeys(['version', 'in', 'out']);

        this._check('version', function (val) {
            if (parseInt(val) < 0 || isNaN(val))
                throw new Error('tx version must be a integer >0');
        });

        this._check('lock_time', function (val) {
            if (parseInt(val) < 0 || isNaN(val))
                throw new Error('tx lock_time must be a integer >0');
        });

        if (!(this.data.in instanceof Array))
            throw new Error('tx in must be Array');

        if (this.data.in.length < 1)
            throw new Error('tx in array must be not empty');

        for (var i in this.data.in) {
            this.deepValidate('in', 'tx_in', i);
        }

        if (!(this.data.out instanceof Array))
            throw new Error('tx out must be Array');

        if (this.data.out.length < 1)
            throw new Error('tx out array must be not empty');

        for (var i in this.data.out) {
            this.deepValidate('out', 'tx_out', i);
        }

        this.valid = true;
    }

    if (this.type == 'block') {
        this._containKeys(['header', 'txns']);

        if (!(this.data.txns instanceof Array))
            throw new Error('block txns out must be Array');

        if (this.data.txns.length < 1)
            throw new Error('block txns array must be not empty');

        for (var i in this.data.txns) {
            this.deepValidate('txns', 'tx', i);
        }

        this.deepValidate('header', 'blockheader', null);

        this.valid = true;
    }

}

bitPony.prototype.deepValidate = function (field, type, index) {
    var isval = true, msg;
    var val = {valid: false}
    try {
        val = new bitPony(type, 'validate', index==null?this.data[field]:this.data[field][index]);
    } catch (e) {
        isval = false;
        msg = e.message;
        console.log(e);
    }

    if (!val.valid || !isval)
        throw new Error('block tx[' + index + "] is invalid: " + msg);

    return isval;
}

bitPony.prototype.parse = function () {

    if (this.result)
        return false;

    if (this.type == 'blockheader') {
        this.result = new bitPony('blockheader', 'json', parser.header(this.data));
    }

    if (this.type == 'block') {
        this.result = new bitPony('block', 'json', parser.block(this.data));
    }

    if (this.type == 'tx') {
        this.result = new bitPony('tx', 'json', parser.tx(this.data));
    }

    if (this.type == 'tx_in') {
        this.result = new bitPony('tx_in', 'json', parser.tx_in(this.data));
    }

    if (this.type == 'tx_out') {
        this.result = new bitPony('tx_out', 'json', parser.tx_out(this.data));
    }

    return true;

}

bitPony.prototype.build = function () {

    if (this.result)
        return false;

    if (this.type == 'blockheader') {
        this.result = builder.header(this.data.version, this.data.prev_block, this.data.merkle_root, this.data.timestamp, this.data.bits, this.data.nonce);
    }

    if (this.type == 'block') {
        this.result = builder.block(this.data.header, this.data.txns);
    }

    if (this.type == 'tx') {
        this.result = builder.tx(this.data.version, this.data.in, this.data.out, this.data.lock_time);
    }

    if (this.type == 'tx_in') {
        this.result = builder.tx_in(this.data.hash, this.data.index, this.data.scriptSig, this.data.sequence);
    }

    if (this.type == 'tx_out') {
        this.result = builder.tx_out(this.data.amount, this.data.scriptPubKey);
    }

    return true;

}

bitPony.prototype.getJSON = function () {

    if (this.type == 'binary') {
        return this.result;
    } else if (this.type == 'json') {
        return this.data;
    }

    throw new Error('unknow type ' + this.type);

}

bitPony.prototype.getBuffer = function () {

    if (this.format == 'binary') {
        return this.data;
    } else if (this.format == 'json') {
        return this.result;
    }

    throw new Error('unknow type ' + this.format);

}


bitPony.uint8 = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.uint8(buffer);
    },
    write: function (value) {
        if (value > 0xff)
            throw new Error('uint8 max value is 0xff, overflow');
        return builder.uint8(value);
    }
}

bitPony.uint16 = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.uint16(buffer);
    },
    write: function (value) {
        if (value > 0xffff)
            throw new Error('uint16 max value is 0xffff, overflow');
        return builder.uint16(value);
    }
}

bitPony.uint32 = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.uint32(buffer);
    },
    write: function (value) {
        if (value > 0xffffff)
            throw new Error('uint32 max value is 0xffffff, overflow');
        return builder.uint32(value);
    }
}

bitPony.uint64 = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.uint64(buffer);
    },
    write: function (value) {
        return builder.uint64(value);
    }
}

bitPony.var_int = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.var_int(buffer);
    },
    write: function (value) {
        return builder.var_int(value);
    }
}

bitPony.char = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.char(buffer.length, buffer);
    },
    write: function (value) {
        if (typeof value == 'string')
            value = new Buffer(value);
        return builder.char(value);
    }
}

bitPony.string = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.string(buffer);
    },
    write: function (value) {
        return builder.string(value);
    }
}

bitPony.hash = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.hash(buffer);
    },
    write: function (value) {
        return builder.hash(value);
    }
}

bitPony.tx_in = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.tx_in(buffer)
    },
    write: function (hash, index, scriptSig, sequence) {
        if (!scriptSig || typeof scriptSig != 'string')
            throw new Error('wrong scriptSig, must be hexstring');

        var txin = new bitPony('tx_in', 'json', {'scriptSig': scriptSig, 'index': index, 'hash': hash, 'sequence': sequence});
        return txin.getBuffer();
    }
}

bitPony.tx_out = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.tx_out(buffer)
    },
    write: function (amount, scriptPubKey) {
        var txin = new bitPony('tx_out', 'json', {'scriptPubKey': scriptPubKey, 'amount': amount});
        return txin.getBuffer();
    }
}

bitPony.header = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.header(buffer)
    },
    write: function (version, prev_block, merkle_root, timestamp, bits, nonce) {
        var txin = new bitPony('blockheader', 'json', {'version': version, 'prev_block': prev_block, 'merkle_root': merkle_root, 'timestamp': timestamp, 'bits': bits, 'nonce': nonce});
        return txin.getBuffer();
    }
}

bitPony.block = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.block(buffer)
    },
    write: function (header, txns) {
        var txin = new bitPony('block', 'json', {'header': header, 'txns': txns});
        return txin.getBuffer();
    }
}

bitPony.tx = {
    read: function (buffer) {
        if (typeof buffer == 'string')
            buffer = new Buffer(buffer,'hex');
        return parser.tx(buffer)
    },
    write: function (version, tx_in, tx_out, lock_time) {
        if (!lock_time)
            lock_time = 0;
        var txin = new bitPony('tx', 'json', {'version': version, 'in': tx_in, 'out': tx_out, 'lock_time': lock_time});
        return txin.getBuffer();
    }
}

bitPony.stackReader = stackReader
bitPony.stackWriter = stackWriter
bitPony.reader = reader;
bitPony.writer = writer;
bitPony.tool = tools;

bitPony.extend = function(type, cb){
    bitPony[type] = cb();
}

module.exports = bitPony