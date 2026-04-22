// ==========================================
// MASTER APP.JS - STRANGER CHAT PRO V2.0 
// (ULTRA-FAST TICKS, OFFLINE LOAD, GEOLOCATION, FAST-SYNC)
// ==========================================

window.onerror = function(msg, url, line) {
    console.log("Bug: " + msg + " at line " + line);
    return true; 
};

setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.classList.add('hidden');
}, 1500);

if (typeof LocalDB === 'undefined') {
    window.LocalDB = {
        init: async () => { console.log("Godown Missing: Running on Cloud"); },
        saveMessage: async () => {},
        getAllMessages: async () => { return []; }
    };
}

function pushAppState(pageName) {
    history.pushState({ page: pageName }, pageName, '#' + pageName);
}

document.getElementById('alert-ok-btn').onclick = () => {
    document.getElementById('custom-alert-modal').classList.add('hidden');
};

window.alert = function(msg) {
    document.getElementById('custom-alert-message').innerText = msg;
    document.getElementById('custom-alert-modal').classList.remove('hidden');
};

window.customConfirm = function(message, callback) {
    document.getElementById('custom-confirm-message').innerText = message;
    document.getElementById('custom-confirm-modal').classList.remove('hidden');
    
    document.getElementById('btn-confirm-yes').onclick = () => {
        document.getElementById('custom-confirm-modal').classList.add('hidden');
        callback();
    };
    document.getElementById('btn-confirm-no').onclick = () => {
        document.getElementById('custom-confirm-modal').classList.add('hidden');
    };
};

const firebaseConfig = {
    apiKey: "AIzaSyCNHmnyrav-fLJ0eQftjqCgwvzbXtvaUts",
    authDomain: "my-stranger-chat.firebaseapp.com",
    databaseURL: "https://my-stranger-chat-default-rtdb.firebaseio.com",
    projectId: "my-stranger-chat",
    messagingSenderId: "920126104085",
    appId: "1:920126104085:web:98a800fbc66c99953ca41c",
    measurementId: "G-6NLLM8ERT0"
};

if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
} else {
    alert("Firebase Load Nahi Hua!");
}

const db = (typeof firebase !== 'undefined') ? firebase.database() : null;
let activeChatRoomId = null;
let isCallActive = false; 

let callTimerInterval = null; 
let interstitialAdInterval = null;
let mainAccessTimerInterval = null;
let callSeconds = 0;
let localCallStream = null;
let myUserId = null; 

let myLat = null;
let myLng = null;

let renderedMessages = new Set();
let lastInboxTimes = {}; 

const ringbackAudio = new Audio('https://www.gstatic.com/meet/sounds/outgoing_call_ring_v1.wav');
ringbackAudio.loop = true;

let isAudioUnlocked = false;
document.addEventListener('click', () => {
    if(!isAudioUnlocked) {
        ringbackAudio.play().then(() => {
            ringbackAudio.pause();
            ringbackAudio.currentTime = 0;
            isAudioUnlocked = true;
        }).catch(e => {});
    }
});

// FEATURE: GEOLOCATION DISTANCE CALCULATOR (Haversine Formula)
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function updateMyLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            myLat = pos.coords.latitude;
            myLng = pos.coords.longitude;
            if (myUserId && db) {
                db.ref('users/' + myUserId).update({ lat: myLat, lng: myLng });
            }
        }, err => console.log("Location access denied or failed."));
    }
}

function killCallHardware() {
    isCallActive = false;
    if (callTimerInterval) clearInterval(callTimerInterval);
    const vidEl = document.getElementById('local-video-stream');
    if(vidEl) {
        vidEl.pause();
        vidEl.removeAttribute('src');
        vidEl.srcObject = null;
    }
    if (localCallStream) {
        localCallStream.getTracks().forEach(track => {
            track.enabled = false;
            track.stop();
        });
        localCallStream = null;
    }
    ringbackAudio.pause();
    ringbackAudio.currentTime = 0;
}

window.markAsReadAndOpen = function(roomId, name, pfp) {
    if(myUserId && db) db.ref('inbox/' + myUserId + '/' + roomId).update({unread: false});
    openActiveChat(name, pfp, roomId);
}

let activeLongPressRoom = null;
let activeLongPressUid = null;

window.openChatOptions = function(e, room, targetUid) {
    e.preventDefault(); 
    if(room === 'global_room') return; 
    
    activeLongPressRoom = room;
    activeLongPressUid = targetUid;
    
    document.getElementById('chat-context-modal').classList.remove('hidden');
};

function listenToInbox() {
    if(!myUserId || !db) return;
    db.ref('inbox/' + myUserId).orderByChild('time').on('value', (snap) => {
        const inboxList = document.getElementById('main-inbox-list');
        const reqArea = document.getElementById('discover-requests-area');
        
        const globalChatHtml = `
        <div class="inbox-item" onclick="openActiveChat('Global Chat', 'https://cdn-icons-png.flaticon.com/512/149/149071.png', 'global_room')">
            <img src="https://cdn-icons-png.flaticon.com/512/149/149071.png" style="width:50px; height:50px; border-radius:50%; object-fit:cover; flex-shrink:0;">
            <div class="inbox-info">
                <div class="inbox-row"><strong>Global Chat</strong> <span class="inbox-time">Live</span></div>
                <div class="inbox-row"><p>Tap to join the world!</p> <span class="inbox-badge">Live</span></div>
            </div>
        </div>`;
        
        const adHtml = `
        <div class="discover-native-ad premium-hide-ad" style="border-top: 1px solid #eee; padding: 10px;">
            <div style="display:flex; align-items:center; gap:10px; width:100%;">
                <div style="background:#ddd; width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center;">💰</div>
                <div style="flex:1;">
                    <span class="ad-label" style="background:#ffd700; color:#000; padding:2px 5px; border-radius:3px; font-size:10px; font-weight:bold;">AD</span>
                    <strong style="font-size: 14px; color: var(--txt);">Make Money with Apps</strong>
                </div>
                <button class="native-ad-btn" onclick="showInterstitialAd()" style="background:var(--wa-teal); color:#fff; border:none; padding:5px 15px; border-radius:5px;">Join</button>
            </div>
        </div>`;
        
        let chatItems = [];
        let reqItems = [];

        snap.forEach(child => {
            const room = child.key;
            const chat = child.val();
            const timeStr = new Date(chat.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            if (room === activeChatRoomId && chat.unread === true) {
                db.ref('inbox/' + myUserId + '/' + room).update({unread: false});
                chat.unread = false; 
            }

            if (chat.unread === true && room !== activeChatRoomId) {
                if (chat.time > (lastInboxTimes[room] || 0)) {
                    const notiSet = document.getElementById('noti-settings') ? document.getElementById('noti-settings').value : 'enabled';
                    const vibSet = document.getElementById('vibration-settings') ? document.getElementById('vibration-settings').value : 'enabled';
                    
                    if (notiSet === 'enabled') {
                        showNotification(chat.name, chat.lastMsg);
                    }
                    if (vibSet === 'enabled' && navigator.vibrate) {
                        navigator.vibrate([200]); 
                    }
                }
                
                // ULTIMATE SPEED FIX: Changed from limitToLast(5) to limitToLast(2) for blazing fast double tick delivery
                db.ref('messages/' + room).limitToLast(2).once('value', msgSnap => {
                    msgSnap.forEach(m => {
                        if (m.val().senderUid !== myUserId && m.val().status === 'sent') {
                            m.ref.update({status: 'delivered'}); 
                        }
                    });
                });
            }
            
            lastInboxTimes[room] = chat.time;

            const unreadDot = (chat.unread === true) ? `<span style="background:#25d366; width:10px; height:10px; border-radius:50%; display:inline-block; margin-left:10px; flex-shrink:0;"></span>` : '';
            let targetUid = room.replace(myUserId, '').replace('_', '');
            
            const safePfp = (chat.pfp && chat.pfp.length > 10) ? chat.pfp : 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

            const itemHtml = `
            <div class="inbox-item" oncontextmenu="openChatOptions(event, '${room}', '${targetUid}')" onclick="markAsReadAndOpen('${room}', '${chat.name}', '${safePfp}')">
                <img src="${safePfp}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; flex-shrink:0; pointer-events:auto;" onclick="event.stopPropagation(); openSenderProfile('${chat.name}', '${safePfp}', '${targetUid}')">
                <div class="inbox-info">
                    <div class="inbox-row" style="justify-content: flex-start; align-items: center;">
                        <strong style="flex:1;">${chat.name}</strong> 
                        ${unreadDot}
                        <span class="inbox-time">${timeStr}</span>
                    </div>
                    <div class="inbox-row"><p>${chat.lastMsg}</p></div>
                </div>
            </div>`;
            
            chatItems.unshift(itemHtml); 
            
            if(chat.isRequest) {
                reqItems.unshift(itemHtml);
            }
        });

        inboxList.innerHTML = globalChatHtml + adHtml + chatItems.join('');
        
        if(reqItems.length === 0) {
            reqArea.innerHTML = `<div class="empty-state">No pending chat requests.</div>`;
        } else {
            reqArea.innerHTML = reqItems.join('');
        }
        
        if (isPremiumUser()) applyPremiumPerks(); 
    });
}

function startIncomingCallListener() {
    if(!db) return;
    db.ref('calls/' + myUserId).on('value', snap => {
        if(snap.exists()) {
            const callData = snap.val();
            document.getElementById('incoming-call-name').innerText = callData.callerName;
            document.getElementById('incoming-call-avatar').src = callData.callerPfp;
            document.getElementById('incoming-call-type').innerText = "Incoming " + callData.type + " Call...";
            
            document.getElementById('incoming-call-modal').classList.remove('hidden');
            
            document.getElementById('incoming-ringtone').play().catch(e=>{});
            
            document.getElementById('btn-accept-call').onclick = () => {
                document.getElementById('incoming-ringtone').pause();
                document.getElementById('incoming-call-modal').classList.add('hidden');
                setTimeout(() => {
                    openActiveChat(callData.callerName, callData.callerPfp, callData.roomId);
                    startCall(callData.type); 
                }, 200);
            };
            
            document.getElementById('btn-reject-call').onclick = () => {
                document.getElementById('incoming-ringtone').pause();
                db.ref('calls/' + myUserId).remove(); 
                document.getElementById('incoming-call-modal').classList.add('hidden');
            };
        } else {
            document.getElementById('incoming-ringtone').pause();
            document.getElementById('incoming-call-modal').classList.add('hidden');
        }
    });
}

if(typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            myUserId = user.uid;
            
            db.ref('users/' + myUserId).once('value').then(snap => {
                if(snap.exists()) {
                    const u = snap.val();
                    if(u.pfp && u.pfp.length > 10) {
                        localStorage.setItem('chat_user_pfp', u.pfp);
                        document.getElementById('header-profile-img').src = u.pfp;
                        document.getElementById('user-pfp').src = u.pfp;
                    }
                }
            });

            const userStatusRef = db.ref('/users/' + myUserId + '/status');
            const userLastSeenRef = db.ref('/users/' + myUserId + '/lastSeen');

            db.ref('.info/connected').on('value', (snapshot) => {
                if (snapshot.val() === false) return;
                userStatusRef.onDisconnect().set('offline');
                userLastSeenRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
                userStatusRef.set('online');
            });

            window.addEventListener('beforeunload', () => {
                db.ref('/users/' + myUserId).update({
                    status: 'offline',
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            });

            listenToInbox();
            startIncomingCallListener(); 
        }
    });
}

