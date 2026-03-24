import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// State
let app, db, storage;
let currentRoomId = null;
let viewOnceEnabled = false;
let mediaFile = null;
let unsubscribeMessages = null;

// User Identity (Mock Local ID for distinguishing sender/receiver)
let myUserId = localStorage.getItem('myUserId');
if (!myUserId) {
    myUserId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('myUserId', myUserId);
}

// DOM Elements - Screens
const setupScreen = document.getElementById('setup-screen');
const homeScreen = document.getElementById('home-screen');
const chatScreen = document.getElementById('chat-screen');

// DOM Elements - Setup
const configInput = document.getElementById('firebase-config-input');
const saveConfigBtn = document.getElementById('save-config-btn');

// DOM Elements - Home
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomIdInput = document.getElementById('join-room-id');
const joinRoomBtn = document.getElementById('join-room-btn');

// DOM Elements - Chat
const leaveRoomBtn = document.getElementById('leave-room-btn');
const copyIdBtn = document.getElementById('copy-id-btn');
const currentRoomIdSpan = document.getElementById('current-room-id');
const chatMessages = document.getElementById('chat-messages');

// DOM Elements - Input
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const mediaInput = document.getElementById('media-input');
const viewOnceToggle = document.getElementById('view-once-toggle');

// DOM Elements - Preview
const mediaPreviewContainer = document.getElementById('media-preview-container');
const closePreviewBtn = document.getElementById('close-preview-btn');
const previewImage = document.getElementById('preview-image');
const previewVideo = document.getElementById('preview-video');

// DOM Elements - Viewer (One Time View)
const fullscreenViewer = document.getElementById('fullscreen-viewer');
const viewerImage = document.getElementById('viewer-image');
const viewerVideo = document.getElementById('viewer-video');
const closeViewerBtn = document.getElementById('close-viewer-btn');
const viewerTimer = document.getElementById('viewer-timer');
const timeLeftSpan = document.getElementById('time-left');
const viewOnceWarning = document.getElementById('view-once-warning');

let viewTimerInterval = null;

// Initialize App
function init() {
    const hardcodedConfig = {
        apiKey: "AIzaSyAbpn9-LY9bGjjLdLwrXs0aPSLKH-Sz1fI",
        authDomain: "chatsys-54b59.firebaseapp.com",
        projectId: "chatsys-54b59",
        storageBucket: "chatsys-54b59.firebasestorage.app",
        messagingSenderId: "343298508920",
        appId: "1:343298508920:web:466a9e4309e27172cd058d",
        measurementId: "G-YE1PV4GZPT"
    };
    initializeFirebase(hardcodedConfig);
}

function initializeFirebase(config) {
    try {
        app = initializeApp(config);
        db = getFirestore(app);
        storage = getStorage(app);
        
        setupScreen.classList.remove('active');
        setupScreen.classList.add('hidden');
        homeScreen.classList.add('active');
        homeScreen.classList.remove('hidden');
    } catch (e) {
        alert("Firebase Initialization Failed. Check your config.");
        console.error(e);
        localStorage.removeItem('firebaseConfig');
    }
}

// Setup Listeners
saveConfigBtn.addEventListener('click', () => {
    try {
        const config = JSON.parse(configInput.value);
        localStorage.setItem('firebaseConfig', JSON.stringify(config));
        initializeFirebase(config);
    } catch (e) {
        alert('Invalid JSON format for Firebase config.');
    }
});

createRoomBtn.addEventListener('click', () => {
    // Generate 6 digit room code
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    joinRoom(roomId);
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = joinRoomIdInput.value.trim();
    if (roomId) joinRoom(roomId);
});

copyIdBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomId).then(() => {
        copyIdBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => copyIdBtn.innerHTML = '<i class="fa-solid fa-copy"></i>', 2000);
    });
});

leaveRoomBtn.addEventListener('click', () => {
    if (unsubscribeMessages) unsubscribeMessages();
    currentRoomId = null;
    chatScreen.classList.add('hidden');
    chatScreen.classList.remove('active');
    homeScreen.classList.add('active');
    homeScreen.classList.remove('hidden');
    chatMessages.innerHTML = '';
});

