// Генерация постоянного ID на основе UserAgent
function generatePersistentId() {
    const data = navigator.userAgent + window.screen.width + window.screen.height;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = (hash << 5) - hash + data.charCodeAt(i);
        hash |= 0;
    }
    return 'user-' + Math.abs(hash).toString(36).substring(0, 8);
}

// Инициализация Peer с минимальной конфигурацией
const persistentId = localStorage.getItem('peerId') || generatePersistentId();
localStorage.setItem('peerId', persistentId);

const peer = new Peer(persistentId, {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' } // Только базовый STUN
        ]
    }
});

// Сохраняем подключённых собеседников
let contacts = JSON.parse(localStorage.getItem('contacts')) || [];
let activeConnection = null;

// Показываем ID
document.getElementById('your-id').textContent = persistentId;

// Обработчики событий PeerJS
peer.on('open', () => {
    console.log('Peer готов, ID:', persistentId);
    renderContacts();
});

peer.on('connection', (conn) => {
    activeConnection = conn;
    addContact(conn.peer);
    setupConnection(conn);
});

// Функция подключения
function connect() {
    const peerId = document.getElementById('peer-id').value.trim();
    if (!peerId) return alert('Введите ID друга');
    
    const conn = peer.connect(peerId);
    setupConnection(conn);
    addContact(peerId);
}

// Настройка соединения
function setupConnection(conn) {
    conn.on('open', () => {
        document.getElementById('connection-status').textContent = '🟢 Подключён';
        document.getElementById('connection-status').className = 'connected';
    });

    conn.on('data', (data) => {
        appendMessage(`Друг: ${data}`);
    });

    conn.on('close', () => {
        document.getElementById('connection-status').textContent = '🔴 Отключён';
        document.getElementById('connection-status').className = 'disconnected';
    });
}

// Добавление контакта
function addContact(peerId) {
    if (!contacts.includes(peerId)) {
        contacts.push(peerId);
        localStorage.setItem('contacts', JSON.stringify(contacts));
        renderContacts();
    }
}

// Отправка сообщения
function send() {
    if (!activeConnection) return alert('Нет активного подключения');
    
    const message = document.getElementById('message').value;
    if (!message) return;
    
    activeConnection.send(message);
    appendMessage(`Вы: ${message}`);
    document.getElementById('message').value = '';
}

// Отображение контактов
function renderContacts() {
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';
    
    contacts.forEach(contactId => {
        const li = document.createElement('li');
        li.textContent = contactId;
        li.onclick = () => {
            const conn = peer.connect(contactId);
            setupConnection(conn);
        };
        list.appendChild(li);
    });
}

// Вспомогательные функции
function appendMessage(message) {
    const chatBox = document.getElementById('chat');
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function copyId() {
    navigator.clipboard.writeText(persistentId);
    alert('ID скопирован!');
}
