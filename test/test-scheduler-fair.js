/*
 * 2017-04-03 - AR.
 */

'use strict';

var QList = require('qlist');

var quickq = require('../');
var FairScheduler = require('../lib/scheduler-fair.js');

module.exports = {
    setUp: function(done) {
        this.s = new FairScheduler();
        this.s.waiting('jobtype1');
        this.s.waiting('jobtype2');
        this.s.waiting('jobtype1');
        done();
    },

    'constructor': {
        'should set default options': function(t) {
            var s = new FairScheduler();
            t.ok(s.concurrency == 10);
            t.ok(s.maxTypeShare == 0.80);
            t.ok(s.maxScanLength == 1000);
            t.done();
        },

        'should zero counts': function(t) {
            var s = new FairScheduler();
            t.equal(s.runningCount, 0);
            t.equal(s.waitingCount, 0);
            t.equal(s.typesCount, 0);
            t.deepEqual(s._waiting, {});
            t.deepEqual(s._running, {});
            t.done();
        },

        'should use constructor options': function(t) {
            var opts = { concurrency: 123, maxTypeShare: 456, maxScanLength: 789 };
            var s = new FairScheduler(opts);
            t.equal(s.concurrency, 123);
            t.equal(s.maxTypeShare, 456);
            t.equal(s.maxScanLength, 789);
            t.done();
        },

        'should configure instance': function(t) {
            var s = new FairScheduler({ concurrency: 12 });
            t.equal(s.concurrency, 12);
            s.configure({ concurrency: 34 });
            t.equal(s.concurrency, 34);
            t.done();
        },
    },

    'waiting': {
        'should track a new waiting job': function(t) {
            var s = new FairScheduler();
            s.waiting('jobtype1');
            s.waiting('jobtype2');
            s.waiting('jobtype1');
            t.equal(this.s.waitingCount, 3);
            t.deepEqual(this.s._waiting, {jobtype1: 2, jobtype2: 1});
            t.done();
        },
    },

    'start': {
        'should increment running count and decrement waiting count': function(t) {
            t.equal(sumCounts(this.s._waiting), 3);
            t.equal(sumCounts(this.s._running), 0);

            this.s.start('jobtype1');
            t.equal(this.s.waitingCount, 2);
            t.equal(this.s.runningCount, 1);
            t.equal(sumCounts(this.s._waiting), 2)
            t.equal(sumCounts(this.s._running), 1);
            t.equal(this.s._running.jobtype1, 1);
            t.equal(this.s._running.jobtype2, 0);

            this.s.start('jobtype2');
            t.equal(this.s.waitingCount, 1);
            t.equal(this.s.runningCount, 2);
            t.equal(sumCounts(this.s._waiting), 1);
            t.equal(sumCounts(this.s._running), 2);
            t.equal(this.s._running.jobtype1, 1);
            t.equal(this.s._running.jobtype2, 1);
            t.done();
        },
    },

    'done': {
        'should decrement running count': function(t) {
            this.s.start('jobtype1');
            this.s.done('jobtype1');
            t.equal(this.s.runningCount, 0);
            t.equal(sumCounts(this.s._running), 0);
            t.equal(sumCounts(this.s._waiting), 2);
            t.done();
        },
    },

    'isBlocked': {
        'should always allow the very first job to run': function(t) {
            var s = new FairScheduler();
            for (var i=0; i<100; i++) s.waiting('jobtype1');
            t.ok(!s.isBlocked('jobtype1'));
            t.ok(!s.isBlocked('jobtype2'));
            t.done();
        },

        'should reject job that reached maxTypeShare': function(t) {
            var s = new FairScheduler();
            startJobs(s, 'jobtype1', 8);
            t.ok(s.isBlocked('jobtype1'));
            t.ok(!s.isBlocked('jobtype2'));
            t.done();
        },

        'should allow job under maxTypeShare': function(t) {
            var s = new FairScheduler();
            startJobs(s, 'jobtype2', 7);
            t.ok(!s.isBlocked('jobtype2'));
            t.done();
        },

        'should reject job that reached its fair share of concurrency': function(t) {
            var s = new FairScheduler();
            for (var i=0; i<5; i++) this.s.waiting('jobtype1');
            for (var i=0; i<5; i++) this.s.waiting('jobtype2');
            for (var i=0; i<5; i++) this.s.waiting('jobtype3');
            for (var i=0; i<5; i++) this.s.waiting('jobtype4');

            for (var i=0; i<3; i++) this.s.start('jobtype1');
            t.ok(this.s.isBlocked('jobtype1'));
            t.ok(!this.s.isBlocked('jobtype2'));

            for (var i=0; i<3; i++) this.s.start('jobtype2');
            t.ok(this.s.isBlocked('jobtype2'));

            t.done();
        },
    },

    'select': {
        'should call isBlocked': function(t) {
            var s = new FairScheduler();
            var called = false;
            s.isBlocked = function(type) { called = true; return false }
            s.select(new QList().fromArray(['type1']));
            t.done();
        },

        'should try next type if blocked': function(t) {
            var s = new FairScheduler();
            var types = ['type1', 'type2', 'type3', 'type4', 'type5', 'type6'];
            var probedTypes = [];
            s.isBlocked = function(type) { probedTypes.push(type); return true }
            s.select(new QList().fromArray(types));
            t.deepEqual(probedTypes, types);
            t.done();
        },

        'should skip undefined types': function(t) {
            var s = new FairScheduler();
            var probedTypes = [];
            s.isBlocked = function(type) { probedTypes.push(type); return probedTypes.length === 1 }
            s.select(new QList().fromArray(['type1', undefined, undefined, 'type2']));
            t.deepEqual(probedTypes, ['type1', 'type2']);
            t.done();
        },

        'should return the index of the first non-blocked type': function(t) {
            var s = new FairScheduler();
            var types = ['t1', 't2', 't3', 't4'];
            var ncalls = 0;
            s.isBlocked = function() { return ++ncalls < 3 }
            t.equal(s.select(new QList().fromArray(types)), 2);
            t.done();
        },

        'should only scan maxScanLength types': function(t) {
            var s = new FairScheduler({ maxScanLength: 10 });
            var types = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11'];
            var ncalls = 0;
            s.isBlocked = function() { ncalls += 1; return true }
            t.equal(s.select(new QList().fromArray(types)), 0);
            t.equal(ncalls, 10);
            t.done();
        },
    },

    'gc': {
        '_omitZeros should omit zero counts': function(t) {
            var obj = { one: 1, zero2: 0, three: 3, zero: 0 };
            var obj2 = this.s._omitZeros(obj);
            t.deepEqual(obj2, { one: 1, three: 3 });
            t.deepEqual(Object.keys(obj2), ['one', 'three']);
            t.done();
        },

        'should omit zeros from _running and _waiting': function(t) {
            var self = this;
            var newRunning = {};
            var newWaiting = {};
            this.s._omitZeros = function(obj) {
                if (obj === self.s._running) return newRunning;
                if (obj === self.s._waiting) return newWaiting;
            }
            this.s.gc();
            t.equal(this.s._running, newRunning);
            t.equal(this.s._waiting, newWaiting);
            t.done();
        },
    },
}

function sumCounts( counters ) {
    var sum = 0;
    for (var key in counters) {
        sum += counters[key];
    }
    return sum;
}

// tell the scheduler that `count` jobs arrived and were started
function startJobs( scheduler, type, count ) {
    for (var i=0; i<count; i++) {
        scheduler.waiting(type);
        scheduler.start(type);
    }
}
