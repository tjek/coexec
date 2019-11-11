/**
* Executioner: Test error propagation
* - Errors in top level
* - Errors in nested tasks
* - Errors in promises
* - Yielded Error objects
* - Nested errors
*/
const Executioner = require('../.');
const {Task} = Executioner;
const assert = require('assert');
const {waiter} = require('../lib/templates');

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

const execRetryOnce = new Executioner({
    name: 'retryOnce',
    silent: true,
    threads: 1,
    cores: 1,
    retries: 1,
    retryInterval: 5
});

const execTimeout = new Executioner({
    name: 'timeout',
    silent: true,
    threads: 1,
    retries: 0,
    cores: 1,
    timeout: 10
});

const execBigTimeout = new Executioner({
    name: 'timeout',
    silent: true,
    threads: 1,
    retries: 0,
    cores: 1,
    timeout: 10000
});


const failGenYield = (err) => new Task('fail', function* failGenYield() {
    yield new Error(err);
});

const failGenThrow = (err) => new Task('fail', function* failGenThrow() {
    throw new Error(err);
});

const failAndSucceed = (failures) => {
    return new Task('failAndSucceed', function* failAndSucceed() {
        failures--;
        if (failures === 0) return true;
        return yield new Error('err');
    });
};

const timeoutAndFail = new Task('timeoutAndFail', function* timeoutAndFail() {
    yield waiter(15);
    return true;
});

const timeoutAndFailTask = new Task({name: 'timeoutAndFailTask', timeout: 10}, function* timeoutAndFailTask() {
    yield waiter(30);
    return true;
});

const bigTimeoutAndNotFailTask = new Task({name: 'bigTimeoutAndNotFailTask', timeout: 1000}, function* bigTimeoutAndNotFailTask() {
    yield waiter(30);
    return true;
});

const nestTask = (data) => new Task('nested', function* () {
    return yield data;
});

const errAccumulator = (promises) => {
    return new Promise((resolve, reject) => {
        let count = promises.length;
        const errors = [];

        return promises.map((p) => {
            p.then(reject)
                .catch((err) => errors.push(err))
                .then(() => {
                    count--;
                    if (count === 0) {
                        return resolve(errors);
                    }
                });
        });
    });
};

function* nest(err) {
    throw new Error(err);
}

const nestedGenerator = new Task(function* nestedGenerator() {
    yield [nest('nested generator error')];
});

const nestedError = new Task(function* nestedError() {
    yield [function* nested() {
        yield new Error('nested');
    }];
});

const deepNestedError = new Task(function* deepNestedError() {
    yield function* _nest() {
        yield [function* __nest() {
            yield failGenYield('deep nested');
        }];
    };
});

const deeperNestedError = new Task(function* deeperNestedError() {
    yield function* _nest() {
        yield [function* () {
            yield new Task(function* __nest() {
                yield [failGenThrow('deeper nested')];
            });
        }];
    };
});

const tryCatchTask = new Task(function* tryCatchTask() {
    let data;

    try {
        // eslint-disable-next-line prefer-promise-reject-errors
        yield Promise.reject('fail');
        assert.fail('should catch the promise rejection error [0]');
    } catch (e) {
        assert.equal(e.message, 'fail', 'should catch the promise rejection error [1]');
    }
    data = yield 'data';
    assert.equal(data, 'data', 'error propagation should not interfere with yielders[0]');
    try {
        yield nestedError;
        assert.fail('should catch the nested task error [0]');
    } catch (e) {
        assert.equal(e[0][0].message, 'nested', 'should catch the nested task error [1]');
    }
    data = yield 'data';
    assert.equal(data, 'data', 'error propagation should not interfere with yielders[1]');
    try {
        yield new Error('fail[0]');
        assert.fail('should catch the yielded error [0]');
    } catch (e) {
        assert.equal(e.message, 'fail[0]', 'should catch yielding error object [0]');
    }
    try {
        yield new Error('fail[1]');
        assert.fail('should catch the yielded error [1]');
    } catch (e) {
        assert.equal(e.message, 'fail[1]', 'should catch yielding error object [1]');
    }
    data = yield 'data';
    assert.equal(data, 'data', 'error propagation should not interfere with yielders[2]');

    return true;
});

const tryCatchNested = new Task(function* tryCatchNested() {
    return yield function* _tryCatchNested() {
        try {
            yield nest('fail');
        } catch (e) {
            assert.equal(e.message, 'fail', 'should catch the correct error');
            return true;
        }
    };
});

const tryCatchMultiNested = new Task(function* tryCatchMultiNested() {
    return yield function* _tryCatchMultiNested() {
        try {
            yield function* __tryCatchMultiNested() {
                yield function* ___tryCatchMultiNested() {
                    throw new Error('fail');
                };
            };
        } catch (e) {
            assert.equal(e.message, 'fail', 'should catch the correct error');
            return yield true;
        }
    };
});

