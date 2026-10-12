/** Format partial input without converting to Number, preserving leading zeroes. */
export function formatServiceNumberInput(value: string): string {
  if (!/^[\d\s-]*$/.test(value))
    throw new Error("Số hiệu chỉ gồm 6 chữ số, ví dụ 650-695.");
  const digits = value.replace(/[\s-]/g, "");
  if (digits.length > 6)
    throw new Error("Số hiệu phải có đúng 6 chữ số, ví dụ 650-695.");
  return digits.length > 3
    ? digits.slice(0, 3) + "-" + digits.slice(3)
    : digits;
}
