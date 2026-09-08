// @vitest-environment jsdom

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Documents } from "./Documents";
import type { CompanyArtifact } from "../api/artifacts";
import type { IssueDocument } from "@paperclipai/shared";

const companyState = vi.hoisted(() => ({
  selectedCompanyId: "company-1",
  selectedCompany: { issuePrefix: "PAP" },
}));

const breadcrumbState = vi.hoisted(() => ({
  setBreadcrumbs: vi.fn(),
}));

const artifactsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
}));

const issuesApiMock = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

const clipboardMock = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => companyState,
  useOptionalCompany: () => companyState,
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => breadcrumbState,
}));

vi.mock("../api/artifacts", () => ({
  artifactsApi: artifactsApiMock,
}));

vi.mock("../api/issues", () => ({
  issuesApi: issuesApiMock,
}));

vi.mock("../lib/clipboard", () => ({
  copyTextToClipboard: clipboardMock.copyTextToClipboard,
}));

vi.mock("../components/MarkdownBody", () => ({
  MarkdownBody: ({ children }: { children: string }) => (
    <div data-testid="markdown-body">{children}</div>
  ),
}));

// Inline select mock for Radix UI select in jsdom
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <div data-testid="select-root" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, ...props }: { children: React.ReactNode }) => (
    <button type="button" data-testid="select-trigger" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => (
    <div data-testid={`select-item-${value}`} data-value={value}>
      {children}
    </div>
  ),
}));

function sampleArtifact(overrides: Partial<CompanyArtifact> = {}): CompanyArtifact {
  return {
    id: "artifact-doc-1",
    source: "document",
    mediaKind: "document",
    title: "Project Strategy",
    previewText: "Strategy document preview text",
    contentType: "text/markdown",
    contentPath: null,
    openPath: null,
    downloadPath: null,
    issue: { id: "issue-1", identifier: "PAP-101", title: "Setup marketing strategy" },
    project: null,
    createdByAgent: { id: "agent-1", name: "ResearcherAgent" },
    updatedAt: "2026-09-08T10:00:00.000Z",
    href: "/PAP/issues/PAP-101#document-strategy",
    documentKey: "strategy",
    ...overrides,
  };
}

function sampleIssueDocument(overrides: Partial<IssueDocument> = {}): IssueDocument {
  return {
    id: "doc-internal-1",
    companyId: "company-1",
    issueId: "issue-1",
    key: "strategy",
    title: "Project Strategy",
    format: "markdown",
    body: "# Full Strategy\n\nDetailed strategy content here.",
    latestRevisionId: "rev-1",
    latestRevisionNumber: 1,
    createdByAgentId: "agent-1",
    createdByUserId: null,
    updatedByAgentId: "agent-1",
    updatedByUserId: null,
    lockedAt: null,
    lockedByUserId: null,
    lockedByAgentId: null,
    createdAt: new Date("2026-09-08T09:00:00.000Z"),
    updatedAt: new Date("2026-09-08T10:00:00.000Z"),
    ...overrides,
  };
}

async function flush() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForAssertion(assertion: () => void, attempts = 50) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flush();
    }
  }
  throw lastError;
}

