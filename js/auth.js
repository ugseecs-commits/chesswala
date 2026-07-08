// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAjm6mKyQs-b8xUtf6EKkRnZrAFtfxAlss",
  authDomain: "chex-6369e.firebaseapp.com",
  projectId: "chex-6369e",
  storageBucket: "chex-6369e.firebasestorage.app",
  messagingSenderId: "237580909329",
  appId: "1:237580909329:web:6a46754688f73b7c05eab0",
  measurementId: "G-MQT14SPW5Z"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

window.auth = {
  username: null,
  googleUID: null,
  isAuthenticated: false,

  init() {
    // 1. Check local storage for existing username
    let storedUsername = localStorage.getItem('chessology_username');
    if (!storedUsername) {
      // 2. Generate a random guest username if none exists
      storedUsername = 'Guest' + Math.floor(Math.random() * 10000);
      localStorage.setItem('chessology_username', storedUsername);
    }
    this.username = storedUsername;
    
    // Initialize WebRTC listener immediately so the user can receive challenges.
    // (Session/game restore on refresh is handled entirely by app.js's
    // checkAndRestoreSession - don't also resume here, it races against it.)
    if (window.webrtc && typeof window.webrtc.initPeer === 'function') {
      window.webrtc.initPeer();
    }

    // Listen for Firebase Auth state changes
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        this.googleUID = user.uid;
        this.isAuthenticated = true;
        // Check if user already claimed a username
        const docRef = db.collection('users').doc(user.uid);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const data = docSnap.data();
          this.setUsername(data.username);
          if (window.ui && typeof window.ui.syncAuthUI === 'function') {
            window.ui.syncAuthUI();
          }
        } else {
          // User authenticated but hasn't claimed a username yet
          if (window.ui && typeof window.ui.showClaimUsernameModal === 'function') {
            window.ui.showClaimUsernameModal();
          }
        }
      } else {
        this.googleUID = null;
        this.isAuthenticated = false;
        
        // Security check: if they are logged out, they MUST use a Guest username.
        // If they used Inspect Element to forge a custom name in localStorage, boot them.
        let currentName = localStorage.getItem('chessology_username') || '';
        if (!currentName.toLowerCase().startsWith('guest')) {
          console.warn("Unauthenticated user detected with custom username. Reverting to Guest.");
          const guestName = 'Guest' + Math.floor(Math.random() * 10000);
          this.setUsername(guestName);
        }
        
        if (window.ui && typeof window.ui.syncAuthUI === 'function') {
          window.ui.syncAuthUI();
        }
      }
    });

    if (window.ui && typeof window.ui.syncAuthUI === 'function') {
      window.ui.syncAuthUI();
    }
  },

  setUsername(newUsername) {
    if (!this.isAuthenticated && !newUsername.toLowerCase().startsWith('guest')) {
      console.warn("Security Error: Cannot set a custom username without authenticating first.");
      return;
    }
    this.username = newUsername;
    localStorage.setItem('chessology_username', newUsername);
    // Re-init peer with new username if we are not actively in a game, and the ID actually changed
    if (window.webrtc && !window.webrtc.active) {
      if (window.webrtc.peerId !== newUsername.toLowerCase()) {
        window.webrtc.initPeer();
      }
    }
  },

  async signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        console.log("Sign-in popup closed by user.");
        return;
      }
      console.error("Google Sign-in Error:", err);
      alert("Sign-in failed: " + err.message);
    }
  },

  async signOut() {
    await auth.signOut();
    // Revert to a guest username
    const guestName = 'Guest' + Math.floor(Math.random() * 10000);
    this.setUsername(guestName);
    if (window.ui && typeof window.ui.syncAuthUI === 'function') {
      window.ui.syncAuthUI();
    }
  },

  async claimUsername(requestedUsername) {
    if (!this.googleUID) return { success: false, message: "Not authenticated" };
    if (!requestedUsername || requestedUsername.length < 6) return { success: false, message: "Username must be at least 6 characters" };
    if (requestedUsername.toLowerCase().startsWith('guest')) return { success: false, message: "Cannot claim a guest username" };
    if (!/^[a-zA-Z0-9_\.]+$/.test(requestedUsername)) return { success: false, message: "Only letters, numbers, underscores, and dots allowed" };

    const cleanUsername = requestedUsername.trim();
    const cleanLower = cleanUsername.toLowerCase();
    
    // Check if username is taken (case-insensitive check)
    const usernameRef = db.collection('usernames').doc(cleanLower);
    const usernameSnap = await usernameRef.get();
    
    if (usernameSnap.exists) {
      return { success: false, message: "Username is already taken!" };
    }

    try {
      // Create records
      await usernameRef.set({ uid: this.googleUID, display: cleanUsername });
      await db.collection('users').doc(this.googleUID).set({ username: cleanUsername });
      
      this.setUsername(cleanUsername);
      if (window.ui && typeof window.ui.syncAuthUI === 'function') {
        window.ui.syncAuthUI();
      }
      return { success: true };
    } catch (err) {
      console.error("Error claiming username:", err);
      return { success: false, message: "Database error: " + err.message };
    }
  }
};
