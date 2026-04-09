const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const typingContainer = document.getElementById('typing-container');
const eventText = document.getElementById('event-text');

let isRunning = false;

function appendMessage(sender, text, isJson = false) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    
    let contentHtml = `<p>${text}</p>`;
    if (isJson) {
        contentHtml = formatTableHTML(text);
    }

    messageDiv.innerHTML = `
        <div class="message-content">
            ${contentHtml}
        </div>
        <div class="message-time">${time}</div>
    `;
    
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function formatTableHTML(data) {
    try {
        let rows = null;
        if (Array.isArray(data)) {
            rows = data;
        } else if (data && data.list && Array.isArray(data.list.items)) {
            rows = data.list.items;
        } else if (data && data.table && data.table.inline && Array.isArray(data.table.inline.columns)) {
            return `<pre>${escapeHTML(JSON.stringify(data, null, 2))}</pre>`;
        }
        
        if (rows && rows.length > 0 && typeof rows[0] === 'object') {
            const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
            let html = `<table><thead><tr>`;
            headers.forEach(h => html += `<th>${escapeHTML(String(h))}</th>`);
            html += `</tr></thead><tbody>`;
            
            rows.forEach(row => {
                html += `<tr>`;
                headers.forEach(h => {
                    let cellVal = row[h];
                    if (cellVal && typeof cellVal === 'object' && cellVal.text !== undefined) cellVal = cellVal.text;
                    else if (cellVal && typeof cellVal === 'object') cellVal = JSON.stringify(cellVal);
                    html += `<td>${escapeHTML(String(cellVal || ''))}</td>`;
                });
                html += `</tr>`;
            });
            html += `</tbody></table>`;
            return html;
        }
    } catch(e) {
        console.error("Table formatting error", e);
    }
    return `<pre>${escapeHTML(JSON.stringify(data, null, 2))}</pre>`;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

function setTyping(state, text = 'Starting automation...') {
    if (state) {
        typingContainer.classList.remove('hidden');
        eventText.textContent = text;
        chatHistory.scrollTop = chatHistory.scrollHeight;
    } else {
        typingContainer.classList.add('hidden');
    }
}

async function handleSend() {
    const text = userInput.value.trim();
    if (!text || isRunning) return;

    appendMessage('user', text);
    userInput.value = '';
    isRunning = true;
    sendBtn.disabled = true;
    setTyping(true);

    try {
        const invokeRes = await fetch('/api/invoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: text })
        });
        
        const invokeData = await invokeRes.json();
        if (!invokeRes.ok || invokeData.error) {
            throw new Error(invokeData.error?.description || 'Failed to start automation');
        }

        const fullRunId = invokeData.run_id;
        const runId = fullRunId.split('/').pop();
        
        await pollRun(runId);
        
    } catch (err) {
        appendMessage('bot', `Error: ${err.message}`);
        setTyping(false);
        isRunning = false;
        sendBtn.disabled = false;
    }
}

async function pollRun(runId) {
    let completed = false;
    let pageToken = '';

    while (!completed) {
        try {
            // Optional: Fetch events for the UX "typing" vibe
            const eventsRes = await fetch(`/api/runs/${runId}/events${pageToken ? '?page_token=' + encodeURIComponent(pageToken) : ''}`);
            if (eventsRes.ok) {
                const eventsData = await eventsRes.json();
                if (eventsData.run_events) {
                    for (const evt of eventsData.run_events) {
                        if (evt.execution_journal) {
                            if (evt.execution_journal.node_started) {
                                setTyping(true, `Executing step...`);
                            }
                            if (evt.execution_journal.node_executed && evt.execution_journal.node_executed.book_function_call) {
                                const funcName = evt.execution_journal.node_executed.book_function_call.book_function?.function_name || 'function';
                                setTyping(true, `Running action: ${funcName}...`);
                            }
                        }
                    }
                }
                if (eventsData.next_page_token) pageToken = eventsData.next_page_token;
            }

            // Fetch Status (Matching your example result.status)
            const runRes = await fetch(`/api/runs/${runId}`);
            if (runRes.ok) {
                const result = await runRes.json();
                
                // User's provided check: result.status === "completed"
                if (result.status === "completed") {
                    completed = true;
                    setTyping(false);
                    
                    if (result.outputs) {
                        if (result.outputs.response_text) {
                             appendMessage('bot', result.outputs.response_text);
                        }
                        if (result.outputs.query_result) {
                             appendMessage('bot', result.outputs.query_result, true);
                        }
                    }
                } else if (result.status === "failed") {
                    completed = true;
                    setTyping(false);
                    appendMessage('bot', `Automation failed.`);
                }
            }

            if (!completed) await new Promise(r => setTimeout(r, 2000));

        } catch (err) {
            console.error("Polling error: ", err);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    isRunning = false;
    sendBtn.disabled = false;
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});
