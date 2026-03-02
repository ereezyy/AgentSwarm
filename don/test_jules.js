const axios = require('axios');

const API_KEY = 'AQ.Ab8RN6IXr9kwsabtAwXnWklcnqamKQ7eqGL3r13j8JsrAMS7LQ';
const BASE_URL = 'https://jules.googleapis.com/v1alpha';

async function findSource() {
    try {
        let nextPageToken = null;
        let found = false;
        do {
            const url = `${BASE_URL}/sources` + (nextPageToken ? `?pageToken=${nextPageToken}` : '');
            const response = await axios.get(url, {
                headers: {
                    'X-Goog-Api-Key': API_KEY
                }
            });
            const sources = response.data.sources || [];
            const agentSwarmSource = sources.find(s => s.githubRepo && s.githubRepo.repo === 'AgentSwarm');
            if (agentSwarmSource) {
                console.log('FOUND:', JSON.stringify(agentSwarmSource, null, 2));
                found = true;
                break;
            }
            nextPageToken = response.data.nextPageToken;
        } while (nextPageToken);

        if (!found) {
            console.log('AgentSwarm source not found.');
        }
    } catch (error) {
        console.error('Error listing sources:', error.response ? error.response.data : error.message);
    }
}

findSource();
