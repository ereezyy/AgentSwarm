jest.mock('axios', () => ({
    post: jest.fn()
}), { virtual: true });

jest.mock('dotenv', () => ({
    config: jest.fn()
}), { virtual: true });

const mockChalk = {
    hex: jest.fn().mockReturnThis(),
    bold: jest.fn().mockImplementation(s => s),
    red: jest.fn().mockImplementation(s => s)
};
jest.mock('chalk', () => mockChalk, { virtual: true });

const { formatWhaleMovement, formatCopyTradeSignal } = require('../signal_bot');

describe('Signal Bot Formatters', () => {
    describe('formatWhaleMovement', () => {
        test('should format correctly with full data', () => {
            const data = {
                whaleName: 'Test Whale',
                address: '0x123',
                amountSol: 100,
                tokenName: 'GOLD'
            };
            const output = formatWhaleMovement(data);
            expect(output).toContain('👤 <b>Whale:</b> Test Whale');
            expect(output).toContain('💳 <b>Wallet:</b> <code>0x123</code>');
            expect(output).toContain('📉 <b>Action:</b> Transacted <b>100 SOL</b>');
            expect(output).toContain('🔥 <b>Target:</b> <code>GOLD</code>');
            expect(output).toContain('https://solscan.io/account/0x123');
        });

        test('should handle missing metadata gracefully', () => {
            const data = {};
            const output = formatWhaleMovement(data);
            expect(output).toContain('👤 <b>Whale:</b> Unknown Wallet');
            expect(output).toContain('💳 <b>Wallet:</b> <code>Unknown</code>');
            expect(output).toContain('📉 <b>Action:</b> Transacted <b>0 SOL</b>');
            expect(output).toContain('🔥 <b>Target:</b> <code>Unknown</code>');
        });

        test('should suppress undefined behavior for critical fields', () => {
            const data = { address: '0xabc' };
            const output = formatWhaleMovement(data);
            expect(output).toContain('💳 <b>Wallet:</b> <code>0xabc</code>');
            expect(output).toContain('👤 <b>Whale:</b> Unknown Wallet');
            expect(output).toContain('🔥 <b>Target:</b> <code>Unknown</code>');
        });
    });

    describe('formatCopyTradeSignal', () => {
        test('should format correctly with full data', () => {
            const data = {
                whale: 'Mega Whale',
                mint: 'TokenMint123',
                detectedAmount: 50.123456,
                confidence: 'HIGH',
                riskScore: 0.85
            };
            const output = formatCopyTradeSignal(data);
            expect(output).toContain('🔥 <b>COPY-TRADE SIGNAL</b> 🔥');
            expect(output).toContain('🐋 <b>Whale:</b> Mega Whale');
            expect(output).toContain('🪙 <b>Token:</b> <code>TokenMint123</code>');
            expect(output).toContain('📊 <b>Amount:</b> 50.1235'); // toFixed(4)
            expect(output).toContain('🎯 <b>Confidence:</b> HIGH');
            expect(output).toContain('🛡️ <b>Risk Score:</b> 0.85');
            expect(output).toContain('https://dexscreener.com/solana/TokenMint123');
        });

        test('should handle missing metadata gracefully', () => {
            const data = { mint: 'MintXYZ' };
            const output = formatCopyTradeSignal(data);
            expect(output).toContain('⚡ <b>COPY-TRADE SIGNAL</b> ⚡'); // Default confidence is MEDIUM -> ⚡
            expect(output).toContain('🐋 <b>Whale:</b> Unknown');
            expect(output).toContain('📊 <b>Amount:</b> Analyzing...');
            expect(output).toContain('🎯 <b>Confidence:</b> MEDIUM');
            expect(output).toContain('🛡️ <b>Risk Score:</b> N/A');
        });
    });
});
