import type { UserInfo } from "../types/quiz";

/** Mask on the server: public responses must never include the full phone/code. */
export function publicCandidateCode(info: UserInfo) {
  const code =
    typeof info.candidateCode === "string"
      ? info.candidateCode
      : typeof info.serviceNumber === "string"
        ? info.serviceNumber
        : "";
  const composed = /^([a-z]{1,20})(0[35789]\d{8})$/i.exec(code);
  if (composed)
    return composed[1].toLowerCase() + composed[2].slice(0, -4) + "****";
  if (/^0[35789]\d{8}$/.test(code)) return code.slice(0, -4) + "****";
  if (typeof info.phone === "string" && /^0[35789]\d{8}$/.test(info.phone)) {
    const initials =
      typeof info.nameInitials === "string" &&
      /^[a-z]{1,20}$/i.test(info.nameInitials)
        ? info.nameInitials.toLowerCase()
        : "";
    return initials + info.phone.slice(0, -4) + "****";
  }
  if (/^\d{3}-?\d{3}$/.test(code)) return code.slice(0, -4) + "****";
  return "Thí sinh cũ";
}
