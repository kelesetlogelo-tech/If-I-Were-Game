// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB2iwPzTZZC8dVj6zA0rpICzL8Zyo0djZ4",
    authDomain: "game-concept-71436.firebaseapp.com",
    databaseURL: "https://game-concept-71436-default-rtdb.firebaseio.com",
    projectId: "game-concept-71436",
    storageBucket: "game-concept-71436.firebasestorage.app",
    messagingSenderId: "568655295728",
    appId: "1:568655295728:web:51a0632ffd4b8205d67e35"
};

// Initialize Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getDatabase, ref, onValue, set, get, update, remove, onDisconnect } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// Initialize Firebase
let app;
let database;

try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    
    // Make Firebase available globally for debugging
    window.firebase = {
        database: database,
        ref: ref,
        onValue: onValue,
        set: set,
        get: get,
        update: update,
        remove: remove,
        onDisconnect: onDisconnect
    };
    
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error; // Re-throw to prevent the app from starting with a broken Firebase connection
}

export { app, database, ref, onValue, set, get, update, remove, onDisconnect };
