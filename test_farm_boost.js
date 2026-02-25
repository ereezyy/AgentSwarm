/**
 * test_farm_boost.js - Verify Phase 6 Multi-Platform Routing
 */
const { fork } = require('child_process');
const path = require('path');

const farmAgentPath = path.join(__dirname, 'don/farm_agent.js');
const agent = fork(farmAgentPath, ['TestNode'], { silent: false });

console.log('--- SYNDICATE FARM BOOST TEST ---');

setTimeout(() => {
    console.log('1. Testing TIKTOK routing...');
    agent.send({
        type: 'FARM_BOOST',
        url: 'https://www.tiktok.com/@eddywoods/video/123456789',
        platform: 'TIKTOK'
    });
}, 2000);

setTimeout(() => {
    console.log('2. Testing INSTAGRAM routing...');
    agent.send({
        type: 'FARM_BOOST',
        url: 'https://www.instagram.com/reels/123456789/',
        platform: 'INSTAGRAM'
    });
}, 5000);

setTimeout(() => {
    console.log('3. Testing Generic routing...');
    agent.send({
        type: 'FARM_BOOST',
        url: 'https://dexscanner.io/solana/5Q544fKr...',
        platform: 'DEXSCANNER'
    });
}, 8000);

setTimeout(() => {
    console.log('Tests dispatched. Checking logs...');
    setTimeout(() => {
        agent.kill();
        process.exit(0);
    }, 5000);
}, 10000);
