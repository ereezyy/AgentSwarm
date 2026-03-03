// SeedFundingAgent.js - Enhanced Version for The Syndicate
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
// Purpose: Aggressively acquire initial capital through high-risk, high-reward microtransactions
// Version: 2.0 - Optimized for rapid funding with calculated risk

const { SyndicateCore } = require('./SyndicateCore.js');
const { RiskEngine } = require('./RiskEngine.js');

async function withRetry(operation, maxRetries = 3, baseDelay = 1000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      console.error(`[RetryHelper] Attempt ${attempt} failed:`, error.message);
      if (attempt >= maxRetries) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));
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

      const balance = await this.core.checkWalletBalance();
      if (balance !== null && balance < 0.005) {
          console.error('[SeedFundingAgent] Insufficient SOL balance to operate. Halting initialization.');
          this.operationStatus = 'HALTED';
          return;
      }

      this.operationStatus = 'RUNNING';
      await this.core.connectToDarkNetMarkets();
      await this.riskEngine.calibrate({ volatility: 'high', exposure: this.maxRiskExposure });
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
        const riskAssessment = await this.riskEngine.analyzeMarketConditions();
        const targetChannel = this.selectOptimalChannel(riskAssessment);
        // Silenced frequent polling logs to reduce noise

        const transaction = await this.executeHighRiskTransaction(targetChannel, riskAssessment);
        if (transaction?.success) {
          const profit = transaction?.profit || 0;
          this.currentCapital += profit;
          this.transactionLog.push({ channel: targetChannel, profit: profit, timestamp: Date.now() });
          if (profit > 0) {
            console.log(`[SeedFundingAgent] 💰 PROFIT REALIZED: ${profit} on ${targetChannel}. Current capital: ${this.currentCapital}`);
          }
        } else {
          const loss = transaction?.loss || 0;
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
    const { score } = riskAssessment;
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
        riskLevel: riskAssessment.score,
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
    const riskMultiplier = riskAssessment.score > 0.5 ? 1.5 : 0.8;
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

// Auto-start the agent
if (require.main === module) {
  const agent = new SeedFundingAgent();
  agent.initialize().catch(console.error);
}