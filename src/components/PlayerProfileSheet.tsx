import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Coins,
  Crown,
  Ellipsis,
  Gamepad2,
  LockKeyhole,
  MessageCircle,
  ShieldBan,
  Trophy,
  UserMinus,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useHideChrome } from "@/components/chrome";
import { avatarImageSource, formatHandle, useApp, type Friend, type Player } from "@/lib/app-store";
import { createClient } from "@supabase/supabase-js";
import { ProfileLevelProgress } from "@/components/ProfileLevelProgress";
import { useProfileRelationships } from "@/hooks/use-profile-relationships";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] || "";
const supabaseKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

type ProfilePlayer = Pick<
  Player | Friend,
  | "id"
  | "name"
  | "handle"
  | "bio"
  | "age"
  | "birth_year"
  | "city"
  | "online"
  | "hideProfileDetails"
  | "hideCityAge"
  | "hideOnlineStatus"
  | "hideFollowing"
  | "avatar"
  | "games_played"
  | "wins"
  | "losses"
  | "points"
  | "gold"
>;

type PlayerProfileSheetProps = {
  player: ProfilePlayer;
  followersCount: number;
  followingCount: number;
  onClose: () => void;
  allowFriendRequest?: boolean;
  followingHidden?: boolean;
  onMessage?: () => void;
  showActions?: boolean;
  onBlocked?: () => void;
  onRemoved?: () => void;
};

