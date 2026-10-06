import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

export type Message = {
  id: string;
  senderId: string;
  text: string;
  at: number;
  imageUrl?: string;
  readAt?: number;
  reaction?: string;
  replyToId?: string;
  replyToText?: string;
  replyToSenderId?: string;
};

type DatabaseMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  image_url?: string | null;
  read_at?: string | null;
  reaction?: string | null;
  reply_to_id?: string | null;
  reply_to_text?: string | null;
  reply_to_sender_id?: string | null;
  created_at: string;
};

const messageFromDatabase = (row: DatabaseMessage): Message => ({
  id: row.id,
  senderId: row.sender_id,
  text: row.body,
  at: new Date(row.created_at).getTime(),
  ...(row.image_url ? { imageUrl: row.image_url } : {}),
  ...(row.read_at ? { readAt: new Date(row.read_at).getTime() } : {}),
  ...(row.reaction ? { reaction: row.reaction } : {}),
  ...(row.reply_to_id ? { replyToId: row.reply_to_id } : {}),
  ...(row.reply_to_text ? { replyToText: row.reply_to_text } : {}),
  ...(row.reply_to_sender_id ? { replyToSenderId: row.reply_to_sender_id } : {}),
});

type FriendProfileRecord = {
  id?: string | null;
  status?: string | null;
  username?: string | null;
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  hide_profile_details?: boolean | null;
  hide_following?: boolean | null;
  hide_city_age?: boolean | null;
  hide_online_status?: boolean | null;
  city?: string | null;
  birth_year?: string | null;
  online?: boolean | null;
  points?: number | null;
  gold?: number | null;
  games_played?: number | null;
  wins?: number | null;
  losses?: number | null;
};

type AcceptedFriendRequest = {
  sender_id: string;
  receiver_id: string;
  sender?: FriendProfileRecord | FriendProfileRecord[] | null;
  receiver?: FriendProfileRecord | FriendProfileRecord[] | null;
};

const otherParticipantId = (
  currentUserId: string,
  senderId: string,
  receiverId: string,
): string | null => {
  if (currentUserId === senderId) return receiverId;
  if (currentUserId === receiverId) return senderId;
  return null;
};

export type Friend = {
  id: string;
  name: string;
  status?: "online" | "in_game";
  handle?: string;
  bio?: string;
  birth_year?: string;
  city?: string;
  online?: boolean;
  hideProfileDetails?: boolean;
  hideFollowing?: boolean;
  hideCityAge?: boolean;
  hideOnlineStatus?: boolean;
  age?: number;
  avatar: string;
  points: number;
  gold: number;
  games_played: number;
  wins: number;
  losses?: number;
};

export type Group = {
  id: string;
  name: string;
  code: string;
  memberIds: string[];
  color: string;
};

export type Player = {
  id: string;
  name: string;
  handle?: string;
  bio?: string;
  birth_year?: string;
  city?: string;
  online?: boolean;
  hideProfileDetails?: boolean;
  hideFollowing?: boolean;
  hideCityAge?: boolean;
  hideOnlineStatus?: boolean;
  age?: number;
  avatar: string;
  points: number;
  gold: number;
  games_played: number;
  wins: number;
  losses?: number;
};

export type User = {
  id: string;
  name: string;
  last_name_change_at?: string;
  last_username_change_at?: string;
  handle?: string;
  bio?: string;
  birth_year?: string;
  city?: string;
  online?: boolean;
  avatar: string;
  points: number;
  games_played: number;
  wins: number;
};

type SavedAccount = {
  id: string;
  name: string;
  handle?: string;
  bio?: string;
  birth_year?: string;
  city?: string;
  password?: string;
  lastPasswordChangedAt?: number;
  last_username_change?: number;
  last_name_change?: number;
  email?: string;
  hideProfileDetails?: boolean;
  hideFollowing?: boolean;
};

type State = {
  user: User | null;
  savedAccount: SavedAccount | null;
  gold: number;
  unlockedStickerSlots: number[];
  online: boolean;
  friends: Friend[];
  friendRequests: Friend[];
  sentRequests: string[];
  blockedIds: string[];
  blockedByMeIds: string[];
  groups: Group[];
  directMessages: Record<string, Message[]>;
  groupMessages: Record<string, Message[]>;
  readAt: Record<string, number>;
  tokenId: string;
  boardId: string;
  nameChangedAt: number | null;
  isProMember: boolean;
  equippedProFrame: string | null;
  equippedProBanner: string | null;
  dailyGoldClaimedDate: string | null;
};

export type ProfileRecord = {
  id: string;
  username: string;
  display_name?: string | null;
  bio?: string | null;
  last_name_change_at?: string | null;
  last_username_change_at?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  birth_year?: string | null;
  online?: boolean | null;
  hide_profile_details?: boolean | null;
  hide_following?: boolean | null;
  hide_city_age?: boolean | null;
  hide_online_status?: boolean | null;
  age?: number | null;
  gold?: number | null;
  points?: number | null;
  games_played?: number | null;
  wins?: number | null;
  losses?: number | null;
};

export const NAME_MAX = 26;
export const NAME_COOLDOWN_DAYS = 30;
export const avatarImageSource = (value?: string | null) => value?.trim() || "/default-avatar.svg";

export const userStorageKey = (userId: string, category: string) => `user_${userId}_${category}`;
const ACTIVE_SESSION_KEY = "snakes_ladders_active_session";

const accountIdFor = (name: string) =>
  `account_${encodeURIComponent(name.trim().toLocaleLowerCase())}`;

