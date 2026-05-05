// script.js - Complete Working Version for Nafass
// Primary Color: #1A6B6B (Deep Teal-Blue)
// WITH EMAIL NOTIFICATION & DUPLICATE PREVENTION

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, getDoc, getDocs, setDoc, where } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
let globalQueueTimer = 120; // 2 minutes (adjust as needed)
let queueTimerInterval = null;
let isTimerRunning = false;
const firebaseConfig = {
  apiKey: "AIzaSyDgEZ2pJfneEdOowNdcB_mcJ7dWdC4aFGc",
  authDomain: "jumia2-3193b.firebaseapp.com",
  projectId: "jumia2-3193b",
  storageBucket: "jumia2-3193b.firebasestorage.app",
  messagingSenderId: "767468341754",
  appId: "1:767468341754:web:3344b3b2e9abcb764afc43",
  measurementId: "G-BZD81JKQ2B"
};

let db;
let transactions = [];
let orders = [];
let employees = [];
let workstationUsers = [];
let chart = null;
let unsubscribeListeners = [];
let isAdminUser = false;
let workstationEmployee = "";
let currentSessionId = null;
let pendingSmsCount = 0;
let d_store = new Date();
// Initialize Firebase
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log("Firebase connected");
} catch (error) {
  console.error("Firebase error:", error);
}

function showToast(msg, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) {
    console.log(msg);
    return;
  }
  toast.textContent = msg;
  toast.style.borderLeftColor = isError ? "#dc3545" : "#1A6B6B";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function playNotificationSound() {
  try {
    const audio = document.getElementById("notificationSound");
    if (audio) {
      audio.play().catch(e => console.log("Audio play failed:", e));
    }
  } catch (e) {
    console.log("Sound error:", e);
  }
}

function updateUserDisplay() {
  const sidebarUser = document.getElementById("sidebarUser");
  if (sidebarUser) {
    sidebarUser.innerHTML = `<strong>${workstationEmployee}</strong><br><small>${isAdminUser ? "Admin" : "Staff"}</small>`;
  }
  const headerUserInfo = document.getElementById("headerUserInfo");
  if (headerUserInfo) {
    headerUserInfo.innerHTML = `<strong>${workstationEmployee} • ${isAdminUser ? "ADMIN" : "STAFF"}</strong>`;
  }
  const welcomeName = document.getElementById("welcomeName");
  if (welcomeName) welcomeName.textContent = workstationEmployee;
  const sidebarEmployeeName = document.getElementById("sidebarEmployeeName");
  if (sidebarEmployeeName) sidebarEmployeeName.textContent = workstationEmployee;
  const workstationUserName = document.getElementById("workstationUserName");
  if (workstationUserName) workstationUserName.textContent = workstationEmployee;
}

function cleanupListeners() {
  unsubscribeListeners.forEach(unsub => unsub());
  unsubscribeListeners = [];
}

window.showTab = function(tabName) {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(tab => tab.classList.add("hidden"));
  const selectedTab = document.getElementById(tabName);
  if (selectedTab) selectedTab.classList.remove("hidden");

  const titles = {
    dashboard: "Dashboard", transactions: "Transactions", orders: "Orders",
    reports: "Reports & Analytics", admin: "Admin Panel", pending: "Pending Transactions",
    timelog: "Staff Time Log"
  };
  const pageTitle = document.getElementById("pageTitle");
  if (pageTitle) pageTitle.textContent = titles[tabName] || "Dashboard";

  const buttons = document.querySelectorAll(".sidebar button");
  buttons.forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById("btn-" + tabName);
  if (activeBtn) activeBtn.classList.add("active");

  if (tabName === "pending" && db) window.loadPendingTab();
  if (tabName === "reports") window.generateReport();
  if (tabName === "timelog") window.loadTimeLog();
};

function checkWorkstationAdmin() {
  const isAdmin = localStorage.getItem("current_employee_isAdmin");
  isAdminUser = isAdmin === "true";
  workstationEmployee = localStorage.getItem("current_employee") || "Demo User";
  
  const adminOnlyElements = document.querySelectorAll(".admin-only");
  adminOnlyElements.forEach(el => {
    if (el) el.style.display = isAdminUser ? "" : "none";
  });
  
  const readonlyNotice = document.getElementById("readonlyNotice");
  const adminNotice = document.getElementById("adminNotice");
  
  if (readonlyNotice) readonlyNotice.style.display = isAdminUser ? "none" : "block";
  if (adminNotice) adminNotice.style.display = isAdminUser ? "block" : "none";
  
  updateUserDisplay();
}

// ====================== ACTIVE SESSIONS + TIME LOGGING ======================

let currentTimeLogId = null;

async function registerActiveSession() {
  if (!db || !workstationEmployee) return;
  currentSessionId = `${workstationEmployee}@nafass_member`;

  try {
    await setDoc(doc(db, "active_sessions", currentSessionId), {
      username: workstationEmployee,
      isAdmin: isAdminUser,
      sessionId: currentSessionId,
      loggedInAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      status: "active"
    });

    // Write a new time_logs entry for this login
    const logRef = await addDoc(collection(db, "time_logs"), {
      username: workstationEmployee,
      isAdmin: isAdminUser,
      loginTime: serverTimestamp(),
      logoutTime: null,
      date: new Date().toISOString().split("T")[0]  // YYYY-MM-DD
    });
    currentTimeLogId = logRef.id;
    console.log("Time log started:", currentTimeLogId);
  } catch (error) {
    console.error("Session registration error:", error);
  }
}

async function updateLastActive() {
  if (!db || !currentSessionId) return;
  try {
    await updateDoc(doc(db, "active_sessions", currentSessionId), {
      lastActive: serverTimestamp()
    });
  } catch (error) {
    console.error("Update lastActive error:", error);
  }
}

async function unregisterActiveSession() {
  if (!db || !currentSessionId) return;
  try {
    await deleteDoc(doc(db, "active_sessions", currentSessionId));

    // Write logout time to time_logs
    if (currentTimeLogId) {
      await updateDoc(doc(db, "time_logs", currentTimeLogId), {
        logoutTime: serverTimestamp()
      });
      console.log("Time log closed:", currentTimeLogId);
      currentTimeLogId = null;
    }
  } catch (error) {
    console.error("Session unregister error:", error);
  }
}

// ====================== LOAD TIME LOG TAB ======================

window.loadTimeLog = async function() {
  if (!isAdminUser) return;
  const tbody = document.getElementById("timelogBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const dateFilter = document.getElementById("timelogDateFilter");
    const selectedDate = dateFilter ? dateFilter.value : "";

    const logsRef = collection(db, "time_logs");
    const q = selectedDate
      ? query(logsRef, where("date", "==", selectedDate), orderBy("loginTime", "desc"))
      : query(logsRef, orderBy("loginTime", "desc"));

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-light);">No login records found</td></tr>`;
      return;
    }

    let html = "";
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      const loginTime  = d.loginTime?.toDate  ? d.loginTime.toDate()  : null;
      const logoutTime = d.logoutTime?.toDate ? d.logoutTime.toDate() : null;

      const fmtTime = (dt) => dt ? dt.toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit", second:"2-digit"}) : "—";
      const fmtDate = (dt) => dt ? dt.toLocaleDateString("en-GB", {weekday:"short", day:"numeric", month:"short", year:"numeric"}) : d.date || "—";

      let duration = "Active now";
      let durationColor = "#28a745";
      if (loginTime && logoutTime) {
        const ms = logoutTime - loginTime;
        const hrs = Math.floor(ms / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        duration = hrs > 0 ? `${hrs}h ${mins}m` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        durationColor = "var(--text)";
      }

      html += `
        <tr>
          <td><i class="fas fa-user" style="color:#1A6B6B;margin-right:6px;"></i>${d.username || "Unknown"}</td>
          <td style="color:#28a745;font-weight:600;">${fmtTime(loginTime)}</td>
          <td style="color:${logoutTime ? '#dc3545' : '#ff7a00'};font-weight:600;">${logoutTime ? fmtTime(logoutTime) : '<span style="background:#fff3cd;color:#856404;padding:2px 8px;border-radius:20px;font-size:11px;">Still logged in</span>'}</td>
          <td style="color:${durationColor};font-weight:600;">${duration}</td>
          <td style="color:var(--text-light);font-size:12px;">${fmtDate(loginTime)}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
  } catch (err) {
    console.error("loadTimeLog error:", err);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#dc3545;">Error loading time log</td></tr>`;
  }
};

