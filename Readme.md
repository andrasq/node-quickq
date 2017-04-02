quickq
======

Fast in-memory multi-tenant work queue.

Quickq is an extremely fast, low overhead, buffering and throttling job processing
engine.  Work arriving in bunches is queued and run at a controlled pace configured
by the server, not as a matter of chance.  Jobs in the work queue are processed in
arrival order.

Multi-tenant job mixes are supported with a built-in "fair-share" scheduler option.

Similar to `async.queue` but much much faster and with fewer surprises.


Overview
--------

    var quickq = require('quickq');

    // the job processor function
    function jobRunner(job, cb) {
        console.log('processing job', job);
        cb(null, 1234);
    }

    // the work queue
    var queue = quickq(jobRunner);

    // add data to be processed
    var jobPayload1 = {data: 1}
    var jobPayload2 = {data: 2}
    queue.push(jobPayload1, function(err, ret) {
        console.log('job 1 done, got', ret);
    })
    queue.push(jobPayload2, function(err, ret) {
        console.log('job 2 done, got', ret);
    })
    // => processing job { data: 1 }
    // => job 1 done, got 1234
    // => processing job { data: 2 }
    // => job 2 done, got 1234


Benchmark
---------

Time to enqueue and run 1 million no-op tasks, timed with `process.hrtime()`:

    async.queue - 5.2 sec
    fastq - 1.42 sec
    quickq - 0.16 sec

Time to create, queue, then enqueue and run 100k no-op tasks, timed with `qtimeit`:
(node-v6.3.0, async-2.0.1, fastq-1.4.1, quickq-0.8.0)

    node=6.3.0 arch=ia32 mhz=3500 cpu="AMD Phenom(tm) II X4 B55 Processor" up_threshold=11
    name  speed  (stats)  rate
    async.queue  229,857 ops/sec (1 runs of 4 in 1.740 over 9.418s, +/- 0%) 1000
    fastq  866,763 ops/sec (3 runs of 4 in 1.384 over 4.502s, +/- 0%) 3771
    quickq  6,953,456 ops/sec (6 runs of 20 in 1.726 over 2.977s, +/- 0%) 30251


Api
---

### q = quickq( runner [, options] )

Job queue factory, same as `q = new quickq()`.  If options is a number, it will be
used as the concurrency.

- `runner` - the function that will process the job.  Runner takes two arguments,
the job and a callback that must be called when the job is finished.

Options:
- `concurrency` - how many jobs to process concurrently (default 10)
- `scheduler` - type of job scheduling desired.  Default is first-come-first-served.
    - `"fair"` - the built-in "fair-share" scheduler runs each job type in proportion
      to the number waiting, not to exceed 80%

### q.push( payload [,callback(err, ret)] )

Append a job to the end of the work queue.  `payload` is the data to be processed.
If a callback is specified, it will be called when the job finishes.

If the queue has a `scheduler`, `pushType` must be used instead.

### q.pushType( type, payload [,callback(err, ret)] )

Push a typed job, for when the queue was created with a scheduler.

`type` is an arbitary string used to groups jobs into categories.

### q.unshift( payload [,callback(err, ret)] )

Prepend a job to the work queue.  The job is placed at the head of the queue, it
will be the next one to be processed.

If the queue has a `scheduler`, `unshiftType` must be used instead.

### q.unshiftType( type, payload [,callback(err, ret)] )

Unshift a typed job.

`type` is an arbitary string used to groups jobs into categories.


### q.pause( )

Stop processing jobs by setting concurrency to -1.  Currently running jobs will
still finish though.

### q.resume( [concurrency] )

Resume processing jobs by either setting concurrency to the given concurrency, or
restoring the last positive concurrency used.  If concurrency was never positive,
sets concurrency to 10.


### q.fflush( cb )

TBD

### q.drain

If set, function to call whenever the work queue empties.

### q.length

The number of jobs in the queue that have not finished yet, ie jobs waiting to run
or running.  Do not change this value.

### q.running

The number of jobs currently being processed.  Do not change this value.

### q.concurrency

The currently configured concurrency.  Changing this value sets a new concurrency,
but `resume()` with an argument is preferred.  Setting a lower value will immediately
lower the concurrency.  A higher value takes effect on the next call to `resume`.


Analysis
--------

For its 30x efficiency improvement over `async.queue`, `quickq` leverages
- [aflow.repeatUntil](https://npmjs.org/package/aflow), is very very efficient at
  looping over async functions, eg the job runner
- [qlist](https://npmjs.org/package/qlist) circular buffers, faster than native arrays
- the job callbacks are invoked from a pre-defined function, not from an inline
  callback created inside the function call arguments list
- omitting convenience features from the api that add delays to the critical path


Related Work
------------

- [quickq](https://github.com/andrasq/node-quickq) - this package, async.queue work-alike, 30x faster
- [fastq](https://npmjs.org/package/fastq) - async.queue clone, 3.5x faster
- [async.queue](https://npmjs.org/package/async) - in-memory work queue
- [stackoverflow.com](http://stackoverflow.com/questions/28388281/job-scheduling-algorithm-for-cluster/28389114#28389114) -
  a discussion on what makes for fair scheduling
- [aflow](https://npmjs.org/package/aflow) - lean, fast async serial flow control
- [qlist](https://npmjs.org/package/qlist) - extremely fast list mapped into a circular buffer
- [qtimeit](https://npmjs.org/package/qtimeit) - accurate nodejs timings


Todo
----

- figure out how to wrap in closure for browsers and still maintain 100% coverage
- make queue into an event emitter, emit 'drain' 'job' and 'error' events
- maybe more compatibility functions
- multi-tenant unit tests
- support pluggable schedulers
