const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const historyList = document.getElementById('history-list');
const newChatBtn = document.getElementById('new-chat-btn');
const welcomeScreen = document.getElementById('welcome-screen');

let conversations = JSON.parse(localStorage.getItem('kognitos_chats') || '[]');
let currentChatId = null;
let isRunning = false;
let currentBotMsgEl = null;

init();

function init() {
    renderHistory();
    initTheme();
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';
        sendBtn.disabled = !userInput.value.trim();
    });
    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } 
    });
    newChatBtn.addEventListener('click', startNewChat);
    
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    
    // Use delegation for history items (more robust for dynamic content)
    historyList.addEventListener('click', (e) => {
        const item = e.target.closest('.history-item');
        if (!item) return;
        
        const chatId = item.dataset.id;
        
        // Check if delete button was clicked
        if (e.target.closest('.delete-chat-btn')) {
            e.stopPropagation();
            deleteConversation(chatId);
        } else if (e.target.closest('.history-item-content')) {
            loadChat(chatId);
        }
    });

    document.getElementById('clear-history-btn').addEventListener('click', clearAllConversations);
}

function renderHistory() {
    historyList.innerHTML = '';
    // Pull fresh from storage to be absolutely sure
    conversations = JSON.parse(localStorage.getItem('kognitos_chats') || '[]');
    
    conversations.sort((a,b) => b.updatedAt - a.updatedAt).forEach(chat => {
        const item = document.createElement('div');
        item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.dataset.id = chat.id;
        
        item.innerHTML = `
            <div class="history-item-content">
                <i class="fa-regular fa-message"></i>
                <span>${escapeHTML(chat.title)}</span>
            </div>
            <button class="delete-chat-btn" title="Delete Chat">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;

        historyList.appendChild(item);
    });
}

function deleteConversation(id) {
    if (confirm('Delete this AI chat?')) {
        conversations = conversations.filter(c => c.id !== id);
        localStorage.setItem('kognitos_chats', JSON.stringify(conversations));
        if (currentChatId === id) {
            startNewChat();
        } else {
            renderHistory();
        }
    }
}

function clearAllConversations(e) {
    if (e) e.stopPropagation();
    if (conversations.length === 0) return;
    if (confirm('Are you sure you want to clear ALL chat history?')) {
        conversations = [];
        localStorage.setItem('kognitos_chats', JSON.stringify(conversations));
        startNewChat();
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('kognitos_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('kognitos_theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#theme-toggle i');
    if (theme === 'dark') {
        icon.className = 'fa-solid fa-sun';
    } else {
        icon.className = 'fa-solid fa-moon';
    }
}

function startNewChat() {
    currentChatId = null;
    chatHistory.innerHTML = '';
    chatHistory.appendChild(welcomeScreen);
    welcomeScreen.classList.remove('hidden');
    renderHistory();
}

function loadChat(id) {
    const chat = conversations.find(c => c.id === id);
    if (!chat) return;
    currentChatId = id;
    chatHistory.innerHTML = '';
    welcomeScreen.classList.add('hidden');
    chat.messages.forEach(msg => appendMessage(msg.role, msg.content));
    renderHistory();
}

function saveMessage(role, content) {
    if (!currentChatId) {
        currentChatId = Date.now().toString();
        const title = typeof content === 'string' ? content.substring(0, 30) : 'AI Request';
        conversations.push({ id: currentChatId, title, updatedAt: Date.now(), messages: [] });
    }
    const chat = conversations.find(c => c.id === currentChatId);
    if (chat) {
        chat.messages.push({ role, content });
        chat.updatedAt = Date.now();
        localStorage.setItem('kognitos_chats', JSON.stringify(conversations));
        renderHistory();
    }
}

function setPrompt(text) {
    userInput.value = text;
    userInput.dispatchEvent(new Event('input'));
}

function appendMessage(role, content) {
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    const outer = document.createElement('div');
    outer.className = `message-outer ${role}`;
    outer.innerHTML = `
        <div class="message-inner">
            <div class="avatar"><i class="fa-solid ${role === 'user' ? 'fa-user' : 'fa-robot'}"></i></div>
            <div class="content">${formatResultUI(content)}</div>
        </div>
    `;
    chatHistory.appendChild(outer);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return outer;
}

function createBotMessageWithTracker() {
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    const outer = document.createElement('div');
    outer.className = `message-outer bot`;
    outer.innerHTML = `
        <div class="message-inner">
            <div class="avatar"><i class="fa-solid fa-robot"></i></div>
            <div class="content">
                <div class="typing-area">Analyzing your request...</div>
                <div class="activity-tracker">
                    <div class="activity-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <div class="header-left">
                            <i class="fa-solid fa-microchip fa-spin" style="color:var(--accent)"></i>
                            <span class="pipeline-style">AI Execution Pipeline</span>
                        </div>
                        <i class="fa-solid fa-chevron-up"></i>
                    </div>
                    <div class="pipeline-progress-container">
                        <div class="pipeline-progress-bar" id="p-bar"></div>
                    </div>
                    <div class="activity-body"></div>
                </div>
                <div class="final-result-area"></div>
                <div class="source-section"></div>
            </div>
        </div>
    `;
    chatHistory.appendChild(outer);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return outer;
}

function logActivity(botEl, text, status = 'active') {
    const body = botEl.querySelector('.activity-body');
    const line = document.createElement('div');
    line.className = `activity-line ${status}`;
    
    // Create timestamp
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Node ID (mocked for "realness")
    const nodeID = 'N-' + Math.floor(Math.random() * 9000 + 1000);
    
    // Map technical steps to the user's specific terminology
    let display = text;
    if (text.includes('Processing')) {
        const step = text.replace('Processing ', '');
        display = `Dynamically classifying ${step}`;
    } else if (text.includes('data point')) {
        display = `Metadata Extracted: Intent Mapping Successful`;
    }
    
    line.innerHTML = `
        <span class="pipeline-timestamp">[${time}]</span>
        <span class="pipeline-node">[${nodeID}]</span>
        <span class="pipeline-text">${display}...</span>
    `;
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
    
    // Update progress bar
    const bar = botEl.querySelector('#p-bar');
    if (bar) {
        const count = body.children.length;
        const progress = Math.min(count * 15, 95); 
        bar.style.width = progress + '%';
    }
}

function formatResultUI(data) {
    if (!data) return "";
    let parsed = parseKognitosValue(data);
    
    // If it's a string, it might be a JSON string from a Kognitos text field
    if (typeof parsed === 'string' && (parsed.trim().startsWith('{') || parsed.trim().startsWith('['))) {
        try {
            const nested = JSON.parse(parsed);
            if (nested && typeof nested === 'object') parsed = nested;
        } catch(e) {}
    }

    if (typeof parsed === 'string') return `<p>${escapeHTML(parsed)}</p>`;

    // Special Check for Kognitos Finalized JSON Output (as per user request)
    const isFinalized = parsed && typeof parsed === 'object' && 
        (parsed['query'] || parsed['Query'] || parsed['response_text'] || parsed['Response text'] || parsed['json_output']);

    if (isFinalized) {
        const finalData = parsed['json_output'] || parsed;
        return renderFinalizedDetails(finalData);
    }

    // If it's a simple object, use the premium Metrics Grid
    if (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0 && Object.keys(parsed).length < 10) {
        let html = '<div class="finalized-container"><div class="finalized-header"><i class="fa-solid fa-circle-info"></i> Processed Information</div><div class="finalized-metrics-grid">';
        for (const [k, v] of Object.entries(parsed)) {
            html += `<div class="finalized-metric-item"><div class="finalized-label">${k.replace(/_/g, ' ')}</div><div class="finalized-value">${escapeHTML(String(v))}</div></div>`;
        }
        html += '</div></div>';
        return html;
    }

    const tableContent = formatTableHTML(data);
    return `<div class="result-card"><div class="result-header"><i class="fa-solid fa-table"></i> Processed Information</div><div class="query-result-table-wrapper" style="margin-top:10px;">${tableContent}</div></div>`;
}

function renderFinalizedDetails(json) {
    const metrics = [
        { key: 'Query', label: 'USER QUERY', span: 2 },
        { key: 'Question count', label: 'QUESTION COUNT', span: 1 },
        { key: 'Response text', label: 'AI RESPONSE', span: 2 },
        { key: 'Result row count', label: 'RECORDS FOUND', span: 1 }
    ];

    let html = `<div class="finalized-container">`;
    html += `<div class="finalized-header"><i class="fa-solid fa-circle-info"></i> Processed Information</div>`;
    
    // Top Grid for Metrics
    html += `<div class="finalized-metrics-grid">`;
    metrics.forEach(m => {
        // Find value with either exact key or lowercase key
        let val = json[m.key] !== undefined ? json[m.key] : json[m.key.toLowerCase()];
        if (val === undefined) {
             const snake = m.key.toLowerCase().replace(/\s+/g, '_');
             val = json[snake];
        }
        val = val !== undefined ? val : '-';
        
        html += `
            <div class="finalized-metric-item" style="grid-column: span ${m.span}">
                <div class="finalized-label">${m.label}</div>
                <div class="finalized-value">${escapeHTML(String(val))}</div>
            </div>
        `;
    });
    html += `</div>`;

    // Dynamic Discovery: Show EVERY other piece of data Kognitos provides
    // We don't want to "distinct" or hide anything
    for (const key in json) {
        // Skip keys already shown in the metrics or technical keys
        const lowKey = key.toLowerCase();
        if (['query', 'response_text', 'question_count', 'result_row_count', 'json_output'].includes(lowKey)) continue;
        
        const val = json[key];
        if (val === null || val === undefined || val === '-') continue;

        const flat = flattenKognitosTable(val);
        
        // If it's a table (list of objects)
        if (Array.isArray(flat) && flat.length > 0 && typeof flat[0] === 'object' && flat[0] !== null) {
            html += `
                <div class="finalized-table-section">
                    <div class="finalized-label" style="margin-top: 24px; margin-bottom: 12px;">${key.toUpperCase().replace(/_/g, ' ')}</div>
                    <div class="query-result-section">
                        <div class="query-result-table-wrapper">
                            ${formatTableHTML(flat)}
                        </div>
                    </div>
                </div>
            `;
        } else {
            // If it's a single value or short list not already in metrics
            html += `
                <div class="finalized-table-section" style="margin-top: 15px;">
                    <div class="finalized-label">${key.toUpperCase().replace(/_/g, ' ')}</div>
                    <div class="finalized-value" style="margin-top: 5px; font-weight: 500;">${escapeHTML(String(val))}</div>
                </div>
            `;
        }
    }

    html += `</div>`;
    return html;
}

function flattenKognitosTable(data) {
    if (!Array.isArray(data)) return [data];
    if (data.length === 0) return [];
    
    // Check if the first item is a primitive or another array
    if (Array.isArray(data[0])) {
        // It's a nested list, flatten and recurse
        return data.flatMap(item => flattenKognitosTable(item));
    }
    
    // If it's a list of objects, we're good
    if (typeof data[0] === 'object' && data[0] !== null) {
        return data;
    }
    
    // Fallback
    return data;
}

async function handleSend() {
    const text = userInput.value.trim();
    if (!text || isRunning) return;

    appendMessage('user', text);
    saveMessage('user', text);
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;
    isRunning = true;

    currentBotMsgEl = createBotMessageWithTracker();
    
    try {
        const invokeRes = await fetch('/api/invoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: text }) });
        const invokeData = await invokeRes.json();
        const runId = (invokeData.run_id || invokeData.name).split('/').pop();
        await pollRun(runId, currentBotMsgEl);
    } catch (err) {
        const area = currentBotMsgEl.querySelector('.final-result-area');
        area.innerHTML = `<p style="color:red">Error: ${err.message}</p>`;
        if (currentBotMsgEl.querySelector('.typing-area')) currentBotMsgEl.querySelector('.typing-area').remove();
        isRunning = false;
    }
}

async function pollRun(runId, botEl) {
    let completed = false;
    let lastExtraction = null;
    let pageToken = '';
    const finalArea = botEl.querySelector('.final-result-area');
    const sourceArea = botEl.querySelector('.source-section');
    const typing = botEl.querySelector('.typing-area');
    const tracker = botEl.querySelector('.activity-tracker');

    while (!completed) {
        try {
            const eventsRes = await fetch(`/api/runs/${runId}/events${pageToken ? '?page_token=' + encodeURIComponent(pageToken) : ''}`);
            if (eventsRes.ok) {
                const data = await eventsRes.json();
                if (data.run_events) {
                    for (const evt of data.run_events) {
                        const journal = evt.execution_journal;
                        if (!journal || !journal.node_executed) continue;
                        const node = journal.node_executed;

                        if (node.book_function_call) {
                            const raw = node.book_function_call.book_function?.function_name || 'step';
                            const clean = raw.replace(/x[0-9A-Fa-f]{2}/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
                            if (typing) typing.textContent = `Running ${clean}...`;
                            logActivity(botEl, `Processing ${clean}`);
                        }
                        
                        const outputs = node.outputs;
                        if (outputs) {
                            for(const k in outputs) {
                                const technical = ['user_query','window_fn','detection_result','bounding_box','verification','metadata','fields','document','metrics','confidence'];
                                if(technical.includes(k)) continue;
                                const parsed = parseKognitosValue(outputs[k]);
                                if (parsed && (Array.isArray(parsed) || k === 'answer')) {
                                    lastExtraction = outputs[k];
                                    logActivity(botEl, `Collected new data point`, 'done');
                                }
                            }
                        }
                    }
                    if (data.next_page_token) pageToken = data.next_page_token;
                }
            }

            const runRes = await fetch(`/api/runs/${runId}`);
            if (runRes.ok) {
                const run = await runRes.json();
                if (run.state && (run.state.completed || run.state.failed)) {
                    completed = true;
                    if (typing) typing.remove();
                    tracker.classList.add('collapsed');
                    const neuroHeader = tracker.querySelector('.pipeline-style');
                    if (neuroHeader) {
                        neuroHeader.textContent = 'Pipeline Success';
                        tracker.querySelector('.header-left i').className = 'fa-solid fa-circle-check';
                        tracker.querySelector('.header-left i').style.color = '#10b981';
                    }
                    if (tracker.querySelector('#p-bar')) tracker.querySelector('#p-bar').style.width = '100%';

                    if (run.state.completed) {
                        const outputs = run.state.completed.outputs;
                        let outcomeContent = "";
                        let savedContent = "";
                        
                        // Check for the specific finalized JSON output first (user requirement)
                        if (outputs.json_output) {
                            outcomeContent = formatResultUI(outputs.json_output);
                            savedContent = outputs.json_output;
                        } else {
                            // If json_output is missing, scan all outputs for the finalized structure
                            for (const k in outputs) {
                                const val = parseKognitosValue(outputs[k]);
                                // Try to see if this output item is a JSON string or object matching our structure
                                let testObj = val;
                                if (typeof testObj === 'string' && testObj.trim().startsWith('{')) {
                                    try { testObj = JSON.parse(testObj); } catch(e) {}
                                }
                                
                                if (testObj && typeof testObj === 'object' && (testObj.query || testObj.Query || testObj.response_text)) {
                                    outcomeContent = formatResultUI(testObj);
                                    savedContent = testObj;
                                    break;
                                }
                            }
                        }

                        if (!outcomeContent) {
                            let metricsHtml = "";
                            const metrics = [];
                            for (const k in outputs) {
                                const val = parseKognitosValue(outputs[k]);
                                if (typeof val === 'number' || (typeof val === 'string' && /^\d+$/.test(val))) {
                                    metrics.push({ label: k.replace(/_/g, ' '), value: val });
                                }
                            }
                            
                            if (metrics.length > 0) {
                                metricsHtml = `<div class="metrics-grid">` + 
                                    metrics.map(m => `<div class="metric-pill"><span class="m-val">${m.value}</span><span class="m-lab">${m.label}</span></div>`).join('') +
                                    `</div>`;
                            }

                            let primaryText = "";
                            if (outputs.answer) {
                                primaryText = formatResultUI(outputs.answer);
                                savedContent = outputs.answer;
                            } else if (outputs.response_text) {
                                const txt = typeof outputs.response_text === 'object' ? outputs.response_text.text : outputs.response_text;
                                primaryText = `<div class="result-card"><div class="result-header"><i class="fa-solid fa-circle-check"></i> AI Process Success</div><div class="result-body">${escapeHTML(txt)}</div></div>`;
                                savedContent = txt;
                            }

                            if (primaryText) {
                                outcomeContent = metricsHtml + primaryText;
                            } else if (lastExtraction) {
                                const tableHtml = formatTableHTML(lastExtraction);
                                outcomeContent = metricsHtml + `
                                    <div class="query-result-section">
                                        <div class="query-result-header"><i class="fa-solid fa-database"></i> Query Result</div>
                                        <div class="query-result-table-wrapper">${tableHtml}</div>
                                    </div>
                                `;
                                if (!savedContent) savedContent = lastExtraction;
                            }
                        }

                        if (!outcomeContent) {
                            outcomeContent = `<div class="result-card"><div class="result-body">AI processed your request but returned no specific data.</div></div>`;
                        }

                        finalArea.innerHTML = outcomeContent;
                        saveMessage('bot', savedContent);

                        // Technical View
                        const showTechnical = json['json_output'] || lastExtraction;
                        if (showTechnical) {
                            const rawId = `raw-${Date.now()}`;
                            sourceArea.innerHTML = `
                                <button class="source-btn" onclick="document.getElementById('${rawId}').classList.toggle('show')">
                                    <i class="fa-solid fa-code"></i> Toggle Technical View
                                </button>
                                <div id="${rawId}" class="source-content">
                                    <pre style="padding:15px; font-size: 0.8rem; overflow-x:auto;">${escapeHTML(JSON.stringify(parseKognitosValue(showTechnical), null, 2))}</pre>
                                </div>
                            `;
                        }
                    } else { finalArea.innerHTML = `<p>AI processing failed.</p>`; }
                }
            }
            if (!completed) await new Promise(r => setTimeout(r, 2000));
        } catch (e) { completed = true; }
    }
    isRunning = false;
    sendBtn.disabled = !userInput.value.trim();
}

function formatTableHTML(data) {
    const parsed = parseKognitosValue(data);
    if (!parsed) return "";
    let rows = Array.isArray(parsed) ? (parsed.length > 0 ? parsed : null) : [parsed];
    if (!rows || !rows[0] || typeof rows[0] !== 'object') return `<p>${escapeHTML(String(parsed))}</p>`;
    
    const heads = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
    let html = `<table><thead><tr>${heads.map(h => `<th>${escapeHTML(h.replace(/_/g,' '))}</th>`).join('')}</tr></thead><tbody>`;
    rows.forEach(r => {
        html += `<tr>${heads.map(h => `<td>${escapeHTML(String(r[h] || '-'))}</td>`).join('')}</tr>`;
    });
    return html + `</tbody></table>`;
}

function parseKognitosValue(val) {
    if (!val || typeof val !== 'object') return val;
    if (val.text !== undefined) return val.text;
    if (val.bool_value !== undefined) return val.bool_value;
    if (val.number !== undefined) return val.number.lo !== undefined ? val.number.lo : val.number;
    if (val.null_value !== undefined) return null;
    if (val.list && Array.isArray(val.list.items)) return val.list.items.map(i => parseKognitosValue(i));
    if (val.dictionary && Array.isArray(val.dictionary.entries)) {
        const o = {};
        val.dictionary.entries.forEach(e => { if(e.key?.text) o[e.key.text] = parseKognitosValue(e.value); });
        return o;
    }
    if (!Array.isArray(val)) {
        const o = {};
        for(let k in val) o[k] = parseKognitosValue(val[k]);
        return o;
    }
    return val;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t]));
}
