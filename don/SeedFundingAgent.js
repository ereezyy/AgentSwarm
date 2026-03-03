// SeedFundingAgent.js - Enhanced Version for The Syndicate
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
// Purpose: Aggressively acquire initial capital through high-risk, high-reward microtransactions
// Version: 2.0 - Optimized for rapid funding with calculated risk

const { SyndicateCore } = require('./syndicate_core_impl');
const { RiskEngine } = require('./RiskEngine');

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

async function withRetry(fn, label) {
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            return await fn();
        } catch (e) {
            console.warn(`[SeedFundingAgent] ⚠️ ${label} attempt ${i + 1} failed: ${e.message}. Retrying...`);
            if (i < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
    }
    throw new Error(`${label} failed after ${MAX_RETRIES} attempts.`);
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
      this.operationStatus = 'RUNNING';

      const balance = await this.core.checkWalletBalance();
      if (balance === null || balance < 0.005) {
        console.error('[SeedFundingAgent] ❌ Insufficient balance for operations. Halting.');
        await this.core.reportError('SeedFundingAgent_Init_Failure', new Error('Insufficient balance'));
        this.operationStatus = 'ERROR';
        return;
      }

      await withRetry(() => this.core.connectToDarkNetMarkets(), 'ConnectDarkNet');
      await withRetry(() => this.riskEngine.calibrate({ volatility: 'high', exposure: this.maxRiskExposure }), 'RiskCalibrate');
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
        const riskAssessment = await withRetry(() => this.riskEngine.analyzeMarketConditions(), 'AnalyzeMarket');
        const targetChannel = this.selectOptimalChannel(riskAssessment);
        // Silenced frequent polling logs to reduce noise

        const transaction = await this.executeHighRiskTransaction(targetChannel, riskAssessment);
        if (transaction?.success) {
          this.currentCapital += (transaction?.profit || 0);
          this.transactionLog.push({ channel: targetChannel, profit: transaction?.profit || 0, timestamp: Date.now() });
          if ((transaction?.profit || 0) > 0) {
            console.log(`[SeedFundingAgent] 💰 PROFIT REALIZED: ${transaction.profit} on ${targetChannel}. Current capital: ${this.currentCapital}`);
          }
        } else {
          console.warn(`[SeedFundingAgent] Transaction failed on ${targetChannel}. Loss: ${transaction?.loss || 0}`);
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
      try {
        await withRetry(() => this.core.transferFunds(this.currentCapital, 'SeedFundingAgent', 'SyndicateCore'), 'TransferFunds');
        this.operationStatus = 'COMPLETED';
      } catch (error) {
        console.error('[SeedFundingAgent] Failed to transfer seed capital.', error);
        this.operationStatus = 'ERROR';
      }
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
      }), 'ExecuteTransaction');

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
const agent = new SeedFundingAgent();
agent.initialize().catch(console.error);