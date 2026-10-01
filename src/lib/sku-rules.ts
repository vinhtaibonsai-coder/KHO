/**
 * QUY CHUẨN MÃ SẢN PHẨM & SIZE ĐỘC BẢN CỦA KHO
 * 
 * 1. Dạng có Size (Quy chuẩn: 1 Chữ cái {E, K, P, S} + Size . Số thứ tự):
 *    - Tiền tố: E, K, P, S
 *    - Size hợp lệ (bắt buộc): 60, 80, 90, 100, 135, 150, 160
 *    - Dấu chấm (.)
 *    - Số thứ tự: Số nguyên (VD: 100, 101, 02, 124...)
 *    => Ví dụ hợp lệ: E90.100, K100.101, S100.02, P150.12, E60.1, S135.50
 * 
 * 2. Dạng Tiền Tố Cố Định + Số thứ tự (không có size):
 *    - Tiền tố: PT, PCT, BC
 *    - Số thứ tự: Số nguyên
 *    => Ví dụ hợp lệ: PT395, PCT124, BC12, BC05
 */

export const ALLOWED_SIZES = ["60", "80", "90", "100", "120", "135", "150", "160"] as const;
export type AllowedSize = typeof ALLOWED_SIZES[number];

export const SIZED_PREFIXES = ["E", "K", "P", "S"] as const;
export const FIXED_PREFIXES = ["PT", "PCT", "BC"] as const;

export interface SkuValidationResult {
  valid: boolean;
  normalizedSku: string;
  type: "sized" | "fixed" | "invalid";
  prefix?: string;
  size?: AllowedSize;
  sequence?: string;
  error?: string;
}

/**
 * Kiểm tra và chuẩn hoá mã theo đúng quy chuẩn nghiêm ngặt của kho
 */
export function validateSku(rawSku: string): SkuValidationResult {
  if (!rawSku) {
    return { valid: false, normalizedSku: "", type: "invalid", error: "Mã sản phẩm rỗng" };
  }

  const clean = rawSku.trim().toUpperCase();

  // 1. Kiểm tra nhóm mã có Size: (E|K|P|S) + (Size) . (Số thứ tự)
  // Regex: ^([EKPS])(60|80|90|100|120|135|150|160)\.([0-9]+)$
  const sizedPattern = /^([EKPS])(60|80|90|100|120|135|150|160)\.([0-9]+)$/;
  const sizedMatch = clean.match(sizedPattern);

  if (sizedMatch) {
    const prefix = sizedMatch[1];
    const size = sizedMatch[2] as AllowedSize;
    const sequence = sizedMatch[3];
    return {
      valid: true,
      normalizedSku: `${prefix}${size}.${sequence}`,
      type: "sized",
      prefix,
      size,
      sequence,
    };
  }

  // Nếu bắt đầu bằng E, K, P, S mà không đúng size hoặc không có dấu chấm
  const partialSized = clean.match(/^([EKPS])([0-9]+)(?:\.([0-9]+))?$/);
  if (partialSized) {
    const attemptedSize = partialSized[2];
    if (!ALLOWED_SIZES.includes(attemptedSize as AllowedSize)) {
      return {
        valid: false,
        normalizedSku: clean,
        type: "invalid",
        error: `Size [${attemptedSize}] không hợp lệ! Chỉ chấp nhận các size: ${ALLOWED_SIZES.join(", ")}`,
      };
    }
    if (!clean.includes(".")) {
      return {
        valid: false,
        normalizedSku: clean,
        type: "invalid",
        error: `Mã [${clean}] thiếu dấu chấm (.) phân cách số thứ tự (ví dụ đúng: ${clean.slice(0, 4)}.${clean.slice(4) || "01"})`,
      };
    }
  }

  // 2. Kiểm tra nhóm mã cố định: (PT|PCT|BC) + (Số thứ tự)
  // Regex: ^(PCT|PT|BC)([0-9]+)$
  const fixedPattern = /^(PCT|PT|BC)([0-9]+)$/;
  const fixedMatch = clean.match(fixedPattern);

  if (fixedMatch) {
    const prefix = fixedMatch[1];
    const sequence = fixedMatch[2];
    return {
      valid: true,
      normalizedSku: `${prefix}${sequence}`,
      type: "fixed",
      prefix,
      sequence,
    };
  }

  return {
    valid: false,
    normalizedSku: clean,
    type: "invalid",
    error: `Mã [${clean}] không đúng quy chuẩn (Chỉ chấp nhận: E/K/P/S + {60,80,90,100,120,135,150,160}.STT hoặc PT/PCT/BC + STT)`,
  };
}

/**
 * Phân tích và bóc tách toàn bộ đoạn văn bản chat:
 * - Trích xuất các mã hợp lệ đúng quy chuẩn
 * - Nhận diện và liệt kê các mã sai quy chuẩn / bị lỗi để cảnh báo rõ ràng
 */
export function extractValidSkusFromText(text: string): {
  validSkus: string[];
  details: SkuValidationResult[];
  invalidSkus: { raw: string; error: string }[];
} {
  if (!text) return { validSkus: [], details: [], invalidSkus: [] };

  // Tìm tất cả các từ tiềm năng (chứa chữ và số hoặc dấu chấm)
  const rawTokens = text.match(/(?:^|[\s,;+:\-\n\r])([A-Za-z0-9.]+)(?=[\s,;:\n\r]|$)/g) || [];
  const validSet = new Set<string>();
  const invalidSet = new Set<string>();
  const details: SkuValidationResult[] = [];
  const invalidSkus: { raw: string; error: string }[] = [];

  for (let token of rawTokens) {
    // Làm sạch ký tự bao quanh
    token = token.trim().replace(/^[\s,;+:\-]+|[\s,;:\-]+$/g, "");
    if (!token) continue;

    // Bỏ qua các từ thuần số thông thường hoặc thuần chữ thông thường
    const hasAlpha = /[A-Za-z]/.test(token);
    const hasDigit = /\d/.test(token);
    if (!hasAlpha && !hasDigit) continue;

    // Chỉ xét các token có khả năng là mã sản phẩm (chứa chữ và số, hoặc bắt đầu bằng tiền tố E, K, P, S, PT, PCT, BC)
    const isCandidate = (hasAlpha && hasDigit) || /^(E|K|P|S|PT|PCT|BC)/i.test(token);
    if (!isCandidate) continue;

    const res = validateSku(token);
    if (res.valid) {
      if (!validSet.has(res.normalizedSku)) {
        validSet.add(res.normalizedSku);
        details.push(res);
      }
    } else {
      const upper = token.toUpperCase();
      if (!validSet.has(upper) && !invalidSet.has(upper)) {
        invalidSet.add(upper);
        invalidSkus.push({ raw: token, error: res.error || "Không đúng quy chuẩn" });
      }
    }
  }

  return {
    validSkus: Array.from(validSet),
    details,
    invalidSkus,
  };
}