// Clean up inactive sessions
setInterval(() => {
  unregisterActiveSession();
  registerActiveSession();
  updateLastActive();
}, 60000);

// ====================== UPDATE PENDING COUNT ======================

async function updatePendingCount() {
  if (!db) return;
  try {
    const pendingRef = collection(db, "pending_sms");
    const q = query(pendingRef, where("status", "==", "waiting"));
    const snapshot = await getDocs(q);
    pendingSmsCount = snapshot.size;
    const countSpan = document.getElementById("pendingCount");
    if (countSpan) countSpan.textContent = pendingSmsCount;
    // Update sidebar badge
    const sideBadge = document.getElementById("pendingSideBadge");
    if (sideBadge) {
      if (pendingSmsCount > 0) {
        sideBadge.style.display = "block";
        sideBadge.textContent = pendingSmsCount;
      } else {
        sideBadge.style.display = "none";
      }
    }
  } catch (err) {
    console.log("Update count error:", err);
  }
}

// ====================== EMAIL NOTIFICATION FUNCTION ======================

window.sendUnclaimedTransactionEmail = async function(smsData, responses, activeUsers, isAuto) {
  try {
    const adminEmail = "cletusmawa@gmail.com";
    
    const now = new Date();
    const dateTimeStr = now.toLocaleString('en-GB');
    
    let responseList = "";
    for (const [user, resp] of Object.entries(responses)) {
      const responseText = resp.response === 'yes' ? 'YES (claimed)' : 'NO (declined)';
      const autoText = resp.isAuto ? ' (Auto-timeout)' : '';
      const manualText = resp.manual ? ' (Manual from queue)' : '';
      responseList += `${user}: ${responseText}${autoText}${manualText}\n`;
    }
    
    const respondedUsers = Object.keys(responses);
    const notResponded = activeUsers.filter(u => !respondedUsers.includes(u));
    let pendingUsers = "";
    if (notResponded.length > 0) {
      pendingUsers = "\n\n⚠️ Users who did NOT respond:\n" + notResponded.map(u => `  - ${u}`).join("\n");
    }
    
    const subject = `⚠️ UNCLAIMED TRANSACTION - GHS ${smsData.amount} - Nafass System`;
    
    const body = `
===========================================
  UNCLAIMED TRANSACTION ALERT
===========================================

📅 Date/Time: ${dateTimeStr}
💰 Amount: GHS ${smsData.amount}
👤 Sent By: ${smsData.sentBy || 'Unknown'}
📝 Reference: ${smsData.ref || 'Transfer'}
📱 Transaction Type: ${smsData.transactionType || 'received'}

===========================================
  USER RESPONSES
===========================================

${responseList}

===========================================
  ACTIVE USERS AT TIME
===========================================

Total active users: ${activeUsers.length}
${activeUsers.map(u => `  - ${u}`).join("\n")}
${pendingUsers}

===========================================
  ADDITIONAL INFO
===========================================

• Auto-timeout occurred: ${isAuto ? 'YES' : 'NO'}
• Original SMS text: ${smsData.originalText || 'N/A'}

===========================================
  ACTION REQUIRED
===========================================

This transaction was not claimed by any active user.
Please investigate and manually add the transaction if needed.

To manually add:
1. Go to Transactions tab
2. Click "New Transaction"
3. Enter amount, sender, and reference above

===========================================
    `;
    
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    
    window.location.href = `mailto:${adminEmail}?subject=${encodedSubject}&body=${encodedBody}`;
    
    console.log("Email prepared for admin");
    
  } catch (error) {
    console.error("Email error:", error);
  }
};

// ====================== FIXED POPUP SYSTEM ======================

let currentPopupSmsId = null;
let popupTimerInterval = null;
let popupCheckerInterval = null;

function startPopupChecker() {
  if (popupCheckerInterval) clearInterval(popupCheckerInterval);
  
  popupCheckerInterval = setInterval(async () => {
    if (!db || !workstationEmployee) return;
    
    try {
      const pendingRef = collection(db, "pending_sms");
      const q = query(pendingRef, where("status", "==", "waiting"));
      const snapshot = await getDocs(q);
      
      await updatePendingCount();
      
      if (snapshot.empty) {
        stopGlobalTimer();
        return;
      }

      // Start global timer if there are items and timer isn't running
      startGlobalTimer();

      // Show the popup for the FIRST item in the queue that this user hasn't responded to
      for (const doc of snapshot.docs) {
        const sms = { id: doc.id, ...doc.data() };
        if (sms.responses && sms.responses[workstationEmployee]) continue;
        
        // Show popup logic here (if you use a fixed UI element)
        // currentPopupSmsId = sms.id; 
        break; 
      }
    } catch (err) {
      console.log("Popup checker error:", err);
    }
  }, 3000);
}

function startGlobalTimer() {
  if (globalTimerInterval) return; // Already running

  globalTimerSeconds = 60; // Reset to 60 seconds
  globalTimerInterval = setInterval(async () => {
    globalTimerSeconds--;
    
    // Update a UI element if you have one (e.g., in the header or sidebar)
    const timerDisplay = document.getElementById("globalTimerDisplay");
    if (timerDisplay) timerDisplay.textContent = `Auto-resolving in: ${globalTimerSeconds}s`;

    if (globalTimerSeconds <= 0) {
      await autoResolveAllPending();
      stopGlobalTimer();
    }
  }, 1000);
}

function stopGlobalTimer() {
  clearInterval(globalTimerInterval);
  globalTimerInterval = null;
  const timerDisplay = document.getElementById("globalTimerDisplay");
  if (timerDisplay) timerDisplay.textContent = "";
}

async function autoResolveAllPending() {
  console.log("Global timer expired. Auto-resolving pending queue...");
  try {
    const q = query(collection(db, "pending_sms"), where("status", "==", "waiting"));
    const snapshot = await getDocs(q);
    
    for (const docSnap of snapshot.docs) {
      currentPopupSmsId = docSnap.id; 
      // Forces a 'no' response as an 'Auto-timeout'
      await respondToSmsFixed("no", true); 
    }
    showToast("Global timer: Unclaimed items sent to admin.");
  } catch (err) {
    console.error("Auto-resolve error:", err);
  }
}


window.closeFixedPopup = function() {
  const popup = document.getElementById("fixedSmsPopup");
  if (popup) popup.remove();
  if (popupTimerInterval) {
    clearInterval(popupTimerInterval);
    popupTimerInterval = null;
  }
  currentPopupSmsId = null;
};

