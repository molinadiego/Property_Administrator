export const LAST_OWNER_DETAIL =
  'Esta es la única owner del espacio. Primero promueve a owner a otro miembro; ' +
  'después podrás revocar su acceso o cambiarle el rol (spec §11).';

/**
 * Last-owner rule (spec §4.2, AC-2.4): the last active owner of a company can
 * neither be demoted nor revoked — the company would be left unmanaged.
 */
export function isLastOwnerBlocked(activeOwnersCount: number, targetIsOwner: boolean): boolean {
  return targetIsOwner && activeOwnersCount <= 1;
}