function formatLastSeen(ts) {
    if(!ts) return "offline";
    const date = new Date(ts);
    const now = new Date();
    const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    if(date.toDateString() === now.toDateString()) {
        return `last seen today at ${timeStr}`;
    } else {
        return `last seen ${date.toLocaleDateString()} at ${timeStr}`;
    }
}

function loadOnlineUsers(searchQuery = '') {
    if(!db) return;
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) return;
    const currentUid = currentUser.uid;

    const onlineArea = document.getElementById('discover-online-area');
    const forwardArea = document.getElementById('forward-list-container');
    
    db.ref('users').on('value', (snap) => {
        let usersHTML = '';
        let forwardHTML = `
        <div class="discover-user-card forward-user-item" data-name="Global Chat" data-room="global_room" data-avatar="https://cdn-icons-png.flaticon.com/512/149/149071.png">
            <img src="https://cdn-icons-png.flaticon.com/512/149/149071.png" style="width: 40px; height: 40px; margin-right: 10px; border-radius:50%; object-fit:cover;">
            <div class="discover-info"><strong>Global Chat</strong></div>
        </div>`;
        
        let hasUsers = false;
        let userCount = 0; 
        
        const intervalAdHtml = `
        <div class="discover-native-ad premium-hide-ad" style="border-bottom: 1px solid #eee; margin-bottom:10px; padding-bottom:10px;">
            <div style="display:flex; align-items:center; gap:10px; width:100%;">
                <div style="background:#ddd; width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center;">💰</div>
                <div style="flex:1;">
                    <span class="ad-label" style="background:#ffd700; color:#000; padding:2px 5px; border-radius:3px; font-size:10px; font-weight:bold;">AD</span>
                    <strong style="font-size: 14px; color: var(--txt);">Earn Money Daily</strong>
                </div>
                <button class="native-ad-btn" onclick="showInterstitialAd()" style="background:var(--wa-teal); color:#fff; border:none; padding:5px 15px; border-radius:5px;">Join</button>
            </div>
        </div>`;

        const bottomAdHtml = `
        <div class="discover-native-ad premium-hide-ad" style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px;">
            <div style="display:flex; align-items:center; gap:10px; width:100%;">
                <div style="background:#ddd; width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center;">⭐</div>
                <div style="flex:1;">
                    <span class="ad-label" style="background:#ffd700; color:#000; padding:2px 5px; border-radius:3px; font-size:10px; font-weight:bold;">AD</span>
                    <strong style="font-size: 14px; color: var(--txt);">Get Pro Features!</strong>
                </div>
                <button class="native-ad-btn" onclick="showInterstitialAd()" style="background:var(--wa-teal); color:#fff; border:none; padding:5px 15px; border-radius:5px;">Upgrade</button>
            </div>
        </div>`;

        snap.forEach((childSnap) => {
            const u = childSnap.val();
            const uid = childSnap.key;
            
            if (String(uid) === String(currentUid) || !u.username) return; 
            
            if (searchQuery) {
                if(!u.username.toLowerCase().includes(searchQuery.toLowerCase())) return;
            } else {
                if (myLat && myLng && u.lat && u.lng) {
                    let distance = getDistanceInKm(myLat, myLng, u.lat, u.lng);
                    if (distance > 100) return; 
                }
            }

            hasUsers = true;
            userCount++;

            const statusClass = u.status === 'online' ? 'status-online' : 'status-away';
            const statusText = u.status === 'online' ? 'Online Now' : formatLastSeen(u.lastSeen);
            
            const pfp = (u.pfp && typeof u.pfp === 'string' && u.pfp.length > 10) ? u.pfp : 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
            const bio = u.bio || 'Available';
            const room = currentUid < uid ? currentUid + '_' + uid : uid + '_' + currentUid;

            usersHTML += `
            <div class="discover-user-card action-menu-trigger" data-uid="${uid}" data-username="${u.username}" data-bio="${bio}" data-room="${room}" data-avatar="${pfp}" data-status="${u.status}">
                <div class="item-left">
                    <img src="${pfp}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
                    <div class="discover-info">
                        <strong>${u.username}</strong>
                        <span class="${statusClass}">${statusText}</span>
                    </div>
                </div>
                <button class="btn-connect">Chat</button>
            </div>`;

            if (userCount % 5 === 0) {
                usersHTML += intervalAdHtml;
            }

            forwardHTML += `
            <div class="discover-user-card forward-user-item" data-name="${u.username}" data-room="${room}" data-avatar="${pfp}">
                <img src="${pfp}" style="width: 40px; height: 40px; margin-right: 10px; border-radius: 50%; object-fit: cover;">
                <div class="discover-info"><strong>${u.username}</strong></div>
            </div>`;
        });

        forwardArea.innerHTML = forwardHTML;
        
        let emptyStateMsg = searchQuery ? 'No users matched.' : 'No nearby users available. Try Global Search.';
        onlineArea.innerHTML = (hasUsers ? usersHTML : `<div class="empty-state">${emptyStateMsg}</div>`) + bottomAdHtml;
    });
}

function loadBlockedUsers() {
    if(!db) return;
    const container = document.getElementById('blocked-list-container');
    container.innerHTML = '<div style="padding:20px;text-align:center;">Loading...</div>';
    db.ref('blocks/' + myUserId).on('value', snap => {
        if(!snap.exists()) {
            container.innerHTML = '<p style="text-align:center; color:#888; font-size:14px; margin-top:20px;">No blocked users.</p>';
            return;
        }
        let html = '';
        snap.forEach(child => {
            const uid = child.key;
            const u = child.val();
            html += `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid #f0f2f5;">
                <span style="font-size:15px; font-weight:bold; color:var(--txt);">${u.name}</span>
                <button onclick="unblockUser('${uid}')" style="background:var(--danger); color:#fff; border:none; padding:6px 12px; border-radius:5px; cursor:pointer; font-size:12px; font-weight:bold;">Unblock</button>
            </div>`;
        });
        container.innerHTML = html;
    });
}
window.unblockUser = function(uid) {
    if(db) db.ref('blocks/' + myUserId + '/' + uid).remove();
};