async function respondToSmsFixed(response, isAuto = false) {
  if (!currentPopupSmsId) return;
  
  const smsId = currentPopupSmsId;
 
  
  if (!db) return;
  
  try {
    const smsRef = doc(db, "pending_sms", smsId);
    const smsDoc = await getDoc(smsRef);
    
    if (!smsDoc.exists()) {
      showToast("Transaction no longer available");
      return;
    }
    
    const smsData = smsDoc.data();
    
    if (response === "yes") {
      await addDoc(collection(db, "transactions"), {
        amount: smsData.amount,
        sentBy: smsData.sentBy,
        receivedBy: workstationEmployee,
        ref: smsData.ref,
        transactionType: smsData.transactionType || "received",
        date: new Date().toLocaleString('en-GB'),
        timestamp: serverTimestamp()
      });
      
      await deleteDoc(smsRef);
      
      showToast(`💰 GHS ${smsData.amount} recorded by ${workstationEmployee}`);
      await updatePendingCount();
      
    } else if (response === "no") {
      const responses = smsData.responses || {};
      responses[workstationEmployee] = { response: "no", timestamp: new Date().toISOString(), isAuto: isAuto };
      
      const sessionsRef = collection(db, "active_sessions");
      const sessionsSnap = await getDocs(sessionsRef);
      const activeUsers = [];
      sessionsSnap.forEach(doc => {
        const data = doc.data();
        if (data.username && data.status === "active") activeUsers.push(data.username);
      });
      
      const allResponded = activeUsers.every(user => responses[user]);
      
      if (allResponded || isAuto) {
        await window.sendUnclaimedTransactionEmail(smsData, responses, activeUsers, isAuto);
        
        await addDoc(collection(db, "transactions"), {
          amount: smsData.amount,
          sentBy: smsData.sentBy,
          receivedBy: "Unknown",
          ref: smsData.ref,
          transactionType: smsData.transactionType || "received",
          date: new Date().toLocaleString('en-GB'),
          timestamp: serverTimestamp(),
          note: "Unclaimed - all users declined",
          declinedBy: responses,
          activeUsersAtTime: activeUsers
        });
        
        await deleteDoc(smsRef);
        showToast(`⚠️ GHS ${smsData.amount} - Unclaimed. Email sent to admin.`);
        await updatePendingCount();
      } else {
        await updateDoc(smsRef, { responses: responses });
        showToast(`Response recorded. Waiting for others...`);
      }
    }
    
    if (window.shownPopupIds) window.shownPopupIds.delete(smsId);
    
  } catch (err) {
    console.error("Response error:", err);
    showToast("Error processing response", true);
  }
}

// ====================== MANUAL CONFIRMATION FROM QUEUE ======================

window.manualConfirmSms = async function(smsId, response) {
  if (!db) {
    showToast("Database not connected", true);
    return;
  }
  
  try {
    const smsRef = doc(db, "pending_sms", smsId);
    const smsDoc = await getDoc(smsRef);
    
    if (!smsDoc.exists()) {
      showToast("Transaction no longer exists", true);
      if (window.loadPendingTab) window.loadPendingTab();
      return;
    }
    
    const smsData = smsDoc.data();
    
    if (response === "yes") {
      await addDoc(collection(db, "transactions"), {
        amount: smsData.amount,
        sentBy: smsData.sentBy,
        receivedBy: workstationEmployee,
        ref: smsData.ref,
        transactionType: smsData.transactionType || "received",
        date: new Date().toLocaleString('en-GB'),
        timestamp: serverTimestamp(),
        note: "Manually confirmed from queue"
      });
      
      await deleteDoc(smsRef);
      
      showToast(`💰 GHS ${smsData.amount} recorded by ${workstationEmployee} (Manual)`);
      playNotificationSound();
      await updatePendingCount();
      
    } else if (response === "no") {
      const responses = smsData.responses || {};
      responses[workstationEmployee] = { 
        response: "no", 
        timestamp: new Date().toISOString(), 
        isAuto: false,
        manual: true 
      };
      
      const sessionsRef = collection(db, "active_sessions");
      const sessionsSnap = await getDocs(sessionsRef);
      const allActiveUsers = [];
      sessionsSnap.forEach(d => {
        const data = d.data();
        if (data.username && data.status === "active") allActiveUsers.push(data.username);
      });
      // Make sure current user is always included
      if (!allActiveUsers.includes(workstationEmployee)) allActiveUsers.push(workstationEmployee);
      
      const allResponded = allActiveUsers.every(user => responses[user]);
      
      if (allResponded) {
        await window.sendUnclaimedTransactionEmail(smsData, responses, allActiveUsers, false);
        
        await addDoc(collection(db, "transactions"), {
          amount: smsData.amount,
          sentBy: smsData.sentBy,
          receivedBy: "Unknown",
          ref: smsData.ref,
          transactionType: smsData.transactionType || "received",
          date: new Date().toLocaleString('en-GB'),
          timestamp: serverTimestamp(),
          note: "Unclaimed - manually declined by all",
          declinedBy: responses,
          activeUsersAtTime: allActiveUsers
        });
        
        await deleteDoc(smsRef);
        showToast(`⚠️ GHS ${smsData.amount} - Unclaimed. Email sent to admin.`);
        await updatePendingCount();
      } else {
        await updateDoc(smsRef, { responses: responses });
        showToast(`Response recorded. Waiting for others...`);
      }
    }
    
    // Refresh the pending tab
    const _pt = document.getElementById("pending");
    if (_pt && !_pt.classList.contains("hidden")) window.loadPendingTab();
    
  } catch (err) {
    console.error("Manual confirmation error:", err);
    showToast("Error processing: " + err.message, true);
  }
};

// ====================== SMS PARSER WITH DUPLICATE PREVENTION ======================

// Track processed SMS to prevent duplicates
const processedSmsHashes = new Set();

// Track which pending SMS IDs have already been announced by voice
const announcedSmsIds = new Set();

window.announceSms = function announceSms(amount, ref) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const text = `New payment received. GHS ${amount} from ${ref}.`;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.88;
  utterance.pitch = 1.15;
  utterance.volume = 1;

  function pickVoiceAndSpeak() {
    const voices = window.speechSynthesis.getVoices();
    const femaleKeywords = ["female","woman","zira","susan","samantha","victoria","karen","moira","fiona","tessa","veena","allison","ava","sara","serena"];
    let voice = voices.find(v => v.lang.startsWith("en") && femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
    if (!voice) voice = voices.find(v => v.lang === "en-GB" && v.localService);
    if (!voice) voice = voices.find(v => v.lang === "en-US" && v.localService);
    if (!voice) voice = voices.find(v => v.lang.startsWith("en"));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  if (window.speechSynthesis.getVoices().length > 0) {
    pickVoiceAndSpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      pickVoiceAndSpeak();
    };
    window.speechSynthesis.getVoices();
  }
}

window.addSMS = async function(smsText) {
    if (!smsText || typeof smsText !== "string") return;

    const originalText = smsText.trim();
    const lower = originalText.toLowerCase();

    console.log("RAW SMS:", originalText);
    
    // Create a unique hash for this SMS to prevent duplicates (no Date.now so same text = same hash)
    const smsHash = btoa(unescape(encodeURIComponent(originalText.substring(0, 100))));
    
    // Check if already processing this SMS recently
    if (processedSmsHashes.has(smsHash)) {
        console.log("Duplicate SMS detected, skipping...");
        return;
    }
    
    // Add to processed set and remove after 5 seconds
    processedSmsHashes.add(smsHash);
    setTimeout(() => processedSmsHashes.delete(smsHash), 5000);

    let transactionType = "received";
    
    if (lower.includes("received") || lower.includes("payment received")) {
        transactionType = "received";
    } else if (lower.includes("sent") || lower.includes("transferred")) {
        transactionType = "sent";
    } else if (lower.includes("withdrawn") || lower.includes("withdrawal")) {
        transactionType = "withdrawn";
    }

    if (!lower.includes("ghs")) {
        console.log("Ignored: Not a money transaction");
        return;
    }

    try {
        let amount = null;
        let sentBy = "Unknown";
        let ref = "Unknown";

        let amountMatch = originalText.match(/GHS\s*([\d,]+\.?\d*)/i);
        if (amountMatch) amount = parseFloat(amountMatch[1].replace(/,/g, ''));

        let txMatch = originalText.match(/Transaction ID:\s*(\d+)/i);
        if (txMatch && txMatch[1]) {
            sentBy = txMatch[1].trim();
        }
        
        if (sentBy === "Unknown") {
            let refMatch = originalText.match(/Reference:\s*(\d+)/i);
            if (refMatch && refMatch[1]) {
                sentBy = refMatch[1].trim();
            }
        }
        
        if (sentBy === "Unknown") {
            let phoneMatch = originalText.match(/(\d{10,12})/);
            if (phoneMatch && phoneMatch[1]) {
                sentBy = phoneMatch[1].trim();
            }
        }

        let nameMatch = originalText.match(/from\s+([A-Za-z][A-Za-z\s]+?)(?=\s+Current|\s+Balance|,|$)/i);
        if (nameMatch && nameMatch[1]) {
            ref = nameMatch[1].trim();
        }
        
        if (ref === "Unknown") {
            let nameMatch2 = originalText.match(/from\s+([A-Z][A-Za-z\s]+)/i);
            if (nameMatch2 && nameMatch2[1]) {
                ref = nameMatch2[1].trim();
            }
        }

        if (!amount || isNaN(amount) || amount <= 0) {
            showToast("Could not detect amount in SMS");
            return;
        }

        if (sentBy === "Unknown") {
            sentBy = "Mobile Money";
        }
        if (ref === "Unknown") {
            ref = "Transfer";
        }

        console.log(`✅ Adding to pending queue - Amount: ${amount}, Sender: ${sentBy}, Ref: ${ref}`);

        // Use a time-bucketed ID (2-minute buckets) to prevent duplicates from same SMS
        const timeBucket = Math.floor(Date.now() / 120000); // changes every 2 minutes
        const uniqueId = `${ref.replace(/[^a-zA-Z0-9_-]/g, '_')}_${sentBy.replace(/[^a-zA-Z0-9_-]/g, '_')}_${amount}_${timeBucket}`;
        const pendingRef = doc(db, "pending_sms", uniqueId);
        
        // Check if similar transaction already exists (within last 10 seconds)
        const tenSecondsAgo = new Date(Date.now() - 10000);
        const existingQuery = query(
            collection(db, "pending_sms"), 
            where("amount", "==", amount),
            where("sentBy", "==", sentBy)
        );
        const existingSnapshot = await getDocs(existingQuery);
        
        let duplicateFound = false;
        existingSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.timestamp && data.timestamp.toDate && data.timestamp.toDate() > tenSecondsAgo) {
                duplicateFound = true;
            }
        });
        
        if (duplicateFound) {
            console.log("Similar transaction already pending, skipping duplicate");
            return;
        }
        
        await setDoc(pendingRef, {
            amount: amount,
            sentBy: sentBy,
            ref: ref,
            transactionType: transactionType,
            status: "waiting",
            responses: {},
            originalText: originalText,
            timestamp: serverTimestamp()
        });
        
        console.log(`✅ Added with ID: ${uniqueId}`);
        await updatePendingCount();

    } catch (error) {
        console.error("SMS Error:", error);
        showToast("Error processing SMS");
    }
};

