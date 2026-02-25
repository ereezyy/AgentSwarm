// don/syndicate_core.js - COMPATIBILITY SHIM
const { SyndicateCore } = require('./SyndicateCore');
const chalk = require('chalk');

class Logger {
    constructor(name) {
        this.name = name;
    }
    log(msg) {
        console.log(chalk.blue(`[${this.name}] [INFO]: ${msg}`));
    }
    warn(msg) {
        console.log(chalk.yellow(`[${this.name}] [WARN]: ${msg}`));
    }
    error(msg) {
        console.log(chalk.red(`[${this.name}] [ERROR]: ${msg}`));
    }
    info(msg) {
        this.log(msg);
    }
}

// Alias SyndicateCore as SyndicateAPI for Jules' legacy agents
const SyndicateAPI = SyndicateCore;

module.exports = { SyndicateCore, SyndicateAPI, Logger };
