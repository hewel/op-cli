export interface LinkSummary {
  readonly href?: string | undefined;
  readonly title?: string | undefined;
  readonly method?: string | undefined;
}

export interface UserSummary {
  readonly id?: number | undefined;
  readonly name?: string | undefined;
  readonly login?: string | undefined;
  readonly email?: string | undefined;
  readonly href?: string | undefined;
}

export interface ProjectSummary {
  readonly id?: number | undefined;
  readonly identifier?: string | undefined;
  readonly name?: string | undefined;
  readonly href?: string | undefined;
}

export interface WorkPackageSummary {
  readonly id?: number | undefined;
  readonly subject?: string | undefined;
  readonly status?: string | undefined;
  readonly assignee?: string | undefined;
  readonly project?: string | undefined;
  readonly type?: string | undefined;
  readonly priority?: string | undefined;
  readonly href?: string | undefined;
  readonly browserUrl?: string | undefined;
  readonly updatedAt?: string | undefined;
  readonly shortDescription?: string | undefined;
  readonly attachmentsCount?: number | undefined;
}

export interface WorkPackageDetail extends WorkPackageSummary {
  readonly description?: string | undefined;
  readonly lockVersion?: number | undefined;
  readonly actions: Record<string, LinkSummary>;
}

export interface CommentResult {
  readonly id: number;
  readonly subject?: string | undefined;
  readonly status: "dry-run" | "comment posted";
  readonly link?: string | undefined;
  readonly request?: {
    readonly method: string;
    readonly path: string;
    readonly payload: unknown;
  };
}

export interface ErrorPayload {
  readonly error: string;
  readonly exitCode: number;
}

export interface NamedResourceSummary {
  readonly id?: number | undefined;
  readonly name?: string | undefined;
  readonly href?: string | undefined;
  readonly position?: number | undefined;
}

export interface TypeSummary extends NamedResourceSummary {
  readonly isDefault?: boolean | undefined;
  readonly isMilestone?: boolean | undefined;
}

export interface StatusSummary extends NamedResourceSummary {
  readonly isClosed?: boolean | undefined;
  readonly isDefault?: boolean | undefined;
  readonly isReadonly?: boolean | undefined;
}

export interface PrioritySummary extends NamedResourceSummary {
  readonly isDefault?: boolean | undefined;
  readonly isActive?: boolean | undefined;
}

export interface WorkPackageCreateResult {
  readonly id?: number | undefined;
  readonly subject?: string | undefined;
  readonly status: "dry-run" | "created";
  readonly href?: string | undefined;
  readonly browserUrl?: string | undefined;
  readonly request?: {
    readonly method: "POST";
    readonly path: string;
    readonly payload: unknown;
  } | undefined;
}