// ====================== PENDING TAB REAL-TIME LISTENER ======================

function startPendingTabListener() {
  if (!db) return;
  const q = query(collection(db, "pending_sms"), where("status", "==", "waiting"));
  const unsub = onSnapshot(q, (snapshot) => {
    // Announce any brand-new items
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const sms = change.doc.data();
        const id = change.doc.id;
        if (!announcedSmsIds.has(id)) {
          announcedSmsIds.add(id);
          const label = sms.ref && sms.ref !== "Transfer" ? sms.ref : (sms.sentBy || "unknown sender");
          // Small delay so voices are loaded
          setTimeout(() => announceSms(sms.amount, label), 500);
          playNotificationSound();
        }
      }
    });
    // Re-render the pending tab if it's visible
    const pendingTab = document.getElementById("pending");
    if (pendingTab && !pendingTab.classList.contains("hidden")) {
      renderPendingTab(snapshot);
    }
    updatePendingCount();
  }, err => console.log("Pending tab listener error:", err));
  unsubscribeListeners.push(unsub);
}

function renderPendingTab(snapshot) {
  const container = document.getElementById("pendingTabBody");
  if (!container) return;

  if (!snapshot || snapshot.empty) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-light);">
        <i class="fas fa-check-circle" style="font-size: 52px; color: #28a745; display: block; margin-bottom: 15px;"></i>
        <h3 style="margin: 0 0 8px;">All Clear!</h3>
        <p style="margin: 0;">No pending transactions right now.</p>
      </div>`;
    return;
  }

  let html = "";
  snapshot.forEach(docSnap => {
    const sms = docSnap.data();
    const smsId = docSnap.id;
    const responses = sms.responses || {};
    const currentUserResponse = responses[workstationEmployee];

    let responsesList = Object.entries(responses).map(([user, resp]) => {
      const isYes = resp.response === "yes";
      return `<span style="display:inline-block;padding:2px 9px;margin:2px;border-radius:20px;font-size:11px;background:${isYes ? "#d4edda" : "#f8d7da"};color:${isYes ? "#155724" : "#721c24"};">${user}: ${isYes ? "✅ YES" : "❌ NO"}</span>`;
    }).join("") || `<span style="color:var(--text-light);font-size:12px;">No responses yet</span>`;

    const timeAgo = sms.timestamp ? (() => {
      const diff = Math.floor((Date.now() - sms.timestamp.toDate()) / 1000);
      if (diff < 60) return `${diff}s ago`;
      if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
      return `${Math.floor(diff/3600)}h ago`;
    })() : "";

    html += `
      <div class="pending-card" data-search="${(sms.amount + " " + (sms.sentBy||"") + " " + (sms.ref||"")).toLowerCase()}" style="background:var(--card);border-radius:16px;padding:18px;margin-bottom:14px;border:1px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,0.05);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <span style="background:#ff7a00;color:white;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;">
            <i class="fas fa-clock"></i> WAITING ${timeAgo ? "• " + timeAgo : ""}
          </span>
          <span style="font-size:24px;font-weight:800;color:#28a745;">GHS ${sms.amount}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;padding:10px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);font-size:13px;">
          <div><i class="fas fa-user" style="color:var(--text-light);width:18px;"></i> <strong>From:</strong> ${sms.sentBy || "Unknown"}</div>
          <div><i class="fas fa-hashtag" style="color:var(--text-light);width:18px;"></i> <strong>Ref:</strong> ${sms.ref || "Transfer"}</div>
          <div><i class="fas fa-tag" style="color:var(--text-light);width:18px;"></i> <strong>Type:</strong> <span style="text-transform:capitalize;">${sms.transactionType || "received"}</span></div>
          <div><i class="fas fa-user-check" style="color:var(--text-light);width:18px;"></i> <strong>You:</strong>
            <span style="font-weight:600;${currentUserResponse ? (currentUserResponse.response === "yes" ? "color:#28a745;" : "color:#dc3545;") : "color:#ffc107;"}">
              ${currentUserResponse ? (currentUserResponse.response === "yes" ? "✅ YES" : "❌ NO") : "⏳ Pending"}
            </span>
          </div>
        </div>
        <div style="font-size:12px;background:var(--bg);padding:8px 12px;border-radius:10px;margin-bottom:12px;">
          <i class="fas fa-users"></i> <strong>Responses:</strong>
          <div style="margin-top:6px;">${responsesList}</div>
        </div>
        ${!currentUserResponse ? `
          <div style="display:flex;gap:10px;">
            <button onclick="window.manualConfirmSms('${smsId}', 'yes')" style="flex:1;padding:11px;border-radius:40px;font-weight:600;border:none;background:linear-gradient(135deg,#28a745,#1e7e34);color:white;cursor:pointer;font-size:13px;">
              <i class="fas fa-check-circle"></i> YES, I Received
            </button>
            <button onclick="window.manualConfirmSms('${smsId}', 'no')" style="flex:1;padding:11px;border-radius:40px;font-weight:600;border:none;background:linear-gradient(135deg,#dc3545,#bd2130);color:white;cursor:pointer;font-size:13px;">
              <i class="fas fa-times-circle"></i> NO, Not Mine
            </button>
          </div>
        ` : `
          <div style="text-align:center;padding:9px;background:${currentUserResponse.response === "yes" ? "#d4edda" : "#f8d7da"};border-radius:10px;font-size:12px;color:${currentUserResponse.response === "yes" ? "#155724" : "#721c24"};">
            <i class="fas ${currentUserResponse.response === "yes" ? "fa-check-circle" : "fa-times-circle"}"></i>
            You responded: ${currentUserResponse.response === "yes" ? "YES" : "NO"}${currentUserResponse.isAuto ? " (Auto-timeout)" : ""}
          </div>
        `}
      </div>`;
  });
  container.innerHTML = html;
}

// Called when switching to pending tab to load latest data
window.loadPendingTab = async function() {
  const container = document.getElementById("pendingTabBody");
  if (container) container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-light);"><i class="fas fa-spinner fa-spin" style="font-size:28px;"></i><p>Loading...</p></div>`;
  const searchInput = document.getElementById("pendingSearchInput");
  if (searchInput) searchInput.value = "";
  const q = query(collection(db, "pending_sms"), where("status", "==", "waiting"));
  const snapshot = await getDocs(q);
  renderPendingTab(snapshot);
};

