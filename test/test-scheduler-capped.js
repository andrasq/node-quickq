'use strict';

var quickq = require('../');
var FairScheduler = require('../lib/scheduler-fair.js');
var CappedScheduler = require('../lib/scheduler-capped.js');

module.exports = {
    setUp: function(done) {
        this.s = new CappedScheduler();
        this.s.waiting('jobtype1');
        this.s.waiting('jobtype2');
        this.s.waiting('jobtype1');
        done();
    },

    'constructor': {
        'should extend FairScheduler': function(t) {
            var s = new CappedScheduler();
            t.ok(s instanceof FairScheduler);
            t.done();
        },

        'should provide same methods a fair scheduler': function(t) {
            var fsMethods = Object.keys(FairScheduler.prototype).filter(function(f){ return typeof f === 'function' });
            var csMethods = Object.keys(CappedScheduler.prototype).filter(function(f){ return typeof f === 'function' });
            t.deepEqual(csMethods, fsMethods);
            t.done();
        },

        'should override configure and isBlocked methods': function(t) {
            var s = new CappedScheduler();
            var methods = Object.keys(FairScheduler.prototype).filter(function(f){ return typeof f === 'function' });
            for (var i=0; i<methods.length; i++) {
                var method = methods[i];
                t.equal(typeof s[method], 'function');
                if (method === 'configure' || method === 'isBlocked') {
                    t.notEqual(s[method], FairScheduler.prototype[method]);
                } else {
                    t.equal(s[method], FairScheduler.prototype[method]);
                }
            }
            t.done();
        },

        'should configure maxTypeCap and typeCaps': function(t) {
            var s = new CappedScheduler({ maxTypeCap: 1234, typeCaps: { type1: 12, type2: 2 } });
            t.equal(s.maxTypeCap, 1234);
            t.equal(s.typeCaps.type1, 12);
            t.equal(s.typeCaps.type2, 2);
            s.configure({ maxTypeCap: 456, typeCaps: { 'type1': 23 } });
            t.equal(s.maxTypeCap, 456);
            t.equal(s.typeCaps.type1, 23);
            t.equal(s.typeCaps.type2, 2);
            t.done();
        },

        'falsy should un-configure typeCaps': function(t) {
            var s = new CappedScheduler({ typeCaps: { type1: 1, type2: 2 } });
            t.strictEqual(s.typeCaps.type1, 1);
            s.configure({ typeCaps: false });
            t.strictEqual(s.typeCaps.type1, undefined);
            t.done();
        },
    },

    'isBlocked': {
        'should block at maxTypeShare if maxTypeCount not set': function(t) {
            var s = new CappedScheduler({ concurrency: 2000, maxTypeShare: 1.0 });
            for (var i=0; i<2000; i++) s.waiting('type1');
            for (var i=0; i<2000-1; i++) s.start('type1');
            t.equal(s.isBlocked('type1'), false);
            s.start('type1');
            t.equal(s.isBlocked('type1'), true);
            t.done();
        },

        'should block at lower of maxTypeCount or maxTypeShare or typeCaps[type]': function(t) {
            var s = new CappedScheduler({ concurrency: 4, maxTypeShare: 0.75, maxTypeCap: 3 });
            for (var i=0; i<10; i++) s.waiting('type1');
            s.start('type1');
            s.start('type1');
            // 2 of 3 running, ok to run more
            t.equal(s.isBlocked('type1'), false);
            t.equal(s.isBlocked('type2'), false);

            // lower maxTypeCap, should not allow more
            s.configure({ maxTypeShare: 0.75, maxTypeCap: 2 });
            t.equal(s.isBlocked('type1'), true);
            t.equal(s.isBlocked('type2'), false);

            // lower maxTypeShare, should not allow more
            s.configure({ maxTypeShare: 0.50, maxTypeCap: 3 });
            t.equal(s.isBlocked('type1'), true);
            t.equal(s.isBlocked('type2'), false);

            // impose a lower type-specific cap, should not allow more
            s.configure({ maxTypeShare: 0.75, maxTypeCap: 3, typeCaps: { type1: 2 } });
            t.equal(s.isBlocked('type1'), true);
            t.equal(s.isBlocked('type2'), false);

            // impose a lower type-specific cap on another type
            s.configure({ maxTypeShare: 0.75, maxTypeCap: 3, typeCaps: { type1: 3, type2: 1 } });
            t.equal(s.isBlocked('type1'), false);
            t.equal(s.isBlocked('type2'), false);
            s.waiting('type2');
            s.start('type2');
            t.equal(s.isBlocked('type2'), true);

            t.done();
        },

        'should not block based on waiting count': function(t) {
            var s = new CappedScheduler({ concurrency: 3, maxTypeCount: 2 });

            for (var i=0; i<2000; i++) s.waiting('type1');
            for (var i=0; i<20; i++) s.waiting('type2');
            for (var i=0; i<2; i++) s.waiting('type3');
            t.equal(s.isBlocked('type1'), false);
            t.equal(s.isBlocked('type2'), false);
            t.equal(s.isBlocked('type3'), false);

            s.start('type1');
            s.start('type2');
            t.equal(s.isBlocked('type1'), false);
            t.equal(s.isBlocked('type2'), false);
            t.equal(s.isBlocked('type3'), false);
            t.done();
        },
    },

    'gc': {
        'should not remove empty typeCaps': function(t) {
            var s = new CappedScheduler({ typeCaps: { type1: 0, type2: 1 } });
            s.gc();
            t.strictEqual(s.typeCaps.type1, 0);
            t.strictEqual(s.typeCaps.type2, 1);
            t.done();
        },
    },
}
