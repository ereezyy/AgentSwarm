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
  }

  async withNetworkFailover(operationName, primaryFn, fallbackFn) {
    let errorToThrow = null;
    let fallbackResult = null;
    try {
      return await primaryFn();
    } catch (e) {
      errorToThrow = e;
      this.logger.warn(`Network failover triggered for ${operationName} - Primary Failed: ${e?.message || e}`);
      if (fallbackFn) {
        try {
          fallbackResult = await fallbackFn();
          return fallbackResult;
        } catch (fbError) {
          const nestedMsg = fbError?.response?.data?.error || fbError?.response?.data?.msg || fbError?.message || fbError;
          this.logger.error(`Network failover failed for ${operationName} - Fallback Failed: ${nestedMsg}`);
          this.logger.error(`Stack trace: ${fbError?.stack || 'Not available'}`);
          throw fbError;
        }
      } else {
        const nestedMsg = e?.response?.data?.error || e?.response?.data?.msg || e?.message || e;
        this.logger.error(`Network failover failed for ${operationName} - No Fallback Available: ${nestedMsg}`);
        this.logger.error(`Stack trace: ${e?.stack || 'Not available'}`);
        throw e;
      }
    }
  }

  async initialize() {
    this.logger.log('Initializing Capital Generator...');

    // Strict Wallet Guard
    if (!process.env.SOLANA_PUBLIC_KEY) {
      this.logger.error('Wallet Guard Failed: SOLANA_PUBLIC_KEY is not defined in environment variables.');
      return;
    }

    try {
      const pubkey = new (require('@solana/web3.js').PublicKey)(process.env.SOLANA_PUBLIC_KEY);
      const balance = await this.api.connection.getBalance(pubkey);
      const minBalance = 0.015 * 1e9; // 0.015 SOL in lamports
      if (balance < minBalance) {
        this.logger.error(`Wallet Guard Failed: Insufficient SOL balance. Required: 0.015 SOL, Found: ${balance / 1e9} SOL.`);
        return;
      }
      this.logger.log(`Wallet Guard Passed: Found ${balance / 1e9} SOL.`);
    } catch (error) {
      this.logger.error(`Wallet Guard Failed: Error checking balance - ${error.message}`);
      return;
    }

    await this.scanForOpportunities();
    this.startCapitalGeneration();
  }

  async scanForOpportunities() {
    this.logger.log('Scanning for low-risk capital opportunities...');

    let opportunities = [];
    try {
      opportunities = await this.withNetworkFailover('scanDarkWebMarkets',
        () => this.api.scanDarkWebMarkets({
          riskLevel: 'low',
          returnRate: 'minimal',
          type: ['microtransaction', 'data_resell', 'ad_fraud']
        }),
        null // No explicit fallback method for scan in core yet
      );
    } catch (e) {
      this.logger.error(`Failed to scan for opportunities: ${e?.message || e}`);
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
      let result = null;
      try {
        exploit.status = 'running';
        this.logger.log(`Executing ${exploit.type} exploit (ID: ${exploit.id})`);

        result = await this.withNetworkFailover('executeExploit',
          () => this.api.executeExploit(exploit.id, { stealth: true, timeout: 60000 }),
          null // No explicit fallback exploit execution
        );

        if (result && result.success && result.profit > 0) {
          this.currentCapital += result.profit;
          exploit.status = 'completed';
          exploit.actualReturn = result.profit;
          this.logger.log(`Exploit ${exploit.id} succeeded. Profit: ${result.profit}. Total Capital: ${this.currentCapital}`);
        } else if (result && result.success && result.profit === 0) {
          exploit.status = 'monitor';
          this.logger.log(`Exploit ${exploit.id} active in monitor mode. No clear profit yet.`);
        } else if (result) {
          exploit.status = 'failed';
          this.logger.error(`Exploit ${exploit.id} failed/blocked: ${result.error || 'No profit returned'}`);
        }
      } catch (error) {
        exploit.status = 'error';
        const errorMsg = error?.response?.data?.error || error?.response?.data?.msg || error?.message || error;
        this.logger.error(`Exploit ${exploit.id} crashed: ${errorMsg}`);
        this.logger.error(`Stack trace: ${error?.stack || 'Not available'}`);
      }
    });

    await Promise.all(exploitPromises);
  }

  async startCapitalGeneration() {
    if (this.activeExploits.length === 0) {
      this.logger.warn('No opportunities available. Rescanning in 5 minutes...');
      setTimeout(() => this.scanForOpportunities().then(() => this.startCapitalGeneration()), 300000);
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
    setTimeout(() => this.scanForOpportunities().then(() => this.startCapitalGeneration()), 60000);
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