window.filterPendingTab = function(term) {
  const cards = document.querySelectorAll("#pendingTabBody .pending-card");
  const q = term.toLowerCase().trim();
  let visibleCount = 0;
  cards.forEach(card => {
    const text = card.dataset.search || "";
    const match = !q || text.includes(q);
    card.style.display = match ? "" : "none";
    if (match) visibleCount++;
  });
  // Show no-results message if needed
  let noResult = document.getElementById("pendingNoResult");
  if (visibleCount === 0 && q) {
    if (!noResult) {
      noResult = document.createElement("div");
      noResult.id = "pendingNoResult";
      noResult.style = "text-align:center;padding:30px;color:var(--text-light);font-size:14px;";
      noResult.innerHTML = `<i class="fas fa-search" style="font-size:28px;display:block;margin-bottom:10px;"></i>No results for "<strong>${term}</strong>"`;
      document.getElementById("pendingTabBody").appendChild(noResult);
    } else {
      noResult.innerHTML = `<i class="fas fa-search" style="font-size:28px;display:block;margin-bottom:10px;"></i>No results for "<strong>${term}</strong>"`;
      noResult.style.display = "";
    }
  } else if (noResult) {
    noResult.style.display = "none";
  }
};





// Track processed queue items
const processedQueueItems = new Set();

function startSMSQueueListener() {
  if (!db) return;
  const smsQueueRef = collection(db, "sms_queue");
  const unsub = onSnapshot(smsQueueRef, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const docId = change.doc.id;
        
        // Check if already processed this queue item
        if (processedQueueItems.has(docId)) {
          console.log("Duplicate queue item, skipping:", docId);
          return;
        }
        
        const data = change.doc.data();
        if (data.smsText) {
          // Mark as processing
          processedQueueItems.add(docId);
          
          // Remove from set after 10 seconds
          setTimeout(() => processedQueueItems.delete(docId), 10000);
          
          window.addSMS(data.smsText);
          deleteDoc(change.doc.ref).catch(() => {});
        }
      }
    });
  }, () => console.log("SMS listener error"));
  unsubscribeListeners.push(unsub);
}

// ====================== REAL-TIME LISTENERS ======================
function setupRealTimeListeners() {
  if (!db) {
    showToast("Waiting for connection...", true);
    setTimeout(setupRealTimeListeners, 3000);
    return;
  }
  
  cleanupListeners();

  const transQ = query(collection(db, "transactions"), orderBy("timestamp", "desc"));
  unsubscribeListeners.push(onSnapshot(transQ, (snap) => {
    transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTransactions();
    updateDashboardStats();
    updateAllTotals();
    updateAdminStats();
  }, (err) => console.log("Trans error:", err)));

  const ordersQ = query(collection(db, "orders"), orderBy("timestamp", "desc"));
  unsubscribeListeners.push(onSnapshot(ordersQ, (snap) => {
    orders = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
    renderOrders();
    updateDashboardStats();
  }, (err) => console.log("Orders error:", err)));

  unsubscribeListeners.push(onSnapshot(collection(db, "employees"), (snap) => {
    employees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEmployees();
    updateDashboardStats();
  }, (err) => console.log("Employees error:", err)));

  startSMSQueueListener();
  // startPopupChecker(); // removed - using pending tab instead
  startPendingTabListener();
  updatePendingCount();
}

// ====================== RENDER FUNCTIONS ======================
function getTransactionTypeBadge(type) {
  if (type === "received") {
    return '<span class="type-badge type-received">💰 Received</span>';
  } else if (type === "sent") {
    return '<span class="type-badge type-sent">📤 Sent</span>';
  } else if (type === "withdrawn") {
    return '<span class="type-badge type-withdrawn">🏧 Withdrawn</span>';
  }
  return '<span class="type-badge type-received">💰 Received</span>';
}

function renderTransactions() {
  const tbody = document.getElementById("transactionsBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No transactions</td></tr>';
    return;
  }
  transactions.forEach(t => {
    const transactionType = t.transactionType || "received";
    tbody.innerHTML += `
      <tr>
        <td><strong>GHS ${t.amount}</strong></td>
        <td>${t.sentBy || '-'}</td>
        <td>${getTransactionTypeBadge(transactionType)}</td>
        <td><strong>${t.receivedBy || '-'}</strong></td>
        <td>${t.ref || '-'}</td>
        <td>${t.date || '-'}</td>
      </tr>
    `;
  });
}

function renderOrders() {
  const tbody = document.getElementById("ordersBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No orders</td></tr>';
    return;
  }
  orders.forEach(o => {
    const statusHTML = o.status === "pending" ? '<span class="status pending">⏳ Pending</span>' : '<span class="status taken">✅ Taken</span>';
    const actionHTML = o.status === "pending" && isAdminUser ? 
      `<button onclick="window.toggleOrderStatus('${o.firestoreId}')" class="small-btn">Mark Taken</button>` : 
      (o.status === "pending" ? '<span class="status pending">⏳ Pending</span>' : '<span class="status taken">✅ Taken</span>');
    tbody.innerHTML += `
      <tr>
        <td>${o.orderId || '-'}</td>
        <td>${o.name || '-'}</td>
        <td>${o.number || '-'}</td>
        <td>${statusHTML}</td>
        <td>${actionHTML}</td>
      </tr>
    `;
  });
}

async function renderEmployees() {
  const tbody = document.getElementById("employeesListBody");
  if (!tbody) return;
  
  const users = await loadWorkstationUsersFromFirebase();
  
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No users</td></tr>';
    return;
  }
  
  tbody.innerHTML = users.map(user => `
    <tr>
      <td>${user.name}</td>
      <td>${new Date(user.created).toLocaleDateString()}</td>
      <td>${user.isAdmin ? '<span style="color: #1A6B6B; font-weight: bold;">Admin</span>' : 'Staff'}</td>
      <td><button onclick="window.deleteWorkstationUser('${user.name.replace(/'/g, "\\'")}')" class="small-btn remove-btn">Delete</button></td>
    </tr>
  `).join('');
}

// ====================== DASHBOARD & STATS ======================
function updateDashboardStats() {
  const totalReceived = transactions.filter(t => (t.transactionType || "received") === "received").reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalEl = document.getElementById("total");
  if (totalEl) totalEl.innerText = totalReceived.toLocaleString();
  
  const transCountEl = document.getElementById("transCount");
  if (transCountEl) transCountEl.innerText = transactions.length;
  
  const pendingEl = document.getElementById("pendingOrders");
  if (pendingEl) pendingEl.innerText = orders.filter(o => o.status === "pending").length;
  
  const empCountEl = document.getElementById("empCount");
  if (empCountEl) empCountEl.innerText = workstationUsers.length;

  const recentBody = document.getElementById("recentBody");
  if (recentBody) {
    recentBody.innerHTML = "";
    transactions.slice(0, 5).forEach(t => {
      const icon = (t.transactionType || "received") === "received" ? "💰" : (t.transactionType === "sent" ? "📤" : "🏧");
      recentBody.innerHTML += `
        <tr>
          <td><strong>GHS ${t.amount}</strong></td>
          <td>${t.sentBy || '-'}</td>
          <td>${icon} ${(t.transactionType || "received").toUpperCase()}</td>
          <td>${t.date || '-'}</td>
        </tr>
      `;
    });
  }
}