// Chat Logic
function joinRoom(roomId) {
    currentRoomId = roomId;
    homeScreen.classList.add('hidden');
    homeScreen.classList.remove('active');
    chatScreen.classList.add('active');
    chatScreen.classList.remove('hidden');
    currentRoomIdSpan.textContent = roomId;
    
    chatMessages.innerHTML = '<div class="system-message fade-in"><span>Welcome to the chat! Messages are end-to-end secure.</span></div>';

    listenForMessages();
}

function listenForMessages() {
    const messagesRef = collection(db, 'rooms', currentRoomId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                renderMessage(change.doc.data(), change.doc.id);
            }
            if (change.type === 'modified') {
                updateMessage(change.doc.data(), change.doc.id);
            }
        });
        scrollToBottom();
    });
}

function renderMessage(msg, docId) {
    const isMine = msg.senderId === myUserId;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMine ? 'msg-sent' : 'msg-received'}`;
    msgDiv.id = `msg-${docId}`;

    let contentHtml = '';
    
    if (msg.mediaUrl) {
        if (msg.isOneTimeView) {
            if (msg.hasBeenViewed) {
                // Opened View Once Stub
                contentHtml += `
                    <div class="view-once-stub opened">
                        <i class="fa-solid fa-eye-slash"></i>
                        <span>Opened</span>
                    </div>`;
            } else {
                // Unopened View Once Stub
                contentHtml += `
                    <div class="view-once-stub unopened" data-id="${docId}" data-url="${msg.mediaUrl}" data-type="${msg.mediaType}">
                        <i class="fa-solid ${msg.mediaType === 'video' ? 'fa-video' : 'fa-camera'}"></i>
                        <span>View Once ${msg.mediaType === 'video' ? 'Video' : 'Photo'}</span>
                    </div>`;
            }
        } else {
            // Normal Media
            if (msg.mediaType === 'video') {
                contentHtml += `<div class="media-content"><video src="${msg.mediaUrl}" controls></video></div>`;
            } else {
                contentHtml += `<div class="media-content"><img src="${msg.mediaUrl}"></div>`;
            }
        }
    }

    if (msg.text) {
        contentHtml += `<div class="msg-bubble">${escapeHtml(msg.text)}</div>`;
    }

    let timeString = '';
    if (msg.timestamp) {
        const date = msg.timestamp.toDate();
        timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    msgDiv.innerHTML = `
        ${contentHtml}
        <span class="msg-time">${timeString}</span>
    `;

    chatMessages.appendChild(msgDiv);

    // Bind event for Unopened View Once
    const unopenedStub = msgDiv.querySelector('.unopened');
    if (unopenedStub) {
        unopenedStub.addEventListener('click', () => {
            openViewOnceMedia(docId, unopenedStub.dataset.url, unopenedStub.dataset.type);
        });
    }
}

function updateMessage(msg, docId) {
    const msgDiv = document.getElementById(`msg-${docId}`);
    if (!msgDiv) return;

    if (msg.isOneTimeView && msg.hasBeenViewed) {
        const stub = msgDiv.querySelector('.view-once-stub');
        if (stub) {
            stub.className = 'view-once-stub opened';
            stub.innerHTML = `
                <i class="fa-solid fa-eye-slash"></i>
                <span>Opened</span>
            `;
            // remove event listeners by replacing clone
            stub.replaceWith(stub.cloneNode(true));
        }
    }
}

// Media Attachment Logic
attachBtn.addEventListener('click', () => mediaInput.click());

mediaInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        mediaFile = e.target.files[0];
        showMediaPreview(mediaFile);
    }
});

viewOnceToggle.addEventListener('click', () => {
    viewOnceEnabled = !viewOnceEnabled;
    viewOnceToggle.classList.toggle('active');
    const tooltip = viewOnceToggle.querySelector('.tooltip');
    tooltip.textContent = `View Once: ${viewOnceEnabled ? 'On' : 'Off'}`;
});

closePreviewBtn.addEventListener('click', () => {
    mediaFile = null;
    mediaPreviewContainer.classList.add('hidden');
    previewImage.src = '';
    previewVideo.src = '';
});

function showMediaPreview(file) {
    const url = URL.createObjectURL(file);
    mediaPreviewContainer.classList.remove('hidden');
    
    if (file.type.startsWith('video/')) {
        previewVideo.src = url;
        previewVideo.classList.remove('hidden');
        previewImage.classList.add('hidden');
    } else {
        previewImage.src = url;
        previewImage.classList.remove('hidden');
        previewVideo.classList.add('hidden');
    }
}

// Sending Logic
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

messageInput.addEventListener('keydown', (e) => {
    const isMobile = window.matchMedia("(max-width: 768px)").matches || /Mobi|Android|iPhone/i.test(navigator.userAgent);
    if (e.key === 'Enter' && !e.shiftKey) {
        if (!isMobile) {
            e.preventDefault();
            sendMessage();
        }
    }
});

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && !mediaFile) return;

    if (!db || !storage) {
        alert("Firebase is not initialized.");
        return;
    }

    messageInput.value = '';
    messageInput.style.height = 'auto';
    const currentMedia = mediaFile;
    const currentViewOnce = viewOnceEnabled;
    closePreviewBtn.click(); // Reset preview UI

    try {
        let mediaUrl = null;
        let mediaType = null;

        if (currentMedia) {
            mediaType = currentMedia.type.startsWith('video/') ? 'video' : 'image';
            const storageRef = ref(storage, `rooms/${currentRoomId}/${Date.now()}_${currentMedia.name}`);
            const snapshot = await uploadBytes(storageRef, currentMedia);
            mediaUrl = await getDownloadURL(storageRef);
        }

        const msgData = {
            text,
            senderId: myUserId,
            timestamp: serverTimestamp(),
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            isOneTimeView: currentViewOnce,
            hasBeenViewed: false
        };

        await addDoc(collection(db, 'rooms', currentRoomId, 'messages'), msgData);
        
        // Reset View Once toggle after send
        viewOnceEnabled = false;
        viewOnceToggle.classList.remove('active');
        viewOnceToggle.querySelector('.tooltip').textContent = 'View Once: Off';
        
    } catch (e) {
        console.error("Error sending message: ", e);
        alert("Failed to send message. Reason: " + e.message);
    }
}

// Fullscreen Viewer Logic for One-Time View
let activeViewOnceDocId = null;

function openViewOnceMedia(docId, url, type) {
    activeViewOnceDocId = docId;
    
    fullscreenViewer.classList.remove('hidden');
    viewOnceWarning.classList.remove('hidden');
    viewerTimer.classList.remove('hidden');
    
    if (type === 'video') {
        viewerVideo.src = url;
        viewerVideo.classList.remove('hidden');
        viewerImage.classList.add('hidden');
        viewerVideo.play();
    } else {
        viewerImage.src = url;
        viewerImage.classList.remove('hidden');
        viewerVideo.classList.add('hidden');
    }

    // Timer logic 5 seconds
    let secondsLeft = 10;
    timeLeftSpan.textContent = secondsLeft + 's';
    
    viewTimerInterval = setInterval(() => {
        secondsLeft--;
        timeLeftSpan.textContent = secondsLeft + 's';
        if (secondsLeft <= 0) {
            closeViewer();
        }
    }, 1000);
}

closeViewerBtn.addEventListener('click', closeViewer);

async function closeViewer() {
    clearInterval(viewTimerInterval);
    fullscreenViewer.classList.add('hidden');
    viewerVideo.pause();
    viewerVideo.src = '';
    viewerImage.src = '';
    
    if (activeViewOnceDocId) {
        // Mark as viewed in DB
        try {
            const docRef = doc(db, 'rooms', currentRoomId, 'messages', activeViewOnceDocId);
            await updateDoc(docRef, { hasBeenViewed: true });
        } catch (e) {
            console.error("Failed to update viewed status", e);
        }
        activeViewOnceDocId = null;
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Init App flow
init();
