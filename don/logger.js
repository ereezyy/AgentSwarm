// don/logger.js
const chalk = require('chalk');

const logger = {
    info: (msg) => console.log(chalk.blue(`[INFO]: ${msg}`)),
    warn: (msg) => console.log(chalk.yellow(`[WARN]: ${msg}`)),
    error: (msg) => console.log(chalk.red(`[ERROR]: ${msg}`))
};

module.exports = logger;
