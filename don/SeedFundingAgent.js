// SeedFundingAgent.js - Enhanced Version for The Syndicate
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
// Purpose: Aggressively acquire initial capital through high-risk, high-reward microtransactions
// Version: 2.0 - Optimized for rapid funding with calculated risk

const { SyndicateCore } = require('./syndicate_core');
const { RiskEngine } = require('./RiskEngine');

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
    let loopErrorCount = 0;
    while (this.currentCapital < this.minCapitalThreshold && this.operationStatus === 'RUNNING') {
      let riskAssessment = null;
      let targetChannel = null;
      try {
        // Wallet guard: Check balance before executing transactions
        let solBalance = 0;
        try {
          const balance = await this.core.checkWalletBalance();
          solBalance = balance || 0;
        } catch (balanceError) {
          console.warn(`[SeedFundingAgent] Wallet balance check failed. Using fallback 0.`, balanceError?.message);
        }

        if (solBalance < 0.01) {
          console.warn(`[SeedFundingAgent] Wallet guard triggered. Insufficient SOL balance: ${solBalance}. Pausing cycle...`);
          await this.core.delay(10000);
          continue;
        }

        riskAssessment = await this.riskEngine.analyzeMarketConditions();
        targetChannel = this.selectOptimalChannel(riskAssessment);
        // Silenced frequent polling logs to reduce noise

        const transaction = await this.executeHighRiskTransaction(targetChannel, riskAssessment);
        if (transaction.success) {
          // Initialize profit just in case it's undefined
          const profit = typeof transaction.profit === 'number' && !isNaN(transaction.profit) ? transaction.profit : 0;
          this.currentCapital += profit;
          this.transactionLog.push({ channel: targetChannel, profit: profit, timestamp: Date.now() });
          if (profit > 0) {
            console.log(`[SeedFundingAgent] 💰 PROFIT REALIZED: ${profit} on ${targetChannel}. Current capital: ${this.currentCapital}`);
          }
        } else {
          console.warn(`[SeedFundingAgent] Transaction failed on ${targetChannel}. Loss: ${transaction.loss || 0}`);
        }

        loopErrorCount = 0; // reset on success
        await this.core.delay(5000); // Delay to avoid rate limiting and detection
      } catch (error) {
        loopErrorCount++;
        const errorMessage = error?.response?.data?.error || error?.response?.data?.msg || error?.message || 'Unknown error';
        console.error(`[SeedFundingAgent] Funding cycle error: ${errorMessage}`);

        try {
           await this.core.reportError('SeedFundingAgent_Cycle_Failure', error);
        } catch (reportError) {
           console.error('[SeedFundingAgent] Failed to report error:', reportError?.message);
        }

        if (loopErrorCount > 5) {
            console.error('[SeedFundingAgent] Too many consecutive failures. Pausing operations...');
            this.operationStatus = 'PAUSED';
            await this.core.delay(30000); // Pause longer before retry
            this.operationStatus = 'RUNNING';
            loopErrorCount = 0;
        } else {
            await this.core.delay(10000); // Pause before retry
        }
      }
    }

    if (this.currentCapital >= this.minCapitalThreshold) {
      console.log('[SeedFundingAgent] Seed capital threshold reached. Transferring to Syndicate Core...');
      try {
        await this.core.transferFunds(this.currentCapital, 'SeedFundingAgent', 'SyndicateCore');
      } catch (err) {
        console.error('[SeedFundingAgent] Failed to transfer seed capital.', err?.message);
      }
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
      // API Network failover simulated/handled gracefully inside executeTransaction
      const result = await this.core.executeTransaction({
        channel,
        amount: investmentAmount,
        riskLevel: riskAssessment?.score || 0,
        type: 'high_yield_micro'
      });

      return result;
    } catch (error) {
      const errorMessage = error?.response?.data?.error || error?.response?.data?.msg || error?.message || 'Unknown error';
      console.error(`[SeedFundingAgent] Transaction error on ${channel}: ${errorMessage}`);
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