export function PlayerProfileSheet({
  player,
  onClose,
  allowFriendRequest = false,
  followingHidden = false,
  onMessage,
  showActions = false,
  onBlocked,
  onRemoved,
}: PlayerProfileSheetProps) {
  const {
    addFriend,
    blockUser,
    removeFriend,
    visibleFriends,
    blockedUserIds,
    friendRequests,
    sentRequests,
    markFriendRequestSent,
    clearFriendRequestSent,
    online,
    user,
    hideProfileDetails,
  } = useApp();
  const navigate = useNavigate();
  const isMe = player.id === "me" || player.id === user?.id;
  const [profileHideCityAge, setProfileHideCityAge] = useState(
    player.hideCityAge === true || player.hideProfileDetails === true,
  );
  const [profileHideFollowing, setProfileHideFollowing] = useState(player.hideFollowing === true);
  const [profileOnline, setProfileOnline] = useState(isMe ? online : player.online !== false);
  const [profileHideOnlineStatus, setProfileHideOnlineStatus] = useState(
    isMe ? !online : player.hideOnlineStatus === true,
  );
  const hideProfileDetailsForPlayer = isMe ? hideProfileDetails : profileHideCityAge;
  const [profileCity, setProfileCity] = useState(isMe ? user?.city : player.city);
  const initialBirthYear = isMe ? user?.birth_year : player.birth_year;
  const initialAge = isMe
    ? initialBirthYear
      ? new Date().getFullYear() - Number(initialBirthYear)
      : null
    : (player.age ??
      (initialBirthYear ? new Date().getFullYear() - Number(initialBirthYear) : null));
  const [profileAge, setProfileAge] = useState(initialAge);
  const profileDetails = hideProfileDetailsForPlayer
    ? ""
    : [profileCity, profileAge && profileAge > 0 ? `${profileAge} ساڵ` : null]
        .filter(Boolean)
        .join(" • ");
  const [profileBio, setProfileBio] = useState(
    isMe ? (user?.bio ?? player.bio ?? "") : (player.bio ?? ""),
  );
  const bio = profileBio.trim();
  const isOnline = isMe ? online : profileOnline;
  const hideOnlineStatusForPlayer = isMe ? !online : profileHideOnlineStatus;
  const showOnlineStatus = !hideOnlineStatusForPlayer;
  const gamesPlayed = player.games_played ?? 0;
  const wins = player.wins ?? 0;
  const losses = player.losses ?? Math.max(0, gamesPlayed - wins);
  const gold = player.gold ?? 0;
  const points = player.points ?? 0;
  const [socialList, setSocialList] = useState<"followers" | "following" | null>(null);
  const [selectedSocialPlayer, setSelectedSocialPlayer] = useState<Friend | null>(null);
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [profileName, setProfileName] = useState(player.name);
  const [profileHandle, setProfileHandle] = useState(player.handle ?? "");
  const [profileAvatar, setProfileAvatar] = useState(
    isMe ? (user?.avatar ?? player.avatar) : player.avatar,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [blockedByOwner, setBlockedByOwner] = useState(false);
  const isBlocked = blockedUserIds.includes(player.id) || blockedByOwner;
  const acceptedFriends = useMemo(
    () =>
      Array.isArray(visibleFriends) ? visibleFriends.filter((friend) => Boolean(friend?.id)) : [],
    [visibleFriends],
  );
  const fallbackRelationships = useMemo(
    () => (isMe ? acceptedFriends : []),
    [acceptedFriends, isMe],
  );
  const { followers, following } = useProfileRelationships(
    player.id,
    fallbackRelationships,
    blockedUserIds,
  );
  const isFriend = acceptedFriends.some((friend) => friend.id === player.id);
  const localRequestStatus = isFriend
    ? "accepted"
    : friendRequests.some((request) => request.id === player.id)
      ? "incoming"
      : sentRequests.includes(player.id)
        ? "pending"
        : null;
  const [remoteRequestStatus, setRemoteRequestStatus] = useState<{
    playerId: string;
    status: "idle" | "pending" | "incoming" | "rejected" | "accepted";
  } | null>(null);
  const requestMutationVersion = useRef(0);
  const requestMutationInProgress = useRef(false);
  const requestStatus =
    localRequestStatus ??
    (remoteRequestStatus?.playerId === player.id ? remoteRequestStatus.status : "idle");
  const canViewFollowing = isMe || (!followingHidden && !profileHideFollowing && !isBlocked);

  useEffect(() => {
    setProfileName(player.name);
    setProfileHandle(player.handle ?? "");
    setProfileBio(isMe ? (user?.bio ?? player.bio ?? "") : (player.bio ?? ""));
    setProfileHideCityAge(player.hideCityAge === true || player.hideProfileDetails === true);
    setProfileHideFollowing(player.hideFollowing === true);
    setProfileOnline(isMe ? online : player.online !== false);
    setProfileHideOnlineStatus(isMe ? !online : player.hideOnlineStatus === true);
    setProfileCity(isMe ? user?.city : player.city);
    const birthYear = isMe ? user?.birth_year : player.birth_year;
    const nextAge = isMe
      ? birthYear
        ? new Date().getFullYear() - Number(birthYear)
        : null
      : (player.age ?? (birthYear ? new Date().getFullYear() - Number(birthYear) : null));
    setProfileAge(nextAge);
    setProfileAvatar(isMe ? (user?.avatar ?? player.avatar) : player.avatar);
    if (!supabase || !player.id) return;
    const channel = supabase
      .channel(`profile-name:${player.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${player.id}`,
        },
        (payload) => {
          const updatedProfile = payload.new as {
            display_name?: string | null;
            username?: string | null;
            avatar_url?: string | null;
            bio?: string | null;
            online?: boolean | null;
            hide_profile_details?: boolean | null;
            hide_following?: boolean | null;
            hide_city_age?: boolean | null;
            hide_online_status?: boolean | null;
            city?: string | null;
            birth_year?: string | null;
            age?: number | null;
          };
          setProfileName(updatedProfile.display_name ?? updatedProfile.username ?? player.name);
          setProfileHandle(updatedProfile.username ?? player.handle ?? "");
          if (updatedProfile.avatar_url) setProfileAvatar(updatedProfile.avatar_url);
          setProfileBio(updatedProfile.bio ?? "");
          if (updatedProfile.hide_profile_details !== undefined) {
            setProfileHideCityAge(updatedProfile.hide_profile_details === true);
          }
          if (updatedProfile.hide_city_age !== undefined) {
            setProfileHideCityAge(updatedProfile.hide_city_age === true);
          }
          if (updatedProfile.hide_following !== undefined) {
            setProfileHideFollowing(updatedProfile.hide_following === true);
          }
          if (updatedProfile.hide_online_status !== undefined) {
            setProfileHideOnlineStatus(updatedProfile.hide_online_status === true);
          }
          if (updatedProfile.online !== undefined) {
            setProfileOnline(updatedProfile.online !== false);
            if (updatedProfile.hide_online_status === undefined) {
              setProfileHideOnlineStatus(updatedProfile.online === false);
            }
          }
          if (updatedProfile.city !== undefined) setProfileCity(updatedProfile.city ?? undefined);
          if (updatedProfile.age !== undefined) setProfileAge(updatedProfile.age);
          else if (updatedProfile.birth_year !== undefined) {
            setProfileAge(
              updatedProfile.birth_year
                ? new Date().getFullYear() - Number(updatedProfile.birth_year)
                : null,
            );
          }
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [
    isMe,
    player.id,
    player.name,
    player.handle,
    player.avatar,
    player.bio,
    player.hideProfileDetails,
    player.hideCityAge,
    player.hideOnlineStatus,
    player.hideFollowing,
    player.online,
    player.age,
    player.birth_year,
    player.city,
    online,
    user?.avatar,
    user?.bio,
    user?.birth_year,
    user?.city,
  ]);

  useEffect(() => {
    if (!menuOpen) return;
    const dismissMenu = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismissMenu);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissMenu);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    setBlockedByOwner(false);
    if (isMe || !user?.id || !player.id || !supabase) {
      return;
    }
    let cancelled = false;
    const checkBlockStatus = async () => {
      try {
        const { data, error } = await supabase
          .from("profile_blocks")
          .select("id")
          .eq("blocker_id", player.id)
          .eq("blocked_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error("Profile block check failed:", error);
          setBlockedByOwner(false);
          return;
        }
        setBlockedByOwner(Boolean(data));
      } catch (error) {
        if (!cancelled) {
          console.error("Profile block check failed:", error);
          setBlockedByOwner(false);
        }
      }
    };
    void checkBlockStatus();
    const channel = supabase
      .channel(`profile-block-status:${user.id}:${player.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_blocks" },
        () => void checkBlockStatus(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [isMe, player.id, user?.id]);

  useEffect(() => {
    if (!allowFriendRequest || isMe || isBlocked || !player.id) return;
    if (isFriend) {
      return;
    }
    let cancelled = false;
    let statusLoadSequence = 0;
    const loadStatus = async () => {
      const loadSequence = ++statusLoadSequence;
      const mutationVersion = requestMutationVersion.current;
      if (!supabase) {
        console.error("Supabase Error: Supabase client is not configured");
        return;
      }
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) {
        console.error("Supabase Error:", authError.message);
        return;
      }
      if (!authUser?.id) {
        console.error("Supabase Error: authenticated user ID is missing");
        return;
      }
      const { data: outgoing } = await supabase
        .from("friend_requests")
        .select("status")
        .eq("sender_id", authUser.id)
        .eq("receiver_id", player.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: incoming } = await supabase
        .from("friend_requests")
        .select("id, status")
        .eq("sender_id", player.id)
        .eq("receiver_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (
        cancelled ||
        loadSequence !== statusLoadSequence ||
        mutationVersion !== requestMutationVersion.current ||
        requestMutationInProgress.current
      ) {
        return;
      }
      const status = incoming?.status === "pending" ? "incoming" : outgoing?.status;
      if (
        status === "pending" ||
        status === "incoming" ||
        status === "rejected" ||
        status === "accepted"
      ) {
        if (status === "pending") markFriendRequestSent(player.id);
        else clearFriendRequestSent(player.id);
        setRemoteRequestStatus({ playerId: player.id, status });
      } else if (!cancelled) {
        clearFriendRequestSent(player.id);
        setRemoteRequestStatus({ playerId: player.id, status: "idle" });
      }
    };
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 5000);
    const channel = supabase
      ?.channel(`profile-friend-status:${user?.id}:${player.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests" },
        () => void loadStatus(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [
    allowFriendRequest,
    isBlocked,
    clearFriendRequestSent,
    isFriend,
    isMe,
    markFriendRequestSent,
    player.id,
    user?.id,
  ]);

  const blockProfile = () => {
    blockUser(player);
    setMenuOpen(false);
    toast.success("بلۆک کرا");
    onClose();
    onBlocked?.();
  };

  const removeProfile = () => {
    const removal = removeFriend(player.id);
    setMenuOpen(false);
    onClose();
    onRemoved?.();
    void navigate({ to: "/app/friends" });
    void removal.then(
      () => toast.success("هاوڕێ لابرا"),
      (error: unknown) => {
        console.error("Supabase friend removal error:", error);
        toast.error("نەتوانرا هاوڕێ لاببرێت");
      },
    );
  };

  const sendFriendRequest = async () => {
    if (isBlocked || requestStatus === "pending") return;
    requestMutationInProgress.current = true;
    requestMutationVersion.current += 1;
    const previousStatus = requestStatus;
    setRemoteRequestStatus({ playerId: player.id, status: "pending" });
    markFriendRequestSent(player.id);
    try {
      if (!supabase) throw new Error("Supabase client is not configured");
      if (!player.id || typeof player.id !== "string") {
        throw new Error("receiver_id is missing or invalid");
      }

      let authUserId: string | null = null;
      try {
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) {
          console.warn("Supabase auth session unavailable; using app session fallback", authError);
        }
        authUserId = authUser?.id ?? null;
      } catch (authError) {
        console.warn("Supabase auth session unavailable; using app session fallback", authError);
      }
      const currentUserId =
        user?.id ??
        localStorage.getItem("user_id") ??
        localStorage.getItem("userId") ??
        localStorage.getItem("snakes_ladders_active_session");
      const senderId = authUserId || currentUserId;
      if (!senderId) throw new Error("Current user ID is missing");

      const { data: existingPending, error: pendingLookupError } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("sender_id", senderId)
        .eq("receiver_id", player.id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      if (pendingLookupError) throw pendingLookupError;
      if (existingPending) {
        return;
      }

      const { error } = await supabase.from("friend_requests").insert({
        sender_id: senderId,
        receiver_id: player.id,
        status: "pending",
        created_at: new Date().toISOString(),
      });
      if (error) throw error;

      toast.success("داواکاری نێردرا");
    } catch (error) {
      console.error("Supabase Friend Request Error:", error);
      clearFriendRequestSent(player.id);
      setRemoteRequestStatus({ playerId: player.id, status: previousStatus });
      toast.error("داواکاری نەنێردرا");
    } finally {
      requestMutationInProgress.current = false;
      requestMutationVersion.current += 1;
    }
  };
  const cancelFriendRequest = async () => {
    if (requestStatus !== "pending") return;
    requestMutationInProgress.current = true;
    requestMutationVersion.current += 1;
    setRemoteRequestStatus({ playerId: player.id, status: "idle" });
    clearFriendRequestSent(player.id);

    try {
      if (!supabase) throw new Error("Supabase client is not configured");

      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      const senderId =
        authUser?.id ??
        user?.id ??
        localStorage.getItem("user_id") ??
        localStorage.getItem("userId") ??
        localStorage.getItem("snakes_ladders_active_session");
      if (!senderId) throw new Error("Current user ID is missing");

      const { error } = await supabase
        .from("friend_requests")
        .delete()
        .eq("sender_id", senderId)
        .eq("receiver_id", player.id)
        .eq("status", "pending");
      if (error) throw error;
    } catch (error) {
      console.error("Supabase friend request cancellation error:", error);
      markFriendRequestSent(player.id);
      setRemoteRequestStatus({ playerId: player.id, status: "pending" });
      toast.error("نەتوانرا داواکارییەکە هەڵبوەشێندرێتەوە");
    } finally {
      requestMutationInProgress.current = false;
      requestMutationVersion.current += 1;
    }
  };
  const acceptIncomingRequest = async () => {
    if (!supabase || isBlocked || requestStatus !== "incoming") return;
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) return;
    const { error } = await supabase.rpc("accept_friend_request", {
      request_id: null,
      sender_user_id: player.id,
      receiver_user_id: authUser.id,
    });
    if (error) {
      toast.error("نەتوانرا داواکارییەکە قبوڵ بکرێت");
      return;
    }
    addFriend(player as Friend);
    setRemoteRequestStatus({ playerId: player.id, status: "accepted" });
    toast.success("هاوڕێ زیادکرا");
  };
  const friendRequestAction =
    allowFriendRequest && !isMe ? (
      isBlocked ? (
        <button
          type="button"
          disabled
          aria-label="بلۆکراوی"
          className="inline-flex h-8 shrink-0 cursor-not-allowed items-center rounded-lg bg-gray-500 px-2.5 text-[11px] font-bold text-gray-100 opacity-80"
        >
          بلۆکراوی
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (requestStatus === "incoming") {
              void acceptIncomingRequest();
            } else if (requestStatus === "pending") {
              void cancelFriendRequest();
            } else if (isFriend || requestStatus === "accepted") {
              onMessage?.();
            } else {
              void sendFriendRequest();
            }
          }}
          aria-label={
            requestStatus === "incoming"
              ? "قبوڵکردنی داواکاری هاوڕێتی"
              : requestStatus === "pending"
                ? "هەڵوەشاندنەوەی داواکاری هاوڕێتی"
                : isFriend || requestStatus === "accepted"
                  ? "ناردنی نامە"
                  : "داوای هاوڕێتی"
          }
          className={`press inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition-colors ${requestStatus === "incoming" ? "bg-yellow-400 text-yellow-950" : isFriend || requestStatus === "accepted" ? "border border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : requestStatus === "pending" ? "bg-white/10 text-white/70" : "bg-red-500/90 text-white"}`}
        >
          {requestStatus === "incoming" ? (
            <Check className="size-3.5" />
          ) : isFriend || requestStatus === "accepted" ? (
            <MessageCircle className="size-3.5" />
          ) : (
            <UserPlus className="size-3.5" />
          )}
          <span>
            {requestStatus === "incoming"
              ? "قبوڵ"
              : isFriend || requestStatus === "accepted"
                ? "نامە"
                : requestStatus === "pending"
                  ? "نێردرا"
                  : "هاوڕێتی"}
          </span>
        </button>
      )
    ) : null;
  useHideChrome();

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh flex-col bg-black/75" onClick={onClose}>
      <div
        className="relative isolate flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.2),_transparent_48%),linear-gradient(160deg,#07130f_0%,#0b1712_55%,#050b09_100%)] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-white shadow-[0_0_70px_rgba(16,185,129,0.12)] sm:px-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative flex min-h-10 items-center justify-end">
          <h2 className="absolute left-1/2 max-w-[calc(100%_-_6rem)] -translate-x-1/2 truncate text-center text-base font-extrabold text-white sm:text-lg">
            پرۆفایلی یاریزان
          </h2>
          <button
            onClick={onClose}
            aria-label="گەڕانەوە"
            className="press absolute left-0 top-0 flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
          >
            <ArrowRight className="size-5" />
          </button>
          {showActions && !isMe && (
            <div ref={profileMenuRef} className="absolute right-0 top-0">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="هەڵبژاردەکانی پرۆفایل"
                className="press flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
              >
                <Ellipsis className="size-5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 z-20 max-h-[min(60vh,24rem)] w-[min(9rem,calc(100vw-2.5rem))] overflow-y-auto rounded-xl border border-white/10 bg-[#0b1712]/95 p-1.5 shadow-xl backdrop-blur-md">
                  {isFriend && (
                    <button
                      type="button"
                      onClick={removeProfile}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm font-bold text-white hover:bg-white/10"
                    >
                      <UserMinus className="size-4" />
                      لابردن
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={blockProfile}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-sm font-bold text-red-300 hover:bg-red-400/10"
                  >
                    <ShieldBan className="size-4" />
                    بلۆککردن
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4" dir="ltr">
          <div
            className={`relative size-22 rounded-full p-[3px] ring-2 ${isOnline && showOnlineStatus ? "shadow-[0_0_28px_rgba(52,211,153,0.45)] ring-emerald-400/80" : "shadow-[0_0_16px_rgba(148,163,184,0.18)] ring-slate-400/60"}`}
          >
            <img
              src={avatarImageSource(profileAvatar)}
              alt={profileName}
              className={`size-full rounded-full border bg-emerald-950 object-cover ${isOnline && showOnlineStatus ? "border-emerald-100/30" : "border-slate-400/60"}`}
            />
            {isOnline && showOnlineStatus && (
              <span
                aria-label="سەرهێڵ"
                className="absolute bottom-1 right-1 size-4 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] ring-2 ring-[#07130f]"
              />
            )}
          </div>
          <div className="min-w-0 pt-1 text-left" dir="auto">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="max-w-full break-words text-xl font-extrabold text-white sm:text-2xl">
                {profileName}
              </h3>
              {friendRequestAction}
            </div>
            {formatHandle(profileHandle) && (
              <button
                type="button"
                onClick={async () => {
                  const handle = formatHandle(profileHandle);
                  await navigator.clipboard?.writeText(handle);
                  setCopiedHandle(true);
                  window.setTimeout(() => setCopiedHandle(false), 2000);
                }}
                className="mt-1 flex items-center gap-1 text-xs text-white/50"
              >
                {formatHandle(profileHandle)}
                {copiedHandle && <Check className="size-3 text-emerald-400" />}
              </button>
            )}
            {showOnlineStatus && (
              <span
                className={`mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold ${isOnline ? "text-emerald-300" : "text-slate-400"}`}
              >
                <span
                  className={`size-1.5 rounded-full ${isOnline ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-slate-400"}`}
                />
                {isOnline ? "چالاک" : "ناچالاک"}
              </span>
            )}
            {profileDetails && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-100/75">
                <Crown className="size-3.5 shrink-0 text-amber-300" />
                <span className="break-words">{profileDetails}</span>
              </p>
            )}
            {bio && (
              <p className="mt-2 flex items-start gap-1.5 break-words text-xs leading-relaxed text-emerald-100/70">
                <Gamepad2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                <span>{bio}</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
          <ProfileStat label="زێڕ" value={gold} icon={Coins} tone="gold" />
          {canViewFollowing ? (
            <button type="button" onClick={() => setSocialList("following")}>
              <ProfileStat label="Following" value={following.length} icon={UserCheck} />
            </button>
          ) : (
            <div
              aria-label="Following private"
              className="flex min-w-0 flex-col items-center rounded-xl border border-emerald-400/15 bg-white/[0.045] p-2 text-white/45 sm:rounded-2xl sm:p-3"
            >
              <LockKeyhole className="mb-1 size-4" />
              <p className="text-[10px] font-semibold leading-tight">Following</p>
              <p className="mt-1 text-[10px] leading-tight">Private</p>
            </div>
          )}
          {!blockedByOwner ? (
            <button type="button" onClick={() => setSocialList("followers")}>
              <ProfileStat label="Followers" value={followers.length} icon={Users} />
            </button>
          ) : (
            <ProfileStat label="Followers" value={followers.length} icon={Users} />
          )}
        </div>

        <ProfileLevelProgress points={points} />

        <div className="mt-5 grid min-w-0 grid-cols-3 gap-2 border-t border-white/10 pt-4 sm:gap-3">
          <ProfileStat label="یاریکردن" value={gamesPlayed} icon={Gamepad2} />
          <ProfileStat label="بردنەوە" value={wins} icon={Trophy} />
          <ProfileStat label="دۆڕان" value={losses} icon={XCircle} />
        </div>
      </div>
      {socialList && (
        <SocialListOverlay
          title={socialList}
          players={socialList === "followers" ? followers : following}
          onClose={() => setSocialList(null)}
          onSelect={(listedPlayer) => setSelectedSocialPlayer(listedPlayer)}
        />
      )}
      {selectedSocialPlayer && (
        <PlayerProfileSheet
          player={selectedSocialPlayer}
          followersCount={acceptedFriends.length}
          followingCount={acceptedFriends.length}
          onClose={() => setSelectedSocialPlayer(null)}
        />
      )}
    </div>
  );
}

function SocialListOverlay({
  title,
  players,
  onClose,
  onSelect,
}: {
  title: "followers" | "following";
  players: Friend[];
  onClose: () => void;
  onSelect: (player: Friend) => void;
}) {
  useHideChrome();
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.16),_transparent_48%),linear-gradient(160deg,#07130f_0%,#0b1712_55%,#050b09_100%)] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8 text-white">
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
        >
          <span className="text-xl">×</span>
        </button>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <span className="size-11" />
      </div>
      <div className="mt-5 flex-1 space-y-3 overflow-y-auto no-scrollbar">
        {players.map((listedPlayer) => (
          <button
            key={listedPlayer.id}
            onClick={() => onSelect(listedPlayer)}
            className="press flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-right"
          >
            <img
              src={avatarImageSource(listedPlayer.avatar)}
              alt={listedPlayer.name}
              className="size-12 rounded-full border border-emerald-400/40 bg-emerald-950 object-cover"
            />
            <span className="flex-1 font-bold text-white">{listedPlayer.name}</span>
            {formatHandle(listedPlayer.handle) && (
              <span className="text-xs text-white/50">{formatHandle(listedPlayer.handle)}</span>
            )}
          </button>
        ))}
        {players.length === 0 && (
          <p className="pt-10 text-center text-sm text-white/50">هیچ بەکارهێنەرێک نییە</p>
        )}
      </div>
    </div>
  );
}

function ProfileStat({
  label,
  value,
  icon: Icon,
  tone = "emerald",
}: {
  label: string;
  value: number;
  icon?: typeof Coins;
  tone?: "emerald" | "gold";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-emerald-400/15 bg-white/[0.045] p-2 text-center transition-colors hover:border-emerald-300/35 sm:rounded-2xl sm:p-3">
      {Icon && (
        <Icon
          className={`mx-auto mb-1 size-4 ${tone === "gold" ? "text-amber-300" : "text-emerald-300"}`}
        />
      )}
      <p className="text-lg font-extrabold tabular-nums text-white sm:text-xl">{value}</p>
      <p className="mt-1 break-words text-[10px] leading-tight text-white/55 sm:text-[11px]">
        {label}
      </p>
    </div>
  );
}
