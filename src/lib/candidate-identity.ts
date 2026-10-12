/** Pure helpers shared by the form and server; preserve leading phone zeroes. */
export function formatNameInitials(value: string) {
  const initials = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, "")
    .toLowerCase();
  if (!/^[a-z]*$/.test(initials) || initials.length > 20)
    throw new Error("Viết tắt họ và tên chỉ gồm 1–20 chữ cái, ví dụ ptb.");
  return initials;
}
export function candidateIdentity(nameInitials: unknown, phone: unknown) {
  if (typeof nameInitials !== "string" || nameInitials.length > 100)
    throw new Error("Vui lòng nhập chữ cái viết tắt họ và tên.");
  const initials = formatNameInitials(nameInitials);
  if (!initials) throw new Error("Vui lòng nhập chữ cái viết tắt họ và tên.");
  if (typeof phone !== "string" || phone.length > 40)
    throw new Error("Vui lòng nhập số điện thoại.");
  let normalizedPhone = phone.trim().replace(/[\s().-]/g, "");
  if (normalizedPhone.startsWith("+84"))
    normalizedPhone = "0" + normalizedPhone.slice(3);
  if (!/^0[35789]\d{8}$/.test(normalizedPhone))
    throw new Error(
      "Số điện thoại di động Việt Nam không hợp lệ, ví dụ 0985728123.",
    );
  return {
    nameInitials: initials,
    phone: normalizedPhone,
    candidateCode: initials + normalizedPhone,
  };
}
