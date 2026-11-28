// Signed links for Mick's message review page (netlify/functions/message-review.mjs). Each link is for one report.
import crypto from "node:crypto";
import { SITE } from "./photos.mjs";

export const signReport = (uid, rid) => crypto.createHmac("sha256", process.env.SUPABASE_SECRET_KEY || "x").update(`message-review|${uid}|${rid}`).digest("hex").slice(0, 40);
export const reviewLink = (uid, rid) => `${SITE}/.netlify/functions/message-review?u=${uid}&r=${rid}&s=${signReport(uid, rid)}`;
export const signPost = (rid) => crypto.createHmac("sha256", process.env.SUPABASE_SECRET_KEY || "x").update(`post-review|${rid}`).digest("hex").slice(0, 40);
