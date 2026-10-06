import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AtSign,
  Camera,
  Check,
  Coins,
  Crown,
  Eye,
  EyeOff,
  FileText,
  Gamepad2,
  Image,
  LogOut,
  MapPin,
  Menu,
  ShieldBan,
  Trash2,
  Type,
  Trophy,
  UserRound,
  UserCheck,
  UserX,
  Users,
  Wifi,
  ZoomIn,
  XCircle,
  X,
} from "lucide-react";
import { avatarImageSource, formatHandle, useApp, type Friend } from "@/lib/app-store";
import { toast } from "sonner";
import { useHideChrome } from "@/components/chrome";
import { ProfileLevelProgress } from "@/components/ProfileLevelProgress";
import { PlayerProfileSheet } from "@/components/PlayerProfileSheet";
import { useProfileRelationships } from "@/hooks/use-profile-relationships";
import { createClient } from "@supabase/supabase-js";
import { upsertProfile } from "@/lib/supabase";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] || "";
const supabaseKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export const Route = createFileRoute("/app/profile")({
  head: () => ({
    meta: [
      { title: "پرۆفایل — مار و پەیژە" },
      { name: "description", content: "پرۆفایل، ئاماری یاری و ڕێکخستنەکانی هەژمار." },
      { property: "og:title", content: "پرۆفایل — مار و پەیژە" },
      { property: "og:description", content: "پرۆفایل و ئاماری یاریزان." },
    ],
  }),
  component: ProfileTab,
});

function ProfileTab() {
  const {
    user,
    gold,
    isProMember,
    equippedProFrame,
    visibleFriends,
    blockedUserIds,
    hideProfileDetails,
    online,
  } = useApp();
  const handleText = formatHandle(user?.handle);
  const age = user?.birth_year ? new Date().getFullYear() - Number(user.birth_year) : null;
  const profileDetails =
    !hideProfileDetails && user?.city && age && age > 0 ? `${user.city} • ${age} ساڵ` : null;
  const bio = user?.bio?.trim();
  const points = user?.points ?? 0;
  const gamesPlayed = user?.games_played ?? 0;
  const wins = user?.wins ?? 0;
  const losses = Math.max(0, gamesPlayed - wins);
  const { followers, following } = useProfileRelationships(
    user?.id,
    visibleFriends,
    blockedUserIds,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const [usernameEditOpen, setUsernameEditOpen] = useState(false);
  const [pictureEditOpen, setPictureEditOpen] = useState(false);
  const [bioEditOpen, setBioEditOpen] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [socialList, setSocialList] = useState<"followers" | "following" | null>(null);
  const [selectedSocialPlayer, setSelectedSocialPlayer] = useState<
    (typeof visibleFriends)[number] | null
  >(null);

  return (
    <section className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.2),_transparent_48%),linear-gradient(160deg,#07130f_0%,#0b1712_55%,#050b09_100%)] px-4 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] pb-32 text-white">
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="مێنیو"
        className="press absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white shadow-[0_0_24px_rgba(16,185,129,0.12)]"
      >
        <Menu className="size-5" />
      </button>

      <div
        className="animate-rise-in grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4"
        dir="ltr"
      >
        <div
          className={`relative size-22 rounded-full p-[3px] ring-2 ${online ? "shadow-[0_0_28px_rgba(52,211,153,0.45)] ring-emerald-400/80" : "shadow-[0_0_16px_rgba(148,163,184,0.18)] ring-slate-400/60"}`}
        >
          <img
            src={avatarImageSource(user?.avatar)}
            alt={user?.name ?? "پرۆفایل"}
            className={`size-full rounded-full border bg-emerald-950 object-cover ${isProMember && equippedProFrame ? "border-4 border-yellow-300 shadow-[0_0_24px_rgba(250,204,21,.45)]" : online ? "border-emerald-100/30" : "border-slate-400/70"}`}
          />
          {online && (
            <span
              aria-label="سەرهێڵ"
              className="absolute bottom-1 right-1 size-4 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.95)] ring-2 ring-[#07130f]"
            />
          )}
        </div>
        <div className="min-w-0 pt-1 text-left" dir="auto">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="max-w-full break-words text-xl font-extrabold text-white sm:text-2xl">
              {user?.name ?? "یاریزان"}
            </h1>
            {isProMember && (
              <span className="flex items-center gap-1 rounded-full border border-yellow-300/30 bg-yellow-300/10 px-2 py-1 text-[10px] font-black text-yellow-200">
                <Crown className="size-3" /> PRO
              </span>
            )}
          </div>
          {handleText && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(handleText).then(() => {
                  setCopiedHandle(true);
                  window.setTimeout(() => setCopiedHandle(false), 2000);
                });
              }}
              className="mt-1 flex items-center gap-1 text-xs text-white/50"
            >
              {handleText}
              {copiedHandle && <Check className="size-3 text-emerald-400" />}
            </button>
          )}
          {profileDetails && !hideProfileDetails && (
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
        <Stat label="زێڕ" value={gold} icon={Coins} tone="gold" />
        <button type="button" onClick={() => setSocialList("following")}>
          <Stat label="Following" value={following.length} icon={UserCheck} />
        </button>
        <button type="button" onClick={() => setSocialList("followers")}>
          <Stat label="Followers" value={followers.length} icon={Users} />
        </button>
      </div>

      <ProfileLevelProgress points={points} />

      <div className="mt-5 grid min-w-0 grid-cols-3 gap-2 border-t border-white/10 pt-4 sm:gap-3">
        <Stat label="یاریکردن" value={gamesPlayed} icon={Gamepad2} />
        <Stat label="بردنەوە" value={wins} icon={Trophy} />
        <Stat label="دۆڕان" value={losses} icon={XCircle} />
      </div>

      {menuOpen && (
        <ProfileMenu
          onClose={() => setMenuOpen(false)}
          onEdit={() => setEditOpen(true)}
          onEditName={() => setNameEditOpen(true)}
          onEditUsername={() => setUsernameEditOpen(true)}
          onEditPicture={() => setPictureEditOpen(true)}
          onEditBio={() => setBioEditOpen(true)}
        />
      )}
      {editOpen && <EditProfile onClose={() => setEditOpen(false)} />}
      {nameEditOpen && <EditDisplayName onClose={() => setNameEditOpen(false)} />}
      {usernameEditOpen && <EditUsername onClose={() => setUsernameEditOpen(false)} />}
      {pictureEditOpen && <EditProfilePicture onClose={() => setPictureEditOpen(false)} />}
      {bioEditOpen && <EditBio onClose={() => setBioEditOpen(false)} />}
      {socialList && (
        <SocialListOverlay
          title={socialList}
          players={socialList === "followers" ? followers : following}
          onClose={() => setSocialList(null)}
          onSelect={(player) => setSelectedSocialPlayer(player)}
        />
      )}
      {selectedSocialPlayer && (
        <PlayerProfileSheet
          player={selectedSocialPlayer}
          followersCount={visibleFriends.length}
          followingCount={visibleFriends.length}
          onClose={() => setSelectedSocialPlayer(null)}
        />
      )}
    </section>
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
    <div className="panel animate-soft-in fixed inset-0 z-50 flex flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-700"
        >
          <ArrowRight className="size-5" />
        </button>
        <h2 className="text-lg font-bold text-panel-foreground">{title}</h2>
        <span className="size-11" />
      </div>
      <div className="mt-5 flex-1 space-y-3 overflow-y-auto no-scrollbar">
        {players.map((player) => (
          <button
            key={player.id}
            onClick={() => onSelect(player)}
            className="glass press flex w-full items-center gap-3 rounded-2xl p-3 text-right"
          >
            <img
              src={avatarImageSource(player.avatar)}
              alt={player.name}
              className={`size-12 rounded-full bg-secondary ring-2 ${player.online === false ? "ring-slate-400/60" : "ring-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.25)]"}`}
            />
            <span className="flex-1 font-bold text-panel-foreground">{player.name}</span>
            <span className="text-xs text-panel-muted">{player.points} خاڵ</span>
          </button>
        ))}
        {players.length === 0 && (
          <p className="pt-10 text-center text-sm text-panel-muted">هیچ بەکارهێنەرێک نییە</p>
        )}
      </div>
    </div>
  );
}

