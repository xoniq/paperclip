import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar as CalendarIcon,
  Clock,
  Radio,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Users,
  Repeat,
  Bot,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { calendarApi } from "../api/calendar";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "../lib/utils";
import type { CalendarEventType, CalendarEvent } from "@paperclipai/shared";

const DAYS_OF_WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function Calendar() {
  const { selectedCompanyId } = useCompany();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedType, setSelectedType] = useState<CalendarEventType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.calendar.events(selectedCompanyId!, {
      type: selectedType === "all" ? undefined : selectedType,
    }),
    queryFn: () =>
      calendarApi.getEvents(selectedCompanyId!, {
        type: selectedType === "all" ? undefined : selectedType,
      }),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  const monthName = currentDate.toLocaleString("en-US", { month: "long" });

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const jumpToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDay(today);
  };

  // Build Month Days Matrix
  const calendarGridDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Get day of week (0 = Sun, 1 = Mon, ..., 6 = Sat). We want Mon = 0, Sun = 6
    let startingDay = firstDayOfMonth.getDay() - 1;
    if (startingDay === -1) startingDay = 6;

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month padding to fill complete grid
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month]);

  const events = data?.events ?? [];

  // Filter events by search query
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.sourceSummary && e.sourceSummary.toLowerCase().includes(q)),
    );
  }, [events, searchQuery]);

  // Group events by YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filteredEvents) {
      const key = ev.startTime.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [filteredEvents]);

  // Selected Day's Timeline Events
  const selectedDayKey = selectedDay.toISOString().slice(0, 10);
  const selectedDayEvents = eventsByDate.get(selectedDayKey) ?? [];

  const counts = data?.counts ?? {
    all: 0,
    routines: 0,
    agentJobs: 0,
    meetings: 0,
    deadlines: 0,
  };

  const happeningNow = data?.happeningNow;
  const freeSlots = data?.freeSlots ?? [];

  const getEventBadgeColor = (type: CalendarEventType) => {
    switch (type) {
      case "routine":
        return "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10";
      case "agent_job":
        return "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10";
      case "meeting":
        return "border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/10";
      case "deadline":
        return "border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10";
      default:
        return "border-border text-muted-foreground bg-muted";
    }
  };

  const getEventDotColor = (type: CalendarEventType) => {
    switch (type) {
      case "routine":
        return "bg-amber-500";
      case "agent_job":
        return "bg-blue-500";
      case "meeting":
        return "bg-purple-500";
      case "deadline":
        return "bg-rose-500";
      default:
        return "bg-muted-foreground";
    }
  };

  const isToday = (d: Date) => {
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (d: Date) => {
    return (
      d.getDate() === selectedDay.getDate() &&
      d.getMonth() === selectedDay.getMonth() &&
      d.getFullYear() === selectedDay.getFullYear()
    );
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">
              {monthName} {year}
            </h1>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={prevMonth}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={jumpToToday}
              >
                TODAY
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={nextMonth}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filter Pills with Counters */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card/60 p-1">
            <button
              onClick={() => setSelectedType("all")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all",
                selectedType === "all"
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>All</span>
              <span className="rounded-full bg-background/80 px-1.5 py-0.2 text-micro font-semibold">
                {counts.all}
              </span>
            </button>

            <button
              onClick={() => setSelectedType("routine")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all",
                selectedType === "routine"
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span>Routines</span>
              <span className="rounded-full bg-background/80 px-1.5 py-0.2 text-micro font-semibold">
                {counts.routines}
              </span>
            </button>

            <button
              onClick={() => setSelectedType("agent_job")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all",
                selectedType === "agent_job"
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span>Agent jobs</span>
              <span className="rounded-full bg-background/80 px-1.5 py-0.2 text-micro font-semibold">
                {counts.agentJobs}
              </span>
            </button>

            <button
              onClick={() => setSelectedType("meeting")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all",
                selectedType === "meeting"
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
              <span>Meetings</span>
              <span className="rounded-full bg-background/80 px-1.5 py-0.2 text-micro font-semibold">
                {counts.meetings}
              </span>
            </button>

            <button
              onClick={() => setSelectedType("deadline")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all",
                selectedType === "deadline"
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              <span>Deadlines</span>
              <span className="rounded-full bg-background/80 px-1.5 py-0.2 text-micro font-semibold">
                {counts.deadlines}
              </span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter events on the grid..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {/* Main Grid & Today Panel Layout */}
      <div className="grid flex-1 gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {/* Calendar Matrix (Left 2 or 3 cols) */}
        <div className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-2 xl:col-span-3">
          {/* Day Headers */}
          <div className="mb-2 grid grid-cols-7 gap-1 border-b border-border/60 pb-2 text-center text-xs font-semibold text-muted-foreground">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Grid Cells */}
          <div className="grid flex-1 grid-cols-7 gap-1.5">
            {calendarGridDays.map(({ date, isCurrentMonth }, idx) => {
              const dateKey = date.toISOString().slice(0, 10);
              const dayEvents = eventsByDate.get(dateKey) ?? [];
              const today = isToday(date);
              const active = isSelected(date);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDay(date)}
                  className={cn(
                    "group flex min-h-24 flex-col rounded-xl border p-2 text-left transition-all cursor-pointer",
                    isCurrentMonth ? "bg-card/90" : "bg-muted/30 opacity-50",
                    today ? "border-primary/50 bg-accent/20" : "border-border/60 hover:border-border",
                    active && "ring-2 ring-primary/60 border-transparent",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                        today
                          ? "bg-foreground text-background"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      {date.getDate()}
                    </span>

                    {dayEvents.length > 0 && (
                      <span className="text-micro font-medium text-muted-foreground">
                        {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
                      </span>
                    )}
                  </div>

                  {/* Event Chips inside Cell */}
                  <div className="mt-1.5 flex flex-col gap-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className={cn(
                          "flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-micro font-medium",
                          getEventBadgeColor(ev.type),
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", getEventDotColor(ev.type))} />
                        <span className="truncate">
                          {ev.startTime.slice(11, 16)} {ev.title}
                        </span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-micro font-medium text-muted-foreground">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel: TODAY & FREE SLOTS */}
        <div className="flex flex-col gap-4">
          {/* Today & Happening Now Card */}
          <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-bold">
                  {selectedDay.toLocaleDateString("en-US", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <Badge variant="secondary" className="rounded-full text-micro">
                  {selectedDayEvents.length} events
                </Badge>
              </div>

              {isToday(selectedDay) && (
                <Badge className="flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-micro font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </Badge>
              )}
            </div>

            {/* Happening Now Banner */}
            {happeningNow && isToday(selectedDay) && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center justify-between text-micro font-bold uppercase tracking-wider text-primary">
                  <span className="flex items-center gap-1.5">
                    <Radio className="h-3 w-3 animate-pulse" />
                    HAPPENING NOW
                  </span>
                  <span>LIVE</span>
                </div>
                <div className="mt-1 text-sm font-semibold">{happeningNow.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{happeningNow.sourceSummary}</div>

                {/* Live Progress Bar */}
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-primary/20 overflow-hidden">
                    <div className="h-full w-2/5 rounded-full bg-primary animate-pulse" />
                  </div>
                  <span className="text-micro font-mono text-muted-foreground">37%</span>
                </div>
              </div>
            )}

            {/* Selected Day Timeline */}
            <div className="flex flex-col gap-2.5 divide-y divide-border/40">
              {selectedDayEvents.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No events scheduled for this date.
                </div>
              ) : (
                selectedDayEvents.map((ev) => (
                  <div key={ev.id} className="pt-2.5 first:pt-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold">
                          {ev.startTime.slice(11, 16)}
                        </span>
                        {ev.durationSeconds && (
                          <span className="text-micro font-mono text-muted-foreground">
                            {ev.durationSeconds}s
                          </span>
                        )}
                      </div>

                      <Badge
                        variant="outline"
                        className={cn("rounded-full text-micro font-semibold", getEventBadgeColor(ev.type))}
                      >
                        {ev.type.replace("_", " ").toUpperCase()}
                      </Badge>
                    </div>

                    <div className="mt-1 text-sm font-medium">{ev.title}</div>
                    {ev.sourceSummary && (
                      <div className="text-micro text-muted-foreground">{ev.sourceSummary}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Free Slots / Deep Work Block Optimizer */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              FREE SLOTS TODAY
            </div>

            <div className="mt-3 flex flex-col gap-2.5">
              {freeSlots.map((slot, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border/70 bg-muted/20 p-3"
                >
                  <div className="font-mono text-xs font-bold text-foreground">
                    {slot.startTime} - {slot.endTime}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {slot.label} • {slot.durationHours}h free
                  </div>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full justify-between text-xs text-primary hover:text-primary hover:bg-primary/10"
              >
                <span>Schedule agent task</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
