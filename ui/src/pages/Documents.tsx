import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { artifactsApi, type CompanyArtifact } from "../api/artifacts";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime, formatDate } from "../lib/utils";
import { copyTextToClipboard } from "../lib/clipboard";
import { MarkdownBody } from "../components/MarkdownBody";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSearchParams, Link } from "@/lib/router";

const SEARCH_DEBOUNCE_MS = 250;

function parseKeyFromHref(href?: string | null): string | null {
  if (!href) return null;
  const hashIdx = href.lastIndexOf("#document-");
  if (hashIdx !== -1) {
    return decodeURIComponent(href.slice(hashIdx + "#document-".length));
  }
  return null;
}

function getDocumentKey(doc: CompanyArtifact): string {
  if (doc.documentKey) return doc.documentKey;
  const parsed = parseKeyFromHref(doc.href);
  return parsed ?? "plan";
}

export function Documents() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("q") ?? "";
  const taskFilter = searchParams.get("task") ?? "all";
  const selectedDocId = searchParams.get("doc") ?? "";

  const [draftQuery, setDraftQuery] = useState(query);
  const [copied, setCopied] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Documents" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    setDraftQuery((prev) => (prev.trim() === query ? prev : query));
  }, [query]);

  useEffect(() => {
    const trimmed = draftQuery.trim();
    if (trimmed === query) return;
    const handle = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (trimmed) next.set("q", trimmed);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [draftQuery, query, setSearchParams]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value && value !== "all") {
            next.set(key, value);
          } else {
            next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.artifacts.list(selectedCompanyId!, "document", query, "none", undefined),
    queryFn: () =>
      artifactsApi.list(selectedCompanyId!, {
        kind: "document",
        q: query || undefined,
        limit: 100,
      }),
    enabled: !!selectedCompanyId,
  });

  const allDocuments = useMemo(() => data?.artifacts ?? [], [data]);

  const availableTasks = useMemo(() => {
    const taskMap = new Map<string, { id: string; identifier: string; title: string }>();
    for (const doc of allDocuments) {
      if (doc.issue?.id && !taskMap.has(doc.issue.id)) {
        taskMap.set(doc.issue.id, doc.issue);
      }
    }
    return Array.from(taskMap.values()).sort((a, b) =>
      a.identifier.localeCompare(b.identifier, undefined, { numeric: true }),
    );
  }, [allDocuments]);

  const filteredDocuments = useMemo(() => {
    if (taskFilter === "all") return allDocuments;
    return allDocuments.filter((doc) => doc.issue?.id === taskFilter);
  }, [allDocuments, taskFilter]);

  const selectedDoc = useMemo(() => {
    if (filteredDocuments.length === 0) return null;
    if (selectedDocId) {
      const matched = filteredDocuments.find((doc) => doc.id === selectedDocId);
      if (matched) return matched;
    }
    return filteredDocuments[0];
  }, [filteredDocuments, selectedDocId]);

  const docKey = selectedDoc ? getDocumentKey(selectedDoc) : null;
  const issueId = selectedDoc?.issue?.id ?? "";

  const { data: fullDoc, isLoading: isDocLoading } = useQuery({
    queryKey: queryKeys.issues.document(issueId, docKey ?? ""),
    queryFn: () => issuesApi.getDocument(issueId, docKey!),
    enabled: !!issueId && !!docKey,
  });

  const activeBody = fullDoc?.body ?? selectedDoc?.previewText ?? "";

  const handleCopyMarkdown = useCallback(async () => {
    if (!activeBody) return;
    await copyTextToClipboard(activeBody);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [activeBody]);

  const handleSelectDoc = useCallback(
    (doc: CompanyArtifact) => {
      updateParam("doc", doc.id);
      setMobileDetailOpen(true);
    },
    [updateParam],
  );

  const handleTaskFilterChange = useCallback(
    (value: string) => {
      updateParam("task", value === "all" ? null : value);
      updateParam("doc", null);
    },
    [updateParam],
  );

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-foreground/80" aria-hidden="true" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">Documents</h1>
            <Badge variant="secondary" className="text-xs">
              {filteredDocuments.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Central repository of plans, specifications, and reports written by agents across all tasks.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.currentTarget.value)}
              placeholder="Search documents..."
              aria-label="Search documents"
              className="h-8 pl-8 pr-8 text-xs"
            />
            {draftQuery.length > 0 && (
              <button
                type="button"
                onClick={() => setDraftQuery("")}
                aria-label="Clear document search"
                className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="w-full sm:w-56">
            <Select value={taskFilter} onValueChange={handleTaskFilterChange}>
              <SelectTrigger size="sm" className="w-full text-xs h-8">
                <SelectValue placeholder="Filter by task" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tasks ({allDocuments.length})</SelectItem>
                {availableTasks.map((task) => (
                  <SelectItem key={task.id} value={task.id}>
                    <span className="font-mono text-xs text-foreground/80">{task.identifier}</span>{" "}
                    <span className="truncate">{task.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {isLoading ? (
        <PageSkeleton variant="list" />
      ) : allDocuments.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          message={
            query
              ? "No documents matched your search query."
              : "Documents, plans, and reports written by agents during task execution will appear here."
          }
        />
      ) : filteredDocuments.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents for this task"
          message="No documents match the selected task filter."
          action="Clear task filter"
          onAction={() => handleTaskFilterChange("all")}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Document list (Left Column) */}
          <div
            className={cn(
              "lg:col-span-4 flex flex-col gap-2 rounded-lg border border-border bg-card p-3",
              mobileDetailOpen && "hidden lg:flex",
            )}
          >
            <div className="flex items-center justify-between px-1 pb-2 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Document List
              </span>
              <span className="text-xs text-muted-foreground">
                {filteredDocuments.length} {filteredDocuments.length === 1 ? "doc" : "docs"}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 max-h-(--sz-calc-30) overflow-y-auto">
              {filteredDocuments.map((doc) => {
                const isSelected = selectedDoc?.id === doc.id;
                const currentDocKey = getDocumentKey(doc);
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => handleSelectDoc(doc)}
                    data-testid={`document-item-${doc.id}`}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-md p-3 text-left transition-colors cursor-pointer border",
                      isSelected
                        ? "bg-accent/80 border-border text-foreground shadow-xs"
                        : "border-transparent hover:bg-accent/40 text-foreground/80 hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge variant="outline" className="font-mono text-xs shrink-0">
                          {doc.issue.identifier}
                        </Badge>
                        <span className="truncate text-xs font-medium text-muted-foreground">
                          {doc.issue.title}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-xs font-mono shrink-0">
                        {currentDocKey}
                      </Badge>
                    </div>

                    <h3 className="text-sm font-semibold leading-5 line-clamp-1">
                      {doc.title || currentDocKey}
                    </h3>

                    {doc.previewText && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {doc.previewText}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground/75 mt-1 pt-1 border-t border-border/50">
                      {doc.createdByAgent && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Bot className="h-3 w-3" />
                          {doc.createdByAgent.name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 ml-auto shrink-0">
                        <Calendar className="h-3 w-3" />
                        {relativeTime(doc.updatedAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Document reader (Right Column) */}
          <div
            className={cn(
              "lg:col-span-8 flex flex-col rounded-lg border border-border bg-card overflow-hidden",
              !mobileDetailOpen && "hidden lg:flex",
            )}
          >
            {selectedDoc ? (
              <>
                <div className="flex flex-col gap-3 border-b border-border p-4 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMobileDetailOpen(false)}
                        className="lg:hidden h-8 w-8 p-0"
                        aria-label="Back to document list"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Badge variant="outline" className="font-mono text-xs shrink-0">
                        {selectedDoc.issue.identifier}
                      </Badge>
                      <h2 className="text-base sm:text-lg font-bold truncate text-foreground">
                        {selectedDoc.title || docKey}
                      </h2>
                      <Badge variant="secondary" className="font-mono text-xs shrink-0">
                        {docKey}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyMarkdown}
                        className="h-8 gap-1.5 text-xs"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-green-500" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy Markdown</span>
                          </>
                        )}
                      </Button>

                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                      >
                        <Link to={selectedDoc.href}>
                          <span>Open in Task</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <Link
                      to={selectedDoc.href}
                      className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                    >
                      <span>Task: {selectedDoc.issue.title}</span>
                    </Link>
                    {selectedDoc.createdByAgent && (
                      <span className="inline-flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        Authored by {selectedDoc.createdByAgent.name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Updated {formatDate(selectedDoc.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="p-6 overflow-y-auto min-h-64 max-h-(--sz-calc-30)">
                  {isDocLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-xs">Loading document content...</span>
                    </div>
                  ) : activeBody ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <MarkdownBody softBreaks={false}>{activeBody}</MarkdownBody>
                    </div>
                  ) : (
                    <div className="py-12 text-center text-muted-foreground text-xs">
                      This document is currently empty.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="py-24 text-center">
                <EmptyState
                  icon={FileText}
                  title="No document selected"
                  message="Select a document from the list to view its complete contents."
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
