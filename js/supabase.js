(function () {
  const SUPABASE_URL = "https://ymvsohsdzxtbqontrror.supabase.co";
  const SUPABASE_KEY = "sb_publishable_WiInP084-vv51XbPs2g9MA_kMmmM8DE";

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  function nowTs() {
    return Date.now();
  }

  function safeLower(s) {
    return String(s || "").trim().toLowerCase();
  }

  function normalizeUuid(value, fieldName) {
    const id = String(value || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error(`${fieldName} must be a valid UUID.`);
    }
    return id;
  }

  function generateAvatar(name) {
    const n = String(name || "").trim();
    const initials = (n.replace(/[^a-z0-9]/gi, "").slice(0, 2) || "CC").toUpperCase();
    const code = (n.charCodeAt(0) || 67) % 360;
    const color = `hsl(${code}, 70%, 50%)`;
    return { initials, color };
  }

  function mapUser(row) {
    if (!row) return null;
    return {
      uid: row.uid,
      username: row.username,
      email: row.email,
      phone: row.phone,
      createdAt: row.created_at,
      avatar: {
        initials: row.avatar_initials,
        color: row.avatar_color,
      },
    };
  }

  function mapDM(row) {
    return {
      id: row.id,
      fromUid: row.from_uid,
      toUid: row.to_uid,
      ciphertext: row.ciphertext,
      cipherType: row.cipher_type,
      key: row.message_key,
      timestamp: row.timestamp,
      read: row.read,
    };
  }

  function mapGroup(row) {
    if (!row) return null;
    return {
      groupId: row.group_id,
      name: row.name,
      creatorUid: row.creator_uid,
      members: Array.isArray(row.members) ? row.members : [],
      createdAt: row.created_at,
      avatar: {
        initials: row.avatar_initials,
        color: row.avatar_color,
      },
    };
  }

  function mapGroupMessage(row) {
    return {
      id: row.id,
      groupId: row.group_id,
      fromUid: row.from_uid,
      ciphertext: row.ciphertext,
      cipherType: row.cipher_type,
      keyEnvelopes: row.key_envelopes || {},
      timestamp: row.timestamp,
    };
  }

  function isRlsUsersInsertError(error) {
    const msg = String(error && (error.message || error) || "").toLowerCase();
    return msg.includes("row-level security") && msg.includes("table \"users\"");
  }

  function mapAuthUser(user) {
    if (!user) return null;
    return {
      ...user,
      uid: user.id,
      phoneNumber: user.phone || null,
    };
  }

  async function requireAuthUser() {
    const { data, error } = await sb.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Not signed in.");
    return data.user;
  }

  async function getProfileByUsername(username) {
    const { data, error } = await sb
      .from("users")
      .select("*")
      .eq("username", safeLower(username))
      .maybeSingle();
    if (error) throw error;
    return mapUser(data);
  }

  async function fetchDmRows(dmId) {
    const { data, error } = await sb
      .from("direct_messages")
      .select("*")
      .eq("dm_id", dmId)
      .order("timestamp", { ascending: true })
      .limit(100);
    if (error) throw error;
    return (data || []).map(mapDM);
  }

  async function fetchGroupRows(groupId) {
    const { data, error } = await sb
      .from("group_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("timestamp", { ascending: true })
      .limit(150);
    if (error) throw error;
    return (data || []).map(mapGroupMessage);
  }

  async function emitConversationList(uid, callback) {
    const { data, error } = await sb
      .from("direct_messages")
      .select("dm_id,from_uid,to_uid,ciphertext,timestamp")
      .or(`from_uid.eq.${uid},to_uid.eq.${uid}`)
      .order("timestamp", { ascending: false })
      .limit(500);

    if (error) throw error;

    const seen = new Set();
    const convos = [];
    for (const row of data || []) {
      const otherUid = row.from_uid === uid ? row.to_uid : row.from_uid;
      if (!otherUid || seen.has(otherUid)) continue;
      seen.add(otherUid);
      convos.push({
        id: row.dm_id,
        otherUid,
        lastMessage: row.ciphertext,
        lastTimestamp: row.timestamp,
      });
    }
    callback(convos);
  }

  const CC = {
    async registerUser({ email, username, password }) {
      const u = safeLower(username);
      if (u.length < 3) throw new Error("Username must be at least 3 characters.");

      const { data, error } = await sb.auth.signUp({
        email: String(email || "").trim(),
        password,
        options: {
          data: {
            username: u,
          },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Could not create user.");

      const mappedUser = mapAuthUser(data.user);
      const hasSession = !!data.session;

      if (hasSession) {
        await this.createUserProfile(data.user.id, {
          username: u,
          email: data.user.email,
          phone: data.user.phone || null,
        });
      }

      return {
        user: mappedUser,
        pendingConfirmation: !hasSession,
      };
    },

    async loginWithEmail(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({
        email: String(email || "").trim(),
        password,
      });
      if (error) throw error;
      return mapAuthUser(data.user);
    },

    async loginWithUsername(username, password) {
      const profile = await getProfileByUsername(username);
      if (!profile || !profile.email) {
        throw new Error("No email login found for that username.");
      }
      return this.loginWithEmail(profile.email, password);
    },

    async startPhoneSignIn(phoneNumber) {
      const phone = String(phoneNumber || "").trim();
      if (!phone) throw new Error("Phone number is required.");

      const { data, error } = await sb.auth.signInWithOtp({ phone });
      if (error) throw error;
      return { phone, data };
    },

    async verifyPhoneOtp(confirmation, code) {
      const phone = confirmation && confirmation.phone;
      if (!phone) throw new Error("Send OTP first.");
      const token = String(code || "").trim();
      if (!token) throw new Error("OTP code is required.");

      const { data, error } = await sb.auth.verifyOtp({
        phone,
        token,
        type: "sms",
      });
      if (error) throw error;

      const user = data.user;
      if (user) {
        const existing = await this.getUserProfile(user.id);
        if (!existing) {
          const fallback = phone.replace(/\D/g, "").slice(-6) || "user";
          await this.createUserProfile(user.id, {
            username: `user${fallback}`.slice(0, 20),
            email: user.email || null,
            phone: user.phone || phone,
          });
        }
      }

      return mapAuthUser(user);
    },

    async logoutUser() {
      const { error } = await sb.auth.signOut();
      if (error) throw error;
      return true;
    },

    onAuthChange(callback) {
      sb.auth.getSession().then(({ data }) => callback(mapAuthUser(data.session?.user || null)));
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        callback(mapAuthUser(session?.user || null));
      });
      return () => data.subscription.unsubscribe();
    },

    async getUserProfile(uid) {
      const cleanUid = normalizeUuid(uid, "User ID");
      const { data, error } = await sb.from("users").select("*").eq("uid", cleanUid).maybeSingle();
      if (error) throw error;
      return mapUser(data);
    },

    async createUserProfile(uid, { username, email, phone }) {
      const cleanUid = normalizeUuid(uid, "User ID");
      const u = safeLower(username);
      if (u.length < 3) throw new Error("Username must be at least 3 characters.");

      const avatar = generateAvatar(u);
      const { error } = await sb.from("users").upsert(
        {
          uid: cleanUid,
          username: u,
          email: email || null,
          phone: phone || null,
          avatar_initials: avatar.initials,
          avatar_color: avatar.color,
        },
        { onConflict: "uid" }
      );
      if (error) {
        if (isRlsUsersInsertError(error)) {
          throw new Error(
            "Profile creation is blocked by Supabase RLS. Run the SQL in supabase/schema.sql, including the policies and trigger."
          );
        }
        throw error;
      }
      return this.getUserProfile(cleanUid);
    },

    async searchUsers(query) {
      const q = safeLower(query);
      if (!q) return [];
      const { data, error } = await sb
        .from("users")
        .select("*")
        .ilike("username", `${q}%`)
        .order("username", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data || []).map(mapUser);
    },

    generateAvatar,

    getDMId(uid1, uid2) {
      return [normalizeUuid(uid1, "User ID"), normalizeUuid(uid2, "User ID")].sort().join("_");
    },

    async sendDM({ fromUid, toUid, ciphertext, cipherType, key }) {
      const dmId = this.getDMId(fromUid, toUid);
      const payload = {
        id: crypto.randomUUID(),
        dm_id: dmId,
        from_uid: normalizeUuid(fromUid, "Sender ID"),
        to_uid: normalizeUuid(toUid, "Recipient ID"),
        ciphertext,
        cipher_type: cipherType || null,
        message_key: key ?? null,
        timestamp: nowTs(),
        read: false,
      };
      const { error } = await sb.from("direct_messages").insert(payload);
      if (error) throw error;
      return payload.id;
    },

    listenDM(uid1, uid2, callback) {
      const dmId = this.getDMId(uid1, uid2);

      const refresh = async () => {
        const rows = await fetchDmRows(dmId);
        callback(rows);
      };

      refresh().catch((err) => console.error(err));

      const channel = sb
        .channel(`dm:${dmId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "direct_messages", filter: `dm_id=eq.${dmId}` },
          () => refresh().catch((err) => console.error(err))
        )
        .subscribe();

      return () => {
        sb.removeChannel(channel);
      };
    },

    listenConversations(uid, callback) {
      const cleanUid = normalizeUuid(uid, "User ID");
      const refresh = async () => {
        await emitConversationList(cleanUid, callback);
      };

      refresh().catch((err) => console.error(err));

      const channel = sb
        .channel(`conversations:${cleanUid}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
          const row = payload.new || {};
          if (row.from_uid === cleanUid || row.to_uid === cleanUid) {
            refresh().catch((err) => console.error(err));
          }
        })
        .subscribe();

      return () => {
        sb.removeChannel(channel);
      };
    },

    async createGroup({ name, creatorUid, memberUids }) {
      const creator = normalizeUuid(creatorUid, "Creator ID");
      const members = Array.from(new Set([creator, ...((memberUids || []).map((uid) => normalizeUuid(uid, "Member ID")))]));
      const avatar = generateAvatar(name || "Group");
      const groupId = crypto.randomUUID();

      const { error } = await sb.from("groups").insert({
        group_id: groupId,
        name: String(name || "").trim() || "New group",
        creator_uid: creator,
        members,
        avatar_initials: avatar.initials,
        avatar_color: avatar.color,
      });
      if (error) throw error;
      return groupId;
    },

    async getGroupsForUser(uid) {
      const cleanUid = normalizeUuid(uid, "User ID");
      const { data, error } = await sb
        .from("groups")
        .select("*")
        .contains("members", [cleanUid])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapGroup);
    },

    async getGroupInfo(groupId) {
      const cleanGroupId = normalizeUuid(groupId, "Group ID");
      const { data, error } = await sb.from("groups").select("*").eq("group_id", cleanGroupId).maybeSingle();
      if (error) throw error;
      return mapGroup(data);
    },

    async addMemberToGroup(groupId, newUid) {
      const cleanGroupId = normalizeUuid(groupId, "Group ID");
      const cleanUid = normalizeUuid(newUid, "Member ID");
      const info = await this.getGroupInfo(cleanGroupId);
      if (!info) throw new Error("Group not found.");
      const members = Array.from(new Set([...(info.members || []), cleanUid]));
      const { error } = await sb.from("groups").update({ members }).eq("group_id", cleanGroupId);
      if (error) throw error;
      return true;
    },

    async sendGroupMessage({ groupId, fromUid, ciphertext, cipherType, keyEnvelopes }) {
      const payload = {
        id: crypto.randomUUID(),
        group_id: normalizeUuid(groupId, "Group ID"),
        from_uid: normalizeUuid(fromUid, "Sender ID"),
        ciphertext,
        cipher_type: cipherType || null,
        key_envelopes: keyEnvelopes || {},
        timestamp: nowTs(),
      };
      const { error } = await sb.from("group_messages").insert(payload);
      if (error) throw error;
      return payload.id;
    },

    listenGroupMessages(groupId, callback) {
      const cleanGroupId = normalizeUuid(groupId, "Group ID");

      const refresh = async () => {
        const rows = await fetchGroupRows(cleanGroupId);
        callback(rows);
      };

      refresh().catch((err) => console.error(err));

      const channel = sb
        .channel(`group:${cleanGroupId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${cleanGroupId}` },
          () => refresh().catch((err) => console.error(err))
        )
        .subscribe();

      return () => {
        sb.removeChannel(channel);
      };
    },
  };

  window.CC = CC;
  window.CC_SUPABASE = sb;
})();
