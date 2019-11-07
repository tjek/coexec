/**
 * Executioner: Basic functionality
 * - Handling of all value types
 * - Handling of arrays of all value types
 * - Handling of nested tasks/generators
 */
const Executioner = require('../.');
const {waiter} = require('../lib/templates');
const {Task} = Executioner;
const assert = require('assert');
const executioner = new Executioner({name: 'executor', silent: true, retries: 0});

const dataTask = (data) => {
    return new Task('dataTask', function* dataTask() {
        return yield data;
    });
};

const dataArrayTask = (fn, n) => {
    return new Task('dataTask', function* () {
        const arr = new Array(n + 1);

        for (let i = 0; i < arr.length; i++) {
            arr[i] = fn(i);
        }
        return yield arr;
    });
};

const sumTask = new Task('summation of nested fns', function* () {
    let res = 0;

    res += yield 5;
    res += yield dataTask(5);
    res += yield dataTask(function* () {
        return yield 5;
    });
    res += yield dataTask(dataTask(5));
    res += yield dataTask(dataTask(function* () {
        return yield 5;
    }));
    res += yield dataTask(function* () {
        return yield dataTask(function* () {
            return yield 5;
        });
    });

    return res;
});

// Test all supported value types
describe('Executioner', () => {
    describe('Configuration', () => {
        it('should accept string as config', () => {
            const exec = new Executioner('no-config');

            assert.equal(exec.config.name, 'no-config');
        });
        it('should accept accept custom logger', () => {
            const logs = [];
            const logger = (...args) => {
                logs.push(args.join(' '));
            };
            const exec = new Executioner({name: 'custom-logger', log: logger});

            const logProc = exec.execute(function* () {
                yield true;
                return true;
            }).then(() => {
                assert.equal(logs.length, 2, 'custom logger should capture logs');
            });

            return logProc;
        });
        it('should work with normal logger', () => {
            const exec = new Executioner({silent: false});
            const consoleLog = console.log;
            const logs = [];

            console.log = (...args) => {
                logs.push(args.join(' '));
            };

            exec.on('done', ()=> {
                console.log = consoleLog;
            });

            return exec.execute(function* () {
                yield true;
                return true;
            }).then(() => {
                assert.notEqual(logs.length, 0, 'overriden console.log should be utilized');
            });
        });
        it('should fail on invalid input [executioner]', () => {
            try {
                executioner.execute('string');
                assert.fail('should fail when string is passed as gfn/task');
            } catch (error) {
                assert.notEqual(error.message, 'should fail when string is passed as gfn/task');
            }
        });
        it('should fail on invalid input [task]', () => {
            try {
                executioner.execute(new Task('fail', 'string'));
                assert.fail('should fail when string is passed as gfn');
            } catch (error) {
                assert.notEqual(error.message, 'should fail when string is passed as gfn/task');
            }
        });
    });
    describe('Value types', () => {
        it('should handle yield {number}', () => {
            return executioner.execute(dataTask(5))
                .then((data) => assert.equal(data, 5)).catch(assert.fail);
        });
        it('should handle yield {literal}', () => {
            return executioner.execute(dataTask('5'))
                .then((data) => assert.equal(data, '5')).catch(assert.fail);
        });
        it('should handle yield {object}', () => {
            return executioner.execute(dataTask({field: 'value'}))
                .then((data) => assert.deepEqual(data, {field: 'value'})).catch(assert.fail);
        });
        it('should handle yield [{number}]', () => {
            return executioner.execute(dataTask([5]))
                .then((data) => assert.equal(data[0], 5)).catch(assert.fail);
        });
        it('should handle yield [{literal}]', () => {
            return executioner.execute(dataTask(['5']))
                .then((data) => assert.equal(data[0], '5')).catch(assert.fail);
        });
        it('should handle yield [object]', () => {
            return executioner.execute(dataTask([{field: 'value'}]))
                .then((data) => assert.deepEqual(data, [{field: 'value'}]))
                .catch(assert.fail);
        });
        it('should handle yield [promises]', () => {
            return executioner.execute(dataTask([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => Promise.resolve(i))))
                .then((data) => assert.deepEqual(data, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
                .catch(assert.fail);
        });
        it('should handle task/generator nesting and value returns', () => {
            return executioner.execute(sumTask)
                .then((data) => assert.deepEqual(data, 30, 'should return 30')).catch(assert.fail);
        });
        it('should handle yield [Error]', () => {
            return executioner.execute(function* () {
                yield function* () {
                    return new Error('Error');
                };

                return new Error('Error2');
            })
                .then(assert.fail)
                .catch((errors) => {
                    errors.map((e) => assert.equal(e.message, 'Error'));
                });
        });
    });

    describe('Array handling', () => {
        it('should handle yield [generator]', () => {
            return executioner.execute(dataTask(dataArrayTask(((i) => function* () {
                return yield i;
            }), 10)))
                .then((res) => assert.deepEqual(res, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
        });
        it('should handle yield [generatorFn]', () => {
            return executioner.execute(dataTask(dataArrayTask((function* (i) {
                return yield i;
            }), 10)))
                .then((res) => assert.deepEqual(res, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
        });
        it('should handle new Task [generator]', () => {
            return executioner.execute(dataArrayTask(((i) => function* () {
                return yield i;
            }), 10))
                .then((res) => assert.deepEqual(res, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
        });
        it('should handle new Task [generatorFn]', () => {
            return executioner.execute(dataArrayTask((function* (i) {
                return yield i;
            }), 10))
                .then((res) => assert.deepEqual(res, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
        });
    });

    describe('Shortcuts', () => {
        const g = function* () {
            return 5;
        };

        it('should execute Generator', (done) => {
            executioner.execute(g())
                .then((res) => {
                    assert.equal(res, 5);
                    done();
                })
                .catch(done);
        });
        it('should execute GeneratorFn', (done) => {
            executioner.execute(g)
                .then((res) => {
                    assert.equal(res, 5);
                    done();
                })
                .catch(done);
        });
    });
    describe('Process', () => {
        it('should be able to stop execution of process', () => {
            let value = true;
            const proc = executioner.execute(function* () {
                yield true;
                yield waiter(100);
                yield true;
                value = false;
            });

            setTimeout(proc.stop.bind(proc), 10);

            return proc.then(() => {
                assert.equal(value, true);
            });
        });
    });
    describe('Deadlocks', () => {
        const execA = new Executioner({name: 'singleA', threads: 1, cores: 1, silent: true});
        const execB = new Executioner({name: 'singleB', threads: 1, cores: 1, silent: true});

        it('should be able to yield tasks with cycling executioner refs (A -> B -> A)', () => {
            execA.execute(new Task('a', function* () {
                return yield new Task({name: 'b', executioner: execB}, function* () {
                    return yield new Task({name: 'aa', executioner: execA}, function* () {
                        return true;
                    });
                });
            }));
        });
        it('should be able to yield tasks with cycling exec refs (A -> B -> A -> B)', () => {
            execA.execute(new Task('a', function* () {
                return yield new Task({name: 'b', executioner: execB}, function* () {
                    return yield new Task({name: 'aa', executioner: execA}, function* () {
                        return yield new Task({name: 'bb', executioner: execB}, function* () {
                            return true;
                        });
                    });
                });
            }));
        });
        it('should be able to yield tasks with cycling exec refs (A -> [B, A] -> [[B, A], [A, B]])', function () {
            let taskRecursions = 200;
            const genTask = (execA, execB) => new Task('cycling', function* () {
                taskRecursions--;
                if (taskRecursions < 0) {
                    return true;
                }
                return yield [(genTask(execB, execA)), (genTask(execB, execA))];
            });

            return execA.execute(genTask(execA, execB));
        });
        it('should avoid deadlocks from functions that call executioner.execute', (done) => {
            const execSingle = new Executioner({name: 'single-thread', silent: true, cores: 1, threads: 1, retries: 0});
            const deadLockTask = new Task('deadlock', function* () {
                return yield execSingle.execute(dataTask(10));
            });

            execSingle.execute(deadLockTask).then((data) => {
                assert.equal(data, 10, 'should not lock and return proper data');
                done();
            });
        }).timeout(1000);
        it('should avoid deadlocks from functions that call executioner.execute [array]', () => {
            const execSingle = new Executioner({name: 'single-thread', silent: true, cores: 1, threads: 1, retries: 0});
            const deadLockTask = new Task('deadlock', function* () {
                const p1 = execSingle.execute(dataTask(10));

                return yield [p1];
            });

            return execSingle.execute(deadLockTask).then((data) => {
                assert.deepEqual(data, [10], 'should not lock and return proper data');
            });
        }).timeout(1000);
        it('should avoid simple deadlocks', () => {
            const execSingle = new Executioner({name: 'single-thread', silent: true, cores: 1, threads: 1, retries: 0});
            const deadLockTask = new Task('deadlock', function* () {
                yield new Task({name: 'deadlock_inner', executioner: execSingle}, function* () {
                    return true;
                });
            });

            execSingle.execute(deadLockTask);
        });
    });
});