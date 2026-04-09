
const https = require('https');

const API_CONFIG = {
    ORG_ID: 'xdk36l7E1GbrEvfvYWgdq',
    WORKSPACE_ID: 'nUZWArSuILf11eyIA2Hwr',
    AUTOMATION_ID: 'Mrh1JhmrMNuR9pW64t3ca',
    API_TOKEN: 'kgn_pat_BoQfVHkVBgtppJEQiWGXdGupWoGJ7cvM9J9Sb7z1PQ19'
};

async function test() {
    console.log("1. Invoking Automation...");
    const invokePayload = JSON.stringify({
        inputs: { "User Query": { text: "check for priya mail id" } },
        stage: "AUTOMATION_STAGE_PUBLISHED"
    });

    const invokeRes = await request('POST', `app.us-1.kognitos.com`, `/api/v1/organizations/${API_CONFIG.ORG_ID}/workspaces/${API_CONFIG.WORKSPACE_ID}/automations/${API_CONFIG.AUTOMATION_ID}:invoke`, invokePayload);
    
    console.log("Invoke Response:", invokeRes);
    const runIdFull = invokeRes.run_id || invokeRes.name;
    if (!runIdFull) {
        console.error("Failed to get Run ID");
        return;
    }
    const runId = runIdFull.split('/').pop();
    console.log("Captured Run ID:", runId);

    console.log("2. Polling for results...");
    for (let i = 0; i < 10; i++) {
        const eventsRes = await request('GET', `app.us-1.kognitos.com`, `/api/v1/organizations/${API_CONFIG.ORG_ID}/workspaces/${API_CONFIG.WORKSPACE_ID}/automations/${API_CONFIG.AUTOMATION_ID}/runs/${runId}/events`);
        
        if (eventsRes && eventsRes.run_events) {
            console.log(`Poll ${i+1}: Received ${eventsRes.run_events.length} events.`);
            for (const evt of eventsRes.run_events) {
                if (evt.execution_journal && evt.execution_journal.node_executed) {
                    const outputs = evt.execution_journal.node_executed.outputs;
                    if (outputs) {
                        for (const key in outputs) {
                            if (key.includes('result') || key === 'answer' || key.includes('output')) {
                                console.log("FOUND DATA in Event:", JSON.stringify(outputs[key], null, 2));
                                if (JSON.stringify(outputs[key]).includes('priya.nair@mail.com')) {
                                    console.log("SUCCESS: Found Priya's email in events!");
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }
        await new Promise(r => setTimeout(r, 5000));
    }
    console.log("Finished polling. Could not find final result in 50 seconds.");
}

function request(method, hostname, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname,
            path,
            method,
            headers: {
                'Authorization': `Bearer ${API_CONFIG.API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            rejectUnauthorized: false
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

test();
