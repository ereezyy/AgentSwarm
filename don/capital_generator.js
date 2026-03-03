// Capital Generator Agent v1.0
// Purpose: Generate starting capital for The Syndicate through microtransactions and low-risk exploits

const { SyndicateCore } = require('./SyndicateCore');
const logger = require('./logger');

class CapitalGenerator {
  constructor() {
    this.api = new SyndicateCore();
    this.logger = logger;
    // Alias log to info for compatibility
    this.logger.log = this.logger.info;

    this.targetProfit = 1000; // Initial target in USD equivalent
    this.currentCapital = 0;
    this.activeExploits = [];
    this.maxExploits = 3; // Limit concurrent operations for safety
    this.isRunning = false;
    this.timeoutId = null;
  }

  async initialize() {
    this.logger.log('Initializing Capital Generator...');

    // Wallet guard check
    const balance = await this.api.checkWalletBalance();
    if (balance === null || balance < 0.01) {
      this.logger.error(`Insufficient or missing SOL balance (${balance}). Requires >= 0.01 SOL to run.`);
      return;
    }

    await this.scanForOpportunities();
    this.startCapitalGeneration();
  }

  async scanForOpportunities() {
    this.logger.log('Scanning for low-risk capital opportunities...');

    try {
      // Assuming scanDarkWebMarkets is implemented or monkey-patched elsewhere
      const opportunities = await this.api.scanDarkWebMarkets({
        riskLevel: 'low',
        returnRate: 'minimal',
        type: ['microtransaction', 'data_resell', 'ad_fraud']
      });

      this.activeExploits = opportunities.slice(0, this.maxExploits).map(op => ({
        id: op.id,
        type: op.type,
        expectedReturn: op.expectedReturn,
        risk: op.risk,
        status: 'pending'
      }));

      this.logger.log(`Found ${this.activeExploits.length} opportunities for capital generation.`);
    } catch (error) {
      this.logger.error(`Error scanning for opportunities: ${error.message}`);
    }
  }

  async processExploits() {
    this.logger.log('Starting capital generation exploits...');
    const exploitPromises = this.activeExploits.map(async (exploit) => {
      try {
        exploit.status = 'running';
        this.logger.log(`Executing ${exploit.type} exploit (ID: ${exploit.id})`);
        // Assuming executeExploit is implemented or monkey-patched elsewhere
        let result;
        try {
          result = await this.api.executeExploit(exploit.id, { stealth: true, timeout: 60000 });
        } catch (apiError) {
          this.logger.error(`API Error executing exploit ${exploit.id}: ${apiError.message}`);
          result = { success: false, error: apiError.message };
        }

        if (result && result.success && result.profit > 0) {
          this.currentCapital += result.profit;
          exploit.status = 'completed';
          exploit.actualReturn = result.profit;
          this.logger.log(`Exploit ${exploit.id} succeeded. Profit: ${result.profit}. Total Capital: ${this.currentCapital}`);
        } else if (result && result.success && result.profit === 0) {
          exploit.status = 'monitor';
          this.logger.log(`Exploit ${exploit.id} active in monitor mode. No clear profit yet.`);
        } else {
          exploit.status = 'failed';
          this.logger.error(`Exploit ${exploit.id} failed/blocked: ${result?.error || 'No profit returned'}`);
        }
      } catch (error) {
        exploit.status = 'error';
        this.logger.error(`Exploit ${exploit.id} crashed: ${error.message}`);
      }
    });

    await Promise.all(exploitPromises);
  }

  async startCapitalGeneration() {
    if (this.isRunning) {
      this.logger.warn('Capital generation loop is already running. Skipping duplicate execution.');
      return;
    }
    this.isRunning = true;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    try {
      if (this.activeExploits.length === 0) {
        this.logger.warn('No opportunities available. Rescanning in 5 minutes...');
        this.timeoutId = setTimeout(() => {
          this.isRunning = false;
          this.scanForOpportunities().then(() => this.startCapitalGeneration());
        }, 300000);
        return;
      }

      await this.processExploits();

      // Clean up completed or failed exploits
      this.activeExploits = this.activeExploits.filter(exp => exp.status === 'pending' || exp.status === 'running');

      // Check if target profit is reached
      if (this.currentCapital >= this.targetProfit) {
        this.logger.log(`Target capital of ${this.targetProfit} reached. Transferring to Syndicate Sniper...`);
        try {
          await this.api.transferCapital('sniper', this.currentCapital);
          if (process.send) {
            process.send({ type: 'KICK_UP', amount: this.currentCapital, source: 'CAPITAL_GEN' });
          }
          this.currentCapital = 0;
          this.targetProfit *= 1.5; // Increase target for next round
        } catch (transferError) {
          this.logger.error(`Failed to transfer capital: ${transferError.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`Error in capital generation loop: ${err.message}`);
    } finally {
      // Continue generation if under target
      this.timeoutId = setTimeout(() => {
        this.isRunning = false;
        this.scanForOpportunities().then(() => this.startCapitalGeneration());
      }, 60000);
    }
  }

  getStatus() {
    return {
      currentCapital: this.currentCapital,
      targetProfit: this.targetProfit,
      activeExploits: this.activeExploits.length,
      totalExploits: this.activeExploits.length
    };
  }
}

// Export for Syndicate integration
module.exports = CapitalGenerator;

// Auto-start if run as main script
const start = async () => {
  const generator = new CapitalGenerator();
  await generator.initialize();
};
if (require.main === module) {
  start().catch(err => console.error('Fatal error in CapitalGenerator:', err));
}