function updateAllTotals() {
  const totalReceived = transactions.filter(t => (t.transactionType || "received") === "received").reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalSent = transactions.filter(t => t.transactionType === "sent").reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalWithdrawn = transactions.filter(t => t.transactionType === "withdrawn").reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const netBalance = totalReceived - totalSent - totalWithdrawn;
  
  const adminTotal = document.getElementById("adminTotalReceived");
  if (adminTotal) adminTotal.textContent = `GHS ${totalReceived.toLocaleString()}`;
  const adminSent = document.getElementById("adminTotalSent");
  if (adminSent) adminSent.textContent = `GHS ${totalSent.toLocaleString()}`;
  const adminWithdrawn = document.getElementById("adminTotalWithdrawn");
  if (adminWithdrawn) adminWithdrawn.textContent = `GHS ${totalWithdrawn.toLocaleString()}`;
  const adminNet = document.getElementById("adminNetBalance");
  if (adminNet) {
    adminNet.textContent = `GHS ${netBalance.toLocaleString()}`;
    adminNet.style.color = netBalance >= 0 ? "#28a745" : "#dc3545";
  }
  
  const today = new Date();
  const todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();
  let dailyTotal = 0, monthlyTotal = 0;

  transactions.forEach(t => {
    if ((t.transactionType || "received") !== "received") return;
    const amount = Number(t.amount) || 0;

    // Robust date extraction: Firestore Timestamp → JS Date string → en-GB string
    let txD = null;
    if (t.timestamp && t.timestamp.toDate) {
      txD = t.timestamp.toDate();
    } else if (t.timestamp && typeof t.timestamp === "string") {
      const p = new Date(t.timestamp); if (!isNaN(p)) txD = p;
    }
    if (!txD && t.date) {
      const dp = t.date.split(",")[0].trim();
      const [dd, mm, yyyy] = dp.split("/").map(Number);
      if (dd && mm && yyyy) txD = new Date(yyyy, mm - 1, dd);
    }
    if (!txD) return;

    if (txD.getFullYear() === todayY && txD.getMonth() === todayM && txD.getDate() === todayD) dailyTotal += amount;
    if (txD.getFullYear() === todayY && txD.getMonth() === todayM) monthlyTotal += amount;
  });
  
  const dailyEl = document.getElementById("dailyTotal");
  if (dailyEl) dailyEl.textContent = dailyTotal.toLocaleString();
  const monthlyEl = document.getElementById("monthlyTotal");
  if (monthlyEl) monthlyEl.textContent = monthlyTotal.toLocaleString();
}

function updateAdminStats() {
  const totalReceived = transactions.filter(t => (t.transactionType || "received") === "received").reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalSent = transactions.filter(t => t.transactionType === "sent").reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalWithdrawn = transactions.filter(t => t.transactionType === "withdrawn").reduce((a, t) => a + (Number(t.amount) || 0), 0);
  
  const statTotalReceived = document.getElementById("statTotalReceived");
  if (statTotalReceived) statTotalReceived.textContent = `GHS ${totalReceived.toLocaleString()}`;
  const statTotalSent = document.getElementById("statTotalSent");
  if (statTotalSent) statTotalSent.textContent = `GHS ${totalSent.toLocaleString()}`;
  const statTotalWithdrawn = document.getElementById("statTotalWithdrawn");
  if (statTotalWithdrawn) statTotalWithdrawn.textContent = `GHS ${totalWithdrawn.toLocaleString()}`;
  const statTransactionCount = document.getElementById("statTransactionCount");
  if (statTransactionCount) statTransactionCount.textContent = transactions.length;
}

// ====================== TRANSACTION MODAL ======================
window.showAddTransactionModal = function() {
  if (!isAdminUser) { showToast("Only Admin can add transactions"); return; }
  const modal = document.getElementById("transactionModal");
  if (modal) modal.classList.add("show");
};

window.closeModal = function() {
  const modal = document.getElementById("transactionModal");
  if (modal) modal.classList.remove("show");
};

window.addTransactionWithType = async function() {
  if (!isAdminUser) { showToast("Only Admin can add transactions"); window.closeModal(); return; }
  if (!db) { showToast("Firebase not connected", true); return; }
  
  const amount = Number(document.getElementById("modalAmount")?.value);
  const party = document.getElementById("modalParty")?.value.trim();
  const transactionType = document.getElementById("modalType")?.value;
  let ref = document.getElementById("modalRef")?.value.trim();
  
  if (!amount || amount <= 0) { showToast("Enter valid amount"); return; }
  if (!party) { showToast("Enter party name"); return; }
  if (!ref) ref = "TX-" + Math.floor(1000 + Math.random() * 9000);
  
  await addDoc(collection(db, "transactions"), {
    amount, sentBy: party, receivedBy: workstationEmployee, ref,
    transactionType, date: new Date().toLocaleString('en-GB'), timestamp: serverTimestamp()
  });
  showToast(`💰 GHS ${amount} added`);
  window.closeModal();
};

// ====================== FILTERS ======================
window.filterTransactions = function() {
  const term = document.getElementById("searchTransactions")?.value.toLowerCase() || "";
  document.querySelectorAll("#transactionsBody tr").forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
  });
};

window.filterOrders = function() {
  const term = document.getElementById("searchOrders")?.value.toLowerCase() || "";
  document.querySelectorAll("#ordersBody tr").forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
  });
};

