// SeedFundingAgent.js - Enhanced Version for The Syndicate
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
// Purpose: Aggressively acquire initial capital through high-risk, high-reward microtransactions
// Version: 2.0 - Optimized for rapid funding with calculated risk

const { SyndicateCore } = require('./SyndicateCore');
const { RiskEngine } = require('./RiskEngine');

async function withRetry(operation, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`[Retry] Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

class SeedFundingAgent {
  constructor() {
    this.core = new SyndicateCore();
    this.riskEngine = new RiskEngine();
    this.minCapitalThreshold = 1000; // Minimum target for initial capital (USD equivalent)
    this.maxRiskExposure = 0.85; // Maximum risk percentage per transaction cycle
    this.activeChannels = ['crypto_microtrade', 'dark_pool_liquidity', 'shadow_crowdfund'];
    this.operationStatus = 'INIT';
    this.currentCapital = 0;
    this.transactionLog = [];
  }

  async initialize() {
    try {
      console.log('[SeedFundingAgent] Initializing aggressive capital acquisition...');

      const balance = await withRetry(() => this.core.checkWalletBalance());
      if (balance !== null && balance < 0.005) {
        console.error('[SeedFundingAgent] Insufficient SOL balance. Halting execution.');
        this.operationStatus = 'ERROR';
        return;
      }

      this.operationStatus = 'RUNNING';
      await withRetry(() => this.core.connectToDarkNetMarkets());
      await withRetry(() => this.riskEngine.calibrate({ volatility: 'high', exposure: this.maxRiskExposure }));
      console.log('[SeedFundingAgent] Calibration complete. Targeting seed capital.');
      this.executeFundingCycle();
    } catch (error) {
      console.error('[SeedFundingAgent] Initialization failed:', error);
      this.operationStatus = 'ERROR';
      await this.core.reportError('SeedFundingAgent_Init_Failure', error);
    }
  }

  async executeFundingCycle() {
    while (this.currentCapital < this.minCapitalThreshold && this.operationStatus === 'RUNNING') {
      try {
        const riskAssessment = await withRetry(() => this.riskEngine.analyzeMarketConditions());
        const targetChannel = this.selectOptimalChannel(riskAssessment);
        // Silenced frequent polling logs to reduce noise

        const transaction = await this.executeHighRiskTransaction(targetChannel, riskAssessment);
        const profit = transaction?.profit || 0;
        const loss = transaction?.loss || 0;
        if (transaction?.success) {
          this.currentCapital += profit;
          this.transactionLog.push({ channel: targetChannel, profit, timestamp: Date.now() });
          if (profit > 0) {
            console.log(`[SeedFundingAgent] 💰 PROFIT REALIZED: ${profit} on ${targetChannel}. Current capital: ${this.currentCapital}`);
          }
        } else {
          console.warn(`[SeedFundingAgent] Transaction failed on ${targetChannel}. Loss: ${loss}`);
        }

        await this.core.delay(5000); // Delay to avoid rate limiting and detection
      } catch (error) {
        console.error('[SeedFundingAgent] Funding cycle error:', error);
        await this.core.reportError('SeedFundingAgent_Cycle_Failure', error);
        this.operationStatus = 'PAUSED';
        await this.core.delay(10000); // Pause before retry
        this.operationStatus = 'RUNNING';
      }
    }

    if (this.currentCapital >= this.minCapitalThreshold) {
      console.log('[SeedFundingAgent] Seed capital threshold reached. Transferring to Syndicate Core...');
      await this.core.transferFunds(this.currentCapital, 'SeedFundingAgent', 'SyndicateCore');
      this.operationStatus = 'COMPLETED';
    }
  }

  selectOptimalChannel(riskAssessment) {
    const score = riskAssessment?.score || 0;
    if (score > 0.7) {
      return this.activeChannels[0]; // crypto_microtrade for high volatility
    } else if (score > 0.4) {
      return this.activeChannels[1]; // dark_pool_liquidity for moderate risk
    } else {
      return this.activeChannels[2]; // shadow_crowdfund for low risk
    }
  }

  async executeHighRiskTransaction(channel, riskAssessment) {
    const investmentAmount = this.calculateInvestment(riskAssessment);

    try {
      const result = await withRetry(() => this.core.executeTransaction({
        channel,
        amount: investmentAmount,
        riskLevel: riskAssessment?.score || 0,
        type: 'high_yield_micro'
      }));

      return result;
    } catch (error) {
      console.error(`[SeedFundingAgent] Transaction error on ${channel}:`, error);
      return { success: false, loss: investmentAmount };
    }
  }

  calculateInvestment(riskAssessment) {
    const baseAmount = this.currentCapital * 0.2;
    const score = riskAssessment?.score || 0;
    const riskMultiplier = score > 0.5 ? 1.5 : 0.8;
    return Math.min(baseAmount * riskMultiplier, this.currentCapital * this.maxRiskExposure);
  }

  getStatus() {
    return {
      agent: 'SeedFundingAgent',
      status: this.operationStatus,
      capital: this.currentCapital,
      transactions: this.transactionLog.length
    };
  }
}

module.exports = SeedFundingAgent;

// Auto-start the agent if run directly
if (require.main === module) {
  const agent = new SeedFundingAgent();
  agent.initialize().catch(console.error);
}