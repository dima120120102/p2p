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
    host: '0.peerjs.com', // Можно заменить на 'peerjs-server.herokuapp.com' для теста
    port: 443,
    secure: true,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
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

// Создаём модальное окно для записи и просмотра видео
const videoPreviewModal = document.createElement('div');
videoPreviewModal.className = 'video-preview-modal';
videoPreviewModal.style.display = 'none';
videoPreviewModal.innerHTML = `
    <div class="modal-content">
        <video id="video-preview" muted autoplay style="border-radius: 50%; width: 200px; height: 200px; object-fit: cover;"></video>
        <div id="recording-timer" style="text-align: center; margin-top: 10px; font-weight: bold;">0:00</div>
    </div>
`;
document.body.appendChild(videoPreviewModal);

const videoPlaybackModal = document.createElement('div');
videoPlaybackModal.className = 'video-playback-modal';
videoPlaybackModal.style.display = 'none';
videoPlaybackModal.innerHTML = `
    <div class="modal-content">
        <video id="video-playback" controls style="width: 400px; height: 400px; object-fit: cover;"></video>
        <button class="close-modal-btn" style="position: absolute; top: 10px; right: 10px; font-size: 24px;">×</button>
    </div>
`;
document.body.appendChild(videoPlaybackModal);

// Состояние приложения
let activeConnection = null;
let activeContact = null;
const connections = new Map(); // Для отслеживания всех RTCPeerConnection
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
let reconnectAttempts = 0;
const maxReconnectAttempts = 3;
const reconnectDelay = 3000; // Задержка между попытками переподключения (3 секунды)
let isReconnecting = false; // Флаг для предотвращения параллельных переподключений
const failedConnections = new Set(); // Для отслеживания пиров, к которым не удалось подключиться
let videoStream = null; // Для хранения потока видео
let recordingStartTime = null; // Для таймера записи

