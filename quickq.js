/**
 * simple, very quick nodejs job queue
 *
 * Copyright (C) 2016 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * The job runner is a function taking a callback is called to process
 * each queued job payload.  Jobs are processed concurrently up to the
 * specified concurrency limit (default 10).
 *
 * A job queue is a `runner` function and a queue of job data to be processed.
 * Each data item is queued with an optional callback to call with the
 * computed result when that job finishes.  The job data is picked up
 * for processing in the order queued (but may complete out of order).
 *
 * Placing data into the queue starts the processing on the next event loop
 * iteration.  Processing is done with up to `concurrency` threads at a time.
 * The processing stops when there is no more data in the queue.
 *
 * 2016-08-09 - Started - AR.
 */

;(function(module){           // wrap in closure for browsers

'use strict';

var aflow = require('aflow');
var qslist = require('qslist');
//var FastList = require('fast-list');
//    FastList.prototype.getLength = function(){ return this.length };
//    FastList.prototype.isEmpty = function(){ return !this.length };
//    FastList.prototype = FastList.prototype;
var JobList = require('qlist');         // .23 sec / m
    JobList.prototype.getLength = JobList.prototype.size;
    JobList.prototype = JobList.prototype;
//var xJobList = qslist.SList;            // .42 sec / m
//var xJobList = FastList;                // .64 sec / m
//var xJobList = function JobList() {     // .46 sec / m (building object and predeclaring _next)
//    var list = this.list = qslist.create();
//    this.push = function(item) { qslist.push(this.list, { item: item, _next: 0 }) };
//    this.unshift = function(item) { qslist.unshift(this.list, { item: item, _next: 0 }) };
//    this.shift = function() { return qslist.shift(this.list).item };
//    this.isEmpty = function() { return !this.list.length };
//    this.getLength = function() { return this.list.length };
//}

module.exports = QJobQueue;

/**
 * Constructor args:
 *   runner - function to call on each task
 *   options
 *     concurrency - how many tasks to run in parallel (default 1)
 *
 * Properties:
 *   length - number of tasks in the queue (ro)
 *   running - number of tasks currently being processed (ro)
 *   concurrency - configured limit on how many tasks can be processed at the same time (r/w)
 *   drain - when set to a function will call funcion whenever the queue empties
 */
function QJobQueue( runner, options ) {
    if (!this || this === global) return new QJobQueue(runner, options);
    options = options || {};
    if (typeof runner !== 'function') throw new Error("task runner function required");

    this.options = {
        concurrency: (options.concurrency > 0) ? parseInt(options.concurrency) : 10,
    }

    this.length = 0;
    this.running = 0;
    this.runners = 0;
    this.concurrency = this.options.concurrency;
    this.drain = null;

    this._runner = runner;
    this._jobs = new JobList();
    this._callbacks = new JobList();
    this._fflush = null;
}

QJobQueue.prototype.push = function push( payload, cb ) {
    this._insertJobs('push', payload, cb);
    return this;
}

QJobQueue.prototype.unshift = function unshift( payload, cb ) {
    this._insertJobs('unshift', payload, cb);
    return this;
}

QJobQueue.prototype._insertJobs = function _insertJobs( method, payload, cb ) {
    if (payload && payload.constructor && payload.constructor.name === 'Array') {
        for (var i=0; i<payload.length; i++) this._insertJobs(method, payload[i], cb);
    }
    else {
        if (method === 'push') {
            this._jobs.push(payload);
            this._callbacks.push(cb);
        } else {
            this._jobs.unshift(payload);
            this._callbacks.unshift(cb);
        }
        this.length += 1;
        if (this.runners < this.concurrency) this._scheduleJobs();
    }
}

QJobQueue.prototype.pause = function pause( ) {
    this.concurrency = -1;
    return this;
}

QJobQueue.prototype.resume = function resume( ) {
    this.concurrency = this.options.concurrency;
    var njobs = Math.min(this.concurrency - this.runners, this._jobs.getLength());
    for (var i=0; i<njobs; i++) this._scheduleJobs();
    return this;
}

QJobQueue.prototype.fflush = function fflush( cb ) {
    // TODO: call cb once *currently queued* jobs have all finished, not when completely empty
    if (!cb) throw new Error("callback function required");
    if (!this._fflush) this._fflush = [cb];
    else this._fflush.push(cb);
    return this;
}

QJobQueue.prototype._scheduleJobs = function _scheduleJobs( ) {
    var self = this;
    self.runners += 1;
    setImmediate(function() {
        aflow.repeatUntil(
            function(done) {
                if (self._jobs.isEmpty()) return done(null, true);
                if (self.runners > self.concurrency) return done(null, true);
                var job = self._jobs.shift();
                var cb = self._callbacks.shift();
                self.length -= 1;
                self.running += 1;
                self._runner(job, function(err, ret) {
                    if (cb) cb(err, ret);
                    self.running -= 1;
                    done();
                })
            },
            function(err) {
                self.runners -= 1;
                if (!self.runners && !self._jobs.getLength()) {
                    // the last runner to exit notifies of the drain
                    notifyQueueEmpty(self);
                }
            }
        );
    });

    function notifyQueueEmpty(self) {
        if (self.drain) self.drain();
        if (self._fflush) {
            var callbacks = self._fflush;
            self._fflush = null;
            for (var i=0; i<callbacks.length; i++) callbacks[i]();
        }
    }
}

// accelerate access
QJobQueue.prototype = QJobQueue.prototype;

})(module || window);


// quicktest:
/**

var assert = require('assert');
var timeit = require('qtimeit');

var QJobQueue = module.exports;

console.log("AR: test");

assert.throws(function(){ var q = new QJobQueue() });

var ncalls = 0, ndone = 0;
function runner(payload, cb) {
    ncalls += 1;
    cb();
}
function taskDone() {
    ndone += 1;
}
var q = new QJobQueue(runner, {concurrency: 40});
console.log("AR:", q);


var t1 = timeit.fptime();
for (var i=0; i<1000000; i++) q.push(null, taskDone);
q.drain = (function(){ 
    var t2 = timeit.fptime();
    console.log("AR: %d ms, ", t2 - t1, ncalls, ndone);
    // 100k @10 2m/s, 1m @10 4.7m/s
});
q.fflush(function(){ 
    var t2 = timeit.fptime();
    console.log("AR: %d ms, ", t2 - t1, ncalls, ndone);
});

if (0) timeit(1, function(cb){ q.push(null, function(){ taskDone(); cb() }) }, function() {
    q.fflush(function(){
        console.log("AR:", ncalls, ndone);
    });
});
// 420k/s run (16m/s queued), 435k/s with 6.3.0 (AR setImmediate)

/**/
