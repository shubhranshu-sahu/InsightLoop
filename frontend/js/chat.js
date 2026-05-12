import { requireAuth, apiFetch, loadComponent, getToken } from './config.js';

requireAuth();

// State
let activeFormId = sessionStorage.getItem('chatActiveFormId') || null;
let activeThreadId = null;
let isStreaming = false;

document.addEventListener('DOMContentLoaded', async () => {
  await loadComponent('#sidebar-container', '../components/sidebar.html');
  await loadComponent('#navbar-container', '../components/navbar.html');
  if (window.lucide) window.lucide.createIcons();

  setupEventListeners();
  await loadForms();
  await loadThreads();

  // If a form was previously active, initialize it
  if (activeFormId) {
    document.getElementById('chatFormSelector').value = activeFormId;
    await initChat(activeFormId);
  }
});

// Setup
function setupEventListeners() {
  const formSelector = document.getElementById('chatFormSelector');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');

  formSelector.addEventListener('change', async (e) => {
    const formId = e.target.value;
    if (formId) {
      sessionStorage.setItem('chatActiveFormId', formId);
      activeFormId = formId;
      await initChat(formId);
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    
    // Toggle send button
    const btnSend = document.getElementById('btnSend');
    if (!isStreaming) {
      btnSend.disabled = this.value.trim() === '';
    }
  });

  // Handle enter key to submit (Shift+Enter for newline)
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!btnSend.disabled) chatForm.dispatchEvent(new Event('submit'));
    }
  });

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isStreaming || !activeThreadId || !activeFormId) return;

    const message = chatInput.value.trim();
    if (!message) return;

    // Reset input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    await sendMessage(message);
  });

  // Suggested Prompts
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (isStreaming || !activeThreadId) return;
      chatInput.value = chip.textContent;
      chatForm.dispatchEvent(new Event('submit'));
    });
  });
}

