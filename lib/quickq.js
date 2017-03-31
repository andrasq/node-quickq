/**
 * simple, very quick nodejs job queue
 *
 * Copyright (C) 2016-2017 Andras Radics
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

var FairScheduler = require('./scheduler-fair.js');

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

    switch (this.options.scheduler) {
    case 'fair':
        this.scheduler = new FairScheduler();
        break;
    }

    this._lastConcurrency = this.concurrency;
    this._runner = runner;
    this._jobs = new JobList();         // job payload
    this._callbacks = new JobList();    // job callback
    this._types = new JobList();        // job type, if multi-tenant
    this._fflush = null;
}

function noop() {
}

QuickQueue.prototype.push = function push( payload, cb ) {
    this.length += 1;
    if (this.runners < this.concurrency) this._scheduleJob();
    this._jobs.push(payload);
    this._callbacks.push(cb);
    return this;
}

QuickQueue.prototype.unshift = function unshift( payload, cb ) {
    this.length += 1;
    if (this.runners < this.concurrency) this._scheduleJob();
    this._jobs.unshift(payload);
    this._callbacks.unshift(cb);
    return this;
}

QuickQueue.prototype.pushType = function pushType( type, payload, cb ) {
    this.push(payload, cb);
    if (this.scheduler) this._types.push(type);
    return this;
}

QuickQueue.prototype.unshiftType = function unshiftType( type, payload, cb ) {
    this.unshift(payload, cb);
    if (this.scheduler) this._types.unshift(type);
    return this;
}

QuickQueue.prototype.pause = function pause( ) {
    if (this.concurrency > 0) this._lastConcurrency = this.concurrency;
    this.concurrency = -1;
    return this;
}

QuickQueue.prototype.resume = function resume( concurrency ) {
    if (concurrency === undefined) {
        concurrency =  (this.concurrency > 0) ? this.concurrency : this._lastConcurrency;
    }
    this.concurrency = concurrency;
    var njobs = this.concurrency - this.runners;
    while (njobs-- > 0) {
        this._scheduleJob();
    }
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

QuickQueue.prototype._scheduleJob = function _scheduleJob( ) {
    var self = this;
    self.runners += 1;

    // much faster to reuse a single closure for the job completion callbacks
    var type, job, cb, jobDoneCb;
    function whenJobDone(err, ret) {
        self.running -= 1;
        self.length -= 1;
        // errors returned from the handler we pass to cb
        // the queue ignores job errors otherwise
        cb(err, ret);
        if (self.scheduler) self.scheduler.done(type);
        jobDoneCb();
    }

    setImmediate(function() {
        aflow.repeatUntil(
            function(done) {
                if (self._jobs.isEmpty()) return done(null, true);
                if (self.runners > self.concurrency) return done(null, true);
                if (self.scheduler) {
                    var idx = self.scheduler.select(self._types);
                    job = self._jobs.peekAt(idx);
                    cb = self._callbacks.peekAt(idx) || noop;
                    type = self._types.peekAt(idx);
                    self._jobs.setAt(idx, undefined);   // null out the done job
                    self._callbacks.setAt(idx, undefined);
                    self._types.setAt(idx, undefined);
                } else {
                    job = self._jobs.shift();
                    cb = self._callbacks.shift() || noop;
                }
                jobDoneCb = done;
                self.running += 1;
                if (self.scheduler) {
                    if (self._jobs.peek() === undefined) self._skipDoneJobs();
                    self.scheduler.start(type);
                }
                self._runner(job, whenJobDone);
            },
            function(err) {
                self.runners -= 1;
                if (err) {
                    self.running -= 1;
                    self.length -= 1;
                    if (self.scheduler) self.scheduler.done('FIXME');
                    // errors thrown in the handler are vectored here, we pass to cb
                    cb(err);
                    // start a new runner to take the place of this one that stopped looping
                    if (!self._jobs.isEmpty()) {
                        self._scheduleJob();
                    }
                }
                if (!self.runners && self._jobs.isEmpty()) {
                    // last runner to exit notifies of drain
                    self._notifyQueueEmpty(self);
                }
            }
        );
    });
}

QuickQueue.prototype._pickJob = function _pickJob( ) {
    var idx = this.scheduler.select(this._types);
    return idx;
}

QuickQueue.prototype._skipDoneJobs = function _skipDoneJobs( ) {
    while (this._jobs.size() && this._jobs.peek() === undefined) {
        this._jobs.shift();
        this._callbacks.shift();
        this._types.shift();
    }
}

QuickQueue.prototype._notifyQueueEmpty = function _notifyQueueEmpty( ) {
    var self = this;
    if (self.drain) self.drain();
    if (self._fflush) {
        var callbacks = self._fflush;
        self._fflush = null;
        for (var i=0; i<callbacks.length; i++) callbacks[i]();
    }
}

// aliases
QuickQueue.prototype.enqueue = QuickQueue.prototype.push;
QuickQueue.prototype.append = QuickQueue.prototype.push;
QuickQueue.prototype.prepend = QuickQueue.prototype.unshift;

// accelerate access
QuickQueue.prototype = QuickQueue.prototype;

//})(module || window);
