/**
 * Executioner: Basic functionality
 * - Handling of all value types
 * - Handling of arrays of all value types
 * - Handling of nested tasks/generators
 */
const Executioner = require('../.');
const { Task } = Executioner;
const assert = require('assert');

const executioner = new Executioner({ name: 'executor', silent: true, retries: 0 });

const dataTask = data => {
    return new Task('dataTask', function* () {
        return data;
    });
};

const dataArrayTask = (fn, n) => {
    return new Task('dataTask', function* () {
        const arr = new Array(n + 1);
        for (let i = 0; i < arr.length; i++)
            arr[i] = fn(i);
        return arr;
    });
};

const sumTask = new Task('summation of nested fns', function* () {
    let res = 0;
    res += yield 5;
    res += yield dataTask(5);
    res += yield dataTask(function* () { return yield 5; });
    res += yield dataTask(dataTask(5));
    res += yield dataTask(dataTask(function* () { return yield 5; }));
    res += yield dataTask(function* () { return yield dataTask(function* () { return yield 5; }); });
    yield res;
});

// Test all supported value types
describe('Executioner', () => {
    describe('Value types', () => {
        it('should handle yield {number}', () => {
            executioner.execute(dataTask(5))
                .then(data => assert.equal(data, 5)).catch(assert.fail);
        });
        it('should handle yield {object}', () => {
            executioner.execute(dataTask({ field: 'value' }))
                .then(data => assert.deepEqual(data, { field: 'value' })).catch(assert.fail);
        });
        it('should handle yield [object]', () => {
            executioner.execute(dataTask([{ field: 'value', field: 'value' }]))
                .then(data => assert.deepEqual(data, [{ field: 'value', field: 'value' }]))
                .catch(assert.fail);
        });
        it('should handle yield [promises]', () => {
            executioner.execute(dataTask([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => Promise.resolve(i))))
                .then(data => assert.deepEqual(data, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
                .catch(assert.fail);
        });
        return it('should handle task/generator nesting and value returns', () => {
            executioner.execute(sumTask)
                .then(data => assert.deepEqual(data, 30, 'should return 30')).catch(assert.fail);
        });
    });

    describe('Array handling', () => {
        it('should handle yield [generator]', () =>
            executioner.execute(dataTask(dataArrayTask((i => function* () { return yield i; }), 10)))
                .then(res => assert.deepEqual(res, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
        );
        it('should handle yield [generatorFn]', () =>
            executioner.execute(dataTask(dataArrayTask((function* (i) { return yield i; }), 10)))
                .then(res => assert.deepEqual(res, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
        );
        it('should handle new Task [generator]', () =>
            executioner.execute(dataArrayTask((i => function* () { return yield i; }), 10))
                .then(res => assert.deepEqual(res, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
        );
        return it('should handle new Task [generatorFn]', () =>
            executioner.execute(dataArrayTask((function* (i) { return yield i; }), 10))
                .then(res => assert.deepEqual(res, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
        );
    });

    describe('Configuration', () => it('should run yielded tasks with executioner config passed as string [not supported]'));

    describe('Deadlocks', () => {
        const execA = new Executioner({ name: 'singleA', threads: 1, cores: 1, silent: true });
        const execB = new Executioner({ name: 'singleB', threads: 1, cores: 1, silent: true });
        it('should be able to yield tasks with cycling executioner refs (A -> B -> A)', () => {
            execA.execute(new Task('a', function* () {
                return yield new Task({ name: 'b', executioner: execB }, function* () {
                    return yield new Task({ name: 'aa', executioner: execA }, function* () {
                        return true;
                    });
                });
            }));
        });
        it('should be able to yield tasks with cycling exec refs (A -> B -> A -> B)', () => {
            execA.execute(new Task('a', function* () {
                return yield new Task({ name: 'b', executioner: execB }, function* () {
                    return yield new Task({ name: 'aa', executioner: execA }, function* () {
                        return yield new Task({ name: 'bb', executioner: execB }, function* () {
                            return true;
                        });
                    });
                });
            }));
        });
        return it('should be able to yield tasks with cycling exec refs (A -> [B, A] -> [[B, A], [A, B]])', function () {
            let taskRecursions = 200;
            var genTask = (execA, execB) => new Task('cycling', function* () {
                taskRecursions--;
                if (taskRecursions < 0) {
                    return true;
                }
                return yield [(genTask(execB, execA)), (genTask(execB, execA))];
            });
            return execA.execute(genTask(execA, execB));
        });
    });
});