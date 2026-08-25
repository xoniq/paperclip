import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  Sparkles,
  Plus,
  Send,
  CheckCircle2,
  Archive,
  Trash2,
  ArrowRight,
  Tag,
  Search,
  Check,
  RotateCcw,
} from "lucide-react";
import { Link } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { braindumpApi } from "../api/braindump";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "../lib/utils";
import type { BraindumpItem, BraindumpStatus } from "@paperclipai/shared";

const STATUS_TABS: { id: BraindumpStatus | "all"; label: string }[] = [
  { id: "all", label: "All Thoughts" },
  { id: "inbox", label: "Inbox" },
  { id: "triaged", label: "Triaged to Tasks" },
  { id: "archived", label: "Archived" },
];

export function Braindump() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<BraindumpStatus | "all">("inbox");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTagInput, setNewTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: queryKeys.braindumps.list(selectedCompanyId!, activeTab),
    queryFn: () =>
      braindumpApi.list(
        selectedCompanyId!,
        activeTab === "all" ? undefined : activeTab,
      ),
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; content?: string; tags?: string[] }) =>
      braindumpApi.create(selectedCompanyId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["braindumps", selectedCompanyId] });
      setNewTitle("");
      setNewContent("");
      setSelectedTags([]);
      setIsExpanded(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      braindumpApi.update(selectedCompanyId!, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["braindumps", selectedCompanyId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => braindumpApi.delete(selectedCompanyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["braindumps", selectedCompanyId] });
    },
  });

  const triageMutation = useMutation({
    mutationFn: (id: string) => braindumpApi.triage(selectedCompanyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["braindumps", selectedCompanyId] });
      queryClient.invalidateQueries({ queryKey: ["issues", selectedCompanyId] });
    },
  });

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && newTagInput.trim()) {
      e.preventDefault();
      const tag = newTagInput.trim().replace(/^#/, "");
      if (!selectedTags.includes(tag)) {
        setSelectedTags([...selectedTags, tag]);
      }
      setNewTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tagToRemove));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate({
      title: newTitle.trim(),
      content: newContent.trim() || undefined,
      tags: selectedTags,
    });
  };

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Braindump & AI Triage</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Frictionless scratchpad for raw ideas, notes, and tasks. Let autonomous agents triage them into structured issues.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search braindump notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {/* Instant Capture Bar */}
      <form
        onSubmit={handleCreateSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-card p-4 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/40"
      >
        <div className="flex items-center gap-2">
          <Input
            placeholder="Dump an idea, thought, or bug for agents to process..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onFocus={() => setIsExpanded(true)}
            className="border-0 bg-transparent text-sm font-semibold focus-visible:ring-0 placeholder:font-normal"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!newTitle.trim() || createMutation.isPending}
            className="h-8 gap-1.5 px-3 font-semibold"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Capture</span>
          </Button>
        </div>

        {isExpanded && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <Textarea
              placeholder="Add details, links, or context (optional)..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              className="resize-none text-xs border-0 bg-muted/20 focus-visible:ring-0"
            />

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                <span>Tags:</span>
              </div>

              {selectedTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1 rounded-full text-micro cursor-pointer hover:bg-destructive/20"
                  onClick={() => handleRemoveTag(tag)}
                >
                  #{tag} ×
                </Badge>
              ))}

              <Input
                placeholder="Add tag (Press Enter)..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                className="h-6 w-36 text-micro bg-transparent border-border/60"
              />
            </div>
          </div>
        )}
      </form>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              activeTab === tab.id
                ? "bg-accent text-accent-foreground font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notes Grid */}
      <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-xs text-muted-foreground">
            Loading braindump notes...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-muted-foreground">
            No notes in this view. Capture a new thought above!
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-foreground leading-snug">{item.title}</h3>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full text-micro font-semibold shrink-0",
                      item.status === "inbox" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
                      item.status === "triaged" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                      item.status === "archived" && "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {item.status.toUpperCase()}
                  </Badge>
                </div>

                {item.content && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                    {item.content}
                  </p>
                )}

                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted/60 px-2 py-0.5 text-micro font-medium text-muted-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
                <span className="font-mono text-micro text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>

                <div className="flex items-center gap-1.5">
                  {item.status === "inbox" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={triageMutation.isPending}
                      onClick={() => triageMutation.mutate(item.id)}
                      className="h-7 gap-1 rounded-lg border-primary/40 bg-primary/10 text-micro font-semibold text-primary hover:bg-primary/20"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Triage to Issue</span>
                    </Button>
                  )}

                  {item.suggestedIssueId && (
                    <Link
                      to={`/issues/${item.suggestedIssueId}`}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-micro font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      <span>View Task</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}

                  {item.status !== "archived" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        updateMutation.mutate({ id: item.id, payload: { status: "archived" } })
                      }
                      title="Archive"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        updateMutation.mutate({ id: item.id, payload: { status: "inbox" } })
                      }
                      title="Restore to Inbox"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(item.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
