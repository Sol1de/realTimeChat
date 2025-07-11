# Chat RealTime

Bienvenue dans **Chat RealTime**, une application de chat en temps réel basée sur Socket.IO.

## Description

Chat RealTime est conçu pour offrir une communication en temps réel simple et efficace. Construite avec Express et Socket.IO, cette application utilise SQLite pour la gestion des données.

## Fonctionnalités

- **Connexion/Inscription** : Authentification sécurisée des utilisateurs.
- **Messagerie Instantanée** : Envoi et réception de messages en temps réel.
- **Sessions** : Gestion des sessions utilisateur avec cookies sécurisés.

## Technologies Utilisées

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [Socket.IO](https://socket.io/)
- [SQLite](https://www.sqlite.org/index.html)

## Installation

1. Clonez le dépôt :
    ```bash
    git clone <url-du-repo>
    ```

2. Accédez au répertoire du projet :
    ```bash
    cd chatRealTime
    ```

3. Installez les dépendances :
    ```bash
    npm install
    ```

4. Créez un fichier `.env` basé sur l'exemple fourni et configurez les variables nécessaires :

    ```plaintext
    NODE_ENV=production
    PORT=3000
    SESSION_SECRET=your-unique-session-secret
    DATABASE_FILE=chat.db
    COOKIE_SECURE=false
    COOKIE_HTTP_ONLY=true
    ```

## Utilisation

- Démarrer le serveur :
    ```bash
    npm start
    ```

- Pour le développement avec rechargement en direct :
    ```bash
    npm run dev
    ```

## Accéder à l'application

L'application est déployée sur Render et accessible à l'adresse suivante :

🔗 [Lien du déploiement](https://realtimechat-o3iy.onrender.com)

## Contributions

Les contributions sont les bienvenues ! Veuillez soumettre des pull requests ou signaler des problèmes pour toute amélioration.

---

© 2025 Chat RealTime. Tous droits réservés.

