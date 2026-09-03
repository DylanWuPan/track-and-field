"use client";
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import DashboardTemplate from "@/components/DashboardTemplate";
import type { Event } from "../../api/getEvents/route";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

type AthleteStats = {
  athleteId: string;
  athleteName: string;
  athleteClass: string;
  totalPoints: number;
  numEvents: number;
  numMeets: number;
  pointsPerMeet: number;
  pointsPerEvent: number;
};

export default function LeaderboardClient({ id }: { id: string }) {
  let highlightTimeout: NodeJS.Timeout | null = null;

  const [isPublic, setIsPublic] = useState(false);
  async function checkCredentials() {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) {
      setIsPublic(true);
    }
  }

  const searchParams = useSearchParams();
  const userId = id;
  const filterRequest = searchParams.get("filter") ?? null;
  const athleteRequest = searchParams.get("athlete") ?? null;

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState<string>(
    filterRequest || "All"
  );
  const [classFilter, setClassFilter] = useState<string>("All");
  const [sortOption, setSortOption] = useState<string>("totalPoints");

  const [leaderboard, setLeaderboard] = useState<AthleteStats[]>([]);
  const athleteRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(athleteRequest);

  const highlightAthlete = (athleteId: string) => {
    setHighlightId(athleteId);
    if (highlightTimeout) clearTimeout(highlightTimeout);
    highlightTimeout = setTimeout(() => setHighlightId(null), 2500);
  };

  useEffect(() => {
    checkCredentials();
    if (!userId) return;
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/getEvents?id=${userId}&target=user`);

        const text = await response.text();
        if (!response.ok) {
          toast.error(`Error fetching events: ${text}`);
          throw new Error("Failed to fetch events");
        }

        try {
          const data: Event[] = JSON.parse(text);
          setEvents(data);
        } catch (parseError) {
          toast.error("Error parsing server response as JSON");
          throw new Error("Server did not return valid JSON");
        }
      } catch (e) {
        toast.error(
          (e as Error).message || "An error occurred while fetching events"
        );
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [userId]);

  useEffect(() => {
    // if (!events.length) return;
    let filteredEvents = events;
    if (seasonFilter !== "All") {
      filteredEvents = events.filter(
        (ev) => ev.meet?.season?.name === seasonFilter
      );
    }
    if (classFilter !== "All") {
      filteredEvents = filteredEvents.filter(
        (ev) => ev.athlete?.class === classFilter
      );
    }
    // Compute athlete stats
    const statsMap: Record<string, AthleteStats> = {};
    filteredEvents.forEach((ev) => {
      if (!ev.athlete) return;

      if (!statsMap[ev.athlete.id]) {
        statsMap[ev.athlete.id] = {
          athleteId: ev.athlete.id,
          athleteName: ev.athlete.name,
          athleteClass: ev.athlete.class,
          totalPoints: 0,
          numEvents: 0,
          numMeets: 0,
          pointsPerMeet: 0,
          pointsPerEvent: 0,
        };
      }
      statsMap[ev.athlete.id].totalPoints += ev.points || 0;
      statsMap[ev.athlete.id].numEvents += 1;
    });
    // Compute unique meets per athlete
    const athleteMeets: Record<string, Set<string>> = {};
    filteredEvents.forEach((ev) => {
      if (!ev.athlete) return;

      if (!athleteMeets[ev.athlete.id]) {
        athleteMeets[ev.athlete.id] = new Set();
      }
      if (ev.meet?.id) {
        athleteMeets[ev.athlete.id].add(ev.meet.id);
      }
    });
    Object.keys(statsMap).forEach((athleteId) => {
      statsMap[athleteId].numMeets = athleteMeets[athleteId]?.size || 0;
    });
    // Compute derived stats
    Object.values(statsMap).forEach((stat) => {
      stat.pointsPerMeet = stat.totalPoints / Math.max(stat.numMeets, 1);
      stat.pointsPerEvent = stat.totalPoints / Math.max(stat.numEvents, 1);
    });
    // Convert to array and sort
    const sorted = Object.values(statsMap).sort((a, b) => {
      switch (sortOption) {
        case "totalPoints":
          return b.totalPoints - a.totalPoints;
        case "pointsPerMeet":
          return b.pointsPerMeet - a.pointsPerMeet;
        case "pointsPerEvent":
          return b.pointsPerEvent - a.pointsPerEvent;
        case "numMeets":
          return b.numMeets - a.numMeets;
        default:
          return 0;
      }
    });
    setLeaderboard(sorted);
  }, [events, seasonFilter, classFilter, sortOption]);

  // Scroll to requested athlete and highlight on load
  useEffect(() => {
    if (!athleteRequest || leaderboard.length === 0) return;

    const el = athleteRefs.current[athleteRequest];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });

      // Remove highlight after a short delay
      const timer = setTimeout(() => {
        setHighlightId(null);
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [leaderboard, athleteRequest]);

  // Collect unique seasons for filtering (unique by season.id, display season.name)
  const seasonMap: Record<string, string> = {};

  events.forEach((ev) => {
    const seasonId = ev.meet?.season?.id;
    const seasonName = ev.meet?.season?.name;

    if (seasonId && seasonName) {
      seasonMap[seasonId] = seasonName;
    }
  });

  const seasons = Object.values(seasonMap).sort();

  // Collect unique classes
  const classSet = new Set<string>();
  events.forEach((ev) => {
    if (ev.athlete?.class) {
      classSet.add(ev.athlete.class);
    }
  });
  const classes = Array.from(classSet).sort();

  const leaderboardSection = (
    <div className="flex flex-col gap-4 w-full">
      {/* Filters */}
      <div className="flex flex-col gap-3 p-4 max-w-full">
        <div className="flex flex-col gap-2 bg-white dark:bg-gray-700 px-3 py-3 rounded-xl shadow-sm border dark:border-gray-600 w-full">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Filter by...
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <div className="flex items-center gap-2 w-full">
              <label className="font-semibold text-gray-700 dark:text-gray-200 text-xs sm:text-sm whitespace-nowrap">
                Season:
              </label>
              <select
                value={seasonFilter}
                onChange={(e) => {
                  const selectedFilter = e.target.value;
                  setSeasonFilter(selectedFilter);
                  const url = new URL(window.location.href);
                  url.searchParams.set("filter", selectedFilter);
                  window.history.replaceState({}, "", url.toString());
                  if (athleteRequest) {
                    highlightAthlete(athleteRequest);
                    const el = athleteRefs.current[athleteRequest];
                    if (el) {
                      el.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-transparent text-gray-800 dark:text-gray-100 border border-gray-300 dark:border-gray-600 flex-1"
              >
                <option value="All">All</option>
                {seasons.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 w-full">
              <label className="font-semibold text-gray-700 dark:text-gray-200 text-xs sm:text-sm whitespace-nowrap">
                Class:
              </label>
              <select
                value={classFilter}
                onChange={(e) => {
                  const selectedFilter = e.target.value;
                  setClassFilter(selectedFilter);
                  const url = new URL(window.location.href);
                  url.searchParams.set("class", selectedFilter);
                  window.history.replaceState({}, "", url.toString());
                  if (athleteRequest) {
                    highlightAthlete(athleteRequest);
                    const el = athleteRefs.current[athleteRequest];
                    if (el) {
                      el.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-transparent text-gray-800 dark:text-gray-100 border border-gray-300 dark:border-gray-600 flex-1"
              >
                <option value="All">All</option>
                {classes.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Sort block moved here */}
      <div className="flex justify-end items-center px-2 pt-1 w-full gap-2">
        <label className="font-medium text-gray-600 dark:text-gray-300 text-xs text-right uppercase">
          Sort by...
        </label>
        <select
          value={sortOption}
          onChange={(e) => {
            const selectedSort = e.target.value;
            setSortOption(selectedSort);
            const url = new URL(window.location.href);
            url.searchParams.set("sort", selectedSort);
            window.history.replaceState({}, "", url.toString());
            if (athleteRequest) {
              highlightAthlete(athleteRequest);
              const el = athleteRefs.current[athleteRequest];
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          }}
          className="px-3 py-1.5 rounded-xl bg-transparent text-gray-800 dark:text-gray-100 border border-gray-300 dark:border-gray-600 text-xs"
        >
          <option value="totalPoints">Total Points</option>
          <option value="pointsPerMeet">Points Per Meet (PPM)</option>
          <option value="pointsPerEvent">Points Per Event (PPE)</option>
          <option value="numMeets">Number of Meets</option>
        </select>
      </div>

      {/* Leaderboard bubbles */}
      {leaderboard.length === 0 && !loading && (
        <div className="text-center text-gray-500 dark:text-gray-400 p-6">
          No data available.
        </div>
      )}

      {leaderboard.map((athlete, index) => {
        const rank = index + 1;
        const rankStyle = "";
        const athleteEvent = events.find(
          (ev) => ev.athlete?.id === athlete.athleteId && ev.meet?.season
        );
        const seasonName = athleteEvent?.meet?.season?.name ?? "";
        return (
          <Link
            key={athlete.athleteId}
            href={`/athletes/${athlete.athleteId}`}
            className="block"
          >
            <div
              ref={(el) => {
                athleteRefs.current[athlete.athleteId] = el;
              }}
              className={`flex flex-col gap-2 px-3 py-3 sm:px-5 sm:py-4 rounded-xl shadow border bg-white dark:bg-gray-800 hover:shadow-md hover:ring-2 hover:ring-blue-400 transition cursor-pointer ${
                highlightId === athlete.athleteId
                  ? "ring-4 ring-yellow-400 animate-pulse"
                  : ""
              } ${rankStyle}`}
            >
              {/* Line 1: Rank + Name */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="text-base sm:text-lg font-bold text-gray-700 dark:text-gray-200">
                    #{rank}
                  </div>
                  <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 flex flex-wrap items-center gap-1 sm:gap-2">
                    {athlete.athleteName}
                    <span className="text-xs sm:text-sm font-normal text-gray-500 dark:text-gray-400">
                      {(() => {
                        const showSeason = seasonFilter === "All" && seasonName;
                        const showClass = classFilter === "All";

                        if (showSeason && !showClass) return `${seasonName}`;
                        if (showClass && !showSeason)
                          return `Class ${athlete.athleteClass ?? "Unknown"}`;
                        if (showClass && showSeason)
                          return `Class ${
                            athlete.athleteClass ?? "Unknown"
                          } · ${seasonName}`;

                        return "";
                      })()}
                    </span>
                  </div>
                </div>

                <div className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400">
                  {sortOption === "totalPoints" &&
                    `${athlete.totalPoints.toFixed(2)} pts`}
                  {sortOption === "pointsPerMeet" &&
                    `${athlete.pointsPerMeet.toFixed(2)} PPM`}
                  {sortOption === "pointsPerEvent" &&
                    `${athlete.pointsPerEvent.toFixed(2)} PPE`}
                  {sortOption === "numMeets" && `${athlete.numMeets} meets`}
                </div>
              </div>

              {/* Line 2: Stats */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                <span>
                  <span className="font-semibold">Points:</span>{" "}
                  {athlete.totalPoints.toFixed(2)}
                </span>
                <span>
                  <span className="font-semibold">Events:</span>{" "}
                  {athlete.numEvents}
                </span>
                <span>
                  <span className="font-semibold">Meets:</span>{" "}
                  {athlete.numMeets}
                </span>
                <span>
                  <span className="font-semibold">PPM:</span>{" "}
                  {athlete.pointsPerMeet.toFixed(2)}
                </span>
                <span>
                  <span className="font-semibold">PPE:</span>{" "}
                  {athlete.pointsPerEvent.toFixed(2)}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <DashboardTemplate
      title="Athlete Leaderboard"
      subject="Athletes"
      items={leaderboard}
      loading={loading}
      moreInfo={leaderboardSection}
      isPublic={isPublic}
    />
  );
}
