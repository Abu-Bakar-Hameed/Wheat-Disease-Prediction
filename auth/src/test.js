import dotenv from "dotenv";

dotenv.config();

console.log(
  "MICROSOFT_CLIENT_ID =",
  process.env.MICROSOFT_CLIENT_ID
);

console.log(
  "MICROSOFT_CALLBACK_URL =",
  process.env.MICROSOFT_CALLBACK_URL
);