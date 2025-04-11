// Генерация постоянного ID
function generatePersistentId() {
    const savedId = localStorage.getItem('peerId');
    if (savedId) return savedId;
    
    const randomId = 'peer-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('peerId', randomId);
    return randomId;
}

// Инициализация Peer
const peer = new Peer(generatePersistentId(), {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    }
});

// Элементы DOM
const yourIdElement = document.getElementById('your-id');
const peerIdInput = document.getElementById('peer-id');
const chatBox = document.getElementById('chat');
const messageInput = document.getElementById('message');
const contactsList = document.getElementById('contacts-list');

// Состояние приложения
let activeConnection = null;
const contacts = JSON.parse(localStorage.getItem('contacts')) || [];

// Показываем ID при подключении
peer.on('open', (id) => {
    yourIdElement.textContent = id;
    renderContacts();
});

// Функция копирования ID
function copyId() {
    navigator.clipboard.writeText(yourIdElement.textContent);
    alert('ID скопирован!');
}

// Подключение к другому пиру
function connect() {
    const friendId = peerIdInput.value.trim();
    if (!friendId) return alert('Введите ID друга!');
    
    const conn = peer.connect(friendId);
    setupConnection(conn);
    addContact(friendId);
}

// Настройка соединения
function setupConnection(conn) {
    conn.on('open', () => {
        activeConnection = conn;
        appendMessage('✅ Подключение установлено', 'system');
        
        window.send = () => {
            const message = messageInput.value.trim();
            if (!message) return;
            
            conn.send(message);
            appendMessage(message, 'you');
            messageInput.value = '';
        };
    });
    
    conn.on('data', (data) => {
        appendMessage(data, 'them');
    });
    
    conn.on('close', () => {
        appendMessage('❌ Соединение закрыто', 'system');
        activeConnection = null;
    });
}

// Приём входящих подключений
peer.on('connection', (conn) => {
    setupConnection(conn);
    addContact(conn.peer);
});

// Добавление контакта
function addContact(peerId) {
    if (!contacts.includes(peerId)) {
        contacts.push(peerId);
        localStorage.setItem('contacts', JSON.stringify(contacts));
        renderContacts();
    }
}

// Отображение контактов
function renderContacts() {
    contactsList.innerHTML = '';
    contacts.forEach(contactId => {
        const contactElement = document.createElement('div');
        contactElement.className = 'contact';
        contactElement.textContent = contactId;
        contactElement.onclick = () => {
            const conn = peer.connect(contactId);
            setupConnection(conn);
        };
        contactsList.appendChild(contactElement);
    });
}

// Добавление сообщений в чат
function appendMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    if (sender === 'you') {
        messageElement.classList.add('your-message');
        messageElement.textContent = `Вы: ${message}`;
    } else if (sender === 'them') {
        messageElement.classList.add('their-message');
        messageElement.textContent = `Друг: ${message}`;
    } else {
        messageElement.style.textAlign = 'center';
        messageElement.style.color = '#7f8c8d';
        messageElement.textContent = message;
    }
    
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Отправка по Enter
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') send();
});
