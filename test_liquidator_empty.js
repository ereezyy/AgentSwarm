const { fork } = require('child_process');
const child = fork('don/liquidator.js', ['test']);
child.on('message', console.log);
child.send({ type: 'PI_TRIGGER', action: 'LIQUIDATE_TARGET' });
setTimeout(() => child.kill(), 2000);
