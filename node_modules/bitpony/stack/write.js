var writeBuffer = require('../bytes/write')

var writeStack = function (buffer, script) {
    this.buffer = buffer;
    this.script = script;
}


writeStack.prototype.getResult = function (a) {

    if (!this.result) {
        var wr = new writeBuffer(this.buffer);
        
        if (a instanceof Array)
            wr.tracelines(a)
        
        var result = [], len = 0;
        for (var i in this.script) {

            var _p = this.script[i];
            op = _p.shift();

            if (!(wr[op] instanceof Function)) {
                throw new Error('write stack dont know operator ' + op);
            }

            _p.push(true);//append to buffer
            var res = wr[op].apply(wr, _p);
            len += res.length;
        }
        this.result = wr.getBuffer();
    }


    return this.result;
}

module.exports = writeStack