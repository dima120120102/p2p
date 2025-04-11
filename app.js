// Генерация постоянного ID
function generatePersistentId() {
    const data = navigator.userAgent + window.screen.width + window.screen.height;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = (hash << 5) - hash + data.charCodeAt(i);
        hash |= 0;
    }
    return 'user-' + Math.abs(hash).toString(36).substring(0, 8);
}

// Инициализация Peer
const persistentId = localStorage.getItem('peerId') || generatePersistentId();
localStorage.setItem('peerId', persistentId);

const peer = new Peer(persistentId, {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478?transport=udp' },
            { 
                urls: 'turn:numb.viagenie.ca',
                username: 'your-email@example.com',
                credential: 'your-password'
            }
        ]
    },
    pingInterval: 5000
});

// Состояние приложения
let activeConnection = null;
const contacts = JSON.parse(localStorage.getItem('contacts')) || [];
let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || {};

// DOM элементы
const yourIdElement = document.getElementById('your-id');
const peerIdInput = document.getElementById('peer-id');
const chatBox = document.getElementById('chat');
const messageInput = document.getElementById('message');
const contactsList = document.getElementById('contacts-list');
const connectionStatus = document.getElementById('connection-status');

// Инициализация
yourIdElement.textContent = persistentId;
renderContacts();
renderChatHistory();

// Обработчики PeerJS
peer.on('open', () => {
    console.log('Peer готов к подключениям');
});

peer.on('connection', (conn) => {
    setupConnection(conn);
    addContactIfNew(conn.peer);
});

// Функции
function setupConnection(conn) {
    activeConnection = conn;
    updateStatus('connected');
    
    conn.on('data', (data) => {
        appendMessage(data, 'them');
        saveMessage(data, 'them', conn.peer);
    });
    
    conn.on('close', () => {
        updateStatus('disconnected');
        activeConnection = null;
    });
}

function addContactIfNew(peerId) {
    if (!contacts.some(c => c.id === peerId)) {
        contacts.push({
            id: peerId,
            name: `Друг ${contacts.length + 1}`
        });
        saveContacts();
        renderContacts();
    }
}

function connect() {
    const peerId = peerIdInput.value.trim();
    if (!peerId) return alert('Введите ID друга');
    
    const conn = peer.connect(peerId);
    setupConnection(conn);
    addContactIfNew(peerId);
    peerIdInput.value = '';
}

function send() {
    if (!activeConnection) return alert('Нет активного подключения');
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    activeConnection.send(message);
    appendMessage(message, 'you');
    saveMessage(message, 'you', activeConnection.peer);
    messageInput.value = '';
}

function renderContacts() {
    contactsList.innerHTML = '';
    contacts.forEach(contact => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${contact.name}</span>
            <span class="peer-id">${contact.id.substring(0, 8)}...</span>
            <button class="delete-contact" onclick="deleteContact('${contact.id}')">×</button>
        `;
        li.onclick = () => startChatWithContact(contact.id);
        contactsList.appendChild(li);
    });
}

function startChatWithContact(peerId) {
    const conn = peer.connect(peerId);
    setupConnection(conn);
}

function deleteContact(peerId) {
    const index = contacts.findIndex(c => c.id === peerId);
    if (index !== -1) {
        contacts.splice(index, 1);
        saveContacts();
        renderContacts();
    }
    event.stopPropagation();
}

function appendMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender === 'you' ? 'your-message' : 'their-message');
    messageElement.textContent = `${sender === 'you' ? 'Вы' : 'Друг'}: ${message}`;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function saveMessage(message, sender, peerId) {
    if (!chatHistory[peerId]) chatHistory[peerId] = [];
    chatHistory[peerId].push({
        text: message,
        sender: sender,
        timestamp: new Date().toISOString()
    });
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

function renderChatHistory() {
    // Можно добавить отображение истории для выбранного контакта
}

function updateStatus(status) {
    connectionStatus.textContent = status === 'connected' ? '🟢 Подключён' : '🔴 Отключён';
    connectionStatus.className = status;
}

function copyId() {
    navigator.clipboard.writeText(persistentId);
    alert('ID скопирован!');
}

function saveContacts() {
    localStorage.setItem('contacts', JSON.stringify(contacts));
}
