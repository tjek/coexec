const utils = require('./utils');

class Task {
    constructor(config = {}, fn, parent = false) {
        this.config = config;
        this.fn = fn;
        this.__fnArray = [];
        this.__parent = parent;

        // support new Task('name', function*)
        if (utils.isString(this.config)) {
            this.config = {
                name: this.config
            };
        }

        // support new Task(function*)
        if (utils.isGeneratorFn(this.config)) {
            this.__parent = this.fn;
            this.fn = this.config;
            this.config = {};
        }

        this.isRoot = !this.__parent;

        if (!utils.isObject(this.config) || !utils.isGeneratorFn(this.fn)) {
            throw new Error('invalid input');
        }

        this.name = this.config.name ? `<${this.config.name}>` : '<anon>';

        return this;
    }
}

// Expose Task class
module.exports = Task;