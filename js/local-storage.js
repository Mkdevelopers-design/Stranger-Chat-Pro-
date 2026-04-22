const DB_NAME = "StrangerChatDB";
const STORE_NAME = "messages";
// BUG FIX: Iska naam 'db' se badal kar 'localDbInstance' kar diya taaki Firebase se takraye nahi!
let localDbInstance; 

const LocalDB = {
    // 1. Godown ko chalu karna (Initialize)
    init: function() {
        return new Promise((resolve, reject) => {
            let request = indexedDB.open(DB_NAME, 1);

            request.onupgradeneeded = function(event) {
                localDbInstance = event.target.result;
                if (!localDbInstance.objectStoreNames.contains(STORE_NAME)) {
                    localDbInstance.createObjectStore(STORE_NAME, { keyPath: "id" }); 
                }
            };

            request.onsuccess = function(event) {
                localDbInstance = event.target.result;
                console.log("Local Godown Ready! 📦");
                resolve(localDbInstance);
            };

            request.onerror = function(event) {
                console.error("Godown Error:", event.target.error);
                reject(event.target.error);
            };
        });
    },

    // 2. Naya message aate hi yahan save hoga
    saveMessage: function(msgObj) {
        return new Promise((resolve, reject) => {
            if (!localDbInstance) return resolve("Godown is not ready yet");
            
            let transaction = localDbInstance.transaction(STORE_NAME, "readwrite");
            let store = transaction.objectStore(STORE_NAME);
            
            let request = store.put(msgObj); 

            request.onsuccess = () => resolve("Message Saved Locally!");
            request.onerror = (e) => reject(e.target.error);
        });
    },

    // 3. App khulte hi saare purane messages nikalna
    getAllMessages: function() {
        return new Promise((resolve, reject) => {
            if (!localDbInstance) return resolve([]);
            
            let transaction = localDbInstance.transaction(STORE_NAME, "readonly");
            let store = transaction.objectStore(STORE_NAME);
            let request = store.getAll(); 

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }
};
