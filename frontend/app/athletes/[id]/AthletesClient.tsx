"use client";
import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import DashboardTemplate from "@/components/DashboardTemplate";
import type { Event } from "../../api/getEvents/route";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { editModal } from "@/components/ui/modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toOrdinal(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getBestResult(type: string, details: string[]): string {
  if (details.length === 0) return "";

  if (/^\d/.test(type)) {
    // Running: lowest time
    const toSeconds = (d: string) => {
      if (d.includes(":")) {
        const [min, sec] = d.split(":").map(Number);
        return min * 60 + sec;
      }
      return parseFloat(d);
    };
    const best = Math.min(...details.map(toSeconds));
    const minutes = Math.floor(best / 60);
    const seconds = (best % 60).toFixed(2);
    return minutes > 0 ? `${minutes}:${seconds.padStart(5, "0")}` : seconds;
  } else {
    // Field: highest distance in "feet-inches.decimal"
    const toInches = (d: string) => {
      if (!d) return 0;

      // matches formats like:
      // 12' 6''
      // 12'6''
      // 11' 0''
      const match = d.match(/(\d+)\s*'\s*(\d+(?:\.\d+)?)\s*"?/);

      if (!match) return 0;

      const feet = parseInt(match[1], 10);
      const inches = parseFloat(match[2]);

      if (isNaN(feet) || isNaN(inches)) return 0;

      return feet * 12 + inches;
    };
    const converted = details.map(toInches).filter((n) => !isNaN(n));
    const best = converted.length ? Math.max(...converted) : 0;
    const feet = Math.floor(best / 12);
    const inchesNum = Math.round((best % 12) * 100) / 100;
    return `${feet}' ${inchesNum}"`;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AthletesClient({ id }: { id: string }) {
  const athleteId = id;

  const [isPublic, setIsPublic] = useState(false);
  const [athleteName, setAthleteName] = useState<string>("");
  const [athleteSeasonId, setAthleteSeasonId] = useState("");
  const [athleteSeasonName, setAthleteSeasonName] = useState<string>("");
  const [athleteClass, setAthleteClass] = useState<string | null>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const checkCredentials = useCallback(async () => {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) setIsPublic(true);
  }, [supabase]);

  const fetchUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
  }, [supabase]);

  const fetchSeason = useCallback(async (seasonId: string) => {
    try {
      const res = await fetch(`/api/getEntity?id=${seasonId}&table=seasons`);
      if (!res.ok) throw new Error("Failed to get season");
      const data = await res.json();
      setAthleteSeasonName(data.name);
    } catch (e) {
      toast.error("Error fetching season: " + (e as Error).message);
    }
  }, []);

  const fetchAthlete = useCallback(async () => {
    try {
      const res = await fetch(`/api/getEntity?id=${athleteId}&table=athletes`);
      if (!res.ok) throw new Error("Failed to get athlete");
      const data = await res.json();
      setAthleteName(data.name);
      setAthleteSeasonId(data.season);
      setAthleteClass(data.class);
      if (data.season) fetchSeason(data.season);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [athleteId, fetchSeason]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/getEvents?id=${athleteId}&target=athlete`);
      if (!res.ok) throw new Error("Failed to fetch events");
      setEvents(await res.json());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    checkCredentials();
    fetchAthlete();
    fetchEvents();
    fetchUser();
  }, [checkCredentials, fetchAthlete, fetchEvents, fetchUser]);

  // ─── Derived stats ───────────────────────────────────────────────────────────

  const totalPoints = events.reduce((sum, ev) => sum + (ev.points || 0), 0);
  const totalEvents = events.length;
  const totalMeets = new Set(
    events.filter((e) => e.meet?.id).map((e) => e.meet!.id)
  ).size;
  const pointsPerEvent =
    totalEvents > 0 ? (totalPoints / totalEvents).toFixed(2) : "0.00";
  const pointsPerMeet =
    totalMeets > 0 ? (totalPoints / totalMeets).toFixed(2) : "0.00";

  const uniqueEventTypes = Array.from(new Set(events.map((e) => e.type)));
  const eventPRs: Record<string, string> = {};
  uniqueEventTypes.forEach((type) => {
    const details = events
      .filter((e) => e.type === type && e.details)
      .map((e) => e.details!.trim());
    eventPRs[type] = getBestResult(type, details);
  });

  const prTypes = uniqueEventTypes.filter(
    (type) => events.some((e) => e.type === type && e.details) && eventPRs[type]
  );

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("T")[0].split("-");
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    ).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const content = (
    <div className="flex flex-col gap-4 w-full">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
        {[
          { label: "Meets", value: totalMeets },
          { label: "Events", value: totalEvents },
          { label: "Points", value: Number(totalPoints.toFixed(2)) },
          { label: "PTS / Event", value: pointsPerEvent },
          { label: "PTS / Meet", value: pointsPerMeet },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-4"
          >
            <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {value}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* PR badges */}
      {prTypes.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center justify-center w-full">
          <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm text-gray-700 dark:text-gray-300">
            <span className="font-bold">PRs: </span>
          </div>
          {prTypes.map((type) => (
            <div
              key={`pr-${type}`}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm text-gray-700 dark:text-gray-300"
            >
              <span className="font-medium">{type}</span>
              <span className="text-gray-400 dark:text-gray-500 mx-1">·</span>
              <span>{eventPRs[type]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Events grouped by meet */}
      {(() => {
        const byMeet: Record<string, Event[]> = {};
        events.forEach((ev) => {
          const id = ev.meet?.id ?? "unknown";
          if (!byMeet[id]) byMeet[id] = [];
          byMeet[id].push(ev);
        });

        const sortedMeetIds = Object.keys(byMeet).sort((a, b) => {
          const aDate = byMeet[a][0]?.created_at
            ? new Date(byMeet[a][0].created_at).getTime()
            : 0;
          const bDate = byMeet[b][0]?.created_at
            ? new Date(byMeet[b][0].created_at).getTime()
            : 0;
          return aDate - bDate;
        });

        return sortedMeetIds.map((meetId) => {
          const meetEvents = [...byMeet[meetId]].sort((a, b) => {
            const placeA = a.place ?? Number.MAX_SAFE_INTEGER;
            const placeB = b.place ?? Number.MAX_SAFE_INTEGER;
            if (placeA !== placeB) return placeA - placeB;
            return a.type.localeCompare(b.type);
          });
          const meetName = meetEvents[0]?.meet?.name ?? "Unknown Meet";
          const meetDate = meetEvents[0]?.meet?.date
            ? formatDate(meetEvents[0].meet.date)
            : "";

          return (
            <div key={meetId} className="w-full">
              {/* Meet header */}
              <div className="flex-column justify-between items-center px-4 py-6 text-center">
                <Link
                  href={`/meets/${meetId}`}
                  className="text-2xl w-fulltext-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {/* <span className="text-xs mr-1">↗</span> */}
                  {meetName}
                </Link>
                <div className="text-sm text-gray-500 dark:text-gray-400 shrink-0">
                  {meetDate}
                </div>
              </div>
              <div
                key={meetId}
                className="bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden mb-2"
              >
                {/* Column headers */}
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <div>Event</div>
                  <div>Place</div>
                  <div>Points</div>
                  <div>Details</div>
                </div>

                {/* Event rows */}
                {meetEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 items-center text-sm text-gray-600 dark:text-gray-400 px-4 py-2 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition-colors"
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {ev.type}
                    </div>
                    <div>{toOrdinal(ev.place)}</div>
                    <div>{ev.points ?? "—"}</div>
                    <div>{ev.details ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        });
      })()}
    </div>
  );

  const onDelete = async () => {
    try {
      const res = await fetch(
        `/api/deleteEntity?id=${athleteId}&table=athletes`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) throw new Error("Failed to delete athlete");
      window.location.href = "/seasons/" + athleteSeasonId;
    } catch (e) {
      toast.error("Failed to delete athlete: " + (e as Error).message);
    }
  };

  const onEdit = async () => {
    const result = await editModal({
      title: "Edit Athlete",
      fields: [
        {
          name: "name",
          label: "Name",
          type: "text",
          defaultValue: athleteName ?? "",
        },
        {
          name: "class",
          label: "Class",
          type: "text",
          defaultValue: athleteClass ?? "",
        },
      ],
    });

    if (!result) return;

    try {
      const res = await fetch("/api/editEntity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: athleteId,
          table: "athletes",
          data: {
            class: String(result.class),
            name: String(result.name),
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update athlete!");
      }

      toast.success("Athlete updated!");
      setAthleteClass(String(result.class));
      setAthleteName(String(result.name));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error updating athlete"
      );
    }
  };

  const links = isPublic
    ? [
        <button
          key="season-leaderboard-link"
          type="button"
          onClick={() =>
            (window.location.href = `/seasonLeaderboard/${athleteSeasonId}?athlete=${athleteId}`)
          }
          className="px-3 py-1 text-sm rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
        >
          <span className="text-xs">↗</span>
          View Ranking
        </button>,
      ]
    : [
        <button
          key="leaderboard-link"
          type="button"
          onClick={() =>
            (window.location.href = `/leaderboard/${userId}?filter=${athleteSeasonName}&athlete=${athleteId}`)
          }
          className="px-3 py-1 text-sm rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
        >
          <span className="text-xs">↗</span>
          View Ranking
        </button>,
      ];

  return (
    <DashboardTemplate
      title={athleteName}
      subtitle={`Class ${athleteClass ?? "Unknown"} · ${athleteSeasonName}`}
      loading={loading}
      moreInfo={content}
      onDelete={onDelete}
      onEdit={onEdit}
      links={links}
      isPublic={isPublic}
    />
  );
}
