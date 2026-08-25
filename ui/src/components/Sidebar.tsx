import {
  Inbox,
  ListChecks,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Boxes,
  Repeat,
  Layers,
  GitBranch,
  Package,
  Settings,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  AppWindow,
  MessagesSquare,
  GanttChartSquare,
  LayoutGrid,
  CalendarDays,
  BrainCircuit,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarAgents } from "./SidebarAgents";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarStarredProjects } from "./SidebarStarredProjects";
import { useDialogActions } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { useSidebar } from "../context/SidebarContext";
import { useNavigationCustomizer } from "../context/NavigationCustomizerContext";
import { attentionApi } from "../api/attention";
import { heartbeatsApi } from "../api/heartbeats";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { attentionBadgeCount } from "../lib/attention";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { usePublishSharedQueryData, useSharedPollingQuery } from "../hooks/useSharedPolling";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, SIDEBAR_RAIL_HIDDEN_LABEL } from "../lib/utils";
import { PluginSlotOutlet } from "@/plugins/slots";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";

export function Sidebar() {
  const { openNewIssue } = useDialogActions();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { isMobile, collapsed, collapseLocked, peeking, toggleCollapsed, setCollapsed } = useSidebar();
  const rail = collapsed && !peeking;
  const [workOpen, setWorkOpen] = useState(true);
  const [companyOpen, setCompanyOpen] = useState(true);
  const { isItemHidden } = useNavigationCustomizer();

  const inboxBadge = useInboxBadge(selectedCompanyId);

  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const liveRunsQueryKey = queryKeys.liveRuns(selectedCompanyId!);
  const sharedLiveRuns = useSharedPollingQuery({
    companyId: selectedCompanyId,
    resourceKey: "live-runs",
    queryKey: liveRunsQueryKey,
    enabled: !!selectedCompanyId,
    refetchInterval: false,
    leaderOnly: true,
  });
  const { data: liveRuns, dataUpdatedAt: liveRunsUpdatedAt } = useQuery({
    queryKey: liveRunsQueryKey,
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: sharedLiveRuns.enabled,
    refetchInterval: sharedLiveRuns.refetchInterval,
  });
  usePublishSharedQueryData(sharedLiveRuns, liveRuns, liveRunsUpdatedAt);
  const liveRunCount = liveRuns?.length ?? 0;
  
  const showWorkspacesLink = experimentalSettings?.enableIsolatedWorkspaces === true;
  const showApps = experimentalSettings?.enableApps === true;
  const showPipelines = experimentalSettings?.enablePipelines === true;
  const showStatusCards = experimentalSettings?.enableStatusCards === true;
  const goalsLinkPending = experimentalSettings === undefined;
  const showGoalsLink = experimentalSettings?.enableGoalsSidebarLink === true;
  const showDecisions = experimentalSettings?.enableDecisions === true;
  const { data: attentionFeed } = useQuery({
    queryKey: queryKeys.attention(selectedCompanyId!),
    queryFn: () => attentionApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && showDecisions,
    refetchInterval: 60_000,
  });
  const attentionCount = attentionBadgeCount(attentionFeed);
  const showCases = experimentalSettings?.enableCases === true;
  const streamlined = true;
  const conferenceRoomChatEnabled = experimentalSettings?.enableConferenceRoomChat === true;

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="w-full h-full min-h-0 border-r border-border bg-background flex flex-col">
      <div className="flex items-center gap-1 px-3 h-12 shrink-0">
        <SidebarCompanyMenu />
        {!rail ? (
          <>
            {!isMobile && !collapseLocked ? (
              peeking ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground shrink-0"
                  aria-label="Keep sidebar expanded"
                  title="Keep sidebar expanded"
                  onClick={() => setCollapsed(false)}
                >
                  <Pin className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground shrink-0"
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  onClick={() => toggleCollapsed()}
                >
                  {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
              )
            ) : null}
          </>
        ) : null}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 pointer-coarse:gap-3 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {!isItemHidden("new-task") &&
            (() => {
              const newTaskButton = (
                <button
                  onClick={() => openNewIssue()}
                  data-slot="icon-button"
                  aria-label={rail ? "New Task" : undefined}
                  className="flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 text-(length:--text-compact) font-medium text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors"
                >
                  <SquarePen className="h-4 w-4 shrink-0" />
                  <span className={rail ? SIDEBAR_RAIL_HIDDEN_LABEL : "truncate"}>New Task</span>
                </button>
              );
              return rail ? (
                <Tooltip>
                  <TooltipTrigger asChild>{newTaskButton}</TooltipTrigger>
                  <TooltipContent side="right">New Task</TooltipContent>
                </Tooltip>
              ) : (
                newTaskButton
              );
            })()}
          {!isItemHidden("search") && <SidebarNavItem to="/search" label="Search" icon={Search} />}
          {!isItemHidden("dashboard") && (
            <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} liveCount={liveRunCount} />
          )}
          {!isItemHidden("inbox") && (
            <SidebarNavItem
              to="/inbox"
              label="Inbox"
              icon={Inbox}
              badge={inboxBadge.inbox}
              badgeLabel="unread"
              badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
              alert={inboxBadge.failedRuns > 0}
            />
          )}
          {showDecisions && !isItemHidden("decisions") ? (
            <SidebarNavItem
              to="/decisions"
              label="Decisions"
              icon={ListChecks}
              badge={attentionCount}
              badgeLabel="decisions"
            />
          ) : null}
          {showStatusCards && !isItemHidden("status") ? (
            <SidebarNavItem to="/status" label="Status" icon={LayoutGrid} textBadge="beta" />
          ) : null}
          {conferenceRoomChatEnabled && !isItemHidden("board-chat") ? (
            <SidebarNavItem to="/board-chat" label="Conference Room" icon={MessagesSquare} />
          ) : null}
        </div>

        <SidebarSection label="Work" collapsible={{ open: workOpen, onOpenChange: setWorkOpen }}>
          {!isItemHidden("issues") && <SidebarNavItem to="/issues" label="Tasks" icon={CircleDot} />}
          {showCases && !isItemHidden("cases") ? (
            <SidebarNavItem to="/cases" label="Cases" icon={Layers} textBadge="beta" />
          ) : null}
          {!isItemHidden("calendar") && <SidebarNavItem to="/calendar" label="Calendar" icon={CalendarDays} />}
          {!isItemHidden("braindump") && <SidebarNavItem to="/braindump" label="Braindump" icon={BrainCircuit} />}
          {!isItemHidden("routines") && <SidebarNavItem to="/routines" label="Routines" icon={Repeat} />}
          {showPipelines && !isItemHidden("pipelines") ? (
            <SidebarNavItem to="/pipelines" label="Pipelines" icon={GitBranch} />
          ) : null}
          {showGoalsLink && !isItemHidden("goals") ? (
            <SidebarNavItem to="/goals" label="Goals" icon={Target} />
          ) : goalsLinkPending && !isItemHidden("goals") ? (
            <div
              data-testid="sidebar-goals-placeholder"
              className="h-8 pointer-coarse:h-7"
              aria-hidden="true"
            />
          ) : null}
          {!isItemHidden("artifacts") && <SidebarNavItem to="/artifacts" label="Artifacts" icon={Package} />}
          {!isItemHidden("skills") && <SidebarNavItem to="/skills" label="Skills" icon={Boxes} />}
          {showWorkspacesLink && !isItemHidden("workspaces") ? (
            <SidebarNavItem to="/workspaces" label="Workspaces" icon={GitBranch} />
          ) : null}
          {streamlined && !isItemHidden("projects") ? (
            <>
              <SidebarNavItem to="/projects" label="Projects" icon={FolderOpen} />
              <SidebarStarredProjects />
            </>
          ) : null}
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-(length:--text-compact) font-medium"
            missingBehavior="placeholder"
          />
          <PluginLauncherOutlet
            placementZones={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-(length:--text-compact) font-medium"
          />
        </SidebarSection>

        {streamlined ? null : <SidebarProjects />}

        {!isItemHidden("agents") && <SidebarAgents streamlined={streamlined} />}

        <SidebarSection label="Company" collapsible={{ open: companyOpen, onOpenChange: setCompanyOpen }}>
          {!isItemHidden("org") && <SidebarNavItem to="/org" label="Org" icon={Network} />}
          {showApps && !isItemHidden("apps") ? <SidebarNavItem to="/apps" label="Apps" icon={AppWindow} /> : null}
          {!isItemHidden("timeline") && <SidebarNavItem to="/timeline" label="Timeline" icon={GanttChartSquare} />}
          {!isItemHidden("revenue") && <SidebarNavItem to="/revenue" label="Revenue" icon={TrendingUp} />}
          {!isItemHidden("costs") && <SidebarNavItem to="/costs" label="Costs" icon={DollarSign} />}
          {!isItemHidden("activity") && <SidebarNavItem to="/activity" label="Activity" icon={History} />}
          {!isItemHidden("company-settings") && <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />}
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>
    </aside>
  );
}
