/**
 * Executioner: Event emission
 * - on 'done' event
 */
const Executioner = require('../.');
const {Task} = Executioner;
const assert = require('assert');

const executioner = new Executioner({silent: true});

describe('Executioner', () => {
    describe('Events', () => {
        it('should emit \'done\' event', (done) => {
            let isDone = false;

            executioner.on('done', () => isDone = true);
            const t = new Task('simple', function* () {
                return yield 5;
            });

            executioner.execute(t).then().catch().then(() => {
                assert.equal(isDone, false, 'should not emit \'done\' before all tasks are resolved');
                setImmediate(() => assert.equal(isDone, true, 'should emit \'done\' after all tasks are resolved'));
                done();
            });
        });
    });
});