// ====================== REPORTS ======================
window.generateReport = function() {
  const period = (document.getElementById("reportPeriod")?.value) || "month";

  // --- Date filter ---
  const now = new Date();

  // Robustly extract a JS Date from a transaction — handles Firestore Timestamp,
  // plain JS Date, ISO string, and the en-GB locale string "DD/MM/YYYY, HH:MM:SS"
  function txDate(t) {
    if (t.timestamp && t.timestamp.toDate) return t.timestamp.toDate();
    if (t.timestamp && t.timestamp instanceof Date) return t.timestamp;
    if (t.timestamp && typeof t.timestamp === "string") {
      const d = new Date(t.timestamp);
      if (!isNaN(d)) return d;
    }
    // Fall back to the stored date string "DD/MM/YYYY, HH:MM:SS" (en-GB)
    if (t.date) {
      const datePart = t.date.split(",")[0].trim(); // "DD/MM/YYYY"
      const [dd, mm, yyyy] = datePart.split("/").map(Number);
      if (dd && mm && yyyy) return new Date(yyyy, mm - 1, dd);
    }
    return null;
  }

  function inPeriod(t) {
    if (period === "all") return true;
    const d = txDate(t);
    if (!d) return false;
    if (period === "today") return d.toDateString() === now.toDateString();
    if (period === "week") {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (period === "month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  }

  const filtered = transactions.filter(inPeriod);

  const received = filtered.filter(t => (t.transactionType || "received") === "received");
  const sent     = filtered.filter(t => t.transactionType === "sent");
  const withdrawn= filtered.filter(t => t.transactionType === "withdrawn");

  const totalReceived  = received.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalSent      = sent.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalWithdrawn = withdrawn.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const netBalance     = totalReceived - totalSent - totalWithdrawn;

  const periodLabels = { all:"All time", today:"Today", week:"Last 7 days", month:"This month" };

  // --- KPI Cards ---
  document.getElementById("kpiReceived").textContent     = `GHS ${totalReceived.toLocaleString()}`;
  document.getElementById("kpiReceivedCount").textContent= `${received.length} transaction${received.length !== 1 ? "s" : ""}`;
  document.getElementById("kpiSent").textContent         = `GHS ${totalSent.toLocaleString()}`;
  document.getElementById("kpiSentCount").textContent    = `${sent.length} transaction${sent.length !== 1 ? "s" : ""}`;
  document.getElementById("kpiWithdrawn").textContent    = `GHS ${totalWithdrawn.toLocaleString()}`;
  document.getElementById("kpiWithdrawnCount").textContent= `${withdrawn.length} transaction${withdrawn.length !== 1 ? "s" : ""}`;
  document.getElementById("kpiNet").textContent          = `GHS ${netBalance.toLocaleString()}`;
  document.getElementById("kpiPeriodLabel").textContent  = periodLabels[period];

  // --- Chart helpers ---
  if (typeof Chart === "undefined") return;
  Chart.defaults.color = getComputedStyle(document.documentElement).getPropertyValue("--text") || "#333";

  function destroyChart(id) {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  }

  // --- Bar Chart ---
  destroyChart("reportBarChart");
  new Chart(document.getElementById("reportBarChart"), {
    type: "bar",
    data: {
      labels: ["Received", "Sent", "Withdrawn"],
      datasets: [{
        label: "Amount (GHS)",
        data: [totalReceived, totalSent, totalWithdrawn],
        backgroundColor: [
          "rgba(40,167,69,0.85)",
          "rgba(255,122,0,0.85)",
          "rgba(220,53,69,0.85)"
        ],
        borderRadius: 10,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` GHS ${ctx.parsed.y.toLocaleString()}` } }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: {
          grid: { color: "rgba(128,128,128,0.1)" },
          border: { display: false },
          ticks: { callback: v => `GHS ${(v/1000).toFixed(0)}k` }
        }
      }
    }
  });

  // --- Doughnut Chart ---
  destroyChart("reportDoughnutChart");
  const doughnutData = [totalReceived, totalSent, totalWithdrawn].filter(v => v > 0);
  const doughnutLabels = ["Received","Sent","Withdrawn"].filter((_, i) => [totalReceived,totalSent,totalWithdrawn][i] > 0);
  new Chart(document.getElementById("reportDoughnutChart"), {
    type: "doughnut",
    data: {
      labels: doughnutLabels,
      datasets: [{
        data: doughnutData,
        backgroundColor: ["rgba(40,167,69,0.85)","rgba(255,122,0,0.85)","rgba(220,53,69,0.85)"],
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { position: "bottom", labels: { padding: 16, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ` GHS ${ctx.parsed.toLocaleString()}` } }
      }
    }
  });

  // --- Line Chart (last 7 days) ---
  destroyChart("reportLineChart");
  const days = [];
  const dayTotals = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }));
    const dayStr = d.toDateString();
    const total = transactions
      .filter(t => {
        if ((t.transactionType || "received") !== "received") return false;
        const td = txDate(t);
        return td && td.toDateString() === dayStr;
      })
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    dayTotals.push(total);
  }
  new Chart(document.getElementById("reportLineChart"), {
    type: "line",
    data: {
      labels: days,
      datasets: [{
        label: "Received (GHS)",
        data: dayTotals,
        borderColor: "#1A6B6B",
        backgroundColor: "rgba(26,107,107,0.1)",
        borderWidth: 2.5,
        pointBackgroundColor: "#1A6B6B",
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` GHS ${ctx.parsed.y.toLocaleString()}` } }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: {
          grid: { color: "rgba(128,128,128,0.1)" },
          border: { display: false },
          ticks: { callback: v => `GHS ${v.toLocaleString()}` }
        }
      }
    }
  });

  // --- Staff Breakdown ---
  const staffTotals = {};
  received.forEach(t => {
    const name = t.receivedBy || "Unknown";
    staffTotals[name] = (staffTotals[name] || 0) + (Number(t.amount) || 0);
  });
  const sortedStaff = Object.entries(staffTotals).sort((a, b) => b[1] - a[1]);
  const maxStaff = sortedStaff[0]?.[1] || 1;
  const colors = ["#1A6B6B","#28a745","#ff7a00","#dc3545","#6610f2"];
  const staffBox = document.getElementById("staffBreakdown");
  if (staffBox) {
    if (sortedStaff.length === 0) {
      staffBox.innerHTML = `<p style="color:var(--text-light);font-size:13px;text-align:center;padding:20px 0;">No data for this period</p>`;
    } else {
      staffBox.innerHTML = sortedStaff.slice(0, 5).map(([name, total], i) => `
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
            <span style="font-weight:600;">${name}</span>
            <span style="color:${colors[i % colors.length]};font-weight:700;">GHS ${total.toLocaleString()}</span>
          </div>
          <div style="background:var(--border);border-radius:20px;height:7px;overflow:hidden;">
            <div style="width:${Math.round((total/maxStaff)*100)}%;height:100%;background:${colors[i % colors.length]};border-radius:20px;transition:width 0.6s ease;"></div>
          </div>
        </div>
      `).join("");
    }
  }

  // Timestamp
  const ts = document.getElementById("reportTimestamp");
  if (ts) ts.textContent = `Last generated: ${new Date().toLocaleString("en-GB")}`;
};


// ====================== ORDERS ======================
window.toggleOrderStatus = async function(firestoreId) {
  if (!isAdminUser) { showToast("Only Admin can update orders"); return; }
  try {
    const orderRef = doc(db, "orders", firestoreId);
    const snap = await getDoc(orderRef);
    if (snap.exists()) {
      const current = snap.data().status;
      await updateDoc(orderRef, { status: current === "pending" ? "taken" : "pending" });
      showToast(current === "pending" ? "✅ Order taken" : "🔄 Order pending");
    }
  } catch (e) { showToast("Error", true); }
};

window.addOrder = async function() {
  if (!isAdminUser) { showToast("Only Admin can add orders"); return; }
  const name = prompt("Customer name:");
  if (!name) return;
  const number = prompt("Phone number:");
  if (!number) return;
  await addDoc(collection(db, "orders"), {
    orderId: "ORD" + Math.floor(100000 + Math.random() * 900000),
    name, number, status: "pending", timestamp: serverTimestamp()
  });
  showToast("Order added");
};

// ====================== EXPORT ======================
window.exportToCSV = function() {
  if (transactions.length === 0) return showToast("No data");
  let csv = "Amount,Party,Recorded By,Type,Reference,Date\n";
  transactions.forEach(t => {
    csv += `${t.amount},"${t.sentBy || ''}","${t.receivedBy || ''}","${t.transactionType || 'received'}","${t.ref || ''}","${t.date || ''}"\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `transactions_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  showToast("Exported");
};

// ====================== DARK MODE ======================
window.toggleDarkMode = function() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
  const btn = document.getElementById("darkModeBtn");
  if (btn) btn.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
};

// ====================== WORKSTATION USERS ======================
async function loadWorkstationUsersFromFirebase() {
  if (!db) return [];
  try {
    const usersRef = collection(db, "workstation_users");
    const snapshot = await getDocs(usersRef);
    const users = [];
    snapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });
    
    if (users.length === 0) {
      await migrateDefaultUsersToFirebase();
      return await loadWorkstationUsersFromFirebase();
    }
    
    workstationUsers = users;
    return users;
  } catch (error) {
    console.error("Error loading users:", error);
    return [];
  }
}

async function migrateDefaultUsersToFirebase() {
  console.log("Migrating default users to Firebase...");
  const defaultUsers = [
    { name: "John Doe", password: "1234", isAdmin: true, created: new Date().toISOString() },
    { name: "Jane Smith", password: "5678", isAdmin: false, created: new Date().toISOString() }
  ];
  
  for (const user of defaultUsers) {
    try {
      const userRef = doc(collection(db, "workstation_users"));
      await setDoc(userRef, user);
      console.log(`Migrated user: ${user.name}`);
    } catch (error) {
      console.error("Migration error:", error);
    }
  }
  console.log("Migration complete");
}

window.addWorkstationUser = async function() {
  if (!isAdminUser) { showToast("Only Admin can add users"); return; }
  const name = document.getElementById("newEmployeeName")?.value.trim();
  const password = document.getElementById("newEmployeePassword")?.value;
  const isAdmin = document.getElementById("newEmployeeIsAdmin")?.checked || false;
  
  if (!name) { showToast("Enter name"); return; }
  if (!password || password.length < 4) { showToast("Password 4+ chars"); return; }
  
  const existingUser = workstationUsers.find(u => u.name.toLowerCase() === name.toLowerCase());
  if (existingUser) { showToast("User exists"); return; }
  
  try {
    const newUser = {
      name: name,
      password: password,
      isAdmin: isAdmin,
      created: new Date().toISOString()
    };
    const userRef = doc(collection(db, "workstation_users"));
    await setDoc(userRef, newUser);
    
    await loadWorkstationUsersFromFirebase();
    
    document.getElementById("newEmployeeName").value = "";
    document.getElementById("newEmployeePassword").value = "";
    document.getElementById("newEmployeeIsAdmin").checked = false;
    showToast(`User ${name} added to cloud`);
    renderEmployees();
  } catch (error) {
    console.error("Add user error:", error);
    showToast("Error adding user", true);
  }
};