function renderDocuments(container: HTMLDivElement, initialEntries: string[] = ["/documents"]) {
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  flushSync(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Documents />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  return { root, queryClient };
}

describe("Documents page", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    artifactsApiMock.list.mockReset();
    issuesApiMock.getDocument.mockReset();
    breadcrumbState.setBreadcrumbs.mockReset();
    clipboardMock.copyTextToClipboard.mockReset();
  });

  afterEach(() => {
    container.remove();
  });

  it("sets breadcrumbs to Documents", async () => {
    artifactsApiMock.list.mockResolvedValue({ artifacts: [], nextCursor: null });
    const { root } = renderDocuments(container);

    await waitForAssertion(() => {
      expect(breadcrumbState.setBreadcrumbs).toHaveBeenCalledWith([{ label: "Documents" }]);
    });

    flushSync(() => {
      root.unmount();
    });
  });

  it("renders document list and loads the first document in reader view", async () => {
    const doc1 = sampleArtifact();
    const doc2 = sampleArtifact({
      id: "artifact-doc-2",
      title: "Architecture Plan",
      documentKey: "plan",
      issue: { id: "issue-2", identifier: "PAP-102", title: "Build backend" },
      href: "/PAP/issues/PAP-102#document-plan",
    });

    artifactsApiMock.list.mockResolvedValue({
      artifacts: [doc1, doc2],
      nextCursor: null,
    });

    issuesApiMock.getDocument.mockResolvedValue(
      sampleIssueDocument({
        body: "# Full Strategy\n\nDetailed strategy content here.",
      }),
    );

    const { root } = renderDocuments(container);

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Documents");
      expect(container.textContent).toContain("PAP-101");
      expect(container.textContent).toContain("Project Strategy");
      expect(container.textContent).toContain("PAP-102");
      expect(container.textContent).toContain("Architecture Plan");
    });

    // Check that getDocument was called for the first document
    await waitForAssertion(() => {
      expect(issuesApiMock.getDocument).toHaveBeenCalledWith("issue-1", "strategy");
      expect(container.textContent).toContain("Detailed strategy content here.");
    });

    flushSync(() => {
      root.unmount();
    });
  });

  it("allows selecting another document to view", async () => {
    const doc1 = sampleArtifact();
    const doc2 = sampleArtifact({
      id: "artifact-doc-2",
      title: "Architecture Plan",
      documentKey: "plan",
      issue: { id: "issue-2", identifier: "PAP-102", title: "Build backend" },
      href: "/PAP/issues/PAP-102#document-plan",
    });

    artifactsApiMock.list.mockResolvedValue({
      artifacts: [doc1, doc2],
      nextCursor: null,
    });

    issuesApiMock.getDocument.mockImplementation((issueId: string, key: string) => {
      if (issueId === "issue-2") {
        return Promise.resolve(
          sampleIssueDocument({
            issueId: "issue-2",
            key: "plan",
            title: "Architecture Plan",
            body: "# Architecture\n\nMicroservices setup.",
          }),
        );
      }
      return Promise.resolve(sampleIssueDocument());
    });

    const { root } = renderDocuments(container);

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Project Strategy");
    });

    // Click on doc2
    const doc2Button = container.querySelector('[data-testid="document-item-artifact-doc-2"]') as HTMLButtonElement;
    expect(doc2Button).toBeTruthy();
    flushSync(() => {
      doc2Button.click();
    });

    await waitForAssertion(() => {
      expect(issuesApiMock.getDocument).toHaveBeenCalledWith("issue-2", "plan");
      expect(container.textContent).toContain("Microservices setup.");
    });

    flushSync(() => {
      root.unmount();
    });
  });

  it("renders empty state when no documents exist", async () => {
    artifactsApiMock.list.mockResolvedValue({ artifacts: [], nextCursor: null });
    const { root } = renderDocuments(container);

    await waitForAssertion(() => {
      expect(container.textContent).toContain("No documents yet");
    });

    flushSync(() => {
      root.unmount();
    });
  });

  it("copies markdown to clipboard when Copy button is clicked", async () => {
    const doc1 = sampleArtifact();
    artifactsApiMock.list.mockResolvedValue({
      artifacts: [doc1],
      nextCursor: null,
    });

    issuesApiMock.getDocument.mockResolvedValue(
      sampleIssueDocument({
        body: "# Copyable markdown body",
      }),
    );

    const { root } = renderDocuments(container);

    await waitForAssertion(() => {
      expect(container.textContent).toContain("Copyable markdown body");
    });

    const copyBtn = [...container.querySelectorAll("button")].find((btn) =>
      btn.textContent?.includes("Copy Markdown"),
    );
    expect(copyBtn).toBeTruthy();

    flushSync(() => {
      copyBtn!.click();
    });

    await waitForAssertion(() => {
      expect(clipboardMock.copyTextToClipboard).toHaveBeenCalledWith("# Copyable markdown body");
    });

    flushSync(() => {
      root.unmount();
    });
  });
});
