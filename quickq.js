/**
 * simple, very quick nodejs job queue
 *
 * Copyright (C) 2016 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * A job queue is a `runner` function and a queue of job data to be processed.
 *
 * The job runner is a function taking a callback is called to process
 * each queued job payload.  Jobs are processed concurrently up to the
 * specified concurrency limit (default 10).
 *
 * Each data item is queued with an optional callback to receive the
 * computed result when that job finishes.  The jobs are picked up for
 * processing in the order queued (but may complete out of order).
 *
 * Placing data into the queue starts the processing on the next event loop
 * iteration.  Processing is done with up to `concurrency` threads at a time.
 * The processing stops when there is no more data in the queue.
 *
 * 2016-08-09 - Started - AR.
 */

// TODO: figure out how to wrap for browsers and still maintain 100% covreage
//;(function(module){           // wrap in closure for browsers

'use strict';

var aflow = require('aflow');
var qlist = require('qlist');

// time to queue and run 1m jobs depending on the list used:
//   qlist: .23s, double-ended-queue: .29s, qslist: .42s, fast-list: .64s
var JobList = qlist;
    JobList.prototype.getLength = JobList.prototype.size;
    JobList.prototype = JobList.prototype;

module.exports = QuickQueue;

var defaultConcurrency = 10;

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
 *   drain - when set, the function to call whenever the queue empties
 */
function QuickQueue( runner, options ) {
    if (!this || this === global) return new QuickQueue(runner, options);
    if (typeof runner !== 'function') throw new Error("task runner function required");
    if (typeof options !== 'object') options = { concurrency: options };

    this.options = {
        concurrency: (options.concurrency > 0) ? parseInt(options.concurrency) : defaultConcurrency,
    }

    this.length = 0;
    this.running = 0;
    this.runners = 0;
    this.concurrency = this.options.concurrency;
    this.drain = null;

    this._lastConcurrency = this.concurrency;
    this._runner = runner;
    this._jobs = new JobList();
    this._callbacks = new JobList();
    this._fflush = null;
}

QuickQueue.prototype.push = function push( payload, cb ) {
    this._insertJobs('push', payload, cb);
    return this;
}

QuickQueue.prototype.unshift = function unshift( payload, cb ) {
    this._insertJobs('unshift', payload, cb);
    return this;
}

QuickQueue.prototype._insertJobs = function _insertJobs( method, payload, cb ) {
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
        if (this.runners < this.concurrency) this._scheduleJob();
    }
}

QuickQueue.prototype.pause = function pause( ) {
    if (this.concurrency > 0) this._lastConcurrency = this.concurrency;
    this.concurrency = -1;
    return this;
}

QuickQueue.prototype.resume = function resume( ) {
    this.concurrency = this._lastConcurrency;
    var njobs = Math.min(this.concurrency - this.runners, this._jobs.getLength());
    for (var i=0; i<njobs; i++) this._scheduleJob();
    return this;
}

QuickQueue.prototype.fflush = function fflush( cb ) {
    // TODO: call cb once *currently queued* jobs have all finished, not when completely empty
    if (cb) {
        if (!this._fflush) this._fflush = [cb];
        else this._fflush.push(cb);
    }
    return this;
}

function tryRunner( handler, job, cb ) {
    try {
        handler(job, cb);
    }
    catch (err) {
        cb(err);
    }
}

QuickQueue.prototype._scheduleJob = function _scheduleJob( ) {
    var self = this;
    self.runners += 1;

    // create a single closure to reuse the job completion callback function
    var job, cb, jobDoneCb;
    function whenJobDone(err, ret) {
        if (cb) cb(err, ret);
        self.running -= 1;
        jobDoneCb();
    }

    setImmediate(function() {
        aflow.repeatUntil(
            function(done) {
                if (self._jobs.isEmpty()) return done(null, true);
                if (self.runners > self.concurrency) return done(null, true);
                job = self._jobs.shift();
                cb = self._callbacks.shift();
                jobDoneCb = done;
                self.running += 1;
                tryRunner(self._runner, job, whenJobDone);
            },
            function(err) {
                self.length -= 1;
                self.runners -= 1;
                if (!self.runners && self._jobs.isEmpty()) {
                    // last runner to exit notifies of drain
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

// aliases
QuickQueue.prototype.enqueue = QuickQueue.prototype.push;
QuickQueue.prototype.append = QuickQueue.prototype.push;
QuickQueue.prototype.prepend = QuickQueue.prototype.unshift;

// accelerate access
QuickQueue.prototype = QuickQueue.prototype;

//})(module || window);


// quicktest:
/**

var assert = require('assert');
var timeit = require('qtimeit');

var QuickQueue = module.exports;

console.log("AR: test");

assert.throws(function(){ var q = new QuickQueue() });

var ncalls = 0, ndone = 0;
function runner(payload, cb) {
    ncalls += 1;
    cb();
}
function taskDone() {
    ndone += 1;
}
var q = new QuickQueue(runner, {concurrency: 40});
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
