0.1.5 / 2019-20-11
==================

* **Timeout**

    Timeout counting starts when a task get picked up, not when added to an executioner.

0.1.4 / 2019-11-11
==================

* Feature: **Timeout**

    Tasks "expire" and throw a "Timeout" error if config specified on an Executioner or Task level.

  * Better test coverage

    `92.78 -> 98.55` total coverage & 100% line coverage.

  * Cleanup of unreachable code

    Removed mostly obsolete safeguards.

0.1.2 / 2019-11-07
==================

* Update `eslint` & `mocha`, fix lint

0.1.1 / 2018-07-27
==================

* shortcut to execute generators and generator functions directly.

    Previously: `t = new Task(generator); executioner.execute(t);`

    Shortcut #1: `executioner.execute(generator);`

    Shortcut #2: `executioner.execute(generator(data));`

    **_NOTE: Shortcuts generate tasks with default configuration._**

0.1.0 / 2018-04-12
==================

* try/catch will catch yielded error objects or throws whether those are nested in yieldables or not; Errors bubble up and get caught
  * **BREAKING CHANGE:** removed functionality similar to implicit returns where if there is no return statement in a Generator the value of the last yield statement is returned

0.0.6 / 2018-04-09
==================

* fix resolve possible deadlocks that occur from using `yield executioner.execute` from within a task, support for arrays of processes, more tests

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
