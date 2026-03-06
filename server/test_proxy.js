const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');

const proxyUrl = 'http://user-ajanstek_oYp4b-country-US:PgF8Xkmle=STXap5@dc.oxylabs.io:8000';
const agent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });

async function testProxy() {
    console.log("--- PROXY TEST START ---");
    console.log("Target: https://ip.oxylabs.io/location");
    console.log("Proxy:", proxyUrl);

    try {
        const start = Date.now();
        const response = await axios.get('https://ip.oxylabs.io/location', {
            httpsAgent: agent,
            proxy: false, // Tell axios not to use system proxy, we provide the agent
            timeout: 30000
        });
        const duration = Date.now() - start;

        console.log("\n✅ SUCCESS!");
        console.log("Status:", response.status);
        console.log("Response Time:", duration, "ms");
        console.log("Data:", JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error("\n❌ FAILED!");
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        } else {
            console.error("Error Code:", err.code);
            console.error("Message:", err.message);
        }

        if (err.code === 'ETIMEDOUT') {
            console.error("Suggestion: The connection to Oxylabs or the target site timed out. Check firewall or proxy credentials.");
        }
    }
    console.log("\n--- PROXY TEST END ---");
}

testProxy();
