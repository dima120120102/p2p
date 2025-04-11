// Инициализация Peer с сохранением ID
let peer;
const savedPeerId = localStorage.getItem('peerId');
if (savedPeerId) {
    peer = new Peer(savedPeerId);
} else {
    peer = new Peer();
    peer.on('open', (id) => {
        localStorage.setItem('peerId', id);
    });
}

// Загрузка истории чата
let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];

// Показываем ID при подключении
peer.on('open', (id) => {
    document.getElementById('your-id').textContent = id;
    // Показываем историю
    renderChatHistory();
});

// Генерация QR-кода
function showQR() {
    const container = document.getElementById('qr-container');
    container.classList.remove('qr-hidden');
    QRCode.toCanvas(container, peer.id, { width: 200 }, (error) => {
        if (error) console.error(error);
    });
}

// Сканирование QR-кода
function scanQR() {
    const modal = document.getElementById('qr-scanner');
    modal.classList.remove('modal-hidden');
    
    const video = document.getElementById('qr-video');
    const scanner = new Instascan.Scanner({ video: video });
    
    scanner.addListener('scan', function (content) {
        document.getElementById('peer-id').value = content;
        hideScanner();
    });
    
    Instascan.Camera.getCameras().then(function (cameras) {
        if (cameras.length > 0) {
            scanner.start(cameras[0]);
        } else {
            alert('Камера не найдена!');
        }
    });
}

function hideScanner() {
    document.getElementById('qr-scanner').classList.add('modal-hidden');
}

// Остальные функции (connect, send и т.д.) остаются как были

// Сохранение сообщений
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

// Отображение истории
function renderChatHistory() {
    chatHistory.forEach(renderMessage);
}

function renderMessage(messageData) {
    const chatBox = document.getElementById('chat');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    if (messageData.sender === 'you') {
        messageElement.classList.add('your-message');
        messageElement.textContent = `Вы: ${messageData.text}`;
    } else if (messageData.sender === 'them') {
        messageElement.classList.add('their-message');
        messageElement.textContent = `Друг: ${messageData.text}`;
    } else {
        messageElement.style.textAlign = 'center';
        messageElement.style.color = '#7f8c8d';
        messageElement.textContent = messageData.text;
    }
    
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Очистка истории (по желанию)
function clearHistory() {
    localStorage.removeItem('chatHistory');
    chatHistory = [];
    document.getElementById('chat').innerHTML = '';
}