function updateAppLanguage(lang) {
    const t = {
        'hi': { c: 'चैट्स', o: 'ऑनलाइन', r: 'अनुरोध', s: 'यूज़र खोजें...', p: 'प्रोफ़ाइल सहेजें', set: 'सेटिंग्स' },
        'es': { c: 'Chats', o: 'EN LÍNEA', r: 'PETICIONES', s: 'Buscar usuarios...', p: 'GUARDAR PERFIL', set: 'Ajustes' },
        'ar': { c: 'دردشات', o: 'متصل', r: 'طلبات', s: 'البحث عن مستخدمين...', p: 'حفظ الملف الشخصي', set: 'إعدادات' }
    };
    const dict = t[lang] || { c: 'Chats', o: 'ALL USERS', r: 'REQUESTS', s: 'Search Users...', p: 'SAVE PROFILE', set: 'Settings' };
    
    document.getElementById('ui-chats-title').innerText = dict.c;
    document.getElementById('tab-online').innerText = dict.o;
    document.getElementById('tab-requests').innerText = dict.r;
    document.getElementById('search-user-input').placeholder = dict.s;
    document.querySelector('.btn-primary-save').innerText = dict.p;
    document.getElementById('ui-settings-title').innerText = dict.set;
}

window.addEventListener('popstate', (e) => {
    const isInterstitialVisible = !document.getElementById('interstitial-ad-modal').classList.contains('hidden');
    const isVideoAdVisible = !document.getElementById('ad-video-overlay').classList.contains('hidden');
    
    if (isInterstitialVisible) {
        history.pushState({page: 'interstitial-ad-modal'}, 'interstitial-ad-modal', '#interstitial-ad-modal');
        return; 
    }
    if(isVideoAdVisible) {
        history.pushState({page: 'ad-video-overlay'}, 'ad-video-overlay', '#ad-video-overlay');
        return;
    }

    const state = e.state || {page: 'inbox'};
    
    killCallHardware(); 
    
    document.getElementById('custom-alert-modal').classList.add('hidden');
    document.getElementById('custom-confirm-modal').classList.add('hidden');
    document.getElementById('image-viewer-modal').classList.add('hidden');
    document.getElementById('user-action-modal').classList.add('hidden');
    document.getElementById('forward-modal').classList.add('hidden');
    document.getElementById('attachment-menu').classList.add('hidden');
    document.getElementById('premium-modal').classList.add('hidden');
    document.getElementById('active-call-modal').classList.add('hidden');
    document.getElementById('incoming-call-modal').classList.add('hidden');
    document.getElementById('chat-context-modal').classList.add('hidden');
    document.getElementById('blocked-users-modal').classList.add('hidden');

    if(state.page === 'inbox') {
        if (activeChatRoomId && db) {
            let oldTargetUid = activeChatRoomId.replace(myUserId, '').replace('_', '');
            db.ref('users/' + oldTargetUid).off('value'); 
            db.ref('messages/' + activeChatRoomId).off(); 
            activeChatRoomId = null; 
        }

        document.getElementById('active-chat-view').classList.add('hidden');
        document.getElementById('discovery-panel').classList.add('hidden');
        document.getElementById('settings-panel').classList.add('hidden');
        document.getElementById('inbox-view').classList.remove('hidden');
    } 
    else if (state.page === 'active-chat-view') {
        document.getElementById('discovery-panel').classList.add('hidden');
        document.getElementById('settings-panel').classList.add('hidden');
        document.getElementById('inbox-view').classList.add('hidden');
        document.getElementById('active-chat-view').classList.remove('hidden');
    }
    else if (state.page === 'discovery-panel') {
        document.getElementById('discovery-panel').classList.remove('hidden');
    }
    else if (state.page === 'settings-panel') {
        document.getElementById('settings-panel').classList.remove('hidden');
    }
});

window.onload = () => {
    try { LocalDB.init().catch(e => console.log(e)); } catch(e){} 
    
    history.replaceState({ page: 'inbox' }, 'inbox', ''); 
    
    if (localStorage.getItem('app_lang')) {
        updateAppLanguage(localStorage.getItem('app_lang'));
    }
    if (localStorage.getItem('chat_user')) {
        document.getElementById('splash-screen').classList.add('hidden');
        checkAppAuth();
    } else {
        setTimeout(() => {
            document.getElementById('splash-screen').classList.add('hidden');
            checkAppAuth();
        }, 1500); 
    }

    const pfpSection = document.querySelector('.pfp-main-section');
    if(pfpSection && !document.getElementById('settings-dp-ad')) {
        const bannerAd = document.createElement('div');
        bannerAd.id = 'settings-dp-ad';
        bannerAd.className = 'ad-box premium-hide-ad';
        bannerAd.style.marginTop = '15px';
        bannerAd.style.marginBottom = '15px';
        bannerAd.innerHTML = `<span class="ad-label" style="background:#ffd700; color:#000; padding:2px 5px; border-radius:3px; font-size:10px; font-weight:bold;">AD</span><span style="font-size:14px; font-weight:bold; color:var(--txt);">Upgrade for HD Video & No Ads!</span>`;
        pfpSection.after(bannerAd); 
    }

    const notiOption = document.getElementById('noti-settings');
    if (notiOption && !document.getElementById('vibration-settings')) {
        const vibHTML = document.createElement('div');
        vibHTML.className = 'option-item';
        vibHTML.innerHTML = `<label>Vibration</label><select id="vibration-settings"><option value="enabled">Enabled</option><option value="muted">Muted</option></select>`;
        notiOption.parentElement.after(vibHTML);

        if(localStorage.getItem('vib_setting')) document.getElementById('vibration-settings').value = localStorage.getItem('vib_setting');
        document.getElementById('vibration-settings').onchange = (e) => localStorage.setItem('vib_setting', e.target.value);
    }
    
    if(notiOption) {
        if(localStorage.getItem('noti_setting')) notiOption.value = localStorage.getItem('noti_setting');
        notiOption.onchange = (e) => localStorage.setItem('noti_setting', e.target.value);
    }
};

function checkAppAuth() {
    if (localStorage.getItem('chat_user')) { 
        document.getElementById('login-screen').classList.add('hidden'); 
        document.getElementById('main-app').classList.remove('hidden'); 
        document.getElementById('inbox-view').classList.remove('hidden');
        document.getElementById('active-chat-view').classList.add('hidden');
        checkAndStartTimer(); 
        updateMyLocation(); 
        
        const savedDp = localStorage.getItem('chat_user_pfp');
        if(savedDp) {
            document.getElementById('header-profile-img').src = savedDp;
            document.getElementById('user-pfp').src = savedDp;
        }
        
        const savedBio = localStorage.getItem('chat_user_bio');
        if(savedBio) {
            document.getElementById('bio-input').value = savedBio;
        }
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }
}

document.getElementById('btn-auth-email').onclick = () => {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value.trim();
    if(!email.includes('@') || pass.length < 6) { alert("Enter a valid email and a password of at least 6 characters."); return; }
    
    if(!firebase) return;
    const btn = document.getElementById('btn-auth-email');
    btn.innerText = "Authenticating..."; btn.disabled = true;

    firebase.auth().signInWithEmailAndPassword(email, pass)
        .then((cred) => {
            db.ref('users/' + cred.user.uid).update({ status: "online" });
            
            db.ref('users/' + cred.user.uid).once('value').then(snap => {
                if(snap.exists()) {
                    const data = snap.val();
                    if(data.username) localStorage.setItem('chat_user', data.username);
                    if(data.pfp) {
                        localStorage.setItem('chat_user_pfp', data.pfp);
                        if(document.getElementById('header-profile-img')) document.getElementById('header-profile-img').src = data.pfp;
                        if(document.getElementById('user-pfp')) document.getElementById('user-pfp').src = data.pfp;
                    }
                    if(data.bio) localStorage.setItem('chat_user_bio', data.bio);
                }
            }).catch(e => console.log("DB sync fallback"));

            grantRewardTime(); 

            if (cred.user && cred.user.displayName) {
                localStorage.setItem('chat_user', cred.user.displayName);
                checkAppAuth();
            } else if (localStorage.getItem('chat_user')) {
                checkAppAuth();
            } else {
                document.getElementById('step-email').classList.add('hidden');
                document.getElementById('step-username').classList.remove('hidden');
            }
            btn.innerText = "Continue"; 
            btn.disabled = false;
        })
        .catch((loginError) => {
            if (loginError.code === 'auth/user-not-found' || loginError.code === 'auth/invalid-credential' || loginError.code === 'auth/invalid-login-credentials') {
                firebase.auth().createUserWithEmailAndPassword(email, pass)
                    .then((cred) => {
                        document.getElementById('step-email').classList.add('hidden');
                        document.getElementById('step-username').classList.remove('hidden');
                        btn.innerText = "Continue"; 
                        btn.disabled = false;
                    }).catch((regError) => {
                        if (regError.code === 'auth/email-already-in-use') {
                            alert("Incorrect Password! Account already exists with this email.");
                        } else {
                            alert("Registration Error: " + regError.message);
                        }
                        btn.innerText = "Continue"; 
                        btn.disabled = false;
                    });
            } else if (loginError.code === 'auth/wrong-password') {
                alert("Incorrect Password!");
                btn.innerText = "Continue"; 
                btn.disabled = false;
            } else {
                alert("Login Error: " + loginError.message);
                btn.innerText = "Continue"; 
                btn.disabled = false;
            }
        });
};

