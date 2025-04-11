// Инициализация Peer
const peer = new Peer();

// Элементы DOM
const yourIdElement = document.getElementById('your-id');
const peerIdInput = document.getElementById('peer-id');
const chatBox = document.getElementById('chat');
const messageInput = document.getElementById('message');

// Показываем ID при подключении
peer.on('open', (id) => {
    yourIdElement.textContent = id;
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
    
    conn.on('open', () => {
        appendMessage('✅ Подключение установлено', 'system');
        
        // Обработчик отправки сообщений
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
    });
}

// Приём входящих подключений
peer.on('connection', (conn) => {
    conn.on('data', (data) => {
        appendMessage(data, 'them');
    });
    
    window.send = () => {
        const message = messageInput.value.trim();
        if (!message) return;
        
        conn.send(message);
        appendMessage(message, 'you');
        messageInput.value = '';
    };
});

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
