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

    const balance = await this.api.checkWalletBalance();
    if (balance === null || balance < 0.01) {
      this.logger.error('Wallet balance too low or unavailable. Halting execution.');
      return;
    }

    await this.scanForOpportunities();
    this.startCapitalGeneration();
  }

  async scanForOpportunities() {
    this.logger.log('Scanning for low-risk capital opportunities...');
    let opportunities = [];

    try {
      // Assuming scanDarkWebMarkets is implemented or monkey-patched elsewhere
      opportunities = await this.api.scanDarkWebMarkets({
        riskLevel: 'low',
        returnRate: 'minimal',
        type: ['microtransaction', 'data_resell', 'ad_fraud']
      });
    } catch (e) {
      this.logger.error(`Failed to scan dark web markets: ${e.message}. Trying failover...`);
      try {
        opportunities = await this.api.scanDarkWebMarkets({
          riskLevel: 'low',
          returnRate: 'minimal',
          type: ['microtransaction'],
          fallback: true
        });
      } catch (fallbackError) {
        this.logger.error(`Failover scan failed: ${fallbackError.message}`);
      }
    }

    this.activeExploits = (opportunities || []).slice(0, this.maxExploits).map(op => ({
      id: op.id,
      type: op.type,
      expectedReturn: op.expectedReturn,
      risk: op.risk,
      status: 'pending'
    }));

    this.logger.log(`Found ${this.activeExploits.length} opportunities for capital generation.`);
  }

  async processExploits() {
    this.logger.log('Starting capital generation exploits...');
    const exploitPromises = this.activeExploits.map(async (exploit) => {
      try {
        exploit.status = 'running';
        this.logger.log(`Executing ${exploit.type} exploit (ID: ${exploit.id})`);

        let result;
        try {
          // Assuming executeExploit is implemented or monkey-patched elsewhere
          result = await this.api.executeExploit(exploit.id, { stealth: true, timeout: 60000 });
        } catch (execError) {
          this.logger.error(`Execute attempt failed for ${exploit.id}: ${execError.message}. Using fallback...`);
          result = await this.api.executeExploit(exploit.id, { stealth: true, timeout: 90000, fallback: true });
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
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      if (this.activeExploits.length === 0) {
        this.logger.warn('No opportunities available. Rescanning in 5 minutes...');
        this.timeoutId = setTimeout(() => this.scanForOpportunities().then(() => this.startCapitalGeneration()), 300000);
        this.isRunning = false;
        return;
      }

      await this.processExploits();

      // Clean up completed or failed exploits
      this.activeExploits = this.activeExploits.filter(exp => exp.status === 'pending' || exp.status === 'running');

      // Check if target profit is reached
      if (this.currentCapital >= this.targetProfit) {
        this.logger.log(`Target capital of ${this.targetProfit} reached. Transferring to Syndicate Sniper...`);
        await this.api.transferCapital('sniper', this.currentCapital);
        if (process.send) {
          process.send({ type: 'KICK_UP', amount: this.currentCapital, source: 'CAPITAL_GEN' });
        }
        this.currentCapital = 0;
        this.targetProfit *= 1.5; // Increase target for next round
      }

      // Continue generation if under target
      this.timeoutId = setTimeout(() => this.scanForOpportunities().then(() => this.startCapitalGeneration()), 60000);
    } finally {
      this.isRunning = false;
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