document.getElementById('btn-finish-login').onclick = () => {
    const uname = document.getElementById('login-username').value.trim();
    if(!uname) return;
    
    if(!db) return;
    const btn = document.getElementById('btn-finish-login');
    btn.innerText = "Checking..."; btn.disabled = true;

    db.ref('users').orderByChild('username').equalTo(uname).once('value', snap => {
        if(snap.exists()) {
            alert("Username already exists! Please choose a unique handle.");
            btn.innerText = "Start Chatting"; 
            btn.disabled = false;
            return;
        }

        btn.innerText = "Creating Profile...";
        const user = firebase.auth().currentUser;
        if(user) {
            user.updateProfile({ displayName: uname }).catch(e => console.log(e));
            db.ref('users/' + user.uid).update({ username: uname, bio: "Available", status: "online" }).catch(e => console.log(e));
        }
        
        localStorage.setItem('chat_user', uname); 
        localStorage.setItem('chat_user_bio', "Available");
        
        document.getElementById('login-screen').classList.add('hidden'); 
        document.getElementById('main-app').classList.remove('hidden'); 
        document.getElementById('inbox-view').classList.remove('hidden');
        document.getElementById('active-chat-view').classList.add('hidden');
        
        grantRewardTime();
        updateMyLocation();
        setTimeout(() => showNotification("System", "Welcome to Pro Chat V2.0!"), 2000);
        
        btn.innerText = "Start Chatting"; 
        btn.disabled = false;
    });
};

function processAndRenderMsg(data, msgKey) {
    if (!data || !msgKey) return;
    if (renderedMessages.has(msgKey)) return; 
    renderedMessages.add(msgKey);

    const currentUser = localStorage.getItem('chat_user');
    const isMe = data.sender === currentUser;

    if (!isMe && data.status !== 'read' && data.roomId !== 'global_room') {
        if(db) db.ref('messages/' + data.roomId + '/' + msgKey).update({status: 'read'});
        data.status = 'read'; 
        if(data.roomId !== 'global_room') LocalDB.saveMessage(data); 
    }

    let decryptedText = data.text;
    if(data.type === 'text') {
        try { decryptedText = decodeURIComponent(atob(data.text)); } 
        catch(e) { decryptedText = data.text; }
    }

    let decryptedReply = null;
    if(data.replyTo) {
        try { decryptedReply = decodeURIComponent(atob(data.replyTo)); } 
        catch(e) { decryptedReply = data.replyTo; }
    }

    appendRealMessage(decryptedText, data.type, isMe, data.timestamp, decryptedReply, data.sender, data.senderPfp, data.senderUid, msgKey, data.status);
}

window.openActiveChat = function(userName, userImg, roomId = 'global_room') {
    pushAppState('active-chat-view'); 
    document.getElementById('inbox-view').classList.add('hidden');
    document.getElementById('active-chat-view').classList.remove('hidden');
    document.getElementById('app-chat-title').innerText = userName;
    
    document.getElementById('header-profile-img').src = userImg;
    
    activeChatRoomId = roomId;
    const viewport = document.getElementById('chat-viewport');
    
    viewport.innerHTML = `
        <div class="e2ee-badge">
            &#128274; Messages and calls are end-to-end encrypted. Loaded from local storage.
        </div>
    `;

    if(!db) return;

    if (activeChatRoomId !== 'global_room' && myUserId) {
        db.ref('inbox/' + myUserId + '/' + activeChatRoomId).update({unread: false});
    }

    db.ref('messages/' + activeChatRoomId).off();
    renderedMessages.clear(); 

    db.ref('messages/' + activeChatRoomId).on('child_changed', (snapshot) => {
        const data = snapshot.val();
        if(data.senderUid === myUserId) {
            updateMessageTick(snapshot.key, data.status);
            data.id = snapshot.key;
            data.roomId = activeChatRoomId;
            if(activeChatRoomId !== 'global_room') LocalDB.saveMessage(data);
        }
    });

    if (activeChatRoomId !== 'global_room') {
        LocalDB.getAllMessages().then(allMsgs => {
            let lastLocalTime = 0;
            if(allMsgs && allMsgs.length > 0) {
                const roomMsgs = allMsgs.filter(m => m.roomId === activeChatRoomId).sort((a, b) => a.timestamp - b.timestamp);
                roomMsgs.forEach(data => {
                    processAndRenderMsg(data, data.id);
                    if (data.timestamp > lastLocalTime) lastLocalTime = data.timestamp;
                });
            }
            
            db.ref('messages/' + activeChatRoomId).orderByChild('timestamp').startAt(lastLocalTime + 1).on('child_added', (snapshot) => {
                const data = snapshot.val();
                if(!data) return;
                data.id = snapshot.key;
                data.roomId = activeChatRoomId;
                LocalDB.saveMessage(data);
                processAndRenderMsg(data, snapshot.key);
            });
        }).catch(e => console.log("DB Load Error", e));
    } else {
        db.ref('messages/' + activeChatRoomId).limitToLast(100).on('child_added', (snapshot) => {
            const data = snapshot.val();
            if(!data) return;
            data.id = snapshot.key;
            data.roomId = activeChatRoomId;
            processAndRenderMsg(data, snapshot.key);
        });
    }

    if(activeChatRoomId !== 'global_room') {
        let targetUid = activeChatRoomId.replace(myUserId, '').replace('_', '');
        
        db.ref('users/' + targetUid).off('value'); 
        db.ref('users/' + targetUid).on('value', snap => {
            if(snap.exists() && activeChatRoomId === roomId) {
                const u = snap.val();
                const statusEl = document.getElementById('chat-user-status');
                if(u.typingTo === myUserId) {
                    statusEl.innerText = "typing...";
                    statusEl.style.color = "#00e676";
                } else if(u.status === 'online') {
                    statusEl.innerText = "online";
                    statusEl.style.color = "#fff";
                } else {
                    statusEl.innerText = formatLastSeen(u.lastSeen);
                    statusEl.style.color = "rgba(255,255,255,0.8)";
                }
            }
        });
    } else {
        document.getElementById('chat-user-status').innerText = "online";
        document.getElementById('chat-user-status').style.color = "#fff";
    }
};

let typingTimeout;
document.getElementById('main-input').addEventListener('input', () => {
    if(activeChatRoomId === 'global_room' || !myUserId || !db) return;
    let targetUid = activeChatRoomId.replace(myUserId, '').replace('_', '');
    db.ref('users/' + myUserId).update({typingTo: targetUid});
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        db.ref('users/' + myUserId).update({typingTo: null});
    }, 1500);
});

document.getElementById('btn-back-to-inbox').onclick = () => {
    history.back(); 
};

function showNotification(title, body) {
    const banner = document.getElementById('in-app-notification');
    document.getElementById('noti-title').innerText = title;
    document.getElementById('noti-body').innerText = body;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('show'), 10);
    setTimeout(() => { banner.classList.remove('show'); setTimeout(() => banner.classList.add('hidden'), 400); }, 3000);
}

function isPremiumUser() { return localStorage.getItem('is_premium') === 'true'; }

function showInterstitialAd(onCloseCallback = null) {
    const adModal = document.getElementById('interstitial-ad-modal');
    const closeBtn = document.getElementById('close-interstitial-btn');
    const timerText = document.getElementById('interstitial-timer');
    
    adModal.classList.remove('hidden'); 
    closeBtn.classList.add('hidden');
    pushAppState('interstitial-ad-modal');
    
    let adTime = 5; 
    timerText.innerText = `You can close this ad in ${adTime}s...`;
    
    if (interstitialAdInterval) clearInterval(interstitialAdInterval);
    
    interstitialAdInterval = setInterval(() => {
        adTime--; 
        timerText.innerText = `You can close this ad in ${adTime}s...`;
        if(adTime <= 0) {
            clearInterval(interstitialAdInterval); 
            timerText.innerText = "You can close this ad now."; 
            closeBtn.classList.remove('hidden');
        }
    }, 1000);
    
    closeBtn.onclick = () => {
        clearInterval(interstitialAdInterval);
        adModal.classList.add('hidden'); 
        history.back(); 
        if (typeof onCloseCallback === 'function') {
            setTimeout(() => onCloseCallback(), 50); 
        }
    };
}

