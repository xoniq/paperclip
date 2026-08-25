export type BraindumpStatus = "inbox" | "triaged" | "archived";

export interface BraindumpItem {
  id: string;
  companyId: string;
  title: string;
  content: string;
  status: BraindumpStatus;
  tags: string[];
  suggestedIssueId?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBraindump {
  title: string;
  content?: string;
  tags?: string[];
}

export interface UpdateBraindump {
  title?: string;
  content?: string;
  status?: BraindumpStatus;
  tags?: string[];
}
