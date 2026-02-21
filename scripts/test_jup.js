const axios = require('axios');

async function testJup() {
    console.log('Testing Jupiter Quote API...');
    const mint = 'Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump';
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${WSOL_MINT}&outputMint=${mint}&amount=10000000&slippageBps=1000`;

    try {
        const resp = await axios.get(quoteUrl, { timeout: 10000 });
        console.log('Success:', resp.data.outAmount);
    } catch (e) {
        console.error('Failed:', e.message);
        if (e.response) console.log('Response Status:', e.response.status);
    }
}

testJup();
