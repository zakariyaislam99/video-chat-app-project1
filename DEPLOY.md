# Инструкция по деплою VideoChat

## Варианты деплоя

### 1. Railway (Рекомендуется - простой и бесплатный)

1. Зарегистрируйтесь на [Railway.app](https://railway.app)
2. Создайте новый проект
3. Подключите ваш GitHub репозиторий или загрузите файлы
4. Railway автоматически определит Node.js проект
5. Установите переменные окружения (если нужно):
   - `PORT` - порт (Railway установит автоматически)
   - `JWT_SECRET` - секретный ключ для JWT
6. Деплой произойдет автоматически
7. Получите URL вашего приложения (например: `https://your-app.railway.app`)

**Важно**: Обновите URL WebSocket в `app.js`:
```javascript
socket = new WebSocket('wss://your-app.railway.app');
```

### 2. Render

1. Зарегистрируйтесь на [Render.com](https://render.com)
2. Создайте новый Web Service
3. Подключите GitHub репозиторий
4. Настройки:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
5. Добавьте переменные окружения
6. Деплой

### 3. Heroku

1. Установите Heroku CLI
2. Войдите: `heroku login`
3. Создайте приложение: `heroku create your-app-name`
4. Добавьте переменные:
   ```bash
   heroku config:set JWT_SECRET=your-secret-key
   ```
5. Деплой:
   ```bash
   git push heroku main
   ```

### 4. Vercel/Netlify (только фронтенд) + отдельный сервер для бэкенда

**Для фронтенда:**
1. Зарегистрируйтесь на [Vercel](https://vercel.com) или [Netlify](https://netlify.com)
2. Подключите репозиторий
3. Настройте build команду (если нужно)
4. Деплой

**Для бэкенда:**
- Используйте Railway, Render или Heroku для сервера
- Обновите URL в `app.js` на ваш бэкенд URL

### 5. Собственный сервер (VPS)

1. Установите Node.js на сервере
2. Установите PM2: `npm install -g pm2`
3. Клонируйте репозиторий
4. Установите зависимости: `npm install`
5. Запустите с PM2: `pm2 start server.js --name videochat`
6. Настройте Nginx как reverse proxy
7. Настройте SSL сертификат (Let's Encrypt)

**Nginx конфигурация:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Настройка для продакшена

### 1. Обновите server.js

Измените JWT_SECRET на безопасный ключ:
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secure-secret-key-change-this';
```

### 2. Обновите app.js

Измените URL сервера на ваш продакшен URL:
```javascript
// Вместо localhost используйте ваш домен
const API_URL = 'https://your-domain.com';
const WS_URL = 'wss://your-domain.com';
```

### 3. Добавьте базу данных

В продакшене используйте реальную БД вместо массива:
- PostgreSQL
- MongoDB
- MySQL

Пример с MongoDB:
```javascript
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
```

### 4. Настройте CORS

В `server.js` обновите CORS:
```javascript
app.use(cors({
    origin: 'https://your-frontend-domain.com',
    credentials: true
}));
```

### 5. HTTPS обязателен для WebRTC

WebRTC требует HTTPS для работы с камерой/микрофоном. Используйте:
- Let's Encrypt (бесплатно)
- Cloudflare (бесплатный SSL)
- Встроенный SSL от платформ деплоя

## Создание иконок для PWA

Создайте иконки размером 192x192 и 512x512 пикселей. Можно использовать:
- [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

Поместите файлы:
- `icon-192.png`
- `icon-512.png`

в корневую папку проекта.

## Проверка после деплоя

1. ✅ Регистрация и вход работают
2. ✅ Сообщения отправляются
3. ✅ Видеозвонки работают (требуется HTTPS)
4. ✅ Группы создаются
5. ✅ PWA устанавливается на мобильные устройства
6. ✅ Service Worker работает

## Мониторинг

Рекомендуется добавить:
- Логирование ошибок (Sentry, LogRocket)
- Мониторинг производительности
- Аналитику использования

## Масштабирование

Для большого количества пользователей:
- Используйте Redis для WebSocket соединений
- Добавьте балансировку нагрузки
- Используйте CDN для статических файлов
- Оптимизируйте базу данных

