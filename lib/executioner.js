const EventEmitter = require('events');
const utils = require('./utils');
const Process = require('./process');

const defaultConfiguration = {
    name: 'default', // Name of the executioner
    retries: 1, // Default number of retries before failure
    retryInterval: 200, // Interval between failure and start of retry in ms
    cores: 1, // Number of tasks run in parallel
    threads: 1, // Number of threads per task
    silent: false, // Mute logging
    pooling: true, // Keep pool of active tasks, throttle execution to those
    log: null // Custom log function, use with silent set to false
};

const configurationKeys = Object.keys(defaultConfiguration);

class Executioner extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = utils.clone(defaultConfiguration);
        // support new Executioner 'name'
        if (utils.isString(config)) {
            config = {name: config};
        }

        // apply configuration
        for (let k of configurationKeys) {
            if (config.hasOwnProperty(k)) {
                this.config[k] = config[k];
            }
        }
        this.name = this.config.name;
        if (this.config.silent === true) {
            this.log = (...args) => this.emit('log', ...args);
        } else if (utils.isFunction(this.config.log)) {
            this.log = this.config.log;
        }
        // Create chips
        this.mainChip = new Chip('main', this);
        this.subChip = new Chip('sub', this, {pooling: false});
        this.chips = [this.mainChip, this.subChip];

        this.mainChip.on('done', (msg) => {
            this.emit('done', msg);
        });
    }

    // Task -> Process
    execute(task, parentProcess = false, isSubprocess = false) {
        const executioner = task.config.executioner || this;
        const chip = isSubprocess === true ? executioner.subChip : executioner.mainChip;

        setImmediate(chip.cycle.bind(chip));
        return chip.addTask(task, parentProcess);
    }

    // Move process to sub-thread to avoid deadlocks
    moveProcessToSubChip(process) {
        const poolIndex = this.mainChip.pool.indexOf(process);

        if (poolIndex === -1) return false; // Process not found in main chip
        this.mainChip.pool.splice(poolIndex, 1); // Remove process from main chip
        this.subChip.pool.push(process); // Add process to sub chip
        process.chip = this.subChip; // Update the process
        this.subChip.cycle(); // Force a cycle to start the new process
    }

    log(...args) {
        console.log.apply(null, [`<exec::${this.name}>`].concat(args));
    }
}

class Chip extends EventEmitter {
    constructor(name, executioner, config = {}) {
        super();
        this.name = name;
        this.executioner = executioner;
        this.pool = [];
        this.busy = false;
        this.config = utils.clone(this.executioner.config);
        for (let k in config) {
            if (config.hasOwnProperty(k)) {
                this.config[k] = config[k];
            }
        }
        this.log = (...args) => {
            this.executioner.log.apply(this.executioner, [`[${this.name}]`].concat(args));
        };
    }

    cycle() {
        if (this.pool.length === 0) {
            if (this.busy) {
                this.busy = false;
                this.log('done');
                this.emit('done', {finished: true});
            }
            return;
        }

        let runningProcesses;

        this.busy = true;
        if (this.config.pooling === false) {
            runningProcesses = this.pool;
        } else {
            runningProcesses = this.pool.slice(0, this.config.cores);
            const heavy = runningProcesses.find((p) => p.heavy);

            if (heavy) runningProcesses = [heavy];
        }
        runningProcesses = runningProcesses.filter((p) => p.busy === false);
        const processesCompleted = [];
        const processesPromised = [];
        let shouldReCycle = false;

        for (let process of runningProcesses) {
            try {
                if (process.busy) continue;
                const res = process.cycle().next();

                if (res.value instanceof Promise) {
                    processesPromised.push(res.value);
                }
                if (res.done === true) {
                    this.log(`process ${process.name} completed in ${process.totalCycles} cycle${process.totalCycles > 1 ? 's' : ''}`);
                    processesCompleted.push(process);
                    process.resolve(res.value);
                }
                shouldReCycle = true;
            } catch (e) {
                process.addError(e);
                const failed = process.retry();

                if (failed === true) {
                    this.log(`process ${process.name} failed in cycle ${process.totalCycles}`);
                    processesCompleted.push(process);
                    shouldReCycle = true;
                    process.reject();
                } else {
                    processesPromised.push(process.pause(process.config.retryInterval)); // wait promise
                }
            }
        }

        // Remove completed tasks
        this.pool = this.pool.filter((p) => !processesCompleted.includes(p));

        // Wait for any promises that need resolving
        const reCycle = () => setImmediate(() => this.cycle.apply(this));

        if (processesPromised.length > 0) {
            processesPromised.map((p) => p.then(reCycle));
        }

        if (shouldReCycle) reCycle();
    }

    addTask(t, parentP = false) {
        const process = new Process(t, this, parentP);

        if ((parentP !== false) && (this.config.pooling !== false)) {
            const parentIndex = this.pool.indexOf(parentP || 0);

            this.pool.splice(parentIndex, 0, process);
        } else {
            this.pool.push(process);
        }

        this.log(`added process ${process.name}`);

        return process;
    }
}


// Expose Executioner class
module.exports = Executioner;