import "dotenv/config";
import nodemailer from "nodemailer";

const REQUIRED_ENV_VARS = ["GMAIL_USER", "GMAIL_APP_PASSWORD"];

function checkEnvVars() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error("❌ Missing required environment variable(s):");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\nAdd them to your .env file and try again.");
    process.exit(1);
  }
}

async function verifySmtpConnection() {
  checkEnvVars();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  console.log(`🔍 Verifying SMTP connection for ${process.env.GMAIL_USER} ...`);

  const start = Date.now();

  try {
    await transporter.verify();
    const elapsed = Date.now() - start;
    console.log(`✅ Gmail SMTP connection successful (${elapsed}ms)`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Gmail SMTP connection failed");

    // Give more specific, actionable feedback for common failure cases
    switch (error.code) {
      case "EAUTH":
        console.error(
          "   Reason: Authentication failed. Check that GMAIL_APP_PASSWORD is a valid " +
          "16-character Gmail App Password (not your regular account password), and " +
          "that 2-Step Verification is enabled on the account."
        );
        break;
      case "ESOCKET":
      case "ETIMEDOUT":
        console.error(
          "   Reason: Could not reach Gmail's SMTP servers. Check your network/firewall " +
          "settings or try again."
        );
        break;
      case "ENOTFOUND":
        console.error("   Reason: DNS lookup failed. Check your internet connection.");
        break;
      default:
        console.error(`   Reason: ${error.message}`);
    }

    if (process.env.DEBUG) {
      console.error("\nFull error details:");
      console.error(error);
    } else {
      console.error("\nRun with DEBUG=1 for full error details.");
    }

    process.exit(1);
  }
}

verifySmtpConnection();