import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { availableParallelism } from 'node:os';
import cluster from 'node:cluster';
import { createAdapter, setupPrimary } from '@socket.io/cluster-adapter';
import session from 'express-session';

if (cluster.isPrimary) {
    const numCPUs = availableParallelism();
    // create one worker per available core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({
            PORT: 3000 + i
        });
    }

    // set up the adapter on the primary thread
    setupPrimary();
} else {
    const app = express();
    const server = createServer(app);
    const io = new Server(server,  {
        connectionStateRecovery: {},
        // set up the adapter on each worker thread
        adapter: createAdapter()
    });
    const __dirname = dirname(fileURLToPath(import.meta.url));

    // open the database file
    const db = await open({
        filename: 'chat.db',
        driver: sqlite3.Database
    });

    // create our 'messages' table (you can ignore the 'client_offset' column for now)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_offset TEXT UNIQUE,
          content TEXT
      );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        );
`   );

    // Middleware pour parser JSON
    app.use(express.json());
    
    // Configuration des sessions
    app.use(session({
        secret: 'chat-secret-key-change-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false, // true en production avec HTTPS
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 24 heures
        }
    }));
    
    // Middleware pour vérifier l'authentification
    const requireAuth = (req, res, next) => {
        if (req.session && req.session.userId) {
            return next();
        } else {
            return res.redirect('/login');
        }
    };
    
    // Route pour servir la page de login
    app.get('/login', (req, res) => {
        // Si l'utilisateur est déjà connecté, rediriger vers le chat
        if (req.session && req.session.userId) {
            return res.redirect('/');
        }
        res.sendFile(join(__dirname, 'src/login.html'));
    });
    
    // Route pour se déconnecter
    app.post('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ message: 'Erreur lors de la déconnexion' });
            }
            res.json({ message: 'Déconnexion réussie' });
        });
    });
    
    // Route pour gérer la soumission du formulaire de login
    app.post('/login', async (req, res) => {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ message: 'Nom d\'utilisateur et mot de passe requis' });
        }
        
        try {
            // Vérifier si l'utilisateur existe
            const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
            
            if (user) {
                // L'utilisateur existe, vérifier le mot de passe
                if (user.password === password) {
                    // Mot de passe correct - créer la session
                    req.session.userId = user.id;
                    req.session.username = user.username;
                    res.json({ message: 'Connexion réussie', created: false });
                } else {
                    // Mot de passe incorrect
                    res.status(401).json({ message: 'Mot de passe incorrect' });
                }
            } else {
                // L'utilisateur n'existe pas, le créer
                const result = await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password]);
                // Créer la session pour le nouvel utilisateur
                req.session.userId = result.lastID;
                req.session.username = username;
                res.json({ message: 'Compte créé avec succès', created: true });
            }
        } catch (error) {
            console.error('Erreur lors de la connexion:', error);
            res.status(500).json({ message: 'Erreur interne du serveur' });
        }
    });

    // Route protégée pour la page de chat
    app.get('/', requireAuth, (req, res) => {
        res.sendFile(join(__dirname, 'src/index.html'));
    });

    io.on('connection', async (socket) => {
        console.log('a user connected');
        socket.on('disconnect', () => {
            console.log('user disconnected');
        });
        socket.on('chat message', async (msg, clientOffset, callback) => {
            let result;
            try {
                result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
            } catch (e) {
                if (e.errno === 19 /* SQLITE_CONSTRAINT */ ) {
                    // the message was already inserted, so we notify the client
                    callback();
                } else {
                    // nothing to do, just let the client retry
                }
                return;
            }
            // include the offset with the message
            io.emit('chat message', msg, result.lastID);
            // acknowledge the event
            callback();
        });
        if (!socket.recovered) {
            // if the connection state recovery was not successful
            try {
                await db.each('SELECT id, content FROM messages WHERE id > ?',
                    [socket.handshake.auth.serverOffset || 0],
                    (_err, row) => {
                        socket.emit('chat message', row.content, row.id);
                    }
                )
            } catch (e) {
                // something went wrong
            }
        }
    });


    // each worker will listen on a distinct port
    const port = process.env.PORT;
    server.listen(port, () => {
        console.log(`server running at http://localhost:${port}`);
    });
}