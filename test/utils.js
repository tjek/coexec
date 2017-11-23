/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
    Utils: all functionality
*/
describe('Utils', function() {
    const utils = require('../lib/utils');
    const Task = require('../lib/task');
    const assert = require('assert');

    describe('chunk', function() {
        it('should chunk empty array', function() {
            const chunked = utils.chunk([], 1);
            return assert.deepEqual(chunked, []);
    }); 
        return it('should chunk non-empty arrays', function() {
            let chunked = utils.chunk([0, 1, 2, 3, 4, 5], 2);
            assert.deepEqual(chunked, [[0,1], [2,3], [4,5]], 'splitting to arrays of 2');
            chunked = utils.chunk([0, 1, 2, 3, 4, 5], 6);
            assert.deepEqual(chunked, [[0, 1, 2, 3, 4, 5]], 'work with chunk size equal to that of the array');
            chunked = utils.chunk([0, 1, 2, 3, 4, 5], 10);
            return assert.deepEqual(chunked, [[0, 1, 2, 3, 4, 5]], 'work with chunk size greater than the array');
        });
    });
    describe('clone', () =>
        it('should make a swallow copy', function() {
            const o = {a: 1, b: 'two', c: {a: 'string'}};
            const cO = utils.clone(o);
            assert.deepEqual(o, cO, 'clone should have the same data');
            return assert.deepEqual(o === cO, false, 'clone should not be the same object');
        })
    );
    describe('isString', () =>
        it('should recognize strings', () => assert.equal(utils.isString('string'), true))
    );
    describe('isObject', () =>
        it('recognize simple objects', function() {
            assert.equal(utils.isObject({}), true, 'empty object');
            assert.equal(utils.isObject(Object.create(null)), true, 'empty object using Object.create');
            return assert.equal(utils.isObject(new Error('err')), false, 'should give false for Error objects');
        })
    );
    describe('isNumber', function() {
        it('recognizes numbers', function() {
            assert.equal(utils.isNumber(0), true, 'zero');
            assert.equal(utils.isNumber(-1), true, 'negative');
            return assert.equal(utils.isNumber(1), true, 'positive');
        });
        return it('recognizes non-numbers', function() {
            assert.equal(utils.isNumber(false), false, 'false boolean');
            assert.equal(utils.isNumber(true), false, 'true boolean');
            assert.equal(utils.isNumber(null), false, 'null');
            assert.equal(utils.isNumber(undefined), false, 'undefined');
            assert.equal(utils.isNumber({}), false, 'object');
            assert.equal(utils.isNumber('1'), false, 'string number');
            return assert.equal(utils.isNumber(Number.POSITIVE_INFINITY), false, 'string number');
        });
    });
    describe('isArray', () =>
        it('should recognize arrays', function() {
            assert.equal(utils.isArray([]), true);
            assert.equal(utils.isArray([0, 1, 2]), true);
            return assert.equal(utils.isArray(new Array(2)), true);
        })
    );
    describe('isFunction', () =>
        it('should recognize functions', function() {
            assert.equal(utils.isFunction(() => true), true);
            return assert.equal(utils.isFunction(utils.isFunction), true);
        })
    );
    describe('isError', () =>
        it('should recognize simple Error objects', function() {
            assert.equal(utils.isError(new Error('err')), true);
            return assert.equal(utils.isError({}), false);
        })
    );
    describe('isGenerator', () =>
        it('should recognize generators', () => assert.equal(utils.isGenerator((function*() { return yield true; })()), true))
    );
    describe('isGeneratorFn', () =>
        it('should recognize generator functions', () => assert.equal(utils.isGeneratorFn(function*() { return yield true; }), true))
    );
    describe('getType', () =>
        it('should recognize all types', function() {
            const dummyGeneratorFn = function*(){}
            const gen = utils.getType((function*() { return yield true; })());
            const genfn = utils.getType(function*() { return yield true; });
            const obj = utils.getType({});
            const fun = utils.getType(() => true);
            const val = utils.getType(5);
            const err = utils.getType(new Error('err'));
            const task = utils.getType(new Task(dummyGeneratorFn));
            const genArr = utils.getType([(function*() { return yield true; })(), (function*() { return yield true; })()]);
            const genfnArr = utils.getType([(function*() { return yield true; }), (function*() { return yield true; })]);
            const taskArr = utils.getType([new Task(dummyGeneratorFn), new Task(dummyGeneratorFn)]);
            const arr0 = utils.getType([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            const arr1 = utils.getType([new Task(dummyGeneratorFn), 1]);
            const arr2 = utils.getType([(function*() { return yield true; }), 1]);
            const arr3 = utils.getType([(function*() { return yield true; }), (function*() { return yield true; })()]);
            
            const actual = [gen, genfn, obj, fun, val, err, task, genArr, genfnArr, taskArr, arr0, arr1, arr2, arr3];
            const expected = ['generator', 'generatorFn', 'object', 'function', 'value', 'exception', 'task', 'array_generator', 'array_generatorFn', 'array_task', 'array', 'array', 'array', 'array'];

            return assert.deepEqual(actual, expected);
        })
    );
    return describe('inject', function() {
        it('should fail for invalid input', function() {
            assert.throws((() => utils.inject({})), Error, 'should not accept single arg');
            return assert.throws((() => utils.inject({}, {})), Error, 'should not accept non-string module');
        });
        it('should inject all fields safely', function() {
            const data = {a: [0, 1], b: {}, c: 'string'};
            const [a, b, c] = Array.from(utils.inject(data, 'a', 'b', 'c'));
            assert.equal(a, data.a);
            assert.equal(b, data.b);
            return assert.equal(c, data.c);
        });
        return it('should inject functions and bind them', function() {
            const scope = {a: 'apple', f() { return `eat an ${this.a}`; }};
            const [f] = Array.from(utils.inject(scope, 'f'));
            return assert.equal(f(), 'eat an apple');
        });
    });
});
