// Глобальные переменные
let currentUser = null;
let currentChatUser = null;
let currentChatType = null; // 'contact' or 'group'
let contacts = [];
let groups = [];
let messages = {};
let peerConnections = new Map(); // Для групповых звонков
let localStream = null;
let remoteStreams = new Map(); // Для групповых звонков
let socket = null;
let isVideoEnabled = true;
let isAudioEnabled = true;
let currentFilter = 'all'; // 'all', 'contacts', 'groups'
let isAdmin = false; // Флаг админа

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Проверка авторизации
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showAppScreen();
        connectWebSocket();
    } else {
        showAuthScreen();
    }

    // Обработчики вкладок авторизации
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(btn.dataset.tab);
        });
    });

    // Обработчики форм
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);
    document.getElementById('registerFormElement').addEventListener('submit', handleRegister);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Обработчики звонков
    const videoCallBtn = document.getElementById('videoCallBtn');
    const audioCallBtn = document.getElementById('audioCallBtn');
    const endCallBtn = document.getElementById('endCallBtn');
    const endCallBtnBottom = document.getElementById('endCallBtnBottom');
    const toggleVideoBtn = document.getElementById('toggleVideoBtn');
    const toggleAudioBtn = document.getElementById('toggleAudioBtn');
    
    if (videoCallBtn) videoCallBtn.addEventListener('click', () => startCall(true));
    if (audioCallBtn) audioCallBtn.addEventListener('click', () => startCall(false));
    if (endCallBtn) endCallBtn.addEventListener('click', endCall);
    if (endCallBtnBottom) endCallBtnBottom.addEventListener('click', endCall);
    if (toggleVideoBtn) toggleVideoBtn.addEventListener('click', toggleVideo);
    if (toggleAudioBtn) toggleAudioBtn.addEventListener('click', toggleAudio);

    // Обработчики групп
    document.getElementById('createGroupBtn').addEventListener('click', showCreateGroupModal);
    document.getElementById('closeCreateGroupModal').addEventListener('click', hideCreateGroupModal);
    document.getElementById('cancelCreateGroup').addEventListener('click', hideCreateGroupModal);
    document.getElementById('createGroup').addEventListener('click', createGroup);
    document.getElementById('groupInfoBtn').addEventListener('click', showGroupInfo);
    document.getElementById('closeGroupInfoModal').addEventListener('click', hideGroupInfoModal);
    document.getElementById('leaveGroupBtn').addEventListener('click', leaveGroup);
    document.getElementById('addMemberBtn').addEventListener('click', showAddMemberModal);

    // Обработчики вкладок контактов
    document.querySelectorAll('.contacts-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.contacts-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.tab;
            loadContacts();
        });
    });

    // Поиск пользователей
    document.getElementById('searchUsers').addEventListener('input', handleSearch);

    // Профиль
    document.getElementById('profileBtn').addEventListener('click', showProfileModal);
    document.getElementById('closeProfileModal').addEventListener('click', hideProfileModal);
    document.getElementById('cancelProfile').addEventListener('click', hideProfileModal);
    document.getElementById('saveProfile').addEventListener('click', saveProfile);
    document.getElementById('profileAvatarInput').addEventListener('input', updateAvatarPreview);

    // Админ панель
    document.getElementById('adminPanelBtn').addEventListener('click', showAdminPanel);
    document.getElementById('closeAdminModal').addEventListener('click', hideAdminModal);

    // Совещания
    document.getElementById('closeMeetingBtn').addEventListener('click', hideMeetingModal);

    // Мобильное меню
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const contactsPanel = document.querySelector('.contacts-panel');
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            contactsPanel.classList.toggle('mobile-open');
        });
    }

    // Закрытие мобильного меню при клике вне его
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && contactsPanel && contactsPanel.classList.contains('mobile-open')) {
            if (!contactsPanel.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
                contactsPanel.classList.remove('mobile-open');
            }
        }
    });
}

