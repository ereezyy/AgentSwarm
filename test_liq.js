const cp = require('child_process');
const p = cp.fork('don/liquidator.js');
p.on('message', m => console.log('msg:', m));
p.send({type: 'PI_TRIGGER', action: 'LIQUIDATE_TARGET'});
setTimeout(() => p.kill(), 1000);
