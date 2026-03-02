const cp = require('child_process');
const liquidator = cp.fork('don/liquidator.js');
liquidator.send({
    type: 'PI_TRIGGER',
    action: 'LIQUIDATE_TARGET',
    account: 'victims_margin_account',
    debtMint: 'USDC_mint',
    collateralMint: 'SOL_mint',
    debtAmount: 100,
    collateralAmount: 10
});
setTimeout(() => liquidator.kill(), 2000);
