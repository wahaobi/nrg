var readBuffer = require('../bytes/read')

var readStack = function (buffer, script) {
    this.buffer = buffer;
    this.script = script;
}


readStack.prototype.getResult = function (filter) {
    if (!filter)
        filter = {};

    if (!this.result) {
        var read = new readBuffer(this.buffer);

        var params = [], offset = 0;
        for (var i in this.script) {

            var op = this.script[i], p = [];
            if (op instanceof Array) {
                p = op;
                op = p.shift();

            }

            if (op.indexOf("vector.") >= 0)
                op = "vector_" + op.replace("vector.", "")

            if (!(read[op] instanceof Function))
                throw new Error('read stack dont know operator ' + this.script[i]);

            p.push(offset);
            var res = read[op].apply(read, p);
            
            if (filter[i] instanceof Function) {
                params[i] = filter[i](res.result)
            }else
                params[i] = res.result;
            
            offset = res.offset;

        }
        this.result = params;
    }

    return this.result;
}

module.exports = readStack