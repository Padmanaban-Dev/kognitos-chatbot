const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const historyList = document.getElementById('history-list');
const newChatBtn = document.getElementById('new-chat-btn');
const welcomeScreen = document.getElementById('welcome-screen');

const deleteModal = document.getElementById('delete-modal');
const deleteChatName = document.getElementById('delete-chat-name');
const deleteCancelBtn = document.getElementById('delete-cancel-btn');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

let conversations = JSON.parse(localStorage.getItem('kognitos_chats') || '[]');
let currentChatId = null;
let pendingDeleteId = null;
const tableRegistry = {};
const activePolls = new Set(); // Tracks chat IDs that are currently polling

init();

function init() {
    renderHistory();
    initTheme();
    resumeActivePolls(); // New: Resume polling for any 'running' chats found in history
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
        } else {
            loadChat(chatId);
        }
    });

    document.getElementById('clear-history-btn').addEventListener('click', clearAllConversations);

    deleteCancelBtn.addEventListener('click', () => {
        deleteModal.classList.add('hidden');
        pendingDeleteId = null;
    });

    deleteConfirmBtn.addEventListener('click', () => {
        if (pendingDeleteId === 'ALL') {
            conversations = [];
            localStorage.setItem('kognitos_chats', JSON.stringify(conversations));
            startNewChat();
        } else if (pendingDeleteId) {
            conversations = conversations.filter(c => c.id !== pendingDeleteId);
            localStorage.setItem('kognitos_chats', JSON.stringify(conversations));
            if (currentChatId === pendingDeleteId) {
                startNewChat();
            } else {
                renderHistory();
            }
        }
        deleteModal.classList.add('hidden');
        pendingDeleteId = null;
    });
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
    const chat = conversations.find(c => c.id === id);
    if (!chat) return;
    pendingDeleteId = id;
    deleteChatName.textContent = chat.title;
    deleteModal.classList.remove('hidden');
}

function clearAllConversations(e) {
    if (e) e.stopPropagation();
    if (conversations.length === 0) {
        alert("No history to clear.");
        return;
    }
    pendingDeleteId = 'ALL';
    deleteChatName.textContent = "ALL chat history (cannot be undone)";
    deleteModal.classList.remove('hidden');
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
    chat.messages.forEach(msg => appendMessage(msg.role, msg.content, msg.type, msg.runId));
    renderHistory();
}

function saveMessage(role, content, type = 'normal', runId = null) {
    if (!currentChatId) {
        currentChatId = Date.now().toString();
        const title = typeof content === 'string' ? content.substring(0, 30) : 'AI Request';
        conversations.push({ id: currentChatId, title, updatedAt: Date.now(), messages: [] });
    }
    const chat = conversations.find(c => c.id === currentChatId);
    if (chat) {
        // If we are saving a 'running' placeholder, remove any previous running placeholders for this chat
        if (type === 'running') {
            chat.messages = chat.messages.filter(m => m.type !== 'running');
        }
        
        chat.messages.push({ role, content, type, runId, timestamp: Date.now() });
        chat.updatedAt = Date.now();
        localStorage.setItem('kognitos_chats', JSON.stringify(conversations));
        renderHistory();
    }
}

function updateMessageInHistory(chatId, role, type, newContent, newType = 'normal') {
    const chat = conversations.find(c => c.id === chatId);
    if (chat) {
        const msg = chat.messages.find(m => m.role === role && m.type === type);
        if (msg) {
            msg.content = newContent;
            msg.type = newType;
            msg.updatedAt = Date.now();
            localStorage.setItem('kognitos_chats', JSON.stringify(conversations));
            renderHistory();
        }
    }
}

/* Save to a specific chat ID regardless of which chat is currently active.
   Called when a background poll finishes after the user navigated away. */
function saveMessageToChat(chatId, role, content) {
    const chat = conversations.find(c => c.id === chatId);
    if (chat) {
        chat.messages.push({ role, content });
        chat.updatedAt = Date.now();
        localStorage.setItem('kognitos_chats', JSON.stringify(conversations));
        renderHistory();  // refresh sidebar so the chat shows updated
    }
}

/* Banner notification: fires when automation finishes but user is elsewhere. */
function showCompletionBanner(chatId) {
    const existing = document.getElementById('completion-banner');
    if (existing) existing.remove();

    const chat = conversations.find(c => c.id === chatId);
    const label = chat ? chat.title : 'Previous query';

    const banner = document.createElement('div');
    banner.id = 'completion-banner';
    banner.className = 'completion-banner';
    banner.innerHTML = `
        <i class="fa-solid fa-circle-check" style="color:var(--success);"></i>
        <span><strong>Analysis complete:</strong> "${escapeHTML(label.substring(0,40))}"</span>
        <button onclick="loadChat('${chatId}');this.closest('.completion-banner').remove()">View →</button>
        <button onclick="this.closest('.completion-banner').remove()" style="opacity:0.5;">✕</button>
    `;
    document.body.appendChild(banner);

    // Auto-dismiss after 8 seconds
    setTimeout(() => { if (banner.isConnected) banner.remove(); }, 8000);
}