const tryCatchMultiNestedError = new Task(function* () {
    return yield function* () {
        try {
            yield function* () {
                yield function* () {
                    yield new Error('fail');
                };
            };
        } catch (e) {
            assert.equal(e.message, 'fail', 'should catch the correct error');
            return yield true;
        }
    };
});

describe('Executioner', () => {
    describe('Errors', () => {
        it('should catch and return top-level errors', () => {
            const promises = [];

            promises.push(execNoRetry.execute(failGenYield(5)));
            promises.push(execNoRetry.execute(failGenThrow(10)));
            promises.push(execNoRetry.execute(nestTask(failGenYield(15))));
            promises.push(execNoRetry.execute(nestTask(failGenThrow(20))));
            return errAccumulator(promises)
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
                    errors.map((err) => assert.equal(err.message, 10));
                });
        });
        it('should handle succeed after fail', () => {
            return execRetry.execute(failAndSucceed(11))
                .then((data) => assert.equal(data, true)).catch(assert.fail);
        });
        it('should not succeed without enough retries', () => {
            return execRetry.execute(failAndSucceed(12))
                .then(assert.fail)
                .catch((errors) => {
                    assert.equal(errors.length, 1 + 10);
                    errors.map((err) => assert.equal(err.message, 'err'));
                });
        });
        it('should timeout [exec config]', () => {
            return execTimeout.execute(timeoutAndFail)
                .then(assert.fail)
                .catch((errors) => {
                    assert.equal(errors.length, 1);
                    errors.map((err) => assert.equal(err.message, `timed out after ${execTimeout.config.timeout}`));
                });
        });
        it('should not timeout [exec config]', () => {
            return execBigTimeout.execute(timeoutAndFail)
                .catch(assert.fail);
        });
        it('should timeout [task config]', () => {
            return execRetry.execute(timeoutAndFailTask)
                .then(assert.fail)
                .catch((errors) => {
                    assert.equal(errors.length, 1 + 10);
                    errors.map((err) => assert.equal(err.message, `timed out after ${timeoutAndFailTask.config.timeout}`));
                });
        });
        it('should not timeout [task config]', () => {
            return execRetry.execute(bigTimeoutAndNotFailTask)
                .catch(assert.fail);
        });
    });
    describe('Nested Errors', () => {
        it('should support simple nested generators that fail', (done) => {
            execRetryOnce.execute(nestedGenerator)
                .then((data) => {
                    done(new Error('should catch/propagate nested errors in threads'));
                }).catch((errors) => {
                    for (const error of errors) {
                        assert.equal(error[0].message, 'nested generator error');
                    }
                    done();
                });
        });
        it('should catch errors from nested tasks', function (done) {
            execRetryOnce.execute(nestedError)
                .then((data) => {
                    done(new Error('should catch/propagate nested errors in threads'));
                }).catch((errors) => {
                    for (const error of errors) {
                        assert.equal(error[0].message, 'nested');
                    }
                    done();
                });
        });
        it('should catch errors from deep nested tasks', function (done) {
            execRetryOnce.execute(deepNestedError)
                .then((data) => {
                    done(new Error('should catch/propagate deep nested errors in threads'));
                }).catch((errors) => {
                    for (const error of errors) {
                        assert.equal(error[0][0].message, 'deep nested');
                    }
                    done();
                });
        });
        it('should catch errors from deeper nested tasks', function (done) {
            execRetryOnce.execute(deeperNestedError)
                .then((data) => {
                    done(new Error('should catch/propagate deeper nested errors in threads'));
                }).catch((errors) => {
                    for (const error of errors) {
                        assert.equal(error[0][0][0].message, 'deeper nested');
                    }
                    done();
                });
        });
    });
    describe('Error leniency', () => {
        it('should not fail for nested thrown exceptions within try/catch blocks', function (done) {
            execNoRetry.execute(tryCatchNested)
                .then((data) => {
                    assert.equal(data, true);
                    done();
                }).catch((errors) => {
                    done(new Error('should not fail'));
                });
        }).timeout(1000);
        it('should not fail for multi-nested thrown exceptions within try/catch blocks', function (done) {
            execNoRetry.execute(tryCatchMultiNested)
                .then((data) => {
                    assert.equal(data, true);
                    done();
                }).catch((errors) => {
                    done(errors[0] || 'should not fail');
                });
        }).timeout(1000);
        it('should not fail for multi-nested error yields within try/catch blocks', function (done) {
            execNoRetry.execute(tryCatchMultiNestedError)
                .then((data) => {
                    assert.equal(data, true);
                    done();
                }).catch((errors) => {
                    done(errors[0] || 'should not fail');
                });
        }).timeout(1000);
        it('should not fail for promise rejections within try/catch blocks', function (done) {
            execNoRetry.execute(tryCatchTask)
                .then((data) => {
                    assert.equal(data, true);
                    done();
                }).catch((errors) => {
                    done(new Error('should not fail'));
                });
        }).timeout(1000);
    });
});