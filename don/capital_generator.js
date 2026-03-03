// Capital Generator Agent v1.0
// Purpose: Generate starting capital for The Syndicate through microtransactions and low-risk exploits

const { SyndicateCore } = require('./SyndicateCore.js');
const logger = require('./logger');

class CapitalGenerator {
  constructor() {
    this.api = new SyndicateCore();
    this.logger = logger;
    // Alias log to info for compatibility
    this.logger.log = this.logger.info || console.log;

    this.targetProfit = 1000; // Initial target in USD equivalent
    this.currentCapital = 0;
    this.activeExploits = [];
    this.maxExploits = 3; // Limit concurrent operations for safety
    this.isRunning = false;
    this.timeoutId = null;
  }

  async withRetry(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        const backoff = Math.pow(2, i) * 1000;
        this.logger.log(`Operation failed, retrying in ${backoff}ms... (${error?.message || error})`);
        await new Promise(res => setTimeout(res, backoff));
      }
    }
  }

  async initialize() {
    this.logger.log('Initializing Capital Generator...');
    try {
      const balance = await this.api.checkWalletBalance();
      if (balance === null || balance < 0.01) {
        this.logger.log('Insufficient SOL balance or failed to check balance. Halting initialization.', 'ERROR');
        return;
      }
    } catch(e) {
      this.logger.log(`Failed to check wallet balance: ${e?.stack || e?.message}`, 'ERROR');
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
      opportunities = await this.withRetry(() => this.api.scanDarkWebMarkets({
        riskLevel: 'low',
        returnRate: 'minimal',
        type: ['microtransaction', 'data_resell', 'ad_fraud']
      }));
    } catch(e) {
      this.logger.log(`Error scanning dark web markets: ${e?.stack || e?.message}`, 'ERROR');
    }

    // Default opportunities to [] to prevent crashes
    opportunities = opportunities || [];

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
        this.logger.log(`Executing ${exploit.type} exploit (ID: ${exploit.id})`);
        // Assuming executeExploit is implemented or monkey-patched elsewhere
        const result = await this.withRetry(() => this.api.executeExploit(exploit.id, { stealth: true, timeout: 60000 }));

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
          this.logger.log(`Exploit ${exploit.id} failed/blocked: ${result?.error || 'No profit returned'}`, 'ERROR');
        }
      } catch (error) {
        exploit.status = 'error';
        this.logger.log(`Exploit ${exploit.id} crashed: ${error?.stack || error?.message}`, 'ERROR');
      }
    });

    await Promise.all(exploitPromises);
  }

  async startCapitalGeneration() {
    if (this.isRunning) {
        return;
    }
    this.isRunning = true;

    if (this.activeExploits.length === 0) {
      this.logger.log('No opportunities available. Rescanning in 5 minutes...', 'WARN');
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
        await this.withRetry(() => this.api.transferCapital('sniper', this.currentCapital));
      } catch(e) {
        this.logger.log(`Failed to transfer capital: ${e?.stack || e?.message}`, 'ERROR');
      }

      if (process.send) {
        process.send({ type: 'KICK_UP', amount: this.currentCapital, source: 'CAPITAL_GEN' });
      }
      this.currentCapital = 0;
      this.targetProfit *= 1.5; // Increase target for next round
    }

    // Continue generation if under target
    this.timeoutId = setTimeout(() => {
        this.isRunning = false;
        this.scanForOpportunities().then(() => this.startCapitalGeneration());
    }, 60000);
  }

  getStatus() {
    return {
      currentCapital: this.currentCapital,
      targetProfit: this.targetProfit,
      activeExploits: this.activeExploits.length,
      totalExploits: this.activeExploits.length,
      isRunning: this.isRunning
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
  start().catch(err => console.log(`Fatal error in CapitalGenerator: ${err?.stack || err?.message}`, 'ERROR'));
}
