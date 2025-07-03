// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    authDomain: "flashcard-app-xxxxx.firebaseapp.com",
    projectId: "flashcard-app-xxxxx",
    storageBucket: "flashcard-app-xxxxx.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdefghijklmnopqr"
};

// Demo Mode Flag - Set to false when using real Firebase
const DEMO_MODE = true;

if (DEMO_MODE) {
    // デモモード: Firebase無しでもUI動作
    console.log('🚀 Demo Mode: Firebase機能をシミュレーション中');
    
    // Mock Firebase Auth
    window.firebaseAuth = {
        onAuthStateChanged: (callback) => {
            // デモ用: 5秒後に自動ログイン
            setTimeout(() => {
                callback({ 
                    uid: 'demo-user-123',
                    email: 'demo@example.com'
                });
            }, 1000);
        },
        signInWithEmailAndPassword: (email, password) => {
            return Promise.resolve({
                user: { uid: 'demo-user-123', email }
            });
        },
        createUserWithEmailAndPassword: (email, password) => {
            return Promise.resolve({
                user: { uid: 'demo-user-123', email }
            });
        },
        signOut: () => Promise.resolve()
    };
    
    // Mock Firestore
    window.firebaseDB = {
        collection: (name) => ({
            doc: (id) => ({
                set: (data) => {
                    console.log('📤 Demo Sync to Cloud:', data);
                    return Promise.resolve();
                },
                get: () => Promise.resolve({
                    exists: true,
                    data: () => ({
                        cards: JSON.parse(localStorage.getItem('demo_cloud_data') || '[]'),
                        lastModified: new Date().toISOString()
                    })
                })
            })
        })
    };
    
} else {
    // 本格モード: 実際のFirebase
    try {
        firebase.initializeApp(firebaseConfig);
        window.firebaseAuth = firebase.auth();
        window.firebaseDB = firebase.firestore();
    } catch (error) {
        console.error('Firebase initialization failed:', error);
        alert('Firebase設定が正しくありません。FIREBASE_SETUP.mdを参照してください。');
    }
}