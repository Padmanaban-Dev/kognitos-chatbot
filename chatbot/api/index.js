const https = require('https');
const url = require('url');

// Vercel Serverless Function
module.exports = (req, res) => {
    const ORG_ID = process.env.ORGANIZATION_ID;
    const WORKSPACE_ID = process.env.WORKSPACE_ID;
    const AUTOMATION_ID = process.env.AUTOMATION_ID;
    const API_TOKEN = process.env.API_TOKEN;

    const constructHeaders = () => ({
        'Authorization': `Bearer ${API_TOKEN}`,
        'Accept': '*/*',
        'Content-Type': 'application/json'
    });

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);

    // 1. Invoke Automation
    if (parsedUrl.pathname === '/api/invoke' && req.method === 'POST') {
        const payload = JSON.stringify({
            inputs: {
                "User Query": {
                    text: req.body.query
                }
            },
            stage: "AUTOMATION_STAGE_PUBLISHED"
        });

        const options = {
            hostname: 'app.us-1.kognitos.com',
            path: `/api/v1/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTOMATION_ID}:invoke`,
            method: 'POST',
            headers: { ...constructHeaders(), 'Content-Length': Buffer.byteLength(payload) }
        };

        const proxyReq = https.request(options, proxyRes => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                res.status(proxyRes.statusCode || 200).send(data);
            });
        });
        proxyReq.on('error', e => res.status(500).json({error: e.message}));
        proxyReq.write(payload);
        proxyReq.end();
        return;
    }

    // 2. Poll Status or Events
    if (parsedUrl.pathname.startsWith('/api/runs/')) {
        const parts = parsedUrl.pathname.split('/');
        const runId = parts[3];
        const isEvents = parts[4] === 'events';

        let targetPath = `/api/v1/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTOMATION_ID}/runs/${runId}`;
        if (isEvents) targetPath += '/events';
        
        if (req.query.page_token) {
            targetPath += `?page_token=${encodeURIComponent(req.query.page_token)}`;
        }

        const options = {
            hostname: 'app.us-1.kognitos.com',
            path: targetPath,
            method: 'GET',
            headers: constructHeaders()
        };

        const proxyReq = https.request(options, proxyRes => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                res.status(proxyRes.statusCode || 200).send(data);
            });
        });
        proxyReq.on('error', e => res.status(500).json({error: e.message}));
        proxyReq.end();
        return;
    }

    res.status(404).send('Not Found');
};
