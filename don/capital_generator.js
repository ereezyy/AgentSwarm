// Capital Generator Agent v1.0
// Purpose: Generate starting capital for The Syndicate through microtransactions and low-risk exploits

const { SyndicateCore: SyndicateAPI } = require('./SyndicateCore');
const logger = require('./logger');
const { Connection, PublicKey } = require('@solana/web3.js');

const withRetry = async (fn, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(res => setTimeout(res, 1000 * (i + 1)));
    }
  }
};

class CapitalGenerator {
  constructor() {
    this.api = new SyndicateAPI();
    this.logger = logger;
    // Alias log to info for compatibility
    this.logger.log = this.logger.info;

    this.targetProfit = 1000; // Initial target in USD equivalent
    this.currentCapital = 0;
    this.activeExploits = [];
    this.maxExploits = 3; // Limit concurrent operations for safety
    this.isRunning = false;
    this.generationTimeout = null;
  }

  async initialize() {
    this.logger.log('Initializing Capital Generator...');
    await this.scanForOpportunities();
    this.startCapitalGeneration();
  }

  async scanForOpportunities() {
    this.logger.log('Scanning for low-risk capital opportunities...');
    try {
        const opportunities = await withRetry(() => this.api.scanDarkWebMarkets({
          riskLevel: 'low',
          returnRate: 'minimal',
          type: ['microtransaction', 'data_resell', 'ad_fraud']
        }));

        this.activeExploits = opportunities.slice(0, this.maxExploits).map(op => ({
          id: op.id,
          type: op.type,
          expectedReturn: op.expectedReturn,
          risk: op.risk,
          status: 'pending'
        }));

        this.logger.log(`Found ${this.activeExploits.length} opportunities for capital generation.`);
    } catch (error) {
        this.logger.error(`Failed to scan opportunities: ${error?.response?.data?.error || error?.response?.data?.msg || error?.stack || error.message}`);
    }
  }

  async processExploits() {
    this.logger.log('Starting capital generation exploits...');

    // Wallet guard
    let pubkeyStr = process.env.SOLANA_PUBLIC_KEY;
    if (!pubkeyStr) {
      this.logger.error("SOLANA_PUBLIC_KEY is missing. Aborting exploits.");
      return;
    }

    let balance = 0;
    try {
        balance = await withRetry(() => this.api.checkWalletBalance());
        if (balance === null) throw new Error("Primary balance check failed");
    } catch (err) {
        this.logger.warn("Primary balance check failed, falling back to mainnet-beta.");
        try {
            const fallbackConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
            const bal = await fallbackConnection.getBalance(new PublicKey(pubkeyStr));
            balance = bal / 1e9;
        } catch (fallbackErr) {
            this.logger.error(`Fallback balance check failed: ${fallbackErr?.stack || fallbackErr.message}`);
            return;
        }
    }

    if (balance < 0.005) {
        this.logger.error(`Insufficient SOL balance (${balance}) to execute exploits. Minimum required: 0.005 SOL.`);
        return;
    }

    const exploitPromises = this.activeExploits.map(async (exploit) => {
      try {
        exploit.status = 'running';
        this.logger.log(`Executing ${exploit.type} exploit (ID: ${exploit.id})`);

        const result = await withRetry(() => this.api.executeExploit(exploit.id, { stealth: true, timeout: 60000 }));
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
          this.logger.error(`Exploit ${exploit.id} failed/blocked: ${result.error || 'No profit returned'}`);
        }
      } catch (error) {
        exploit.status = 'error';
        this.logger.error(`Exploit ${exploit.id} crashed: ${error?.response?.data?.error || error?.response?.data?.msg || error?.stack || error.message}`);
      }
    });

    await Promise.all(exploitPromises);
  }

  async startCapitalGeneration() {
    if (this.isRunning) return;
    this.isRunning = true;
    if (this.generationTimeout) clearTimeout(this.generationTimeout);

    try {
        if (this.activeExploits.length === 0) {
          this.logger.warn('No opportunities available. Rescanning in 5 minutes...');
          this.generationTimeout = setTimeout(() => { this.isRunning = false; this.scanForOpportunities().then(() => this.startCapitalGeneration()); }, 300000);
          return;
        }

        await this.processExploits();

        // Clean up completed or failed exploits
        this.activeExploits = this.activeExploits.filter(exp => exp.status === 'pending' || exp.status === 'running');

        // Check if target profit is reached
        if (this.currentCapital >= this.targetProfit) {
          this.logger.log(`Target capital of ${this.targetProfit} reached. Transferring to Syndicate Sniper...`);
          await withRetry(() => this.api.transferCapital('sniper', this.currentCapital));
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
        this.generationTimeout = setTimeout(() => { this.scanForOpportunities().then(() => this.startCapitalGeneration()); }, 60000);
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
  start().catch(err => console.error('Fatal error in CapitalGenerator:', err?.stack || err.message));
}