// Data Fetching
async function loadForms() {
  try {
    const select = document.getElementById('chatFormSelector');
    const data = await apiFetch('/api/forms');
    if (data.forms && data.forms.length > 0) {
      data.forms.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.form_id;
        opt.textContent = f.title;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Failed to load forms', err);
  }
}

async function loadThreads() {
  try {
    const list = document.getElementById('threadList');
    const data = await apiFetch('/api/chat/threads');
    
    list.innerHTML = '';
    if (data.threads && data.threads.length > 0) {
      data.threads.forEach(t => {
        const div = document.createElement('div');
        div.className = `thread-item ${t.thread_id === activeThreadId ? 'active' : ''}`;
        div.innerHTML = `
          <div class="thread-title">${t.form_title || 'Chat'}</div>
          <div class="thread-meta">
            <span>${t.message_count} msgs</span>
            <span>${new Date(t.updated_at).toLocaleDateString()}</span>
          </div>
        `;
        div.addEventListener('click', () => {
          document.getElementById('chatFormSelector').value = t.form_id;
          activeFormId = t.form_id;
          sessionStorage.setItem('chatActiveFormId', t.form_id);
          initChat(t.form_id);
        });
        list.appendChild(div);
      });
    } else {
      list.innerHTML = '<div class="text-center text-muted p-3">No conversations yet</div>';
    }
  } catch (err) {
    console.error('Failed to load threads', err);
  }
}

async function initChat(formId) {
  const input = document.getElementById('chatInput');
  const title = document.getElementById('activeChatTitle');
  
  input.disabled = true;
  document.getElementById('chatStatus').innerHTML = '<span class="status-dot thinking"></span> Connecting...';

  try {
    // This endpoint gets or creates the thread for the form
    const data = await apiFetch('/api/chat/thread', {
      method: 'POST',
      body: JSON.stringify({ form_id: formId })
    });

    activeThreadId = data.thread_id;
    title.textContent = data.form_title || 'InsightLoop AI';
    
    // Render History
    const container = document.getElementById('chatMessages');
    container.innerHTML = ''; // Clear empty state
    
    if (data.messages && data.messages.length > 0) {
      data.messages.forEach(m => {
        // Render all assistant messages as markdown
        appendMessage(m.role, m.content, m.role === 'assistant');
        if (m.sources && m.sources.length > 0) {
          appendSources(m.sources, container);
        }
      });
    } else {
      // Re-inject empty state
      container.innerHTML = `
        <div class="chat-empty-state" id="emptyState">
          <div class="empty-icon-wrap"><i data-lucide="bot"></i></div>
          <h4>InsightLoop AI Assistant</h4>
          <p>Ask me anything about your customer feedback.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    // Enable UI
    input.disabled = false;
    document.getElementById('chatStatus').innerHTML = '<span class="status-dot connected"></span> Connected';
    input.focus();
    scrollToBottom();
    
    // Refresh sidebar to highlight active thread
    loadThreads();

  } catch (err) {
    console.error('Failed to init chat', err);
    document.getElementById('chatStatus').innerHTML = '<span class="status-dot"></span> Error';
    title.textContent = 'Connection Error';
  }
}

// Streaming Logic
async function sendMessage(text) {
  const container = document.getElementById('chatMessages');
  const input = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');
  const emptyState = document.getElementById('emptyState');
  
  if (emptyState) emptyState.remove();

  // 1. Lock UI & Append User Message
  isStreaming = true;
  input.disabled = true;
  btnSend.disabled = true;
  document.getElementById('chatStatus').innerHTML = '<span class="status-dot thinking"></span> AI is thinking...';
  
  appendMessage('user', text, false);
  
  // 2. Append Thinking Indicator
  const aiBubbleId = appendThinkingIndicator();
  scrollToBottom();

  try {
    const token = getToken();
    
    // Use native fetch to manually read the stream
    // EventSource doesn't support POST + Headers easily
    const response = await fetch('https://insightloop-backend.onrender.com/api/chat/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        thread_id: activeThreadId,
        form_id: activeFormId,
        message: text
      })
    });

    if (!response.ok) throw new Error('Stream request failed');
    if (!response.body) throw new Error('ReadableStream not supported');

    // Remove thinking indicator, replace with empty text bubble
    const aiBubble = document.getElementById(aiBubbleId);
    aiBubble.innerHTML = ''; 

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let aiText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Process any remaining buffer
        if (buffer) processLine(buffer);
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // The last element is either an empty string (if it ended with \n) 
      // or an incomplete line. We keep it in the buffer.
      buffer = lines.pop();
      
      for (const line of lines) {
        processLine(line);
      }
    }

    function processLine(line) {
      if (line.startsWith('data: ')) {
        const dataStr = line.replace('data: ', '').trim();
        if (!dataStr) return;
        
        try {
          const parsed = JSON.parse(dataStr);
          
          if (parsed.type === 'token') {
            aiText += parsed.token;
            aiBubble.innerHTML = window.DOMPurify && window.marked 
              ? DOMPurify.sanitize(marked.parse(aiText)) 
              : aiText;
            scrollToBottom();
          } 
          else if (parsed.type === 'chart') {
            appendChart(parsed.data, container);
          }
          else if (parsed.type === 'done') {
            if (parsed.sources && parsed.sources.length > 0) {
              appendSources(parsed.sources, container);
            }
            loadThreads();
          }
        } catch(e) {
          console.warn('Failed to parse SSE data chunk:', dataStr, e);
        }
      }
    }

  } catch (err) {
    console.error('Chat stream error:', err);
    const aiBubble = document.getElementById(aiBubbleId);
    aiBubble.innerHTML = '<span class="text-danger">An error occurred while generating the response.</span>';
  } finally {
    // Unlock UI
    isStreaming = false;
    input.disabled = false;
    document.getElementById('chatStatus').innerHTML = '<span class="status-dot connected"></span> Connected';
    input.focus();
    scrollToBottom();
  }
}

// UI Helpers
function appendMessage(role, text, isMarkdown = false) {
  const container = document.getElementById('chatMessages');
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  
  if (isMarkdown && window.marked && window.DOMPurify) {
    bubble.innerHTML = DOMPurify.sanitize(marked.parse(text));
  } else {
    bubble.textContent = text;
  }
  
  row.appendChild(bubble);
  container.appendChild(row);
  return row;
}

function appendThinkingIndicator() {
  const container = document.getElementById('chatMessages');
  const row = document.createElement('div');
  row.className = `msg-row assistant`;
  
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble thinking-bubble';
  bubble.id = 'ai-bubble-' + Date.now();
  
  bubble.innerHTML = `
    <div class="thinking-indicator">
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    </div>
  `;
  
  row.appendChild(bubble);
  container.appendChild(row);
  return bubble.id;
}

function appendSources(sources, container) {
  // Future proofing for RAG
  const wrapper = document.createElement('div');
  wrapper.className = 'msg-row assistant mt-2';
  
  const inner = document.createElement('div');
  sources.forEach((s, idx) => {
    const chip = document.createElement('button');
    chip.className = 'source-citation';
    chip.innerHTML = `<i data-lucide="file-text" style="width:12px;height:12px;"></i> Source ${idx + 1}`;
    chip.title = s.snippet || 'View source';
    inner.appendChild(chip);
  });
  
  wrapper.appendChild(inner);
  container.appendChild(wrapper);
  if (window.lucide) window.lucide.createIcons();
}

function appendChart(chartData, container) {
  // Future proofing for data viz
  const wrapper = document.createElement('div');
  wrapper.className = 'msg-row assistant mt-2 w-100';
  
  const chartBox = document.createElement('div');
  chartBox.className = 'chat-chart-container';
  
  const canvas = document.createElement('canvas');
  chartBox.appendChild(canvas);
  wrapper.appendChild(chartBox);
  container.appendChild(wrapper);
  
  new Chart(canvas, {
    type: chartData.type || 'bar',
    data: chartData,
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function scrollToBottom() {
  const container = document.getElementById('chatMessages');
  container.scrollTop = container.scrollHeight;
}
