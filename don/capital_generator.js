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

    // Wallet Guard
    const balance = await this.api.checkWalletBalance();
    if (balance === null || balance < 0.01) { // Requiring at least 0.01 SOL for gas/fees
      this.logger.error('Insufficient SOL balance or failed to check balance. Aborting Capital Generator.');
      return;
    }

    await this.scanForOpportunities();
    this.startCapitalGeneration();
  }

  async scanForOpportunities() {
    this.logger.log('Scanning for low-risk capital opportunities...');
    // Assuming scanDarkWebMarkets is implemented or monkey-patched elsewhere
    let opportunities = [];
    try {
      opportunities = await this.api.scanDarkWebMarkets({
        riskLevel: 'low',
        returnRate: 'minimal',
        type: ['microtransaction', 'data_resell', 'ad_fraud']
      });
    } catch (e) {
      this.logger.error(`Network failover: scanDarkWebMarkets failed. Falling back to empty array. Error: ${e.message}`);
      opportunities = [];
    }

    this.activeExploits = opportunities.slice(0, this.maxExploits).map(op => ({
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

        let safeId = exploit.id ? exploit.id.toString() : 'unknown';
        let safeType = exploit.type ? exploit.type.toString() : 'unknown';
        this.logger.log(`Executing ${safeType} exploit (ID: ${safeId})`);

        let result;
        try {
          // Assuming executeExploit is implemented or monkey-patched elsewhere
          result = await this.api.executeExploit(safeId, { stealth: true, timeout: 60000 });
        } catch (e) {
          this.logger.error(`Network failover: executeExploit failed for ${safeId}. Error: ${e.message}`);
          result = { success: false, error: 'Network failover triggered' };
        }

        if (result.success && result.profit > 0) {
          this.currentCapital += result.profit;
          exploit.status = 'completed';
          exploit.actualReturn = result.profit;
          this.logger.log(`Exploit ${exploit.id} succeeded. Profit: ${result.profit}. Total Capital: ${this.currentCapital}`);
        } else if (result.success && result.profit === 0) {
          exploit.status = 'monitor';
          this.logger.log(`Exploit ${exploit.id} active in monitor mode. No clear profit yet.`);
        } else {
          exploit.status = 'failed';
          this.logger.error(`Exploit ${safeId} failed/blocked: ${result.error || 'No profit returned'}`);
        }
      } catch (error) {
        exploit.status = 'error';
        let safeId = exploit.id ? exploit.id.toString() : 'unknown';
        this.logger.error(`Exploit ${safeId} crashed: ${error?.stack || error.message}`);
      }
    });

    await Promise.all(exploitPromises);
  }

  async startCapitalGeneration() {
    if (this.isRunning) return;
    this.isRunning = true;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.activeExploits.length === 0) {
      this.logger.warn('No opportunities available. Rescanning in 5 minutes...');
      this.isRunning = false;
      this.timeoutId = setTimeout(() => this.scanForOpportunities().then(() => this.startCapitalGeneration()), 300000);
      return;
    }

    try {
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
    } catch (e) {
      this.logger.error(`Error in startCapitalGeneration: ${e?.stack || e.message}`);
    } finally {
      this.isRunning = false;
      // Continue generation if under target
      this.timeoutId = setTimeout(() => this.scanForOpportunities().then(() => this.startCapitalGeneration()), 60000);
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