// Авторизация
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`${tab}Form`).classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        if (response.ok) {
            currentUser = data.user;
            if (currentUser.email === 'admin@admin.com') {
                currentUser.isAdmin = true;
            }
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            localStorage.setItem('token', data.token);
            showAppScreen();
            connectWebSocket();
        } else {
            alert(data.message || 'Ошибка входа');
        }
    } catch (error) {
        // Если сервер недоступен, используем локальное хранилище
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(u => u.email === email && u.password === password);
        if (user) {
            currentUser = { ...user };
            delete currentUser.password;
            // Проверка админа
            if (email === 'admin@admin.com' || user.isAdmin) {
                currentUser.isAdmin = true;
            }
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showAppScreen();
        } else {
            alert('Неверный email или пароль');
        }
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

    if (password !== passwordConfirm) {
        alert('Пароли не совпадают');
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();
        if (response.ok) {
            alert('Регистрация успешна! Войдите в систему.');
            switchTab('login');
        } else {
            alert(data.message || 'Ошибка регистрации');
        }
    } catch (error) {
        // Если сервер недоступен, используем локальное хранилище
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        if (users.find(u => u.email === email)) {
            alert('Пользователь с таким email уже существует');
            return;
        }

        const newUser = {
            id: Date.now().toString(),
            name,
            email,
            password,
            avatar: name.charAt(0).toUpperCase(),
            isAdmin: email === 'admin@admin.com' || false,
            hasMeetingAccess: false
        };
        users.push(newUser);
        localStorage.setItem('users', JSON.stringify(users));
        alert('Регистрация успешна! Войдите в систему.');
        switchTab('login');
    }
}

function handleLogout() {
    currentUser = null;
    currentChatUser = null;
    isAdmin = false;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
    if (socket) socket.close();
    showAuthScreen();
}

// UI функции
function showAuthScreen() {
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('hidden');
}

function showAppScreen() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    document.getElementById('currentUserName').textContent = currentUser.name;
    
    // Проверка админ прав
    checkAdminStatus();
    
    loadContacts();
}

// Контакты - функция loadContacts определена ниже после функций групп

function selectContact(contact) {
    currentChatUser = contact;
    currentChatType = 'contact';
    document.querySelectorAll('.contact-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.userId === contact.id && item.dataset.type === 'contact') {
            item.classList.add('active');
        }
    });

    document.getElementById('noChatSelected').classList.add('hidden');
    document.getElementById('activeChat').classList.remove('hidden');
    document.getElementById('chatUserName').textContent = contact.name;
    document.getElementById('chatUserAvatar').textContent = contact.avatar || contact.name.charAt(0).toUpperCase();
    document.getElementById('groupInfoBtn').style.display = 'none';
    document.getElementById('groupMembersCount').style.display = 'none';
    
    loadMessages(contact.id);
}