const avatarFor = (seed: string) =>
  `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;

export const formatHandle = (handle: string | undefined) =>
  handle?.trim() ? `@${handle.trim().replace(/^@+/, "")}` : "";

export const globalPlayers: Player[] = [];

const seedState = (): State => ({
  user: null,
  savedAccount: null,
  gold: 75,
  unlockedStickerSlots: [],
  online: true,
  friends: [],
  friendRequests: [],
  sentRequests: [],
  blockedIds: [],
  blockedByMeIds: [],
  groups: [],
  directMessages: {},
  groupMessages: {},
  readAt: {},
  tokenId: "t1",
  boardId: "b1",
  nameChangedAt: null,
  isProMember: false,
  equippedProFrame: null,
  equippedProBanner: null,
  dailyGoldClaimedDate: null,
});

type Ctx = State & {
  register: (
    name: string,
    password: string,
    birth_year?: string,
    city?: string,
    id?: string,
  ) => boolean;
  loginWithProfile: (profile: ProfileRecord, password: string) => void;
  login: (name: string, password: string) => boolean;
  loginSaved: () => void;
  logout: () => void;
  setOnline: (v: boolean) => Promise<boolean>;
  setHideFollowing: (hidden: boolean) => Promise<boolean>;
  hideFollowing: boolean;
  setHideProfileDetails: (hidden: boolean) => Promise<boolean>;
  hideProfileDetails: boolean;
  addGold: (amount: number) => void;
  recordGameResult: (won: boolean) => void;
  spendGold: (amount: number) => boolean;
  unlockStickerSlot: (slotIndex: number) => boolean;
  sendDirect: (
    friendId: string,
    text: string,
    imageUrl?: string,
    reply?: { id: string; text: string; senderId: string },
  ) => void;
  deleteDirectMessage: (friendId: string, messageId: string) => Promise<void>;
  sendGroup: (groupId: string, text: string) => void;
  markRead: (chatId: string) => void;
  reactToMessage: (messageId: string, reaction: string | null) => Promise<void>;
  unreadFor: (friendId: string) => number;
  totalUnread: number;
  blockUser: (target: {
    id: string;
    name?: string;
    avatar?: string;
    points?: number;
    gold?: number;
    games_played?: number;
    wins?: number;
    losses?: number;
  } | string) => void;
  blockFriend: (friendId: string) => void;
  removeFriend: (friendId: string) => Promise<void>;
  unblockFriend: (friendId: string) => Promise<void>;
  createGroup: (name: string, memberIds: string[]) => void;
  leaveGroup: (groupId: string) => void;
  joinGroupByCode: (code: string) => Group | null;
  setTokenId: (id: string) => void;
  setBoardId: (id: string) => void;
  activatePro: () => boolean;
  setProFrame: (frame: string | null) => void;
  setProBanner: (banner: string | null) => void;
  visibleFriends: Friend[];
  blockedFriends: Friend[];
  blockedUserIds: string[];
  playerById: (id: string) => Player | undefined;
  acceptRequest: (id: string) => void;
  declineRequest: (id: string) => void;
  markFriendRequestSent: (id: string) => void;
  clearFriendRequestSent: (id: string) => void;
  requestFriend: (player: Player) => "added" | "exists";
  addFriend: (friend: Friend) => void;
  isNameTaken: (name: string) => boolean;
  nameCooldownDaysLeft: number;
  updateProfile: (data: {
    name?: string | undefined;
    avatar?: string | undefined;
    bio?: string | undefined;
  }) => void;
  syncProfileName: (name: string, lastNameChangeAt: string) => void;
  syncProfileUsername: (username: string, lastUsernameChangeAt: string) => void;
  deleteAccount: () => Promise<void>;
  isUsernameAvailable: (name: string) => boolean;
  updatePassword: (password: string) => boolean;
  linkEmail: (email: string) => void;
  passwordChangedAt: number | null;
  currentPassword: string;
  linkedEmail: string | null;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => {
    if (typeof window === "undefined") return seedState();
    try {
      const userId = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (!userId) return seedState();
      const raw = localStorage.getItem(userStorageKey(userId, "app_state"));
      if (!raw) return seedState();
      const stored = JSON.parse(raw) as Partial<State>;
      return {
        ...seedState(),
        ...stored,
        isProMember:
          localStorage.getItem(userStorageKey(userId, "isPro")) === "true" ||
          stored.isProMember === true,
        equippedProFrame:
          localStorage.getItem(userStorageKey(userId, "equippedProFrame")) ??
          stored.equippedProFrame ??
          null,
        equippedProBanner:
          localStorage.getItem(userStorageKey(userId, "equippedProBanner")) ??
          stored.equippedProBanner ??
          null,
        dailyGoldClaimedDate:
          localStorage.getItem(userStorageKey(userId, "dailyGoldClaimedDate")) ??
          stored.dailyGoldClaimedDate ??
          null,
      };
    } catch {
      return seedState();
    }
  });
  const [hydrated, setHydrated] = useState(true);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!supabase || !state.user?.id) return;
    let cancelled = false;
    const refreshProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, username, display_name, bio, last_name_change_at, last_username_change_at, avatar_url, city, birth_year, age, online, hide_profile_details, hide_following, hide_city_age, hide_online_status, points, gold, games_played, wins, losses",
          )
          .eq("id", state.user?.id)
          .maybeSingle();
        if (cancelled || error || !data) {
          if (error) console.error("Supabase profile refresh error:", error);
          return;
        }
        const gamesPlayed = Number(data.games_played ?? 0);
        const gold = Number(data.gold ?? 75);
        const profileName = data.display_name ?? data.username;
        const lastNameChangeAt = data.last_name_change_at ?? undefined;
        setState((previous) => ({
          ...previous,
          online: data.online !== false,
          savedAccount: previous.savedAccount
            ? {
                ...previous.savedAccount,
                hideProfileDetails: data.hide_profile_details === true || data.hide_city_age === true,
                hideFollowing: data.hide_following === true,
                hideCityAge: data.hide_city_age === true || data.hide_profile_details === true,
                hideOnlineStatus: data.hide_online_status === true,
              }
            : previous.savedAccount,
          gold,
          nameChangedAt: lastNameChangeAt
            ? new Date(lastNameChangeAt).getTime()
            : previous.nameChangedAt,
          user: previous.user
            ? {
                ...previous.user,
                id: data.id,
                name: profileName ?? previous.user.name,
                bio: data.bio ?? previous.user.bio,
                ...(lastNameChangeAt ? { last_name_change_at: lastNameChangeAt } : {}),
                avatar: data.avatar_url || previous.user.avatar,
                city: data.city ?? previous.user.city,
                birth_year: data.birth_year ?? previous.user.birth_year,
                points: Number(data.points ?? 0),
                gold,
                games_played: gamesPlayed,
                wins: Number(data.wins ?? 0),
              }
            : previous.user,
        }));
      } catch (error) {
        if (!cancelled) console.error("Supabase profile refresh error:", error);
      }
    };
    void refreshProfile();
    const channel = supabase
      .channel(`own-profile:${state.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${state.user.id}`,
        },
        () => void refreshProfile(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase?.removeChannel(channel);
    };
  }, [state.user?.id]);

  useEffect(() => {
    if (!supabase || !state.user?.id) return;
    const accountId = state.user.id;
    const handleIncomingBlock = (payload: { new: { blocker_id: string } }) => {
      const blockerId = payload.new.blocker_id;
      setState((previous) => {
        const directMessages = { ...previous.directMessages };
          online: data.online !== false,
        delete directMessages[blockerId];
        const readAt = { ...previous.readAt };
        delete readAt[blockerId];
        return {
          ...previous,
          friends: previous.friends.filter((friend) => friend.id !== blockerId),
          blockedIds: previous.blockedIds.includes(blockerId)
            ? previous.blockedIds
            : [...previous.blockedIds, blockerId],
          directMessages,
          readAt,
        };
      });
    };
    const channel = supabase
      .channel(`profile-blocks:${accountId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profile_blocks", filter: `blocked_id=eq.${accountId}` },
        handleIncomingBlock,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [state.user?.id]);

  useEffect(() => {
    if (!supabase || !state.user?.id) return;
    let cancelled = false;
    let realtimeVersion = 0;
    const accountId = state.user.id;
    const loadMessages = async () => {
      const versionAtStart = realtimeVersion;
      const { data: blocks, error: blocksError } = await supabase
        .from("profile_blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${accountId},blocked_id.eq.${accountId}`);
      if (blocksError) {
        console.error("Supabase message block filter error:", blocksError);
        return;
      }
      const blockedIds = new Set(
        (blocks ?? []).map((block) =>
          block.blocker_id === accountId ? block.blocked_id : block.blocker_id,
        ),
      );
      const blockedByMeIds = (blocks ?? [])
        .filter((block) => block.blocker_id === accountId)
        .map((block) => block.blocked_id);
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, sender_id, receiver_id, body, image_url, read_at, reaction, reply_to_id, reply_to_text, reply_to_sender_id, created_at")
        .or(`sender_id.eq.${accountId},receiver_id.eq.${accountId}`)
        .order("created_at", { ascending: true });
      if (cancelled || error) {
        if (error) console.error("Supabase messages refresh error:", error);
        return;
      }
      if (versionAtStart !== realtimeVersion) {
        void loadMessages();
        return;
      }
      const nextMessages: Record<string, Message[]> = {};
      for (const row of (data ?? []) as DatabaseMessage[]) {
        const friendId = otherParticipantId(accountId, row.sender_id, row.receiver_id);
        if (!friendId || blockedIds.has(friendId)) continue;
        const message = messageFromDatabase(row);
        nextMessages[friendId] = [...(nextMessages[friendId] ?? []), message];
      }
      setState((previous) => ({ ...previous, directMessages: nextMessages }));
    };
    const addMessage = (payload: { new: DatabaseMessage }) => {
      realtimeVersion += 1;
      const row = payload.new;
      const friendId = otherParticipantId(accountId, row.sender_id, row.receiver_id);
      if (!friendId) return;
      const message = messageFromDatabase(row);
      setState((previous) => {
        if (previous.blockedIds.includes(friendId)) return previous;
        const existing = previous.directMessages[friendId] ?? [];
        if (existing.some((item) => item.id === message.id)) {
          return {
            ...previous,
            directMessages: {
              ...previous.directMessages,
              [friendId]: existing.map((item) =>
                item.id === message.id ? message : item,
              ),
            },
          };
        }
        return {
          ...previous,
          directMessages: { ...previous.directMessages, [friendId]: [...existing, message] },
        };
      });
    };
    const updateMessage = (payload: { new: DatabaseMessage }) => {
      realtimeVersion += 1;
      const row = payload.new;
      const friendId = otherParticipantId(accountId, row.sender_id, row.receiver_id);
      if (!friendId) return;
      setState((previous) => {
        if (previous.blockedIds.includes(friendId)) return previous;
        const updatedMessage = messageFromDatabase(row);
        const existingMessages = previous.directMessages[friendId] ?? [];
        const hasMessage = existingMessages.some((message) => message.id === row.id);
        return {
          ...previous,
          directMessages: {
            ...previous.directMessages,
            [friendId]: hasMessage
              ? existingMessages.map((message) => {
                  if (message.id !== row.id) return message;
                  if (row.reaction) return { ...message, reaction: row.reaction };
                  const nextMessage = { ...message };
                  delete nextMessage.reaction;
                  return nextMessage;
                })
              : [...existingMessages, updatedMessage].sort((first, second) => first.at - second.at),
          },
        };
      });
    };
    const removeMessage = (payload: { old: { id: string; sender_id: string; receiver_id: string } }) => {
      realtimeVersion += 1;
      const row = payload.old;
      const friendId = otherParticipantId(accountId, row.sender_id, row.receiver_id);
      if (!friendId) return;
      setState((previous) => {
        const directMessages = { ...previous.directMessages };
        delete directMessages[friendId];
        const readAt = { ...previous.readAt };
        delete readAt[friendId];
        return { ...previous, directMessages, readAt };
      });
    };
    const channel = supabase
      .channel(`direct-messages:${accountId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `sender_id=eq.${accountId}` },
        addMessage,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `receiver_id=eq.${accountId}` },
        addMessage,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        updateMessage,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "direct_messages" },
        removeMessage,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadMessages();
      });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [state.user?.id]);

  useEffect(() => {
    const client = supabase;
    const accountId = state.user?.id;
    if (!client || !accountId) return;
    let cancelled = false;
    let refreshSequence = 0;
    const loadAcceptedFriends = async () => {
      const sequence = ++refreshSequence;
      const { data: blocks, error: blocksError } = await client
        .from("profile_blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${accountId},blocked_id.eq.${accountId}`);
      if (blocksError) {
        console.error("Supabase block relationships refresh error:", blocksError);
        return;
      }
      const blockedIds = new Set(
        (blocks ?? []).map((block) =>
          block.blocker_id === accountId ? block.blocked_id : block.blocker_id,
        ),
      );
      const blockedByMeIds = (blocks ?? [])
        .filter((block) => block.blocker_id === accountId)
        .map((block) => block.blocked_id);
      const joinedResult = await client
        .from("friend_requests")
        .select(`
          *,
          sender:profiles!friend_requests_sender_id_fkey(*),
          receiver:profiles!friend_requests_receiver_id_fkey(*)
        `)
        .eq("status", "accepted")
        .or(`sender_id.eq.${accountId},receiver_id.eq.${accountId}`);
      let requests = (joinedResult.data ?? []) as AcceptedFriendRequest[];
      let requestsError = joinedResult.error;
      if (joinedResult.error) {
        console.error("Supabase friend profile join error; retrying without joins:", joinedResult.error);
        const fallbackResult = await client
          .from("friend_requests")
          .select("sender_id, receiver_id")
          .eq("status", "accepted")
          .or(`sender_id.eq.${accountId},receiver_id.eq.${accountId}`);
        requestsError = fallbackResult.error;
        requests = (fallbackResult.data ?? []) as AcceptedFriendRequest[];
      }
      if (cancelled || requestsError || sequence !== refreshSequence) {
        if (requestsError) console.error("Supabase friendships fallback query error:", requestsError);
        return;
      }
      const acceptedFriends: (Friend | null)[] = await Promise.all(
        (requests ?? []).map(async (request): Promise<Friend | null> => {
          const friendId = otherParticipantId(accountId, request.sender_id, request.receiver_id);
          if (!friendId || blockedIds.has(friendId)) return null;
          const relatedProfile = request.sender_id === accountId ? request.receiver : request.sender;
          let friendProfile = Array.isArray(relatedProfile) ? relatedProfile[0] : relatedProfile;
          if (!friendProfile) {
            const { data: fallbackProfile, error: fallbackError } = await client
              .from("profiles")
              .select(
                "id, username, display_name, bio, avatar_url, city, birth_year, age, online, status, hide_profile_details, hide_following, hide_city_age, hide_online_status, points, gold, games_played, wins, losses",
              )
              .eq("id", friendId)
              .maybeSingle();
            if (fallbackError) {
              console.error("Supabase friend profile fallback error:", fallbackError);
            }
            friendProfile = fallbackProfile;
          }
          if (!friendProfile) return null;
          const gamesPlayed = Number(friendProfile.games_played ?? 0);
          return {
            id: String(friendProfile.id ?? friendId),
            name: String(friendProfile.display_name ?? friendProfile.username ?? "یاریزان"),
            status: friendProfile.status === "in_game" ? "in_game" : "online",
            handle: String(friendProfile.username ?? ""),
            ...(friendProfile.bio ? { bio: friendProfile.bio } : {}),
            avatar: String(friendProfile.avatar_url ?? ""),
            ...(friendProfile.city ? { city: friendProfile.city } : {}),
            ...(friendProfile.birth_year ? { birth_year: friendProfile.birth_year } : {}),
            online: friendProfile.online !== false,
            hideProfileDetails: friendProfile.hide_profile_details === true,
            hideFollowing: friendProfile.hide_following === true,
            hideCityAge: friendProfile.hide_city_age === true || friendProfile.hide_profile_details === true,
            hideOnlineStatus: friendProfile.hide_online_status === true,
            ...(friendProfile.age ? { age: friendProfile.age } : {}),
            points: Number(friendProfile.points ?? 0),
            gold: Number(friendProfile.gold ?? 0),
            games_played: gamesPlayed,
            wins: Number(friendProfile.wins ?? 0),
            losses: Number(friendProfile.losses ?? Math.max(0, gamesPlayed - Number(friendProfile.wins ?? 0))),
          };
        }),
      );
      if (cancelled || sequence !== refreshSequence) return;
      const friends = Array.from(
        new Map(
          acceptedFriends
            .filter((friend): friend is Friend => friend !== null)
            .map((friend) => [friend.id, friend]),
        ).values(),
      );
        console.log("FRIENDS LIST RESULT:", friends);
      const blockedProfiles: (Friend | null)[] = await Promise.all(
        blockedByMeIds.map(async (blockedId): Promise<Friend | null> => {
          try {
            const { data: profile, error: profileError } = await client
              .from("profiles")
              .select(
                "id, username, display_name, bio, avatar_url, city, birth_year, age, online, status, hide_profile_details, hide_following, hide_city_age, hide_online_status, points, gold, games_played, wins, losses",
              )
              .eq("id", blockedId)
              .maybeSingle();
            if (profileError || !profile) return null;
            const gamesPlayed = Number(profile.games_played ?? 0);
            return {
              id: String(profile.id),
              name: String(profile.display_name ?? profile.username ?? "یاریزان"),
              status: profile.status === "in_game" ? "in_game" : "online",
              handle: String(profile.username ?? ""),
              ...(profile.bio ? { bio: profile.bio } : {}),
              avatar: String(profile.avatar_url ?? ""),
              ...(profile.city ? { city: profile.city } : {}),
              ...(profile.birth_year ? { birth_year: profile.birth_year } : {}),
              online: profile.online !== false,
              hideProfileDetails: profile.hide_profile_details === true,
              hideFollowing: profile.hide_following === true,
              hideCityAge: profile.hide_city_age === true || profile.hide_profile_details === true,
              hideOnlineStatus: profile.hide_online_status === true,
              ...(profile.age ? { age: profile.age } : {}),
              points: Number(profile.points ?? 0),
              gold: Number(profile.gold ?? 0),
              games_played: gamesPlayed,
              wins: Number(profile.wins ?? 0),
              losses: Number(profile.losses ?? Math.max(0, gamesPlayed - Number(profile.wins ?? 0))),
            };
          } catch (error) {
            console.error("Supabase blocked profile refresh error:", error);
            return null;
          }
        }),
      );
      if (cancelled || sequence !== refreshSequence) return;
      setState((previous) => ({
        ...previous,
        friends: Array.from(
          new Map(
            [
              ...(previous.friends ?? []).filter((friend) => blockedIds.has(friend.id)),
              ...friends,
              ...blockedProfiles.filter((friend): friend is Friend => friend !== null),
            ].map((friend) => [friend.id, friend]),
          ).values(),
        ),
        blockedIds: Array.from(blockedIds),
        blockedByMeIds,
      }));
    };
    const channel = supabase
      .channel(`friendships:${accountId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "friend_requests" },
        () => void loadAcceptedFriends(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "friend_requests" },
        () => void loadAcceptedFriends(),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "friend_requests" },
        (payload) => {
          const row = payload.old as { sender_id?: string; receiver_id?: string };
          const friendId = row.sender_id && row.receiver_id
            ? otherParticipantId(accountId, row.sender_id, row.receiver_id)
            : null;
          if (friendId) {
            setState((previous) => {
              const directMessages = { ...previous.directMessages };
              delete directMessages[friendId];
              const readAt = { ...previous.readAt };
              delete readAt[friendId];
              return {
                ...previous,
                friends: previous.friends.filter((friend) => friend.id !== friendId),
                directMessages,
                readAt,
              };
            });
          }
            void loadAcceptedFriends();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_blocks" },
        () => void loadAcceptedFriends(),
      )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles" },
          () => void loadAcceptedFriends(),
        )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void loadAcceptedFriends();
      });
    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [state.user?.id]);

  useEffect(() => {
    if (!hydrated) return;
    if (!state.user?.id) return;
    try {
      localStorage.setItem(userStorageKey(state.user.id, "app_state"), JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  useEffect(() => {
    if (!state.user?.id || !state.isProMember) return;
    const today = new Date().toISOString().slice(0, 10);
    if (state.dailyGoldClaimedDate === today) return;
    setState((previous) => ({
      ...previous,
      gold: previous.gold + 20,
      dailyGoldClaimedDate: today,
    }));
    localStorage.setItem(userStorageKey(state.user.id, "dailyGoldClaimedDate"), today);
  }, [state.user?.id, state.isProMember, state.dailyGoldClaimedDate]);

  const patch = useCallback((fn: (prev: State) => State) => setState(fn), []);
  const markFriendRequestSent = useCallback(
    (id: string) =>
      patch((p) =>
        (p.sentRequests ?? []).includes(id)
          ? p
          : { ...p, sentRequests: [...(p.sentRequests ?? []), id] },
      ),
    [patch],
  );
  const clearFriendRequestSent = useCallback(
    (id: string) =>
      patch((p) =>
        (p.sentRequests ?? []).includes(id)
          ? { ...p, sentRequests: p.sentRequests.filter((requestId) => requestId !== id) }
          : p,
      ),
    [patch],
  );

  const value = useMemo<Ctx>(() => {
    const friends = Array.isArray(state.friends) ? state.friends : [];
    const blockedIds = Array.isArray(state.blockedIds) ? state.blockedIds : [];
    const directMessages =
      state.directMessages && typeof state.directMessages === "object" ? state.directMessages : {};
    const readAt = state.readAt && typeof state.readAt === "object" ? state.readAt : {};
    const groups = Array.isArray(state.groups) ? state.groups : [];
    const blockedByMeIds = Array.isArray(state.blockedByMeIds) ? state.blockedByMeIds : [];
    const passwordChangedAt = state.savedAccount?.lastPasswordChangedAt ?? null;
    const currentPassword = state.savedAccount?.password ?? "";
    const linkedEmail = state.savedAccount?.email ?? null;
    const visibleFriends = friends
      .filter((f) => f?.id && !blockedIds.includes(f.id))
      .sort((first, second) => {
        const latestFor = (friendId: string) =>
          Math.max(...(directMessages[friendId] ?? []).map((message) => message.at), 0);
        return latestFor(second.id) - latestFor(first.id);
      });
    const blockedFriends = friends.filter((f) => f?.id && blockedByMeIds.includes(f.id));

    const unreadFor = (friendId: string) => {
      if (blockedIds.includes(friendId)) return 0;
      const last = readAt[friendId] ?? 0;
      return (directMessages[friendId] ?? []).filter(
        (message) =>
          message.senderId !== state.user?.id &&
          message.senderId !== "me" &&
          message.at > last &&
          !message.readAt,
      ).length;
    };

    const totalUnread = visibleFriends.reduce((sum, f) => sum + unreadFor(f.id), 0);
    const blockUser = (target: {
      id: string;
      name?: string;
      avatar?: string;
      points?: number;
      gold?: number;
      games_played?: number;
      wins?: number;
      losses?: number;
    } | string) => {
      const friendId = typeof target === "string" ? target : target.id;
      const existingFriend = state.friends.find((friend) => friend.id === friendId);
      const targetFriend =
        existingFriend ??
        (typeof target === "string"
          ? undefined
          : {
              id: target.id,
              name: target.name ?? "یاریزان",
              avatar: target.avatar ?? "",
              points: target.points ?? 0,
              gold: target.gold ?? 0,
              games_played: target.games_played ?? 0,
              wins: target.wins ?? 0,
              ...(target.losses === undefined ? {} : { losses: target.losses }),
            });
      const accountId = state.user?.id;
      patch((p) => {
        const directMessages = { ...p.directMessages };
        delete directMessages[friendId];
        const nextReadAt = { ...p.readAt };
        delete nextReadAt[friendId];
        return {
          ...p,
          blockedIds: p.blockedIds.includes(friendId)
            ? p.blockedIds
            : [...p.blockedIds, friendId],
          blockedByMeIds: (p.blockedByMeIds ?? []).includes(friendId)
            ? p.blockedByMeIds ?? []
            : [...(p.blockedByMeIds ?? []), friendId],
          friends:
            targetFriend && !p.friends.some((friend) => friend.id === friendId)
              ? [...p.friends, targetFriend]
              : p.friends,
          directMessages,
          readAt: nextReadAt,
        };
      });
      if (supabase && accountId) {
        void Promise.all([
          supabase
            .from("profile_blocks")
            .upsert(
              { blocker_id: accountId, blocked_id: friendId },
              { onConflict: "blocker_id,blocked_id" },
            ),
          supabase
            .from("friend_requests")
            .delete()
            .or(`and(sender_id.eq.${accountId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${accountId})`),
          supabase
            .from("direct_messages")
            .delete()
            .or(`and(sender_id.eq.${accountId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${accountId})`),
        ])
          .then(([blockResult, requestResult, messageResult]) => {
            const failure = blockResult.error ?? requestResult.error ?? messageResult.error;
            if (failure) console.error("Supabase block cleanup error:", failure);
          })
          .catch((error) => console.error("Supabase block cleanup error:", error));
      }
    };

    const persistPrivacySettings = async (
      onlineValue: boolean,
      hideDetailsValue: boolean,
      hideFollowingValue: boolean,
    ) => {
      const previous = {
        online: state.online,
        hideProfileDetails: state.savedAccount?.hideProfileDetails ?? false,
        hideFollowing: state.savedAccount?.hideFollowing ?? false,
      };
      patch((current) => ({
        ...current,
        online: onlineValue,
        savedAccount: current.savedAccount
          ? {
              ...current.savedAccount,
              hideProfileDetails: hideDetailsValue,
              hideFollowing: hideFollowingValue,
            }
          : current.savedAccount,
        friends: current.friends.map((friend) =>
          friend.id === current.user?.id
            ? {
                ...friend,
                online: onlineValue,
                hideProfileDetails: hideDetailsValue,
                hideFollowing: hideFollowingValue,
              }
            : friend,
        ),
        friendRequests: current.friendRequests.map((friend) =>
          friend.id === current.user?.id
            ? {
                ...friend,
                online: onlineValue,
                hideProfileDetails: hideDetailsValue,
                hideFollowing: hideFollowingValue,
              }
            : friend,
        ),
      }));

      if (!supabase || !state.user?.id) return true;
      try {
        const { error } = await supabase.rpc("update_profile_privacy_settings", {
          new_online: onlineValue,
          new_hide_profile_details: hideDetailsValue,
          new_hide_following: hideFollowingValue,
        });
        if (error) throw error;
        return true;
      } catch (error) {
        console.error("Privacy settings update failed:", error);
        patch((current) => ({
          ...current,
          online: previous.online,
          savedAccount: current.savedAccount
            ? {
                ...current.savedAccount,
                hideProfileDetails: previous.hideProfileDetails,
                hideFollowing: previous.hideFollowing,
              }
            : current.savedAccount,
            friends: current.friends.map((friend) =>
              friend.id === state.user?.id
                ? {
                    ...friend,
                    online: previous.online,
                    hideProfileDetails: previous.hideProfileDetails,
                    hideFollowing: previous.hideFollowing,
                  }
                : friend,
            ),
            friendRequests: current.friendRequests.map((friend) =>
              friend.id === state.user?.id
                ? {
                    ...friend,
                    online: previous.online,
                    hideProfileDetails: previous.hideProfileDetails,
                    hideFollowing: previous.hideFollowing,
                  }
                : friend,
            ),
        }));
        return false;
      }
    };

    return {
      ...state,
      friends,
      groups,
      blockedIds,
      blockedByMeIds,
      directMessages,
      friendRequests: Array.isArray(state.friendRequests) ? state.friendRequests : [],
      sentRequests: Array.isArray(state.sentRequests) ? state.sentRequests : [],
      visibleFriends,
      blockedFriends,
      blockedUserIds: blockedByMeIds,
      hideFollowing: state.savedAccount?.hideFollowing ?? false,
      hideProfileDetails: state.savedAccount?.hideProfileDetails ?? false,
      passwordChangedAt,
      currentPassword,
      linkedEmail,
      unreadFor,
      totalUnread,
      playerById: (id) => globalPlayers.find((p) => p.id === id),
      acceptRequest: (id) =>
        patch((p) => {
          const req = (p.friendRequests ?? []).find((r) => r?.id === id);
          return {
            ...p,
            friendRequests: (p.friendRequests ?? []).filter((r) => r.id !== id),
            friends:
              req && !(p.friends ?? []).some((f) => f?.id === id)
                ? [...(p.friends ?? []), req]
                : (p.friends ?? []),
          };
        }),
      declineRequest: (id) =>
        patch((p) => ({
          ...p,
          friendRequests: (p.friendRequests ?? []).filter((r) => r.id !== id),
        })),
      markFriendRequestSent,
      clearFriendRequestSent,
      requestFriend: (player) => {
        if (
          state.friends.some((f) => f.id === player.id) ||
          (state.friendRequests ?? []).some((r) => r.id === player.id)
        )
          return "exists";
        patch((p) => ({
          ...p,
          friendRequests: [{ ...player } as Friend, ...(p.friendRequests ?? [])],
        }));
        return "added";
      },
      addFriend: (friend) =>
        patch((p) => ({
          ...p,
          friends: (p.friends ?? []).some((existing) => existing.id === friend.id)
            ? (p.friends ?? [])
            : [...(p.friends ?? []), friend],
          friendRequests: (p.friendRequests ?? []).filter((request) => request.id !== friend.id),
          sentRequests: (p.sentRequests ?? []).filter((requestId) => requestId !== friend.id),
        })),

      isNameTaken: (name) => {
        const q = name.trim().toLowerCase();
        if (!q) return false;
        if (q === (state.user?.name ?? "").trim().toLowerCase()) return false;
        return [...globalPlayers, ...friends, ...(state.friendRequests ?? [])].some(
          (p) => p.name.trim().toLowerCase() === q,
        );
      },
      nameCooldownDaysLeft: (() => {
        const changedAt = state.savedAccount?.last_name_change ?? state.nameChangedAt;
        if (!changedAt) return 0;
        const elapsed = Date.now() - changedAt;
        const total = 7 * 86_400_000;
        return elapsed >= total ? 0 : Math.ceil((total - elapsed) / 86_400_000);
      })(),
      updateProfile: ({ name, avatar, bio }) =>
        patch((p) => {
          if (!p.user) return p;
          const nameChanged = !!name && name !== p.user.name;
          const changedAt = Date.now();
          const lastNameChange = p.savedAccount?.last_name_change ?? p.nameChangedAt;
          const nameChangeAllowed =
            !nameChanged || !lastNameChange || changedAt - lastNameChange >= 7 * 86_400_000;
          const nextName = nameChanged && !nameChangeAllowed ? p.user.name : (name ?? p.user.name);
          return {
            ...p,
            user: {
              ...p.user,
              name: nextName,
              bio: bio ?? p.user.bio ?? "",
              avatar: avatar ?? p.user.avatar,
            },
            savedAccount: p.savedAccount
              ? {
                  ...p.savedAccount,
                  name: nextName,
                  bio: bio ?? p.savedAccount.bio ?? "",
                  last_name_change:
                    nameChanged && nameChangeAllowed ? changedAt : p.savedAccount.last_name_change,
                }
              : p.savedAccount,
            friends:
              avatar !== undefined || bio !== undefined
                ? p.friends.map((friend) =>
                    friend.id === p.user?.id
                      ? {
                          ...friend,
                          ...(avatar === undefined ? {} : { avatar }),
                          ...(bio === undefined ? {} : { bio }),
                        }
                      : friend,
                  )
                : p.friends,
            friendRequests:
              avatar !== undefined || bio !== undefined
                ? p.friendRequests.map((friend) =>
                    friend.id === p.user?.id
                      ? {
                          ...friend,
                          ...(avatar === undefined ? {} : { avatar }),
                          ...(bio === undefined ? {} : { bio }),
                        }
                      : friend,
                  )
                : p.friendRequests,
            nameChangedAt: nameChanged && nameChangeAllowed ? changedAt : p.nameChangedAt,
          };
        }),
      syncProfileName: (name, lastNameChangeAt) =>
        patch((previous) => {
          if (!previous.user) return previous;
          const changedAt = new Date(lastNameChangeAt).getTime();
          return {
            ...previous,
            user: { ...previous.user, name, last_name_change_at: lastNameChangeAt },
            savedAccount: previous.savedAccount
              ? { ...previous.savedAccount, name, last_name_change: changedAt }
              : previous.savedAccount,
            nameChangedAt: changedAt,
          };
        }),
      syncProfileUsername: (username, lastUsernameChangeAt) =>
        patch((previous) => {
          if (!previous.user) return previous;
          const changedAt = new Date(lastUsernameChangeAt).getTime();
          return {
            ...previous,
            user: {
              ...previous.user,
              handle: username,
              last_username_change_at: lastUsernameChangeAt,
            },
            savedAccount: previous.savedAccount
              ? { ...previous.savedAccount, handle: username, last_username_change: changedAt }
              : previous.savedAccount,
            friends: previous.friends.map((friend) =>
              friend.id === previous.user?.id ? { ...friend, handle: username } : friend,
            ),
            friendRequests: previous.friendRequests.map((friend) =>
              friend.id === previous.user?.id ? { ...friend, handle: username } : friend,
            ),
          };
        }),
      deleteAccount: async () => {
        const accountId = state.user?.id;
        let deletionError: unknown = null;

        try {
          if (supabase && accountId) {
            const { error: requestsError } = await supabase
              .from("friend_requests")
              .delete()
              .or(`sender_id.eq.${accountId},receiver_id.eq.${accountId}`);
            if (requestsError) throw requestsError;

            const { error: profileError } = await supabase
              .from("profiles")
              .delete()
              .eq("id", accountId);
            if (profileError) throw profileError;
          }
        } catch (error) {
          deletionError = error;
          console.error("Account deletion error:", error);
        } finally {
          if (supabase) {
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) console.error("Supabase sign-out error:", signOutError);
          }
          localStorage.removeItem(ACTIVE_SESSION_KEY);
          if (accountId) {
            try {
              localStorage.removeItem(userStorageKey(accountId, "app_state"));
              localStorage.removeItem(userStorageKey(accountId, "stickers"));
              localStorage.removeItem(userStorageKey(accountId, "active_sound"));
              localStorage.removeItem(userStorageKey(accountId, "isPro"));
              localStorage.removeItem(userStorageKey(accountId, "dailyGoldClaimedDate"));
              localStorage.removeItem(userStorageKey(accountId, "equippedProFrame"));
              localStorage.removeItem(userStorageKey(accountId, "equippedProBanner"));
            } catch {
              /* ignore */
            }
          }
          setState(seedState());
        }

        if (deletionError) {
          throw deletionError;
        }
      },

      register: (name, password, birth_year, city, suppliedId) => {
        const id = suppliedId ?? accountIdFor(name);
        if (!name.trim() || !password || localStorage.getItem(userStorageKey(id, "app_state"))) {
          return false;
        }
        setState(() => {
          localStorage.setItem(ACTIVE_SESSION_KEY, id);
          return {
            ...seedState(),
            user: {
              id,
              name,
              handle: "",
              birth_year,
              city,
              avatar: avatarFor(name || "me"),
              points: 0,
              gold: 75,
              games_played: 0,
              wins: 0,
            },
            savedAccount: { id, name, handle: "", birth_year, city, password },
          };
        });
        return true;
      },
      loginWithProfile: (profile, password) => {
        const id = profile.id;
        const gamesPlayed = profile.games_played ?? 0;
        const profileName = profile.display_name ?? profile.username;
        const lastNameChange = profile.last_name_change_at
          ? new Date(profile.last_name_change_at).getTime()
          : null;
        setState(() => ({
          ...seedState(),
          online: profile.online !== false,
          nameChangedAt: lastNameChange,
          user: {
            id,
            name: profileName,
            handle: profile.username,
            ...(profile.bio ? { bio: profile.bio } : {}),
            ...(profile.last_name_change_at
              ? { last_name_change_at: profile.last_name_change_at }
              : {}),
            ...(profile.last_username_change_at
              ? { last_username_change_at: profile.last_username_change_at }
              : {}),
            birth_year: profile.birth_year ?? undefined,
            city: profile.city ?? undefined,
            avatar: profile.avatar_url || avatarFor(profile.username),
            points: profile.points ?? 0,
            gold: profile.gold ?? 75,
            games_played: gamesPlayed,
            wins: profile.wins ?? 0,
          },
          gold: profile.gold ?? 75,
          savedAccount: {
            id,
            name: profileName,
            handle: profile.username,
            hideProfileDetails: profile.hide_profile_details === true,
            hideFollowing: profile.hide_following === true,
            hideCityAge: profile.hide_city_age === true || profile.hide_profile_details === true,
            hideOnlineStatus: profile.hide_online_status === true,
            ...(lastNameChange !== null ? { last_name_change: lastNameChange } : {}),
            ...(profile.last_username_change_at
              ? { last_username_change: new Date(profile.last_username_change_at).getTime() }
              : {}),
            birth_year: profile.birth_year ?? undefined,
            city: profile.city ?? undefined,
            password,
          },
        }));
        localStorage.setItem(ACTIVE_SESSION_KEY, id);
      },
      login: (name, password) => {
        const id = accountIdFor(name);
        let stored: Partial<State> = {};
        try {
          const raw = localStorage.getItem(userStorageKey(id, "app_state"));
          if (raw) stored = JSON.parse(raw) as Partial<State>;
        } catch {
          return false;
        }
        if (!stored.user || stored.savedAccount?.password !== password) return false;
        const isProMember =
          localStorage.getItem(userStorageKey(id, "isPro")) === "true" ||
          stored.isProMember === true;
        setState(() => ({
          ...seedState(),
          ...stored,
          isProMember,
          user: {
            id,
            name,
            handle: stored.user?.handle ?? stored.savedAccount?.handle ?? "",
            birth_year: stored.user?.birth_year ?? stored.savedAccount?.birth_year,
            city: stored.user?.city ?? stored.savedAccount?.city,
            avatar: avatarFor(name || "me"),
            points: stored.user?.points ?? 1840,
            games_played: stored.user?.games_played ?? 62,
            wins: stored.user?.wins ?? 35,
          },
          savedAccount: {
            id,
            name,
            handle: stored.user?.handle ?? stored.savedAccount?.handle ?? "",
            birth_year: stored.savedAccount?.birth_year ?? stored.user?.birth_year,
            city: stored.savedAccount?.city ?? stored.user?.city,
            hideProfileDetails: stored.savedAccount?.hideProfileDetails ?? false,
            hideFollowing: stored.savedAccount?.hideFollowing ?? false,
            password,
          },
        }));
        localStorage.setItem(ACTIVE_SESSION_KEY, id);
        return true;
      },
      loginSaved: () =>
        setState((p) => {
          const name = p.savedAccount?.name ?? "یاریزان";
          const id = p.savedAccount?.id ?? accountIdFor(name);
          localStorage.setItem(ACTIVE_SESSION_KEY, id);
          let stored: Partial<State> = {};
          try {
            const raw = localStorage.getItem(userStorageKey(id, "app_state"));
            if (raw) stored = JSON.parse(raw) as Partial<State>;
          } catch {
            /* ignore */
          }
          return {
            ...seedState(),
            ...stored,
            isProMember:
              localStorage.getItem(userStorageKey(id, "isPro")) === "true" ||
              stored.isProMember === true,
            equippedProFrame:
              localStorage.getItem(userStorageKey(id, "equippedProFrame")) ??
              stored.equippedProFrame ??
              null,
            equippedProBanner:
              localStorage.getItem(userStorageKey(id, "equippedProBanner")) ??
              stored.equippedProBanner ??
              null,
            user: {
              id,
              name,
              handle: stored.user?.handle ?? stored.savedAccount?.handle ?? "",
              birth_year: stored.user?.birth_year ?? stored.savedAccount?.birth_year,
              city: stored.user?.city ?? stored.savedAccount?.city,
              avatar: avatarFor(name),
              points: 1840,
              games_played: 62,
              wins: 35,
            },
            savedAccount: {
              id,
              name,
              handle: stored.user?.handle ?? stored.savedAccount?.handle ?? "",
              birth_year: stored.savedAccount?.birth_year ?? stored.user?.birth_year,
              city: stored.savedAccount?.city ?? stored.user?.city,
              hideProfileDetails: stored.savedAccount?.hideProfileDetails ?? false,
              hideFollowing: stored.savedAccount?.hideFollowing ?? false,
              password: stored.savedAccount?.password,
            },
          };
        }),
      logout: () => {
        if (supabase) {
          void supabase.auth.signOut().catch((error) => {
            console.error("Supabase sign-out error:", error);
          });
        }
        localStorage.removeItem(ACTIVE_SESSION_KEY);
        setState(seedState());
      },
      setOnline: (v) =>
        persistPrivacySettings(
          v,
          state.savedAccount?.hideProfileDetails ?? false,
          state.savedAccount?.hideFollowing ?? false,
        ),
      setHideFollowing: (hidden) =>
        persistPrivacySettings(
          state.online,
          state.savedAccount?.hideProfileDetails ?? false,
          hidden,
        ),
      setHideProfileDetails: (hidden) =>
        persistPrivacySettings(
          state.online,
          hidden,
          state.savedAccount?.hideFollowing ?? false,
        ),
      isUsernameAvailable: (name) => {
        const normalized = name.trim();
        return (
          Boolean(normalized) &&
          !localStorage.getItem(userStorageKey(accountIdFor(normalized), "app_state"))
        );
      },
      updatePassword: (password) => {
        if (!state.savedAccount || password.length < 8) return false;
        const changedAt = state.savedAccount.lastPasswordChangedAt ?? 0;
        if (changedAt && Date.now() - changedAt < 10 * 86_400_000) return false;
        patch((p) => ({
          ...p,
          savedAccount: {
            ...p.savedAccount!,
            password,
            lastPasswordChangedAt: Date.now(),
          },
        }));
        return true;
      },
      linkEmail: (email) =>
        patch((p) => ({
          ...p,
          savedAccount: p.savedAccount ? { ...p.savedAccount, email } : p.savedAccount,
        })),
      addGold: (amount) => {
        patch((p) => ({
          ...p,
          gold: p.gold + amount,
          user: p.user ? { ...p.user, gold: p.user.gold + amount } : p.user,
        }));
        if (supabase && state.user?.id) {
          void supabase.rpc("add_gold", { player_id: state.user.id, amount });
        }
      },
      recordGameResult: (won) => {
        const accountId = state.user?.id;
        if (!accountId) return;
        patch((p) => ({
          ...p,
          user: p.user
            ? {
                ...p.user,
                points: p.user.points + (won ? 100 : 10),
                games_played: p.user.games_played + 1,
                wins: p.user.wins + (won ? 1 : 0),
              }
            : p.user,
        }));
        if (supabase) {
          void supabase.rpc("record_game_result", { player_id: accountId, did_win: won });
        }
      },
      spendGold: (amount) => {
        if (!Number.isFinite(amount) || amount < 0 || state.gold < amount) return false;
        patch((p) => ({ ...p, gold: p.gold - amount }));
        return true;
      },
      unlockStickerSlot: (slotIndex) => {
        const unlocked = state.unlockedStickerSlots ?? [];
        const price = [0, 75, 99, 120, 150][slotIndex];
        if (
          !Number.isInteger(slotIndex) ||
          slotIndex < 1 ||
          slotIndex > 4 ||
          unlocked.includes(slotIndex) ||
          price === undefined ||
          state.gold < price
        ) {
          return false;
        }
        patch((p) => ({
          ...p,
          gold: p.gold - price,
          unlockedStickerSlots: [...(p.unlockedStickerSlots ?? []), slotIndex].sort(
            (a, b) => a - b,
          ),
        }));
        return true;
      },
      sendDirect: async (friendId, text, imageUrl, reply) => {
        const senderId = state.user?.id;
        if (!senderId || state.blockedIds.includes(friendId)) return;
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const messageText = typeof text === "string" ? text : "";
        const messageImage = typeof imageUrl === "string" && imageUrl ? imageUrl : undefined;
        const replyToId = reply?.id && !reply.id.startsWith("temp-") ? reply.id : undefined;
        const replyToText = reply?.text || undefined;
        const replyToSenderId = reply?.senderId === "me" ? senderId : reply?.senderId;
        patch((p) => {
          const directMessages =
            p.directMessages && typeof p.directMessages === "object" ? p.directMessages : {};
          const existingMessages = Array.isArray(directMessages[friendId])
            ? directMessages[friendId]
            : [];
          return {
            ...p,
            directMessages: {
              ...directMessages,
              [friendId]: [
                ...existingMessages,
                {
                  id: tempId,
                  text: messageText,
                  senderId: senderId ?? "me",
                  ...(messageImage ? { imageUrl: messageImage } : {}),
                  ...(replyToId ? { replyToId } : {}),
                  ...(replyToText ? { replyToText } : {}),
                  ...(replyToSenderId ? { replyToSenderId } : {}),
                  at: Date.now(),
                },
              ],
            },
          };
        });
        if (!supabase) return;
        const { data, error } = await supabase
          .from("direct_messages")
          .insert({
            sender_id: senderId,
            receiver_id: friendId,
            body: messageText,
            image_url: messageImage,
            reply_to_id: replyToId,
            reply_to_text: replyToText,
            reply_to_sender_id: replyToSenderId,
          })
          .select("id, sender_id, receiver_id, body, image_url, read_at, reaction, reply_to_id, reply_to_text, reply_to_sender_id, created_at")
          .single();
        if (error || !data) {
          console.error("Supabase message send error:", error);
          patch((p) => ({
            ...p,
            directMessages: {
              ...p.directMessages,
              [friendId]: (p.directMessages[friendId] ?? []).filter((message) => message.id !== tempId),
            },
          }));
          return;
        }
        const savedMessage = data as DatabaseMessage;
        const persistedMessage = messageFromDatabase(savedMessage);
        patch((p) => {
          const existing = p.directMessages[friendId] ?? [];
          if (existing.some((message) => message.id === persistedMessage.id)) {
            return {
              ...p,
              directMessages: {
                ...p.directMessages,
                [friendId]: existing.filter((message) => message.id !== tempId),
              },
            };
          }
          return {
            ...p,
            directMessages: {
              ...p.directMessages,
              [friendId]: existing.map((message) =>
                message.id === tempId ? persistedMessage : message,
              ),
            },
          };
        });
      },
      reactToMessage: async (messageId, reaction) => {
        const reactionValue = reaction || null;
        const previousReaction = Object.values(state.directMessages)
          .flat()
          .find((message) => message.id === messageId)?.reaction;
        patch((p) => ({
          ...p,
          directMessages: Object.fromEntries(
            Object.entries(p.directMessages).map(([friendId, messages]) => [
              friendId,
              messages.map((message) => {
                if (message.id !== messageId) return message;
                const updated = { ...message };
                if (reactionValue) updated.reaction = reactionValue;
                else delete updated.reaction;
                return updated;
              }),
            ]),
          ),
        }));
        if (!supabase) return;
        const { data, error } = await supabase
          .from("direct_messages")
          .update({ reaction: reactionValue })
          .eq("id", messageId)
          .select("id")
          .maybeSingle();
        if (error || !data) {
          patch((previous) => ({
            ...previous,
            directMessages: Object.fromEntries(
              Object.entries(previous.directMessages).map(([friendId, messages]) => [
                friendId,
                messages.map((message) => {
                  if (
                    message.id !== messageId ||
                    (message.reaction ?? null) !== reactionValue
                  ) {
                    return message;
                  }
                  const restored = { ...message };
                  if (previousReaction) restored.reaction = previousReaction;
                  else delete restored.reaction;
                  return restored;
                }),
              ]),
            ),
          }));
          throw error ?? new Error("Reaction update did not match a message row");
        }
      },
      deleteDirectMessage: async (friendId, messageId) => {
        const message = state.directMessages[friendId]?.find((item) => item.id === messageId);
        if (!message) return;
        patch((previous) => ({
          ...previous,
          directMessages: {
            ...previous.directMessages,
            [friendId]: (previous.directMessages[friendId] ?? []).filter(
              (item) => item.id !== messageId,
            ),
          },
        }));
        if (!supabase || messageId.startsWith("temp-")) return;
        const { error } = await supabase.from("direct_messages").delete().eq("id", messageId);
        if (error) {
          patch((previous) => ({
            ...previous,
            directMessages: {
              ...previous.directMessages,
              [friendId]: [...(previous.directMessages[friendId] ?? []), message].sort(
                (first, second) => first.at - second.at,
              ),
            },
          }));
          throw error;
        }
      },
      sendGroup: (groupId, text) =>
        patch((p) => ({
          ...p,
          groupMessages: {
            ...p.groupMessages,
            [groupId]: [
              ...(p.groupMessages[groupId] ?? []),
              { id: crypto.randomUUID(), senderId: "me", text, at: Date.now() },
            ],
          },
        })),
      markRead: (chatId) => {
        const readTimestamp = Date.now();
        const accountId = state.user?.id;
        patch((p) => ({
          ...p,
          readAt: { ...p.readAt, [chatId]: readTimestamp },
          directMessages: {
            ...p.directMessages,
            [chatId]: (p.directMessages[chatId] ?? []).map((message) =>
              message.senderId !== accountId && message.senderId !== "me" && message.at <= readTimestamp
                ? { ...message, readAt: readTimestamp }
                : message,
            ),
          },
        }));
        if (!supabase || !accountId) return;
        void supabase
          .from("direct_messages")
          .update({ read_at: new Date(readTimestamp).toISOString() })
          .eq("sender_id", chatId)
          .eq("receiver_id", accountId)
          .is("read_at", null);
      },
      blockUser,
      blockFriend: (friendId) => blockUser(friendId),
      removeFriend: async (friendId) => {
        const accountId = state.user?.id;
        const removedFriend = state.friends.find((friend) => friend.id === friendId);
        const removedMessages = state.directMessages[friendId];
        const removedReadAt = state.readAt[friendId];
        patch((previous) => {
          const directMessages = { ...previous.directMessages };
          delete directMessages[friendId];
          const readAt = { ...previous.readAt };
          delete readAt[friendId];
          return {
            ...previous,
            friends: previous.friends.filter((friend) => friend.id !== friendId),
            directMessages,
            readAt,
          };
        });
        if (!supabase || !accountId) return;

        const { error } = await supabase.rpc("remove_friend_relationship", {
          friend_user_id: friendId,
        });
        if (error) {
          patch((previous) => {
            const directMessages = { ...previous.directMessages };
            const readAt = { ...previous.readAt };
            if (removedMessages) directMessages[friendId] = removedMessages;
            if (removedReadAt !== undefined) readAt[friendId] = removedReadAt;
            return {
              ...previous,
              friends: removedFriend && !previous.friends.some((friend) => friend.id === friendId)
                ? [...previous.friends, removedFriend]
                : previous.friends,
              directMessages,
              readAt,
            };
          });
          throw error;
        }
      },
      unblockFriend: async (friendId) => {
        const accountId = state.user?.id;
        if (!supabase || !accountId) {
          throw new Error("Authenticated account is required to unblock");
        }

        const removedFriend = state.friends.find((friend) => friend.id === friendId);
        const removedMessages = state.directMessages[friendId];
        const removedReadAt = state.readAt[friendId];
        patch((p) => {
          const directMessages = { ...p.directMessages };
          delete directMessages[friendId];
          const readAt = { ...p.readAt };
          delete readAt[friendId];
          return {
            ...p,
            blockedIds: p.blockedIds.filter((id) => id !== friendId),
            blockedByMeIds: (p.blockedByMeIds ?? []).filter((id) => id !== friendId),
            friends: p.friends.filter((friend) => friend.id !== friendId),
            directMessages,
            readAt,
          };
        });

        try {
          const { error } = await supabase.rpc("unblock_profile_relationship", {
            p_target_id: friendId,
            p_user_id: accountId,
          });
          if (error) throw error;
        } catch (error) {
          patch((p) => {
            const directMessages = { ...p.directMessages };
            const readAt = { ...p.readAt };
            if (removedMessages) directMessages[friendId] = removedMessages;
            if (removedReadAt !== undefined) readAt[friendId] = removedReadAt;
            return {
              ...p,
              blockedIds: p.blockedIds.includes(friendId)
                ? p.blockedIds
                : [...p.blockedIds, friendId],
              blockedByMeIds: (p.blockedByMeIds ?? []).includes(friendId)
                ? p.blockedByMeIds ?? []
                : [...(p.blockedByMeIds ?? []), friendId],
              friends:
                removedFriend && !p.friends.some((friend) => friend.id === friendId)
                  ? [...p.friends, removedFriend]
                  : p.friends,
              directMessages,
              readAt,
            };
          });
          throw error;
        }
      },
      createGroup: (name, memberIds) =>
        patch((p) => ({
          ...p,
          groups: [
            ...p.groups,
            {
              id: crypto.randomUUID(),
              name,
              code: String(Math.floor(100000 + Math.random() * 900000)),
              memberIds: memberIds.slice(0, 4),
              color: ["violet", "cyan", "amber", "rose"][p.groups.length % 4] ?? "violet",
            },
          ],
        })),
      leaveGroup: (groupId) =>
        patch((p) => ({ ...p, groups: p.groups.filter((g) => g.id !== groupId) })),
      joinGroupByCode: (code) => {
        const existing = state.groups.find((g) => g.code === code);
        if (existing) return existing;
        return null;
      },
      setTokenId: (id) => patch((p) => ({ ...p, tokenId: id })),
      setBoardId: (id) => patch((p) => ({ ...p, boardId: id })),
      activatePro: () => {
        if (!state.user?.id || state.isProMember) return false;
        const id = state.user.id;
        localStorage.setItem(userStorageKey(id, "isPro"), "true");
        localStorage.setItem(userStorageKey(id, "equippedProFrame"), "golden-shimmer");
        localStorage.setItem(userStorageKey(id, "equippedProBanner"), "vip-aurora");
        patch((p) => ({
          ...p,
          isProMember: true,
          gold: p.gold + 500,
          unlockedStickerSlots: p.unlockedStickerSlots.includes(1)
            ? p.unlockedStickerSlots
            : [...p.unlockedStickerSlots, 1].sort((a, b) => a - b),
          boardId: "vip-board",
          tokenId: "vip-token",
          equippedProFrame: "golden-shimmer",
          equippedProBanner: "vip-aurora",
          dailyGoldClaimedDate: null,
        }));
        return true;
      },
      setProFrame: (frame) => {
        if (!state.user?.id || !state.isProMember) return;
        localStorage.setItem(userStorageKey(state.user.id, "equippedProFrame"), frame ?? "");
        patch((p) => ({ ...p, equippedProFrame: frame }));
      },
      setProBanner: (banner) => {
        if (!state.user?.id || !state.isProMember) return;
        localStorage.setItem(userStorageKey(state.user.id, "equippedProBanner"), banner ?? "");
        patch((p) => ({ ...p, equippedProBanner: banner }));
      },
    };
  }, [state, patch, markFriendRequestSent, clearFriendRequestSent]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function formatTime(at: number) {
  const d = new Date(at);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
