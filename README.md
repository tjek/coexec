# Co-Executioner
[![NPM version](https://img.shields.io/npm/v/co-executioner.svg?style=flat)](https://npmjs.org/package/co-executioner)
[![Build Status](https://travis-ci.org/shopgun/coexec.svg?branch=master)](https://travis-ci.org/shopgun/coexec?branch=master)

Co-Executioner wraps around generator functions managing execution to regulate heavy tasks by providing multi-level, configurable pooling and retry strategies, while allowing for inline non-blocking code.

## Install

```
$ npm install co-executioner
```

## Tests

```
$ mocha
```

## Usage

Create an executioner
```js
const Executioner = require('co-executioner');
executioner = new Executioner('executioner 0');
```
Create a task
```js
const Task = Executioner.Task;
task = new Task('simple task', function*() {
  // Do async operations
  return data; // data to resolve
});
```
Execute the task
```js
const process = executioner.run(task);  // Returns Process
// Process implements then/catch as a native Promise
process.then((data) => {
  // data returned by the generator
});
process.catch((errors) => {
  // Array of errors, from every try/retry
});
```

## Basic yieldables

You can yield a variety of object types and they will be handled accordingly.

### Generator and Generator functions
When yielding a generator function, it is added to the process queue of the task and run until it is resolved.
*NOTE:* _If you want to actually return generator functions, you may wrap them in another object._
```js
...
data = yield function*() { return true };         // data = true
data = yield function*() { return true }();       // data = true
data = yield function*() { yield {               // data = function*
    data: function*(){ return true; }
  }
};
```
_The generator function will be executed in the same way as the base generator function, under the same task, using the same configuration._

### Promises
Yielding promises will return the resolved value, or throw an error when rejected.

### Tasks
Task objects that are `yield`, will run as sub-tasks, unless another executioner is set in its configuration.
```js
// data = data returned from anotherGenerator
let data = yield new Task('sub', function*() { yield anotherGenerator(); });
```

### Arrays
Arrays are tested to see if all elements are of one of the following types:
* Generator
* Generator Function
* Task
In each of the cases, the values will be resolved using threading.
Note: _An executioner may have a different count of threads and cores, arrays are parallelized using the number of threads, even tasks, unless tasks have a specified executioner_
```js
let power = function*(data) { return data * data; }
...
data = yield [0..10].map(power) // data = [0, 1, 4, 9, ...]
```

### Values
Executioner considers values any non-aforementioned types and will return them as they are.

## Retry

The number of retries and the interval between them can be specified both on an executioner and task level.
Once an Error object is yield or an exception is thrown, the executioner starts over the Process after waiting for an interval set in milliseconds and adds the error to a list.
When the maximum number of retries is reached, the process will reject passing the array of errors.
Note that nested Tasks will implement their retries individually, meaning that a yielded Task will not add to the number of retries of the parent Task.

Configuration parameters:
* `retries`: Number of retries before rejecting.
* `retryInterval`: Time to wait between failure and retry in ms.

## Configuration
Executioners and Tasks are configurable. For the shared parameters: `Default Executioner configuration < Executioner < Task`

Executioner configuration [`default values`]:
```js
name: String                 // Name of the executioner ['default']
retries: Number              // Number of retries before failure [1]
retryInterval: Number        // Interval between failure and start of retry in ms [200]
cores: Number                // Task pool size [1]
threads: Number              // Maximum threads per Process [1]
silent: Boolean              // Mute logging [false]
pooling: Boolean             // Keep pool of active tasks, throttle execution to those [true]
log: Function                // Custom log function, use with silent set to false
```
Task configuration
```js
name: String                 // Name of the task ['<anon>']
retries: Number              // Number of retries before failure
retryInterval: Number        // Interval between failure and start of retry in ms
threads: Number              // Maximum threads
heavy: Boolean               // If set to true, no other tasks will cycle while this Process is running
```

## Templates

Co-Executioner comes with a set of templates to serve common usage patterns.
You can easily access them as such:
```js
{Templates} = require('co-executioner');
```

### waiter(ms)
`waiter` can be yielded and it will wait for a set amount of ms before returning.

### functor([fns])
`functor` takes in an array of functions that may return yieldables. The result of the functions is returned in an ordered array. The functor allows for threading, so the functions will be pooled and executed in order and on demand. For example, if you have 2 threads and pass 10 functions to the functor, it will first execute 2 of them, and if they return a yieldable it will wait for it to resolve before executing the next function in the array.

### callback(function(cb){}) [alias:promisify]
`callback` (or `promisify`) takes in a node-style callback function and returns a yieldable. It will throw an error in case of non-null err.

### spawn(config, function*)
`spawn` is a shortcut of `new Task(...)`.

### sync([yieldable])
`sync` will `yield` each element of the array in sequence, one-by-one, and return an ordered array of the results.

## License
MIT