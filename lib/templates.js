/**
 * Task templates and yieldables for common patterns
 * Syntactic sugar, not extending Executioner functionality
 */
const Task = require('./task');
const utils = require('./utils');

const waiter = (ms) => new Promise((resolve) => {
    return setTimeout(resolve, ms);
});
const functor = (fns) => fns.map(function* (fn) {
    return yield fn();
});
const callback = function* (fn) {
    return yield new Promise((resolve, reject) => {
        fn((err, data) => {
            if (err != null) reject(err);
            resolve(data);
        });
    });
};
const spawn = (...args) => new Task(...args);
const sync = function* (yieldables) {
    if (!utils.isArray(yieldables)) return new Error('sync takes an array of yieldables');
    const res = new Array(yieldables.length);

    for (let i = 0; i < yieldables.length; i++) {
        res[i] = yield yieldables[i];
    }
    
    return yield res;
};

module.exports = {
    waiter, // Wait for N ms
    functor, // Handle array of functions that may return yieldables
    callback, // Node-style callback to yieldable
    spawn, // Shortcut to create a new Task
    sync, // Handle array of yieldables, yielding one at a time
    // Alias
    promisify: callback
};