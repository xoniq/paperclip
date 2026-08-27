import { randomBytes } from "node:crypto";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { and, eq } from "drizzle-orm";
import { createDb, authUsers, authAccounts } from "@paperclipai/db";
import { hashPassword } from "better-auth/crypto";
import { loadPaperclipEnvFile } from "../config/env.js";
import { readConfig, resolveConfigPath } from "../config/store.js";

function resolveDbUrl(configPath?: string, explicitDbUrl?: string) {
  if (explicitDbUrl) return explicitDbUrl;
  const config = readConfig(configPath);
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (config?.database.mode === "postgres" && config.database.connectionString) {
    return config.database.connectionString;
  }
  if (config?.database.mode === "embedded-postgres") {
    const port = config.database.embeddedPostgresPort ?? 54329;
    return `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`;
  }
  return null;
}

export async function resetPassword(opts: {
  config?: string;
  email?: string;
  password?: string;
  dbUrl?: string;
}) {
  const configPath = resolveConfigPath(opts.config);
  loadPaperclipEnvFile(configPath);

  const dbUrl = resolveDbUrl(configPath, opts.dbUrl);
  if (!dbUrl) {
    p.log.error("Could not resolve database connection for password reset.");
    return;
  }

  let email = opts.email?.trim();
  if (!email) {
    const input = await p.text({
      message: "Enter the email address of the account:",
      placeholder: "admin@example.com",
      validate: (value) => (value && value.includes("@") ? undefined : "Please enter a valid email address"),
    });
    if (p.isCancel(input)) return;
    email = String(input).trim();
  }

  let password = opts.password;
  if (!password) {
    const input = await p.password({
      message: `Enter the new password for ${email}:`,
      validate: (value) => (value && value.length >= 6 ? undefined : "Password must be at least 6 characters"),
    });
    if (p.isCancel(input)) return;
    password = String(input);
  }

  const db = createDb(dbUrl);
  const closableDb = db as typeof db & {
    $client?: {
      end?: (options?: { timeout?: number }) => Promise<void>;
    };
  };

  try {
    const [user] = await db.select().from(authUsers).where(eq(authUsers.email, email));
    if (!user) {
      p.log.error(`User with email "${email}" not found in database.`);
      return;
    }

    const hashed = await hashPassword(password);
    const existingAccount = await db
      .select()
      .from(authAccounts)
      .where(and(eq(authAccounts.userId, user.id), eq(authAccounts.providerId, "credential")))
      .then((rows) => rows[0]);

    if (existingAccount) {
      await db
        .update(authAccounts)
        .set({ password: hashed, issuer: "local:credential", updatedAt: new Date() })
        .where(eq(authAccounts.id, existingAccount.id));
    } else {
      await db.insert(authAccounts).values({
        id: randomBytes(16).toString("hex"),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hashed,
        issuer: "local:credential",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    p.log.success(`Password for ${pc.cyan(email)} has been successfully updated!`);
    p.log.message("You can now sign in immediately at the login page.");
  } catch (err) {
    p.log.error(`Failed to reset password: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await closableDb.$client?.end?.({ timeout: 5 }).catch(() => undefined);
  }
}
