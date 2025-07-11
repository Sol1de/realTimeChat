import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import session from 'express-session';
import dotenv from 'dotenv';

// Env variables
dotenv.config();

const app = express();
const server = createServer(app);
const __dirname = dirname(fileURLToPath(import.meta.url));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key-please-change-in-production',
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: process.env.COOKIE_SECURE === 'true',
        httpOnly: process.env.COOKIE_HTTP_ONLY !== 'false',
        maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000
    }
});

const io = new Server(server, {
    connectionStateRecovery: {}
});

io.use((socket, next) => {
    const res = {
        getHeader: () => {},
        setHeader: () => {},
        clearCookie: () => {},
        writeHead: () => {},
        end: () => {},
        cookie: () => {}
    };
    sessionMiddleware(socket.request, res, next);
});

const db = await open({
    filename: process.env.DATABASE_FILE || 'chat.db',
    driver: sqlite3.Database
});

await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT,
        user_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    );
`);

app.use(express.json());
app.use(sessionMiddleware);

const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.redirect('/login');
    }
};

// Routes
app.get('/login', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(join(__dirname, 'src/login.html'));
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Erreur lors de la déconnexion' });
        }
        res.json({ message: 'Déconnexion réussie' });
    });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ message: 'Nom d\'utilisateur et mot de passe requis' });
    }
    
    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        
        if (user) {
            if (user.password === password) {
                req.session.userId = user.id;
                req.session.username = user.username;
                res.json({ message: 'Connexion réussie', created: false });
            } else {
                res.status(401).json({ message: 'Mot de passe incorrect' });
            }
        } else {
            const result = await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password]);
            req.session.userId = result.lastID;
            req.session.username = username;
            res.json({ message: 'Compte créé avec succès', created: true });
        }
    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        res.status(500).json({ message: 'Erreur interne du serveur' });
    }
});

app.get('/user-info', requireAuth, (req, res) => {
    res.json({
        userId: req.session.userId,
        username: req.session.username
    });
});

app.get('/', requireAuth, (req, res) => {
    res.sendFile(join(__dirname, 'src/index.html'));
});

// Socket.IO
io.on('connection', async (socket) => {
    socket.on('chat message', async (msg, clientOffset, callback) => {
        try {
            await new Promise((resolve) => {
                sessionMiddleware(socket.request, socket.request.res || {}, resolve);
            });
            
            const session = socket.request.session;
            
            if (!session || !session.userId) {
                return;
            }
            
            const result = await db.run(
                'INSERT INTO messages (content, client_offset, user_id) VALUES (?, ?, ?)', 
                msg, clientOffset, session.userId
            );
            
            const messageObject = {
                content: msg,
                username: session.username,
                userId: session.userId,
                id: result.lastID,
                timestamp: new Date().toISOString()
            };
            
            io.emit('chat message', messageObject);
            callback();
        } catch (e) {
            if (e.errno === 19) {
                callback();
            }
        }
    });

    if (!socket.recovered) {
        try {
            await db.each(
                `SELECT m.id, m.content, m.timestamp, u.username, u.id as userId 
                 FROM messages m 
                 LEFT JOIN users u ON m.user_id = u.id 
                 WHERE m.id > ?`,
                [socket.handshake.auth.serverOffset || 0],
                (_err, row) => {
                    socket.emit('chat message', {
                        content: row.content,
                        username: row.username || 'Utilisateur',
                        userId: row.userId,
                        timestamp: row.timestamp || new Date().toISOString(),
                        id: row.id
                    }, row.id);
                }
            );
        } catch (e) {}
    }
});

// launch serve
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