// Инициализация
peer.on('open', (id) => {
    console.log('PeerJS: Подключен с ID', id);
    appendSystemMessage(`✅ Ваш ID: ${id}`);
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
    if (activeConnection && activeContact === contactId) {
        console.log('Уже подключены к', contactId);
        return;
    }
    
    // Закрываем все существующие соединения
    closeAllConnections();
    
    activeContact = contactId;
    const displayName = contactAliases[contactId] || contactId;
    chatHeader.textContent = `Чат с ${displayName}`;
    renderChatHistory(contactId);
    chatArea.style.display = 'flex';
    retryBox.style.display = 'none';
    reconnectAttempts = 0;
    isReconnecting = false;
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

// Закрытие всех соединений
function closeAllConnections() {
    if (activeConnection) {
        console.log('Закрываем активное соединение с', activeContact);
        activeConnection.close();
        activeConnection = null;
    }
    
    for (const [peerId, conn] of connections.entries()) {
        console.log('Закрываем соединение с', peerId);
        conn.close();
        connections.delete(peerId);
    }
}

// Закрытие чата
function closeChat() {
    closeAllConnections();
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
        reconnectAttempts = 0;
        isReconnecting = false;
        failedConnections.delete(activeContact);
        const conn = peer.connect(activeContact);
        setupConnection(conn);
    }
}

// Автоматическое переподключение
function attemptReconnect(contactId) {
    if (isReconnecting) {
        console.log('Переподключение уже выполняется, пропускаем');
        return;
    }
    
    if (reconnectAttempts >= maxReconnectAttempts) {
        appendSystemMessage(`⚠️ Достигнуто максимальное количество попыток переподключения (${maxReconnectAttempts})`);
        retryBox.style.display = 'block';
        failedConnections.add(contactId);
        isReconnecting = false;
        renderContacts();
        return;
    }
    
    reconnectAttempts++;
    isReconnecting = true;
    appendSystemMessage(`🔄 Попытка переподключения ${reconnectAttempts}/${maxReconnectAttempts}`);
    
    // Закрываем старые соединения перед новой попыткой
    closeAllConnections();
    
    setTimeout(() => {
        const conn = peer.connect(contactId);
        setupConnection(conn);
    }, reconnectDelay);
}

// Настройка соединения
function setupConnection(conn) {
    // Сохраняем соединение в Map
    connections.set(conn.peer, conn);
    activeConnection = conn;
    
    console.log('Настройка соединения с', conn.peer);
    
    conn.on('open', () => {
        console.log('Соединение успешно открыто с', conn.peer);
        appendSystemMessage(`✅ Подключение установлено с ${contactAliases[conn.peer] || conn.peer}`);
        reconnectAttempts = 0;
        isReconnecting = false;
        retryBox.style.display = 'none';
        failedConnections.delete(conn.peer);
        updateUI();
    });
    
    conn.on('data', (data) => {
        console.log('Получены данные от', conn.peer, ':', data);
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
            appendSystemMessage(`📩 Новое сообщение от ${contactAliases[conn.peer] || conn.peer}`);
            renderContacts();
        }
    });
    
    conn.on('close', () => {
        console.log('Соединение закрыто с', conn.peer, 'активный контакт:', activeContact);
        appendSystemMessage(`❌ Соединение с ${contactAliases[conn.peer] || conn.peer} закрыто`);
        connections.delete(conn.peer);
        activeConnection = null;
        if (activeContact === conn.peer) {
            console.log('Запускаем переподключение к', conn.peer);
            attemptReconnect(conn.peer);
        }
        updateUI();
    });
    
    conn.on('error', (err) => {
        console.error('Ошибка соединения с', conn.peer, ':', err);
        appendSystemMessage(`⚠️ Ошибка подключения к ${contactAliases[conn.peer] || conn.peer}: ${err.message}`);
        connections.delete(conn.peer);
        activeConnection = null;
        if (activeContact === conn.peer && err.type === 'peer-unavailable') {
            console.log('Запускаем переподключение из-за ошибки peer-unavailable для', conn.peer);
            attemptReconnect(conn.peer);
        } else {
            isReconnecting = false;
            failedConnections.add(conn.peer);
            retryBox.style.display = 'block';
            renderContacts();
        }
        updateUI();
    });
    
    conn.on('iceStateChange', (state) => {
        console.log('ICE state changed to', state, 'for', conn.peer);
        appendSystemMessage(`ℹ️ ICE состояние: ${state}`);
        if (state === 'disconnected' || state === 'failed') {
            connections.delete(conn.peer);
            if (activeContact === conn.peer) {
                console.log('ICE состояние:', state, 'запускаем переподключение');
                attemptReconnect(conn.peer);
            }
        }
    });
}

