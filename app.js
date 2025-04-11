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
const contactNameInput = document.getElementById('contact-name');
const chatBox = document.getElementById('chat');
const messageInput = document.getElementById('message');
const contactsList = document.getElementById('contacts-list');
const chatHeader = document.getElementById('chat-header');
const sendBtn = document.getElementById('send-btn');
const recordBtn = document.getElementById('record-btn');
const photoInput = document.getElementById('photo-input');
const chatArea = document.querySelector('.chat-area');
const addContactForm = document.querySelector('.add-contact');

// Состояние приложения
let activeConnection = null;
let activeContact = null;
const contacts = JSON.parse(localStorage.getItem('contacts')) || [];
const chatHistories = JSON.parse(localStorage.getItem('chatHistories')) || {};
const contactAliases = JSON.parse(localStorage.getItem('contactAliases')) || {};
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Инициализация
peer.on('open', (id) => {
    yourIdElement.textContent = id;
    renderContacts();
    updateUI();
});

// Функция копирования ID
function copyId() {
    navigator.clipboard.writeText(yourIdElement.textContent);
    alert('ID скопирован!');
}

// Переключение формы добавления контакта
function toggleAddContact() {
    addContactForm.style.display = addContactForm.style.display === 'none' ? 'flex' : 'none';
}

// Подключение к новому контакту
function connect() {
    const friendId = peerIdInput.value.trim();
    const contactName = contactNameInput.value.trim();
    if (!friendId) return alert('Введите ID контакта!');
    if (friendId === peer.id) return alert('Нельзя добавить самого себя!');
    
    if (!contacts.includes(friendId)) {
        contacts.push(friendId);
        localStorage.setItem('contacts', JSON.stringify(contacts));
        
        if (contactName) {
            contactAliases[friendId] = contactName;
            localStorage.setItem('contactAliases', JSON.stringify(contactAliases));
        }
        
        if (!chatHistories[friendId]) {
            chatHistories[friendId] = [];
            saveChatHistories();
        }
    }
    
    peerIdInput.value = '';
    contactNameInput.value = '';
    toggleAddContact(); // Скрываем форму после добавления
    renderContacts();
    startChat(friendId);
}

// Начало чата с контактом
function startChat(contactId) {
    if (activeConnection) {
        activeConnection.close();
    }
    
    activeContact = contactId;
    const displayName = contactAliases[contactId] || contactId;
    chatHeader.textContent = `Чат с ${displayName}`;
    renderChatHistory(contactId);
    chatArea.style.display = 'flex'; // Показываем чат
    updateUI();
    
    const conn = peer.connect(contactId);
    setupConnection(conn);
}

// Закрытие чата
function closeChat() {
    if (activeConnection) {
        activeConnection.close();
        activeConnection = null;
    }
    activeContact = null;
    chatArea.style.display = 'none'; // Скрываем чат
    chatHeader.textContent = 'Выберите контакт';
    chatBox.innerHTML = '';
    updateUI();
}

// Настройка соединения
function setupConnection(conn) {
    activeConnection = conn;
    
    conn.on('open', () => {
        appendSystemMessage('✅ Подключение установлено');
        updateUI();
    });
    
    conn.on('data', (data) => {
        if (typeof data === 'string') {
            appendMessage({ type: 'text', content: data }, 'them');
            saveMessage({ type: 'text', content: data }, 'them');
        } else if (data.type === 'audio') {
            appendMessage(data, 'them');
            saveMessage(data, 'them');
        } else if (data.type === 'image') {
            appendMessage(data, 'them');
            saveMessage(data, 'them');
        }
    });
    
    conn.on('close', () => {
        appendSystemMessage('❌ Соединение закрыто');
        activeConnection = null;
        updateUI();
    });
    
    conn.on('error', (err) => {
        console.error('Ошибка соединения:', err);
        appendSystemMessage('⚠️ Ошибка соединения');
    });
}

// Приём входящих подключений
peer.on('connection', (conn) => {
    const contactId = conn.peer;
    
    if (!contacts.includes(contactId)) {
        contacts.push(contactId);
        localStorage.setItem('contacts', JSON.stringify(contacts));
        
        if (!chatHistories[contactId]) {
            chatHistories[contactId] = [];
            saveChatHistories();
        }
    }
    
    if (activeContact === contactId) {
        setupConnection(conn);
    }
    
    renderContacts();
});

// Отправка текстового сообщения
function send() {
    if (!activeConnection || !activeContact) return;
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    try {
        activeConnection.send(message);
        appendMessage({ type: 'text', content: message }, 'you');
        saveMessage({ type: 'text', content: message }, 'you');
        messageInput.value = '';
    } catch (err) {
        console.error('Ошибка отправки:', err);
        appendSystemMessage('⚠️ Не удалось отправить сообщение');
    }
}