window.deleteWorkstationUser = async function(name) {
  if (!isAdminUser) { showToast("Only Admin can delete"); return; }
  if (confirm(`Delete ${name}?`)) {
    try {
      const userToDelete = workstationUsers.find(u => u.name === name);
      if (userToDelete && userToDelete.id) {
        await deleteDoc(doc(db, "workstation_users", userToDelete.id));
        await loadWorkstationUsersFromFirebase();
        renderEmployees();
        showToast(`${name} deleted from cloud`);
      } else {
        showToast("User not found", true);
      }
    } catch (error) {
      console.error("Delete error:", error);
      showToast("Error deleting user", true);
    }
  }
};

async function validateLogin(name, password) {
  const users = await loadWorkstationUsersFromFirebase();
  const user = users.find(u => u.name.toLowerCase() === name.toLowerCase() && u.password === password);
  return user || null;
}

window.authenticateUser = async function(name, password) {
  const user = await validateLogin(name, password);
  if (user) {
    localStorage.setItem("current_employee", user.name);
    localStorage.setItem("current_employee_isAdmin", user.isAdmin);
    localStorage.setItem("portal_logged_in", "true");
    return { success: true, user: user };
  } else {
    return { success: false, error: "Invalid credentials" };
  }
};

window.showWorkstationUsers = async function() {
  await renderEmployees();
  const modal = document.getElementById("workstationUsersModal");
  if (modal) modal.classList.add("show");
};

window.closeWorkstationModal = function() {
  const modal = document.getElementById("workstationUsersModal");
  if (modal) modal.classList.remove("show");
};

window.removeEmployee = async function(id) {
  if (!isAdminUser) { showToast("Only Admin can delete employees"); return; }
  if (confirm("Remove this employee?")) {
    await deleteDoc(doc(db, "employees", id));
    showToast("Employee removed");
  }
};

// ====================== QUEUE MODAL WITH YES/NO BUTTONS ======================
window.showPendingQueue = async function() {
  if (!db) return;
  
  const pendingRef = collection(db, "pending_sms");
  const q = query(pendingRef, where("status", "==", "waiting"));
  const snapshot = await getDocs(q);
  
  let html = '<div style="max-height: 500px; overflow-y: auto;">';
  
  if (snapshot.empty) {
    html += '<p style="text-align: center; color: var(--text-light); padding: 40px;"><i class="fas fa-check-circle" style="color: #28a745; font-size: 48px; display: block; margin-bottom: 15px;"></i>No pending transactions</p>';
  } else {
    snapshot.forEach(doc => {
      const sms = doc.data();
      const smsId = doc.id;
      const responses = sms.responses || {};
      const currentUserResponse = responses[workstationEmployee];
      
      let responsesList = '';
      for (const [user, resp] of Object.entries(responses)) {
        const isYes = resp.response === 'yes';
        responsesList += `<span style="display: inline-block; padding: 2px 8px; margin: 2px; border-radius: 20px; font-size: 11px; background: ${isYes ? '#d4edda' : '#f8d7da'}; color: ${isYes ? '#155724' : '#721c24'};">${user}: ${isYes ? '✅ YES' : '❌ NO'}</span>`;
      }
      
      html += `
        <div style="background: var(--card); border-radius: 16px; padding: 18px; margin-bottom: 15px; border: 1px solid var(--border); box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
            <div>
              <span style="background: #ff7a00; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">
                <i class="fas fa-clock"></i> WAITING
              </span>
            </div>
            <div style="font-size: 22px; font-weight: 800; color: #28a745;">
              GHS ${sms.amount}
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; padding: 10px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
            <div>
              <i class="fas fa-user" style="width: 20px; color: var(--text-light);"></i>
              <strong>From:</strong> ${sms.sentBy || 'Unknown'}
            </div>
            <div>
              <i class="fas fa-hashtag" style="width: 20px; color: var(--text-light);"></i>
              <strong>Ref:</strong> ${sms.ref || 'Transfer'}
            </div>
            <div>
              <i class="fas fa-tag" style="width: 20px; color: var(--text-light);"></i>
              <strong>Type:</strong> <span style="text-transform: capitalize;">${sms.transactionType || 'received'}</span>
            </div>
            <div>
              <i class="fas fa-user-check" style="width: 20px; color: var(--text-light);"></i>
              <strong>Your response:</strong> 
              <span style="font-weight: 600; ${currentUserResponse ? (currentUserResponse.response === 'yes' ? 'color: #28a745;' : 'color: #dc3545;') : 'color: #ffc107;'}">
                ${currentUserResponse ? (currentUserResponse.response === 'yes' ? '✅ YES' : '❌ NO') : '⏳ Pending'}
              </span>
            </div>
          </div>
          
          <div style="margin-bottom: 15px; font-size: 12px; background: var(--bg); padding: 10px; border-radius: 12px;">
            <i class="fas fa-users"></i> <strong>All responses:</strong>
            <div style="margin-top: 8px;">
              ${responsesList || '<span style="color: var(--text-light);">No responses yet</span>'}
            </div>
          </div>
          
          ${!currentUserResponse ? `
            <div style="display: flex; gap: 12px; margin-top: 5px;">
              <button onclick="window.manualConfirmSms('${smsId}', 'yes')" style="flex: 1; padding: 10px; border-radius: 40px; font-weight: 600; border: none; background: linear-gradient(135deg, #28a745, #1e7e34); color: white; cursor: pointer; font-size: 13px;">
                <i class="fas fa-check-circle"></i> YES, I Received
              </button>
              <button onclick="window.manualConfirmSms('${smsId}', 'no')" style="flex: 1; padding: 10px; border-radius: 40px; font-weight: 600; border: none; background: linear-gradient(135deg, #dc3545, #bd2130); color: white; cursor: pointer; font-size: 13px;">
                <i class="fas fa-times-circle"></i> NO, Not Mine
              </button>
            </div>
          ` : `
            <div style="text-align: center; padding: 8px; background: ${currentUserResponse.response === 'yes' ? '#d4edda' : '#f8d7da'}; border-radius: 10px; font-size: 12px; color: ${currentUserResponse.response === 'yes' ? '#155724' : '#721c24'};">
              <i class="fas ${currentUserResponse.response === 'yes' ? 'fa-check-circle' : 'fa-times-circle'}"></i>
              You already responded: ${currentUserResponse.response === 'yes' ? 'YES' : 'NO'}
              ${currentUserResponse.isAuto ? ' (Auto-timeout)' : ''}
            </div>
          `}
        </div>
      `;
    });
  }
  html += '</div>';
  
  let modal = document.getElementById("pendingQueueModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "pendingQueueModal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 650px;">
        <div class="modal-header">
          <h3><i class="fas fa-clock"></i> Pending SMS Queue</h3>
          <div style="display: flex; gap: 8px;">
            <button onclick="window.showPendingQueue()" style="background: #ff7a00; color: white; border: none; border-radius: 40px; padding: 5px 12px; font-size: 12px; cursor: pointer; width: auto;">
              <i class="fas fa-sync-alt"></i> Refresh
            </button>
            <span class="modal-close" onclick="document.getElementById('pendingQueueModal').classList.remove('show')">&times;</span>
          </div>
        </div>
        <div class="modal-body" id="pendingQueueBody" style="max-height: 65vh; overflow-y: auto;">
          ${html}
        </div>
        <div class="modal-footer">
          <button onclick="document.getElementById('pendingQueueModal').classList.remove('show')">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    document.getElementById("pendingQueueBody").innerHTML = html;
  }
  
  modal.classList.add("show");
};

window.closePendingQueue = function() {
  const modal = document.getElementById("pendingQueueModal");
  if (modal) modal.classList.remove("show");
};

// ====================== DATE UPDATE ======================
setInterval(() => {
  const now = new Date();
  const span = document.querySelector("#currentDate span");
  if (span) {
    span.textContent = now.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'}) + " • " + now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
  }
}, 30000);

// ====================== INITIALIZE ======================
async function init() {
  await loadWorkstationUsersFromFirebase();
  checkWorkstationAdmin();
  setupRealTimeListeners();
  showTab("dashboard");
  await registerActiveSession();
  
  window.addEventListener("beforeunload", () => {
    unregisterActiveSession();
  });
  
  console.log("System Ready - Employee:", workstationEmployee, "Admin:", isAdminUser);
}

init();