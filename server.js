const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Временное хранилище (в продакшене использовать БД)
const users = [];
const groups = []; // Хранилище групп
const JWT_SECRET = 'your-secret-key-change-in-production';

// WebSocket соединения
const clients = new Map();

wss.on('connection', (ws, req) => {
    console.log('Новое WebSocket соединение');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleWebSocketMessage(ws, data);
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
        }
    });

    ws.on('close', () => {
        for (const [userId, client] of clients.entries()) {
            if (client === ws) {
                clients.delete(userId);
                broadcastUserStatus(userId, false);
                break;
            }
        }
    });
});

function handleWebSocketMessage(ws, data) {
    switch (data.type) {
        case 'register':
            clients.set(data.userId, ws);
            broadcastUserStatus(data.userId, true);
            break;

        case 'message':
            forwardMessage(data);
            break;

        case 'group-message':
            forwardGroupMessage(data);
            break;

        case 'group-created':
            if (data.data) {
                groups.push(data.data);
            }
            broadcastGroupCreated(data);
            break;

        case 'group-left':
            broadcastGroupLeft(data);
            break;

        case 'call-offer':
        case 'call-offer-sdp':
        case 'call-answer-sdp':
        case 'ice-candidate':
        case 'call-end':
        case 'call-reject':
            forwardCallSignal(data);
            break;
    }
}

function forwardMessage(data) {
    const recipient = clients.get(data.data.to);
    if (recipient && recipient.readyState === WebSocket.OPEN) {
        recipient.send(JSON.stringify({
            type: 'message',
            data: data.data
        }));
    }
}

function forwardGroupMessage(data) {
    // Отправляем сообщение всем участникам группы
    if (data.data && data.data.groupId) {
        const group = groups.find(g => g.id === data.data.groupId);
        if (group && group.members) {
            group.members.forEach(memberId => {
                if (memberId !== data.data.from) {
                    const recipient = clients.get(memberId);
                    if (recipient && recipient.readyState === WebSocket.OPEN) {
                        recipient.send(JSON.stringify({
                            type: 'group-message',
                            data: data.data
                        }));
                    }
                }
            });
        }
    }
}

function broadcastGroupCreated(data) {
    // Уведомляем всех участников о создании группы
    if (data.data && data.data.members) {
        data.data.members.forEach(memberId => {
            const client = clients.get(memberId);
            if (client && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'group-created',
                    data: data.data
                }));
            }
        });
    }
}

function broadcastGroupLeft(data) {
    // Уведомляем участников группы о выходе пользователя
    if (data.groupId) {
        // Здесь нужно получить список участников группы из БД
        // Для упрощения отправляем всем подключенным клиентам
        clients.forEach((client, userId) => {
            if (client.readyState === WebSocket.OPEN && userId !== data.userId) {
                client.send(JSON.stringify({
                    type: 'group-left',
                    groupId: data.groupId,
                    userId: data.userId
                }));
            }
        });
    }
}

function forwardCallSignal(data) {
    const recipient = clients.get(data.to);
    if (recipient && recipient.readyState === WebSocket.OPEN) {
        // Добавляем имя пользователя для входящих звонков
        if (data.type === 'call-offer' || data.type === 'call-offer-sdp') {
            const caller = users.find(u => u.id === data.from);
            if (caller) {
                data.fromName = caller.name;
            }
        }
        recipient.send(JSON.stringify(data));
    }
}

function broadcastUserStatus(userId, isOnline) {
    const statusMessage = JSON.stringify({
        type: 'user-status',
        userId,
        isOnline
    });

    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(statusMessage);
        }
    });
}

// API Routes
// Регистрация
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Все поля обязательны' });
        }

        if (users.find(u => u.email === email)) {
            return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            id: Date.now().toString(),
            name,
            email,
            password: hashedPassword,
            avatar: name.charAt(0).toUpperCase()
        };

        users.push(user);

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Регистрация успешна',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email и пароль обязательны' });
        }

        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(401).json({ message: 'Неверный email или пароль' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: 'Неверный email или пароль' });
        }

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Вход выполнен успешно',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar
            }
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
});

// Получение списка пользователей
app.get('/api/users', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Токен не предоставлен' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const otherUsers = users
            .filter(u => u.id !== decoded.userId)
            .map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                avatar: u.avatar
            }));

        res.json(otherUsers);
    } catch (error) {
        res.status(401).json({ message: 'Неверный токен' });
    }
});

// Middleware для проверки токена
function authenticateToken(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'Токен не предоставлен' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Неверный токен' });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`WebSocket сервер готов к подключениям`);
});

