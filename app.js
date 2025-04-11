// Инициализация Peer с сохранением ID
let peer;
const savedPeerId = localStorage.getItem('peerId');
if (savedPeerId) {
    peer = new Peer(savedPeerId);
} else {
    peer = new Peer();
    peer.on('open', (id) => {
        localStorage.setItem('peerId', id);
        document.getElementById('your-id').textContent = id;
    });
}

// Загрузка контактов и истории
let contacts = JSON.parse(localStorage.getItem('contacts')) || [];
let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];

// Показываем ID и контакты
peer.on('open', (id) => {
    document.getElementById('your-id').textContent = id;
    renderContacts();
    renderChatHistory();
});

// Отображение контактов
function renderContacts() {
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';
    
    contacts.forEach(contact => {
        const li = document.createElement('li');
        li.textContent = contact.name || contact.id;
        li.onclick = () => startChat(contact.id);
        list.appendChild(li);
    });
}

// Подключение к новому собеседнику
function connect() {
    const friendId = document.getElementById('peer-id').value.trim();
    if (!friendId) return alert('Введи ID друга!');
    
    // Проверяем, есть ли уже такой контакт
    if (!contacts.some(c => c.id === friendId)) {
        contacts.push({ id: friendId, name: `Друг ${contacts.length + 1}` });
        localStorage.setItem('contacts', JSON.stringify(contacts));
        renderContacts();
    }
    
    startChat(friendId);
}

// Начать чат с выбранным контактом
function startChat(friendId) {
    const conn = peer.connect(friendId);
    
    conn.on('open', () => {
        appendMessage(`✅ Подключён к ${friendId}`, 'system');
        
        window.send = () => {
            const message = document.getElementById('message').value.trim();
            if (!message) return;
            
            conn.send(message);
            appendMessage(message, 'you');
            document.getElementById('message').value = '';
        };
    });
    
    conn.on('data', (data) => {
        appendMessage(data, 'them');
    });
}

// Остальные функции (appendMessage, renderChatHistory) остаются как в предыдущей версии

// Сохраняем сообщения при отправке/получении
function appendMessage(message, sender) {
    const messageData = {
        text: message,
        sender: sender,
        timestamp: new Date().toISOString()
    };
    
    chatHistory.push(messageData);
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    
    renderMessage(messageData);
}