function EditDisplayName({ onClose }: { onClose: () => void }) {
  const { user, nameCooldownDaysLeft, syncProfileName } = useApp();
  const [name, setName] = useState(user?.name ?? "");
  const [availability, setAvailability] = useState<
    "checking" | "available" | "taken" | "error" | null
  >(null);
  const [cooldownDaysLeft, setCooldownDaysLeft] = useState(nameCooldownDaysLeft);
  const [saving, setSaving] = useState(false);

  useHideChrome();

  useEffect(() => {
    const client = supabase;
    if (!client || !user?.id) return;
    let cancelled = false;
    const loadCooldown = async () => {
      try {
        const { data, error } = await client
          .from("profiles")
          .select("last_name_change_at")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn("Display name cooldown lookup failed:", error);
          return;
        }
        const changedAt = data?.last_name_change_at
          ? new Date(data.last_name_change_at).getTime()
          : 0;
        const remaining = changedAt + 7 * 86_400_000 - Date.now();
        setCooldownDaysLeft(remaining > 0 ? Math.ceil(remaining / 86_400_000) : 0);
      } catch (error) {
        if (!cancelled) console.warn("Display name cooldown lookup failed:", error);
      }
    };
    void loadCooldown();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 14) {
      setAvailability(null);
      return;
    }
    if (normalizedName.toLocaleLowerCase() === (user?.name ?? "").trim().toLocaleLowerCase()) {
      setAvailability("available");
      return;
    }
    const client = supabase;
    if (!client || !user?.id) {
      setAvailability("error");
      return;
    }

    let cancelled = false;
    setAvailability("checking");
    const timer = window.setTimeout(async () => {
      try {
        const escapedPattern = normalizedName.replace(/[\\%_]/g, "\\$&");
        const { data, error } = await client
          .from("profiles")
          .select("id")
          .ilike("username", escapedPattern)
          .neq("id", user.id)
          .limit(1);
        if (cancelled) return;
        if (error) {
          console.warn("Display name availability check failed:", error);
          setAvailability("error");
          return;
        }
        setAvailability(data?.length ? "taken" : "available");
      } catch (error) {
        if (cancelled) return;
        console.warn("Display name availability check failed:", error);
        setAvailability("error");
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [name, user?.id, user?.name]);

  const tooLong = name.trim().length > 14;
  const empty = !name.trim();
  const unchanged = name.trim() === (user?.name ?? "").trim();
  const invalid = tooLong || empty || availability !== "available" || cooldownDaysLeft > 0;

  const save = async () => {
    const normalizedName = name.trim();
    if (invalid || unchanged || saving || !user?.id || !supabase) return;
    setSaving(true);
    let result;
    try {
      result = await supabase.rpc("update_profile_display_name", {
        new_display_name: normalizedName,
      });
    } catch (error) {
      console.error("Display name update failed:", error);
      toast.error("نەتوانرا ناوەکە پاشەکەوت بکرێت");
      setSaving(false);
      return;
    }
    const { data, error } = result;
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("display_name_taken")) {
        setAvailability("taken");
      } else if (message.includes("name_change_cooldown")) {
        setCooldownDaysLeft(7);
      }
      toast.error(
        message.includes("display_name_taken")
          ? "ئەم ناوە دووبارەیە"
          : message.includes("name_change_cooldown")
            ? "تا ماوەی 7 ڕۆژی تر ناو ناگۆڕدرێت"
            : "نەتوانرا ناوەکە پاشەکەوت بکرێت",
      );
      setSaving(false);
      return;
    }

    const saved = Array.isArray(data) ? data[0] : data;
    const lastNameChangeAt = saved?.last_name_change_at ?? new Date().toISOString();
    syncProfileName(saved?.display_name ?? normalizedName, lastNameChangeAt);
    toast.success("ناوەکە پاشەکەوت کرا");
    setSaving(false);
    onClose();
  };

  const borderClass =
    tooLong || availability === "taken"
      ? "border-red-500 ring-2 ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
      : availability === "available" && !unchanged && !empty
        ? "border-emerald-500 ring-2 ring-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
        : "border-white/15 focus:border-emerald-400/60";

  return (
    <div className="fixed inset-0 z-[80] flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.2),_transparent_48%),linear-gradient(160deg,#07130f_0%,#0b1712_55%,#050b09_100%)] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
        >
          <ArrowRight className="size-5" />
        </button>
        <h1 className="text-base font-extrabold">ناوی بەکارهێنەر</h1>
        <span className="size-11" />
      </header>

      <div className="mx-auto mt-16 w-full max-w-md">
        <label htmlFor="display-name" className="mb-3 block text-sm font-bold text-white/80">
          ناوی بەکارهێنەر
        </label>
        <div className="relative" dir="ltr">
          <input
            id="display-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
            dir="auto"
            aria-invalid={tooLong || availability === "taken"}
            className={`w-full rounded-2xl border bg-white/[0.045] px-4 py-4 pl-12 text-base font-semibold text-white outline-none transition-all placeholder:text-white/30 ${borderClass}`}
            placeholder="ناوی نوێ بنووسە"
          />
          {availability === "taken" || tooLong ? (
            <X className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-red-400" />
          ) : availability === "available" && !empty ? (
            <Check className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-emerald-400" />
          ) : null}
        </div>

        {tooLong && <p className="mt-3 text-sm font-semibold text-red-400">لە 14 پیت کەمتر بێت</p>}
        {!tooLong && availability === "taken" && (
          <p className="mt-3 text-sm font-semibold text-red-400">ئەم ناوە دووبارەیە</p>
        )}
        {!tooLong && cooldownDaysLeft > 0 && (
          <p className="mt-3 text-sm font-semibold text-amber-300">
            تا ماوەی 7 ڕۆژی تر ناو ناگۆڕدرێت
          </p>
        )}
        {!tooLong && !cooldownDaysLeft && availability === "checking" && (
          <p className="mt-3 text-sm text-white/45">پشکنینی ناو...</p>
        )}
        {!tooLong && availability === "error" && (
          <p className="mt-3 text-sm font-semibold text-red-400">پشکنینی ناو بەردەست نییە</p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={invalid || unchanged || saving}
          className="press mt-8 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-400 to-lime-300 py-4 text-base font-extrabold text-emerald-950 shadow-[0_0_24px_rgba(16,185,129,0.25)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "پاشەکەوتکردن..." : "پاشەکەوتکردن"}
        </button>
      </div>
    </div>
  );
}

function EditUsername({ onClose }: { onClose: () => void }) {
  const { user, syncProfileUsername } = useApp();
  const [username, setUsername] = useState((user?.handle ?? "").replace(/^@+/, ""));
  const [availability, setAvailability] = useState<
    "checking" | "available" | "taken" | "error" | null
  >(null);
  const [cooldownDaysLeft, setCooldownDaysLeft] = useState(0);
  const [saving, setSaving] = useState(false);

  useHideChrome();

  const originalUsername = (user?.handle ?? "").trim().replace(/^@+/, "").toLowerCase();
  const normalizedUsername = username.trim().replace(/^@+/, "").toLowerCase();
  const unchanged = normalizedUsername === originalUsername;
  const tooLong = normalizedUsername.length > 10;
  const empty = !normalizedUsername;

  useEffect(() => {
    const client = supabase;
    if (!client || !user?.id) {
      setCooldownDaysLeft(0);
      return;
    }
    let cancelled = false;
    const loadCooldown = async () => {
      try {
        const { data, error } = await client
          .from("profiles")
          .select("last_username_change_at")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn("Username cooldown lookup failed; server will enforce cooldown:", error);
          setCooldownDaysLeft(0);
          return;
        }
        const changedAt = data?.last_username_change_at
          ? new Date(data.last_username_change_at).getTime()
          : 0;
        const remaining = changedAt + 30 * 86_400_000 - Date.now();
        setCooldownDaysLeft(remaining > 0 ? Math.ceil(remaining / 86_400_000) : 0);
      } catch (error) {
        if (!cancelled) {
          console.warn("Username cooldown lookup failed; server will enforce cooldown:", error);
          setCooldownDaysLeft(0);
        }
      }
    };
    void loadCooldown();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!normalizedUsername || tooLong) {
      setAvailability(null);
      return;
    }
    if (normalizedUsername === originalUsername) {
      setAvailability("available");
      return;
    }
    const client = supabase;
    if (!client || !user?.id) {
      setAvailability("error");
      return;
    }

    let cancelled = false;
    setAvailability("checking");
    const timer = window.setTimeout(async () => {
      try {
        const escapedPattern = normalizedUsername.replace(/[\\%_]/g, "\\$&");
        const { data, error } = await client
          .from("profiles")
          .select("id")
          .ilike("username", escapedPattern)
          .neq("id", user.id)
          .limit(1);
        if (cancelled) return;
        if (error) {
          console.warn("Username availability check failed:", error);
          setAvailability("error");
          return;
        }
        setAvailability(data?.length ? "taken" : "available");
      } catch (error) {
        if (cancelled) return;
        console.warn("Username availability check failed:", error);
        setAvailability("error");
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedUsername, originalUsername, tooLong, user?.id]);

  const invalid = empty || tooLong || availability !== "available" || cooldownDaysLeft > 0;

  const save = async () => {
    if (invalid || unchanged || saving || !user?.id || !supabase) return;
    setSaving(true);
    let result;
    try {
      result = await supabase.rpc("update_profile_username", {
        new_username: normalizedUsername,
      });
    } catch (error) {
      console.error("Username update failed:", error);
      toast.error("نەتوانرا یوزەرەکە پاشەکەوت بکرێت؛ مایگرەیشنی داتابەیس جێبەجێ بکە");
      setSaving(false);
      return;
    }
    const { data, error } = result;
    if (error) {
      const message = error.message.toLowerCase();
      const migrationMissing =
        error.code?.toLowerCase() === "pgrst202" ||
        error.code === "42883" ||
        (message.includes("update_profile_username") &&
          (message.includes("not find") || message.includes("does not exist")));
      if (message.includes("username_taken")) setAvailability("taken");
      if (message.includes("username_change_cooldown")) setCooldownDaysLeft(30);
      toast.error(
        migrationMissing
          ? "مایگرەیشنی یوزەر جێبەجێ نەکراوە؛ SQL ـەکە لە Supabase جێبەجێ بکە"
          : message.includes("username_taken")
            ? "ئەم یوزەرە دووبارەیە"
            : message.includes("username_change_cooldown")
              ? "تا ماوەی 30 ڕۆژی تر ناو ناگۆڕدرێت"
              : "نەتوانرا یوزەرەکە پاشەکەوت بکرێت",
      );
      setSaving(false);
      return;
    }

    const saved = Array.isArray(data) ? data[0] : data;
    syncProfileUsername(
      saved?.username ?? normalizedUsername,
      saved?.last_username_change_at ?? new Date().toISOString(),
    );
    toast.success("یوزەرەکە پاشەکەوت کرا");
    setSaving(false);
    onClose();
  };

  const borderClass =
    tooLong || availability === "taken"
      ? "border-red-500 ring-2 ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
      : availability === "available" && !empty
        ? "border-emerald-500 ring-2 ring-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
        : "border-white/15 focus:border-emerald-400/60";

  return (
    <div className="animate-soft-in fixed inset-0 z-[80] flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.2),_transparent_48%),linear-gradient(160deg,#07130f_0%,#0b1712_55%,#050b09_100%)] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
        >
          <ArrowRight className="size-5" />
        </button>
        <h1 className="text-base font-extrabold">ناوی یوزەر</h1>
        <span className="size-11" />
      </header>

      <div className="mx-auto mt-16 w-full max-w-md">
        <label htmlFor="profile-username" className="mb-3 block text-sm font-bold text-white/80">
          ناوی یوزەر
        </label>
        <div className="relative" dir="ltr">
          <input
            id="profile-username"
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
            dir="auto"
            aria-invalid={tooLong || availability === "taken"}
            className={`w-full rounded-2xl border bg-white/[0.045] px-4 py-4 pl-16 text-base font-semibold text-white outline-none transition-all placeholder:text-white/30 ${borderClass}`}
            placeholder="username"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-white/45">
            @
          </span>
          {availability === "taken" || tooLong ? (
            <X className="absolute left-10 top-1/2 size-5 -translate-y-1/2 text-red-400" />
          ) : availability === "available" && !empty ? (
            <Check className="absolute left-10 top-1/2 size-5 -translate-y-1/2 text-emerald-400" />
          ) : null}
        </div>

        {tooLong && <p className="mt-3 text-sm font-semibold text-red-400">لە 10 پیت کەمتر بێت</p>}
        {!tooLong && availability === "taken" && (
          <p className="mt-3 text-sm font-semibold text-red-400">ئەم یوزەرە دووبارەیە</p>
        )}
        {!tooLong && cooldownDaysLeft !== null && cooldownDaysLeft > 0 && (
          <p className="mt-3 text-sm font-semibold text-amber-300">
            تا ماوەی 30 ڕۆژی تر ناو ناگۆڕدرێت
          </p>
        )}
        {!tooLong && !cooldownDaysLeft && availability === "checking" && (
          <p className="mt-3 text-sm text-white/45">پشکنینی یوزەر...</p>
        )}
        {!tooLong && availability === "error" && (
          <p className="mt-3 text-sm font-semibold text-red-400">پشکنینی یوزەر بەردەست نییە</p>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={invalid || unchanged || saving}
          className="press mt-8 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-400 to-lime-300 py-4 text-base font-extrabold text-emerald-950 shadow-[0_0_24px_rgba(16,185,129,0.25)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "پاشەکەوتکردن..." : "پاشەکەوتکردن"}
        </button>
      </div>
    </div>
  );
}

type AvatarOverlay = {
  id: number;
  kind: "text" | "emoji";
  value: string;
  x: number;
  y: number;
  color: string;
  size: number;
};

function EditProfilePicture({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useApp();
  const [imageSource, setImageSource] = useState(user?.avatar ?? "");
  const [imageReady, setImageReady] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [text, setText] = useState("");
  const [color, setColor] = useState("#ffffff");
  const [fontSize, setFontSize] = useState(28);
  const [overlays, setOverlays] = useState<AvatarOverlay[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stageSize, setStageSize] = useState(300);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    overlayId: number | null;
  } | null>(null);
  const overlayId = useRef(0);

  useHideChrome();

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) setStageSize(entry.contentRect.width);
    });
    resizeObserver.observe(stage);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!imageSource.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(imageSource);
  }, [imageSource]);

  const baseScale = Math.max(stageSize / naturalSize.width, stageSize / naturalSize.height);
  const imageWidth = naturalSize.width * baseScale * zoom;
  const imageHeight = naturalSize.height * baseScale * zoom;
  const hasImage = Boolean(imageSource);

  const chooseImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("تکایە وێنەیەک هەڵبژێرە");
      return;
    }
    setImageSource(URL.createObjectURL(file));
    setImageReady(false);
    setNaturalSize({ width: 1, height: 1 });
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDirty(true);
    event.target.value = "";
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>, targetId: number | null) => {
    if (!imageReady || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const current = targetId === null ? pan : overlays.find((item) => item.id === targetId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: current?.x ?? 0,
      initialY: current?.y ?? 0,
      overlayId: targetId,
    };
    stageRef.current.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (drag.overlayId === null) {
      const maxX = Math.max(0, (imageWidth - rect.width) / 2);
      const maxY = Math.max(0, (imageHeight - rect.height) / 2);
      setPan({
        x: Math.min(maxX, Math.max(-maxX, drag.initialX + deltaX)),
        y: Math.min(maxY, Math.max(-maxY, drag.initialY + deltaY)),
      });
    } else {
      setOverlays((items) =>
        items.map((item) =>
          item.id === drag.overlayId
            ? {
                ...item,
                x: Math.min(100, Math.max(0, drag.initialX + (deltaX / rect.width) * 100)),
                y: Math.min(100, Math.max(0, drag.initialY + (deltaY / rect.height) * 100)),
              }
            : item,
        ),
      );
    }
    setDirty(true);
  };

  const finishDrag = () => {
    dragRef.current = null;
  };

  const addOverlay = (kind: AvatarOverlay["kind"], value: string) => {
    overlayId.current += 1;
    setOverlays((items) => [
      ...items,
      {
        id: overlayId.current,
        kind,
        value,
        x: 50,
        y: 50,
        color,
        size: fontSize,
      },
    ]);
    setDirty(true);
  };

  const updateOverlayStyle = (key: "color" | "size", value: string | number) => {
    setOverlays((items) =>
      items.map((item) => ({
        ...item,
        [key]: value,
      })),
    );
    setDirty(true);
  };

  const renderAvatar = async () => {
    const image = imageRef.current;
    if (!image || !imageReady || !stageRef.current) throw new Error("image_not_ready");
    const outputSize = 512;
    const output = document.createElement("canvas");
    output.width = outputSize;
    output.height = outputSize;
    const context = output.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");

    const scale = outputSize / stageSize;
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    context.save();
    context.beginPath();
    context.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
      image,
      (outputSize - drawWidth) / 2 + pan.x * scale,
      (outputSize - drawHeight) / 2 + pan.y * scale,
      drawWidth,
      drawHeight,
    );
    overlays.forEach((item) => {
      context.save();
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `${Math.round(item.size * scale)}px sans-serif`;
      context.fillStyle = item.kind === "text" ? item.color : "#ffffff";
      context.shadowColor = "rgba(0,0,0,0.75)";
      context.shadowBlur = 5 * scale;
      context.fillText(item.value, (item.x / 100) * outputSize, (item.y / 100) * outputSize);
      context.restore();
    });
    context.restore();

    const blob = await new Promise<Blob>((resolve, reject) => {
      output.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("avatar_export_failed"));
      }, "image/png");
    });
    return blob;
  };

  const save = async () => {
    if (!dirty || !user?.id || !supabase || saving || !imageReady) return;
    setSaving(true);
    try {
      const blob = await renderAvatar();
      const path = `${user.id}/avatar-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(path, blob, { contentType: "image/png", upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from("profile-avatars").getPublicUrl(path);
      const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;
      const { error: profileError } = await supabase.rpc("update_profile_avatar", {
        new_avatar_url: avatarUrl,
      });
      if (profileError) throw profileError;

      updateProfile({ avatar: avatarUrl });
      toast.success("وێنەی پرۆفایل پاشەکەوت کرا");
      onClose();
    } catch (error) {
      console.error("Profile picture save failed:", error);
      toast.error("نەتوانرا وێنەکە پاشەکەوت بکرێت؛ دڵنیابە مایگرەیشنی وێنە جێبەجێ کراوە");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-soft-in fixed inset-0 z-[80] flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.2),_transparent_48%),linear-gradient(160deg,#07130f_0%,#0b1712_55%,#050b09_100%)] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white">
      <header className="flex shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
        >
          <ArrowRight className="size-5" />
        </button>
        <h1 className="text-base font-extrabold">دەستکاری وێنەی پرۆفایل</h1>
        <span className="size-11" />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center overflow-y-auto pb-4 pt-5">
        <div className="relative w-[min(76vw,320px)] shrink-0">
          <div
            ref={stageRef}
            onPointerDown={(event) => startDrag(event, null)}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onWheel={(event) => {
              event.preventDefault();
              setZoom((current) => Math.min(3, Math.max(1, current - event.deltaY * 0.002)));
              setDirty(true);
            }}
            className="relative aspect-square w-full touch-none overflow-hidden rounded-full border-2 border-emerald-300/80 bg-black/35 shadow-[0_0_34px_rgba(16,185,129,0.4)] ring-4 ring-emerald-400/10"
          >
            {hasImage ? (
              <img
                ref={imageRef}
                crossOrigin="anonymous"
                src={imageSource}
                alt="پێشبینینی وێنەی پرۆفایل"
                onLoad={(event) => {
                  setNaturalSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                  setImageReady(true);
                }}
                onError={() => {
                  setImageReady(false);
                  toast.error("نەتوانرا وێنەکە بخوێندرێتەوە");
                }}
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: imageWidth,
                  height: imageHeight,
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-emerald-100/75"
              >
                <Camera className="size-10 text-emerald-300" />
                <span className="text-sm font-bold">وێنە هەڵبژێرە</span>
              </button>
            )}
            {overlays.map((item) => (
              <button
                key={item.id}
                type="button"
                onPointerDown={(event) => startDrag(event, item.id)}
                onClick={(event) => event.stopPropagation()}
                aria-label="جوڵاندنی نووسین یان ستیکەر"
                className="absolute -translate-x-1/2 -translate-y-1/2 touch-none whitespace-pre text-center font-bold leading-none drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]"
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  color: item.kind === "text" ? item.color : undefined,
                  fontSize: item.size,
                }}
              >
                {item.value}
              </button>
            ))}
            {imageReady && (
              <span className="pointer-events-none absolute inset-0 rounded-full border border-dashed border-white/35" />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="press absolute bottom-3 right-1/2 flex translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-emerald-200/30 bg-[#07130f]/90 px-4 py-2.5 text-xs font-extrabold text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.32)] backdrop-blur"
          >
            <Camera className="size-4" />
            {imageReady ? "وێنە بگۆڕە" : "وێنە هەڵبژێرە"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={chooseImage}
            className="hidden"
          />
        </div>

        <div className="mt-5 w-full space-y-4">
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <ZoomIn className="size-4 shrink-0 text-emerald-300" />
            <input
              aria-label="قەبارەی وێنە"
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              disabled={!imageReady}
              onChange={(event) => {
                setZoom(Number(event.target.value));
                setDirty(true);
              }}
              className="w-full accent-emerald-400"
            />
            <span className="w-10 text-left text-xs tabular-nums text-white/55">
              {zoom.toFixed(1)}x
            </span>
          </label>

          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <input
              value={text}
              maxLength={32}
              onChange={(event) => setText(event.target.value)}
              placeholder="نووسین زیاد بکە"
              className="min-w-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400/60"
            />
            <label
              className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"
              title="ڕەنگی نووسین"
            >
              <input
                type="color"
                aria-label="ڕەنگی نووسین"
                value={color}
                onChange={(event) => {
                  setColor(event.target.value);
                  updateOverlayStyle("color", event.target.value);
                }}
                className="size-7 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
            <button
              type="button"
              onClick={() => text.trim() && addOverlay("text", text.trim())}
              disabled={!text.trim() || !imageReady}
              aria-label="زیادکردنی نووسین"
              className="press flex size-11 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 disabled:opacity-40"
            >
              <Type className="size-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <span className="text-xs font-semibold text-white/55">قەبارە</span>
            <input
              aria-label="قەبارەی نووسین و ستیکەر"
              type="range"
              min="14"
              max="56"
              value={fontSize}
              onChange={(event) => {
                const nextSize = Number(event.target.value);
                setFontSize(nextSize);
                updateOverlayStyle("size", nextSize);
              }}
              className="w-full accent-emerald-400"
            />
            <span className="w-8 text-left text-xs tabular-nums text-white/55">{fontSize}</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {["❤️", "✨", "🔥", "👑", "⭐", "🎮", "😎", "🦋"].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addOverlay("emoji", emoji)}
                disabled={!imageReady}
                aria-label={`زیادکردنی ${emoji}`}
                className="press flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xl disabled:opacity-40"
              >
                {emoji}
              </button>
            ))}
            {overlays.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setOverlays([]);
                  setDirty(true);
                }}
                className="press ml-auto shrink-0 px-2 text-xs font-semibold text-red-300"
              >
                پاککردنەوەی هەموو
              </button>
            )}
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md shrink-0 pt-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || !imageReady || saving || !user?.id || !supabase}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-lime-300 py-4 text-base font-extrabold text-emerald-950 shadow-[0_0_24px_rgba(16,185,129,0.3)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="size-5" />
          {saving ? "پاشەکەوتکردن..." : "پاشەکەوتکردن"}
        </button>
      </footer>
    </div>
  );
}

function EditBio({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useApp();
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);

  useHideChrome();

  const tooLong = bio.length > 30;
  const unchanged = bio === (user?.bio ?? "");
  const remaining = 30 - bio.length;
  const borderClass = tooLong
    ? "border-red-500 ring-2 ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
    : "border-emerald-500 ring-2 ring-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]";

  const save = async () => {
    if (tooLong || unchanged || saving || !user?.id || !supabase) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("update_profile_bio", {
        new_bio: bio,
      });
      if (error) throw error;
      const savedBio = typeof data === "string" ? data : bio;
      updateProfile({ bio: savedBio });
      toast.success("بیۆ پاشەکەوت کرا");
      onClose();
    } catch (error) {
      console.error("Bio update failed:", error);
      toast.error("نەتوانرا بیۆ پاشەکەوت بکرێت؛ مایگرەیشنی بیۆ لە Supabase جێبەجێ بکە");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-soft-in fixed inset-0 z-[80] flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.2),_transparent_48%),linear-gradient(160deg,#07130f_0%,#0b1712_55%,#050b09_100%)] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
        >
          <ArrowRight className="size-5" />
        </button>
        <h1 className="text-base font-extrabold">دەستکاری بیۆ</h1>
        <span className="size-11" />
      </header>

      <main className="mx-auto mt-16 w-full max-w-md">
        <label htmlFor="profile-bio" className="mb-3 block text-sm font-bold text-white/80">
          بیۆی پرۆفایل
        </label>
        <textarea
          id="profile-bio"
          autoFocus
          rows={5}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
          }}
          aria-invalid={tooLong}
          className={`w-full resize-none rounded-2xl border bg-white/[0.045] px-4 py-4 text-base font-semibold text-white outline-none transition-all placeholder:text-white/30 ${borderClass}`}
          placeholder="دەربارەی خۆت بنووسە"
        />
        <div className="mt-2 flex min-h-6 items-start justify-between gap-3" dir="ltr">
          {tooLong ? (
            <p dir="rtl" className="text-sm font-semibold text-red-400">
              لە 30 پیت کەمتر بێت
            </p>
          ) : (
            <span />
          )}
          <p className={`text-xs tabular-nums ${tooLong ? "text-red-400" : "text-white/45"}`}>
            <span dir="ltr">{remaining}</span>
          </p>
        </div>
      </main>

      <footer className="mx-auto mt-auto w-full max-w-md pt-6">
        <button
          type="button"
          onClick={() => void save()}
          disabled={tooLong || unchanged || saving || !user?.id || !supabase}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-lime-300 py-4 text-base font-extrabold text-emerald-950 shadow-[0_0_24px_rgba(16,185,129,0.3)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="size-5" />
          {saving ? "پاشەکەوتکردن..." : "پاشەکەوتکردن"}
        </button>
      </footer>
    </div>
  );
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const { user, updateProfile, syncProfileName, isNameTaken, nameCooldownDaysLeft } = useApp();
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);

  useHideChrome();

  const locked = nameCooldownDaysLeft > 0;
  const tooLong = name.trim().length > 14;
  const taken = !tooLong && isNameTaken(name);
  const empty = name.trim().length === 0;
  const valid = !tooLong && !taken && !empty;
  const save = async () => {
    if ((!valid && !locked) || saving) return;
    const shouldChangeName = !locked && name.trim() !== (user?.name ?? "").trim();
    let savedName = user?.name ?? name.trim();
    if (shouldChangeName) {
      if (!supabase) {
        toast.error("نەتوانرا پەیوەندی بە داتابەیسەوە بکرێت");
        return;
      }
      setSaving(true);
      let result;
      try {
        result = await supabase.rpc("update_profile_display_name", {
          new_display_name: name.trim(),
        });
      } catch (error) {
        console.error("Display name update failed:", error);
        toast.error("نەتوانرا ناوەکە پاشەکەوت بکرێت");
        setSaving(false);
        return;
      }
      const { data, error } = result;
      if (error) {
        const message = error.message.toLowerCase();
        toast.error(
          message.includes("display_name_taken")
            ? "ئەم ناوە دووبارەیە"
            : message.includes("name_change_cooldown")
              ? "تا ماوەی 7 ڕۆژی تر ناو ناگۆڕدرێت"
              : "نەتوانرا ناوەکە پاشەکەوت بکرێت",
        );
        setSaving(false);
        return;
      }
      const saved = Array.isArray(data) ? data[0] : data;
      savedName = saved?.display_name ?? name.trim();
      syncProfileName(savedName, saved?.last_name_change_at ?? new Date().toISOString());
      setSaving(false);
    }
    updateProfile({ name: undefined });
    if (user?.id) {
      void upsertProfile({
        id: user.id,
        username: user.handle?.trim() || savedName,
        avatar_url: user.avatar,
      }).catch((error: unknown) => console.warn("Profile sync failed:", error));
    }
    onClose();
  };

  const borderClass = locked
    ? "border-panel-border"
    : valid
      ? "border-emerald-500 shadow-[0_0_18px_-2px_rgba(16,185,129,0.8)]"
      : "border-red-500 shadow-[0_0_18px_-2px_rgba(239,68,68,0.8)]";

  return (
    <div className="animate-soft-in fixed inset-0 z-50 flex flex-col bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8 text-slate-900">
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-700"
        >
          <ArrowRight className="size-5" />
        </button>
        <h2 className="text-lg font-bold">دەستکاری پرۆفایل</h2>
        <button
          onClick={() => void save()}
          disabled={(!locked && !valid) || saving}
          aria-label="پاشەکەوتکردن"
          className="press flex size-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_24px_-2px_rgba(16,185,129,0.9)] disabled:opacity-40 disabled:shadow-none"
        >
          <Check className="size-5" />
        </button>
      </div>

      <div className="mx-auto mt-8 w-full max-w-md space-y-5">
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-500">ناوی بەکارهێنەر</span>
          <input
            value={name}
            disabled={locked}
            onChange={(e) => setName(e.target.value)}
            className={`w-full rounded-2xl border-2 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all disabled:opacity-60 ${borderClass}`}
          />
          {locked ? (
            <p className="mt-2 text-[11px] font-light text-slate-500">
              تا ماوەی 7 ڕۆژی تر ناو ناگۆڕدرێت
            </p>
          ) : tooLong ? (
            <p className="mt-2 text-[11px] font-light text-red-500">لە 14 پیت کەمتر بێت</p>
          ) : taken ? (
            <p className="mt-2 text-[11px] font-light text-red-500">
              ئەم ناوە پێشتر وەرگیراوە. تکایە ناوێکی تر هەڵبژێرە.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({
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

function ProfileMenu({
  onClose,
  onEdit,
  onEditName,
  onEditUsername,
  onEditPicture,
  onEditBio,
}: {
  onClose: () => void;
  onEdit: () => void;
  onEditName: () => void;
  onEditUsername: () => void;
  onEditPicture: () => void;
  onEditBio: () => void;
}) {
  const {
    user,
    online,
    setOnline,
    hideFollowing,
    setHideFollowing,
    hideProfileDetails,
    setHideProfileDetails,
    logout,
    blockedFriends,
    unblockFriend,
    deleteAccount,
  } = useApp();
  const navigate = useNavigate();
  const [showBlocked, setShowBlocked] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [blockedProfile, setBlockedProfile] = useState<(typeof blockedFriends)[number] | null>(
    null,
  );
  const age = user?.birth_year ? new Date().getFullYear() - Number(user.birth_year) : null;
  const profileDetails =
    !hideProfileDetails && user?.city && age && age > 0 ? `${user.city} • ${age} ساڵ` : null;
  const openEdit = () => {
    onEdit();
  };
  const openEditName = () => {
    onEditName();
  };
  const openEditUsername = () => {
    onEditUsername();
  };
  const openEditPicture = () => {
    onEditPicture();
  };
  const openEditBio = () => {
    onEditBio();
  };

  useHideChrome();

  return (
    <div className="fixed inset-0 z-50 bg-black/55" onClick={onClose}>
      <div
        className="animate-slide-in-right absolute right-0 top-0 flex h-full w-[min(88vw,350px)] min-w-[280px] flex-col overflow-y-auto border-l border-emerald-400/10 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.16),_transparent_44%),linear-gradient(160deg,#07130f_0%,#0b1712_55%,#050b09_100%)] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => (showBlocked ? setShowBlocked(false) : onClose())}
            aria-label="گەڕانەوە"
            className="press flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80"
          >
            <ArrowRight className="size-5" />
          </button>
          <h2 className="text-lg font-bold text-white">
            {showBlocked ? "لیستی بلۆککراوەکان" : "مێنیو"}
          </h2>
          <span className="size-11" />
        </div>

        {showBlocked ? (
          <div className="mt-6 space-y-1">
            {blockedFriends.length === 0 && (
              <p className="text-center text-sm text-white/45">کەس بلۆک نەکراوە</p>
            )}
            {blockedFriends.map((f) => (
              <div
                key={f.id}
                className="flex w-full items-center justify-between rounded-xl px-2 py-2 hover:bg-white/5 active:bg-white/10"
              >
                <button
                  type="button"
                  onClick={() => setBlockedProfile(f)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <img
                    src={avatarImageSource(f.avatar)}
                    alt={f.name}
                    className={`size-10 shrink-0 rounded-full border bg-emerald-950 object-cover ${f.online === false ? "border-slate-400/60 ring-2 ring-slate-400/50" : "border-emerald-400/30 ring-2 ring-emerald-400/70"}`}
                  />
                  <span className="truncate font-semibold text-white">{f.name}</span>
                </button>
                <button
                  onClick={() => {
                    void unblockFriend(f.id).then(
                      () => toast.success("بلۆک لابرا"),
                      (error: unknown) => {
                        console.error("Supabase unblock error:", error);
                        toast.error("نەتوانرا بلۆک لاببرێت");
                      },
                    );
                  }}
                  aria-label="کردنەوەی بلۆک"
                  className="press flex size-9 items-center justify-center rounded-full text-white/50 hover:bg-white/10 active:bg-white/15"
                >
                  <Trash2 className="size-5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/15 bg-white/[0.04] p-3">
              <img
                src={avatarImageSource(user?.avatar)}
                alt={user?.name ?? "پرۆفایل"}
                className={`size-14 shrink-0 rounded-full border-2 object-cover ring-2 ${online ? "border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)] ring-emerald-500" : "border-slate-400 shadow-[0_0_10px_rgba(148,163,184,0.18)] ring-slate-400/60"}`}
              />
              <div className="min-w-0">
                <p className="truncate font-extrabold text-white">{user?.name ?? "یاریزان"}</p>
                {profileDetails && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-100/65">
                    <Crown className="size-3.5 shrink-0 text-amber-300" />
                    <span className="truncate">{profileDetails}</span>
                  </p>
                )}
              </div>
            </div>

            <MenuSection title="هەژمار">
              <MenuItem icon={UserRound} label="ناوی بەکارهێنەر" onClick={openEditName} />
              <MenuItem icon={AtSign} label="ناوی یوزەر" onClick={openEditUsername} />
              <MenuItem icon={Image} label="گۆڕینی وێنە" onClick={openEditPicture} />
              <MenuItem icon={FileText} label="بیۆ" onClick={openEditBio} />
            </MenuSection>

            <MenuSection title="پاراستن">
              <PrivacyMenuItem
                icon={MapPin}
                label="داخستنی شار و تەمەن"
                checked={hideProfileDetails}
                onClick={() => {
                  void setHideProfileDetails(!hideProfileDetails).then((saved) => {
                    if (!saved) toast.error("نەتوانرا ڕێکخستنی شار و تەمەن پاشەکەوت بکرێت");
                  });
                }}
              />
              <PrivacyMenuItem
                icon={Wifi}
                label={online ? "سەرهێل" : "دەرهێل"}
                checked={!online}
                onClick={() => {
                  void setOnline(!online).then((saved) => {
                    if (!saved) toast.error("نەتوانرا دۆخی سەرهێڵ پاشەکەوت بکرێت");
                  });
                }}
              />
              <PrivacyMenuItem
                icon={Users}
                label="هاوڕێکانت"
                checked={hideFollowing}
                onClick={() => {
                  void setHideFollowing(!hideFollowing).then((saved) => {
                    if (!saved) toast.error("نەتوانرا تایبەتمەندی هاوڕێکان پاشەکەوت بکرێت");
                  });
                }}
              />
            </MenuSection>

            <div className="border-y border-white/10 py-2">
              <MenuItem
                icon={ShieldBan}
                label="لیستی بلۆککراوەکان"
                onClick={() => setShowBlocked(true)}
              />
            </div>

            <MenuSection title="هەژماری یاریزان">
              <MenuItem icon={UserX} label="زانیاری هەژمار" onClick={() => setInfoOpen(true)} />
              <MenuItem
                icon={LogOut}
                label="دەرچوون"
                tone="text-red-400"
                onClick={() => setConfirmLogout(true)}
              />
              <MenuItem
                icon={UserX}
                label="سڕینەوەی هەژمار"
                tone="text-red-600"
                onClick={() => setConfirmDelete(true)}
              />
            </MenuSection>
          </div>
        )}

        {confirmDelete && (
          <div
            className="animate-soft-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6"
            onClick={() => setConfirmDelete(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="panel w-full max-w-xs rounded-3xl p-5 text-center shadow-[var(--shadow-glass)]"
            >
              <p className="text-sm font-bold text-panel-foreground">
                دڵنیایت لە سڕینەوەی هەژمارەکەت بۆ هەمیشە؟
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      await deleteAccount();
                    } catch (error) {
                      console.error("Account deletion failed:", error);
                    } finally {
                      navigate({ to: "/" });
                    }
                  }}
                  className="press flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white"
                >
                  بەڵێ
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="press flex-1 rounded-2xl bg-slate-200 py-3 text-sm font-bold text-slate-900"
                >
                  نەخێر
                </button>
              </div>
            </div>
          </div>
        )}
        {confirmLogout && (
          <div
            className="animate-soft-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6"
            onClick={() => setConfirmLogout(false)}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-xs rounded-3xl bg-white p-5 text-center text-slate-900 shadow-2xl"
            >
              <p className="text-sm font-bold">ئایا دەتەوێت بچیتە دەرەوە لەم ئەکاونتە؟</p>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => {
                    logout();
                    navigate({ to: "/" });
                  }}
                  className="press flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white"
                >
                  بەڵێ
                </button>
                <button
                  onClick={() => setConfirmLogout(false)}
                  className="press flex-1 rounded-2xl bg-slate-200 py-3 text-sm font-bold text-slate-900"
                >
                  نەخێر
                </button>
              </div>
            </div>
          </div>
        )}
        {blockedProfile && (
          <PlayerProfileSheet
            player={blockedProfile}
            followersCount={0}
            followingCount={0}
            allowFriendRequest={false}
            onClose={() => setBlockedProfile(null)}
          />
        )}
        {infoOpen && <MyInformation onClose={() => setInfoOpen(false)} />}
      </div>
    </div>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/10 py-3">
      <h3 className="mb-1 px-3 text-[11px] font-bold text-emerald-300/75">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  tone = "text-white/80",
}: {
  icon: typeof UserRound;
  label: string;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.06] active:bg-white/10 ${tone}`}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="font-semibold">{label}</span>
    </button>
  );
}

