const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Prioritize process.env (for Vercel/Production) then fallback to manual .env parsing (for Local)
let env = process.env;
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const parts = line.trim().split('=');
            if (parts.length >= 2) {
                env[parts[0]] = parts.slice(1).join('=');
            }
        });
    }
} catch (e) {
    // Silent fail if .env is missing, which is expected on Vercel
}

const ORG_ID = env['ORGANIZATION_ID'];
const WORKSPACE_ID = env['WORKSPACE_ID'];
const AUTOMATION_ID = env['AUTOMATION_ID'];
const API_TOKEN = env['API_TOKEN'];
const PORT = env['PORT'] || 3000;

// Host as per the user's provided code (api.kognitos.com)
const KOGNITOS_HOST = 'api.kognitos.com';

const constructHeaders = () => ({
    'Authorization': `Bearer ${API_TOKEN}`,
    'Accept': '*/*',
    'Content-Type': 'application/json'
});

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 1. Invoke Automation
    if (req.url.startsWith('/api/invoke') && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const parsed = JSON.parse(body);
            const payload = JSON.stringify({
                inputs: {
                    "User Query": {
                        text: parsed.query
                    }
                },
                stage: "AUTOMATION_STAGE_PUBLISHED"
            });

            const options = {
                hostname: 'app.us-1.kognitos.com',
                path: `/api/v1/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTOMATION_ID}:invoke`,
                method: 'POST',
                headers: { ...constructHeaders(), 'Content-Length': Buffer.byteLength(payload) },
                rejectUnauthorized: false
            };

            const proxyReq = https.request(options, proxyRes => {
                let data = '';
                proxyRes.on('data', chunk => data += chunk);
                proxyRes.on('end', () => {
                    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
                    res.end(data);
                });
            });
            proxyReq.on('error', e => { 
                console.error('Invoke Proxy Error:', e.message);
                res.writeHead(500); 
                res.end(JSON.stringify({error: e.message})); 
            });
            proxyReq.write(payload);
            proxyReq.end();
        });
        return;
    }

    // 2. Poll Status or 3. Get Events
    // User's pattern for Status: GET https://api.kognitos.com/api/v1/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/runs/${run_id}
    if (req.url.startsWith('/api/runs/') && req.method === 'GET') {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const parts = urlObj.pathname.split('/');
        const runId = parts[3];
        const isEvents = parts[4] === 'events';

        let targetPath = `/api/v1/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTOMATION_ID}/runs/${runId}`;
        
        // Handling events if requested separately for our specific UI streaming logic
        if (isEvents) {
            targetPath = `/api/v1/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTOMATION_ID}/runs/${runId}/events`;
        }

        if (urlObj.searchParams.has('page_token')) {
            targetPath += `?page_token=${encodeURIComponent(urlObj.searchParams.get('page_token'))}`;
        }

        const options = {
            hostname: 'app.us-1.kognitos.com',
            path: targetPath,
            method: 'GET',
            headers: constructHeaders(),
            rejectUnauthorized: false
        };

        const proxyReq = https.request(options, proxyRes => {
            let data = '';
            proxyRes.on('data', chunk => data += chunk);
            proxyRes.on('end', () => {
                res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
                res.end(data);
            });
        });
        proxyReq.on('error', e => { 
            console.error('Status/Events Proxy Error:', e.message);
            res.writeHead(500); 
            res.end(JSON.stringify({error: e.message})); 
        });
        proxyReq.end();
        return;
    }

    // Serve static files
    let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('Not found');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });

});

server.listen(PORT, () => {
    console.log(`Native Node Kognitos Server running on http://localhost:${PORT}`);
});
