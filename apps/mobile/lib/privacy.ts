/**
 * Data rights in the app (product gap 1c, DPDP Act 2023): the export is shared through the phone's share sheet as JSON
 * text, and deleting needs the word DELETE typed, plus the password when the account has one.
 */

/** The export, as readable JSON, for the share sheet. */
export function exportText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** What stops the delete button: null when the form is ready to send. */
export function deleteFormProblem(confirm: string, password: string, hasPassword: boolean): string | null {
  if (confirm.trim() !== 'DELETE') return 'Type DELETE to confirm.';
  if (hasPassword && !password) return 'Enter your password.';
  return null;
}
