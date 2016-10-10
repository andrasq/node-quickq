quickq
======

Fast in-memory work queue.

Quickq is a very fast engine for processing data arriving at arbitrary times, very
low overhead for even small payloads.  Items are appended to the work queue and are
processed in arrival order by one or more concurrent execution threads.

Similar to async.queue but much faster, more reliable, and with a simpler interface.


Overview
--------

    var quickq = require('quickq');
    var queue = quickq(jobRunner);

    function jobRunner(job, cb) {
        console.log('processing job', job);
        cb(null, 1234);
    }

    var job = 'job1-data';
    queue.push(job, function(err, ret) {
        console.log('job done, got', ret);
    })

    // =>
    //   processing job job1-data
    //   job done, got 1234


Benchmark
---------

Time to enqueue and run 1 million no-op tasks, timed with `process.hrtime()`:

    async.queue - 5.2 sec
    fastq - 1.42 sec
    quickq - 0.16 sec

Time to create queue then enqueue and run 100k no-op tasks, timed with `qtimeit`:
(node-v6.3.0, async-2.0.1, fastq-1.4.1, quickq-0.8.0)

    node=6.3.0 arch=ia32 mhz=3500 cpu="AMD Phenom(tm) II X4 B55 Processor" up_threshold=11
    name  speed  (stats)  rate
    async.queue  229,857 ops/sec (1 runs of 4 in 1.740 over 9.418s, +/- 0%) 1000
    fastq  866,763 ops/sec (3 runs of 4 in 1.384 over 4.502s, +/- 0%) 3771
    quickq  6,953,456 ops/sec (6 runs of 20 in 1.726 over 2.977s, +/- 0%) 30251


Analysis
--------

For its 30x efficiency improvement over `async.queue`, `quickq` leverages
- [aflow.repeatUntil](https://npmjs.org/package/aflow), is very very efficient at
  looping over async functions, eg the job runner
- the job callbacks are invoked from a pre-defined function, not from an inline
  callback created inside the function call arguments list
- omitting convenience features from the api that add delays to the critical path


Api
---

### q = quickq( runner [, options] )

Job queue factory, same as `q = new quickq()`.  If options is a number, it will be
used as the concurrency.

- `runner` - the function that will process the job.  Runner takes two arguments,
the job and a callback that must be called when the job is finished.

Options:
- `concurrency` - how many jobs to process concurrently (default 10)

### q.push( payload [, callback(err, ret)] )

Append a job (data to be processed) to the work queue.  If a callback is specified,
it will be called when the job finishes.

### q.unshift( payload [, callback(err, ret)] )

Prepend a job to the work queue.  The job is placed at the head of the queue, it
will be the next one to be processed.

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

The currently configured concurrency.  Setting this value lower will immediately
lower the concurrency.  Raising this value takes effect on the next call to `resume`.


Related Work
------------

- [quickq](https://github.com/andrasq/node-quickq) - this package, async.queue work-alike, 30x faster
- [fastq](https://npmjs.org/package/fastq) - async.queue clone, 3.5x faster
- [async.queue](https://npmjs.org/package/async) - in-memory work queue
- [aflow](https://npmjs.org/package/aflow) - lean, fast async serial flow control
- [qtimeit](https://npmjs.org/package/qtimeit) - accurate nodejs timings


Todo
----

- figure out how to wrap in closure for browsers and still maintain 100% coverage
- change _scheduleJob to take as input the first job to run, deprecate getLength() use just isEmpty()
