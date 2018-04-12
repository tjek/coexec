/**
 * Executioner: Templates
 */
const Executioner = require('../.');
const {MochaEventHandler} = require('./threading');
const {spawn, waiter, functor, sync, callback} = Executioner.Templates;
const assert = require('assert');

const dualCore = new Executioner({name: 'dual', silent: true, cores: 2, threads: 1});
const quadCore = new Executioner({name: 'quad', silent: true, cores: 4, threads: 4});
const eh = new MochaEventHandler();

const succeed = (p, done) => {
    const fail = (e) => {
        done(e);
        done = () => {};
    };

    p.catch(fail).then(fail);
};

const functorT = () => {
    return spawn(function* () {
        let fn = (d) => {
            eh.happened(`start${d}`);
            return function* () {
                eh.happened(`mid${d}`);
                const groupSize = 4;
                const waitGroup = Math.floor(d / groupSize);
                const waitTime = (40 + (100 * waitGroup)) - (10 * (waitGroup + 1) * (d % groupSize));

                yield waiter(waitTime);
                eh.happened(`end${d}`);
                return d;
            };
        };

        return yield functor([0, 1, 2, 3, 4, 5, 6, 7].map(fn));
    });
};

const waitAndDo = (ms, fn) => function* () {
    yield waiter(ms);
    return fn();
};

const cbFail = () => {
    return spawn('failCb', function* () {
        return yield callback((cb) => cb('fail'));
    });
};

const cbSucceed = (data) => {
    return spawn('succeedCb', function* () {
        return yield callback((cb) => cb(null, data));
    });
};

describe('Templates', () => {
    describe('waiter(ms), spawn(options, function*)', () =>
        it('should wait using the waiter', () => {
            let firstIsDone = false;
            let secondIsDone = false;
            const p1 = dualCore.execute(spawn(function* () {
                return yield waiter(20);
            })).then(() => {
                firstIsDone = true;
                assert.equal(secondIsDone, true, 'lower waiting time should be lower');
            });
            const p2 = dualCore.execute(spawn(function* () {
                return yield waiter(10);
            })).then(() => {
                secondIsDone = true;
                assert.equal(firstIsDone, false, 'higher waiting time should be higher');
            });

            return Promise.all([p1, p2]);
        })
    );
    describe('functor([...])', () => {
        it('should execute functions in serial order using functor', (done) => {
            eh.clear();
            succeed(dualCore.execute(functorT()).then((data) => {
                assert.deepEqual(data, [0, 1, 2, 3, 4, 5, 6, 7], 'should return data in correct order');
                const startEvents = eh.events.filter((ev) => ev.startsWith('start'));
                const midEvents = eh.events.filter((ev) => ev.startsWith('mid'));
                const endEvents = eh.events.filter((ev) => ev.startsWith('end'));

                assert.deepEqual(startEvents, ([0, 1, 2, 3, 4, 5, 6, 7].map((n) => `start${n}`)), 'should start in serial order');
                assert.deepEqual(midEvents, ([0, 1, 2, 3, 4, 5, 6, 7].map((n) => `mid${n}`)), 'should mid in serial order');
                assert.deepEqual(endEvents, ([0, 1, 2, 3, 4, 5, 6, 7].map((n) => `end${n}`)), 'should end in serial order');
            }), done);
        });
        it('should execute functions in batches using functor', (done) => {
            eh.clear();
            succeed(quadCore.execute(functorT()).then((data) => {
                assert.deepEqual(data, [0, 1, 2, 3, 4, 5, 6, 7], 'should return data in correct order');
                const startEvents = eh.events.filter((ev) => ev.startsWith('start'));
                const midEvents = eh.events.filter((ev) => ev.startsWith('mid'));
                const midEndEvents = eh.events.filter((ev) => !ev.startsWith('start'));
                const endEvents = eh.events.filter((ev) => ev.startsWith('end'));

                assert.deepEqual(startEvents, ([0, 1, 2, 3, 4, 5, 6, 7].map((n) => `start${n}`)), 'should start in serial order');
                assert.deepEqual(midEvents, ([0, 1, 2, 3, 4, 5, 6, 7].map((n) => `mid${n}`)), 'should mid in serial order');
                const expectedMidEndEvents = ['mid0', 'mid1', 'mid2', 'mid3', 'end3', 'mid4', 'end2', 'mid5', 'end1', 'mid6', 'end0', 'mid7', 'end7', 'end6', 'end5', 'end4'];

                assert.deepEqual(midEndEvents, expectedMidEndEvents, 'mid and end events should intermingle in correct order');
                assert.deepEqual(endEvents, ['end3', 'end2', 'end1', 'end0', 'end7', 'end6', 'end5', 'end4']);
            }), done);
        });
    });
    describe('sync([...]), functor([...])', () => {
        it('should one function at a time', (done) => {
            eh.clear();
            succeed(quadCore.execute(spawn(function* () {
                yield functor([waitAndDo(100, () => eh.happened('100')), waitAndDo(5, () => eh.happened('5'))]);
                yield sync([waitAndDo(100, () => eh.happened('100sync')), waitAndDo(5, () => eh.happened('5sync'))]);
            })).then(() => assert.deepEqual(eh.events, ['5', '100', '100sync', '5sync'])), done);
        });
        it('should return data in proper order', (done) => {
            eh.clear();
            succeed(quadCore.execute(spawn(function* () {
                const fns = [4, 3, 2, 1].map((n) => waitAndDo(10 * n, () => eh.happened(n)));
                const res = yield functor(fns);
                const resS = yield sync(functor(fns));

                return [res, resS];
            })).then((results) => {
                const [res, resS] = results;

                assert.deepEqual(res, [4, 3, 2, 1]);
                assert.deepEqual(resS, [4, 3, 2, 1]);
                assert.deepEqual(eh.events, [1, 2, 3, 4].concat([4, 3, 2, 1]));
            }), done);
        });
    });
    describe('callback(fn)', () => {
        it('should return yieldable that throws error', (done) => {
            dualCore.execute(cbFail()).then(() => {
                done('should have failed');
            }).catch(([err]) => {
                assert.equal(err.message, 'fail');
                done();
            });
        });
        it('should return yieldable that yields proper data', (done) => {
            succeed(dualCore.execute(cbSucceed({data: true})).then((data) => {
                assert.deepEqual(data, {data: true});
            }), done);
        });
    });
});