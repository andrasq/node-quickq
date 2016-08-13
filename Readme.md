quickq
======

Fast in-memory work queue.

Quickq is a very fast engine for processing data arriving at arbitrary times, very
low overhead for even small payloads.  Items are appended to the work queue and are
processed in arrival order by one or more concurrent execution threads.

Similar to async.queue but much faster, less flaky, and with a simpler interface.


Benchmark
---------


Related Work
------------

- [quickq]() - this package
- [async.queue]() - in-memory work queue
- [fastq]() - async.queue clone, but much faster