// Приём входящих подключений
peer.on('connection', (conn) => {
    const contactId = conn.peer;
    console.log('Входящее соединение от', contactId);
    
    // Проверяем, не слишком ли много соединений
    if (connections.size >= 10) {
        console.warn('Слишком много открытых соединений, закрываем входящее от', contactId);
        conn.close();
        return;
    }
    
    if (!contacts.includes(contactId)) {
        console.log('Добавляем новый контакт:', contactId);
        contacts.push(contactId);
        localStorage.setItem('contacts', JSON.stringify(contacts));
        
        if (!chatHistories[contactId]) {
            chatHistories[contactId] = [];
            saveChatHistories();
        }
    }
    
    if (activeContact === contactId) {
        console.log('Устанавливаем соединение с', contactId, 'как активное');
        setupConnection(conn);
    } else {
        console.log('Закрываем входящее соединение от', contactId, 'так как активный контакт:', activeContact);
        conn.on('open', () => {
            conn.close();
        });
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

// Таймер для записи видео
function updateRecordingTimer() {
    if (!isVideoRecording) return;
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('recording-timer').textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    setTimeout(updateRecordingTimer, 1000);
}

// Запись видео в кружочке
function startVideoRecording() {
    if (!activeConnection || !activeContact) return;
    
    if (!isVideoRecording) {
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                videoStream = stream;
                mediaRecorder = new MediaRecorder(stream);
                videoChunks = [];
                
                // Показываем превью
                const videoPreview = document.getElementById('video-preview');
                videoPreview.srcObject = stream;
                videoPreviewModal.style.display = 'flex';
                
                // Запускаем таймер
                recordingStartTime = Date.now();
                updateRecordingTimer();
                
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
                    
                    // Закрываем превью и останавливаем поток
                    videoPreviewModal.style.display = 'none';
                    videoPreview.srcObject = null;
                    stream.getTracks().forEach(track => track.stop());
                    videoStream = null;
                };
                
                mediaRecorder.start();
                isVideoRecording = true;
                videoBtn.textContent = '⏹️';
                videoBtn.title = 'Остановить запись';
                videoBtn.classList.add('recording');
                
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

// Удаление контакта
function deleteContact(contactId) {
    if (confirm(`Удалить контакт ${contactAliases[contactId] || contactId}?`)) {
        const index = contacts.indexOf(contactId);
        if (index !== -1) {
            contacts.splice(index, 1);
            localStorage.setItem('contacts', JSON.stringify(contacts));
        }
        delete chatHistories[contactId];
        saveChatHistories();
        delete contactAliases[contactId];
        localStorage.setItem('contactAliases', JSON.stringify(contactAliases));
        delete unreadMessages[contactId];
        saveUnreadMessages();
        failedConnections.delete(contactId);
        
        if (activeContact === contactId) {
            closeChat();
        }
        
        renderContacts();
    }
}

// Отображение контактов
function renderContacts() {
    contactsList.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsList.innerHTML = '<div class="no-contacts">Нет контактов</div>';
        return;
    }
    
    for (const contactId of contacts) {
        const displayName = contactAliases[contactId] || contactId;
        const isFailed = failedConnections.has(contactId);
        const unreadCount = unreadMessages[contactId] || 0;
        
        const contactElement = document.createElement('div');
        contactElement.className = 'contact';
        contactElement.innerHTML = `
            <span class="status-indicator ${isFailed ? 'offline' : 'unknown'}"></span>
            <span class="contact-name">${displayName}</span>
            ${unreadCount > 0 ? `<span class="unread-count">${unreadCount}</span>` : ''}
            <button class="edit-contact-btn" onclick="editContactName('${contactId}')">✎</button>
            <button class="delete-contact-btn" onclick="deleteContact('${contactId}')">🗑️</button>
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
        video.src = message.content;
        video.classList.add('circle-video');
        video.style.width = '100px';
        video.style.height = '100px';
        video.style.borderRadius = '50%';
        video.style.objectFit = 'cover';
        video.controls = true;
        contentElement.appendChild(video);
        const label = document.createElement('div');
        label.textContent = sender === 'you' ? 'Вы (видео):' : `${displayName} (видео):`;
        contentElement.insertBefore(label, video);
        
        // При клике на видео открываем его в увеличенном виде
        video.onclick = () => {
            const playbackVideo = document.getElementById('video-playback');
            playbackVideo.src = message.content;
            videoPlaybackModal.style.display = 'flex';
            playbackVideo.play();
        };
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

// Закрытие модального окна для воспроизведения
document.querySelector('.close-modal-btn').onclick = () => {
    const playbackVideo = document.getElementById('video-playback');
    playbackVideo.pause();
    playbackVideo.src = '';
    videoPlaybackModal.style.display = 'none';
};

// Закрытие модального окна при клике вне контента
videoPlaybackModal.onclick = (e) => {
    if (e.target === videoPlaybackModal) {
        const playbackVideo = document.getElementById('video-playback');
        playbackVideo.pause();
        playbackVideo.src = '';
        videoPlaybackModal.style.display = 'none';
    }
};

// Обработчики событий
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') send();
});

peer.on('error', (err) => {
    console.error('PeerJS ошибка:', err);
    appendSystemMessage(`⚠️ Ошибка PeerJS: ${err.type} - ${err.message}`);
});

peer.on('disconnected', () => {
    console.log('PeerJS: Отключен от сервера');
    appendSystemMessage('⚠️ Отключен от сервера PeerJS');
});

peer.on('close', () => {
    console.log('PeerJS: Соединение полностью закрыто');
    appendSystemMessage('❌ PeerJS соединение закрыто');
    closeAllConnections();
});
