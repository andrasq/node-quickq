/**
 * simple, very quick nodejs job queue
 *
 * Copyright (C) 2016-2018 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * A job queue is a `runner` function with a queue of job data to be processed.
 * The job runner is called to process each job payload in the queue.
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

var setImmediate = eval('global.setImmediate || function(fn) { process.nextTick(fn) }');
var FairScheduler = require('./scheduler-fair.js');
var CappedScheduler = require('./scheduler-capped.js');

var qlist = require('qlist');

// time to queue and run 1m jobs depending on the list used:
//   qlist: .23s, double-ended-queue: .29s, qslist: .42s, fast-list: .64s
var JobList = qlist;

/**
//
// the QList JobList is 15% faster than Array() JobList with node v6, v7, v8; 250% faster with v4, v5.
//

var JobList = function JobList( ) {
    this._base = 0;
    this._list = new Array();
}
JobList.prototype.push = function(e) { return this._list.push(e) }
JobList.prototype.unshift = function(e) {
    if (this._base === 0) return this._list.unshift(e);
    else return this._list[--this._base] = e;
}
JobList.prototype.shift = function() {
    if (this._base > 50000 && this._list.length - this._list.length < 10000) {
        this._list = this._list.slice(this._base);
        this._base = 0;
        //for (var i=0, j=this._base; j<this._list.length; i++, j++) this._list[i] = this._list[j];
        //this._list.length = i;
    }
    return this._list[this._base++];
}
JobList.prototype.pop = function() { return this._base < this.length ? this._list.pop() : undefined }
JobList.prototype.peekAt = function(ix) { return (ix >= 0 && ix + this._base < this._list.length) ? this._list[ix + this._base] : undefined }
JobList.prototype.setAt = function(ix, e) { return (ix >= 0 && ix + this._base < this._list.length) ? this._list[ix + this._base] = e : undefined }
JobList.prototype.isEmpty = function() { return this._base >= this._list.length }
JobList.prototype.size = function() { return this._list.length - this._base }
JobList.prototype.peek = function(){ return (this._base < this._list.length) ? this._list[this._base] : undefined }
/** JobList **/

module.exports = QuickQueue;


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
    var concurrency = options.concurrency || 10;
    var scheduler = options.scheduler;
    var schedulerOptions = options.schedulerOptions || {};

    this.length = 0;
    this.running = 0;
    this.runners = 0;
    this.concurrency = concurrency;
    this.drain = null;
    this.scheduler = null;

    if (scheduler) {
        this.push =
            function(){ throw new Error("push not allowed with scheduler, use pushType") };
        this.unshift =
            function(){ throw new Error("unshift not allowed with scheduler, use unshiftType") };

        if (scheduler === 'fair') {
            schedulerOptions.concurrency = this.concurrency;    // these two must match
            this.scheduler = new FairScheduler(schedulerOptions);
        }
        else if (scheduler === 'capped') {
            schedulerOptions.concurrency = this.concurrency;    // these two must match
            this.scheduler = new CappedScheduler(schedulerOptions);
        }
        else if (typeof scheduler === 'object') {
            // caller provided scheduler to use
            this.scheduler = scheduler;
        }
        else throw new Error("invalid scheduler " + scheduler);

        if (typeof this.scheduler.waiting !== 'function' || typeof this.scheduler.start !== 'function' ||
            typeof this.scheduler.done !== 'function' || typeof this.scheduler.select !== 'function')
        {
            throw new Error("quickq: scheduler must have methods 'waiting', 'start', 'done' and 'select'");
        }
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

QuickQueue.prototype._push = function push( payload, cb ) {
    this.length += 1;
    if (this.runners < this.concurrency) this._scheduleJob();
    this._jobs.push(payload);
    this._callbacks.push(cb);
    return this;
}
QuickQueue.prototype.push = QuickQueue.prototype._push;

QuickQueue.prototype._unshift = function unshift( payload, cb ) {
    this.length += 1;
    if (this.runners < this.concurrency) this._scheduleJob();
    this._jobs.unshift(payload);
    this._callbacks.unshift(cb);
    return this;
}
QuickQueue.prototype.unshift = QuickQueue.prototype._unshift;

QuickQueue.prototype.pushType = function pushType( type, payload, cb ) {
    this._push(payload, cb);
    if (this.scheduler) {
        if (typeof type !== 'string') type += '';
        this._types.push(type);
        this.scheduler.waiting(type);
    }
    return this;
}

QuickQueue.prototype.unshiftType = function unshiftType( type, payload, cb ) {
    this._unshift(payload, cb);
    if (this.scheduler) {
        if (typeof type !== 'string') type += '';
        this._types.unshift(type);
        this.scheduler.waiting(type);
    }
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
    if (this.scheduler && typeof this.scheduler.configure === 'function') this.scheduler.configure({ concurrency: concurrency });

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
    var type, job, cb = noop, jobDoneCb;
    function whenJobDone( err, ret ) {
        self.running -= 1;
        self.length -= 1;
        if (self.scheduler) self.scheduler.done(type);
        // errors returned from the handler we pass to cb
        // the queue ignores job errors otherwise
        cb(err, ret);
        jobDoneCb();
    }

    setImmediate(function() {
        aflow.repeatUntil(
            function(done) {
                jobDoneCb = done;

                if (self._jobs.isEmpty()) return done(null, true);

                if (self.runners > self.concurrency) return done(null, true);

                if (self.scheduler) {
                    var idx = self.scheduler.select(self._types);
                    if (idx === 0) {
                        // optimize common case of first task selected
                        job = self._jobs.shift();
                        cb = self._callbacks.shift() || noop;
                        type = self._types.shift();
                        // consuming the first job may expose a gap of undefined slots,
                        // skip them to guarantee that the first is always a valid job
                        self._skipDoneJobs();
                    }
                    else {
                        job = self._jobs.peekAt(idx);
                        cb = self._callbacks.peekAt(idx) || noop;
                        type = self._types.peekAt(idx);
                        self._jobs.setAt(idx, undefined);   // null out the done job
                        self._callbacks.setAt(idx, undefined);
                        self._types.setAt(idx, undefined);
                    }
                    self.scheduler.start(type);
                }
                else {
                    job = self._jobs.shift();
                    cb = self._callbacks.shift() || noop;
                }

                self.running += 1;
                self._runner(job, whenJobDone);
            },
            function(err) {
                self.runners -= 1;
                if (err) {
                    // errors thrown in the handler are vectored here, we pass to cb
                    jobDoneCb = noop;
                    whenJobDone(err);

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

QuickQueue.prototype._skipDoneJobs = function _skipDoneJobs( ) {
    while (this._jobs.peek() === undefined && this._jobs.size()) {
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