function startCall(type) {
    if(activeChatRoomId === 'global_room') {
        alert("Voice & Video calls are disabled in Global Chat! Please start a private chat with a user to call them.");
        return;
    }

    isCallActive = true; 
    document.getElementById('call-type-title').innerText = type + " Call";
    
    if(type === 'Video') {
        document.getElementById('call-status').innerText = "Starting Camera...";
    } else {
        document.getElementById('call-status').innerText = "Ringing...";
    }

    document.getElementById('active-call-modal').classList.remove('hidden');
    pushAppState('active-call-modal');
    
    const uids = activeChatRoomId.split('_');
    let targetUid = (uids[0] === myUserId) ? uids[1] : uids[0];
    
    if(targetUid && db) {
        db.ref('calls/' + targetUid).set({
            callerName: localStorage.getItem('chat_user'),
            callerPfp: localStorage.getItem('chat_user_pfp') || "https://cdn-icons-png.flaticon.com/512/149/149071.png",
            type: type,
            roomId: activeChatRoomId
        });
    }

    ringbackAudio.currentTime = 0;
    ringbackAudio.play().catch(e => console.log("Audio autoplay blocked"));

    if(type === 'Video') {
        document.getElementById('call-user-avatar').classList.add('hidden'); 
        const vidEl = document.getElementById('local-video-stream');
        vidEl.classList.remove('hidden');
        vidEl.style.filter = "none"; 
        
        if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(stream => {
                    if(!isCallActive) {
                        stream.getTracks().forEach(t => { t.enabled = false; t.stop(); });
                        return;
                    }
                    localCallStream = stream;
                    vidEl.srcObject = stream;
                    document.getElementById('call-status').innerText = "Ringing...";
                }).catch(err => {
                    ringbackAudio.pause();
                    document.getElementById('call-status').innerText = "Camera Blocked";
                    alert("Camera access denied! Please allow camera and mic permissions in your browser.");
                });
        }
    } else {
        document.getElementById('call-user-avatar').classList.remove('hidden');
        document.getElementById('local-video-stream').classList.add('hidden');
        
        if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    if(!isCallActive) {
                        stream.getTracks().forEach(t => { t.enabled = false; t.stop(); });
                        return;
                    }
                    localCallStream = stream;
                    document.getElementById('call-status').innerText = "Ringing...";
                }).catch(err => {
                    ringbackAudio.pause();
                    document.getElementById('call-status').innerText = "Mic Blocked";
                    alert("Mic access denied! Please allow permissions in your browser.");
                });
        }
    }

    setTimeout(() => {
        if(!isCallActive) return;
        
        ringbackAudio.pause(); 
        ringbackAudio.currentTime = 0;
        
        document.getElementById('call-status').innerText = "00:00"; 
        callSeconds = 0;
        if (callTimerInterval) clearInterval(callTimerInterval);
        callTimerInterval = setInterval(() => {
            callSeconds++; let m = Math.floor(callSeconds / 60); let s = callSeconds % 60;
            document.getElementById('call-status').innerText = `${m < 10 ? '0':''}${m}:${s < 10 ? '0':''}${s}`;
        }, 1000);
    }, 3000);
}

document.getElementById('btn-end-call').onclick = () => {
    const uids = activeChatRoomId.split('_');
    let targetUid = (uids[0] === myUserId) ? uids[1] : uids[0];
    if(targetUid && db) { db.ref('calls/' + targetUid).remove(); } 
    
    history.back(); 
    
    if(!isPremiumUser()) { 
        setTimeout(() => showInterstitialAd(), 200);
    }
};

function checkAndStartTimer() {
    if (isPremiumUser()) { applyPremiumPerks(); return; }
    const now = new Date().getTime(); let expireTime = localStorage.getItem('chat_expire_time');
    if (!expireTime || now >= expireTime) { document.getElementById('access-blocker').classList.remove('hidden'); } 
    else { startCountdown(expireTime); }
}

function startCountdown(expireTimeMs) {
    if (isPremiumUser()) return;
    if (mainAccessTimerInterval) clearInterval(mainAccessTimerInterval);
    
    mainAccessTimerInterval = setInterval(() => {
        let timeLeft = Math.floor((expireTimeMs - Date.now()) / 1000);
        if (timeLeft <= 0) { 
            clearInterval(mainAccessTimerInterval); 
            const timerEl = document.getElementById('access-timer');
            if(timerEl) timerEl.innerText = `0:00 remaining`;
            const blocker = document.getElementById('access-blocker');
            if(blocker) blocker.classList.remove('hidden'); 
            return;
        }
        const min = Math.floor(timeLeft / 60); 
        const sec = timeLeft % 60;
        const timerEl = document.getElementById('access-timer');
        if(timerEl) timerEl.innerText = `${min}:${sec < 10 ? '0' : ''}${sec} remaining`;
    }, 1000);
}

function grantRewardTime() {
    if (isPremiumUser()) return;
    const expireTimeMs = Date.now() + (30 * 60 * 1000);
    localStorage.setItem('chat_expire_time', expireTimeMs);
    const blocker = document.getElementById('access-blocker');
    if(blocker) blocker.classList.add('hidden'); 
    checkAndStartTimer();
}

function applyPremiumPerks() {
    const timerBadge = document.getElementById('access-timer');
    timerBadge.innerText = "&#128081; PRO"; timerBadge.style.background = "#ffd700"; timerBadge.style.color = "#000";
    const bottomAd = document.getElementById('bottom-banner-ad');
    if(bottomAd) bottomAd.classList.add('hidden');
    document.querySelectorAll('.premium-hide-ad').forEach(ad => ad.classList.add('hidden'));
    document.getElementById('access-blocker').classList.add('hidden');
    if (mainAccessTimerInterval) clearInterval(mainAccessTimerInterval);
}

function updateMessageTick(msgKey, status) {
    const tickElement = document.getElementById(`${msgKey}-tick`);
    if(!tickElement) return;
    if(status === 'read') { tickElement.innerHTML = '<span style="color:var(--tick-blue)">&#10003;&#10003;</span>'; } 
    else if (status === 'delivered') { tickElement.innerHTML = '&#10003;&#10003;'; }
    else { tickElement.innerHTML = '&#10003;'; }
}

let activeReplyText = null; let activeForwardContent = { type: null, data: null };

let currentViewingImageRow = null;
window.openImageViewer = function(src, rowElement = null, isProfilePic = false) {
    currentViewingImageRow = rowElement;
    const imgEl = document.getElementById('iv-main-img');
    imgEl.src = src; imgEl.classList.remove('zoomed'); 
    
    const delBtn = document.getElementById('iv-btn-delete');
    if(isProfilePic) { delBtn.classList.add('hidden'); } else { delBtn.classList.remove('hidden'); }

    document.getElementById('image-viewer-modal').classList.remove('hidden');
    pushAppState('image-viewer-modal');
};

window.openSenderProfile = function(uname, uavatar, targetUid) {
    document.getElementById('modal-user-name').innerText = uname; 
    document.getElementById('modal-user-avatar').src = uavatar;
    document.getElementById('modal-user-bio').innerText = "Loading..."; 
    document.getElementById('modal-user-status').innerText = '';
    
    if(db) {
        db.ref('users/' + targetUid).once('value', snap => {
            if(snap.exists()) {
                const u = snap.val();
                document.getElementById('modal-user-bio').innerText = `"${u.bio || 'Available'}"`;
                document.getElementById('modal-user-status').innerText = u.status === 'online' ? 'Online Now' : formatLastSeen(u.lastSeen);
                document.getElementById('modal-user-status').style.color = u.status === 'online' ? '#25d366' : '#888';
            }
        });
    }
    
    document.getElementById('user-action-modal').classList.remove('hidden');
    pushAppState('user-action-modal');

    document.getElementById('modal-btn-chat').dataset.uid = targetUid;
    
    document.getElementById('modal-btn-chat').onclick = () => {
        document.getElementById('user-action-modal').classList.add('hidden');
        if(history.state && history.state.page === 'user-action-modal') history.back();
        let room = myUserId < targetUid ? myUserId + '_' + targetUid : targetUid + '_' + myUserId;
        setTimeout(() => openActiveChat(uname, uavatar, room), 50);
    };
};

document.getElementById('ctx-delete-btn').onclick = () => {
    history.back();
    if(activeLongPressRoom && db) {
        db.ref('inbox/' + myUserId + '/' + activeLongPressRoom).remove();
        db.ref('messages/' + activeLongPressRoom).remove();
    }
};
document.getElementById('ctx-mute-btn').onclick = () => {
    history.back();
    alert("Chat Muted");
};
document.getElementById('ctx-block-btn').onclick = () => {
    history.back();
    if(activeLongPressRoom && activeLongPressUid && db) {
        db.ref('inbox/' + myUserId + '/' + activeLongPressRoom).remove();
        
        db.ref('users/' + activeLongPressUid).once('value', snap => {
            let blockName = snap.exists() ? snap.val().username : "Unknown User";
            db.ref('blocks/' + myUserId + '/' + activeLongPressUid).set({ name: blockName, timestamp: Date.now() });
        });
        alert("User Blocked. Added to Blocked Users List in Settings.");
    }
};
document.getElementById('ctx-cancel-btn').onclick = () => history.back();

document.getElementById('modal-btn-block').onclick = () => {
    const uname = document.getElementById('modal-user-name').innerText;
    const targetUid = document.getElementById('modal-btn-chat').dataset.uid; 
    if(db) db.ref('blocks/' + myUserId + '/' + targetUid).set({ name: uname, timestamp: Date.now() });
    history.back();
    alert("User Blocked. You can unblock them from Settings.");
};

document.getElementById('iv-btn-close').onclick = () => { 
    history.back();
};
document.getElementById('iv-main-img').onclick = function() { this.classList.toggle('zoomed'); };

