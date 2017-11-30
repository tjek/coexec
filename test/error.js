/**
 * Executioner: Test error propagation
 * - Errors in top level
 * - Errors in nested tasks
 * - Errors in promises
 * - Yielded Error objects
 * - Nested errors
 */
const Executioner = require('../.');
const { Task } = Executioner;
const { functor, spawn } = Executioner.Templates;
const assert = require('assert');

const execNoRetry = new Executioner({
    name: 'no-retry',
    silent: true,
    threads: 1,
    cores: 1,
    retries: 0
});

const execRetry = new Executioner({
    name: 'retry',
    silent: true,
    threads: 1,
    cores: 1,
    retries: 10,
    retryInterval: 5
});

const failGenYield = err => new Task('fail', function* () {
    yield new Error(err);
});

const failGenThrow = err => new Task('fail', function* () {
    throw new Error(err);
});

const failAndSucceed = failures => {
    return new Task('failAndSucceed', function* () {
        failures--;
        if (failures === 0) return true;
        return yield new Error('err');
    });
};

const nestTask = data => new Task('nested', function* () { return yield data; });

const errAccum = promises => {
    return new Promise((resolve, reject) => {
        let count = promises.length;
        const errors = [];
        return promises.map((p) => {
            p.then(reject)
                .catch(err => errors.push(err))
                .then(() => {
                    count--;
                    if (count === 0) { return resolve(errors); }
                });
        });
    });
};

const nestedError = new Task(function* () {
    data = yield [(function* nested() { yield new Error('nested'); })];
});

describe('Executioner', () => {
    describe('Errors', () => {
        it('should catch and return top-level errors', () => {
            const promises = [];
            promises.push(execNoRetry.execute(failGenYield(5)));
            promises.push(execNoRetry.execute(failGenThrow(10)));
            promises.push(execNoRetry.execute(nestTask(failGenYield(15))));
            promises.push(execNoRetry.execute(nestTask(failGenThrow(20))));
            return errAccum(promises)
                .then((errors) => {
                    assert.equal(errors.length, promises.length, `should return ${promises.length} errors`);
                    assert.equal(errors[0][0].message, 5);
                    assert.equal(errors[1][0].message, 10);
                    // Errors coming from tasks are arrays of errors (because of retries)
                    assert.equal(errors[2][0][0].message, 15);
                    assert.equal(errors[3][0][0].message, 20);
                }).catch(assert.fail);
        });
        it('should retry proper amount of tries', () => {
            return execRetry.execute(failGenYield(10))
                .then(assert.fail)
                .catch((errors) => {
                    assert.equal(errors.length, 1 + 10);
                    errors.map(err => assert.equal(err.message, 10));
                })
        });
        it('should handle succeed after fail', () => {
            return execRetry.execute(failAndSucceed(11))
                .then(data => assert.equal(data, true)).catch(assert.fail)
        });
        it('should not succeed without enough retries', () => {
            return execRetry.execute(failAndSucceed(12))
                .then(assert.fail)
                .catch(errors => {
                    assert.equal(errors.length, 1 + 10);
                    errors.map(err => assert.equal(err.message, 'err'));
                });
        });
    });
    describe('Nested Errors', () => {
        it('should catch errors from nested tasks', function (done) {
            execRetry.execute(nestedError)
                .then((data) => {
                    done(new Error('should catch/propagate nested errors in threads'));
                }).catch(errors => {
                    for (error of errors)
                        assert.equal(error[0].message, 'nested')
                    done()
                });
        });
    });
});