function selectGroup(group) {
    currentChatUser = group;
    currentChatType = 'group';
    document.querySelectorAll('.contact-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.groupId === group.id && item.dataset.type === 'group') {
            item.classList.add('active');
        }
    });

    document.getElementById('noChatSelected').classList.add('hidden');
    document.getElementById('activeChat').classList.remove('hidden');
    document.getElementById('chatUserName').textContent = group.name;
    document.getElementById('chatUserAvatar').textContent = group.name.charAt(0).toUpperCase();
    document.getElementById('groupInfoBtn').style.display = 'block';
    document.getElementById('groupMembersCount').textContent = `${group.members.length} участников`;
    document.getElementById('groupMembersCount').style.display = 'block';
    
    loadGroupMessages(group.id);
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    const contactItems = document.querySelectorAll('.contact-item');
    
    contactItems.forEach(item => {
        const name = item.querySelector('.contact-name').textContent.toLowerCase();
        if (name.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Сообщения
function loadMessages(userId) {
    const chatId = [currentUser.id, userId].sort().join('_');
    if (!messages[chatId]) {
        messages[chatId] = [];
    }

    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';

    messages[chatId].forEach(msg => {
        addMessageToUI(msg, false); // false = не прокручивать для каждого сообщения
    });
    
    // Прокрутка вниз после загрузки всех сообщений
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

function loadGroupMessages(groupId) {
    const chatId = `group_${groupId}`;
    if (!messages[chatId]) {
        messages[chatId] = [];
    }

    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';

    messages[chatId].forEach(msg => {
        addMessageToUI(msg, false); // false = не прокручивать для каждого сообщения
    });
    
    // Прокрутка вниз после загрузки всех сообщений
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !currentChatUser) return;

    let message, chatId;

    if (currentChatType === 'group') {
        message = {
            id: Date.now().toString(),
            from: currentUser.id,
            fromName: currentUser.name,
            groupId: currentChatUser.id,
            text,
            timestamp: new Date()
        };
        chatId = `group_${currentChatUser.id}`;
    } else {
        message = {
            id: Date.now().toString(),
            from: currentUser.id,
            to: currentChatUser.id,
            text,
            timestamp: new Date()
        };
        chatId = [currentUser.id, currentChatUser.id].sort().join('_');
    }

    if (!messages[chatId]) {
        messages[chatId] = [];
    }
    messages[chatId].push(message);

    // Сохранение в localStorage
    localStorage.setItem('messages', JSON.stringify(messages));

    // Отправка через WebSocket если доступен
    if (socket && socket.readyState === WebSocket.OPEN) {
        if (currentChatType === 'group') {
            // Добавляем список участников для группового сообщения
            message.members = currentChatUser.members;
            socket.send(JSON.stringify({
                type: 'group-message',
                data: message
            }));
        } else {
            socket.send(JSON.stringify({
                type: 'message',
                data: message
            }));
        }
    }

    addMessageToUI(message);
    input.value = '';
}

function addMessageToUI(message, scrollToBottom = true) {
    const messagesContainer = document.getElementById('messagesContainer');
    const isOwn = message.from === currentUser.id;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const senderName = currentChatType === 'group' && !isOwn 
        ? `<div class="message-sender">${message.fromName || 'Неизвестный'}</div>` 
        : '';
    
    messageDiv.innerHTML = `
        ${senderName}
        <div class="message-bubble">${escapeHtml(message.text)}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    
    // Плавная прокрутка вниз только если нужно
    if (scrollToBottom) {
        requestAnimationFrame(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// WebSocket соединение
function connectWebSocket() {
    try {
        socket = new WebSocket('ws://localhost:3000');
    
    socket.onopen = () => {
            console.log('WebSocket подключен');
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'register',
                    userId: currentUser.id
                }));
            }
        };

    socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        };

    socket.onerror = (error) => {
            console.log('WebSocket ошибка:', error);
        };

    socket.onclose = () => {
            console.log('WebSocket отключен');
            setTimeout(connectWebSocket, 3000);
        };
    } catch (error) {
        console.log('WebSocket недоступен, работаем в офлайн режиме');
    }
}

// handleWebSocketMessage определена ниже после функций групп

// WebRTC для видеозвонков
async function startCall(video = true) {
    if (!currentChatUser) return;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: video,
            audio: true
        });

        document.getElementById('localVideo').srcObject = localStream;
        if (!video) {
            document.getElementById('localVideo').style.display = 'none';
        }

        document.getElementById('callModal').classList.remove('hidden');
        document.getElementById('callUserName').textContent = `Звонок ${currentChatUser.name}`;
        document.getElementById('callStatus').textContent = 'Звонок...';
        
        // Обновление анимации звонка
        const callAnimation = document.getElementById('callAnimation');
        const callAvatarLarge = document.getElementById('callAvatarLarge');
        const callAnimationName = document.getElementById('callAnimationName');
        const callAnimationStatus = document.getElementById('callAnimationStatus');
        
        if (callAnimation) {
            callAnimation.classList.remove('hidden');
            if (callAvatarLarge) {
                callAvatarLarge.textContent = (currentChatUser.avatar || currentChatUser.name.charAt(0)).toUpperCase();
            }
            if (callAnimationName) {
                callAnimationName.textContent = currentChatUser.name;
            }
            if (callAnimationStatus) {
                callAnimationStatus.textContent = 'Подключение...';
            }
        }

        createPeerConnection();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Отправка предложения звонка
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'call-offer',
                from: currentUser.id,
                fromName: currentUser.name,
                to: currentChatUser.id,
                video: video
            }));
        }

        // Создание offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'call-offer-sdp',
                from: currentUser.id,
                fromName: currentUser.name,
                to: currentChatUser.id,
                offer: offer
            }));
        }
    } catch (error) {
        console.error('Ошибка при начале звонка:', error);
        alert('Не удалось получить доступ к камере/микрофону');
    }
}

function createPeerConnection() {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    };

    peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'ice-candidate',
                from: currentUser.id,
                to: currentChatUser.id,
                candidate: event.candidate
            }));
        }
    };

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.style.display = 'block';
            // Скрываем анимацию когда появляется видео
            const callAnimation = document.getElementById('callAnimation');
            if (callAnimation) {
                callAnimation.classList.add('hidden');
            }
        }
        document.getElementById('callStatus').textContent = 'Подключено';
        const callAnimationStatus = document.getElementById('callAnimationStatus');
        if (callAnimationStatus) {
            callAnimationStatus.textContent = 'Подключено';
        }
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        document.getElementById('callStatus').textContent = state;
        if (state === 'disconnected' || state === 'failed') {
            setTimeout(endCall, 2000);
        }
    };
}

async function handleIncomingCall(data) {
    // Находим пользователя в контактах
    const caller = contacts.find(c => c.id === data.from) || { 
        id: data.from,
        name: data.fromName || 'Неизвестный',
        avatar: (data.fromName || '?').charAt(0).toUpperCase()
    };
    const accept = confirm(`Входящий звонок от ${caller.name}. Принять?`);
    if (!accept) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'call-reject',
                from: currentUser.id,
                to: data.from
            }));
        }
        return;
    }
    
    // Устанавливаем текущего собеседника для звонка
    if (!currentChatUser || currentChatUser.id !== data.from) {
        currentChatUser = caller;
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: data.video !== false,
            audio: true
        });

        document.getElementById('localVideo').srcObject = localStream;
        if (!data.video) {
            document.getElementById('localVideo').style.display = 'none';
        }

        document.getElementById('callModal').classList.remove('hidden');
        document.getElementById('callUserName').textContent = `Звонок ${caller.name}`;
        document.getElementById('callStatus').textContent = 'Подключение...';
        
        // Обновление анимации звонка
        const callAnimation = document.getElementById('callAnimation');
        const callAvatarLarge = document.getElementById('callAvatarLarge');
        const callAnimationName = document.getElementById('callAnimationName');
        const callAnimationStatus = document.getElementById('callAnimationStatus');
        
        if (callAnimation) {
            callAnimation.classList.remove('hidden');
            if (callAvatarLarge) {
                callAvatarLarge.textContent = (caller.avatar || caller.name.charAt(0)).toUpperCase();
            }
            if (callAnimationName) {
                callAnimationName.textContent = caller.name;
            }
            if (callAnimationStatus) {
                callAnimationStatus.textContent = 'Подключение...';
            }
        }

        createPeerConnection();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    } catch (error) {
        console.error('Ошибка при принятии звонка:', error);
        alert('Не удалось получить доступ к камере/микрофону');
        endCall();
    }
}

async function handleIncomingCallSDP(data) {
    if (!peerConnection) {
        // Если звонок еще не был принят, принимаем его автоматически
        const caller = contacts.find(c => c.id === data.from) || { 
            id: data.from,
            name: data.fromName || 'Неизвестный',
            avatar: (data.fromName || '?').charAt(0).toUpperCase()
        };
        
        if (!currentChatUser || currentChatUser.id !== data.from) {
            currentChatUser = caller;
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            document.getElementById('localVideo').srcObject = localStream;
            document.getElementById('callModal').classList.remove('hidden');
            document.getElementById('callUserName').textContent = `Звонок ${caller.name}`;
            document.getElementById('callStatus').textContent = 'Подключение...';
            
            // Обновление анимации звонка
            const callAnimation = document.getElementById('callAnimation');
            const callAvatarLarge = document.getElementById('callAvatarLarge');
            const callAnimationName = document.getElementById('callAnimationName');
            const callAnimationStatus = document.getElementById('callAnimationStatus');
            
            if (callAnimation) {
                callAnimation.classList.remove('hidden');
                if (callAvatarLarge) {
                    callAvatarLarge.textContent = (caller.avatar || caller.name.charAt(0)).toUpperCase();
                }
                if (callAnimationName) {
                    callAnimationName.textContent = caller.name;
                }
                if (callAnimationStatus) {
                    callAnimationStatus.textContent = 'Подключение...';
                }
            }

            createPeerConnection();
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        } catch (error) {
            console.error('Ошибка при принятии звонка:', error);
            return;
        }
    }

    try {
        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'call-answer-sdp',
                from: currentUser.id,
                to: data.from,
                answer: answer
            }));
        }
    } catch (error) {
        console.error('Ошибка при обработке SDP:', error);
    }
}

async function handleCallAnswer(data) {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(data.answer);
    }
}

function handleIceCandidate(data) {
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
}

function endCall() {
    try {
        console.log('Завершение звонка...');
        
        // Останавливаем локальный поток
        if (localStream) {
            localStream.getTracks().forEach(track => {
                try {
                    track.stop();
                    console.log('Остановлен трек:', track.kind);
                } catch (e) {
                    console.error('Ошибка при остановке трека:', e);
                }
            });
            localStream = null;
        }

        // Закрываем peer connection
        if (peerConnection) {
            try {
                peerConnection.close();
            } catch (e) {
                console.error('Ошибка при закрытии peerConnection:', e);
            }
            peerConnection = null;
        }

        // Закрываем все групповые соединения
        if (peerConnections && peerConnections.size > 0) {
            peerConnections.forEach((pc, userId) => {
                try {
                    pc.close();
                } catch (e) {
                    console.error('Ошибка при закрытии группового соединения:', e);
                }
            });
            peerConnections.clear();
        }

        // Очищаем удаленные потоки
        if (remoteStreams && remoteStreams.size > 0) {
            remoteStreams.forEach((stream, userId) => {
                stream.getTracks().forEach(track => {
                    try {
                        track.stop();
                    } catch (e) {
                        console.error('Ошибка при остановке удаленного трека:', e);
                    }
                });
            });
            remoteStreams.clear();
        }

        // Очищаем видео элементы
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = null;
            localVideo.style.display = 'block';
        }
        
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            remoteVideo.srcObject = null;
            remoteVideo.style.display = 'none';
        }

        // Очищаем контейнер с удаленными видео
        const remoteVideosContainer = document.getElementById('remoteVideosContainer');
        if (remoteVideosContainer) {
            remoteVideosContainer.innerHTML = '';
        }

        // Скрываем модальное окно звонка
        const callModal = document.getElementById('callModal');
        if (callModal) {
            callModal.classList.add('hidden');
        }
        
        // Показываем анимацию снова при следующем звонке
        const callAnimation = document.getElementById('callAnimation');
        if (callAnimation) {
            callAnimation.classList.remove('hidden');
        }

        // Отправляем сигнал о завершении звонка
        if (socket && socket.readyState === WebSocket.OPEN && currentChatUser) {
            try {
                socket.send(JSON.stringify({
                    type: 'call-end',
                    from: currentUser.id,
                    to: currentChatUser.id
                }));
            } catch (e) {
                console.error('Ошибка при отправке сигнала завершения:', e);
            }
        }

        console.log('Звонок завершен');
    } catch (error) {
        console.error('Критическая ошибка при завершении звонка:', error);
        // Принудительно скрываем модальное окно даже при ошибке
        const callModal = document.getElementById('callModal');
        if (callModal) {
            callModal.classList.add('hidden');
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            isVideoEnabled = !isVideoEnabled;
            videoTrack.enabled = isVideoEnabled;
            document.getElementById('localVideo').style.display = isVideoEnabled ? 'block' : 'none';
        }
    }
}

function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isAudioEnabled = !isAudioEnabled;
            audioTrack.enabled = isAudioEnabled;
        }
    }
}

// Функции для работы с группами
function showCreateGroupModal() {
    const modal = document.getElementById('createGroupModal');
    modal.classList.remove('hidden');
    
    const participantsList = document.getElementById('participantsList');
    participantsList.innerHTML = '';
    
    contacts.forEach(contact => {
        const participantItem = document.createElement('div');
        participantItem.className = 'participant-item';
        participantItem.innerHTML = `
            <input type="checkbox" id="participant_${contact.id}" value="${contact.id}">
            <label for="participant_${contact.id}">
                <div class="user-avatar" style="width: 30px; height: 30px; font-size: 14px;">${contact.avatar || contact.name.charAt(0).toUpperCase()}</div>
                <span>${contact.name}</span>
            </label>
        `;
        participantsList.appendChild(participantItem);
    });
}

function hideCreateGroupModal() {
    document.getElementById('createGroupModal').classList.add('hidden');
    document.getElementById('groupName').value = '';
    document.querySelectorAll('#participantsList input[type="checkbox"]').forEach(cb => cb.checked = false);
}

function createGroup() {
    const groupName = document.getElementById('groupName').value.trim();
    if (!groupName) {
        alert('Введите название группы');
        return;
    }

    const selectedParticipants = Array.from(
        document.querySelectorAll('#participantsList input[type="checkbox"]:checked')
    ).map(cb => cb.value);

    if (selectedParticipants.length === 0) {
        alert('Выберите хотя бы одного участника');
        return;
    }

    const group = {
        id: Date.now().toString(),
        name: groupName,
        members: [currentUser.id, ...selectedParticipants],
        createdBy: currentUser.id,
        createdAt: new Date()
    };

    groups.push(group);
    localStorage.setItem('groups', JSON.stringify(groups));

    // Отправка через WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'group-created',
            data: group
        }));
    }

    hideCreateGroupModal();
    loadContacts();
    selectGroup(group);
}

function showGroupInfo() {
    if (!currentChatUser || currentChatType !== 'group') return;
    
    const modal = document.getElementById('groupInfoModal');
    document.getElementById('groupInfoTitle').textContent = currentChatUser.name;
    modal.classList.remove('hidden');
    
    const membersList = document.getElementById('groupMembersList');
    membersList.innerHTML = '';
    
    const allUsers = JSON.parse(localStorage.getItem('users') || '[]');
    currentChatUser.members.forEach(memberId => {
        const member = allUsers.find(u => u.id === memberId) || contacts.find(c => c.id === memberId);
        if (member) {
            const memberItem = document.createElement('div');
            memberItem.className = 'group-member-item';
            memberItem.innerHTML = `
                <div class="user-avatar" style="width: 40px; height: 40px; font-size: 16px;">${member.avatar || member.name.charAt(0).toUpperCase()}</div>
                <div>
                    <div class="contact-name">${member.name}</div>
                    ${memberId === currentChatUser.createdBy ? '<div style="font-size: 12px; color: #667eea;">Создатель</div>' : ''}
                </div>
            `;
            membersList.appendChild(memberItem);
        }
    });
}

function hideGroupInfoModal() {
    document.getElementById('groupInfoModal').classList.add('hidden');
}

function leaveGroup() {
    if (!currentChatUser || currentChatType !== 'group') return;
    
    if (confirm('Вы уверены, что хотите покинуть группу?')) {
        const groupIndex = groups.findIndex(g => g.id === currentChatUser.id);
        if (groupIndex !== -1) {
            groups[groupIndex].members = groups[groupIndex].members.filter(id => id !== currentUser.id);
            localStorage.setItem('groups', JSON.stringify(groups));
            
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'group-left',
                    groupId: currentChatUser.id,
                    userId: currentUser.id
                }));
            }
            
            groups = groups.filter(g => g.members.includes(currentUser.id));
            currentChatUser = null;
            currentChatType = null;
            
            document.getElementById('noChatSelected').classList.remove('hidden');
            document.getElementById('activeChat').classList.add('hidden');
            
            hideGroupInfoModal();
            loadContacts();
        }
    }
}

function showAddMemberModal() {
    // Упрощенная версия - можно расширить
    alert('Функция добавления участников будет доступна в следующей версии');
}

// Обновление loadContacts с правильной логикой
function loadContacts() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    contacts = users.filter(u => u.id !== currentUser.id);
    groups = JSON.parse(localStorage.getItem('groups') || '[]').filter(g => 
        g.members.includes(currentUser.id)
    );
    
    const contactsList = document.getElementById('contactsList');
    contactsList.innerHTML = '';

    // Загружаем контакты и группы в зависимости от фильтра
    if (currentFilter === 'all' || currentFilter === 'contacts') {
        contacts.forEach(contact => {
            const contactItem = document.createElement('div');
            contactItem.className = 'contact-item';
            contactItem.dataset.userId = contact.id;
            contactItem.dataset.type = 'contact';
            contactItem.innerHTML = `
                <div class="user-avatar">${contact.avatar || contact.name.charAt(0).toUpperCase()}</div>
                <div class="contact-info">
                    <div class="contact-name">${contact.name}</div>
                    <div class="contact-status status-online">в сети</div>
                </div>
            `;
            contactItem.addEventListener('click', () => selectContact(contact));
            contactsList.appendChild(contactItem);
        });
    }

    if (currentFilter === 'all' || currentFilter === 'groups') {
        groups.forEach(group => {
            const groupItem = document.createElement('div');
            groupItem.className = 'contact-item group';
            groupItem.dataset.groupId = group.id;
            groupItem.dataset.type = 'group';
            const memberCount = group.members.length;
            groupItem.innerHTML = `
                <div class="user-avatar">${group.name.charAt(0).toUpperCase()}</div>
                <div class="contact-info">
                    <div class="contact-name">${group.name}</div>
                    <div class="group-members-count">${memberCount} участников</div>
                </div>
            `;
            groupItem.addEventListener('click', () => selectGroup(group));
            contactsList.appendChild(groupItem);
        });
    }
}

// Обновление handleWebSocketMessage для групповых сообщений
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'message':
            const chatId = [currentUser.id, data.data.from].sort().join('_');
            if (!messages[chatId]) messages[chatId] = [];
            messages[chatId].push(data.data);
            if (currentChatUser && currentChatType === 'contact' && currentChatUser.id === data.data.from) {
                addMessageToUI(data.data);
            }
            break;
        case 'group-message':
            const groupChatId = `group_${data.data.groupId}`;
            if (!messages[groupChatId]) messages[groupChatId] = [];
            messages[groupChatId].push(data.data);
            if (currentChatUser && currentChatType === 'group' && currentChatUser.id === data.data.groupId) {
                addMessageToUI(data.data);
            }
            break;
        case 'call-offer':
            handleIncomingCall(data);
            break;
        case 'call-offer-sdp':
            handleIncomingCallSDP(data);
            break;
        case 'call-answer-sdp':
            handleCallAnswer(data);
            break;
        case 'ice-candidate':
            handleIceCandidate(data);
            break;
        case 'call-end':
            // Завершаем звонок если модальное окно открыто
            const callModal = document.getElementById('callModal');
            if (callModal && !callModal.classList.contains('hidden')) {
                endCall();
            }
            break;
    }
}

// Функции профиля
function showProfileModal() {
    const modal = document.getElementById('profileModal');
    modal.classList.remove('hidden');
    
    // Заполняем форму текущими данными
    document.getElementById('profileName').value = currentUser.name;
    document.getElementById('profileEmail').value = currentUser.email;
    document.getElementById('profileAvatarInput').value = currentUser.avatar || currentUser.name.charAt(0).toUpperCase();
    document.getElementById('profileAvatarPreview').textContent = currentUser.avatar || currentUser.name.charAt(0).toUpperCase();
    document.getElementById('profileCurrentPassword').value = '';
    document.getElementById('profileNewPassword').value = '';
    document.getElementById('profileConfirmPassword').value = '';
}

function hideProfileModal() {
    document.getElementById('profileModal').classList.add('hidden');
}

function updateAvatarPreview() {
    const input = document.getElementById('profileAvatarInput');
    const preview = document.getElementById('profileAvatarPreview');
    const value = input.value.toUpperCase() || currentUser.name.charAt(0).toUpperCase();
    preview.textContent = value;
}

function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const avatar = document.getElementById('profileAvatarInput').value.toUpperCase().trim() || name.charAt(0).toUpperCase();
    const currentPassword = document.getElementById('profileCurrentPassword').value;
    const newPassword = document.getElementById('profileNewPassword').value;
    const confirmPassword = document.getElementById('profileConfirmPassword').value;

    if (!name || !email) {
        alert('Имя и email обязательны');
        return;
    }

    if (newPassword && newPassword !== confirmPassword) {
        alert('Новые пароли не совпадают');
        return;
    }

    if (newPassword && !currentPassword) {
        alert('Для смены пароля введите текущий пароль');
        return;
    }

    // Обновляем пользователя
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    
    if (userIndex !== -1) {
        // Проверяем текущий пароль если меняем пароль
        if (newPassword && currentPassword) {
            if (users[userIndex].password !== currentPassword) {
                alert('Неверный текущий пароль');
                return;
            }
            users[userIndex].password = newPassword;
        }

        users[userIndex].name = name;
        users[userIndex].email = email;
        users[userIndex].avatar = avatar;

        localStorage.setItem('users', JSON.stringify(users));

        // Обновляем текущего пользователя
        currentUser.name = name;
        currentUser.email = email;
        currentUser.avatar = avatar;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // Обновляем UI
        document.getElementById('currentUserName').textContent = name;
        loadContacts();

        alert('Профиль успешно обновлен');
        hideProfileModal();
    }
}

// Функции админ панели
function showAdminPanel() {
    if (!isAdmin) {
        // Запрос логина и пароля
        const login = prompt('Введите логин админа:');
        const password = prompt('Введите пароль админа:');
        
        if (login === 'admin' && password === 'admin') {
            isAdmin = true;
            currentUser.isAdmin = true;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            checkAdminStatus();
        } else {
            alert('Неверный логин или пароль');
            return;
        }
    }

    const modal = document.getElementById('adminModal');
    modal.classList.remove('hidden');
    loadAdminUsers();
}

function hideAdminModal() {
    document.getElementById('adminModal').classList.add('hidden');
}

function loadAdminUsers() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const adminUsersList = document.getElementById('adminUsersList');
    adminUsersList.innerHTML = '';

    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'admin-user-item';
        userItem.innerHTML = `
            <div class="admin-user-info">
                <div class="user-avatar" style="width: 50px; height: 50px; font-size: 20px;">${user.avatar || user.name.charAt(0).toUpperCase()}</div>
                <div>
                    <div class="contact-name">${user.name}</div>
                    <div style="font-size: 12px; color: #666;">${user.email}</div>
                </div>
            </div>
            <div class="admin-user-actions">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <span>Совещания</span>
                    <input type="checkbox" class="meeting-checkbox" data-user-id="${user.id}" ${user.hasMeetingAccess ? 'checked' : ''} onchange="toggleMeetingAccess('${user.id}')">
                </label>
            </div>
        `;
        adminUsersList.appendChild(userItem);
    });
}

function toggleMeetingAccess(userId) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex !== -1) {
        users[userIndex].hasMeetingAccess = !users[userIndex].hasMeetingAccess;
        localStorage.setItem('users', JSON.stringify(users));
        
        // Если это текущий пользователь, обновляем его
        if (currentUser.id === userId) {
            currentUser.hasMeetingAccess = users[userIndex].hasMeetingAccess;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateMeetingButton();
        }
    }
}

function updateMeetingButton() {
    // Кнопка совещания будет добавлена в чат если у пользователя есть доступ
    if (!currentUser) return;
    
    const meetingBtn = document.getElementById('meetingBtn');
    if (currentUser.hasMeetingAccess) {
        if (!meetingBtn) {
            const chatActions = document.querySelector('.chat-actions');
            if (chatActions) {
                const btn = document.createElement('button');
                btn.id = 'meetingBtn';
                btn.className = 'btn btn-icon';
                btn.title = 'Совещания';
                btn.textContent = '📋';
                btn.addEventListener('click', showMeetingModal);
                chatActions.insertBefore(btn, chatActions.firstChild);
            }
        }
    } else {
        if (meetingBtn) {
            meetingBtn.remove();
        }
    }
}

function showMeetingModal() {
    if (!currentUser.hasMeetingAccess) {
        alert('У вас нет доступа к совещаниям. Обратитесь к администратору.');
        return;
    }
    document.getElementById('meetingModal').classList.remove('hidden');
}

function hideMeetingModal() {
    document.getElementById('meetingModal').classList.add('hidden');
}

function checkAdminStatus() {
    // Проверка админ прав (email: admin@admin.com или специальный флаг)
    if (!currentUser) return;
    isAdmin = currentUser.email === 'admin@admin.com' || currentUser.isAdmin === true;
    const adminPanelBtn = document.getElementById('adminPanelBtn');
    if (adminPanelBtn) {
        adminPanelBtn.style.display = isAdmin ? 'block' : 'none';
    }
    
    // Обновляем кнопку совещания
    updateMeetingButton();
}

// Загрузка сохраненных сообщений и групп
window.addEventListener('load', () => {
    const savedMessages = localStorage.getItem('messages');
    if (savedMessages) {
        messages = JSON.parse(savedMessages);
    }
    const savedGroups = localStorage.getItem('groups');
    if (savedGroups) {
        groups = JSON.parse(savedGroups);
    }
});