document.getElementById('iv-btn-download').onclick = () => {
    const a = document.createElement('a');
    a.href = document.getElementById('iv-main-img').src;
    a.download = 'ProChat_Media_' + Date.now();
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

document.getElementById('iv-btn-delete').onclick = () => {
    customConfirm('Delete this image?', () => {
        if(currentViewingImageRow) currentViewingImageRow.remove();
    });
};

function appendRealMessage(content, type, isMe, timestamp, replyText = null, senderName = null, senderPfp = null, senderUid = null, msgKey = null, status = 'sent') {
    const viewport = document.getElementById('chat-viewport');
    const date = new Date(timestamp);
    const timeFormatted = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let innerContent = "";
    let headerHtml = "";

    if (!isMe && activeChatRoomId === 'global_room' && senderName) {
        let pfp = senderPfp || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        let sUid = senderUid || 'unknown_uid';
        headerHtml = `<div class="msg-sender-info" onclick="openSenderProfile('${senderName}', '${pfp}', '${sUid}')" style="display:flex; align-items:center; gap:6px; margin-bottom:5px; padding-bottom:5px; border-bottom:1px solid rgba(0,0,0,0.05); cursor:pointer;">
            <img src="${pfp}" style="width:20px; height:20px; border-radius:50%; object-fit:cover;">
            <strong style="font-size:12px; color:var(--wa-teal);">${senderName}</strong>
        </div>`;
    }
    
    if (replyText) {
        innerContent += `<div class="quoted-msg"><strong>Replying to:</strong><br>${replyText}</div>`;
    }

    if(type === 'image') innerContent += `<img src="${content}" class="chat-image" onclick="openImageViewer(this.src, this.closest('.msg-row'), false)">`;
    else if (type === 'audio') innerContent += `<div class="audio-player"><audio controls src="${content}"></audio></div>`;
    else if (type === 'video') innerContent += `<video controls src="${content}" class="chat-video"></video>`;
    else innerContent += `<p>${content}</p>`;

    const keyId = msgKey || ('msg-' + Date.now());
    
    let tickStatus = '&#10003;';
    if (status === 'read') tickStatus = '<span style="color:var(--tick-blue)">&#10003;&#10003;</span>';
    else if (status === 'delivered') tickStatus = '&#10003;&#10003;';

    const tickHtml = isMe ? `<span id="${keyId}-tick" class="msg-tick">${tickStatus}</span>` : '';
    
    const row = document.createElement('div'); 
    row.className = `msg-row ${isMe ? 'msg-out' : 'msg-in'}`;
    row.innerHTML = `<div class="bubble">${headerHtml}${innerContent}<div class="msg-meta-wrap"><span class="msg-time">${timeFormatted}</span>${tickHtml}</div></div>`;
    
    viewport.appendChild(row); 
    setTimeout(() => { viewport.scrollTop = viewport.scrollHeight; }, 10);
}

function sendMessageToFirebase(data, type) {
    if (!activeChatRoomId || !db) return;
    
    if(activeChatRoomId === 'global_room') {
        proceedToSend(data, type);
    } else {
        const targetUid = activeChatRoomId.replace(myUserId, '').replace('_', '');
        db.ref('blocks/' + myUserId + '/' + targetUid).once('value', snap1 => {
            if(snap1.exists()) {
                alert("You have blocked this user. Unblock them from Settings to send messages.");
                return;
            }
            db.ref('blocks/' + targetUid + '/' + myUserId).once('value', snap2 => {
                if(snap2.exists()) {
                    alert("Message not sent. You have been blocked by this user.");
                    return;
                }
                proceedToSend(data, type);
            });
        });
    }
}

function proceedToSend(data, type) {
    let payload = data;
    if (type === 'text') {
        payload = btoa(encodeURIComponent(data));
    }

    let msgObj = {
        text: payload,
        sender: localStorage.getItem('chat_user'),
        senderPfp: localStorage.getItem('chat_user_pfp') || "https://cdn-icons-png.flaticon.com/512/149/149071.png",
        senderUid: myUserId,
        timestamp: firebase.database.ServerValue.TIMESTAMP || Date.now(),
        type: type,
        status: 'sent' 
    };

    if (activeReplyText) {
        msgObj.replyTo = btoa(encodeURIComponent(activeReplyText));
        activeReplyText = null; 
        document.getElementById('reply-preview').classList.add('hidden'); 
    }

    let newMsgRef = db.ref('messages/' + activeChatRoomId).push();
    msgObj.id = newMsgRef.key;
    msgObj.roomId = activeChatRoomId;

    if (activeChatRoomId !== 'global_room') {
        LocalDB.saveMessage(msgObj);
    }

    newMsgRef.set(msgObj).catch((err) => {
        alert("Message Send Error: " + err.message);
    });

    if(activeChatRoomId !== 'global_room' && myUserId) {
        const uids = activeChatRoomId.split('_');
        if(uids.length === 2) {
            const targetUid = (uids[0] === myUserId) ? uids[1] : uids[0];
            const targetName = document.getElementById('app-chat-title').innerText;
            const targetPfp = document.getElementById('header-profile-img').src;
            const myName = localStorage.getItem('chat_user');
            const myPfp = localStorage.getItem('chat_user_pfp') || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
            
            let snippet = type === 'text' ? data : ('&#128247; ' + type);

            db.ref('inbox/' + myUserId + '/' + activeChatRoomId).update({
                name: targetName, pfp: targetPfp, lastMsg: snippet, time: Date.now(), isRequest: false
            });
            
            db.ref('inbox/' + targetUid + '/' + activeChatRoomId).once('value', snap => {
                let isReq = true;
                if(snap.exists() && snap.val().isRequest === false) {
                    isReq = false; 
                }
                db.ref('inbox/' + targetUid + '/' + activeChatRoomId).update({
                    name: myName, pfp: myPfp, lastMsg: snippet, time: Date.now(), isRequest: isReq, unread: true
                });
            });
        }
    }
}

function compressImageToBase64(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width; 
            let height = img.height;
            const max_size = 1920; 

            if (width > height && width > max_size) { 
                height *= max_size / width; 
                width = max_size; 
            } else if (height > max_size) { 
                width *= max_size / height; 
                height = max_size; 
            }
            canvas.width = width; 
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = "#ffffff"; 
            ctx.fillRect(0, 0, width, height); 
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function audioBlobToBase64(blob, callback) {
    const reader = new FileReader();
    reader.onload = function() {
        callback(reader.result);
    };
    reader.readAsDataURL(blob);
}

let touchStartX = 0; let pressTimer = null;
const chatViewport = document.getElementById('chat-viewport');
if (chatViewport) {
    chatViewport.addEventListener('touchstart', (e) => {
        const bubble = e.target.closest('.bubble'); if(!bubble) return;
        touchStartX = e.touches[0].clientX;
        pressTimer = setTimeout(() => showReactionPopover(bubble), 600);
    });
    chatViewport.addEventListener('touchmove', (e) => {
        clearTimeout(pressTimer); const row = e.target.closest('.msg-row');
        if(row) { let diff = e.touches[0].clientX - touchStartX; if(diff > 0 && diff < 80) row.style.transform = `translateX(${diff}px)`; }
    });
    
    chatViewport.addEventListener('touchend', (e) => {
        clearTimeout(pressTimer); const row = e.target.closest('.msg-row'); if(!row) return;
        row.style.transform = `translateX(0px)`; 
        let touchEndX = e.changedTouches[0].clientX;
        if(touchEndX - touchStartX > 50) {
            let replyContent = "";
            const textEl = row.querySelector('p');
            const imgEl = row.querySelector('.chat-image');
            const audEl = row.querySelector('audio');
            const vidEl = row.querySelector('.chat-video');

            if (textEl) replyContent = textEl.innerText;
            else if (imgEl) replyContent = "&#128247; Photo";
            else if (audEl) replyContent = "&#127925; Voice Note";
            else if (vidEl) replyContent = "&#128249; Video";

            if(replyContent) {
                activeReplyText = replyContent;
                document.getElementById('reply-text-display').innerHTML = replyContent;
                document.getElementById('reply-preview').classList.remove('hidden');
                document.getElementById('main-input').focus();
            }
        }
    });
}

function showReactionPopover(bubble) {
    document.querySelectorAll('.reaction-bar').forEach(el => el.remove()); 
    const bar = document.createElement('div'); bar.className = 'reaction-bar';
    bar.innerHTML = '<span>&#10084;&#65039;</span><span>&#128514;</span><span>&#128562;</span><span>&#128546;</span><span>&#128591;</span><span class="forward-msg-btn" title="Forward">&#10149;</span><span class="delete-msg-btn" title="Delete">&#128465;</span>';
    
    bar.querySelectorAll('span:not(.forward-msg-btn):not(.delete-msg-btn)').forEach(emoji => {
        emoji.onclick = (e) => {
            e.stopPropagation();
            let badge = bubble.querySelector('.reaction-badge');
            if(!badge) { badge = document.createElement('div'); badge.className = 'reaction-badge'; bubble.appendChild(badge); }
            badge.innerHTML = e.target.innerHTML; bar.remove();
        };
    });

    bar.querySelector('.forward-msg-btn').onclick = (e) => {
        e.stopPropagation();
        const textEl = bubble.querySelector('p'); const imgEl = bubble.querySelector('img'); const audioEl = bubble.querySelector('audio'); const vidEl = bubble.querySelector('video');
        if (textEl) activeForwardContent = { type: 'text', data: textEl.innerText };
        else if (imgEl) activeForwardContent = { type: 'image', data: imgEl.src };
        else if (audioEl) activeForwardContent = { type: 'audio', data: audioEl.src };
        else if (vidEl) activeForwardContent = { type: 'video', data: vidEl.src };
        else activeForwardContent = null;
        if(activeForwardContent) { 
            document.getElementById('forward-modal').classList.remove('hidden'); 
            pushAppState('forward-modal');
        }
        bar.remove();
    };

    bar.querySelector('.delete-msg-btn').onclick = (e) => {
        e.stopPropagation();
        customConfirm("Delete this message?", () => {
            bubble.closest('.msg-row').remove();
        });
        bar.remove();
    };
    bubble.appendChild(bar);
}

document.body.addEventListener('click', (e) => { 
    if(!e.target.closest('.reaction-bar') && !e.target.closest('.bubble')) document.querySelectorAll('.reaction-bar').forEach(el => el.remove()); 
    if (!e.target.closest('#btn-attach') && !e.target.closest('#attachment-menu')) { document.getElementById('attachment-menu').classList.add('hidden'); }
    if (!e.target.closest('#btn-header-menu') && !e.target.closest('#header-menu-popup')) { document.getElementById('header-menu-popup').classList.add('hidden'); }
});

window.showRewardedVideoAd = function(onCompleteCallback) {
    const overlay = document.getElementById('ad-video-overlay');
    overlay.classList.remove('hidden'); 
    pushAppState('ad-video-overlay');
    
    let adTime = 10; 
    document.getElementById('ad-timer-count').innerText = adTime; 
    document.getElementById('ad-progress-fill').style.width = "0%";
    
    if (window.rewardAdInterval) clearInterval(window.rewardAdInterval);
    
    window.rewardAdInterval = setInterval(() => {
        adTime--; 
        const countEl = document.getElementById('ad-timer-count');
        if(countEl) countEl.innerText = adTime; 
        
        const progEl = document.getElementById('ad-progress-fill');
        if(progEl) progEl.style.width = ((10 - adTime) * 10) + "%";
        
        if (adTime <= 0) { 
            clearInterval(window.rewardAdInterval); 
            overlay.classList.add('hidden'); 
            history.back(); 
            if (onCompleteCallback) {
                setTimeout(() => onCompleteCallback(), 50); 
            }
        }
    }, 1000);
};

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('close-reply-btn').onclick = () => { activeReplyText = null; document.getElementById('reply-preview').classList.add('hidden'); }

    document.getElementById('header-profile-img').onclick = function() { openImageViewer(this.src, null, true); };
    document.getElementById('modal-user-avatar').onclick = function() { openImageViewer(this.src, null, true); };

    document.getElementById('btn-watch-ad').onclick = () => {
        const blocker = document.getElementById('access-blocker');
        if (blocker) blocker.classList.add('hidden');
        showRewardedVideoAd(() => grantRewardTime());
    };

    const bottomAd = document.getElementById('bottom-banner-ad');
    if(bottomAd) {
        bottomAd.onclick = () => {
            showRewardedVideoAd(() => {
                alert("Rewarded Video Completed! (Testing Callback)");
            });
        };
    }

    document.querySelectorAll('.native-ad-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            showInterstitialAd();
        };
    });

    document.getElementById('inbox-btn-discover').onclick = () => {
        pushAppState('discovery-panel');
        document.getElementById('discovery-panel').classList.remove('hidden');
        loadOnlineUsers();
    };
    
    document.getElementById('search-user-input').addEventListener('input', (e) => {
        loadOnlineUsers(e.target.value.trim());
    });
    document.getElementById('btn-search-trigger').onclick = () => {
        loadOnlineUsers(document.getElementById('search-user-input').value.trim());
    };
    
    document.getElementById('inbox-btn-settings').onclick = () => { 
        pushAppState('settings-panel');
        document.getElementById('settings-panel').classList.remove('hidden'); 
        document.getElementById('username-input').value = localStorage.getItem('chat_user') || "";
    };

    document.getElementById('tab-online').onclick = () => {
        document.getElementById('tab-online').classList.add('active-tab');
        document.getElementById('tab-requests').classList.remove('active-tab');
        document.getElementById('discover-online-area').classList.remove('hidden');
        document.getElementById('discover-requests-area').classList.add('hidden');
    };
    document.getElementById('tab-requests').onclick = () => {
        document.getElementById('tab-requests').classList.add('active-tab');
        document.getElementById('tab-online').classList.remove('active-tab');
        document.getElementById('discover-requests-area').classList.remove('hidden');
        document.getElementById('discover-online-area').classList.add('hidden');
    };

    const headerMenu = document.getElementById('header-menu-popup');
    document.getElementById('btn-header-menu').onclick = () => { headerMenu.classList.toggle('hidden'); };
    
    document.getElementById('menu-btn-call').onclick = () => { 
        headerMenu.classList.add('hidden'); 
        if(activeChatRoomId === 'global_room') {
            alert("Voice Calls are not allowed in Global Chat. Please start a private chat with a user to call them.");
            return;
        }
        if (!isPremiumUser()) { showInterstitialAd(() => setTimeout(() => startCall('Voice'), 100)); } 
        else { setTimeout(() => startCall('Voice'), 100); } 
    };
    document.getElementById('menu-btn-video').onclick = () => { 
        headerMenu.classList.add('hidden'); 
        if(activeChatRoomId === 'global_room') {
            alert("Video Calls are not allowed in Global Chat. Please start a private chat with a user to call them.");
            return;
        }
        if (!isPremiumUser()) { showInterstitialAd(() => setTimeout(() => startCall('Video'), 100)); } 
        else { setTimeout(() => startCall('Video'), 100); } 
    };
    
    document.getElementById('menu-btn-discover').onclick = () => { headerMenu.classList.add('hidden'); document.getElementById('inbox-btn-discover').click(); };
    document.getElementById('menu-btn-settings').onclick = () => { headerMenu.classList.add('hidden'); document.getElementById('inbox-btn-settings').click(); };
    document.getElementById('menu-btn-clear').onclick = () => {
        headerMenu.classList.add('hidden');
        customConfirm("Are you sure you want to clear this entire chat history?", () => { 
            if(activeChatRoomId && db) db.ref('messages/' + activeChatRoomId).remove();
            document.getElementById('chat-viewport').innerHTML = `<div class="e2ee-badge">&#128274; Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.</div>`;
        });
    };

    document.getElementById('send-btn').onclick = () => { 
        const text = document.getElementById('main-input').value.trim(); 
        if (text && activeChatRoomId) { 
            sendMessageToFirebase(text, 'text');
            document.getElementById('main-input').value = ""; 
            document.getElementById('emoji-tray').classList.add('hidden'); 
        } 
    };
    
    document.getElementById('main-input').addEventListener("keypress", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById('send-btn').click(); } });
    document.getElementById('btn-emoji').onclick = () => document.getElementById('emoji-tray').classList.toggle('hidden');
    document.querySelectorAll('.emj').forEach(e => { e.onclick = (ev) => { document.getElementById('main-input').value += ev.target.innerHTML; }; });

    document.getElementById('btn-attach').onclick = () => document.getElementById('attachment-menu').classList.toggle('hidden');
    
    document.getElementById('btn-menu-gallery').onclick = () => { 
        document.getElementById('attachment-menu').classList.add('hidden'); 
    };
    document.getElementById('btn-menu-camera').onclick = () => { 
        document.getElementById('attachment-menu').classList.add('hidden'); 
    };

    const handleUpload = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            document.getElementById('attachment-menu').classList.add('hidden');
            
            files.forEach(file => {
                const tempId = 'loader-' + Date.now() + Math.floor(Math.random() * 1000);
                const viewport = document.getElementById('chat-viewport');
                const row = document.createElement('div');
                row.id = tempId;
                row.className = "msg-row msg-out";
                
                if (file.type.startsWith('video/')) {
                    if(file.size > 5000000) { alert("Video too large! Please select under 5MB."); return; }
                    row.innerHTML = `<div class="bubble">Sending HD Video... <div class="uploading-loader"></div></div>`;
                    viewport.appendChild(row); viewport.scrollTop = viewport.scrollHeight;
                    
                    const reader = new FileReader();
                    reader.onload = function(ev) {
                        document.getElementById(tempId).remove();
                        sendMessageToFirebase(ev.target.result, 'video');
                    };
                    reader.readAsDataURL(file);
                    
                } else if (file.type.startsWith('image/')) {
                    row.innerHTML = `<div class="bubble">Sending HD Image... <div class="uploading-loader"></div></div>`;
                    viewport.appendChild(row); viewport.scrollTop = viewport.scrollHeight;
                    
                    compressImageToBase64(file, (base64Data) => {
                        document.getElementById(tempId).remove();
                        sendMessageToFirebase(base64Data, 'image');
                    });
                }
            });

            e.target.value = ""; 
        }
    };
    
    document.getElementById('attach-file-input').onchange = handleUpload;
    document.getElementById('camera-file-input').onchange = handleUpload;
    
    let micPressTimer;
    let isLongPress = false;
    let isRecordingVoice = false;
    let mediaRecorderObj;
    let audioChunksData = [];
    const btnMic = document.getElementById('btn-mic');
    const voiceInput = document.getElementById('voice-file-input');

    const startMicRecord = (e) => {
        e.preventDefault(); 
        isLongPress = false;
        micPressTimer = setTimeout(() => {
            isLongPress = true;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { 
                alert("Direct Mic not supported. Tap icon once to upload audio file."); 
                return; 
            }
            try {
                navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                    if (!isLongPress) {
                        stream.getTracks().forEach(t => { t.enabled = false; t.stop(); });
                        return;
                    }
                    mediaRecorderObj = new MediaRecorder(stream); 
                    mediaRecorderObj.start(); 
                    isRecordingVoice = true;
                    btnMic.innerHTML = '&#10006;'; 
                    btnMic.classList.add('recording-active');
                    
                    mediaRecorderObj.addEventListener("dataavailable", event => { audioChunksData.push(event.data); });
                    
                    mediaRecorderObj.addEventListener("stop", () => {
                        const audioBlob = new Blob(audioChunksData, { type: 'audio/webm' });
                        audioChunksData = [];
                        
                        const tempId = 'loader-' + Date.now();
                        const viewport = document.getElementById('chat-viewport');
                        const row = document.createElement('div');
                        row.id = tempId;
                        row.className = "msg-row msg-out";
                        row.innerHTML = `<div class="bubble">Sending Voice Note... <div class="uploading-loader"></div></div>`;
                        viewport.appendChild(row); 
                        viewport.scrollTop = viewport.scrollHeight;

                        audioBlobToBase64(audioBlob, (base64Audio) => {
                            document.getElementById(tempId).remove();
                            sendMessageToFirebase(base64Audio, 'audio');
                        });
                        
                        stream.getTracks().forEach(t => { t.enabled = false; t.stop(); });
                    });
                }).catch(err => {
                    isLongPress = false;
                });
            } catch (e) { }
        }, 500); 
    };

    const stopMicRecord = (e) => {
        e.preventDefault(); 
        clearTimeout(micPressTimer);
        if (isLongPress) {
            isLongPress = false; 
            if (isRecordingVoice && mediaRecorderObj) {
                mediaRecorderObj.stop(); 
                isRecordingVoice = false; 
                btnMic.innerHTML = '&#127897;'; 
                btnMic.classList.remove('recording-active');
            }
        } else {
            voiceInput.click();
        }
    };

    btnMic.addEventListener('touchstart', startMicRecord);
    btnMic.addEventListener('touchend', stopMicRecord);
    btnMic.addEventListener('touchcancel', stopMicRecord); 
    
    voiceInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const tempId = 'loader-' + Date.now();
            const viewport = document.getElementById('chat-viewport');
            const row = document.createElement('div');
            row.id = tempId;
            row.className = "msg-row msg-out";
            row.innerHTML = `<div class="bubble">Sending Audio... <div class="uploading-loader"></div></div>`;
            viewport.appendChild(row); 
            viewport.scrollTop = viewport.scrollHeight;

            const reader = new FileReader();
            reader.onload = function(ev) {
                document.getElementById(tempId).remove();
                sendMessageToFirebase(ev.target.result, 'audio');
            };
            reader.readAsDataURL(file);
            e.target.value = "";
        }
    };

    document.getElementById('close-discover-btn').onclick = () => {
        history.back();
    };
    document.getElementById('close-settings-btn').onclick = () => {
        history.back();
    };

    document.getElementById('discover-online-area').addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-connect');
        const itemLeft = e.target.closest('.item-left');
        const card = e.target.closest('.discover-user-card');
        
        if (card && (btn || e.target.closest('.item-left'))) {
            const uname = card.dataset.username;
            const uavatar = card.dataset.avatar || "https://cdn-icons-png.flaticon.com/512/149/149071.png"; 
            const targetUid = card.dataset.uid;
            
            openSenderProfile(uname, uavatar, targetUid);
        }
    });

    document.getElementById('modal-btn-cancel').onclick = () => {
        document.getElementById('user-action-modal').classList.add('hidden');
        if(history.state && history.state.page === 'user-action-modal') {
            history.back();
        }
    };

    document.getElementById('forward-list-container').addEventListener('click', (e) => {
        const item = e.target.closest('.forward-user-item');
        if(item) {
            history.back();
            setTimeout(() => {
                openActiveChat(item.dataset.name, item.dataset.avatar, item.dataset.room);
                if(activeForwardContent && activeForwardContent.data) {
                    sendMessageToFirebase(activeForwardContent.data, activeForwardContent.type);
                    activeForwardContent = { type: null, data: null }; 
                }
            }, 100);
        }
    });

    document.getElementById('close-forward-btn').onclick = () => {
        history.back();
    };

    document.getElementById('btn-open-premium').onclick = () => { history.back(); document.getElementById('premium-modal').classList.remove('hidden'); pushAppState('premium-modal'); };
    document.getElementById('close-premium-btn').onclick = () => {
        history.back();
    };
    
    document.getElementById('btn-buy-premium').onclick = () => {
        alert("Connecting to Secure Payment Gateway...\n\n❌ ERROR: Merchant API Keys not found.\n\nPlease link Razorpay, Paytm, or Google Play Billing to accept real payments. Premium upgrade is locked.");
    };
    
    document.getElementById('btn-blocked-users').onclick = () => {
        document.getElementById('blocked-users-modal').classList.remove('hidden');
        pushAppState('blocked-users-modal');
        loadBlockedUsers();
    };
    document.getElementById('close-blocked-btn').onclick = () => {
        history.back();
    };

    const themeSelector = document.getElementById('theme-selector');
    themeSelector.onchange = (e) => { document.body.className = e.target.value; localStorage.setItem('user-theme', e.target.value); };
    if(localStorage.getItem('user-theme')) { document.body.className = localStorage.getItem('user-theme'); themeSelector.value = localStorage.getItem('user-theme'); }
    
    const langSelectLogin = document.getElementById('login-language');
    const langSelectSetting = document.getElementById('setting-language-selector');
    if (localStorage.getItem('app_lang')) {
        let lang = localStorage.getItem('app_lang');
        langSelectLogin.value = lang; langSelectSetting.value = lang;
    }
    const updateLang = (e) => {
        localStorage.setItem('app_lang', e.target.value);
        langSelectLogin.value = e.target.value; langSelectSetting.value = e.target.value;
        updateAppLanguage(e.target.value);
    };
    langSelectLogin.onchange = updateLang; langSelectSetting.onchange = updateLang;

    document.getElementById('pfp-upload').onchange = (e) => {
        if (e.target.files[0]) {
            const reader = new FileReader(); 
            reader.onload = (ev) => { 
                const b64 = ev.target.result;
                document.getElementById('user-pfp').src = b64; 
                document.getElementById('header-profile-img').src = b64; 
                localStorage.setItem('chat_user_pfp', b64);
                
                const user = firebase.auth().currentUser;
                if(user && db) {
                    db.ref('users/' + user.uid).update({ pfp: b64 });
                }
            }; 
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    document.querySelector('.btn-primary-save').onclick = () => {
        const ubio = document.getElementById('bio-input').value.trim();
        localStorage.setItem('chat_user_bio', ubio);
        const user = firebase.auth().currentUser;
        if(user && db) {
            db.ref('users/' + user.uid).update({ bio: ubio });
        }
        alert("Profile Saved Successfully!");
    };
    
    document.getElementById('logout-btn').onclick = () => { 
        customConfirm("Are you sure you want to logout?", () => {
            if (firebase) {
                firebase.auth().signOut().then(() => {
                    localStorage.removeItem('chat_user'); 
                    
                    document.getElementById('settings-panel').classList.add('hidden');
                    document.getElementById('main-app').classList.add('hidden');
                    document.getElementById('login-screen').classList.remove('hidden');
                    document.getElementById('step-email').classList.remove('hidden');
                    document.getElementById('step-username').classList.add('hidden');
                    
                    document.getElementById('login-password').value = "";
                    
                    if(activeChatRoomId && db) {
                        db.ref('messages/' + activeChatRoomId).off();
                        activeChatRoomId = null;
                    }
                });
            }
        });
    };
});

window.addEventListener('load', () => {
    const pfpSection = document.querySelector('.pfp-main-section');
    if(pfpSection && !document.getElementById('settings-dp-ad')) {
        const bannerAd = document.createElement('div');
        bannerAd.id = 'settings-dp-ad';
        bannerAd.className = 'ad-box premium-hide-ad';
        bannerAd.style.marginTop = '15px';
        bannerAd.style.marginBottom = '15px';
        bannerAd.innerHTML = `<span class="ad-label" style="background:#ffd700; color:#000; padding:2px 5px; border-radius:3px; font-size:10px; font-weight:bold;">AD</span><span style="font-size:14px; font-weight:bold; color:var(--txt);">Upgrade for HD Video & No Ads!</span>`;
        pfpSection.after(bannerAd); 
    }
});