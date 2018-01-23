/*
 * 2016-08-26 - AR.
 */

'use strict';

var quickq = require('../');
var FairScheduler = require('../lib/scheduler-fair.js');

module.exports = {
    'should parse package.json': function(t) {
        require("../package.json");
        t.done();
    },

    beforeEach: function(done) {
        var jobs = [];
        this.jobs = jobs;
        this.handler = function(job, cb){ jobs.push(job); setTimeout(cb, job) };
        this.q = quickq(this.handler, 2);
        this.fairQ = quickq(this.handler, { concurrency: 2, scheduler: 'fair' });
        done();
    },

    'constructor': {
        'should create distinct objects': function(t) {
            t.notEqual(quickq(this.handler), quickq(this.handler));
            t.notEqual(quickq(this.handler), new quickq(this.handler));
            t.done();
        },

        'should require handler function': function(t) {
            t.throws(function(){ quickq() });
            t.done();
        },

        'should default concurrency': function(t) {
            var q = quickq(this.handler);
            t.equal(q.concurrency, 10);
            t.done();
        },

        'should accept numeric concurrency': function(t) {
            t.equal(quickq(this.handler, 5).concurrency, 5);
            t.equal(quickq(this.handler, '6').concurrency, 6);
            t.done();
        },

        'should accept concurrency option': function(t) {
            var q = quickq(this.handler, {concurrency: 3});
            t.equal(q.concurrency, 3);
            t.done();
        },
    },

    'enqueue': {
        'push should enqueue job': function(t) {
            this.q.push(1);
            t.equal(this.q.length, 1);
            t.done();
        },

        'unshift should enqueue job': function(t) {
            this.q.unshift(1);
            t.equal(this.q.length, 1);
            this.q.unshift(2);
            this.q.unshift(3);
            t.equal(this.q.length, 3);
            t.done();
        },

        'push should enqueue array of jobs': function(t) {
            this.q.push(1);
            t.equal(this.q.length, 1);
            this.q.push(2);
            this.q.push(3);
            t.equal(this.q.length, 3);
            t.done();
        },

        'pushType should invoke push with the payload': function(t) {
            var payload = Math.random();
            var arg;
            this.q._push = function(x) { arg = x; }
            this.q.pushType('jobtype1', payload);
            t.equal(arg, payload);
            t.done();
        },

        'unshiftType should invoke unshift with the payload': function(t) {
            var payload = Math.random();
            var arg;
            this.q._unshift = function(x) { arg = x; }
            this.q.unshiftType('jobtype1', payload);
            t.equal(arg, payload);
            t.done();
        },

        'pushType should cast type to string': function(t) {
            this.fairQ.pushType(undefined, 1);
            this.fairQ.pushType(null, 2);
            this.fairQ.pushType(0, 3);
            this.fairQ.pushType('00', 3);
            t.strictEqual(this.fairQ._types.peekAt(0), 'undefined');
            t.strictEqual(this.fairQ._types.peekAt(1), 'null');
            t.strictEqual(this.fairQ._types.peekAt(2), '0');
            t.strictEqual(this.fairQ._types.peekAt(3), '00');
            t.done();
        },

        'unshiftType should cast type to string': function(t) {
            this.fairQ.unshiftType(undefined, 1);
            this.fairQ.unshiftType(null, 2);
            this.fairQ.unshiftType(0, 3);
            this.fairQ.unshiftType('00', 3);
            t.strictEqual(this.fairQ._types.peekAt(3), 'undefined');
            t.strictEqual(this.fairQ._types.peekAt(2), 'null');
            t.strictEqual(this.fairQ._types.peekAt(1), '0');
            t.strictEqual(this.fairQ._types.peekAt(0), '00');
            t.done();
        },
    },

    'running': {
        'pause should stop job running': function(t) {
            this.q.pause();
            this.q.push(1);
            var self = this;
            setTimeout(function(){
                t.equal(self.q.length, 1);
                t.equal(self.jobs[0], undefined);
                t.done();
            }, 5);
        },

        'resume should resume job running': function(t) {
            this.q.concurrency = 0;
            this.q.pause();
            this.q.push(1);
            this.q.resume();
            var self = this;
            setTimeout(function(){
                t.equal(self.q.length, 0);
                t.equal(self.jobs[0], 1);
                t.done();
            }, 5);
        },

        'resume should not change existing concurrency': function(t) {
            this.q.pause();
            this.q.concurrency = 3;
            this.q.resume();
            t.equal(this.q.concurrency, 3);
            t.done();
        },

        'resume should set concurrency': function(t) {
            this.q.pause();
            this.q.concurrency = 3;
            this.q.resume(7);
            t.equal(this.q.concurrency, 7);
            t.done();
        },

        'should run many jobs not exceeding concurrency': function(t) {
            var maxRunning = 0;
            var q = quickq(function(job, cb){
                if (q.running > maxRunning) maxRunning = q.running;
                setTimeout(cb, 1);
            }, 4);
            var data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            for (var i=0; i<data.length; i++) q.push(data[i]);
            setTimeout(function(){
                t.equal(maxRunning, 4);
                t.done();
            }, 5);
        },

        'should decrease runners to match concurrency': function(t) {
            var runners = [];
            var q = quickq(function(job, cb) {
                runners.push(q.runners);
                if (runners.length == 5) q.concurrency = 2;
                cb();
            }, 4);
            var data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            for (var i=0; i<data.length; i++) q.push(data[i]);
            q.drain = function() {
                t.deepEqual(runners.slice(5), [2, 2, 2, 2, 2]);
                t.done();
            }
        },

        'should increase runners to match concurrency': function(t) {
            var runners = [];
            var q = quickq(function(job, cb) {
                runners.push(q.runners);
                if (runners.length == 5) q.resume(4);
                cb();
            }, 2);
            var data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            for (var i=0; i<data.length; i++) q.push(data[i]);
            q.drain = function() {
                t.deepEqual(runners, [2, 2, 2, 2, 2, 4, 4, 4, 4, 4]);
                t.done();
            }
        },

        'should notify on drain': function(t) {
            t.expect(1);
            this.q.push(1);
            var self = this;
            this.q.drain = function() {
                t.ok(1);
                t.done();
            }
        },

        'should notify on fflush': function(t) {
            this.q.push(1);
            var ndone = 0;
            this.q.fflush();
            this.q.fflush(function() { if (++ndone == 2) t.done(); });
            this.q.fflush(function() { if (++ndone == 2) t.done(); });
        },

        'should return exceptions from inside handler': function(t) {
            var q = quickq(function(job, cb) {
                throw new Error("die");
            }, 1);
            var self = this;
            q.push(1, function(err, ret) {
                t.ok(err);
                t.equal(err.message, "die");
                t.done();
            });
            q.push(2);
            setTimeout(function(){}, 5);
        },
    },

    'scheduler': {
        'constructor': {
            'should use built-in "fair scheduler': function(t) {
                var jobRunner = function(){};
                var q = quickq(jobRunner, { scheduler: 'fair' });
                t.ok(q.scheduler instanceof FairScheduler);
                t.done();
            },

            'should use provided scheduler object': function(t) {
                var jobRunner = function(){};
                var fn = function(){};
                var scheduler = { waiting: fn, start: fn, done: fn, select: fn };
                var q = quickq(jobRunner, { scheduler: scheduler });
                t.done();
            },

            'should reject invalid non-scheduler object': function(t) {
                var jobRunner = function(){};
                var notScheduler = { someProperty: 1 };
                t.throws(function(){ quickq(jobRunner, { scheduler: notScheduler }) }, /scheduler/);
                t.done();
            },

            'should reject invalid scheduler': function(t) {
                var scheduler = 3.5;
                t.throws(function(){ quickq(function(){}, { scheduler: scheduler }) });
                t.done();
            },
        },

        'should reject untyped push and unshift': function(t) {
            var self = this;
            t.throws(function(){ self.fairQ.push(1) });
            t.throws(function(){ self.fairQ.unshift(1) });
            t.done();
        },

        'should queue jobs with pushType': function(t) {
            this.fairQ.pushType('type2', 2);
            this.fairQ.unshiftType('type1', 1);
            this.fairQ.pushType('type3', 3);
            var self = this;
            setTimeout(function(){
                t.deepEqual(self.jobs, [1, 2, 3]);
                t.done();
            }, 5);
        },

        'should skip blocked job types': function(t) {
            this.fairQ.pushType('type1', 2);
            this.fairQ.pushType('type1', 4);
            this.fairQ.pushType('type1', 6);
            this.fairQ.pushType('type1', 8);
            this.fairQ.pushType('type2', 10);
            this.fairQ.pushType('type3', 12);
            var self = this;
            // FIXME: race condition: sometimes finishes in a different order
            setTimeout(function(){
                t.deepEqual(self.jobs, [2, 4, 10, 6, 8, 12]);
                t.done();
            }, 20);
        },
    },

    'speed': {
        'should run 100k tasks': function(t) {
            var q = quickq(function(job, cb) { cb() });
            var ndone = 0;
            function whenDone() { ndone += 1 }
            for (var i=0; i<100000; i++) q.push(i, whenDone);
            q.fflush(function() {
                t.equal(ndone, 100000);
                t.done();
            });
        },
    },
}