function PrivacyMenuItem({
  icon: Icon,
  label,
  checked,
  onClick,
}: {
  icon: typeof UserRound;
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className="press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm text-white/80 transition-colors hover:bg-white/[0.06] active:bg-white/10"
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="flex-1 font-semibold">{label}</span>
      <span
        aria-hidden="true"
        className={`relative block h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-emerald-500" : "bg-white/20"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}

function MyInformation({ onClose }: { onClose: () => void }) {
  const { user, currentPassword, linkedEmail, passwordChangedAt, updatePassword } = useApp();
  const [password, setPassword] = useState(currentPassword);
  const [editing, setEditing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState(linkedEmail ?? "");
  const [saving, setSaving] = useState(false);
  const cooldown = passwordChangedAt
    ? Math.max(0, 10 * 86_400_000 - (Date.now() - passwordChangedAt))
    : 0;
  const canChange = cooldown === 0;
  const valid = password.length >= 8;

  useHideChrome();

  useEffect(() => {
    let cancelled = false;
    const loadEmail = async () => {
      if (!supabase) return;
      try {
        const {
          data: { user: authUser },
          error,
        } = await supabase.auth.getUser();
        if (error) throw error;
        if (!cancelled) setEmail(authUser?.email ?? linkedEmail ?? "");
      } catch (error) {
        console.warn("Registered email lookup failed:", error);
        if (!cancelled) setEmail(linkedEmail ?? "");
      }
    };
    void loadEmail();
    return () => {
      cancelled = true;
    };
  }, [linkedEmail]);

  const savePassword = async () => {
    if (!editing || !valid || !canChange || saving) return;
    if (!supabase) {
      toast.error("بەستەری Supabase بەردەست نییە");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      updatePassword(password);
      toast.success("وشەی نهێنی نوێ کرایەوە");
      setEditing(false);
      setVisible(false);
      (document.activeElement as HTMLElement | null)?.blur();
    } catch (error) {
      console.error("Password update failed:", error);
      toast.error("نەتوانرا وشەی نهێنی نوێ بکرێتەوە");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-soft-in fixed inset-0 z-[80] flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.2),_transparent_48%),linear-gradient(160deg,#07130f_0%,#0b1712_55%,#050b09_100%)] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
        >
          <ArrowRight className="size-5" />
        </button>
        <h2 className="text-base font-extrabold text-white">زانیاری هەژمار</h2>
        <span className="size-11" />
      </div>

      <div className="mx-auto mt-12 w-full max-w-md space-y-6">
        <div>
          <p className="mb-2 text-xs font-bold text-emerald-100/60">ناوی بەکارهێنەر</p>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 font-bold text-white">
            {user?.name ?? "یاریزان"}
          </div>
        </div>

        <div>
          <label
            htmlFor="account-password"
            className="mb-2 block text-xs font-bold text-emerald-100/60"
          >
            وشەی نهێنی
          </label>
          <div className="relative rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 focus-within:border-emerald-400/60">
            <input
              id="account-password"
              type={visible ? "text" : "password"}
              value={password}
              disabled={!editing || !canChange || saving}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void savePassword();
              }}
              placeholder="••••••••"
              className="w-full bg-transparent pr-10 text-white outline-none placeholder:text-white/35 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setVisible((current) => !current)}
              aria-label={visible ? "شاردنەوەی وشەی نهێنی" : "پیشاندانی وشەی نهێنی"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-100/60"
            >
              {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          <button
            type="button"
            disabled={!canChange || saving}
            onClick={() => {
              setPassword("");
              setVisible(false);
              setEditing(true);
            }}
            className="mt-2 text-xs font-bold text-emerald-300 disabled:text-white/30"
          >
            وشەی نهێنی بگۆڕە
          </button>
          {!canChange && (
            <p className="mt-1 text-xs text-white/45">
              گۆڕینی وشەی نهێنی دوای ١٠ ڕۆژ بەردەست دەبێت.
            </p>
          )}
          {editing && (
            <button
              type="button"
              onClick={() => void savePassword()}
              disabled={!valid || saving}
              className="press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-lime-300 py-3.5 text-sm font-extrabold text-emerald-950 shadow-[0_0_22px_rgba(16,185,129,0.28)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="size-4" />
              {saving ? "پاشەکەوتکردن..." : "پاشەکەوتکردن"}
            </button>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-emerald-100/60">ئیمێل</p>
          <div
            className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-left font-semibold text-white/75"
            dir="ltr"
          >
            {email || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
