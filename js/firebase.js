// CipherChat — Firebase compat init + helper API (window.CC)
// Firebase SDK: 9.23.0 compat, loaded via script tags before this file.

(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyCO7exw0xwvfytbDMmGLBD5dEvslzMTRLo",
    authDomain: "cipherchat-4b7bc.firebaseapp.com",
    databaseURL: "https://cipherchat-4b7bc-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "cipherchat-4b7bc",
    storageBucket: "cipherchat-4b7bc.firebasestorage.app",
    messagingSenderId: "440636487990",
    appId: "1:440636487990:web:6b02cda88e2be7115c9b97",
  };

  firebase.initializeApp(firebaseConfig);

  const auth = firebase.auth();
  const fs = firebase.firestore();
  const rtdb = firebase.database();

  function nowTs() {
    // RTDB stores number timestamps; Firestore wants server timestamp.
    return Date.now();
  }

  function safeLower(s) {
    return String(s || "").trim().toLowerCase();
  }

  function generateAvatar(name) {
    const n = String(name || "").trim();
    const initials = (n.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "CC").toUpperCase();
    const code = (n.charCodeAt(0) || 67) % 360;
    const color = `hsl(${code}, 70%, 50%)`;
    return { initials, color };
  }

  async function getUserProfile(uid) {
    const doc = await fs.collection("users").doc(uid).get();
    return doc.exists ? doc.data() : null;
  }

  async function createUserProfile(uid, { username, email, phone }) {
    const u = safeLower(username);
    if (u.length < 3) throw new Error("Username must be at least 3 characters.");
    const avatar = generateAvatar(u);
    await fs
      .collection("users")
      .doc(uid)
      .set(
        {
          uid,
          username: u,
          email: email || null,
          phone: phone || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          avatar,
        },
        { merge: true }
      );
    return getUserProfile(uid);
  }

  async function searchUsers(query) {
    const q = safeLower(query);
    if (!q) return [];
    const snap = await fs
      .collection("users")
      .orderBy("username")
      .startAt(q)
      .endAt(q + "\uf8ff")
      .limit(20)
      .get();
    return snap.docs.map((d) => d.data());
  }

  function getDMId(uid1, uid2) {
    return [uid1, uid2].sort().join("_");
  }

  async function sendDM({ fromUid, toUid, ciphertext, cipherType, key }) {
    const dmId = getDMId(fromUid, toUid);
    const msgRef = rtdb.ref(`dms/${dmId}`).push();
    const payload = {
      id: msgRef.key,
      fromUid,
      toUid,
      ciphertext,
      cipherType: cipherType || null,
      key: key ?? null,
      timestamp: nowTs(),
      read: false,
    };
    await msgRef.set(payload);

    const convoA = {
      otherUid: toUid,
      lastMessage: ciphertext,
      lastTimestamp: payload.timestamp,
      participants: [fromUid, toUid],
    };
    const convoB = {
      otherUid: fromUid,
      lastMessage: ciphertext,
      lastTimestamp: payload.timestamp,
      participants: [fromUid, toUid],
    };
    await Promise.all([
      rtdb.ref(`conversations/${fromUid}/${dmId}`).set(convoA),
      rtdb.ref(`conversations/${toUid}/${dmId}`).set(convoB),
    ]);
  }

  function listenDM(uid1, uid2, callback) {
    const dmId = getDMId(uid1, uid2);
    const ref = rtdb.ref(`dms/${dmId}`).orderByChild("timestamp").limitToLast(100);
    const handler = (snap) => {
      const data = snap.val() || {};
      const msgs = Object.values(data).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      callback(msgs);
    };
    ref.on("value", handler);
    return () => ref.off("value", handler);
  }

  function listenConversations(uid, callback) {
    const ref = rtdb.ref(`conversations/${uid}`).orderByChild("lastTimestamp");
    const handler = (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      list.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
      callback(list);
    };
    ref.on("value", handler);
    return () => ref.off("value", handler);
  }

  async function createGroup({ name, creatorUid, memberUids }) {
    const groupId = fs.collection("groups").doc().id;
    const members = Array.from(new Set([creatorUid, ...(memberUids || [])]));
    const avatar = generateAvatar(name || "Group");
    await fs.collection("groups").doc(groupId).set({
      groupId,
      name: String(name || "").trim() || "New group",
      creatorUid,
      members,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      avatar,
    });
    return groupId;
  }

  async function getGroupsForUser(uid) {
    const snap = await fs.collection("groups").where("members", "array-contains", uid).get();
    return snap.docs.map((d) => d.data());
  }

  async function getGroupInfo(groupId) {
    const doc = await fs.collection("groups").doc(groupId).get();
    return doc.exists ? doc.data() : null;
  }

  async function addMemberToGroup(groupId, newUid) {
    await fs.collection("groups").doc(groupId).update({
      members: firebase.firestore.FieldValue.arrayUnion(newUid),
    });
    return true;
  }

  async function sendGroupMessage({ groupId, fromUid, ciphertext, cipherType, keyEnvelopes }) {
    const msgRef = rtdb.ref(`groups/${groupId}/messages`).push();
    const payload = {
      id: msgRef.key,
      fromUid,
      ciphertext,
      cipherType: cipherType || null,
      keyEnvelopes: keyEnvelopes || {},
      timestamp: nowTs(),
    };
    await msgRef.set(payload);
    await rtdb.ref(`groups/${groupId}/meta`).update({
      lastMessage: ciphertext,
      lastTimestamp: payload.timestamp,
    });
  }

  function listenGroupMessages(groupId, callback) {
    const ref = rtdb.ref(`groups/${groupId}/messages`).orderByChild("timestamp").limitToLast(150);
    const handler = (snap) => {
      const data = snap.val() || {};
      const msgs = Object.values(data).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      callback(msgs);
    };
    ref.on("value", handler);
    return () => ref.off("value", handler);
  }

  // Phone auth helpers (optional)
  async function startPhoneSignIn(phoneNumber, recaptchaContainerId) {
    if (!recaptchaContainerId) throw new Error("Missing reCAPTCHA container id.");
    const verifier = new firebase.auth.RecaptchaVerifier(recaptchaContainerId, {
      size: "normal",
    });
    await verifier.render();
    return auth.signInWithPhoneNumber(phoneNumber, verifier);
  }

  async function verifyPhoneOtp(confirmation, code) {
    if (!confirmation) throw new Error("Missing OTP confirmation.");
    return confirmation.confirm(code);
  }

  async function registerUser({ email, username, password }) {
    const u = safeLower(username);
    if (u.length < 3) throw new Error("Username must be at least 3 characters.");
    const res = await auth.createUserWithEmailAndPassword(email, password);
    const profile = await createUserProfile(res.user.uid, {
      username: u,
      email: res.user.email,
      phone: res.user.phoneNumber,
    });
    return profile;
  }

  async function loginWithEmail(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  }

  async function loginWithUsername(username, password) {
    const u = safeLower(username);
    const snap = await fs.collection("users").where("username", "==", u).limit(1).get();
    if (snap.empty) throw new Error("No account found for that username.");
    const email = snap.docs[0].data().email;
    if (!email) throw new Error("That username does not have an email login.");
    return auth.signInWithEmailAndPassword(email, password);
  }

  async function logoutUser() {
    return auth.signOut();
  }

  function onAuthChange(callback) {
    return auth.onAuthStateChanged(callback);
  }

  window.CC = {
    // Auth
    registerUser,
    loginWithEmail,
    loginWithUsername,
    startPhoneSignIn,
    verifyPhoneOtp,
    logoutUser,
    onAuthChange,

    // Users
    getUserProfile,
    createUserProfile,
    searchUsers,
    generateAvatar,

    // DMs
    getDMId,
    sendDM,
    listenDM,
    listenConversations,

    // Groups
    createGroup,
    sendGroupMessage,
    listenGroupMessages,
    getGroupsForUser,
    getGroupInfo,
    addMemberToGroup,
  };
})();

