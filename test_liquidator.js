const { fork } = require('child_process');
const child = fork('don/liquidator.js', ['test']);
child.on('message', console.log);
child.send({ type: 'PI_TRIGGER', action: 'LIQUIDATE_TARGET', account: "Acc", debtMint: "DebtMint", collateralMint: "CollateralMint", debtAmount: 100, collateralAmount: 200});
setTimeout(() => child.kill(), 2000);