function setPrompt(text) {
    userInput.value = text;
    userInput.dispatchEvent(new Event('input'));
}

function appendMessage(role, content, type = 'normal', runId = null) {
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    
    // If it's a running state, use the specialized tracker template
    if (type === 'running') {
        return createBotMessageWithTracker(currentChatId, runId);
    }

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

function createBotMessageWithTracker(chatId, runId) {
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    const outer = document.createElement('div');
    outer.className = `message-outer bot`;
    // These data attributes allow pollRun to find this element even after a chat switch
    outer.dataset.chatId = chatId;
    outer.dataset.runId  = runId;
    outer.dataset.status = 'running';

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

function logActivity(chatId, text, status = 'active') {
    // Find the element currently in the DOM for this chat (if any)
    const botEl = document.querySelector(`.message-outer[data-chat-id="${chatId}"][data-status="running"]`);
    if (!botEl) return;

    const body = botEl.querySelector('.activity-body');
    if (!body) return;
    
    // Check if this text was already logged (prevent duplicates on resume)
    const existing = Array.from(body.querySelectorAll('.pipeline-text')).some(span => span.textContent.includes(text));
    if (existing && status !== 'active') return;

    const line = document.createElement('div');
    line.className = `activity-line ${status}`;
    
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const nodeID = 'N-' + Math.floor(Math.random() * 9000 + 1000);
    
    let display = text;
    if (text.includes('Processing')) {
        display = `Dynamically classifying ${text.replace('Processing ', '')}`;
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

    // Handle the persistent 'running' state object
    if (parsed && typeof parsed === 'object' && parsed.status === 'running') {
        return `
            <div class="typing-area">Analyzing your request...</div>
            <div class="activity-tracker">
                <div class="activity-header">
                    <div class="header-left">
                        <i class="fa-solid fa-microchip fa-spin" style="color:var(--accent)"></i>
                        <span class="pipeline-style">AI Execution Pipeline</span>
                    </div>
                </div>
                <div class="pipeline-progress-container"><div class="pipeline-progress-bar" style="width:10%"></div></div>
                <div class="activity-body"></div>
            </div>
            <div class="final-result-area"></div>
            <div class="source-section"></div>
        `;
    }
    
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
    // ── Extract well-known keys ──
    const getVal = (keys) => {
        for (const k of keys) {
            if (json[k] !== undefined) return json[k];
            const snake = k.toLowerCase().replace(/\s+/g, '_');
            if (json[snake] !== undefined) return json[snake];
        }
        return null;
    };

    const aiResponse  = getVal(['Response text', 'response_text']);
    const recordCount = getVal(['Result row count', 'result_row_count']);

    let html = `<div class="finalized-container">`;

    // ── Header ──
    html += `
        <div class="finalized-header">
            <div class="finalized-header-left">
                <i class="fa-solid fa-circle-check"></i>
                <span class="finalized-header-title">Analysis Result</span>
            </div>
            <div class="finalized-header-chip">
                <i class="fa-solid fa-check"></i> Completed
            </div>
        </div>`;

    // ── Metrics strip (only record count) ──
    if (recordCount !== null) {
        html += `
        <div class="finalized-metrics-strip">
            <div class="finalized-metric-item">
                <div class="finalized-label">Records Found</div>
                <div class="finalized-value">${escapeHTML(String(recordCount))}</div>
            </div>
        </div>`;
    }

    // ── Body ──
    html += `<div class="finalized-body">`;

    // AI Response box
    if (aiResponse) {
        const responseText = typeof aiResponse === 'object' && aiResponse.text ? aiResponse.text : String(aiResponse);
        html += `
            <div>
                <div class="section-label"><i class="fa-solid fa-robot" style="color:var(--accent);"></i> AI Response</div>
                <div class="ai-response-box">${escapeHTML(responseText)}</div>
            </div>`;
    }

    // ── Dynamic sections ──
    const skipKeys = new Set(['query', 'question count', 'response text', 'response_text', 'result row count', 'result_row_count', 'json_output', 'sub questions', 'sub_questions']);

    for (const key in json) {
        const lowKey = key.toLowerCase();
        if (skipKeys.has(lowKey)) continue;

        const val = json[key];
        if (val === null || val === undefined || val === '-') continue;

        // SQL Queries — expandable accordion
        if (lowKey === 'sql queries' || lowKey === 'sql_queries') {
            const uid = 'sql-' + Math.random().toString(36).slice(2, 7);
            html += `
            <div class="finalized-table-section">
                <div class="sql-accordion-wrap">
                    <details id="${uid}">
                        <summary>
                            <span class="sum-left"><i class="fa-solid fa-code"></i> SQL Query</span>
                            <i class="fa-solid fa-chevron-down sum-chevron"></i>
                        </summary>
                        <pre>${escapeHTML(String(val))}</pre>
                    </details>
                </div>
            </div>`;
            continue;
        }

        // Tables — collapsible accordion with fullscreen expand
        const flat = flattenKognitosTable(val);
        if (Array.isArray(flat) && flat.length > 0 && typeof flat[0] === 'object' && flat[0] !== null) {
            const rowCount = flat.length;
            const tid = 'tbl-' + Math.random().toString(36).slice(2, 7);
            tableRegistry[tid] = { title: key.replace(/_/g, ' '), rows: flat };
            html += `
            <div class="finalized-table-section">
                <div class="sql-accordion-wrap">
                    <details id="${tid}" open>
                        <summary>
                            <span class="sum-left">
                                <i class="fa-solid fa-table"></i>
                                ${key.replace(/_/g, ' ')}
                                <span class="row-count-badge" style="margin-left:8px;">${rowCount} row${rowCount !== 1 ? 's' : ''}</span>
                            </span>
                            <span class="sum-right">
                                <button class="tbl-expand-btn" title="Expand fullscreen" onclick="event.preventDefault();openTableModal('${tid}')">
                                    <i class="fa-solid fa-expand"></i>
                                </button>
                                <i class="fa-solid fa-chevron-down sum-chevron"></i>
                            </span>
                        </summary>
                        <div class="table-scroll">${formatTableHTML(flat)}</div>
                        <div class="table-footer">
                            <span>Showing all results</span>
                            <span class="row-count-badge">${rowCount} row${rowCount !== 1 ? 's' : ''}</span>
                        </div>
                    </details>
                </div>
            </div>`;
        } else {
            // Single value
            html += `
            <div class="finalized-table-section">
                <div class="section-label">${key.replace(/_/g, ' ')}</div>
                <div class="ai-response-box" style="font-weight:600;">${escapeHTML(String(val))}</div>
            </div>`;
        }
    }

    html += `</div></div>`;
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
    if (!text) return;
    
    // Prevent double-sending for a single chat
    if (activePolls.has(currentChatId)) return;

    appendMessage('user', text);
    saveMessage('user', text);

    const runChatId = currentChatId;
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;

    try {
        const invokeRes = await fetch('/api/invoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: text }) });
        const invokeData = await invokeRes.json();
        
        let runId;
        if (invokeData.run_id) runId = invokeData.run_id.split('/').pop();
        else if (invokeData.name) runId = invokeData.name.split('/').pop();
        else throw new Error("Failed to start automation");

        // Save a placeholder message in history so switching back shows 'Analyzing'
        saveMessage('bot', { status: 'running', runId }, 'running', runId);
        
        // Render it if we are still on this chat
        if (currentChatId === runChatId) {
            appendMessage('bot', null, 'running', runId);
        }

        await pollRun(runId, runChatId);
    } catch (err) {
        // Find if we have a visible area to show error
        const area = document.querySelector(`.message-outer[data-chat-id="${runChatId}"] .final-result-area`);
        if (area) area.innerHTML = `<p style="color:red">Error: ${err.message}</p>`;
        activePolls.delete(runChatId);
        sendBtn.disabled = !userInput.value.trim();
    }
}

async function pollRun(runId, runChatId) {
    if (activePolls.has(runChatId)) return;
    activePolls.add(runChatId);

    let completed = false;
    let lastExtraction = null;
    let pageToken = '';

    while (!completed) {
        try {
            // Check if user is on this chat right now
            const botEl = document.querySelector(`.message-outer[data-chat-id="${runChatId}"][data-status="running"]`);

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
                            
                            if (botEl) {
                                const typing = botEl.querySelector('.typing-area');
                                if (typing) typing.textContent = `Running ${clean}...`;
                            }
                            logActivity(runChatId, `Processing ${clean}`);
                        }
                        
                        const outputs = node.outputs;
                        if (outputs) {
                            for(const k in outputs) {
                                const technical = ['user_query','window_fn','detection_result','bounding_box','verification','metadata','fields','document','metrics','confidence'];
                                if(technical.includes(k)) continue;
                                const parsed = parseKognitosValue(outputs[k]);
                                if (parsed && (Array.isArray(parsed) || k === 'answer')) {
                                    lastExtraction = outputs[k];
                                    logActivity(runChatId, `Collected new data point`, 'done');
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
                    
                    if (botEl) {
                        const typing = botEl.querySelector('.typing-area');
                        if (typing) typing.remove();
                        const tracker = botEl.querySelector('.activity-tracker');
                        if (tracker) {
                            tracker.classList.add('collapsed');
                            const neuroHeader = tracker.querySelector('.pipeline-style');
                            if (neuroHeader) neuroHeader.textContent = 'Pipeline Success';
                            const icon = tracker.querySelector('.header-left i');
                            if (icon) {
                                icon.className = 'fa-solid fa-circle-check';
                                icon.style.color = '#10b981';
                            }
                            const bar = tracker.querySelector('#p-bar');
                            if (bar) bar.style.width = '100%';
                        }
                    }

                    if (run.state.completed) {
                        const outputs = run.state.completed.outputs;
                        let outcomeContent = "";
                        let savedContent = "";
                        
                        if (outputs.json_output) {
                            outcomeContent = formatResultUI(outputs.json_output);
                            savedContent = outputs.json_output;
                        } else {
                            for (const k in outputs) {
                                const val = parseKognitosValue(outputs[k]);
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
                                metricsHtml = `<div class="metrics-grid">` + metrics.map(m => `<div class="metric-pill"><span class="m-val">${m.value}</span><span class="m-lab">${m.label}</span></div>`).join('') + `</div>`;
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

                            if (primaryText) outcomeContent = metricsHtml + primaryText;
                            else if (lastExtraction) {
                                const tableHtml = formatTableHTML(lastExtraction);
                                outcomeContent = metricsHtml + `<div class="query-result-section"><div class="query-result-header"><i class="fa-solid fa-database"></i> Query Result</div><div class="query-result-table-wrapper">${tableHtml}</div></div>`;
                                if (!savedContent) savedContent = lastExtraction;
                            }
                        }

                        if (!outcomeContent) outcomeContent = `<div class="result-card"><div class="result-body">AI processed your request but returned no specific data.</div></div>`;

                        if (botEl) {
                            const finalArea = botEl.querySelector('.final-result-area');
                            if (finalArea) finalArea.innerHTML = outcomeContent;
                            botEl.dataset.status = 'done';

                            // Technical View
                            const showTechnical = outputs.json_output || lastExtraction;
                            if (showTechnical) {
                                const sourceArea = botEl.querySelector('.source-section');
                                if (sourceArea) {
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
                            }
                        }

                        // Sync to history: replace the placeholder with real result
                        updateMessageInHistory(runChatId, 'bot', 'running', savedContent, 'normal');

                        if (currentChatId !== runChatId) showCompletionBanner(runChatId);

                    } else { 
                        if (botEl) botEl.querySelector('.final-result-area').innerHTML = `<p>AI processing failed.</p>`; 
                        updateMessageInHistory(runChatId, 'bot', 'running', "AI processing failed.", 'normal');
                    }
                }
            }
            if (!completed) await new Promise(r => setTimeout(r, 2000));
        } catch (e) { completed = true; }
    }
    activePolls.delete(runChatId);
    if (currentChatId === runChatId) sendBtn.disabled = !userInput.value.trim();
}

function resumeActivePolls() {
    conversations.forEach(chat => {
        const runningMsg = chat.messages.find(m => m.type === 'running');
        if (runningMsg && runningMsg.runId) {
            console.log(`Resuming polling for Chat: ${chat.id}, Run: ${runningMsg.runId}`);
            pollRun(runningMsg.runId, chat.id);
        }
    });
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

/* ────────────────────────────────────────
   FULLSCREEN TABLE MODAL
───────────────────────────────────────── */
function openTableModal(tid) {
    const entry = tableRegistry[tid];
    if (!entry) return;

    const modal = document.getElementById('table-modal');
    const titleEl = document.getElementById('tbl-modal-title');
    const countEl = document.getElementById('tbl-modal-count');
    const bodyEl  = document.getElementById('tbl-modal-body');

    titleEl.textContent = entry.title;
    countEl.textContent = `${entry.rows.length} row${entry.rows.length !== 1 ? 's' : ''}`;
    bodyEl.innerHTML    = formatTableHTML(entry.rows);

    // Wire download button
    document.getElementById('tbl-modal-download').onclick = () => downloadTableCSV(entry);

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeTableModal() {
    document.getElementById('table-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function downloadTableCSV(entry) {
    if (!entry.rows.length) return;
    const headers = Object.keys(entry.rows[0]);
    const lines = [
        headers.join(','),
        ...entry.rows.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = (entry.title || 'table').replace(/\s+/g, '_') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}
