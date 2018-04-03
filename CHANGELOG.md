0.0.5 / 2018-04-03
==================

  * resolve possible deadlocks that occur from using `yield executioner.execute` from within a task

0.0.4 / 2018-01-12
==================

  * try/catch block functionality extended to support deep nested yields of isError objects and throws

0.0.3 / 2018-01-11
==================

  * try/catch block enclosed yields of error objects do not fail task

0.0.2 / 2017-12-01
==================

  * Better error handling / propagation for threads
  * More comprehensive tests for error handling
  * Retry strategies do not apply to task threads

0.0.1 / 2017-11-23
==================

  * Initial release