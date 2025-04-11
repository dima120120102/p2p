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
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    },
    debug: 3
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
const videoBtn = document.getElementById('video-btn');
const photoInput = document.getElementById('photo-input');
const chatArea = document.querySelector('.chat-area');
const addContactForm = document.querySelector('.add-contact');
const retryBox = document.querySelector('.retry-box');

// Состояние приложения
let activeConnection = null;
let activeContact = null;
const contacts = JSON.parse(localStorage.getItem('contacts')) || [];
const chatHistories = JSON.parse(localStorage.getItem('chatHistories')) || {};
const contactAliases = JSON.parse(localStorage.getItem('contactAliases')) || {};
const unreadMessages = JSON.parse(localStorage.getItem('unreadMessages')) || {};
let mediaRecorder = null;
let audioChunks = [];
let videoChunks = [];
let isRecording = false;
let isVideoRecording = false;
let replyingTo = null;

// Инициализация
peer.on('open', (id) => {
    console.log('PeerJS: Подключен с ID', id);
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
    toggleAddContact();
    renderContacts();
    startChat(friendId);
}

// Начало чата с контактом
function startChat(contactId) {
    if (activeConnection) {
        console.log('Закрываем предыдущее соединение');
        activeConnection.close();
    }
    
    activeContact = contactId;
    const displayName = contactAliases[contactId] || contactId;
    chatHeader.textContent = `Чат с ${displayName}`;
    renderChatHistory(contactId);
    chatArea.style.display = 'flex';
    retryBox.style.display = 'none';
    if (unreadMessages[contactId]) {
        delete unreadMessages[contactId];
        saveUnreadMessages();
    }
    renderContacts();
    updateUI();
    
    console.log('Попытка подключения к', contactId);
    const conn = peer.connect(contactId);
    setupConnection(conn);
}

// Закрытие чата
function closeChat() {
    if (activeConnection) {
        console.log('Закрытие активного соединения');
        activeConnection.close();
        activeConnection = null;
    }
    activeContact = null;
    chatArea.classList.add('closing');
    setTimeout(() => {
        chatArea.style.display = 'none';
        chatArea.classList.remove('closing');
    }, 300);
    chatHeader.textContent = 'Выберите контакт';
    chatBox.innerHTML = '';
    replyingTo = null;
    messageInput.placeholder = 'Введите сообщение...';
    updateUI();
}

// Повторная попытка подключения
function retryConnection() {
    if (activeContact) {
        console.log('Повторная попытка подключения к', activeContact);
        const conn = peer.connect(activeContact);
        setupConnection(conn);
    }
}

// Настройка соединения
function setupConnection(conn) {
    activeConnection = conn;
    
    conn.on('open', () => {
        console.log('Соединение установлено с', conn.peer);
        appendSystemMessage('✅ Подключение установлено');
        retryBox.style.display = 'none';
        updateUI();
    });
    
    conn.on('data', (data) => {
        console.log('Получены данные:', data);
        let message;
        if (typeof data === 'string') {
            message = { type: 'text', content: data };
        } else {
            message = data;
        }
        if (activeContact === conn.peer) {
            appendMessage(message, 'them');
            saveMessage(message, 'them');
        } else {
            unreadMessages[conn.peer] = (unreadMessages[conn.peer] || 0) + 1;
            saveUnreadMessages();
            renderContacts();
        }
    });
    
    conn.on('close', () => {
        console.log('Соединение с', conn.peer, 'закрыто');
        appendSystemMessage('❌ Соединение закрыто');
        activeConnection = null;
        updateUI();
    });
    
    conn.on('error', (err) => {
        console.error('Ошибка соединения с', conn.peer, ':', err);
        appendSystemMessage(`⚠️ Не удалось подключиться к ${contactAliases[conn.peer] || conn.peer}. Возможно, пользователь оффлайн.`);
        retryBox.style.display = 'block';
        activeConnection = null;
        updateUI();
    });
}

// Приём входящих подключений
peer.on('connection', (conn) => {
    const contactId = conn.peer;
    console.log('Входящее соединение от', contactId);
    
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
    
    const messageContent = messageInput.value.trim();
    if (!messageContent) return;
    
    const message = replyingTo
        ? { type: 'text', content: messageContent, replyTo: replyingTo }
        : { type: 'text', content: messageContent };
    
    try {
        console.log('Отправка сообщения:', message);
        activeConnection.send(message);
        appendMessage(message, 'you');
        saveMessage(message, 'you');
        messageInput.value = '';
        replyingTo = null;
        messageInput.placeholder = 'Введите сообщение...';
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
                        console.log('Отправка голосового сообщения');
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

// Запись видео в кружочке
function startVideoRecording() {
    if (!activeConnection || !activeContact) return;
    
    if (!isVideoRecording) {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                videoChunks = [];
                
                mediaRecorder.ondataavailable = (e) => {
                    videoChunks.push(e.data);
                };
                
                mediaRecorder.onstop = () => {
                    const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
                    const reader = new FileReader();
                    reader.readAsDataURL(videoBlob);
                    reader.onloadend = () => {
                        const base64Video = reader.result;
                        const message = { type: 'video', content: base64Video };
                        console.log('Отправка видео в кружочке');
                        activeConnection.send(message);
                        appendMessage(message, 'you');
                        saveMessage(message, 'you');
                    };
                    
                    stream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorder.start();
                isVideoRecording = true;
                videoBtn.textContent = '⏹️';
                videoBtn.title = 'Остановить запись';
                videoBtn.classList.add('recording');
                
                // Ограничение на 15 секунд
                setTimeout(() => {
                    if (isVideoRecording) {
                        mediaRecorder.stop();
                        isVideoRecording = false;
                        videoBtn.textContent = '🎥';
                        videoBtn.title = 'Записать видео в кружочке';
                        videoBtn.classList.remove('recording');
                    }
                }, 15000);
            })
            .catch(err => {
                console.error('Ошибка записи видео:', err);
                appendSystemMessage('⚠️ Не удалось начать запись видео');
            });
    } else {
        mediaRecorder.stop();
        isVideoRecording = false;
        videoBtn.textContent = '🎥';
        videoBtn.title = 'Записать видео в кружочке';
        videoBtn.classList.remove('recording');
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
        console.log('Отправка изображения');
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

function saveUnreadMessages() {
    localStorage.setItem('unreadMessages', JSON.stringify(unreadMessages));
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

// Проверка статуса контакта
function checkContactStatus(contactId) {
    // Простая эмуляция статуса через PeerJS-соединение
    return new Promise((resolve) => {
        const conn = peer.connect(contactId);
        conn.on('open', () => {
            conn.close();
            resolve(true);
        });
        conn.on('error', () => resolve(false));
        setTimeout(() => resolve(false), 2000); // Таймаут 2 секунды
    });
}

// Отображение контактов
async function renderContacts() {
    contactsList.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsList.innerHTML = '<div class="no-contacts">Нет контактов</div>';
        return;
    }
    
    for (const contactId of contacts) {
        const displayName = contactAliases[contactId] || contactId;
        const isOnline = await checkContactStatus(contactId);
        const unreadCount = unreadMessages[contactId] || 0;
        
        const contactElement = document.createElement('div');
        contactElement.className = 'contact';
        contactElement.innerHTML = `
            <span class="status-indicator ${isOnline ? 'online' : 'offline'}"></span>
            <span class="contact-name">${displayName}</span>
            ${unreadCount > 0 ? `<span class="unread-count">${unreadCount}</span>` : ''}
            <button class="edit-contact-btn" onclick="editContactName('${contactId}')">✎</button>
        `;
        
        if (contactId === activeContact) {
            contactElement.classList.add('active-contact');
        }
        
        contactElement.querySelector('.contact-name').onclick = () => {
            startChat(contactId);
        };
        
        contactsList.appendChild(contactElement);
    }
}

// Отображение истории чата
function renderChatHistory(contactId) {
    chatBox.innerHTML = '';
    
    if (!chatHistories[contactId] || chatHistories[contactId].length === 0) {
        appendSystemMessage('Нет сообщений');
        return;
    }
    
    chatHistories[contactId].forEach((msg, index) => {
        appendMessage(msg, msg.sender, index);
    });
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Добавление сообщений в чат
function appendMessage(message, sender, index) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.dataset.index = index;
    
    const displayName = contactAliases[activeContact] || activeContact;
    if (sender === 'you') {
        messageElement.classList.add('your-message');
    } else {
        messageElement.classList.add('their-message');
    }
    
    const contentElement = document.createElement('div');
    contentElement.classList.add('message-content');
    
    if (message.replyTo) {
        const replyElement = document.createElement('div');
        replyElement.classList.add('reply-preview');
        const repliedMsg = chatHistories[activeContact][message.replyTo];
        replyElement.textContent = repliedMsg ? `${repliedMsg.sender === 'you' ? 'Вы' : displayName}: ${repliedMsg.content}` : 'Сообщение удалено';
        messageElement.appendChild(replyElement);
    }
    
    if (message.type === 'text') {
        contentElement.textContent = sender === 'you' ? `Вы: ${message.content}` : `${displayName}: ${message.content}`;
    } else if (message.type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = message.content;
        audio.style.maxWidth = '100%';
        contentElement.appendChild(audio);
        const label = document.createElement('div');
        label.textContent = sender === 'you' ? 'Вы (голосовое):' : `${displayName} (голосовое):`;
        contentElement.insertBefore(label, audio);
    } else if (message.type === 'image') {
        const img = document.createElement('img');
        img.src = message.content;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';
        contentElement.appendChild(img);
        const label = document.createElement('div');
        label.textContent = sender === 'you' ? 'Вы (фото):' : `${displayName} (фото):`;
        contentElement.insertBefore(label, img);
    } else if (message.type === 'video') {
        const video = document.createElement('video');
        video.controls = true;
        video.src = message.content;
        video.classList.add('circle-video');
        contentElement.appendChild(video);
        const label = document.createElement('div');
        label.textContent = sender === 'you' ? 'Вы (видео):' : `${displayName} (видео):`;
        contentElement.insertBefore(label, video);
    }
    
    messageElement.appendChild(contentElement);
    
    const replyBtn = document.createElement('button');
    replyBtn.classList.add('reply-btn');
    replyBtn.textContent = 'Ответить';
    replyBtn.onclick = () => {
        replyingTo = index;
        messageInput.placeholder = `Ответ на: ${message.content.slice(0, 20)}...`;
        messageInput.focus();
    };
    messageElement.appendChild(replyBtn);
    
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
    videoBtn.disabled = !isActive;
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
    console.error('PeerJS ошибка:', err);
    appendSystemMessage('⚠️ Ошибка соединения. Проверьте сеть или попробуйте позже.');
});
