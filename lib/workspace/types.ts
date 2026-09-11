/**
 * Result shape shared by both workspace-creating actions (first-time
 * onboarding and "new workspace" from inside the app). Pure types.
 */

export interface WorkspaceInvite {
  email: string;
  url: string;
  /** Whether the invite email actually sent (links work regardless). */
  emailed: boolean;
}

export interface WorkspaceCreateState {
  error?: string;
  /** Workspace created. The wizard shows the success screen / navigates. */
  success?: boolean;
  orgName?: string;
  invites?: WorkspaceInvite[];
  /** Workspace created but the invite rows failed — recoverable in Settings. */
  inviteError?: string;
}

/** The server action signature the wizard binds to (useActionState). */
export type WorkspaceCreateAction = (
  prev: WorkspaceCreateState | undefined,
  formData: FormData
) => Promise<WorkspaceCreateState>;