// Запись голосового сообщения
function startRecording() {
    if (!activeConnection || !activeContact) return;
    
    if (!isRecording) {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = (e) => {
                    audioChunks.push(e.data);
                };
                
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = () => {
                        const base64Audio = reader.result;
                        const message = { type: 'audio', content: base64Audio };
                        activeConnection.send(message);
                        appendMessage(message, 'you');
                        saveMessage(message, 'you');
                    };
                    
                    stream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorder.start();
                isRecording = true;
                recordBtn.textContent = '⏹️';
                recordBtn.title = 'Остановить запись';
                recordBtn.classList.add('recording');
            })
            .catch(err => {
                console.error('Ошибка записи:', err);
                appendSystemMessage('⚠️ Не удалось начать запись');
            });
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.textContent = '🎙️';
        recordBtn.title = 'Записать голосовое сообщение';
        recordBtn.classList.remove('recording');
    }
}

// Отправка фотографии
photoInput.addEventListener('change', () => {
    if (!activeConnection || !activeContact) return;
    
    const file = photoInput.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
        const base64Image = reader.result;
        const message = { type: 'image', content: base64Image };
        activeConnection.send(message);
        appendMessage(message, 'you');
        saveMessage(message, 'you');
        photoInput.value = '';
    };
});

// Сохранение сообщений
function saveMessage(message, sender) {
    if (!chatHistories[activeContact]) {
        chatHistories[activeContact] = [];
    }
    
    chatHistories[activeContact].push({
        ...message,
        sender: sender,
        timestamp: new Date().toISOString()
    });
    
    saveChatHistories();
}

function saveChatHistories() {
    localStorage.setItem('chatHistories', JSON.stringify(chatHistories));
}

// Редактирование имени контакта
function editContactName(contactId) {
    const newName = prompt('Введите новое имя для контакта:', contactAliases[contactId] || '');
    if (newName !== null) {
        const trimmedName = newName.trim();
        if (trimmedName) {
            contactAliases[contactId] = trimmedName;
        } else {
            delete contactAliases[contactId];
        }
        localStorage.setItem('contactAliases', JSON.stringify(contactAliases));
        renderContacts();
        if (activeContact === contactId) {
            const displayName = contactAliases[contactId] || contactId;
            chatHeader.textContent = `Чат с ${displayName}`;
        }
    }
}

// Отображение контактов
function renderContacts() {
    contactsList.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsList.innerHTML = '<div class="no-contacts">Нет контактов</div>';
        return;
    }
    
    contacts.forEach(contactId => {
        const displayName = contactAliases[contactId] || contactId;
        const contactElement = document.createElement('div');
        contactElement.className = 'contact';
        contactElement.innerHTML = `
            <span class="contact-name">${displayName}</span>
            <button class="edit-contact-btn" onclick="editContactName('${contactId}')">✎</button>
        `;
        
        if (contactId === activeContact) {
            contactElement.classList.add('active-contact');
        }
        
        contactElement.querySelector('.contact-name').onclick = () => {
            startChat(contactId);
        };
        
        contactsList.appendChild(contactElement);
    });
}

// Отображение истории чата
function renderChatHistory(contactId) {
    chatBox.innerHTML = '';
    
    if (!chatHistories[contactId] || chatHistories[contactId].length === 0) {
        appendSystemMessage('Нет сообщений');
        return;
    }
    
    chatHistories[contactId].forEach(msg => {
        appendMessage(msg, msg.sender);
    });
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Добавление сообщений в чат
function appendMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    const displayName = contactAliases[activeContact] || activeContact;
    if (sender === 'you') {
        messageElement.classList.add('your-message');
    } else {
        messageElement.classList.add('their-message');
    }
    
    if (message.type === 'text') {
        messageElement.textContent = sender === 'you' ? `Вы: ${message.content}` : `${displayName}: ${message.content}`;
    } else if (message.type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = message.content;
        audio.style.maxWidth = '100%';
        messageElement.appendChild(audio);
        const label = document.createElement('div');
        label.textContent = sender === 'you' ? 'Вы (голосовое):' : `${displayName} (голосовое):`;
        messageElement.insertBefore(label, audio);
    } else if (message.type === 'image') {
        const img = document.createElement('img');
        img.src = message.content;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';
        messageElement.appendChild(img);
        const label = document.createElement('div');
        label.textContent = sender === 'you' ? 'Вы (фото):' : `${displayName} (фото):`;
        messageElement.insertBefore(label, img);
    }
    
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('system-message');
    messageElement.textContent = message;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Обновление интерфейса
function updateUI() {
    const isActive = activeConnection && activeContact;
    messageInput.disabled = !isActive;
    sendBtn.disabled = !isActive;
    recordBtn.disabled = !isActive;
    photoInput.disabled = !isActive;
    document.getElementById('photo-btn').disabled = !isActive;
    
    if (isActive) {
        messageInput.focus();
    }
}

// Обработчики событий
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') send();
});

peer.on('error', (err) => {
    console.error('Peer error:', err);
    appendSystemMessage('⚠️ Произошла ошибка соединения');
});
