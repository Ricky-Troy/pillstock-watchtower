export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err && "message" in err) {
    const msg = String((err as { message: unknown }).message);
    if (msg.includes("duplicate key") && msg.includes("medicines_name")) return "A medicine with that name already exists.";
    if (msg.includes("duplicate key")) return "That record already exists.";
    if (msg.includes("violates row-level security") || msg.includes("permission denied")) {
      return "You don't have permission to do that.";
    }
    return msg || fallback;
  }
  return fallback;
}
